-- ============================================================================
-- Finanzas Integradas — Esquema inicial (multi-hogar, multi-miembro)
-- Ejecutar en Supabase: SQL Editor → New query → pegar → Run
-- Idempotente: se puede volver a correr sin romper nada.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. HOGARES Y MIEMBROS (tenant + usuarios)
-- ----------------------------------------------------------------------------
create table if not exists hogares (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  codigo_invitacion text not null unique default upper(substr(encode(gen_random_bytes(6),'hex'),1,8)),
  moneda            text not null default 'COP',
  creado_por        uuid references auth.users(id) on delete set null,
  creado_en         timestamptz not null default now()
);

create table if not exists miembros (
  hogar_id   uuid not null references hogares(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  rol        text not null default 'miembro' check (rol in ('dueño','miembro')),
  nombre     text not null,
  unido_en   timestamptz not null default now(),
  primary key (hogar_id, user_id)
);
create index if not exists miembros_user_idx on miembros(user_id);

-- Perfil mínimo por usuario (nombre para mostrar, hogar activo)
create table if not exists perfiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  nombre         text,
  hogar_activo   uuid references hogares(id) on delete set null,
  creado_en      timestamptz not null default now()
);

-- Función de seguridad: hogares a los que pertenece el usuario autenticado.
-- SECURITY DEFINER evita recursión de RLS sobre "miembros".
create or replace function mis_hogares()
returns setof uuid language sql stable security definer set search_path = public as $$
  select hogar_id from miembros where user_id = auth.uid()
$$;

create or replace function es_dueño(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from miembros where hogar_id = h and user_id = auth.uid() and rol = 'dueño')
$$;

-- ----------------------------------------------------------------------------
-- 2. AUDITORÍA (quién creó / modificó cada fila) + BITÁCORA
-- ----------------------------------------------------------------------------
create or replace function set_auditoria()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := coalesce(new.creado_por, auth.uid());
    new.creado_en  := coalesce(new.creado_en, now());
  end if;
  new.actualizado_por := auth.uid();
  new.actualizado_en  := now();
  return new;
end $$;

create table if not exists bitacora (
  id          bigint generated always as identity primary key,
  hogar_id    uuid not null,
  tabla       text not null,
  registro_id uuid not null,
  accion      text not null check (accion in ('INSERT','UPDATE','DELETE')),
  user_id     uuid,
  fecha       timestamptz not null default now(),
  antes       jsonb,
  despues     jsonb
);
create index if not exists bitacora_hogar_fecha_idx on bitacora(hogar_id, fecha desc);
create index if not exists bitacora_registro_idx on bitacora(tabla, registro_id);

create or replace function registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
declare h uuid; rid uuid;
begin
  if tg_op = 'DELETE' then h := old.hogar_id; rid := old.id; else h := new.hogar_id; rid := new.id; end if;
  insert into bitacora(hogar_id, tabla, registro_id, accion, user_id, antes, despues)
  values (h, tg_table_name, rid, tg_op, auth.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Macro para aplicar triggers + RLS a cada tabla de dominio
create or replace function _aplicar_estandar(t text)
returns void language plpgsql as $$
begin
  execute format('drop trigger if exists %I_auditoria on %I', t, t);
  execute format('create trigger %I_auditoria before insert or update on %I for each row execute function set_auditoria()', t, t);
  execute format('drop trigger if exists %I_bitacora on %I', t, t);
  execute format('create trigger %I_bitacora after insert or update or delete on %I for each row execute function registrar_bitacora()', t, t);
  execute format('alter table %I enable row level security', t);
  execute format('drop policy if exists %I_hogar on %I', t, t);
  execute format('create policy %I_hogar on %I for all to authenticated using (hogar_id in (select mis_hogares())) with check (hogar_id in (select mis_hogares()))', t, t);
end $$;

-- ----------------------------------------------------------------------------
-- 3. TABLAS MAESTRAS
-- ----------------------------------------------------------------------------
create table if not exists entidades (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'persona' check (tipo in ('persona','empresa','grupo')),
  activo boolean not null default true,
  orden int not null default 0,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz,
  unique (hogar_id, nombre)
);

create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  nombre text not null,
  grupo text not null default 'Variable' check (grupo in ('Fijo','Variable','Provisión','Amortización crédito','Depreciación activo')),
  afecta_caja boolean not null default true,
  activo boolean not null default true,
  orden int not null default 0,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz,
  unique (hogar_id, nombre)
);

create table if not exists cuentas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('Bancaria','Billetera digital','Efectivo','Tarjeta crédito','Otro')),
  entidad_id uuid references entidades(id) on delete set null,
  -- solo tarjetas de crédito:
  cupo numeric(14,2),
  tasa_mensual numeric(6,3),
  banco text,
  ultimos4 text check (ultimos4 is null or ultimos4 ~ '^\d{4}$'),
  dia_corte int check (dia_corte is null or dia_corte between 1 and 31),
  dia_pago  int check (dia_pago  is null or dia_pago  between 1 and 31),
  activo boolean not null default true,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz,
  unique (hogar_id, nombre)
);

create table if not exists activos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'Otro' check (tipo in ('Inmueble','Vehículo','Moto','Equipo','Otro')),
  entidad_id uuid references entidades(id) on delete set null,
  identificador text,
  valor_estimado numeric(14,2) not null default 0,
  fecha_adquisicion date,
  notas text,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);

-- ----------------------------------------------------------------------------
-- 4. PRESUPUESTO
-- ----------------------------------------------------------------------------
create table if not exists presupuesto (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  periodo date not null default date_trunc('month', current_date)::date, -- 1° del mes
  concepto text not null,
  entidad_id uuid references entidades(id) on delete set null,
  categoria_id uuid references categorias(id) on delete set null,
  activo_id uuid references activos(id) on delete set null,
  cuenta_id uuid references cuentas(id) on delete set null,
  monto numeric(14,2) not null check (monto >= 0),
  fecha_tentativa date,
  fecha_efectiva date,
  estado text not null default 'Planificado' check (estado in ('Planificado','Programado','Pagado','Cancelado')),
  notas text,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);
create index if not exists presupuesto_hogar_periodo_idx on presupuesto(hogar_id, periodo);

-- ----------------------------------------------------------------------------
-- 5. DEUDAS (créditos) y TARJETAS (cargos)
-- ----------------------------------------------------------------------------
create table if not exists deudas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('Hipotecario','Vehicular','Consumo','Microcrédito','Otro')),
  entidad_id uuid references entidades(id) on delete set null,
  activo_id uuid references activos(id) on delete set null,
  cuenta_pago_id uuid references cuentas(id) on delete set null,
  capital_inicial numeric(14,2) not null check (capital_inicial > 0),
  tasa_mensual numeric(6,3) not null default 0,
  total_cuotas int not null check (total_cuotas > 0),
  fecha_primera_cuota date not null,
  estado text not null default 'Activo' check (estado in ('Activo','Cancelado')),
  notas text,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);

-- Compras hechas con una cuenta tipo "Tarjeta crédito"
create table if not exists tc_cargos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  cuenta_id uuid not null references cuentas(id) on delete cascade, -- la tarjeta
  fecha date not null,
  descripcion text not null,
  monto numeric(14,2) not null check (monto > 0),
  cuotas int not null check (cuotas >= 1),
  tasa_mensual numeric(6,3) not null default 0,
  categoria_id uuid references categorias(id) on delete set null,
  entidad_id uuid references entidades(id) on delete set null,
  activo_id uuid references activos(id) on delete set null,
  primera_cuota date not null,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);
create index if not exists tc_cargos_cuenta_idx on tc_cargos(cuenta_id);

-- Cuotas pagadas: de un crédito (deuda_id) o de una compra TC (cargo_id)
create table if not exists cuotas_pagadas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  deuda_id uuid references deudas(id) on delete cascade,
  cargo_id uuid references tc_cargos(id) on delete cascade,
  numero int not null check (numero >= 1),
  fecha_pago date not null,
  monto_esperado numeric(14,2),
  monto_pagado numeric(14,2),
  movimiento_id uuid, -- se enlaza abajo (FK diferida porque movimientos aún no existe)
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz,
  check ((deuda_id is not null)::int + (cargo_id is not null)::int = 1),
  unique (deuda_id, numero),
  unique (cargo_id, numero)
);

-- ----------------------------------------------------------------------------
-- 6. PROGRAMADO (obligaciones e INGRESOS recurrentes) — R1 + R2
-- ----------------------------------------------------------------------------
-- Modelo tipo Planner: cada ocurrencia es una fila. Al completarla ("pagar"/"cobrar")
-- se marca completada y la app crea la siguiente con la misma serie_id.
create table if not exists programado (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  serie_id uuid not null default gen_random_uuid(),       -- agrupa las ocurrencias de una recurrencia
  flujo text not null check (flujo in ('salida','ingreso')),
  tipo text not null default 'Otro' check (tipo in ('Impuesto','Seguro','Mantenimiento','Cuota crédito','Servicio','Suscripción','Nómina','Honorarios','Arriendo','Otro')),
  nombre text not null,
  entidad_id uuid references entidades(id) on delete set null,
  categoria_id uuid references categorias(id) on delete set null,
  activo_id uuid references activos(id) on delete set null,
  cuenta_id uuid references cuentas(id) on delete set null,
  deuda_id uuid references deudas(id) on delete set null,
  monto numeric(14,2) not null check (monto >= 0),
  periodicidad text not null default 'Mensual' check (periodicidad in ('Semanal','Quincenal','Mensual','Bimestral','Trimestral','Semestral','Anual','Puntual')),
  vencimiento date not null,
  estado text not null default 'Pendiente' check (estado in ('Pendiente','Completado','Omitido','Pausado')),
  completado_en date,
  movimiento_id uuid,
  -- Ficha de pago (insumo para pagar rápido). NUNCA guardar contraseñas aquí.
  ficha_url text,
  ficha_usuario text,
  ficha_referencia text,
  ficha_instrucciones text,
  ficha_valores jsonb not null default '{}'::jsonb,       -- pares etiqueta/valor libres (NIT, convenio, número de contrato…)
  notas text,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);
create index if not exists programado_hogar_venc_idx on programado(hogar_id, estado, vencimiento);
create index if not exists programado_serie_idx on programado(serie_id);

-- Adjuntos (imágenes/PDF) de una ficha de pago → Supabase Storage, bucket "adjuntos"
create table if not exists programado_adjuntos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  programado_id uuid not null references programado(id) on delete cascade,
  ruta text not null,          -- hogar_id/programado_id/archivo.ext dentro del bucket
  nombre text not null,
  mime text,
  bytes int,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);

-- ----------------------------------------------------------------------------
-- 7. MOVIMIENTOS (lo único que mueve caja)
-- ----------------------------------------------------------------------------
create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references hogares(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('Ingreso','Salida')),
  descripcion text not null,
  monto numeric(14,2) not null check (monto > 0),
  entidad_id uuid references entidades(id) on delete set null,
  categoria_id uuid references categorias(id) on delete set null,
  cuenta_id uuid references cuentas(id) on delete set null,
  activo_id uuid references activos(id) on delete set null,
  presupuesto_id uuid references presupuesto(id) on delete set null,
  programado_id uuid references programado(id) on delete set null,
  -- pagos de crédito / factura TC
  deuda_id uuid references deudas(id) on delete set null,
  tc_cuenta_id uuid references cuentas(id) on delete set null,
  desglose jsonb not null default '{}'::jsonb,  -- {capital, interes, cuota_manejo, mora, seguros, otros, diferencia, items:[...]}
  origen text not null default 'manual' check (origen in ('manual','programado','credito','tarjeta','importacion','bot')),
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz
);
create index if not exists movimientos_hogar_fecha_idx on movimientos(hogar_id, fecha desc);

alter table cuotas_pagadas drop constraint if exists cuotas_pagadas_movimiento_fk;
alter table cuotas_pagadas add constraint cuotas_pagadas_movimiento_fk foreign key (movimiento_id) references movimientos(id) on delete set null;
alter table programado drop constraint if exists programado_movimiento_fk;
alter table programado add constraint programado_movimiento_fk foreign key (movimiento_id) references movimientos(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 8. APLICAR AUDITORÍA + BITÁCORA + RLS A TODAS LAS TABLAS DE DOMINIO
-- ----------------------------------------------------------------------------
select _aplicar_estandar(t) from unnest(array[
  'entidades','categorias','cuentas','activos','presupuesto','deudas','tc_cargos',
  'cuotas_pagadas','programado','programado_adjuntos','movimientos'
]) as t;

-- Bitácora: solo lectura para miembros del hogar
alter table bitacora enable row level security;
drop policy if exists bitacora_lectura on bitacora;
create policy bitacora_lectura on bitacora for select to authenticated using (hogar_id in (select mis_hogares()));

-- Hogares / miembros / perfiles
alter table hogares enable row level security;
drop policy if exists hogares_miembros on hogares;
create policy hogares_miembros on hogares for select to authenticated using (id in (select mis_hogares()));
drop policy if exists hogares_dueño_edita on hogares;
create policy hogares_dueño_edita on hogares for update to authenticated using (es_dueño(id)) with check (es_dueño(id));
drop policy if exists hogares_dueño_borra on hogares;
create policy hogares_dueño_borra on hogares for delete to authenticated using (es_dueño(id));

alter table miembros enable row level security;
drop policy if exists miembros_ver on miembros;
create policy miembros_ver on miembros for select to authenticated using (hogar_id in (select mis_hogares()));
drop policy if exists miembros_dueño_gestiona on miembros;
create policy miembros_dueño_gestiona on miembros for delete to authenticated using (es_dueño(hogar_id) and user_id <> auth.uid());
drop policy if exists miembros_salir on miembros;
create policy miembros_salir on miembros for delete to authenticated using (user_id = auth.uid() and rol <> 'dueño');
-- INSERT solo a través de las funciones crear_hogar / unirse_hogar (security definer)

alter table perfiles enable row level security;
drop policy if exists perfiles_propio on perfiles;
create policy perfiles_propio on perfiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 9. FUNCIONES DE NEGOCIO (RPC)
-- ----------------------------------------------------------------------------
-- Crear hogar: el creador queda como dueño, se siembran maestros por defecto.
create or replace function crear_hogar(p_nombre text, p_nombre_miembro text)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'No autenticado'; end if;
  insert into hogares(nombre, creado_por) values (p_nombre, u) returning id into h;
  insert into miembros(hogar_id, user_id, rol, nombre) values (h, u, 'dueño', p_nombre_miembro);
  insert into perfiles(user_id, nombre, hogar_activo) values (u, p_nombre_miembro, h)
    on conflict (user_id) do update set hogar_activo = excluded.hogar_activo, nombre = coalesce(perfiles.nombre, excluded.nombre);
  -- maestros por defecto
  insert into entidades(hogar_id, nombre, tipo, orden) values (h, p_nombre_miembro, 'persona', 0), (h, 'Familia', 'grupo', 1);
  insert into categorias(hogar_id, nombre, grupo, orden) values
    (h,'Arriendo','Fijo',1),(h,'Servicios públicos','Fijo',2),(h,'Internet','Fijo',3),(h,'Seguro salud','Fijo',4),
    (h,'Mercado','Variable',5),(h,'Transporte','Variable',6),(h,'Restaurantes','Variable',7),(h,'Entretenimiento','Variable',8),
    (h,'Ropa','Variable',9),(h,'Salud','Variable',10),(h,'Educación','Fijo',11),(h,'Impuesto renta','Provisión',12),
    (h,'Impuesto vehicular','Provisión',13),(h,'Predial','Provisión',14),(h,'Mantenimiento','Provisión',15),(h,'Seguro','Provisión',16),
    (h,'Cuota crédito','Amortización crédito',17),(h,'Pago tarjeta crédito','Amortización crédito',18),
    (h,'Nómina','Fijo',19),(h,'Honorarios','Variable',20),(h,'Otro','Variable',99);
  insert into cuentas(hogar_id, nombre, tipo) values (h, 'Efectivo', 'Efectivo');
  return h;
end $$;

-- Unirse a un hogar con código de invitación
create or replace function unirse_hogar(p_codigo text, p_nombre_miembro text)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'No autenticado'; end if;
  select id into h from hogares where codigo_invitacion = upper(trim(p_codigo));
  if h is null then raise exception 'Código de invitación inválido'; end if;
  insert into miembros(hogar_id, user_id, rol, nombre) values (h, u, 'miembro', p_nombre_miembro)
    on conflict (hogar_id, user_id) do nothing;
  insert into perfiles(user_id, nombre, hogar_activo) values (u, p_nombre_miembro, h)
    on conflict (user_id) do update set hogar_activo = excluded.hogar_activo;
  insert into entidades(hogar_id, nombre, tipo, orden) values (h, p_nombre_miembro, 'persona', 0) on conflict do nothing;
  return h;
end $$;

-- Regenerar código de invitación (solo dueño)
create or replace function regenerar_codigo(p_hogar uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not es_dueño(p_hogar) then raise exception 'Solo el dueño puede regenerar el código'; end if;
  c := upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
  update hogares set codigo_invitacion = c where id = p_hogar;
  return c;
end $$;

-- Completar un programado ("pagar" o "cobrar"): crea el movimiento, cierra la ocurrencia
-- y genera la siguiente según periodicidad. Todo en una transacción.
create or replace function completar_programado(p_id uuid, p_fecha date, p_monto numeric, p_cuenta_id uuid, p_desglose jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare r programado%rowtype; m uuid; sig date; u uuid := auth.uid();
begin
  select * into r from programado where id = p_id and hogar_id in (select mis_hogares());
  if r.id is null then raise exception 'Programado no encontrado'; end if;
  if r.estado <> 'Pendiente' then raise exception 'Esta ocurrencia ya fue completada'; end if;

  insert into movimientos(hogar_id, fecha, tipo, descripcion, monto, entidad_id, categoria_id, cuenta_id, activo_id, programado_id, deuda_id, desglose, origen, creado_por, actualizado_por, creado_en, actualizado_en)
  values (r.hogar_id, p_fecha, case when r.flujo='ingreso' then 'Ingreso' else 'Salida' end, r.nombre, p_monto,
          r.entidad_id, r.categoria_id, coalesce(p_cuenta_id, r.cuenta_id), r.activo_id, r.id, r.deuda_id, p_desglose, 'programado', u, u, now(), now())
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
    insert into programado(hogar_id, serie_id, flujo, tipo, nombre, entidad_id, categoria_id, activo_id, cuenta_id, deuda_id, monto, periodicidad, vencimiento, estado,
                           ficha_url, ficha_usuario, ficha_referencia, ficha_instrucciones, ficha_valores, notas, creado_por, actualizado_por, creado_en, actualizado_en)
    values (r.hogar_id, r.serie_id, r.flujo, r.tipo, r.nombre, r.entidad_id, r.categoria_id, r.activo_id, r.cuenta_id, r.deuda_id, r.monto, r.periodicidad, sig, 'Pendiente',
            r.ficha_url, r.ficha_usuario, r.ficha_referencia, r.ficha_instrucciones, r.ficha_valores, r.notas, u, u, now(), now());
    -- los adjuntos se copian por referencia (misma ruta en Storage)
    insert into programado_adjuntos(hogar_id, programado_id, ruta, nombre, mime, bytes, creado_por, actualizado_por, creado_en, actualizado_en)
    select r.hogar_id, (select id from programado where serie_id = r.serie_id and vencimiento = sig and estado='Pendiente' limit 1), ruta, nombre, mime, bytes, u, u, now(), now()
    from programado_adjuntos where programado_id = r.id;
  end if;
  return m;
end $$;

-- Deshacer la última ocurrencia completada de una serie (borra el movimiento y la siguiente pendiente)
create or replace function deshacer_programado(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r programado%rowtype;
begin
  select * into r from programado where id = p_id and hogar_id in (select mis_hogares());
  if r.id is null or r.estado <> 'Completado' then raise exception 'No hay nada que deshacer'; end if;
  delete from programado where serie_id = r.serie_id and estado = 'Pendiente' and vencimiento > r.vencimiento;
  delete from movimientos where id = r.movimiento_id;
  update programado set estado='Pendiente', completado_en=null, movimiento_id=null where id = p_id;
end $$;

-- ----------------------------------------------------------------------------
-- 10. STORAGE: bucket privado de adjuntos, acceso por hogar
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos','adjuntos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

drop policy if exists adjuntos_hogar_select on storage.objects;
create policy adjuntos_hogar_select on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1]::uuid in (select mis_hogares()));
drop policy if exists adjuntos_hogar_insert on storage.objects;
create policy adjuntos_hogar_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1]::uuid in (select mis_hogares()));
drop policy if exists adjuntos_hogar_delete on storage.objects;
create policy adjuntos_hogar_delete on storage.objects for delete to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1]::uuid in (select mis_hogares()));

-- ----------------------------------------------------------------------------
-- 11. VISTAS DE APOYO
-- ----------------------------------------------------------------------------
create or replace view v_presupuesto_ejecucion as
select p.*,
       coalesce((select sum(m.monto) from movimientos m where m.presupuesto_id = p.id and m.tipo='Salida'),0) as ejecutado
from presupuesto p;

-- Permisos de ejecución de RPC
grant execute on function crear_hogar(text,text), unirse_hogar(text,text), regenerar_codigo(uuid),
  completar_programado(uuid,date,numeric,uuid,jsonb), deshacer_programado(uuid), mis_hogares(), es_dueño(uuid) to authenticated;
