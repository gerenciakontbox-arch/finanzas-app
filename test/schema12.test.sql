-- Prueba de la migración 0012 (intereses corrientes como concepto de la factura de tarjeta). Líneas ERROR esperadas: 0
\c fintest2
set client_min_messages = warning;
\i supabase/migrations/0012_intereses_factura.sql
\set a '11111111-1111-1111-1111-111111111111'
reset role;
select id as pa from espacios where tipo='personal' and dueno_id=:'a' \gset
select id as tcid from cuentas where espacio_id=:'pa' and tipo='Tarjeta crédito' limit 1 \gset
select id as caja from cuentas where espacio_id=:'pa' and tipo<>'Tarjeta crédito' limit 1 \gset
set role authenticated; set request.jwt.claim.sub = :'a';
\echo '=== Compra del extracto: capital/n sin tasa; factura con intereses aparte'
insert into tc_cargos(espacio_id, cuenta_id, fecha, descripcion, monto, cuotas, cuotas_previas, tasa_mensual, primera_cuota, ref_extracto) values (:'pa', :'tcid', '2026-06-20', 'ADIDAS OUTLET', 500000, 6, 3, 0, '2026-07-14', '2026-06-20|500000|adidasoutlet') returning id as adidas \gset
select pagar_factura_tc(:'tcid', '2026-10-30', :'caja', jsonb_build_array(jsonb_build_object('cargo_id', :'adidas', 'n', 4, 'capital', 83333, 'interes', 0, 'esperado', 83333, 'pagado', 83333)), '{"intereses": 68712, "cuota_manejo": 31990, "seguros": 4990, "mora": 1739}'::jsonb) as r \gset
select monto as total_190764, desglose->'extras'->>'intereses' as intereses_68712, desglose->>'capital' as capital_83333 from movimientos where id = ((:'r'::jsonb)->0->>'movimiento_id')::uuid;
select numero as cuota_4 from cuotas_pagadas where cargo_id = :'adidas';
reset role;
select valor as schema_version_12 from app_meta where clave='schema_version';
