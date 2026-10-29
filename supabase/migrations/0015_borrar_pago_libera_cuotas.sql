-- ============================================================================
-- Akontapp · migración 0015 · borrar el movimiento de un pago libera las cuotas que pagó
-- Antes, al borrar el movimiento de una factura de tarjeta o de una cuota de crédito, la FK dejaba las cuotas en
-- cuotas_pagadas con movimiento_id = null: seguían "pagadas" sin dinero detrás y la próxima factura no volvía a su
-- valor. Ahora un trigger borra esas cuotas con el movimiento (los abonos ya lo hacían desde 0003).
-- También limpia las cuotas de tarjeta huérfanas que dejaron borrados anteriores (solo pagar_factura_tc las crea y
-- siempre con movimiento). Idempotente.
-- ============================================================================
create or replace function _cuotas_sin_movimiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from cuotas_pagadas where movimiento_id = old.id;
  return old;
end $$;
drop trigger if exists movimientos_cuotas_borradas on movimientos;
create trigger movimientos_cuotas_borradas before delete on movimientos for each row when (old.deuda_id is not null or old.tc_cuenta_id is not null) execute function _cuotas_sin_movimiento();

delete from cuotas_pagadas where cargo_id is not null and movimiento_id is null;

insert into app_meta(clave, valor) values ('schema_version', '15') on conflict (clave) do update set valor = '15', actualizado_en = now();
