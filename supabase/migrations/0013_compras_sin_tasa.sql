-- ============================================================================
-- Akontapp · migración 0013 · compras de tarjeta sin tasa
-- Decisión del dueño: al registrar una compra no se conoce el interés; toda compra se amortiza como capital/n y el
-- banco cobra los intereses aparte (entran en la factura como `intereses`). Se ponen en 0 las tasas de compras
-- existentes para que su cuota deje de incluir interés (las cuotas ya pagadas no cambian). Idempotente.
-- ============================================================================
update tc_cargos set tasa_mensual = 0 where coalesce(tasa_mensual, 0) <> 0;
alter table tc_cargos alter column tasa_mensual set default 0;
insert into app_meta(clave, valor) values ('schema_version', '13') on conflict (clave) do update set valor = '13', actualizado_en = now();
