-- ============================================================================
-- Akontapp · migración 0006 · Lote 5: tratamiento de datos, perfil y señales
--
-- 1. consentimientos: autorización por finalidad (Ley 1581/2012, Decreto 1377/2013). La última fila
--    por (usuario, finalidad) es el estado vigente. Nunca se borran: son la prueba.
--      servicio  → prestar la app (obligatoria para usarla)
--      analitica → eventos de uso (pantallas y acciones) para mejorar la app
--      perfil    → calcular y mostrar al usuario su perfil financiero
--      comercial → usar el perfil para ofrecerle servicios de Kontbox (y, si acepta una oferta, contactarlo)
-- 2. eventos: navegación y acciones; sin contenido de formularios; poda a 90 días.
-- 3. perfil_usuario: indicadores calculados a diario (tarea de Netlify), con seudónimo (codigo).
-- 4. senales_def + ofertas: señales comerciales como hipótesis medibles; una oferta por usuario y señal.
-- 5. app_admins + accesos_operador: rol operador con vistas agregadas/seudonimizadas; la identificación
--    nominal exige finalidad comercial aceptada, oferta tocada y motivo, y queda registrada.
-- 6. Derechos del titular desde la app: consultar (mis_consentimientos, perfil), rectificar/oponerse
--    (registrar_consentimientos), suprimir (eliminar_mi_cuenta). Portabilidad: exportación en la app.
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CONSENTIMIENTOS
-- ----------------------------------------------------------------------------
create table if not exists consentimientos (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  finalidad text not null check (finalidad in ('servicio','analitica','perfil','comercial')),
  aceptado boolean not null,
  version text not null,                 -- versión de la política aceptada
  user_agent text,
  creado_en timestamptz not null default now()
);
create index if not exists consentimientos_user_idx on consentimientos(user_id, finalidad, creado_en desc);
alter table consentimientos enable row level security;
drop policy if exists consentimientos_ver on consentimientos;
create policy consentimientos_ver on consentimientos for select to authenticated using (user_id = auth.uid());
-- Se insertan solo por RPC; no se actualizan ni borran.
grant select on consentimientos to authenticated;
grant usage, select on sequence consentimientos_id_seq to authenticated;

insert into app_meta(clave, valor) values ('politica_version', '2026-10-20') on conflict (clave) do nothing;

-- Estado vigente de una finalidad para un usuario
create or replace function consiente(p_user uuid, p_finalidad text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select aceptado from consentimientos where user_id = p_user and finalidad = p_finalidad order by creado_en desc, id desc limit 1), false)
$$;

-- Registrar (o cambiar) autorizaciones: p = {"servicio":true,"analitica":true,"perfil":true,"comercial":false}
create or replace function registrar_consentimientos(p jsonb, p_version text, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); k text; v boolean;
begin
  if u is null then raise exception 'Sin sesión'; end if;
  for k, v in select key, (value)::boolean from jsonb_each_text(p) loop
    if k not in ('servicio','analitica','perfil','comercial') then raise exception 'Finalidad desconocida: %', k; end if;
    insert into consentimientos(user_id, finalidad, aceptado, version, user_agent) values (u, k, v, p_version, left(p_user_agent, 200));
  end loop;
  -- Al retirar 'perfil' o 'comercial' se borra lo derivado de inmediato
  if coalesce((p->>'perfil')::boolean, true) = false then delete from perfil_usuario where user_id = u; end if;
  if coalesce((p->>'comercial')::boolean, true) = false then delete from ofertas where user_id = u and estado in ('mostrada'); end if;
  if coalesce((p->>'analitica')::boolean, true) = false then delete from eventos where user_id = u; end if;
  return mis_consentimientos();
end $$;

create or replace function mis_consentimientos()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(finalidad, aceptado), '{}'::jsonb) from (
    select distinct on (finalidad) finalidad, aceptado from consentimientos where user_id = auth.uid() order by finalidad, creado_en desc, id desc
  ) s
$$;

-- ----------------------------------------------------------------------------
-- 2. EVENTOS DE USO
-- ----------------------------------------------------------------------------
create table if not exists eventos (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  espacio_id uuid,
  sesion text,
  tipo text not null,          -- 'sesion' | 'pantalla' | 'accion'
  pantalla text,
  props jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists eventos_user_fecha_idx on eventos(user_id, creado_en desc);
create index if not exists eventos_fecha_idx on eventos(creado_en);
alter table eventos enable row level security;
drop policy if exists eventos_insertar on eventos;
create policy eventos_insertar on eventos for insert to authenticated with check (user_id = auth.uid() and consiente(auth.uid(), 'analitica'));
-- Los usuarios no leen eventos; solo el operador por RPC agregada.
grant insert on eventos to authenticated;
grant usage, select on sequence eventos_id_seq to authenticated;

create or replace function podar_eventos(p_dias int default 90)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from eventos where creado_en < now() - make_interval(days => p_dias); get diagnostics n = row_count; return n;
end $$;

-- ----------------------------------------------------------------------------
-- 3. PERFIL DEL USUARIO
-- ----------------------------------------------------------------------------
create table if not exists perfil_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  codigo text not null unique,                 -- seudónimo para el operador
  indicadores jsonb not null default '{}'::jsonb,
  senales text[] not null default '{}',
  version int not null default 1,
  calculado_en timestamptz not null default now()
);
alter table perfil_usuario enable row level security;
drop policy if exists perfil_ver on perfil_usuario;
create policy perfil_ver on perfil_usuario for select to authenticated using (user_id = auth.uid() and consiente(auth.uid(), 'perfil'));
grant select on perfil_usuario to authenticated;

create or replace function _codigo_perfil()
returns text language sql volatile as $$ select 'U-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)) $$;

-- ----------------------------------------------------------------------------
-- 4. SEÑALES (hipótesis) Y OFERTAS
-- ----------------------------------------------------------------------------
create table if not exists senales_def (
  codigo text primary key,
  nombre text not null,
  descripcion text not null,            -- en lenguaje del usuario: por qué se le muestra
  servicio text not null,               -- qué ofrece Kontbox
  hipotesis boolean not null default true,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table senales_def enable row level security;
drop policy if exists senales_ver on senales_def;
create policy senales_ver on senales_def for select to authenticated using (true);
grant select on senales_def to authenticated;

insert into senales_def(codigo, nombre, descripcion, servicio) values
 ('honorarios_sin_empresa', 'Honorarios recurrentes sin empresa', 'Recibes honorarios con regularidad y no tienes un espacio de empresa.', 'Formalización, facturación electrónica y planeación tributaria para independientes'),
 ('empresa_activa', 'Empresa con tesorería activa', 'Manejas la tesorería de una empresa en la app.', 'Contabilidad y cumplimiento (DIAN, nómina) con outsourcing'),
 ('creditos_multiples', 'Varios créditos activos', 'Tienes dos o más créditos activos.', 'Reestructuración y optimización de deuda'),
 ('presupuesto_desbordado', 'Presupuesto desbordado', 'Tu ejecución superó el 110 % del presupuesto tres meses seguidos.', 'Acompañamiento en presupuesto y flujo de caja'),
 ('activos_sin_cobertura', 'Activos sin seguro registrado', 'Tienes vehículos o inmuebles sin un seguro programado.', 'Revisión de coberturas y provisiones')
on conflict (codigo) do nothing;

create table if not exists ofertas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  senal text not null references senales_def(codigo) on delete cascade,
  estado text not null default 'mostrada' check (estado in ('mostrada','tocada','aceptada','rechazada','convertida')),
  resultado text,                        -- lo anota el operador: 'venta' | 'sin_venta' | nota
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (user_id, senal)
);
alter table ofertas enable row level security;
drop policy if exists ofertas_ver on ofertas; drop policy if exists ofertas_responder on ofertas;
create policy ofertas_ver on ofertas for select to authenticated using (user_id = auth.uid());
create policy ofertas_responder on ofertas for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and estado in ('tocada','aceptada','rechazada'));
grant select, update on ofertas to authenticated;

-- ----------------------------------------------------------------------------
-- 5. OPERADOR
-- ----------------------------------------------------------------------------
create table if not exists app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  creado_en timestamptz not null default now()
);
alter table app_admins enable row level security;
drop policy if exists app_admins_ver on app_admins;
create policy app_admins_ver on app_admins for select to authenticated using (user_id = auth.uid());
grant select on app_admins to authenticated;

create table if not exists accesos_operador (
  id bigserial primary key,
  admin_id uuid not null references auth.users(id) on delete cascade,
  accion text not null,
  perfil_codigo text,
  motivo text,
  creado_en timestamptz not null default now()
);
alter table accesos_operador enable row level security;   -- sin políticas: solo por RPC

create or replace function es_app_admin()
returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from app_admins where user_id = auth.uid()) $$;

-- Resumen agregado y anónimo (no requiere finalidad por usuario: no hay datos personales en la salida)
create or replace function operador_resumen()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not es_app_admin() then raise exception 'Solo el operador'; end if;
  insert into accesos_operador(admin_id, accion) values (auth.uid(), 'resumen');
  select jsonb_build_object(
    'usuarios', (select count(*) from auth.users),
    'activos_7d', (select count(distinct user_id) from eventos where creado_en > now() - interval '7 days'),
    'activos_30d', (select count(distinct user_id) from eventos where creado_en > now() - interval '30 days'),
    'consentimientos', (select coalesce(jsonb_object_agg(f, n), '{}'::jsonb) from (select finalidad f, count(*) n from (select distinct on (user_id, finalidad) user_id, finalidad, aceptado from consentimientos order by user_id, finalidad, creado_en desc, id desc) s where aceptado group by finalidad) t),
    'espacios', (select coalesce(jsonb_object_agg(tipo, n), '{}'::jsonb) from (select tipo, count(*) n from espacios group by tipo) t),
    'perfiles', (select count(*) from perfil_usuario),
    'senales', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) from (select unnest(senales) s, count(*) n from perfil_usuario group by 1) t),
    'ofertas', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) from (select estado, count(*) n from ofertas group by estado) t),
    'pantallas_30d', (select coalesce(jsonb_object_agg(p, n), '{}'::jsonb) from (select pantalla p, count(*) n from eventos where tipo='pantalla' and creado_en > now() - interval '30 days' group by pantalla) t)
  ) into r;
  return r;
end $$;

-- Perfiles seudonimizados: solo usuarios con finalidad 'comercial' vigente (es la finalidad que habilita este uso)
create or replace function operador_perfiles()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not es_app_admin() then raise exception 'Solo el operador'; end if;
  insert into accesos_operador(admin_id, accion) values (auth.uid(), 'perfiles');
  select coalesce(jsonb_agg(jsonb_build_object('codigo', p.codigo, 'indicadores', p.indicadores, 'senales', p.senales, 'calculado_en', p.calculado_en,
           'ofertas', (select coalesce(jsonb_agg(jsonb_build_object('senal', o.senal, 'estado', o.estado, 'resultado', o.resultado, 'actualizado_en', o.actualizado_en)), '[]'::jsonb) from ofertas o where o.user_id = p.user_id))
         order by p.calculado_en desc), '[]'::jsonb)
  into r from perfil_usuario p where consiente(p.user_id, 'comercial');
  return r;
end $$;

-- Identificación nominal: solo si el usuario aceptó 'comercial' y respondió a una oferta (tocada/aceptada); exige motivo y queda registrada
create or replace function operador_identificar(p_codigo text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p perfil_usuario%rowtype; e text; n text;
begin
  if not es_app_admin() then raise exception 'Solo el operador'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la consulta'; end if;
  select * into p from perfil_usuario where codigo = p_codigo; if p.user_id is null then raise exception 'Perfil no encontrado'; end if;
  if not consiente(p.user_id, 'comercial') then raise exception 'El titular no autorizó la finalidad comercial'; end if;
  if not exists (select 1 from ofertas where user_id = p.user_id and estado in ('tocada','aceptada','convertida')) then raise exception 'El titular aún no ha respondido a ninguna oferta; no procede el contacto'; end if;
  insert into accesos_operador(admin_id, accion, perfil_codigo, motivo) values (auth.uid(), 'identificar', p_codigo, p_motivo);
  select u.email into e from auth.users u where u.id = p.user_id;
  select nombre into n from perfiles where user_id = p.user_id;
  return jsonb_build_object('codigo', p_codigo, 'email', e, 'nombre', n);
end $$;

-- El operador anota el resultado de una oferta (para medir la señal)
create or replace function operador_resultado(p_codigo text, p_senal text, p_resultado text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not es_app_admin() then raise exception 'Solo el operador'; end if;
  select user_id into uid from perfil_usuario where codigo = p_codigo; if uid is null then raise exception 'Perfil no encontrado'; end if;
  update ofertas set resultado = p_resultado, estado = case when p_resultado = 'venta' then 'convertida' else estado end, actualizado_en = now() where user_id = uid and senal = p_senal;
  insert into accesos_operador(admin_id, accion, perfil_codigo, motivo) values (auth.uid(), 'resultado', p_codigo, p_senal || ': ' || p_resultado);
end $$;

-- ----------------------------------------------------------------------------
-- 6. SUPRESIÓN: eliminar mi cuenta
-- ----------------------------------------------------------------------------
-- Borra el espacio personal (y todo lo que contiene), las membresías, los espacios compartidos que
-- quedarían sin miembros, y el usuario de autenticación. Los consentimientos se conservan sin usuario
-- (se desligan antes de borrar) como prueba del tratamiento: Ley 1581 art. 9 y Decreto 1377 art. 8.
create table if not exists consentimientos_archivo (like consentimientos including defaults);
alter table consentimientos_archivo enable row level security;   -- sin políticas

create or replace function eliminar_mi_cuenta()
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); e record;
begin
  if u is null then raise exception 'Sin sesión'; end if;
  insert into consentimientos_archivo select * from consentimientos where user_id = u;
  delete from espacios where tipo = 'personal' and dueno_id = u;
  delete from espacio_miembros where user_id = u;
  for e in select s.id from espacios s where s.tipo <> 'personal' and not exists (select 1 from espacio_miembros m where m.espacio_id = s.id) loop
    delete from espacios where id = e.id;
  end loop;
  delete from auth.users where id = u;
end $$;

grant execute on function consiente(uuid,text), registrar_consentimientos(jsonb,text,text), mis_consentimientos(), es_app_admin(), operador_resumen(), operador_perfiles(),
  operador_identificar(text,text), operador_resultado(text,text,text), eliminar_mi_cuenta() to authenticated;
revoke execute on function podar_eventos(int) from public, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function podar_eventos(int), consiente(uuid,text) to service_role; end if; end $$;

insert into app_meta(clave, valor) values ('schema_version', '6') on conflict (clave) do update set valor = '6', actualizado_en = now();
