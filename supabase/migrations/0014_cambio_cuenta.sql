-- ============================================================================
-- Akontapp · migración 0014 · cambiar la cuenta de un movimiento ya registrado, con registro interno
-- El usuario pagó desde la cuenta equivocada (p. ej. la factura de la tarjeta sin revisar el medio de pago).
-- RPC cambiar_cuenta_movimiento: valida (propio, no espejo, cuenta disponible en el espacio), exige motivo, cambia
-- la cuenta (los triggers existentes recalculan pagador y reflejos) y deja fila en cambios_cuenta. Esa tabla alimenta
-- el indicador cambios_cuenta_30d y la señal 'cambios_cuenta_frecuentes' (uso confuso de la app) en _perfil.mjs.
-- Finalidad: servicio (registro) y perfil (indicador). Idempotente.
-- ============================================================================
create table if not exists cambios_cuenta (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios(id) on delete cascade,
  movimiento_id uuid references movimientos(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  cuenta_antes uuid, cuenta_despues uuid,
  descripcion text, monto numeric(14,2), fecha date,
  motivo text not null,
  creado_en timestamptz not null default now()
);
create index if not exists cambios_cuenta_user_idx on cambios_cuenta(user_id, creado_en desc);
create index if not exists cambios_cuenta_mov_idx on cambios_cuenta(movimiento_id);
alter table cambios_cuenta enable row level security;
drop policy if exists cambios_cuenta_ver on cambios_cuenta;
create policy cambios_cuenta_ver on cambios_cuenta for select to authenticated using (espacio_id in (select mis_espacios()));
-- nadie inserta/edita/borra directo: solo la RPC (security definer)
grant select on cambios_cuenta to authenticated;

create or replace function cambiar_cuenta_movimiento(p_id uuid, p_cuenta uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); m movimientos%rowtype; c cuentas%rowtype; r uuid;
begin
  select * into m from movimientos where id = p_id and espacio_id in (select mis_espacios()); if m.id is null then raise exception 'Movimiento no encontrado'; end if;
  if m.espejo_de is not null then raise exception 'Este movimiento es un reflejo: cámbialo desde el espacio donde se registró'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica por qué cambias la cuenta'; end if;
  if p_cuenta is null or p_cuenta = m.cuenta_id then raise exception 'Elige una cuenta distinta a la actual'; end if;
  select * into c from cuentas where id = p_cuenta; if c.id is null then raise exception 'Cuenta no encontrada'; end if;
  if c.tipo = 'Tarjeta crédito' then raise exception 'Una tarjeta de crédito no es una cuenta de pago'; end if;
  if not (c.espacio_id = m.espacio_id or exists (select 1 from cuentas_espacio ce where ce.cuenta_id = c.id and ce.espacio_id = m.espacio_id)) then raise exception 'Esa cuenta no está habilitada en este espacio'; end if;
  if m.tipo = 'Transferencia' and m.subtipo = 'traslado' and m.cuenta_destino_id = p_cuenta then raise exception 'La cuenta de origen no puede ser la misma de destino'; end if;
  insert into cambios_cuenta(espacio_id, movimiento_id, user_id, cuenta_antes, cuenta_despues, descripcion, monto, fecha, motivo)
  values (m.espacio_id, m.id, u, m.cuenta_id, p_cuenta, m.descripcion, m.monto, m.fecha, trim(p_motivo)) returning id into r;
  update movimientos set cuenta_id = p_cuenta, actualizado_por = u, actualizado_en = now() where id = m.id;   -- triggers: pagador_id y reflejos se recalculan
  return r;
end $$;
grant execute on function cambiar_cuenta_movimiento(uuid,uuid,text) to authenticated;

insert into senales_def(codigo, nombre, descripcion, servicio) values
 ('cambios_cuenta_frecuentes', 'Cambios frecuentes de cuenta', 'Corregiste la cuenta de pago de tres o más movimientos en los últimos 30 días.', 'Acompañamiento en el uso de la app (medios de pago y espacios)')
on conflict (codigo) do nothing;

insert into app_meta(clave, valor) values ('schema_version', '14') on conflict (clave) do update set valor = '14', actualizado_en = now();
