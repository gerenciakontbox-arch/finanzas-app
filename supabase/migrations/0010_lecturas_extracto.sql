-- ============================================================================
-- Akontapp · migración 0010 · lecturas de extracto en segundo plano
-- Netlify corta las funciones normales a los 10 s; leer un extracto tarda más. La app crea una fila
-- "pendiente", una función de fondo procesa el archivo (en memoria) y escribe aquí el RESULTADO (compras y
-- totales, sin datos personales); la app lo consulta y borra la fila. Nunca se guarda el archivo. Idempotente.
-- ============================================================================
create table if not exists tc_lecturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cuenta_id uuid references cuentas(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente','lista','error')),
  resultado jsonb,
  error text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists tc_lecturas_user_idx on tc_lecturas(user_id, creado_en desc);
alter table tc_lecturas enable row level security;
drop policy if exists tc_lecturas_propias on tc_lecturas;
create policy tc_lecturas_propias on tc_lecturas for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and estado = 'pendiente');
grant all on tc_lecturas to authenticated;

-- Limpieza: resultados de más de un día (los llama perfil-diario)
create or replace function podar_lecturas()
returns int language plpgsql security definer set search_path = public as $$
declare n int; begin delete from tc_lecturas where creado_en < now() - interval '1 day'; get diagnostics n = row_count; return n; end $$;
revoke execute on function podar_lecturas() from public, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function podar_lecturas() to service_role; end if; end $$;

insert into app_meta(clave, valor) values ('schema_version', '10') on conflict (clave) do update set valor = '10', actualizado_en = now();
