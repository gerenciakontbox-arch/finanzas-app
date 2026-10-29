-- Prueba de la migración 0015 (borrar el pago libera las cuotas). Líneas ERROR esperadas: 0
\c fintest2
set client_min_messages = warning;
\set a '11111111-1111-1111-1111-111111111111'
reset role;
select id as pa from espacios where tipo='personal' and dueno_id=:'a' \gset
select id as tcid from cuentas where espacio_id=:'pa' and tipo='Tarjeta crédito' limit 1 \gset
select id as caja from cuentas where espacio_id=:'pa' and tipo<>'Tarjeta crédito' order by nombre limit 1 \gset
-- cuota huérfana de un borrado anterior (antes de 0015): debe desaparecer con la migración
select id as adidas from tc_cargos where descripcion='ADIDAS OUTLET' \gset
insert into cuotas_pagadas(espacio_id, cargo_id, numero, fecha_pago, monto_esperado, monto_pagado, movimiento_id) values (:'pa', :'adidas', 5, '2026-11-30', 83333, 83333, null);
\i supabase/migrations/0015_borrar_pago_libera_cuotas.sql
select count(*) as huerfanas_0 from cuotas_pagadas where cargo_id is not null and movimiento_id is null;
set role authenticated; set request.jwt.claim.sub = :'a';
\echo '=== Factura de tarjeta: borrar el movimiento deja la cuota pendiente de nuevo'
select pagar_factura_tc(:'tcid', '2026-11-30', :'caja', jsonb_build_array(jsonb_build_object('cargo_id', :'adidas', 'n', 5, 'capital', 83333, 'interes', 0, 'esperado', 83333, 'pagado', 83333)), '{}'::jsonb) as r \gset
select count(*) as cuota5_pagada_1 from cuotas_pagadas where cargo_id = :'adidas' and numero = 5;
delete from movimientos where id = ((:'r'::jsonb)->0->>'movimiento_id')::uuid;
select count(*) as cuota5_liberada_0 from cuotas_pagadas where cargo_id = :'adidas' and numero = 5;
\echo '=== Cuota de crédito: igual'
select id as d11 from deudas where nombre='Libre inversión' \gset
select pagar_cuota_credito(:'d11', 3, '2026-03-15', :'caja', 940000, 160000, '{}'::jsonb, null, 0) as m3 \gset
delete from movimientos where id = :'m3';
select count(*) as cuota3_liberada_0 from cuotas_pagadas where deuda_id = :'d11' and numero = 3;
reset role;
select valor as schema_version_15 from app_meta where clave='schema_version';
