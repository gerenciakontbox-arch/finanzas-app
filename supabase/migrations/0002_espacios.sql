-- ============================================================================
-- Akontapp — Migración 0002: ESPACIOS (personal / hogar / empresa)
-- Ejecutar en Supabase: SQL Editor → New query → pegar → Run.
-- Requiere 0001_schema.sql aplicado. Idempotente: se puede volver a correr.
--
-- Modelo:
--  · Cada usuario tiene un espacio PERSONAL (solo él). Hogares y empresas son
--    espacios compartidos con miembros (admin / miembro).
--  · Todo ítem pertenece a exactamente un espacio (espacio_id).
--  · Cuentas y tarjetas: propiedad del espacio personal del dueño; se HABILITAN
--    como medio de pago en espacios compartidos (cuentas_espacio).
--  · Movimiento de un espacio compartido pagado con cuenta personal de un
--    miembro → espejo automático en el personal del dueño de la cuenta:
--    "Aporte a <espacio>" (Transferencia). Ingreso del espacio que cae en cuenta
--    personal → espejo "Recibido de <espacio>". Salida del espacio hacia la cuenta
--    personal de un miembro → espejo "Ingreso" (honorarios) o "Devolución".
--  · Saldo de una cuenta = solo movimientos cuyo espacio es el de la cuenta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. VERSIÓN DE ESQUEMA (la app comprueba que coincida)
-- ----------------------------------------------------------------------------
create table if not exists app_meta (clave text primary key, valor text not null, actualizado_en timestamptz not null default now());
alter table app_meta enable row level security;
drop policy if exists app_meta_lectura on app_meta;
create policy app_meta_lectura on app_meta for select to authenticated using (true);
grant select on app_meta to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 1. ESPACIOS Y MIEMBROS
-- ----------------------------------------------------------------------------
create table if not exists espacios (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in ('personal','hogar','empresa')),
  nombre            text not null,
  codigo_invitacion text unique,          -- null en personal
  moneda            text not null default 'COP',
  dueno_id          uuid references auth.users(id) on delete set null, -- en personal: el usuario
  creado_por        uuid references auth.users(id) on delete set null,
  creado_en         timestamptz not null default now()
);
create unique index if not exists espacios_personal_unico on espacios(dueno_id) where tipo = 'personal';

create table if not exists espacio_miembros (
  espacio_id uuid not null references espacios(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  rol        text not null default 'miembro' check (rol in ('admin','miembro')),
  nombre     text not null,
  unido_en   timestamptz not null default now(),
  primary key (espacio_id, user_id)
);
create index if not exists espacio_miembros_user_idx on espacio_miembros(user_id);

alter table perfiles add column if not exists espacio_activo uuid references espacios(id) on delete set null;
alter table perfiles add column if not exists espacio_personal uuid references espacios(id) on delete set null;

-- Espacios a los que pertenece el usuario autenticado (security definer: evita recursión RLS)
create or replace function mis_espacios()
returns setof uuid language sql stable security definer set search_path = public as $$
  select espacio_id from espacio_miembros where user_id = auth.uid()
$$;
create or replace function es_admin(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from espacio_miembros where espacio_id = e and user_id = auth.uid() and rol = 'admin')
$$;
create or replace function espacio_tipo(e uuid)
returns text language sql stable security definer set search_path = public as $$
  select tipo from espacios where id = e
$$;
-- Espacio personal de un usuario (crea si no existe)
create or replace function _personal_de(u uuid, p_nombre text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare e uuid; n text;
begin
  select id into e from espacios where tipo = 'personal' and dueno_id = u;
  if e is null then
    n := coalesce(p_nombre, (select nombre from perfiles where user_id = u));
    if n is null then begin select split_part(email,'@',1) into n from auth.users where id = u; exception when others then n := null; end; end if;
    n := coalesce(n, 'Personal');
    insert into espacios(tipo, nombre, dueno_id, creado_por) values ('personal', 'Personal', u, u) returning id into e;
    insert into espacio_miembros(espacio_id, user_id, rol, nombre) values (e, u, 'admin', n) on conflict do nothing;
    insert into perfiles(user_id, nombre, espacio_personal, espacio_activo) values (u, n, e, e)
      on conflict (user_id) do update set espacio_personal = excluded.espacio_personal, espacio_activo = coalesce(perfiles.espacio_activo, excluded.espacio_activo), nombre = coalesce(perfiles.nombre, excluded.nombre);
    perform _sembrar_categorias(e, 'personal');
    insert into cuentas(espacio_id, nombre, tipo) values (e, 'Efectivo', 'Efectivo') on conflict do nothing;
  end if;
  return e;
end $$;

-- ----------------------------------------------------------------------------
-- 2. espacio_id EN TODAS LAS TABLAS DE DOMINIO (reemplaza hogar_id, mismo valor)
-- ----------------------------------------------------------------------------
-- Las filas existentes conservan su id de hogar; el hogar se convierte en espacio con el MISMO id.
insert into espacios(id, tipo, nombre, codigo_invitacion, moneda, creado_por, creado_en)
select h.id, 'hogar', h.nombre, h.codigo_invitacion, h.moneda, h.creado_por, h.creado_en from hogares h
on conflict (id) do nothing;
insert into espacio_miembros(espacio_id, user_id, rol, nombre, unido_en)
select m.hogar_id, m.user_id, case when m.rol = 'dueño' then 'admin' else 'miembro' end, m.nombre, m.unido_en from miembros m
on conflict do nothing;

drop view if exists v_presupuesto_ejecucion;
do $$
declare t text;
begin
  foreach t in array array['entidades','categorias','cuentas','activos','presupuesto','deudas','tc_cargos','cuotas_pagadas','programado','programado_adjuntos','movimientos','bitacora'] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='hogar_id') then
      execute format('alter table %I drop constraint if exists %I', t, t || '_hogar_id_fkey');
      execute format('alter table %I rename column hogar_id to espacio_id', t);
    end if;
    if t <> 'bitacora' then
      execute format('alter table %I drop constraint if exists %I', t, t || '_espacio_id_fkey');
      execute format('alter table %I add constraint %I foreign key (espacio_id) references espacios(id) on delete cascade', t, t || '_espacio_id_fkey');
    end if;
  end loop;
end $$;
drop index if exists bitacora_hogar_fecha_idx; create index if not exists bitacora_espacio_fecha_idx on bitacora(espacio_id, fecha desc);
drop index if exists presupuesto_hogar_periodo_idx; create index if not exists presupuesto_espacio_periodo_idx on presupuesto(espacio_id, periodo);
drop index if exists programado_hogar_venc_idx; create index if not exists programado_espacio_venc_idx on programado(espacio_id, estado, vencimiento);
drop index if exists movimientos_hogar_fecha_idx; create index if not exists movimientos_espacio_fecha_idx on movimientos(espacio_id, fecha desc);

-- Restricciones de unicidad: ahora por espacio
alter table categorias drop constraint if exists categorias_hogar_id_nombre_key; alter table categorias drop constraint if exists categorias_espacio_id_nombre_key;
alter table categorias add constraint categorias_espacio_id_nombre_key unique (espacio_id, nombre);
alter table cuentas drop constraint if exists cuentas_hogar_id_nombre_key; alter table cuentas drop constraint if exists cuentas_espacio_id_nombre_key;
alter table cuentas add constraint cuentas_espacio_id_nombre_key unique (espacio_id, nombre);
alter table entidades drop constraint if exists entidades_hogar_id_nombre_key; alter table entidades drop constraint if exists entidades_espacio_id_nombre_key;
alter table entidades add constraint entidades_espacio_id_nombre_key unique (espacio_id, nombre);

-- ----------------------------------------------------------------------------
-- 3. COLUMNAS NUEVAS
-- ----------------------------------------------------------------------------
-- Categorías: desactivables; una categoría usada no se borra (ver trigger).
alter table categorias add column if not exists activa boolean not null default true;

-- Dueño de la cuenta (usuario) cuando pertenece a un espacio personal: así los demás miembros pueden mostrar "de Andrés"
alter table cuentas add column if not exists dueno_id uuid references auth.users(id) on delete set null;
create or replace function cuentas_dueno()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select case when e.tipo = 'personal' then e.dueno_id else null end into new.dueno_id from espacios e where e.id = new.espacio_id;
  return new;
end $$;
drop trigger if exists cuentas_dueno on cuentas;
create trigger cuentas_dueno before insert or update of espacio_id on cuentas for each row execute function cuentas_dueno();

-- Cuentas habilitadas como medio de pago en otros espacios
create table if not exists cuentas_espacio (
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  espacio_id uuid not null references espacios(id) on delete cascade,
  creado_por uuid, creado_en timestamptz not null default now(),
  primary key (cuenta_id, espacio_id)
);

-- Pagador (dueño del medio de pago) en presupuesto y programado
alter table presupuesto add column if not exists pagador_id uuid references auth.users(id) on delete set null;
alter table programado  add column if not exists pagador_id uuid references auth.users(id) on delete set null;
alter table programado  add column if not exists cuenta_destino_id uuid references cuentas(id) on delete set null;
alter table programado  add column if not exists modo_destino text check (modo_destino in ('ingreso','devolucion'));

-- Movimientos: transferencias, espejos, pagador, destino
alter table movimientos drop constraint if exists movimientos_tipo_check;
alter table movimientos add constraint movimientos_tipo_check check (tipo in ('Ingreso','Salida','Transferencia'));
alter table movimientos add column if not exists subtipo text check (subtipo in ('aporte','recibido','traslado','devolucion'));
alter table movimientos add column if not exists pagador_id uuid references auth.users(id) on delete set null;
alter table movimientos add column if not exists cuenta_destino_id uuid references cuentas(id) on delete set null;
alter table movimientos add column if not exists modo_destino text check (modo_destino in ('ingreso','devolucion'));
alter table movimientos add column if not exists espacio_contraparte uuid references espacios(id) on delete set null;
alter table movimientos add column if not exists espejo_de uuid references movimientos(id) on delete cascade;
alter table movimientos add column if not exists motivo text; -- p. ej. "Pago anticipado del mes siguiente"
alter table movimientos drop constraint if exists movimientos_origen_check;
alter table movimientos add constraint movimientos_origen_check check (origen in ('manual','programado','credito','tarjeta','importacion','bot','espejo','migracion'));
create index if not exists movimientos_espejo_idx on movimientos(espejo_de);

-- ----------------------------------------------------------------------------
-- 4. SEGURIDAD (RLS) POR ESPACIO
-- ----------------------------------------------------------------------------
create or replace function registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
declare e uuid; rid uuid;
begin
  if tg_op = 'DELETE' then e := old.espacio_id; rid := old.id; else e := new.espacio_id; rid := new.id; end if;
  insert into bitacora(espacio_id, tabla, registro_id, accion, user_id, antes, despues)
  values (e, tg_table_name, rid, tg_op, auth.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function _aplicar_estandar(t text)
returns void language plpgsql as $$
begin
  execute format('drop trigger if exists %I_auditoria on %I', t, t);
  execute format('create trigger %I_auditoria before insert or update on %I for each row execute function set_auditoria()', t, t);
  execute format('drop trigger if exists %I_bitacora on %I', t, t);
  execute format('create trigger %I_bitacora after insert or update or delete on %I for each row execute function registrar_bitacora()', t, t);
  execute format('alter table %I enable row level security', t);
  execute format('drop policy if exists %I_hogar on %I', t, t);
  execute format('drop policy if exists %I_espacio on %I', t, t);
  execute format('create policy %I_espacio on %I for all to authenticated using (espacio_id in (select mis_espacios())) with check (espacio_id in (select mis_espacios()))', t, t);
end $$;

select _aplicar_estandar(t) from unnest(array['entidades','categorias','activos','presupuesto','deudas','tc_cargos','cuotas_pagadas','programado','programado_adjuntos']) as t;

-- Cuentas: visibles en su espacio y en los espacios donde están habilitadas; solo el espacio dueño las edita.
-- Helpers security definer para evitar recursión entre las políticas de cuentas y cuentas_espacio.
create or replace function _mis_cuentas_propias()
returns setof uuid language sql stable security definer set search_path = public as $$
  select k.id from cuentas k where k.espacio_id in (select espacio_id from espacio_miembros where user_id = auth.uid())
$$;
create or replace function _mis_cuentas_habilitadas()
returns setof uuid language sql stable security definer set search_path = public as $$
  select ce.cuenta_id from cuentas_espacio ce where ce.espacio_id in (select espacio_id from espacio_miembros where user_id = auth.uid())
$$;
drop trigger if exists cuentas_auditoria on cuentas; create trigger cuentas_auditoria before insert or update on cuentas for each row execute function set_auditoria();
drop trigger if exists cuentas_bitacora on cuentas; create trigger cuentas_bitacora after insert or update or delete on cuentas for each row execute function registrar_bitacora();
alter table cuentas enable row level security;
drop policy if exists cuentas_hogar on cuentas; drop policy if exists cuentas_espacio on cuentas;
drop policy if exists cuentas_ver on cuentas; drop policy if exists cuentas_editar on cuentas;
create policy cuentas_ver on cuentas for select to authenticated
  using (espacio_id in (select mis_espacios()) or id in (select _mis_cuentas_habilitadas()));
create policy cuentas_editar on cuentas for all to authenticated
  using (espacio_id in (select mis_espacios())) with check (espacio_id in (select mis_espacios()));

alter table cuentas_espacio enable row level security;
drop policy if exists cuentas_espacio_ver on cuentas_espacio; drop policy if exists cuentas_espacio_dueno on cuentas_espacio;
create policy cuentas_espacio_ver on cuentas_espacio for select to authenticated
  using (espacio_id in (select mis_espacios()) or cuenta_id in (select _mis_cuentas_propias()));
create policy cuentas_espacio_dueno on cuentas_espacio for all to authenticated
  using (cuenta_id in (select _mis_cuentas_propias()))
  with check (cuenta_id in (select _mis_cuentas_propias()) and espacio_id in (select mis_espacios()));

-- Movimientos: por espacio; los espejos solo se crean/borran por trigger
drop trigger if exists movimientos_auditoria on movimientos; create trigger movimientos_auditoria before insert or update on movimientos for each row execute function set_auditoria();
drop trigger if exists movimientos_bitacora on movimientos; create trigger movimientos_bitacora after insert or update or delete on movimientos for each row execute function registrar_bitacora();
alter table movimientos enable row level security;
drop policy if exists movimientos_hogar on movimientos; drop policy if exists movimientos_espacio on movimientos;
drop policy if exists movimientos_ver on movimientos; drop policy if exists movimientos_crear on movimientos; drop policy if exists movimientos_editar on movimientos; drop policy if exists movimientos_borrar on movimientos;
create policy movimientos_ver on movimientos for select to authenticated using (espacio_id in (select mis_espacios()));
create policy movimientos_crear on movimientos for insert to authenticated with check (espacio_id in (select mis_espacios()) and espejo_de is null);
create policy movimientos_editar on movimientos for update to authenticated using (espacio_id in (select mis_espacios()) and espejo_de is null) with check (espacio_id in (select mis_espacios()) and espejo_de is null);
create policy movimientos_borrar on movimientos for delete to authenticated using (espacio_id in (select mis_espacios()) and espejo_de is null);

-- Bitácora
drop policy if exists bitacora_lectura on bitacora;
create policy bitacora_lectura on bitacora for select to authenticated using (espacio_id in (select mis_espacios()));

-- Espacios / miembros / perfiles
alter table espacios enable row level security;
drop policy if exists espacios_ver on espacios; drop policy if exists espacios_admin_edita on espacios; drop policy if exists espacios_admin_borra on espacios;
create policy espacios_ver on espacios for select to authenticated using (id in (select mis_espacios()));
create policy espacios_admin_edita on espacios for update to authenticated using (es_admin(id) and tipo <> 'personal') with check (es_admin(id) and tipo <> 'personal');
create policy espacios_admin_borra on espacios for delete to authenticated using (es_admin(id) and tipo <> 'personal');

alter table espacio_miembros enable row level security;
drop policy if exists em_ver on espacio_miembros; drop policy if exists em_admin_quita on espacio_miembros; drop policy if exists em_salir on espacio_miembros; drop policy if exists em_admin_rol on espacio_miembros;
create policy em_ver on espacio_miembros for select to authenticated using (espacio_id in (select mis_espacios()));
create policy em_admin_quita on espacio_miembros for delete to authenticated using (es_admin(espacio_id) and user_id <> auth.uid());
create policy em_salir on espacio_miembros for delete to authenticated using (user_id = auth.uid() and espacio_tipo(espacio_id) <> 'personal' and rol <> 'admin');
create policy em_admin_rol on espacio_miembros for update to authenticated using (es_admin(espacio_id)) with check (es_admin(espacio_id) and rol in ('admin','miembro'));
-- INSERT solo vía RPC (crear_espacio / unirse_espacio)

-- Storage: carpeta = espacio_id
drop policy if exists adjuntos_hogar_select on storage.objects; drop policy if exists adjuntos_hogar_insert on storage.objects; drop policy if exists adjuntos_hogar_delete on storage.objects;
drop policy if exists adjuntos_espacio_select on storage.objects; drop policy if exists adjuntos_espacio_insert on storage.objects; drop policy if exists adjuntos_espacio_delete on storage.objects;
create policy adjuntos_espacio_select on storage.objects for select to authenticated using (bucket_id = 'adjuntos' and (storage.foldername(name))[1]::uuid in (select mis_espacios()));
create policy adjuntos_espacio_insert on storage.objects for insert to authenticated with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1]::uuid in (select mis_espacios()));
create policy adjuntos_espacio_delete on storage.objects for delete to authenticated using (bucket_id = 'adjuntos' and (storage.foldername(name))[1]::uuid in (select mis_espacios()));

-- Tablas viejas: quedan archivadas e invisibles
alter table hogares enable row level security; drop policy if exists hogares_miembros on hogares; drop policy if exists hogares_dueño_edita on hogares; drop policy if exists hogares_dueño_borra on hogares;
alter table miembros enable row level security; drop policy if exists miembros_ver on miembros; drop policy if exists miembros_dueño_gestiona on miembros; drop policy if exists miembros_salir on miembros;

-- ----------------------------------------------------------------------------
-- 5. CATEGORÍAS: siembra por tipo de espacio, no borrar si usadas, grupo fijo si usadas
-- ----------------------------------------------------------------------------
create or replace function _sembrar_categorias(e uuid, t text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('akontapp.sync', 'on', true);
  if t = 'empresa' then
    insert into categorias(espacio_id, nombre, grupo, orden) values
      (e,'Arriendo','Fijo',1),(e,'Servicios públicos','Fijo',2),(e,'Internet y telefonía','Fijo',3),(e,'Nómina','Fijo',4),(e,'Seguridad social','Fijo',5),
      (e,'Honorarios','Variable',6),(e,'Software y suscripciones','Fijo',7),(e,'Publicidad','Variable',8),(e,'Transporte','Variable',9),(e,'Papelería','Variable',10),
      (e,'Impuestos','Provisión',11),(e,'Cuota crédito','Amortización crédito',12),(e,'Pago tarjeta crédito','Amortización crédito',13),(e,'Ventas','Variable',14),(e,'Otro','Variable',99)
    on conflict do nothing;
  else
    insert into categorias(espacio_id, nombre, grupo, orden) values
      (e,'Arriendo','Fijo',1),(e,'Servicios públicos','Fijo',2),(e,'Internet','Fijo',3),(e,'Seguro salud','Fijo',4),
      (e,'Mercado','Variable',5),(e,'Transporte','Variable',6),(e,'Restaurantes','Variable',7),(e,'Entretenimiento','Variable',8),
      (e,'Ropa','Variable',9),(e,'Salud','Variable',10),(e,'Educación','Fijo',11),(e,'Impuesto renta','Provisión',12),
      (e,'Impuesto vehicular','Provisión',13),(e,'Predial','Provisión',14),(e,'Mantenimiento','Provisión',15),(e,'Seguro','Provisión',16),
      (e,'Cuota crédito','Amortización crédito',17),(e,'Pago tarjeta crédito','Amortización crédito',18),
      (e,'Nómina','Fijo',19),(e,'Honorarios','Variable',20),(e,'Otro','Variable',99)
    on conflict do nothing;
  end if;
  perform set_config('akontapp.sync', 'off', true);
end $$;

create or replace function categoria_en_uso(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from movimientos where categoria_id = c)
      or exists(select 1 from presupuesto where categoria_id = c)
      or exists(select 1 from programado where categoria_id = c)
      or exists(select 1 from tc_cargos where categoria_id = c)
$$;

create or replace function categorias_guardia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('akontapp.sync', true), 'off') <> 'on'
     and espacio_tipo(coalesce(new.espacio_id, old.espacio_id)) <> 'personal' and not es_admin(coalesce(new.espacio_id, old.espacio_id)) then
    raise exception 'Solo un administrador del espacio puede modificar las categorías';
  end if;
  if tg_op = 'DELETE' then
    if categoria_en_uso(old.id) then raise exception 'La categoría "%" ya tiene registros: desactívala en lugar de borrarla', old.nombre; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and new.grupo <> old.grupo and categoria_en_uso(old.id) then
    raise exception 'No se puede cambiar el grupo de "%" porque ya tiene registros', old.nombre;
  end if;
  return new;
end $$;
drop trigger if exists categorias_guardia on categorias;
create trigger categorias_guardia before update or delete on categorias for each row execute function categorias_guardia();
drop trigger if exists categorias_guardia_insert on categorias;
create trigger categorias_guardia_insert before insert on categorias for each row execute function categorias_guardia();

-- Busca (o crea) en el espacio destino la categoría equivalente a una de origen
create or replace function _categoria_equivalente(c uuid, e_dest uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare src categorias%rowtype; d uuid;
begin
  if c is null then return null; end if;
  select * into src from categorias where id = c;
  if src.id is null then return null; end if;
  if src.espacio_id = e_dest then return c; end if;
  select id into d from categorias where espacio_id = e_dest and lower(nombre) = lower(src.nombre);
  if d is null then
    perform set_config('akontapp.sync', 'on', true);
    insert into categorias(espacio_id, nombre, grupo, afecta_caja, orden) values (e_dest, src.nombre, src.grupo, src.afecta_caja, src.orden) returning id into d;
    perform set_config('akontapp.sync', 'off', true);
  end if;
  return d;
end $$;

-- ----------------------------------------------------------------------------
-- 6. MOVIMIENTOS: pagador automático + espejos (aportes / recibidos / ingresos)
-- ----------------------------------------------------------------------------
create or replace function _dueno_cuenta(c uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.dueno_id from cuentas k join espacios e on e.id = k.espacio_id where k.id = c and e.tipo = 'personal'
$$;

create or replace function movimientos_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.espejo_de is not null then return new; end if;
  -- pagador = dueño de la cuenta de donde sale (Salida/Transferencia) o donde entra (Ingreso) si es personal
  new.pagador_id := coalesce(_dueno_cuenta(new.cuenta_id), new.pagador_id);
  if new.tipo = 'Transferencia' then
    if new.subtipo is null then new.subtipo := 'traslado'; end if;
    if new.subtipo = 'traslado' and new.cuenta_destino_id is null then raise exception 'Un traslado necesita cuenta destino'; end if;
  end if;
  return new;
end $$;
drop trigger if exists movimientos_antes on movimientos;
create trigger movimientos_antes before insert or update on movimientos for each row execute function movimientos_antes();

-- (Re)genera los espejos de un movimiento de espacio compartido.
-- Los espejos solo pueden crearse/borrarse aquí o por cascada del original (RLS impide tocarlos directamente).
create or replace function _sincronizar_espejos(m movimientos)
returns void language plpgsql security definer set search_path = public as $$
declare t_esp text; nombre_esp text; d uuid; pers uuid; d2 uuid; pers2 uuid;
begin
  delete from movimientos where espejo_de = m.id;
  if m.espejo_de is not null then return; end if;
  select tipo, nombre into t_esp, nombre_esp from espacios where id = m.espacio_id;
  if t_esp = 'personal' then return; end if;

  -- 1) cuenta principal personal de un miembro
  d := _dueno_cuenta(m.cuenta_id);
  if d is not null then
    pers := _personal_de(d);
    if m.tipo = 'Salida' or (m.tipo = 'Transferencia' and m.subtipo = 'traslado') then
      insert into movimientos(espacio_id, fecha, tipo, subtipo, descripcion, monto, cuenta_id, espacio_contraparte, espejo_de, origen, pagador_id, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
      values (pers, m.fecha, 'Transferencia', 'aporte', 'Aporte a ' || nombre_esp || ' · ' || m.descripcion, m.monto, m.cuenta_id, m.espacio_id, m.id, 'espejo', d, '{}'::jsonb, m.creado_por, m.creado_por, now(), now());
    elsif m.tipo = 'Ingreso' then
      insert into movimientos(espacio_id, fecha, tipo, subtipo, descripcion, monto, cuenta_id, espacio_contraparte, espejo_de, origen, pagador_id, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
      values (pers, m.fecha, 'Transferencia', 'recibido', 'Recibido de ' || nombre_esp || ' · ' || m.descripcion, m.monto, m.cuenta_id, m.espacio_id, m.id, 'espejo', d, '{}'::jsonb, m.creado_por, m.creado_por, now(), now());
    end if;
  end if;

  -- 2) cuenta destino personal (Salida del espacio hacia un miembro: honorarios / devolución)
  d2 := _dueno_cuenta(m.cuenta_destino_id);
  if d2 is not null and m.tipo = 'Salida' then
    pers2 := _personal_de(d2);
    if coalesce(m.modo_destino, case when t_esp = 'empresa' then 'ingreso' else 'devolucion' end) = 'ingreso' then
      insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, cuenta_id, categoria_id, espacio_contraparte, espejo_de, origen, pagador_id, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
      values (pers2, m.fecha, 'Ingreso', nombre_esp || ' · ' || m.descripcion, m.monto, m.cuenta_destino_id, _categoria_equivalente(m.categoria_id, pers2), m.espacio_id, m.id, 'espejo', d2, '{}'::jsonb, m.creado_por, m.creado_por, now(), now());
    else
      insert into movimientos(espacio_id, fecha, tipo, subtipo, descripcion, monto, cuenta_id, espacio_contraparte, espejo_de, origen, pagador_id, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
      values (pers2, m.fecha, 'Transferencia', 'devolucion', 'Devolución de ' || nombre_esp || ' · ' || m.descripcion, m.monto, m.cuenta_destino_id, m.espacio_id, m.id, 'espejo', d2, '{}'::jsonb, m.creado_por, m.creado_por, now(), now());
    end if;
  end if;
end $$;

create or replace function movimientos_despues()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.espejo_de is not null then return new; end if;
  perform _sincronizar_espejos(new);
  return new;
end $$;
drop trigger if exists movimientos_despues on movimientos;
create trigger movimientos_despues after insert or update on movimientos for each row execute function movimientos_despues();
drop trigger if exists espejo_guardia on movimientos;
drop function if exists espejo_guardia();

-- ----------------------------------------------------------------------------
-- 7. RPC: espacios, unirse, mover ítems, programado, factura TC
-- ----------------------------------------------------------------------------
create or replace function asegurar_personal(p_nombre text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'No autenticado'; end if;
  return _personal_de(u, p_nombre);
end $$;

create or replace function crear_espacio(p_tipo text, p_nombre text, p_nombre_miembro text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'No autenticado'; end if;
  if p_tipo not in ('hogar','empresa') then raise exception 'Tipo de espacio inválido'; end if;
  perform _personal_de(u, p_nombre_miembro);
  insert into espacios(tipo, nombre, codigo_invitacion, creado_por) values (p_tipo, p_nombre, upper(substr(encode(gen_random_bytes(6),'hex'),1,8)), u) returning id into e;
  insert into espacio_miembros(espacio_id, user_id, rol, nombre) values (e, u, 'admin', p_nombre_miembro);
  update perfiles set espacio_activo = e, nombre = coalesce(nombre, p_nombre_miembro) where user_id = u;
  perform _sembrar_categorias(e, p_tipo);
  if p_tipo = 'empresa' then insert into cuentas(espacio_id, nombre, tipo) values (e, 'Caja ' || p_nombre, 'Efectivo'); end if;
  return e;
end $$;

create or replace function unirse_espacio(p_codigo text, p_nombre_miembro text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'No autenticado'; end if;
  perform _personal_de(u, p_nombre_miembro);
  select id into e from espacios where codigo_invitacion = upper(trim(p_codigo)) and tipo <> 'personal';
  if e is null then raise exception 'Código de invitación inválido'; end if;
  insert into espacio_miembros(espacio_id, user_id, rol, nombre) values (e, u, 'miembro', p_nombre_miembro) on conflict (espacio_id, user_id) do nothing;
  update perfiles set espacio_activo = e where user_id = u;
  return e;
end $$;

drop function if exists regenerar_codigo(uuid);
create or replace function regenerar_codigo(p_espacio uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not es_admin(p_espacio) then raise exception 'Solo un administrador puede regenerar el código'; end if;
  c := upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
  update espacios set codigo_invitacion = c where id = p_espacio;
  return c;
end $$;

-- Mi nombre para mostrar, en el perfil y en todos mis espacios
create or replace function cambiar_mi_nombre(p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'No autenticado'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'El nombre no puede estar vacío'; end if;
  update perfiles set nombre = trim(p_nombre) where user_id = u;
  update espacio_miembros set nombre = trim(p_nombre) where user_id = u;
end $$;

-- Habilitar / deshabilitar una cuenta propia como medio de pago en un espacio donde soy miembro
create or replace function habilitar_cuenta(p_cuenta uuid, p_espacio uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if _dueno_cuenta(p_cuenta) is distinct from u then raise exception 'Solo el dueño de la cuenta puede habilitarla'; end if;
  if p_espacio not in (select mis_espacios()) then raise exception 'No eres miembro de ese espacio'; end if;
  if p_on then insert into cuentas_espacio(cuenta_id, espacio_id, creado_por) values (p_cuenta, p_espacio, u) on conflict do nothing;
  else delete from cuentas_espacio where cuenta_id = p_cuenta and espacio_id = p_espacio; end if;
end $$;

-- Mover un ítem (activo, deuda, programado, tc_cargo, presupuesto) a otro espacio.
-- Activo: arrastra deuda vinculada, programaciones pendientes y compras TC activas. El historial de movimientos NO se mueve.
create or replace function mover_item(p_tabla text, p_id uuid, p_destino uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); origen uuid; r record;
begin
  if p_destino not in (select mis_espacios()) then raise exception 'No eres miembro del espacio destino'; end if;
  if p_tabla = 'activos' then
    select espacio_id into origen from activos where id = p_id; if origen is null then raise exception 'Activo no encontrado'; end if;
    if origen not in (select mis_espacios()) then raise exception 'Sin acceso al activo'; end if;
    update activos set espacio_id = p_destino, entidad_id = null where id = p_id;
    for r in select id from deudas where activo_id = p_id and estado = 'Activo' loop perform mover_item('deudas', r.id, p_destino); end loop;
    for r in select id from programado where activo_id = p_id and estado = 'Pendiente' loop perform mover_item('programado', r.id, p_destino); end loop;
    for r in select c.id from tc_cargos c where c.activo_id = p_id and exists (select 1 from generate_series(1, c.cuotas) n where not exists (select 1 from cuotas_pagadas p where p.cargo_id = c.id and p.numero = n)) loop perform mover_item('tc_cargos', r.id, p_destino); end loop;
  elsif p_tabla = 'deudas' then
    select espacio_id into origen from deudas where id = p_id; if origen is null or origen not in (select mis_espacios()) then raise exception 'Deuda no encontrada'; end if;
    update deudas set espacio_id = p_destino, entidad_id = null where id = p_id;
    update cuotas_pagadas set espacio_id = p_destino where deuda_id = p_id;
    for r in select id from programado where deuda_id = p_id and estado = 'Pendiente' loop perform mover_item('programado', r.id, p_destino); end loop;
  elsif p_tabla = 'programado' then
    select espacio_id into origen from programado where id = p_id; if origen is null or origen not in (select mis_espacios()) then raise exception 'Programado no encontrado'; end if;
    update programado set espacio_id = p_destino, entidad_id = null, categoria_id = _categoria_equivalente(categoria_id, p_destino) where id = p_id and estado = 'Pendiente';
    update programado_adjuntos set espacio_id = p_destino where programado_id = p_id;
  elsif p_tabla = 'tc_cargos' then
    select espacio_id into origen from tc_cargos where id = p_id; if origen is null or origen not in (select mis_espacios()) then raise exception 'Compra no encontrada'; end if;
    update tc_cargos set espacio_id = p_destino, entidad_id = null, categoria_id = _categoria_equivalente(categoria_id, p_destino) where id = p_id;
    update cuotas_pagadas set espacio_id = p_destino where cargo_id = p_id;
  elsif p_tabla = 'presupuesto' then
    select espacio_id into origen from presupuesto where id = p_id; if origen is null or origen not in (select mis_espacios()) then raise exception 'Rubro no encontrado'; end if;
    update presupuesto set espacio_id = p_destino, entidad_id = null, categoria_id = _categoria_equivalente(categoria_id, p_destino) where id = p_id;
  else
    raise exception 'Tabla no soportada: %', p_tabla;
  end if;
end $$;

create or replace function completar_programado(p_id uuid, p_fecha date, p_monto numeric, p_cuenta_id uuid, p_desglose jsonb default '{}'::jsonb, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r programado%rowtype; m uuid; sig date; u uuid := auth.uid();
begin
  select * into r from programado where id = p_id and espacio_id in (select mis_espacios());
  if r.id is null then raise exception 'Programado no encontrado'; end if;
  if r.estado <> 'Pendiente' then raise exception 'Esta ocurrencia ya fue completada'; end if;

  insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, categoria_id, cuenta_id, cuenta_destino_id, modo_destino, activo_id, programado_id, deuda_id, desglose, origen, motivo, creado_por, actualizado_por, creado_en, actualizado_en)
  values (r.espacio_id, p_fecha, case when r.flujo='ingreso' then 'Ingreso' else 'Salida' end, r.nombre, p_monto,
          r.categoria_id, coalesce(p_cuenta_id, r.cuenta_id), r.cuenta_destino_id, r.modo_destino, r.activo_id, r.id, r.deuda_id, p_desglose, 'programado', p_motivo, u, u, now(), now())
  returning id into m;

  update programado set estado='Completado', completado_en=p_fecha, movimiento_id=m where id = p_id;

  if r.periodicidad <> 'Puntual' then
    sig := case r.periodicidad
      when 'Semanal'    then r.vencimiento + interval '1 week'
      when 'Quincenal'  then r.vencimiento + interval '15 days'
      when 'Mensual'    then r.vencimiento + interval '1 month'
      when 'Bimestral'  then r.vencimiento + interval '2 months'
      when 'Trimestral' then r.vencimiento + interval '3 months'
      when 'Semestral'  then r.vencimiento + interval '6 months'
      when 'Anual'      then r.vencimiento + interval '1 year'
    end;
    insert into programado(espacio_id, serie_id, flujo, tipo, nombre, categoria_id, activo_id, cuenta_id, cuenta_destino_id, modo_destino, pagador_id, deuda_id, monto, periodicidad, vencimiento, estado,
                           ficha_url, ficha_usuario, ficha_referencia, ficha_instrucciones, ficha_valores, notas, creado_por, actualizado_por, creado_en, actualizado_en)
    values (r.espacio_id, r.serie_id, r.flujo, r.tipo, r.nombre, r.categoria_id, r.activo_id, r.cuenta_id, r.cuenta_destino_id, r.modo_destino, r.pagador_id, r.deuda_id, r.monto, r.periodicidad, sig, 'Pendiente',
            r.ficha_url, r.ficha_usuario, r.ficha_referencia, r.ficha_instrucciones, r.ficha_valores, r.notas, u, u, now(), now());
    insert into programado_adjuntos(espacio_id, programado_id, ruta, nombre, mime, bytes, creado_por, actualizado_por, creado_en, actualizado_en)
    select r.espacio_id, (select id from programado where serie_id = r.serie_id and vencimiento = sig and estado='Pendiente' limit 1), ruta, nombre, mime, bytes, u, u, now(), now()
    from programado_adjuntos where programado_id = r.id;
  end if;
  return m;
end $$;
drop function if exists completar_programado(uuid, date, numeric, uuid, jsonb);

create or replace function deshacer_programado(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r programado%rowtype;
begin
  select * into r from programado where id = p_id and espacio_id in (select mis_espacios());
  if r.id is null or r.estado <> 'Completado' then raise exception 'No hay nada que deshacer'; end if;
  delete from programado where serie_id = r.serie_id and estado = 'Pendiente' and vencimiento > r.vencimiento;
  delete from movimientos where id = r.movimiento_id;
  update programado set estado='Pendiente', completado_en=null, movimiento_id=null where id = p_id;
end $$;

-- Pago de factura de tarjeta: una tarjeta personal puede tener compras en varios espacios.
-- Crea un movimiento por espacio involucrado (porción personal como gasto; porción de cada espacio
-- compartido como salida de ese espacio → espejo "aporte" en el personal del dueño) y marca las cuotas.
-- p_items: [{cargo_id, n, esperado, pagado, capital, interes}] ; p_extras: {cuota_manejo, mora, seguros, otros}
create or replace function pagar_factura_tc(p_tc uuid, p_fecha date, p_cuenta_pago uuid, p_items jsonb, p_extras jsonb default '{}'::jsonb, p_presupuesto_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); tc cuentas%rowtype; pers uuid; esp uuid; it jsonb; total numeric; extras numeric; m uuid; out jsonb := '[]'::jsonb; cat uuid; nombre_tc text; espacios_ids uuid[]; desc_items text;
begin
  select * into tc from cuentas where id = p_tc; if tc.id is null then raise exception 'Tarjeta no encontrada'; end if;
  if tc.espacio_id not in (select mis_espacios()) then raise exception 'Solo el dueño de la tarjeta paga su factura'; end if;
  pers := tc.espacio_id; nombre_tc := tc.nombre;
  extras := coalesce((p_extras->>'cuota_manejo')::numeric,0) + coalesce((p_extras->>'mora')::numeric,0) + coalesce((p_extras->>'seguros')::numeric,0) + coalesce((p_extras->>'otros')::numeric,0);
  select array_agg(distinct c.espacio_id) into espacios_ids from tc_cargos c where c.id in (select (x->>'cargo_id')::uuid from jsonb_array_elements(p_items) x);
  if espacios_ids is null then espacios_ids := array[]::uuid[]; end if;
  if not (pers = any(espacios_ids)) and extras > 0 then espacios_ids := espacios_ids || pers; end if;
  foreach esp in array espacios_ids loop
    select coalesce(sum((x->>'pagado')::numeric),0), string_agg(c.descripcion || ' ' || (x->>'n') || '/' || c.cuotas, ', ') into total, desc_items
      from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp;
    if esp = pers then total := total + extras; end if;
    if total <= 0 then continue; end if;
    select id into cat from categorias where espacio_id = esp and nombre = 'Pago tarjeta crédito' limit 1;
    insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, categoria_id, cuenta_id, tc_cuenta_id, presupuesto_id, origen, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
    values (esp, p_fecha, 'Salida', 'Pago factura ' || nombre_tc || coalesce(' · ' || desc_items, ''), total, cat, p_cuenta_pago, p_tc, case when esp = pers then p_presupuesto_id else null end, 'tarjeta',
            jsonb_build_object('items', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp),
                               'extras', case when esp = pers then p_extras else '{}'::jsonb end,
                               'capital', (select coalesce(sum((x->>'capital')::numeric),0) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp),
                               'interes', (select coalesce(sum((x->>'interes')::numeric),0) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp),
                               'esperado', (select coalesce(sum((x->>'esperado')::numeric),0) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp),
                               'diferencia', (select coalesce(sum((x->>'pagado')::numeric - (x->>'esperado')::numeric),0) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp)),
            u, u, now(), now())
    returning id into m;
    insert into cuotas_pagadas(espacio_id, cargo_id, numero, fecha_pago, monto_esperado, monto_pagado, movimiento_id, creado_por, actualizado_por, creado_en, actualizado_en)
    select esp, (x->>'cargo_id')::uuid, (x->>'n')::int, p_fecha, (x->>'esperado')::numeric, (x->>'pagado')::numeric, m, u, u, now(), now()
    from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp;
    out := out || jsonb_build_object('espacio_id', esp, 'movimiento_id', m, 'monto', total);
  end loop;
  return out;
end $$;

-- Pago de cuota de crédito (atómico): movimiento en el espacio de la deuda + cuota pagada
create or replace function pagar_cuota_credito(p_deuda uuid, p_numero int, p_fecha date, p_cuenta uuid, p_capital numeric, p_interes numeric, p_extras jsonb default '{}'::jsonb, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); d deudas%rowtype; total numeric; extras numeric; m uuid; cat uuid;
begin
  select * into d from deudas where id = p_deuda and espacio_id in (select mis_espacios()); if d.id is null then raise exception 'Crédito no encontrado'; end if;
  extras := coalesce((p_extras->>'cuota_manejo')::numeric,0) + coalesce((p_extras->>'mora')::numeric,0) + coalesce((p_extras->>'seguros')::numeric,0) + coalesce((p_extras->>'otros')::numeric,0);
  total := p_capital + p_interes + extras;
  select id into cat from categorias where espacio_id = d.espacio_id and nombre = 'Cuota crédito' limit 1;
  insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, categoria_id, cuenta_id, activo_id, deuda_id, origen, motivo, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
  values (d.espacio_id, p_fecha, 'Salida', d.nombre || ' — cuota ' || p_numero || '/' || d.total_cuotas, total, cat, coalesce(p_cuenta, d.cuenta_pago_id), d.activo_id, d.id, 'credito', p_motivo,
          jsonb_build_object('cuota', p_numero, 'capital', p_capital, 'interes', p_interes, 'esperado', p_capital + p_interes, 'diferencia', extras) || p_extras, u, u, now(), now())
  returning id into m;
  insert into cuotas_pagadas(espacio_id, deuda_id, numero, fecha_pago, monto_esperado, monto_pagado, movimiento_id, creado_por, actualizado_por, creado_en, actualizado_en)
  values (d.espacio_id, d.id, p_numero, p_fecha, p_capital + p_interes, total, m, u, u, now(), now());
  return m;
end $$;

-- Las RPC viejas de hogar dejan de existir
drop function if exists crear_hogar(text, text) cascade;
drop function if exists unirse_hogar(text, text) cascade;
drop function if exists mis_hogares() cascade;
drop function if exists es_dueño(uuid) cascade;

grant execute on function mis_espacios(), es_admin(uuid), espacio_tipo(uuid), asegurar_personal(text), cambiar_mi_nombre(text), crear_espacio(text,text,text), unirse_espacio(text,text), regenerar_codigo(uuid),
  habilitar_cuenta(uuid,uuid,boolean), mover_item(text,uuid,uuid), completar_programado(uuid,date,numeric,uuid,jsonb,text), deshacer_programado(uuid),
  pagar_factura_tc(uuid,date,uuid,jsonb,jsonb,uuid), pagar_cuota_credito(uuid,int,date,uuid,numeric,numeric,jsonb,text), categoria_en_uso(uuid) to authenticated;

-- Personal automático al registrarse (además la app llama asegurar_personal por si el trigger no corrió)
create or replace function _nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform _personal_de(new.id); return new; end $$;
drop trigger if exists akontapp_nuevo_usuario on auth.users;
create trigger akontapp_nuevo_usuario after insert on auth.users for each row execute function _nuevo_usuario();

-- ----------------------------------------------------------------------------
-- 8. MIGRACIÓN DE DATOS EXISTENTES (por entidad)
--    entidad tipo empresa  → espacio empresa (se crea, admin = dueño del hogar)
--    entidad persona cuyo nombre coincide con un miembro → personal de ese miembro
--    resto (Familia, personas sin cuenta) → se queda en el hogar
--    Se ejecuta una sola vez (marca en app_meta).
-- ----------------------------------------------------------------------------
do $$
declare h record; ent record; dest uuid; admin uuid; mem record; k record; mv movimientos%rowtype; t text; n_mov int;
begin
  if exists (select 1 from app_meta where clave = 'migracion_0002') then return; end if;

  -- personal para todos los miembros de hogares existentes
  for mem in select distinct m.user_id, m.nombre from espacio_miembros m loop perform _personal_de(mem.user_id, mem.nombre); end loop;

  for h in select * from espacios where tipo = 'hogar' loop
    select user_id into admin from espacio_miembros where espacio_id = h.id and rol = 'admin' order by unido_en limit 1;
    for ent in select * from entidades where espacio_id = h.id loop
      dest := null;
      if ent.tipo = 'empresa' then
        select id into dest from espacios where tipo = 'empresa' and lower(nombre) = lower(ent.nombre) and id in (select espacio_id from espacio_miembros where user_id = admin);
        if dest is null then
          insert into espacios(tipo, nombre, codigo_invitacion, creado_por) values ('empresa', ent.nombre, upper(substr(encode(gen_random_bytes(6),'hex'),1,8)), admin) returning id into dest;
          insert into espacio_miembros(espacio_id, user_id, rol, nombre) select dest, admin, 'admin', nombre from espacio_miembros where espacio_id = h.id and user_id = admin;
          perform _sembrar_categorias(dest, 'empresa');
        end if;
      elsif ent.tipo = 'persona' then
        select _personal_de(m.user_id) into dest from espacio_miembros m where m.espacio_id = h.id and lower(trim(m.nombre)) = lower(trim(ent.nombre)) limit 1;
      end if;
      if dest is null then continue; end if; -- se queda en el hogar

      -- categorías equivalentes y traslado por tabla
      update activos      set espacio_id = dest where espacio_id = h.id and entidad_id = ent.id;
      update deudas       set espacio_id = dest where espacio_id = h.id and entidad_id = ent.id;
      for k in select * from cuentas where espacio_id = h.id and entidad_id = ent.id loop
        if exists (select 1 from cuentas x where x.espacio_id = dest and lower(x.nombre) = lower(k.nombre)) then
          -- choque de nombre: si la de destino es la sembrada "Efectivo" sin uso, se elimina; si no, se renombra la que llega
          if not exists (select 1 from movimientos where cuenta_id in (select id from cuentas x where x.espacio_id = dest and lower(x.nombre) = lower(k.nombre)))
             and not exists (select 1 from tc_cargos where cuenta_id in (select id from cuentas x where x.espacio_id = dest and lower(x.nombre) = lower(k.nombre))) then
            delete from cuentas x where x.espacio_id = dest and lower(x.nombre) = lower(k.nombre);
          else
            update cuentas set nombre = k.nombre || ' (' || h.nombre || ')' where id = k.id;
          end if;
        end if;
        update cuentas set espacio_id = dest where id = k.id;
      end loop;
      update presupuesto  set espacio_id = dest, categoria_id = _categoria_equivalente(categoria_id, dest) where espacio_id = h.id and entidad_id = ent.id;
      update programado   set espacio_id = dest, categoria_id = _categoria_equivalente(categoria_id, dest) where espacio_id = h.id and entidad_id = ent.id;
      update tc_cargos    set espacio_id = dest, categoria_id = _categoria_equivalente(categoria_id, dest) where espacio_id = h.id and entidad_id = ent.id;
      update movimientos  set espacio_id = dest, categoria_id = _categoria_equivalente(categoria_id, dest) where espacio_id = h.id and entidad_id = ent.id;
    end loop;
    -- cuotas pagadas y adjuntos siguen a su padre
    update cuotas_pagadas p set espacio_id = d.espacio_id from deudas d where p.deuda_id = d.id and p.espacio_id <> d.espacio_id;
    update cuotas_pagadas p set espacio_id = c.espacio_id from tc_cargos c where p.cargo_id = c.id and p.espacio_id <> c.espacio_id;
    update programado_adjuntos a set espacio_id = p.espacio_id from programado p where a.programado_id = p.id and a.espacio_id <> p.espacio_id;
    -- cuentas que quedaron en el hogar sin entidad persona: siguen siendo del hogar (cuentas propias del espacio)
    -- cuentas personales usadas en el hogar/empresa → habilitarlas allí
    insert into cuentas_espacio(cuenta_id, espacio_id)
    select distinct cu.id, x.espacio_id from cuentas cu join espacios e on e.id = cu.espacio_id and e.tipo = 'personal'
      join (select cuenta_id, espacio_id from movimientos union select cuenta_id, espacio_id from tc_cargos union select cuenta_pago_id, espacio_id from deudas union select cuenta_id, espacio_id from programado union select cuenta_id, espacio_id from presupuesto) x on x.cuenta_id = cu.id
      join espacios e2 on e2.id = x.espacio_id and e2.tipo <> 'personal'
    on conflict do nothing;
  end loop;

  -- Espejos para los movimientos históricos de espacios compartidos pagados con cuentas personales
  n_mov := 0;
  for mv in select * from movimientos m where m.espejo_de is null and espacio_tipo(m.espacio_id) <> 'personal' loop
    perform _sincronizar_espejos(mv); n_mov := n_mov + 1;
  end loop;
  -- pagador en movimientos existentes
  update movimientos set pagador_id = _dueno_cuenta(cuenta_id) where espejo_de is null and pagador_id is null;

  insert into app_meta(clave, valor) values ('migracion_0002', 'ok · movimientos compartidos procesados: ' || n_mov) on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
end $$;

update cuentas k set dueno_id = e.dueno_id from espacios e where e.id = k.espacio_id and e.tipo = 'personal' and k.dueno_id is distinct from e.dueno_id;

insert into app_meta(clave, valor) values ('schema_version', '2') on conflict (clave) do update set valor = '2', actualizado_en = now();

-- Vista de apoyo (actualizada)
drop view if exists v_presupuesto_ejecucion;
create view v_presupuesto_ejecucion as
select p.*, coalesce((select sum(m.monto) from movimientos m where m.presupuesto_id = p.id and m.tipo='Salida'),0) as ejecutado from presupuesto p;
