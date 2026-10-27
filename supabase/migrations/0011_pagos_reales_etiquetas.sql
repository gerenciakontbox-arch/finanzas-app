-- ============================================================================
-- Akontapp · migración 0011 · lote 7: pagos reales de crédito, saldo real según extracto y etiquetas
-- 1) pagar_cuota_credito: acepta pago distinto al calculado. La diferencia se explica por concepto
--    (mora, seguros, cuota_manejo, otros + otros_detalle) o, si se pagó menos, como 'parcial' (negativo) con motivo.
--    Sigue siendo UN movimiento de caja (cuadra con el banco); el desglose lleva cada concepto.
-- 2) ajustes_saldo_deuda: el saldo de capital real según el extracto del banco, con fecha y motivo.
--    No es movimiento (no hubo caja): la tabla de amortización se remide desde ahí manteniendo las cuotas restantes.
-- 3) etiquetas por espacio (nombres libres) aplicables a movimientos, presupuesto y programado (etiqueta_ids uuid[]).
--    Al mover un ítem de espacio, las etiquetas se buscan o crean por nombre en el destino.
-- Idempotente. Finalidad: servicio (sin tratamiento nuevo de datos personales).
-- ============================================================================

-- ── 1. Pago de cuota con valor real ────────────────────────────────────────────
create or replace function pagar_cuota_credito(p_deuda uuid, p_numero int, p_fecha date, p_cuenta uuid, p_capital numeric, p_interes numeric, p_extras jsonb default '{}'::jsonb, p_motivo text default null, p_seguro numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); d deudas%rowtype; total numeric; extras numeric; parcial numeric; m uuid; cat uuid; k text;
begin
  select * into d from deudas where id = p_deuda and espacio_id in (select mis_espacios()); if d.id is null then raise exception 'Crédito no encontrado'; end if;
  if exists (select 1 from cuotas_pagadas where deuda_id = d.id and numero = p_numero) then raise exception 'La cuota % ya está pagada', p_numero; end if;
  foreach k in array array['cuota_manejo','mora','seguros','otros'] loop
    if coalesce((p_extras->>k)::numeric, 0) < 0 then raise exception 'El concepto % no puede ser negativo', k; end if;
  end loop;
  extras := coalesce((p_extras->>'cuota_manejo')::numeric,0) + coalesce((p_extras->>'mora')::numeric,0) + coalesce((p_extras->>'seguros')::numeric,0) + coalesce((p_extras->>'otros')::numeric,0);
  parcial := coalesce((p_extras->>'parcial')::numeric, 0);
  if parcial > 0 then raise exception 'Un pago parcial se registra como valor negativo'; end if;
  if parcial < 0 and coalesce(trim(p_motivo), '') = '' then raise exception 'Pagaste menos que la cuota: indica el motivo'; end if;
  if coalesce((p_extras->>'otros')::numeric,0) > 0 and coalesce(trim(p_extras->>'otros_detalle'), '') = '' then raise exception 'Describe el concepto "otros"'; end if;
  total := p_capital + p_interes + coalesce(p_seguro,0) + extras + parcial;
  if total <= 0 then raise exception 'El valor pagado debe ser mayor que cero'; end if;
  select id into cat from categorias where espacio_id = d.espacio_id and nombre = 'Cuota crédito' limit 1;
  insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, categoria_id, cuenta_id, activo_id, deuda_id, origen, motivo, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
  values (d.espacio_id, p_fecha, 'Salida', d.nombre || ' — cuota ' || p_numero, total, cat, coalesce(p_cuenta, d.cuenta_pago_id), d.activo_id, d.id, 'credito', p_motivo,
          jsonb_build_object('cuota', p_numero, 'capital', p_capital, 'interes', p_interes, 'seguro', coalesce(p_seguro,0), 'esperado', p_capital + p_interes + coalesce(p_seguro,0), 'diferencia', extras + parcial) || p_extras, u, u, now(), now())
  returning id into m;
  insert into cuotas_pagadas(espacio_id, deuda_id, numero, fecha_pago, monto_esperado, monto_pagado, capital, interes, seguro, movimiento_id, creado_por, actualizado_por, creado_en, actualizado_en)
  values (d.espacio_id, d.id, p_numero, p_fecha, p_capital + p_interes + coalesce(p_seguro,0), total, p_capital, p_interes, coalesce(p_seguro,0), m, u, u, now(), now());
  return m;
end $$;
grant execute on function pagar_cuota_credito(uuid,int,date,uuid,numeric,numeric,jsonb,text,numeric) to authenticated;

-- ── 2. Saldo real según extracto ───────────────────────────────────────────────
create table if not exists ajustes_saldo_deuda (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios(id) on delete cascade,
  deuda_id uuid not null references deudas(id) on delete cascade,
  fecha date not null,
  saldo_calculado numeric(14,2) not null,
  saldo_real numeric(14,2) not null check (saldo_real >= 0),
  diferencia numeric(14,2) not null,
  despues_de_cuota int not null check (despues_de_cuota >= 0),
  motivo text not null,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);
create index if not exists ajustes_saldo_deuda_idx on ajustes_saldo_deuda(deuda_id, despues_de_cuota);
select _aplicar_estandar('ajustes_saldo_deuda');
grant all on ajustes_saldo_deuda to authenticated;

-- Los ajustes acompañan al crédito cuando se mueve de espacio (mismo patrón que abonos_capital).
create or replace function _mover_ajustes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.espacio_id is distinct from old.espacio_id then update ajustes_saldo_deuda set espacio_id = new.espacio_id where deuda_id = new.id; end if;
  return new;
end $$;
drop trigger if exists deudas_mover_ajustes on deudas;
create trigger deudas_mover_ajustes after update of espacio_id on deudas for each row execute function _mover_ajustes();

-- Registra el saldo real. p_saldo_calculado lo trae la app (la amortización vive en el cliente) y queda como evidencia.
-- Un ajuste no toca caja; la amortización se remide desde la cuota siguiente manteniendo el número de cuotas restantes.
create or replace function ajustar_saldo_deuda(p_deuda uuid, p_fecha date, p_saldo_real numeric, p_saldo_calculado numeric, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); d deudas%rowtype; n int; a uuid;
begin
  select * into d from deudas where id = p_deuda and espacio_id in (select mis_espacios()); if d.id is null then raise exception 'Crédito no encontrado'; end if;
  if d.estado <> 'Activo' then raise exception 'El crédito no está activo'; end if;
  if p_saldo_real is null or p_saldo_real < 0 then raise exception 'El saldo real no puede ser negativo'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo del ajuste (p. ej. saldo según extracto)'; end if;
  select count(*) + coalesce(d.cuotas_previas, 0) into n from cuotas_pagadas where deuda_id = d.id;
  if n >= d.total_cuotas then raise exception 'No quedan cuotas por amortizar'; end if;
  -- Un ajuste por punto de la tabla: si ya hay uno tras la misma cuota, se reemplaza.
  delete from ajustes_saldo_deuda where deuda_id = d.id and despues_de_cuota = n;
  insert into ajustes_saldo_deuda(espacio_id, deuda_id, fecha, saldo_calculado, saldo_real, diferencia, despues_de_cuota, motivo, creado_por, actualizado_por, creado_en, actualizado_en)
  values (d.espacio_id, d.id, p_fecha, coalesce(p_saldo_calculado, 0), p_saldo_real, p_saldo_real - coalesce(p_saldo_calculado, 0), n, trim(p_motivo), u, u, now(), now())
  returning id into a;
  return a;
end $$;
grant execute on function ajustar_saldo_deuda(uuid,date,numeric,numeric,text) to authenticated;

-- ── 3. Etiquetas ───────────────────────────────────────────────────────────────
create table if not exists etiquetas (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 40),
  color text not null default '#4B1D9E',
  orden int not null default 0,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);
create unique index if not exists etiquetas_nombre_uq on etiquetas(espacio_id, lower(trim(nombre)));
select _aplicar_estandar('etiquetas');
grant all on etiquetas to authenticated;

alter table movimientos add column if not exists etiqueta_ids uuid[] not null default '{}';
alter table presupuesto add column if not exists etiqueta_ids uuid[] not null default '{}';
alter table programado  add column if not exists etiqueta_ids uuid[] not null default '{}';
create index if not exists movimientos_etiquetas_idx on movimientos using gin(etiqueta_ids);

-- Busca (o crea) en el espacio destino la etiqueta con el mismo nombre.
create or replace function _etiqueta_equivalente(e uuid, e_dest uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare src etiquetas%rowtype; d uuid;
begin
  select * into src from etiquetas where id = e; if src.id is null then return null; end if;
  if src.espacio_id = e_dest then return e; end if;
  select id into d from etiquetas where espacio_id = e_dest and lower(trim(nombre)) = lower(trim(src.nombre));
  if d is null then
    insert into etiquetas(espacio_id, nombre, color, orden, creado_por, actualizado_por, creado_en, actualizado_en) values (e_dest, src.nombre, src.color, src.orden, auth.uid(), auth.uid(), now(), now()) returning id into d;
  end if;
  return d;
end $$;

-- Guardia: etiquetas únicas, del mismo espacio del ítem (si no, se traducen por nombre); los movimientos
-- nacidos de un programado heredan sus etiquetas si no traen otras.
create or replace function _etiquetas_guardia()
returns trigger language plpgsql security definer set search_path = public as $$
declare out uuid[] := '{}'; x uuid; y uuid; prog uuid;
begin
  -- (to_jsonb: la función se comparte entre tablas y presupuesto no tiene las mismas columnas que movimientos)
  if tg_table_name = 'movimientos' then
    prog := (to_jsonb(new)->>'programado_id')::uuid;
    if prog is not null and coalesce(array_length(new.etiqueta_ids, 1), 0) = 0 then select etiqueta_ids into new.etiqueta_ids from programado where id = prog; end if;
  end if;
  foreach x in array coalesce(new.etiqueta_ids, '{}') loop
    y := _etiqueta_equivalente(x, new.espacio_id);
    if y is not null and not (y = any(out)) then out := out || y; end if;
  end loop;
  new.etiqueta_ids := out;
  return new;
end $$;
drop trigger if exists movimientos_etiquetas on movimientos;
create trigger movimientos_etiquetas before insert or update of etiqueta_ids, espacio_id on movimientos for each row execute function _etiquetas_guardia();
drop trigger if exists presupuesto_etiquetas on presupuesto;
create trigger presupuesto_etiquetas before insert or update of etiqueta_ids, espacio_id on presupuesto for each row execute function _etiquetas_guardia();
drop trigger if exists programado_etiquetas on programado;
create trigger programado_etiquetas before insert or update of etiqueta_ids, espacio_id on programado for each row execute function _etiquetas_guardia();

-- El rubro programado no bloquea cambiar sus etiquetas (presupuesto_guardia solo vigila los campos del plan).
-- Al borrar una etiqueta se retira de todos los ítems.
create or replace function _etiqueta_borrada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update movimientos set etiqueta_ids = array_remove(etiqueta_ids, old.id) where old.id = any(etiqueta_ids);
  update presupuesto set etiqueta_ids = array_remove(etiqueta_ids, old.id) where old.id = any(etiqueta_ids);
  update programado  set etiqueta_ids = array_remove(etiqueta_ids, old.id) where old.id = any(etiqueta_ids);
  return old;
end $$;
drop trigger if exists etiquetas_borrada on etiquetas;
create trigger etiquetas_borrada after delete on etiquetas for each row execute function _etiqueta_borrada();

insert into app_meta(clave, valor) values ('schema_version', '11') on conflict (clave) do update set valor = '11', actualizado_en = now();
