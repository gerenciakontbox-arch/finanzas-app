---
name: migracion
description: Crea la siguiente migración SQL de Akontapp (idempotente, con RLS, RPC security definer, versión de esquema y prueba SQL). Usar para cualquier cambio en tablas, políticas, triggers o funciones de Supabase.
---
# /migracion · nueva migración de Supabase

1. Número = último en `supabase/migrations/` + 1. Nombre `000N_tema.sql`. Cabecera con qué hace y por qué.
2. Todo idempotente: `add column if not exists`, `drop ... if exists` antes de `create`, `create or replace function`, `on conflict`. Nunca se edita una migración ya publicada.
3. Funciones: `language plpgsql security definer set search_path = public`; validar `auth.uid()` y pertenencia con `mis_espacios()`; errores en español con `raise exception`. No usar `gen_random_bytes` ni nada de `extensions` (no está en el `search_path`); usar `md5`.
4. Tablas nuevas con `espacio_id`: `select _aplicar_estandar('tabla')` (auditoría, bitácora, RLS por espacio). Tablas por usuario: política `user_id = auth.uid()`. Tablas solo de servidor: RLS sin políticas y acceso por RPC.
5. Cierra con `insert into app_meta(clave, valor) values ('schema_version','N') on conflict (clave) do update ...` y sube `SCHEMA_VERSION` en `src/lib/auth.jsx` y `valor:` en `test/mockSupabase.js`.
6. Prueba: añade el `\i` de la migración y asserts a `test/schemaK.test.sql` (o crea el siguiente), incluyendo los casos que **deben fallar**; ajusta el conteo en `test/run-sql.sh`. Ejecuta `npm run test:sql` hasta que cuadre.
7. Refleja la regla en `test/mockSupabase.js` para que el e2e la vea. Documenta en `README.md` (sección de la migración) y en `CLAUDE.md` si cambia el modelo.
8. Al avisar al dueño: "ejecuta `000N_tema.sql` en Supabase → SQL Editor", en orden si hay varias pendientes.
