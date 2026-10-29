-- ============================================================================
-- Akontapp · migración 0012 · intereses corrientes como concepto propio de la factura de tarjeta
-- Los bancos facturan cada compra como capital/n y cobran el interés aparte. Las compras creadas desde un extracto
-- quedan sin tasa (la app ya no mete interés dentro de la cuota) y el interés del período entra en la factura como
-- `intereses` (antes iba en 'otros', mezclado). Solo cambia pagar_factura_tc: suma el concepto nuevo. Idempotente.
-- ============================================================================
create or replace function pagar_factura_tc(p_tc uuid, p_fecha date, p_cuenta_pago uuid, p_items jsonb, p_extras jsonb default '{}'::jsonb, p_presupuesto_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); tc cuentas%rowtype; pers uuid; esp uuid; it jsonb; total numeric; extras numeric; m uuid; out jsonb := '[]'::jsonb; cat uuid; nombre_tc text; espacios_ids uuid[]; desc_items text;
begin
  select * into tc from cuentas where id = p_tc; if tc.id is null then raise exception 'Tarjeta no encontrada'; end if;
  if tc.espacio_id not in (select mis_espacios()) then raise exception 'Solo el dueño de la tarjeta paga su factura'; end if;
  pers := tc.espacio_id; nombre_tc := tc.nombre;
  extras := coalesce((p_extras->>'cuota_manejo')::numeric,0) + coalesce((p_extras->>'mora')::numeric,0) + coalesce((p_extras->>'seguros')::numeric,0) + coalesce((p_extras->>'intereses')::numeric,0) + coalesce((p_extras->>'otros')::numeric,0);
  select array_agg(distinct c.espacio_id) into espacios_ids from tc_cargos c where c.id in (select (x->>'cargo_id')::uuid from jsonb_array_elements(p_items) x);
  if espacios_ids is null then espacios_ids := array[]::uuid[]; end if;
  if not (pers = any(espacios_ids)) and extras > 0 then espacios_ids := espacios_ids || pers; end if;
  foreach esp in array espacios_ids loop
    select coalesce(sum((x->>'pagado')::numeric),0), string_agg(c.descripcion || ' ' || (x->>'n') || '/' || c.cuotas, ', ') into total, desc_items
      from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp;
    if esp = pers then total := total + extras; end if;
    if total <= 0 then continue; end if;
    select id into cat from categorias where espacio_id = esp and nombre = 'Pago tarjeta crédito' limit 1;
    insert into movimientos(espacio_id, fecha, tipo, descripcion, monto, categoria_id, cuenta_id, tc_cuenta_id, presupuesto_id, origen, desglose, creado_por, actualizado_por, creado_en, actualizado_en)
    values (esp, p_fecha, 'Salida', 'Pago factura ' || nombre_tc || coalesce(' · ' || desc_items, ''), total, cat, p_cuenta_pago, p_tc, case when esp = pers then p_presupuesto_id else null end, 'tarjeta',
            jsonb_build_object('items', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp),
                               'extras', case when esp = pers then p_extras else '{}'::jsonb end,
                               'capital', (select coalesce(sum((x->>'capital')::numeric),0) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp),
                               'interes', (select coalesce(sum((x->>'interes')::numeric),0) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp),
                               'esperado', (select coalesce(sum((x->>'esperado')::numeric),0) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp),
                               'diferencia', (select coalesce(sum((x->>'pagado')::numeric - (x->>'esperado')::numeric),0) from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp)),
            u, u, now(), now())
    returning id into m;
    insert into cuotas_pagadas(espacio_id, cargo_id, numero, fecha_pago, monto_esperado, monto_pagado, movimiento_id, creado_por, actualizado_por, creado_en, actualizado_en)
    select esp, (x->>'cargo_id')::uuid, (x->>'n')::int, p_fecha, (x->>'esperado')::numeric, (x->>'pagado')::numeric, m, u, u, now(), now()
    from jsonb_array_elements(p_items) x join tc_cargos c on c.id = (x->>'cargo_id')::uuid where c.espacio_id = esp;
    out := out || jsonb_build_object('espacio_id', esp, 'movimiento_id', m, 'monto', total);
  end loop;
  return out;
end $$;
grant execute on function pagar_factura_tc(uuid,date,uuid,jsonb,jsonb,uuid) to authenticated;

insert into app_meta(clave, valor) values ('schema_version', '12') on conflict (clave) do update set valor = '12', actualizado_en = now();
