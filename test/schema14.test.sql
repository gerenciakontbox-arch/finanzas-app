-- Prueba de la migración 0014 (cambiar cuenta de un movimiento con registro). Líneas ERROR esperadas: 5
--   sin motivo · misma cuenta · tarjeta como cuenta de pago · cuenta de otro espacio no habilitada · reflejo
\c fintest2
set client_min_messages = warning;
\i supabase/migrations/0014_cambio_cuenta.sql
grant all on all tables in schema public to authenticated;
\set a '11111111-1111-1111-1111-111111111111'
\set e '22222222-2222-2222-2222-222222222222'
reset role;
select id as pa from espacios where tipo='personal' and dueno_id=:'a' \gset
select id as pe from espacios where tipo='personal' and dueno_id=:'e' \gset
select id as hogar from espacios where tipo='hogar' limit 1 \gset
select id as tcid from cuentas where espacio_id=:'pa' and tipo='Tarjeta crédito' limit 1 \gset
select id as c1 from cuentas where espacio_id=:'pa' and tipo<>'Tarjeta crédito' order by nombre limit 1 \gset
insert into cuentas(espacio_id, nombre, tipo) values (:'pa', 'Nequi Andrés', 'Billetera digital') returning id as c2 \gset
insert into cuentas(espacio_id, nombre, tipo) values (:'pe', 'Cuenta esposa', 'Bancaria') returning id as ce \gset
set role authenticated; set request.jwt.claim.sub = :'a';
insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, cuenta_id) values (:'pa', '2026-10-29', 'Salida', 'Pago factura CMR', 461179, :'c1') returning id as mv \gset
\echo '--- sin motivo: debe fallar'
select cambiar_cuenta_movimiento(:'mv', :'c2', '');
\echo '--- misma cuenta: debe fallar'
select cambiar_cuenta_movimiento(:'mv', :'c1', 'x');
\echo '--- tarjeta como cuenta de pago: debe fallar'
select cambiar_cuenta_movimiento(:'mv', :'tcid', 'x');
\echo '--- cuenta de otro espacio no habilitada: debe fallar'
select cambiar_cuenta_movimiento(:'mv', :'ce', 'x');
\echo '--- cambio válido: queda registrado y el movimiento apunta a la nueva cuenta'
select cambiar_cuenta_movimiento(:'mv', :'c2', 'Me equivoqué de cuenta al pagar la factura') as cc \gset
select cuenta_id = :'c2'::uuid as cuenta_nueva from movimientos where id = :'mv';
select cuenta_antes = :'c1'::uuid as antes_ok, cuenta_despues = :'c2'::uuid as despues_ok, motivo, monto from cambios_cuenta where id = :'cc';
\echo '--- el usuario no puede borrar ni editar el registro'
delete from cambios_cuenta where id = :'cc';
select count(*) as registro_sigue_1 from cambios_cuenta where id = :'cc';
\echo '--- en el hogar: pagar con cuenta personal crea reflejo; cambiar la cuenta al reflejo debe fallar; cambiar en el hogar mueve el aporte'
reset role; insert into cuentas_espacio(cuenta_id, espacio_id) values (:'c1', :'hogar'), (:'c2', :'hogar') on conflict do nothing;
set role authenticated; set request.jwt.claim.sub = :'a';
insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, cuenta_id) values (:'hogar', '2026-10-29', 'Salida', 'Mercado', 300000, :'c1') returning id as mh \gset
select id as esp from movimientos where espejo_de = :'mh' \gset
select cambiar_cuenta_movimiento(:'esp', :'c2', 'x');
select cambiar_cuenta_movimiento(:'mh', :'c2', 'Pagué con Nequi');
select cuenta_id = :'c2'::uuid as reflejo_actualizado from movimientos where espejo_de = :'mh';
reset role;
select count(*) as cambios_andres_2 from cambios_cuenta where user_id = :'a';
select valor as schema_version_14 from app_meta where clave='schema_version';
