-- ============================================================================
-- Akontapp · migración 0005 · suscripciones a avisos push (Web Push)
-- Cada dispositivo guarda su suscripción; una tarea diaria en Netlify (avisos-diarios) la usa para
-- avisar los vencimientos de Programado. Idempotente.
-- ============================================================================
create table if not exists push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  creado_en timestamptz not null default now()
);
create index if not exists push_suscripciones_user_idx on push_suscripciones(user_id);
alter table push_suscripciones enable row level security;
drop policy if exists push_propias on push_suscripciones;
create policy push_propias on push_suscripciones for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on push_suscripciones to authenticated;

insert into app_meta(clave, valor) values ('schema_version', '5') on conflict (clave) do update set valor = '5', actualizado_en = now();
