-- Prueba de la migración 0013 (compras de tarjeta sin tasa). Líneas ERROR esperadas: 0
\c fintest2
set client_min_messages = warning;
\i supabase/migrations/0013_compras_sin_tasa.sql
select count(*) as compras_con_tasa_0 from tc_cargos where coalesce(tasa_mensual, 0) <> 0;
select valor as schema_version_13 from app_meta where clave='schema_version';
