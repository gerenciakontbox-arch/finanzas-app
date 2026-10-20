-- ============================================================================
-- Akontapp · migración 0003 · Lote 3 (créditos) y Lote 4 (depreciación, presupuesto → programado)
-- Idempotente: se puede ejecutar varias veces. Requiere 0002 aplicada.
--
-- 1. Créditos: sistema de amortización (cuota fija / abono constante a capital), seguro mensual
--    dentro de la cuota, abonos extraordinarios a capital que recalculan la tabla, capital/interés/
--    seguro guardados en cada cuota pagada.
-- 2. Activos: depreciación lineal mensual con valor residual y vida útil 2–10 años (no inmuebles).
--    Para activos previos a la app: valor base = valor de mercado a la fecha base.
-- 3. Presupuesto → programado: un rubro se "programa" (desde el ítem o desde el CSV) y nace una
--    obligación recurrente vinculada; el rubro queda bloqueado y se cierra solo pagándolo desde
--    Programado. Al completar una ocurrencia, la siguiente se vincula al rubro del mes siguiente
--    (o lo crea si no existe).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRÉDITOS
-- ----------------------------------------------------------------------------
alter table deudas add column if not exists sistema text not null default 'fija';
alter table deudas drop constraint if exists deudas_sistema_check;
alter table deudas add constraint deudas_sistema_check check (sistema in ('fija','capital'));
alter table deudas add column if not exists seguro_mensual numeric(14,2) not null default 0 check (seguro_mensual >= 0);

alter table cuotas_pagadas add column if not exists capital numeric(14,2);
alter table cuotas_pagadas add column if not exists interes numeric(14,2);
alter table cuotas_pagadas add column if not exists seguro numeric(14,2);

create table if not exists abonos_capital (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios(id) on delete cascade,
  deuda_id uuid not null references deudas(id) on delete cascade,
  fecha date not null,
  monto numeric(14,2) not null check (monto > 0),
  modo text not null check (modo in ('plazo','cuota')),      -- plazo: misma cuota, menos cuotas · cuota: mismo plazo, cuota menor
  despues_de_cuota int not null default 0,                   -- nº de cuotas pagadas en el momento del abono
  movimiento_id uuid references movimientos(id) on delete set null,
  motivo text,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);
create index if not exists abonos_capital_deuda_idx on abonos_capital(deuda_id);
select _aplicar_estandar('abonos_capital');

-- Pago de cuota: ahora guarda capital/interés/seguro y acepta el seguro mensual del crédito.
drop function if exists pagar_cuota_credito(uuid, int, date, uuid, numeric, numeric, jsonb, text);
create or replace function pagar_cuota_credito(p_deuda uuid, p_numero int, p_fecha date, p_cuenta uuid, p_capital numeric, p_interes numeric, p_extras jsonb default '{}'::jsonb, p_motivo text default null, p_seguro numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); d deudas%rowtype; total numeric; extras numeric; m uuid; cat uuid;
begin
  select * into d from deudas where id = p_deuda and espacio_id in (select mis_espacios()); if d.id is null then raise exception 'Crédito no encontrado'; end if;
  if exists (select 1 from cuotas_pagadas where deuda_id = d.id and numero = p_numero) then raise exception 'La cuota % ya está pagada', p_numero; end if;
  extras := coalesce((p_extras->>'cuota_manejo')::numeric,0) + coalesce((p_extras->>'mora')::numeric,0) + coalesce((p_extras->>'seguros')::numeric,0) + coalesce((p_extras->>'otros')::numeric,0);
  total := p_capital + p_interes + coalesce(p_seguro,0) + extras;
  select id into cat from categorias where espacio_id = d.espacio_id and nombre = 'Cuota crédito' limit 1;
  insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, categoria_id, cuenta_id, activo_id, deuda_id, origen, motivo, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
  values (d.espacio_id, p_fecha, 'Salida', d.nombre || ' — cuota ' || p_numero, total, cat, coalesce(p_cuenta, d.cuenta_pago_id), d.activo_id, d.id, 'credito', p_motivo,
          jsonb_build_object('cuota', p_numero, 'capital', p_capital, 'interes', p_interes, 'seguro', coalesce(p_seguro,0), 'esperado', p_capital + p_interes + coalesce(p_seguro,0), 'diferencia', extras) || p_extras, u, u, now(), now())
  returning id into m;
  insert into cuotas_pagadas(espacio_id, deuda_id, numero, fecha_pago, monto_esperado, monto_pagado, capital, interes, seguro, movimiento_id, creado_por, actualizado_por, creado_en, actualizado_en)
  values (d.espacio_id, d.id, p_numero, p_fecha, p_capital + p_interes + coalesce(p_seguro,0), total, p_capital, p_interes, coalesce(p_seguro,0), m, u, u, now(), now());
  return m;
end $$;

-- Abono extraordinario a capital: movimiento de salida + registro del abono. La tabla se recalcula en la app
-- a partir de las cuotas pagadas y los abonos (modo 'plazo' mantiene la cuota, modo 'cuota' mantiene el plazo).
create or replace function abonar_capital(p_deuda uuid, p_fecha date, p_monto numeric, p_cuenta uuid, p_modo text, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); d deudas%rowtype; m uuid; cat uuid; n int;
begin
  select * into d from deudas where id = p_deuda and espacio_id in (select mis_espacios()); if d.id is null then raise exception 'Crédito no encontrado'; end if;
  if d.estado <> 'Activo' then raise exception 'El crédito no está activo'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El abono debe ser mayor que cero'; end if;
  if p_modo not in ('plazo','cuota') then raise exception 'Modo inválido: %', p_modo; end if;
  select count(*) into n from cuotas_pagadas where deuda_id = d.id;
  select id into cat from categorias where espacio_id = d.espacio_id and nombre = 'Cuota crédito' limit 1;
  insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, categoria_id, cuenta_id, activo_id, deuda_id, origen, motivo, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
  values (d.espacio_id, p_fecha, 'Salida', d.nombre || ' — abono a capital', p_monto, cat, coalesce(p_cuenta, d.cuenta_pago_id), d.activo_id, d.id, 'credito', p_motivo,
          jsonb_build_object('abono', true, 'capital', p_monto, 'interes', 0, 'modo', p_modo), u, u, now(), now())
  returning id into m;
  insert into abonos_capital(espacio_id, deuda_id, fecha, monto, modo, despues_de_cuota, movimiento_id, motivo, creado_por, actualizado_por, creado_en, actualizado_en)
  values (d.espacio_id, d.id, p_fecha, p_monto, p_modo, n, m, p_motivo, u, u, now(), now());
  return m;
end $$;

-- Si se borra el movimiento de un abono, el abono desaparece (y la tabla vuelve a su estado anterior).
create or replace function _abono_sin_movimiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from abonos_capital where movimiento_id = old.id;
  return old;
end $$;
drop trigger if exists movimientos_abono_borrado on movimientos;
create trigger movimientos_abono_borrado before delete on movimientos for each row when (old.deuda_id is not null) execute function _abono_sin_movimiento();

-- mover_item: los abonos acompañan al crédito
create or replace function _mover_abonos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.espacio_id is distinct from old.espacio_id then
    update abonos_capital set espacio_id = new.espacio_id where deuda_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists deudas_mover_abonos on deudas;
create trigger deudas_mover_abonos after update of espacio_id on deudas for each row execute function _mover_abonos();

-- ----------------------------------------------------------------------------
-- 2. DEPRECIACIÓN DE ACTIVOS
-- ----------------------------------------------------------------------------
alter table activos add column if not exists vida_util_meses int;           -- null = no deprecia
alter table activos add column if not exists valor_residual numeric(14,2) not null default 0 check (valor_residual >= 0);
alter table activos add column if not exists valor_base numeric(14,2);      -- valor desde el que deprecia (compra o valor de mercado a la fecha base)
alter table activos add column if not exists fecha_base date;               -- desde cuándo deprecia (compra o fecha de inicio en la app)
alter table activos drop constraint if exists activos_vida_util_check;
alter table activos add constraint activos_vida_util_check check (vida_util_meses is null or (vida_util_meses between 24 and 120));
alter table activos drop constraint if exists activos_inmueble_no_deprecia;
alter table activos add constraint activos_inmueble_no_deprecia check (tipo <> 'Inmueble' or vida_util_meses is null);

-- ----------------------------------------------------------------------------
-- 3. PRESUPUESTO → PROGRAMADO
-- ----------------------------------------------------------------------------
alter table presupuesto add column if not exists periodicidad text;
alter table presupuesto drop constraint if exists presupuesto_periodicidad_check;
alter table presupuesto add constraint presupuesto_periodicidad_check check (periodicidad is null or periodicidad in ('Semanal','Quincenal','Mensual','Bimestral','Trimestral','Semestral','Anual','Puntual'));
alter table presupuesto add column if not exists programado_serie_id uuid;      -- serie de Programado que lo ejecuta
alter table presupuesto add column if not exists programado_id uuid;            -- ocurrencia pendiente vinculada (bloquea el rubro)
alter table presupuesto add column if not exists auto_creado boolean not null default false; -- creado por la app al repetir una serie
alter table programado add column if not exists presupuesto_id uuid references presupuesto(id) on delete set null;
create index if not exists presupuesto_serie_idx on presupuesto(programado_serie_id);
create index if not exists programado_presupuesto_idx on programado(presupuesto_id);

-- Bloqueo: un rubro con ocurrencia vinculada no se edita ni se cierra a mano (solo notas y pagador).
create or replace function presupuesto_guardia()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('akontapp.sync', true), 'off') = 'on' or auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.programado_id is not null then raise exception 'Este rubro está programado. Desprográmalo antes de eliminarlo.'; end if;
    return old;
  end if;
  if old.programado_id is not null and (
       new.monto is distinct from old.monto or new.fecha_tentativa is distinct from old.fecha_tentativa or new.estado is distinct from old.estado
    or new.concepto is distinct from old.concepto or new.categoria_id is distinct from old.categoria_id or new.cuenta_id is distinct from old.cuenta_id
    or new.activo_id is distinct from old.activo_id or new.periodo is distinct from old.periodo or new.programado_id is distinct from old.programado_id
    or new.programado_serie_id is distinct from old.programado_serie_id or new.periodicidad is distinct from old.periodicidad) then
    raise exception 'Este rubro está programado: se edita y se paga desde Programado. Desprográmalo para cambiarlo aquí.';
  end if;
  return new;
end $$;
drop trigger if exists presupuesto_guardia on presupuesto;
create trigger presupuesto_guardia before update or delete on presupuesto for each row execute function presupuesto_guardia();

-- Vincula una ocurrencia pendiente con el rubro del presupuesto de su mes (lo crea si no existe).
create or replace function _vincular_ocurrencia(p_prog uuid, p_modelo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o programado%rowtype; mes date; r presupuesto%rowtype; base presupuesto%rowtype; nuevo uuid; prev text := coalesce(current_setting('akontapp.sync', true), 'off');
begin
  select * into o from programado where id = p_prog; if o.id is null then return; end if;
  mes := date_trunc('month', o.vencimiento)::date;
  select * into base from presupuesto where id = p_modelo;
  perform set_config('akontapp.sync', 'on', true);
  -- 1) rubro del mes ya enlazado a la serie, o del mismo concepto sin programar
  select * into r from presupuesto
   where espacio_id = o.espacio_id and periodo = mes and estado in ('Planificado','Programado') and programado_id is null
     and (programado_serie_id = o.serie_id or (programado_serie_id is null and lower(trim(concepto)) = lower(trim(coalesce(base.concepto, o.nombre)))))
   order by (programado_serie_id = o.serie_id) desc nulls last limit 1;
  if r.id is null then
    -- 2) no existe: se crea a partir del modelo (presupuesto "de una sola carga" que se repite)
    insert into presupuesto(espacio_id, periodo, concepto, pagador_id, categoria_id, activo_id, cuenta_id, monto, fecha_tentativa, estado, notas, periodicidad, programado_serie_id, programado_id, auto_creado, creado_por, actualizado_por, creado_en, actualizado_en)
    values (o.espacio_id, mes, coalesce(base.concepto, o.nombre), coalesce(base.pagador_id, o.pagador_id), o.categoria_id, o.activo_id, o.cuenta_id, o.monto, o.vencimiento, 'Programado', base.notas, o.periodicidad, o.serie_id, o.id, true, o.creado_por, o.creado_por, now(), now())
    returning id into nuevo;
  else
    update presupuesto set estado = 'Programado', programado_serie_id = o.serie_id, programado_id = o.id, periodicidad = o.periodicidad, fecha_tentativa = coalesce(fecha_tentativa, o.vencimiento) where id = r.id;
    nuevo := r.id;
  end if;
  update programado set presupuesto_id = nuevo where id = o.id;
  perform set_config('akontapp.sync', prev, true);
end $$;

-- Programar un rubro: crea la obligación (serie) y la vincula.
create or replace function programar_presupuesto(p_id uuid, p_periodicidad text default 'Mensual', p_vencimiento date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); r presupuesto%rowtype; o uuid; t text; cat categorias%rowtype;
begin
  select * into r from presupuesto where id = p_id and espacio_id in (select mis_espacios()); if r.id is null then raise exception 'Rubro no encontrado'; end if;
  if r.programado_id is not null then raise exception 'Este rubro ya está programado'; end if;
  if r.estado in ('Pagado','Cancelado') then raise exception 'Un rubro % no se puede programar', lower(r.estado); end if;
  if p_periodicidad not in ('Semanal','Quincenal','Mensual','Bimestral','Trimestral','Semestral','Anual','Puntual') then raise exception 'Periodicidad inválida: %', p_periodicidad; end if;
  select * into cat from categorias where id = r.categoria_id;
  t := case when cat.nombre = 'Cuota crédito' then 'Cuota crédito' when cat.nombre ilike '%seguro%' then 'Seguro' when cat.nombre ilike '%arriendo%' then 'Arriendo'
            when cat.nombre ilike '%impuesto%' or cat.nombre ilike '%predial%' then 'Impuesto' when cat.nombre ilike '%servicio%' then 'Servicio' when cat.nombre ilike '%suscripci%' then 'Suscripción' else 'Otro' end;
  insert into programado(espacio_id, serie_id, flujo, tipo, nombre, categoria_id, activo_id, cuenta_id, pagador_id, monto, periodicidad, vencimiento, estado, notas, presupuesto_id, creado_por, actualizado_por, creado_en, actualizado_en)
  values (r.espacio_id, gen_random_uuid(), 'salida', t, r.concepto, r.categoria_id, r.activo_id, r.cuenta_id, r.pagador_id, r.monto, p_periodicidad, coalesce(p_vencimiento, r.fecha_tentativa, r.periodo), 'Pendiente', r.notas, r.id, u, u, now(), now())
  returning id into o;
  perform set_config('akontapp.sync', 'on', true);
  update presupuesto set estado = 'Programado', programado_id = o, programado_serie_id = (select serie_id from programado where id = o), periodicidad = p_periodicidad where id = r.id;
  perform set_config('akontapp.sync', 'off', true);
  return o;
end $$;

-- Desprogramar: borra la ocurrencia pendiente, el rubro vuelve a Planificado (la serie termina).
create or replace function desprogramar_presupuesto(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r presupuesto%rowtype;
begin
  select * into r from presupuesto where id = p_id and espacio_id in (select mis_espacios()); if r.id is null then raise exception 'Rubro no encontrado'; end if;
  if r.programado_id is null then raise exception 'Este rubro no está programado'; end if;
  perform set_config('akontapp.sync', 'on', true);
  delete from programado where id = r.programado_id and estado = 'Pendiente';
  update presupuesto set estado = 'Planificado', programado_id = null where id = r.id;
  update presupuesto set programado_serie_id = null, periodicidad = null where id = r.id;
  perform set_config('akontapp.sync', 'off', true);
end $$;

-- Si se borra o se omite/pausa la ocurrencia vinculada (por ejemplo "Eliminar obligación"), el rubro se libera.
create or replace function _liberar_presupuesto()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(old.presupuesto_id, new.presupuesto_id); prev text := coalesce(current_setting('akontapp.sync', true), 'off');
begin
  if pid is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' or new.estado in ('Omitido','Pausado') then
    perform set_config('akontapp.sync', 'on', true);
    update presupuesto set estado = 'Planificado', programado_id = null where id = pid and programado_id = old.id;
    perform set_config('akontapp.sync', prev, true);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists programado_liberar_presupuesto on programado;
create trigger programado_liberar_presupuesto after update of estado or delete on programado for each row execute function _liberar_presupuesto();

create or replace function _siguiente_vencimiento(p_fecha date, p_periodicidad text)
returns date language sql immutable as $$
  select case p_periodicidad
    when 'Semanal'    then p_fecha + interval '1 week'
    when 'Quincenal'  then p_fecha + interval '15 days'
    when 'Mensual'    then p_fecha + interval '1 month'
    when 'Bimestral'  then p_fecha + interval '2 months'
    when 'Trimestral' then p_fecha + interval '3 months'
    when 'Semestral'  then p_fecha + interval '6 months'
    when 'Anual'      then p_fecha + interval '1 year'
  end::date
$$;

-- Omitir una ocurrencia pasa a ser RPC para que la siguiente se vincule al rubro del mes que sigue.
create or replace function omitir_programado(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r programado%rowtype; u uuid := auth.uid(); sig date; nuevo uuid;
begin
  select * into r from programado where id = p_id and espacio_id in (select mis_espacios());
  if r.id is null then raise exception 'Programado no encontrado'; end if;
  if r.estado <> 'Pendiente' then raise exception 'Esta ocurrencia ya fue cerrada'; end if;
  update programado set estado = 'Omitido', completado_en = current_date where id = p_id;
  if r.periodicidad <> 'Puntual' then
    sig := _siguiente_vencimiento(r.vencimiento, r.periodicidad);
    insert into programado(espacio_id, serie_id, flujo, tipo, nombre, categoria_id, activo_id, cuenta_id, cuenta_destino_id, modo_destino, pagador_id, deuda_id, monto, periodicidad, vencimiento, estado,
                           ficha_url, ficha_usuario, ficha_referencia, ficha_instrucciones, ficha_valores, notas, creado_por, actualizado_por, creado_en, actualizado_en)
    values (r.espacio_id, r.serie_id, r.flujo, r.tipo, r.nombre, r.categoria_id, r.activo_id, r.cuenta_id, r.cuenta_destino_id, r.modo_destino, r.pagador_id, r.deuda_id, r.monto, r.periodicidad, sig, 'Pendiente',
            r.ficha_url, r.ficha_usuario, r.ficha_referencia, r.ficha_instrucciones, r.ficha_valores, r.notas, u, u, now(), now())
    returning id into nuevo;
    if r.presupuesto_id is not null then perform _vincular_ocurrencia(nuevo, r.presupuesto_id); end if;
  end if;
  return nuevo;
end $$;


-- completar_programado: cierra el rubro vinculado (Pagado) y vincula la siguiente ocurrencia al rubro del mes siguiente.
create or replace function completar_programado(p_id uuid, p_fecha date, p_monto numeric, p_cuenta_id uuid, p_desglose jsonb default '{}'::jsonb, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r programado%rowtype; m uuid; sig date; u uuid := auth.uid(); nuevo uuid;
begin
  select * into r from programado where id = p_id and espacio_id in (select mis_espacios());
  if r.id is null then raise exception 'Programado no encontrado'; end if;
  if r.estado <> 'Pendiente' then raise exception 'Esta ocurrencia ya fue completada'; end if;

  insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, categoria_id, cuenta_id, cuenta_destino_id, modo_destino, activo_id, programado_id, deuda_id, presupuesto_id, desglose, origen, motivo, creado_por, actualizado_por, creado_en, actualizado_en)
  values (r.espacio_id, p_fecha, case when r.flujo='ingreso' then 'Ingreso' else 'Salida' end, r.nombre, p_monto,
          r.categoria_id, coalesce(p_cuenta_id, r.cuenta_id), r.cuenta_destino_id, r.modo_destino, r.activo_id, r.id, r.deuda_id, r.presupuesto_id, p_desglose, 'programado', p_motivo, u, u, now(), now())
  returning id into m;

  update programado set estado='Completado', completado_en=p_fecha, movimiento_id=m where id = p_id;
  if r.presupuesto_id is not null then
    perform set_config('akontapp.sync', 'on', true);
    update presupuesto set estado = 'Pagado', fecha_efectiva = p_fecha, programado_id = null where id = r.presupuesto_id;
    perform set_config('akontapp.sync', 'off', true);
  end if;

  if r.periodicidad <> 'Puntual' then
    sig := _siguiente_vencimiento(r.vencimiento, r.periodicidad);
    insert into programado(espacio_id, serie_id, flujo, tipo, nombre, categoria_id, activo_id, cuenta_id, cuenta_destino_id, modo_destino, pagador_id, deuda_id, monto, periodicidad, vencimiento, estado,
                           ficha_url, ficha_usuario, ficha_referencia, ficha_instrucciones, ficha_valores, notas, creado_por, actualizado_por, creado_en, actualizado_en)
    values (r.espacio_id, r.serie_id, r.flujo, r.tipo, r.nombre, r.categoria_id, r.activo_id, r.cuenta_id, r.cuenta_destino_id, r.modo_destino, r.pagador_id, r.deuda_id, r.monto, r.periodicidad, sig, 'Pendiente',
            r.ficha_url, r.ficha_usuario, r.ficha_referencia, r.ficha_instrucciones, r.ficha_valores, r.notas, u, u, now(), now())
    returning id into nuevo;
    insert into programado_adjuntos(espacio_id, programado_id, ruta, nombre, mime, bytes, creado_por, actualizado_por, creado_en, actualizado_en)
    select r.espacio_id, nuevo, ruta, nombre, mime, bytes, u, u, now(), now() from programado_adjuntos where programado_id = r.id;
    if r.presupuesto_id is not null then perform _vincular_ocurrencia(nuevo, r.presupuesto_id); end if;
  end if;
  return m;
end $$;

-- deshacer_programado: el rubro vuelve a Programado y se desvincula el del mes siguiente (si se creó automático, se borra).
create or replace function deshacer_programado(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r programado%rowtype; s programado%rowtype;
begin
  select * into r from programado where id = p_id and espacio_id in (select mis_espacios());
  if r.id is null or r.estado <> 'Completado' then raise exception 'No hay nada que deshacer'; end if;
  perform set_config('akontapp.sync', 'on', true);
  for s in select * from programado where serie_id = r.serie_id and estado = 'Pendiente' and vencimiento > r.vencimiento loop
    if s.presupuesto_id is not null then
      -- rubro creado automáticamente (sin ejecución) se borra; si existía, solo se libera
      if exists (select 1 from presupuesto p where p.id = s.presupuesto_id and p.auto_creado and not exists (select 1 from movimientos m where m.presupuesto_id = p.id)) then
        delete from presupuesto where id = s.presupuesto_id;
      else
        update presupuesto set estado = 'Planificado', programado_id = null where id = s.presupuesto_id;
      end if;
    end if;
    delete from programado where id = s.id;
  end loop;
  delete from movimientos where id = r.movimiento_id;
  update programado set estado='Pendiente', completado_en=null, movimiento_id=null where id = p_id;
  if r.presupuesto_id is not null then update presupuesto set estado = 'Programado', fecha_efectiva = null, programado_id = r.id where id = r.presupuesto_id; end if;
  perform set_config('akontapp.sync', 'off', true);
end $$;

-- mover_item de un rubro programado arrastra su ocurrencia pendiente
create or replace function _mover_presupuesto_prog()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.espacio_id is distinct from old.espacio_id and new.programado_id is not null then
    update programado set espacio_id = new.espacio_id, categoria_id = _categoria_equivalente(categoria_id, new.espacio_id) where id = new.programado_id;
  end if;
  return new;
end $$;
drop trigger if exists presupuesto_mover_prog on presupuesto;
create trigger presupuesto_mover_prog after update of espacio_id on presupuesto for each row execute function _mover_presupuesto_prog();

grant execute on function pagar_cuota_credito(uuid,int,date,uuid,numeric,numeric,jsonb,text,numeric), abonar_capital(uuid,date,numeric,uuid,text,text),
  programar_presupuesto(uuid,text,date), desprogramar_presupuesto(uuid), omitir_programado(uuid), completar_programado(uuid,date,numeric,uuid,jsonb,text), deshacer_programado(uuid) to authenticated;

-- Vista de ejecución: incluye los campos nuevos
drop view if exists v_presupuesto_ejecucion;
create view v_presupuesto_ejecucion as
select p.*, coalesce((select sum(m.monto) from movimientos m where m.presupuesto_id = p.id and m.tipo='Salida'),0) as ejecutado
from presupuesto p;

insert into app_meta(clave, valor) values ('schema_version', '3') on conflict (clave) do update set valor = '3', actualizado_en = now();
