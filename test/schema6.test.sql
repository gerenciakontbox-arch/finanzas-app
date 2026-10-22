-- Prueba de la migración 0006 (consentimientos, eventos, perfil, señales, operador, supresión).
-- Ejecutar después de schema2 y schema3:
--   psql ... -f test/schema2.test.sql && psql ... -f test/schema3.test.sql && psql ... -f test/schema6.test.sql
-- Líneas ERROR esperadas: 5 (evento sin autorización, operador sin rol ×2, identificar sin oferta, identificar sin comercial).
\c fintest2
set client_min_messages = warning;
\i supabase/migrations/0006_perfil.sql
\i supabase/migrations/0007_import_movimientos.sql
\i supabase/migrations/0008_saldos_apertura.sql
grant all on all tables in schema public to authenticated;

\set a '11111111-1111-1111-1111-111111111111'
\set e '22222222-2222-2222-2222-222222222222'
\set f '33333333-3333-3333-3333-333333333333'
set role authenticated; set request.jwt.claim.sub = :'a';

\echo '=== Consentimientos'
select mis_consentimientos() as sin_consentimientos_vacio;
select registrar_consentimientos('{"servicio":true,"analitica":true,"perfil":true,"comercial":false}'::jsonb, '2026-10-20', 'test') as andres;
select consiente(:'a','servicio') as servicio_t, consiente(:'a','comercial') as comercial_f;
\echo '--- Esposa sin analítica: su evento es rechazado por RLS'
set request.jwt.claim.sub = :'e';
select registrar_consentimientos('{"servicio":true,"analitica":false,"perfil":false,"comercial":false}'::jsonb, '2026-10-20');
insert into eventos(user_id, tipo, pantalla) values (:'e', 'pantalla', 'dashboard');
set request.jwt.claim.sub = :'a';
insert into eventos(user_id, tipo, pantalla) values (:'a', 'pantalla', 'dashboard');
insert into eventos(user_id, tipo, pantalla, props) values (:'a', 'accion', 'movimientos', '{"tabla":"movimientos"}');
select count(*) as eventos_visibles_para_usuario_0 from eventos;

\echo '=== Perfil: lo escribe el servicio (service role); el usuario lo ve solo con finalidad perfil'
reset role;
insert into perfil_usuario(user_id, codigo, indicadores, senales) values (:'a', _codigo_perfil(), '{"salud":72}', '{creditos_multiples}'), (:'e', _codigo_perfil(), '{"salud":50}', '{}');
set role authenticated; set request.jwt.claim.sub = :'a';
select indicadores->>'salud' as andres_ve_72 from perfil_usuario;
set request.jwt.claim.sub = :'e';
select count(*) as esposa_sin_finalidad_ve_0 from perfil_usuario;

\echo '=== Operador'
set request.jwt.claim.sub = :'a';
\echo '--- sin rol: debe fallar'
select operador_resumen();
select operador_perfiles();
reset role; insert into app_admins(user_id, nombre) values (:'f', 'Operador') on conflict do nothing;
set role authenticated; set request.jwt.claim.sub = :'f';
select (operador_resumen()->>'usuarios')::int >= 3 as resumen_ok, operador_resumen()->'senales' as senales_agregadas;
select jsonb_array_length(operador_perfiles()) as perfiles_comerciales_0;
\echo '--- Andrés acepta comercial: aparece seudonimizado; identificar sin oferta respondida debe fallar'
set request.jwt.claim.sub = :'a';
select registrar_consentimientos('{"comercial":true}'::jsonb, '2026-10-20');
set request.jwt.claim.sub = :'f';
select jsonb_array_length(operador_perfiles()) as perfiles_comerciales_1, operador_perfiles()->0->>'codigo' like 'U-%' as seudonimo;
select operador_perfiles()->0->>'codigo' as cod \gset
select operador_identificar(:'cod', 'prueba');
\echo '--- el usuario toca la oferta → ahora sí se identifica y queda registrado'
reset role; insert into ofertas(user_id, senal) values (:'a', 'creditos_multiples');
set role authenticated; set request.jwt.claim.sub = :'a';
update ofertas set estado = 'tocada' where user_id = :'a';
set request.jwt.claim.sub = :'f';
select operador_identificar(:'cod', 'Seguimiento a oferta tocada')->>'email' as email_andres;
select operador_resultado(:'cod', 'creditos_multiples', 'venta');
reset role;
select accion, perfil_codigo is not null as con_codigo from accesos_operador order by id;
select estado as oferta_convertida from ofertas where user_id = :'a';
\echo '--- Esposa sin comercial: identificar debe fallar aunque sea operador'
reset role; select codigo as code from perfil_usuario where user_id = :'e' \gset
set role authenticated; set request.jwt.claim.sub = :'f';
select operador_identificar(:'code', 'x');

\echo '=== Retirar perfil borra lo derivado; retirar analítica borra eventos'
set request.jwt.claim.sub = :'a';
select registrar_consentimientos('{"perfil":false,"analitica":false}'::jsonb, '2026-10-20');
reset role;
select count(*) as perfil_andres_0 from perfil_usuario where user_id = :'a';
select count(*) as eventos_andres_0 from eventos where user_id = :'a';
select count(*) as consentimientos_conservados from consentimientos where user_id = :'a';

\echo '=== Supresión: Amigo elimina su cuenta'
set role authenticated; set request.jwt.claim.sub = :'f';
select registrar_consentimientos('{"servicio":true}'::jsonb, '2026-10-20');
select eliminar_mi_cuenta();
reset role;
select count(*) as amigo_users_0 from auth.users where id = :'f';
select count(*) as amigo_espacios_0 from espacios where dueno_id = :'f';
select count(*) as amigo_consentimientos_archivados from consentimientos_archivo where user_id = :'f';
select valor as schema_version_8 from app_meta where clave='schema_version';
