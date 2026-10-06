-- Simulación mínima del entorno Supabase
drop database if exists fintest; create database fintest;
\c fintest
create extension if not exists pgcrypto;
create schema if not exists auth; create schema if not exists storage;
create table auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
grant usage on schema public, storage, auth to authenticated;
grant execute on function auth.uid() to authenticated;
alter table storage.objects enable row level security;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
grant all on storage.objects to authenticated;

-- Usuarios de prueba
insert into auth.users values ('11111111-1111-1111-1111-111111111111','andres@test.co'),
                              ('22222222-2222-2222-2222-222222222222','esposa@test.co'),
                              ('33333333-3333-3333-3333-333333333333','amigo@test.co');

\i /home/claude/finanzas-app/supabase/migrations/0001_schema.sql
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

-- ===== PRUEBAS =====
\echo '--- Andrés crea su hogar'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select crear_hogar('Casa Quijano','Andrés') as hogar_a \gset
select count(*) as categorias_sembradas from categorias;
select codigo_invitacion from hogares \gset
insert into movimientos(hogar_id,fecha,tipo,descripcion,monto,origen) values (:'hogar_a', current_date,'Salida','Mercado',120000,'manual');
insert into programado(hogar_id,flujo,tipo,nombre,monto,periodicidad,vencimiento) values (:'hogar_a','ingreso','Honorarios','Honorarios Kontbox',6000000,'Mensual',current_date) returning id as prog_a \gset
insert into programado(hogar_id,flujo,tipo,nombre,monto,periodicidad,vencimiento,ficha_url,ficha_usuario,ficha_referencia) values (:'hogar_a','salida','Servicio','Internet Claro',85000,'Mensual',current_date+3,'https://claro.com.co/pagos','andres@mail','Contrato 123') returning id as prog_b \gset

\echo '--- Esposa se une con el código y ve lo mismo'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select unirse_hogar(:'codigo_invitacion','Esposa') = :'hogar_a' as se_unio_al_mismo_hogar;
select count(*) as movimientos_visibles_esposa from movimientos;
insert into movimientos(hogar_id,fecha,tipo,descripcion,monto,origen) values (:'hogar_a', current_date,'Salida','Farmacia',45000,'manual');
select descripcion, (creado_por = '22222222-2222-2222-2222-222222222222') as creado_por_esposa from movimientos where descripcion='Farmacia';

\echo '--- Esposa COBRA el ingreso programado → movimiento + siguiente ocurrencia'
select completar_programado(:'prog_a', current_date, 6000000, null) as mov_ingreso \gset
select tipo, monto, origen from movimientos where id = :'mov_ingreso';
select estado, vencimiento from programado where serie_id = (select serie_id from programado where id=:'prog_a') order by vencimiento;

\echo '--- Pago de Internet con ficha; la siguiente ocurrencia hereda la ficha'
select completar_programado(:'prog_b', current_date+3, 85000, null) as mov_internet \gset
select nombre, estado, vencimiento, ficha_url, ficha_referencia from programado where serie_id=(select serie_id from programado where id=:'prog_b') order by vencimiento;

\echo '--- Deshacer el cobro: borra movimiento y la siguiente ocurrencia'
select deshacer_programado(:'prog_a');
select count(*) as mov_ingreso_restantes from movimientos where id = :'mov_ingreso';
select count(*) as ocurrencias_serie_a from programado where serie_id = (select serie_id from programado where id=:'prog_a');

\echo '--- Amigo crea OTRO hogar: aislamiento'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select crear_hogar('Casa Amigo','Amigo') as hogar_b \gset
select count(*) as movimientos_visibles_amigo_debe_ser_0 from movimientos;
select count(*) as programado_visible_amigo_debe_ser_0 from programado;
select count(*) as hogares_visibles_amigo_debe_ser_1 from hogares;
\echo '--- Amigo intenta insertar en el hogar de Andrés (debe fallar por RLS)'
insert into movimientos(hogar_id,fecha,tipo,descripcion,monto,origen) values (:'hogar_a', current_date,'Salida','HACK',1,'manual');
\echo '--- Amigo intenta leer la bitácora del otro hogar'
select count(*) as bitacora_ajena_debe_ser_0 from bitacora where hogar_id = :'hogar_a';
\echo '--- Amigo intenta subir adjunto a carpeta del hogar de Andrés (debe fallar)'
insert into storage.objects(bucket_id,name) values ('adjuntos', :'hogar_a' || '/x/recibo.png');
\echo '--- Amigo sube a su propia carpeta (debe funcionar)'
insert into storage.objects(bucket_id,name) values ('adjuntos', :'hogar_b' || '/x/recibo.png');
select count(*) as adjuntos_propios from storage.objects;

\echo '--- Bitácora del hogar de Andrés (trazabilidad)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select tabla, accion, left(user_id::text,8) as usuario, despues->>'descripcion' as descripcion from bitacora where tabla='movimientos' order by id;
\echo '--- Miembro no dueño no puede regenerar código'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select regenerar_codigo(:'hogar_a');
reset role;
