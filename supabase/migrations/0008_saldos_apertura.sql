-- ============================================================================
-- Akontapp · migración 0008 · saldos de apertura
-- cuentas: saldo_inicial a una fecha_corte (los movimientos anteriores al corte son historia y no
--          afectan el saldo). deudas / tc_cargos: cuotas_previas = cuotas ya pagadas antes de usar la
--          app (aparecen pagadas sin movimiento de caja). Idempotente.
-- ============================================================================
alter table cuentas add column if not exists saldo_inicial numeric(14,2) not null default 0;
alter table cuentas add column if not exists fecha_corte date;
alter table deudas add column if not exists cuotas_previas int not null default 0 check (cuotas_previas >= 0);
alter table tc_cargos add column if not exists cuotas_previas int not null default 0 check (cuotas_previas >= 0);
insert into app_meta(clave, valor) values ('schema_version', '8') on conflict (clave) do update set valor = '8', actualizado_en = now();
