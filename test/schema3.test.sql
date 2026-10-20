-- Prueba de la migración 0003 (créditos, depreciación, presupuesto → programado).
-- Ejecutar DESPUÉS de schema2.test.sql (usa la base fintest2 que deja preparada):
--   psql -h /tmp -p 5499 -U postgres -q -f test/schema2.test.sql && psql -h /tmp -p 5499 -U postgres -q -f test/schema3.test.sql
-- Líneas ERROR esperadas: 4 (bloqueo de rubro programado ×2, cuota repetida, abono en crédito inexistente).
\c fintest2
set client_min_messages = warning;
\i /home/claude/finanzas-app/supabase/migrations/0003_creditos_plan.sql
\i /home/claude/finanzas-app/supabase/migrations/0004_codigo_invitacion.sql
grant all on all tables in schema public to authenticated;

\set a '11111111-1111-1111-1111-111111111111'
set role authenticated; set request.jwt.claim.sub = :'a';
select id as pa from espacios where tipo='personal' and dueno_id=:'a' \gset
select id as cta from cuentas where espacio_id=:'pa' and tipo<>'Tarjeta crédito' limit 1 \gset
select id as cat_arr from categorias where espacio_id=:'pa' and nombre='Arriendo' limit 1 \gset

\echo '=== Presupuesto → programado (ítem)'
insert into presupuesto(espacio_id, periodo, concepto, categoria_id, cuenta_id, monto, fecha_tentativa) values (:'pa', '2026-10-01', 'Arriendo bodega', :'cat_arr', :'cta', 1500000, '2026-10-05') returning id as r1 \gset
select programar_presupuesto(:'r1', 'Mensual', null) as o1 \gset
select estado as r1_estado_programado, programado_id is not null as r1_vinculado, periodicidad from presupuesto where id=:'r1';
select tipo as o1_tipo, vencimiento as o1_venc, presupuesto_id = :'r1' as o1_vinculado from programado where id=:'o1';
\echo '--- bloqueo: editar monto y borrar deben fallar'
update presupuesto set monto = 1 where id=:'r1';
delete from presupuesto where id=:'r1';
\echo '--- notas sí se editan'
update presupuesto set notas = 'ok' where id=:'r1';
select notas as r1_notas from presupuesto where id=:'r1';

\echo '--- pagar desde Programado: rubro Pagado, movimiento con presupuesto_id, siguiente mes creado y vinculado'
select completar_programado(:'o1', '2026-10-05', 1500000, :'cta') as m1 \gset
select estado as r1_pagado, fecha_efectiva, programado_id is null as r1_libre from presupuesto where id=:'r1';
select presupuesto_id = :'r1' as mov_vinculado from movimientos where id=:'m1';
select id as r2, periodo as r2_periodo, estado as r2_estado, auto_creado as r2_auto from presupuesto where programado_serie_id = (select serie_id from programado where id=:'o1') and periodo='2026-11-01' \gset
select :'r2_periodo' as r2_periodo, :'r2_estado' as r2_estado, :'r2_auto' as r2_auto;
select presupuesto_id = :'r2' as o2_vinculado, vencimiento as o2_venc from programado where serie_id = (select serie_id from programado where id=:'o1') and estado='Pendiente';

\echo '--- deshacer: rubro de octubre vuelve a Programado y el de noviembre (automático, sin ejecución) desaparece'
select deshacer_programado(:'o1');
select estado as r1_de_nuevo_programado, programado_id = :'o1' as r1_revinculado from presupuesto where id=:'r1';
select count(*) as r2_borrado_0 from presupuesto where id=:'r2';

\echo '--- presupuesto cargado por adelantado: si noviembre ya existe con el mismo concepto, se vincula en vez de crearse'
insert into presupuesto(espacio_id, periodo, concepto, categoria_id, cuenta_id, monto, fecha_tentativa) values (:'pa', '2026-11-01', 'arriendo bodega', :'cat_arr', :'cta', 1600000, '2026-11-05') returning id as r3 \gset
select completar_programado(:'o1', '2026-10-05', 1500000, :'cta') as m1b \gset
select estado as r3_programado, programado_id is not null as r3_vinculado, monto as r3_monto_propio from presupuesto where id=:'r3';
select count(*) as rubros_nov_1 from presupuesto where espacio_id=:'pa' and periodo='2026-11-01' and lower(concepto)='arriendo bodega';

\echo '--- omitir la de noviembre: rubro libre (Planificado) y diciembre creado automático'
select id as o2 from programado where presupuesto_id=:'r3' and estado='Pendiente' \gset
select omitir_programado(:'o2') as o3 \gset
select estado as r3_liberado, programado_id is null as r3_sin_vinculo from presupuesto where id=:'r3';
select periodo as dic_periodo, estado as dic_estado from presupuesto where programado_id=:'o3';

\echo '--- desprogramar diciembre: ocurrencia borrada, rubro Planificado'
select presupuesto_id as r4 from programado where id=:'o3' \gset
select desprogramar_presupuesto(:'r4');
select count(*) as o3_borrada_0 from programado where id=:'o3';
select estado as r4_planificado, programado_serie_id is null as r4_sin_serie from presupuesto where id=:'r4';

\echo '=== Créditos: seguro en cuota, cuota repetida, abono a capital'
insert into deudas(espacio_id, nombre, tipo, cuenta_pago_id, capital_inicial, tasa_mensual, total_cuotas, fecha_primera_cuota, sistema, seguro_mensual)
values (:'pa', 'Crédito prueba', 'Consumo', :'cta', 12000000, 1.5, 12, '2026-11-01', 'capital', 45000) returning id as d1 \gset
select pagar_cuota_credito(:'d1', 1, '2026-11-01', :'cta', 1000000, 180000, '{}'::jsonb, null, 45000) as mc \gset
select monto as mov_total_1225000, desglose->>'seguro' as seguro_45000 from movimientos where id=:'mc';
select capital, interes, seguro from cuotas_pagadas where deuda_id=:'d1' and numero=1;
\echo '--- cuota repetida debe fallar'
select pagar_cuota_credito(:'d1', 1, '2026-11-01', :'cta', 1000000, 180000, '{}'::jsonb, null, 45000);
\echo '--- abono a capital (modo plazo) registra movimiento y abono con despues_de_cuota = 1'
select abonar_capital(:'d1', '2026-11-15', 3000000, :'cta', 'plazo', 'Prima') as ma \gset
select monto as abono_3000000, desglose->>'abono' as es_abono from movimientos where id=:'ma';
select modo, despues_de_cuota as despues_1, motivo from abonos_capital where deuda_id=:'d1';
\echo '--- borrar el movimiento del abono elimina el abono'
delete from movimientos where id=:'ma';
select count(*) as abonos_0 from abonos_capital where deuda_id=:'d1';
\echo '--- abono sobre crédito inexistente debe fallar'
select abonar_capital(gen_random_uuid(), '2026-11-15', 1, :'cta', 'plazo');

\echo '=== Depreciación: restricciones'
insert into activos(espacio_id, nombre, tipo, valor_estimado, fecha_adquisicion, vida_util_meses, valor_residual, valor_base, fecha_base) values (:'pa', 'Portátil', 'Equipo', 4000000, '2025-01-15', 36, 400000, 4000000, '2025-01-15');
select vida_util_meses as portatil_36 from activos where nombre='Portátil';
\echo '--- inmueble con vida útil debe fallar'
insert into activos(espacio_id, nombre, tipo, valor_estimado, vida_util_meses) values (:'pa', 'Apto', 'Inmueble', 1, 60);
\echo '--- vida útil fuera de rango debe fallar'
insert into activos(espacio_id, nombre, tipo, valor_estimado, vida_util_meses) values (:'pa', 'Cosa', 'Equipo', 1, 12);

\echo '=== Código de invitación sin pgcrypto (crear espacio y regenerar código como usuario)'
select crear_espacio('empresa', 'Alma Beauty Studio', 'Carlos') as emp \gset
select length(codigo_invitacion) as cod_8, codigo_invitacion ~ '^[0-9A-F]{8}$' as cod_hex from espacios where id = :'emp';
select regenerar_codigo(:'emp') ~ '^[0-9A-F]{8}$' as regenerado_ok;
select valor as schema_version_4 from app_meta where clave='schema_version';
reset role;
