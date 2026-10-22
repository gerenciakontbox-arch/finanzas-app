-- Prueba de la migración 0002 (espacios) sobre datos heredados del modelo 0001.
-- Ejecutar: psql -h /tmp -p 5499 -U postgres -f test/schema2.test.sql
drop database if exists fintest2; create database fintest2;
\c fintest2
set client_min_messages = warning;
-- Como en Supabase: pgcrypto vive en el esquema extensions y NO está en el search_path de las funciones (set search_path = public)
create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;
set search_path = public, extensions;
create schema if not exists auth; create schema if not exists storage;
create table auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
grant usage on schema public, storage, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
alter table storage.objects enable row level security;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
grant all on storage.objects to authenticated;

\set a '11111111-1111-1111-1111-111111111111'
\set e '22222222-2222-2222-2222-222222222222'
\set f '33333333-3333-3333-3333-333333333333'
insert into auth.users values (:'a','andres@test.co'), (:'e','esposa@test.co'), (:'f','amigo@test.co');

\i supabase/migrations/0001_schema.sql
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

-- ===================== DATOS HEREDADOS (modelo hogar) =====================
\echo '=== Semilla heredada'
set role authenticated; set request.jwt.claim.sub = :'a'; set search_path = public, extensions;
select crear_hogar('Casa Quijano','Andrés') as h \gset
insert into entidades(hogar_id,nombre,tipo) values (:'h','Kontbox','empresa');
select codigo_invitacion as cod from hogares \gset
set request.jwt.claim.sub = :'e';
select unirse_hogar(:'cod','Esposa');
set request.jwt.claim.sub = :'a';
select id as ea from entidades where nombre='Andrés' \gset
select id as ef from entidades where nombre='Familia' \gset
select id as ek from entidades where nombre='Kontbox' \gset
select id as ee from entidades where nombre='Esposa' \gset
insert into cuentas(hogar_id,nombre,tipo,entidad_id) values (:'h','Bancolombia Andrés','Bancaria',:'ea') returning id as cba \gset
insert into cuentas(hogar_id,nombre,tipo,entidad_id,cupo,tasa_mensual,dia_corte) values (:'h','Visa Andrés','Tarjeta crédito',:'ea',5000000,2.5,15) returning id as cva \gset
insert into cuentas(hogar_id,nombre,tipo,entidad_id) values (:'h','Cuenta Kontbox','Bancaria',:'ek') returning id as ck \gset
insert into cuentas(hogar_id,nombre,tipo,entidad_id) values (:'h','Davivienda Esposa','Bancaria',:'ee') returning id as cde \gset
select id as cef from cuentas where nombre='Efectivo' \gset
insert into activos(hogar_id,nombre,tipo,entidad_id,valor_estimado) values (:'h','Mazda','Vehículo',:'ea',60000000) returning id as am \gset
insert into activos(hogar_id,nombre,tipo,entidad_id,valor_estimado) values (:'h','Apartamento','Inmueble',:'ef',380000000) returning id as aap \gset
insert into activos(hogar_id,nombre,tipo,entidad_id,valor_estimado) values (:'h','Laptop Kontbox','Equipo',:'ek',6000000);
insert into deudas(hogar_id,nombre,tipo,entidad_id,activo_id,cuenta_pago_id,capital_inicial,tasa_mensual,total_cuotas,fecha_primera_cuota) values (:'h','Crédito Mazda','Vehicular',:'ea',:'am',:'cba',30000000,1.2,36,current_date) returning id as dm \gset
insert into cuotas_pagadas(hogar_id,deuda_id,numero,fecha_pago,monto_esperado,monto_pagado) values (:'h',:'dm',1,current_date,1000000,1000000);
select id as catmercado from categorias where nombre='Mercado' \gset
select id as cattransporte from categorias where nombre='Transporte' \gset
select id as catarriendo from categorias where nombre='Arriendo' \gset
insert into movimientos(hogar_id,fecha,tipo,descripcion,monto,entidad_id,categoria_id,cuenta_id,origen) values
  (:'h',current_date,'Salida','Mercado Éxito',120000,:'ef',:'catmercado',:'cba','manual'),
  (:'h',current_date,'Salida','Gasolina',90000,:'ea',:'cattransporte',:'cba','manual'),
  (:'h',current_date,'Salida','Arriendo oficina',1500000,:'ek',:'catarriendo',:'ck','manual'),
  (:'h',current_date,'Salida','Farmacia',45000,:'ef',:'catmercado',:'cde','manual');
insert into presupuesto(hogar_id,periodo,concepto,entidad_id,categoria_id,monto) values (:'h',date_trunc('month',current_date)::date,'Mercado',:'ef',:'catmercado',800000),(:'h',date_trunc('month',current_date)::date,'Gym',:'ea',:'cattransporte',120000);
insert into programado(hogar_id,flujo,tipo,nombre,entidad_id,cuenta_id,monto,periodicidad,vencimiento) values (:'h','salida','Servicio','Internet Claro',:'ef',:'cba',85000,'Mensual',current_date+5),(:'h','ingreso','Honorarios','Honorarios Kontbox',:'ea',:'cba',6000000,'Mensual',current_date+10);
reset role;

-- ===================== MIGRACIÓN =====================
\echo '=== Aplicando 0002'
\i supabase/migrations/0002_espacios.sql
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

\echo '=== Espacios creados (esperado: hogar Casa Quijano, 2 personales, empresa Kontbox)'
select tipo, nombre, (select count(*) from espacio_miembros m where m.espacio_id = e.id) as miembros from espacios e order by tipo, nombre;
select (select id from espacios where tipo='hogar') = :'h' as hogar_conserva_id;
select valor as marca_migracion from app_meta where clave='migracion_0002';

select id as PA from espacios where tipo='personal' and dueno_id=:'a' \gset
select id as pe from espacios where tipo='personal' and dueno_id=:'e' \gset
select id as k from espacios where tipo='empresa' \gset

\echo '=== Distribución de ítems por espacio'
select 'activos' t, e.tipo, e.nombre, a.nombre as item from activos a join espacios e on e.id=a.espacio_id
union all select 'deudas', e.tipo, e.nombre, d.nombre from deudas d join espacios e on e.id=d.espacio_id
union all select 'cuentas', e.tipo, e.nombre, k.nombre from cuentas k join espacios e on e.id=k.espacio_id
union all select 'presupuesto', e.tipo, e.nombre, p.concepto from presupuesto p join espacios e on e.id=p.espacio_id
union all select 'programado', e.tipo, e.nombre, p.nombre from programado p join espacios e on e.id=p.espacio_id
union all select 'movimientos', e.tipo, e.nombre, m.descripcion || coalesce(' ['||m.subtipo||']','') from movimientos m join espacios e on e.id=m.espacio_id
order by 1,2,3,4;
\echo '--- Espejos históricos: Mercado (Bancolombia Andrés) → aporte en personal Andrés; Farmacia (Davivienda Esposa) → aporte en personal Esposa; Arriendo oficina (cuenta de Kontbox) → sin espejo'
select e.nombre as espacio_espejo, m.descripcion, m.monto, m.subtipo, (m.pagador_id = e.dueno_id) as pagador_es_dueno, (select nombre from espacios where id=m.espacio_contraparte) as contraparte from movimientos m join espacios e on e.id=m.espacio_id where m.espejo_de is not null order by 1,2;
select count(*) as espejos_esperados_2 from movimientos where espejo_de is not null;
\echo '--- Cuentas personales habilitadas en el hogar (esperado: Bancolombia Andrés, Davivienda Esposa)'
select k.nombre, e.nombre as habilitada_en from cuentas_espacio ce join cuentas k on k.id=ce.cuenta_id join espacios e on e.id=ce.espacio_id order by 1;
\echo '--- Cuotas pagadas siguen a la deuda (personal Andrés)'
select (select espacio_id from cuotas_pagadas where deuda_id=:'dm') = :'pa' as cuota_en_personal;

-- ===================== PRIVACIDAD =====================
\echo '=== Esposa: ve el hogar, NO ve el personal de Andrés ni Kontbox'
set role authenticated; set request.jwt.claim.sub = :'e';
select e.tipo, e.nombre from espacios e order by 1,2;
select count(*) as mov_personal_andres_visibles_0 from movimientos where espacio_id = :'pa';
select count(*) as mov_kontbox_visibles_0 from movimientos where espacio_id = :'k';
select count(*) as activos_visibles_1_apartamento from activos;
select nombre as cuentas_visibles from cuentas order by 1;  -- Davivienda Esposa, Efectivo (suyo), Bancolombia Andrés (habilitada), Efectivo (hogar)
select count(*) as visa_andres_no_visible_0 from cuentas where id = :'cva';

\echo '=== Esposa registra mercado del hogar pagado con la cuenta de Andrés → aporte en personal de Andrés'
insert into movimientos(espacio_id,fecha,tipo,descripcion,monto,categoria_id,cuenta_id,origen) values (:'h',current_date,'Salida','Mercado Carulla',200000,(select id from categorias where espacio_id=:'h' and nombre='Mercado'),:'cba','manual') returning id as mv1 \gset
select (pagador_id = :'a') as pagador_es_andres, (creado_por = :'e') as creado_por_esposa from movimientos where id=:'mv1';
set request.jwt.claim.sub = :'a';
select descripcion, monto, subtipo, (cuenta_id=:'cba') as desde_bancolombia from movimientos where espejo_de=:'mv1';
\echo '--- Andrés intenta borrar el espejo directamente (RLS: 0 filas)'
delete from movimientos where espejo_de=:'mv1';
select count(*) as espejo_sigue_1 from movimientos where espejo_de=:'mv1';
\echo '--- Esposa edita el monto del original → el espejo se actualiza'
set request.jwt.claim.sub = :'e';
update movimientos set monto=250000 where id=:'mv1';
set request.jwt.claim.sub = :'a';
select monto as espejo_monto_250000 from movimientos where espejo_de=:'mv1';
\echo '--- Esposa borra el original → el espejo desaparece'
set request.jwt.claim.sub = :'e';
delete from movimientos where id=:'mv1';
set request.jwt.claim.sub = :'a';
select count(*) as espejo_borrado_0 from movimientos where espejo_de=:'mv1';

\echo '=== Ingreso del hogar que cae en cuenta de Andrés → "Recibido de"'
insert into movimientos(espacio_id,fecha,tipo,descripcion,monto,cuenta_id,origen) values (:'h',current_date,'Ingreso','Arriendo finca',900000,:'cba','manual') returning id as mv2 \gset
select descripcion, subtipo from movimientos where espejo_de=:'mv2';

\echo '=== Kontbox paga honorarios a Andrés desde la cuenta de la empresa → Ingreso en personal (categoría Honorarios)'
insert into movimientos(espacio_id,fecha,tipo,descripcion,monto,categoria_id,cuenta_id,cuenta_destino_id,origen) values (:'k',current_date,'Salida','Honorarios octubre',8500000,(select id from categorias where espacio_id=:'k' and nombre='Honorarios'),:'ck',:'cba','manual') returning id as mv3 \gset
select tipo, descripcion, monto, (select nombre from categorias where id=m.categoria_id) as categoria, (cuenta_id=:'cba') as a_bancolombia from movimientos m where espejo_de=:'mv3';

\echo '=== Traslado entre cuentas propias (sin espejo)'
insert into movimientos(espacio_id,fecha,tipo,subtipo,descripcion,monto,cuenta_id,cuenta_destino_id,origen) values (:'pa',current_date,'Transferencia','traslado','Retiro cajero',300000,:'cba',(select id from cuentas where espacio_id=:'pa' and nombre='Efectivo'),'manual') returning id as mv4 \gset
select count(*) as espejos_traslado_0 from movimientos where espejo_de=:'mv4';
\echo '--- Traslado sin cuenta destino debe fallar'
insert into movimientos(espacio_id,fecha,tipo,subtipo,descripcion,monto,cuenta_id,origen) values (:'pa',current_date,'Transferencia','traslado','Mal',1,:'cba','manual');

\echo '=== Mover el Mazda (personal, con crédito) al hogar: arrastra la deuda y sus cuotas; los movimientos históricos NO se mueven'
select mover_item('activos', :'am', :'h');
select (select espacio_id from activos where id=:'am')=:'h' as mazda_en_hogar, (select espacio_id from deudas where id=:'dm')=:'h' as credito_en_hogar, (select espacio_id from cuotas_pagadas where deuda_id=:'dm')=:'h' as cuota_en_hogar;
select count(*) as gasolina_sigue_personal_1 from movimientos where descripcion='Gasolina' and espacio_id=:'pa';
\echo '--- Esposa (miembro) intenta mover el Apartamento a Kontbox (no es miembro) → error'
set request.jwt.claim.sub = :'e';
select mover_item('activos', :'aap', :'k');

\echo '=== Categorías: miembro no admin no crea; admin sí; usada no se borra; grupo bloqueado'
set request.jwt.claim.sub = :'e';
insert into categorias(espacio_id,nombre,grupo) values (:'h','Mascotas','Variable');
set request.jwt.claim.sub = :'a';
insert into categorias(espacio_id,nombre,grupo) values (:'h','Mascotas','Variable') returning id as catmasc \gset
delete from categorias where espacio_id=:'h' and nombre='Mercado';
update categorias set grupo='Fijo' where espacio_id=:'h' and nombre='Mercado';
update categorias set activa=false where id=:'catmasc';
select nombre, activa from categorias where id=:'catmasc';
\echo '--- En el personal cada quien administra lo suyo'
set request.jwt.claim.sub = :'e';
insert into categorias(espacio_id,nombre,grupo) values (:'pe','Yoga','Variable');
select count(*) as yoga_1 from categorias where espacio_id=:'pe' and nombre='Yoga';

\echo '=== Tarjeta de Andrés habilitada en el hogar; Esposa registra compra del hogar con ella'
set request.jwt.claim.sub = :'a';
select habilitar_cuenta(:'cva', :'h', true);
set request.jwt.claim.sub = :'e';
select count(*) as visa_visible_ahora_1 from cuentas where id=:'cva';
insert into tc_cargos(espacio_id,cuenta_id,fecha,descripcion,monto,cuotas,tasa_mensual,primera_cuota) values (:'h',:'cva',current_date,'Mercado mes',600000,1,0,current_date+20) returning id as cg1 \gset
\echo '--- Esposa no puede habilitar la tarjeta de Andrés en otro lado'
select habilitar_cuenta(:'cva', :'pe', true);
set request.jwt.claim.sub = :'a';
insert into tc_cargos(espacio_id,cuenta_id,fecha,descripcion,monto,cuotas,tasa_mensual,primera_cuota) values (:'pa',:'cva',current_date,'Tenis',400000,2,2.5,current_date+20) returning id as cg2 \gset
\echo '--- Andrés paga la factura: porción personal (Tenis cuota 1 + manejo) y porción hogar (Mercado mes) → aporte espejo'
select pagar_factura_tc(:'cva', current_date+20, :'cba',
  jsonb_build_array(jsonb_build_object('cargo_id',:'cg1','n',1,'esperado',600000,'pagado',600000,'capital',600000,'interes',0),
                    jsonb_build_object('cargo_id',:'cg2','n',1,'esperado',207500,'pagado',207500,'capital',197500,'interes',10000)),
  '{"cuota_manejo":25000}'::jsonb) as resultado;
select e.tipo as espacio, m.tipo, m.subtipo, m.descripcion, m.monto from movimientos m join espacios e on e.id=m.espacio_id where m.origen='tarjeta' or (m.espejo_de in (select id from movimientos where origen='tarjeta')) order by e.tipo, m.monto;
select (select espacio_id from cuotas_pagadas where cargo_id=:'cg1')=:'h' as cuota_hogar, (select espacio_id from cuotas_pagadas where cargo_id=:'cg2')=:'pa' as cuota_personal;

\echo '=== Programado del hogar pagado por Esposa con su cuenta → aporte en personal de Esposa'
set request.jwt.claim.sub = :'e';
select id as print from programado where nombre='Internet Claro' \gset
select completar_programado(:'print', current_date, 85000, :'cde') as mvint \gset
select e.tipo, m.descripcion, m.subtipo, (m.pagador_id=:'e') as pagador_esposa from movimientos m join espacios e on e.id=m.espacio_id where m.id=:'mvint' or m.espejo_de=:'mvint' order by 1;
select count(*) as siguiente_ocurrencia_1 from programado where nombre='Internet Claro' and estado='Pendiente';

\echo '=== Pago de cuota de crédito (RPC) del Mazda, ahora en el hogar, con la cuenta de Andrés'
set request.jwt.claim.sub = :'e';
select pagar_cuota_credito(:'dm', 2, current_date, :'cba', 700000, 300000, '{"seguros":15000}'::jsonb) as mvcuota \gset
set request.jwt.claim.sub = :'a';
select e.tipo, m.monto, m.subtipo, (m.pagador_id=:'a') as pagador_andres from movimientos m join espacios e on e.id=m.espacio_id where m.id=:'mvcuota' or m.espejo_de=:'mvcuota' order by 1;

\echo '=== Esposa (miembro no admin) cambia su nombre en todos sus espacios'
set request.jwt.claim.sub = :'e';
select cambiar_mi_nombre('Esposa Q.');
select count(*) as filas_renombradas_2 from espacio_miembros where user_id=:'e' and nombre='Esposa Q.';

\echo '=== Amigo: espacio propio, aislamiento total'
set request.jwt.claim.sub = :'f';
select asegurar_personal('Amigo') as pf \gset
select crear_espacio('hogar','Casa Amigo','Amigo') as hf \gset
select count(*) as espacios_visibles_2 from espacios;
select count(*) as movimientos_ajenos_0 from movimientos where espacio_id in (:'h', :'pa', :'pe', :'k');
select count(*) as cuentas_ajenas_0 from cuentas where espacio_id in (:'h', :'pa', :'pe', :'k');
\echo '--- Amigo intenta insertar en Casa Quijano (RLS) → error'
insert into movimientos(espacio_id,fecha,tipo,descripcion,monto,origen) values (:'h',current_date,'Salida','HACK',1,'manual');
\echo '--- Amigo intenta unirse con un código inválido → error'
select unirse_espacio('ZZZZZZZZ','Amigo');
\echo '--- Amigo se une a Casa Quijano con el código real y ve el hogar pero no los personales'
set request.jwt.claim.sub = :'a';
select codigo_invitacion as cod2 from espacios where id=:'h' \gset
set request.jwt.claim.sub = :'f';
select unirse_espacio(:'cod2','Amigo') = :'h' as se_unio;
select count(*) as personales_ajenos_0 from movimientos where espacio_id in (:'pa', :'pe');
\echo '--- Admin (Andrés) lo expulsa'
set request.jwt.claim.sub = :'a';
delete from espacio_miembros where espacio_id=:'h' and user_id=:'f';
set request.jwt.claim.sub = :'f';
select count(*) as hogar_quijano_ya_no_visible_0 from espacios where id=:'h';

\echo '=== Idempotencia: volver a correr 0002 no duplica ni falla'
reset role;
select count(*) as espejos_antes from movimientos where espejo_de is not null \gset
\i supabase/migrations/0002_espacios.sql
select count(*) = :espejos_antes as espejos_iguales from movimientos where espejo_de is not null;
select valor as schema_version from app_meta where clave='schema_version';
