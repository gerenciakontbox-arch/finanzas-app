-- ============================================================================
-- Akontapp · migración 0004 · código de invitación sin pgcrypto
-- En Supabase, pgcrypto vive en el esquema "extensions"; las funciones fijan search_path = public
-- y no encuentran gen_random_bytes ("function gen_random_bytes(integer) does not exist" al crear
-- un espacio). Se reemplaza por un generador basado en md5 (core de Postgres).
-- Idempotente.
-- ============================================================================
create or replace function _codigo_invitacion()
returns text language sql volatile set search_path = public as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text || txid_current()::text), 1, 8))
$$;
alter table espacios alter column codigo_invitacion set default _codigo_invitacion();

create or replace function crear_espacio(p_tipo text, p_nombre text, p_nombre_miembro text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'No autenticado'; end if;
  if p_tipo not in ('hogar','empresa') then raise exception 'Tipo de espacio inválido'; end if;
  perform _personal_de(u, p_nombre_miembro);
  insert into espacios(tipo, nombre, codigo_invitacion, creado_por) values (p_tipo, p_nombre, _codigo_invitacion(), u) returning id into e;
  insert into espacio_miembros(espacio_id, user_id, rol, nombre) values (e, u, 'admin', p_nombre_miembro);
  update perfiles set espacio_activo = e, nombre = coalesce(nombre, p_nombre_miembro) where user_id = u;
  perform _sembrar_categorias(e, p_tipo);
  if p_tipo = 'empresa' then insert into cuentas(espacio_id, nombre, tipo) values (e, 'Caja ' || p_nombre, 'Efectivo'); end if;
  return e;
end $$;

create or replace function regenerar_codigo(p_espacio uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not es_admin(p_espacio) then raise exception 'Solo un administrador puede regenerar el código'; end if;
  c := _codigo_invitacion();
  update espacios set codigo_invitacion = c where id = p_espacio;
  return c;
end $$;

grant execute on function crear_espacio(text,text,text), regenerar_codigo(uuid) to authenticated;
insert into app_meta(clave, valor) values ('schema_version', '4') on conflict (clave) do update set valor = '4', actualizado_en = now();
