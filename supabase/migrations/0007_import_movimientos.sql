-- ============================================================================
-- Akontapp · migración 0007 · importación de movimientos desde archivo plano
-- ref_externa: id del sistema de origen (p. ej. MonAi) para no duplicar al reimportar.
-- notas: etiquetas u observaciones que vienen en el archivo. Idempotente.
-- ============================================================================
alter table movimientos add column if not exists ref_externa text;
alter table movimientos add column if not exists notas text;
create unique index if not exists movimientos_ref_externa_uq on movimientos(espacio_id, ref_externa) where ref_externa is not null;
insert into app_meta(clave, valor) values ('schema_version', '7') on conflict (clave) do update set valor = '7', actualizado_en = now();
