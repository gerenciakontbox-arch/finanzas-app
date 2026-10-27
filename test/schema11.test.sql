-- Prueba de la migración 0011 (pago real de cuota, saldo real según extracto, etiquetas).
-- Ejecutar después de schema6. Líneas ERROR esperadas: 7
--   pago parcial sin motivo · "otros" sin detalle · concepto negativo · ajuste sin motivo · ajuste saldo negativo
--   · etiqueta duplicada en el espacio · etiqueta con nombre vacío
\c fintest2
set client_min_messages = warning;
\i supabase/migrations/0011_pagos_reales_etiquetas.sql
grant all on all tables in schema public to authenticated;

\set a '11111111-1111-1111-1111-111111111111'
reset role;
select id as pa from espacios where tipo='personal' and dueno_id=:'a' \gset
select id as cta from cuentas where espacio_id=:'pa' and tipo<>'Tarjeta crédito' limit 1 \gset
select id as hogar from espacios where tipo='hogar' limit 1 \gset
set role authenticated; set request.jwt.claim.sub = :'a';

\echo '=== Crédito de prueba (12 cuotas, sin pagos)'
insert into deudas(espacio_id, nombre, tipo, capital_inicial, tasa_mensual, total_cuotas, fecha_primera_cuota, cuenta_pago_id) values (:'pa', 'Libre inversión', 'Consumo', 12000000, 1.5, 12, '2026-01-15', :'cta') returning id as d11 \gset

\echo '--- pagar menos que la cuota sin motivo: debe fallar'
select pagar_cuota_credito(:'d11', 1, '2026-01-15', :'cta', 920000, 180000, '{"parcial": -100000}'::jsonb, null, 0);
\echo '--- "otros" sin detalle: debe fallar'
select pagar_cuota_credito(:'d11', 1, '2026-01-15', :'cta', 920000, 180000, '{"otros": 5000}'::jsonb, null, 0);
\echo '--- concepto negativo: debe fallar'
select pagar_cuota_credito(:'d11', 1, '2026-01-15', :'cta', 920000, 180000, '{"mora": -5000}'::jsonb, null, 0);
\echo '--- pago con mora y otros detallado: un solo movimiento por el total real'
select pagar_cuota_credito(:'d11', 1, '2026-01-15', :'cta', 920000, 180000, '{"mora": 12000, "otros": 3000, "otros_detalle": "Comisión por canal"}'::jsonb, null, 0) as mov1 \gset
select monto as pagado_1115000, desglose->>'diferencia' as diferencia_15000, desglose->>'otros_detalle' as detalle from movimientos where id = :'mov1';
\echo '--- pago parcial con motivo: queda registrado por lo que salió de caja'
select pagar_cuota_credito(:'d11', 2, '2026-02-15', :'cta', 930000, 170000, '{"parcial": -200000}'::jsonb, 'Acuerdo con el banco: resto la próxima semana', 0) as mov2 \gset
select monto as pagado_900000, motivo from movimientos where id = :'mov2';
select count(*) as movimientos_del_credito_2 from movimientos where deuda_id = :'d11';

\echo '=== Saldo real según extracto'
\echo '--- sin motivo: debe fallar'
select ajustar_saldo_deuda(:'d11', '2026-02-20', 10500000, 10150000, '');
\echo '--- negativo: debe fallar'
select ajustar_saldo_deuda(:'d11', '2026-02-20', -1, 10150000, 'x');
select ajustar_saldo_deuda(:'d11', '2026-02-20', 10500000, 10150000, 'Saldo según extracto de febrero') as aj1 \gset
select despues_de_cuota as tras_cuota_2, diferencia as dif_350000, motivo from ajustes_saldo_deuda where id = :'aj1';
\echo '--- segundo ajuste en el mismo punto reemplaza al anterior (un ajuste por punto de la tabla)'
select ajustar_saldo_deuda(:'d11', '2026-02-25', 10480000, 10150000, 'Corrección del extracto');
select count(*) as ajustes_1, max(saldo_real) as saldo_10480000 from ajustes_saldo_deuda where deuda_id = :'d11';
\echo '--- no hay movimiento de caja por el ajuste'
select count(*) as movimientos_siguen_2 from movimientos where deuda_id = :'d11';

\echo '=== Etiquetas'
insert into etiquetas(espacio_id, nombre, color) values (:'pa', 'Mateo', '#138A5B') returning id as et1 \gset
insert into etiquetas(espacio_id, nombre) values (:'pa', 'Familia') returning id as et2 \gset
\echo '--- duplicada (ignora mayúsculas y espacios): debe fallar'
insert into etiquetas(espacio_id, nombre) values (:'pa', ' mateo ');
\echo '--- nombre vacío: debe fallar'
insert into etiquetas(espacio_id, nombre) values (:'pa', '  ');
\echo '--- movimiento con etiquetas: se deduplican y se descartan las inexistentes'
insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, cuenta_id, etiqueta_ids) values (:'pa', '2026-03-01', 'Salida', 'Uniforme', 90000, :'cta', array[:'et1'::uuid, :'et1'::uuid, '00000000-0000-0000-0000-000000000000'::uuid]) returning id as mv_et \gset
select array_length(etiqueta_ids, 1) as una_etiqueta, etiqueta_ids[1] = :'et1'::uuid as es_mateo from movimientos where id = :'mv_et';
\echo '--- el movimiento de un programado hereda sus etiquetas'
insert into programado(espacio_id, flujo, tipo, nombre, monto, periodicidad, vencimiento, cuenta_id, etiqueta_ids) values (:'pa', 'salida', 'Otro', 'Clases de natación', 120000, 'Mensual', '2026-03-05', :'cta', array[:'et1'::uuid]) returning id as prog_et \gset
select completar_programado(:'prog_et', '2026-03-05', 120000, :'cta') as mv_prog \gset
select etiqueta_ids[1] = :'et1'::uuid as heredo_mateo from movimientos where id = :'mv_prog';
\echo '--- mover un rubro con etiqueta al hogar: la etiqueta se crea allá por nombre'
insert into presupuesto(espacio_id, periodo, concepto, monto, etiqueta_ids) values (:'pa', '2026-03-01', 'Colegio', 800000, array[:'et1'::uuid]) returning id as pre_et \gset
select mover_item('presupuesto', :'pre_et', :'hogar');
select e.nombre as etiqueta_en_hogar, e.espacio_id = :'hogar'::uuid as espacio_hogar from presupuesto p join etiquetas e on e.id = p.etiqueta_ids[1] where p.id = :'pre_et';
\echo '--- borrar la etiqueta la retira de los ítems'
delete from etiquetas where id = :'et1';
select array_length(etiqueta_ids, 1) is null as movimiento_sin_etiquetas from movimientos where id = :'mv_et';
reset role;
select valor as schema_version_11 from app_meta where clave='schema_version';
