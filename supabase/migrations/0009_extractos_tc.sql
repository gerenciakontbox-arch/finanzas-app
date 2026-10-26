-- ============================================================================
-- Akontapp · migración 0009 · extractos de tarjeta de crédito
-- tc_extractos: estado de la tarjeta según el banco en cada corte (sin datos personales; el archivo no
-- se guarda). tc_cargos.ref_extracto: huella de la línea del extracto para no duplicar compras al
-- recargar. Idempotente.
-- ============================================================================
create table if not exists tc_extractos (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios(id) on delete cascade,
  cuenta_id uuid not null references cuentas(id) on delete cascade,   -- la tarjeta
  banco text,
  periodo_inicio date, periodo_fin date,
  fecha_corte date not null,
  fecha_limite date,
  cupo numeric(14,2), utilizado numeric(14,2), disponible numeric(14,2),
  pago_total numeric(14,2), pago_minimo numeric(14,2),
  intereses numeric(14,2), mora numeric(14,2), cuota_manejo numeric(14,2), seguro numeric(14,2), abonos numeric(14,2),
  lineas jsonb not null default '[]'::jsonb,     -- compras y otros cargos tal como se leyeron (sin PII)
  advertencias jsonb not null default '[]'::jsonb,
  creado_por uuid, creado_en timestamptz, actualizado_por uuid, actualizado_en timestamptz,
  unique (cuenta_id, fecha_corte)
);
select _aplicar_estandar('tc_extractos');
alter table tc_cargos add column if not exists ref_extracto text;
create unique index if not exists tc_cargos_ref_extracto_uq on tc_cargos(cuenta_id, ref_extracto) where ref_extracto is not null;
insert into app_meta(clave, valor) values ('schema_version', '9') on conflict (clave) do update set valor = '9', actualizado_en = now();
