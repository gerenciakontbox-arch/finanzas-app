// Recorrido end-to-end sobre el bundle de prueba con Playwright + backend en memoria (esquema de espacios).
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
const PDF_PRUEBA = readFileSync('test/fixture-extracto.pdf')

const root = path.resolve('test/dist')
const server = createServer((req, res) => { let p = path.join(root, req.url.split('?')[0]); if (!existsSync(p) || p.endsWith('/')) p = path.join(root, 'index.html'); const ext = path.extname(p); res.setHeader('Content-Type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' }[ext] || 'application/octet-stream'); res.end(readFileSync(p)) }).listen(4177)

const results = []; const ok = (n, c) => { results.push([c ? 'PASS' : 'FAIL', n]); if (!c) console.log('   ✗', n) }
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}); const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 200)) })
page.on('dialog', d => d.accept())
const T = () => page.evaluate(() => document.body.innerText)
const DB = fn => page.evaluate(fn)
const wait = ms => page.waitForTimeout(ms)
const NAV = { 'Inicio': ['Inicio'], 'Movim.': ['Movimientos'], 'Deudas': ['Deudas'], 'Presup.': ['Plan', 'Presupuesto'], 'Progr.': ['Plan', 'Programado'], 'Activos': ['Activos'], 'Config': ['Ajustes'] }
const tab = async l => { const [n, seg] = NAV[l] || [l]; await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click(); await wait(150); if (seg) { await page.locator('[role=tab]', { hasText: seg }).click(); await wait(200) } }
const click = async (sel, opt) => { await page.locator(sel, opt).first().click(); await wait(150) }
const submit = async (txt) => { await page.locator('button', { hasText: txt }).last().click(); await wait(250) }
const fillLabel = async (label, v) => { const el = page.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::*[1]'); await el.fill(String(v)) }
const selectLabel = async (label, v) => { const el = page.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::select'); await el.selectOption({ label: v }) }
const plusBtn = async () => { await page.locator('div:has(> button[title="Importar CSV"]) > button').last().click(); await wait(150) }
const cambiarEspacio = async nombre => { await page.locator('button[aria-label="Cambiar de espacio"]').click(); await wait(100); await page.locator('[data-menu="espacios"] button', { hasText: nombre }).first().click(); await wait(400) }
const aceptarPolitica = async (opts = {}) => { if (!/Tus datos, tus reglas/.test(await T())) return false; if (opts.comercial) await page.locator('[role=switch]').nth(3).click(); if (opts.sinAnalitica) await page.locator('[role=switch]').nth(1).click(); await submit('Aceptar y continuar'); await wait(400); return true }
const loginAs = async (uid, mail, opts) => { await DB(() => window.__sb._logout()); await wait(200); await page.evaluate(([u, m]) => window.__sb._login(u, m), [uid, mail]); await wait(500); await aceptarPolitica(opts) }

await page.goto('http://localhost:4177/'); await wait(400)
ok('Pantalla de login (Akontapp)', /Enviarme el código por correo/.test(await T()) && /Akontapp/.test(await T()))
await page.fill('input[type=email]', 'andres@test.co'); await click('button', { hasText: 'Enviarme el código' })
ok('Pide el código del correo', /código numérico/.test(await T()))
await page.fill('input[inputmode=numeric]', '999999'); await click('button', { hasText: 'Entrar con el código' }); await wait(200)
ok('Código inválido rechazado', /Código inválido o vencido/.test(await T()))
await page.fill('input[inputmode=numeric]', '123456'); await click('button', { hasText: 'Entrar con el código' }); await wait(500)
ok('Primer ingreso: pantalla de autorizaciones (4 finalidades, servicio obligatoria)', /Tus datos, tus reglas/.test(await T()) && (await page.locator('[role=switch]').count()) === 4 && /necesaria/.test(await T()))
await page.screenshot({ path: 'test/shot-autorizaciones.png' }); await page.locator('button', { hasText: 'Leer la política completa' }).click(); await wait(150); ok('Política completa visible (Ley 1581, responsable, derechos)', /Ley 1581 de 2012/.test(await T()) && /KONTBOX S.A.S./.test(await T())); await page.locator('button[aria-label="Cerrar"]').click(); await wait(150)
await aceptarPolitica({ comercial: true })
const cons0 = await DB(() => window.__sb._T.consentimientos.filter(c => c.user_id === 'u-andres').map(c => c.finalidad + ':' + c.aceptado).sort())
ok('Autorizaciones registradas con versión de política', JSON.stringify(cons0) === JSON.stringify(['analitica:true', 'comercial:true', 'perfil:true', 'servicio:true']))
ok('Entra directo al espacio personal (sin onboarding) y pide el nombre', /Espacio personal/.test(await T()) && /¿Cómo te llamas\?/.test(await T()) && /Anotar gasto/.test(await T()))
await page.fill('input[placeholder="Ej. Andrés"]', 'Andrés'); await click('button', { hasText: 'Guardar' }); await wait(300)
ok('Nombre guardado en cabecera', /Hola, Andrés/.test(await T()) && !/¿Cómo te llamas\?/.test(await T()))

// Cuentas personales (+ bug del foco)
await tab('Config'); await click('button', { hasText: 'Cuentas' })
await fillLabel('Nombre', 'Bancolombia Andrés'); await click('button', { hasText: 'Agregar cuenta' })
await fillLabel('Nombre', 'Visa Bancolombia'); await selectLabel('Tipo', 'Tarjeta crédito')
{ const cupo = page.locator('label:has-text("Cupo (COP)")').first().locator('xpath=following-sibling::*[1]'); await cupo.click(); await page.keyboard.type('5000000', { delay: 30 }); const v = await cupo.inputValue(); const foco = await cupo.evaluate(el => document.activeElement === el); ok('R9: el campo Cupo conserva el foco al teclear', v === '5000000' && foco) }
await fillLabel('Tasa mensual (%)', 2.8); await fillLabel('Día de corte', 15); await click('button', { hasText: 'Agregar cuenta' })
ok('Cuentas personales creadas', /Bancolombia Andrés/.test(await T()) && /Visa Bancolombia/.test(await T()))

// Crear hogar → se vuelve espacio activo
await click('button', { hasText: 'Espacios' }); await click('button', { hasText: 'Crear hogar o empresa' })
await fillLabel('Nombre del hogar', 'Casa Quijano'); await submit('Crear'); await wait(500)
ok('Hogar creado y activo (cabecera verde con su nombre)', /Casa Quijano/.test(await T()) && /Invitar/.test(await T()))
const codigo = await DB(() => window.__sb._T.espacios.find(e => e.tipo === 'hogar').codigo_invitacion)
ok('Código de invitación visible', new RegExp(codigo).test(await T()))
await click('button', { hasText: 'Cuentas' }); ok('En el hogar no hay medios de pago aún', /Nadie ha habilitado cuentas todavía/.test(await T()))

// Habilitar cuentas personales en el hogar
await cambiarEspacio('Personal'); await tab('Config'); await click('button', { hasText: 'Cuentas' })
ok('Toggle de habilitación visible por cuenta', (await page.locator('button', { hasText: 'Casa Quijano' }).count()) >= 2)
await page.locator('button[aria-label="Bancolombia Andrés en Casa Quijano"]').click(); await wait(200); await page.locator('button[aria-label="Visa Bancolombia en Casa Quijano"]').click(); await wait(200)
let st = await DB(() => window.__sb._T.cuentas_espacio.length)
await page.screenshot({ path: 'test/shot-cuentas.png', fullPage: true })
ok('Bancolombia y Visa habilitadas en Casa Quijano', st === 2 && /✓ Casa Quijano/.test(await T()))

// Hogar: presupuesto con pagador y gasto pagado con cuenta personal → aporte espejo
await cambiarEspacio('Casa Quijano'); await tab('Presup.'); await plusBtn()
await fillLabel('Concepto', 'Mercado'); await selectLabel('Quién lo paga', 'Andrés'); await fillLabel('Monto (COP)', 800000); await submit('Guardar')
ok('Rubro del hogar con pagador', /Mercado/.test(await T()) && /Andrés/.test(await T()))
await tab('Movim.'); await page.locator('button[title="Importar CSV"] + button').last().click(); await wait(150)
await fillLabel('Descripción', 'Mercado Éxito'); await selectLabel('Categoría', 'Mercado'); await selectLabel('Cuenta de donde sale', 'Bancolombia Andrés'); await fillLabel('Monto (COP)', 120000)
ok('Aviso de aporte antes de guardar', /aporte de Andrés/.test(await T()))
await submit('Registrar')
st = await DB(() => { const T = window.__sb._T; const h = T.espacios.find(e => e.tipo === 'hogar').id; const p = T.espacios.find(e => e.tipo === 'personal' && e.dueno_id === 'u-andres').id; const m = T.movimientos.find(x => x.descripcion === 'Mercado Éxito'); const esp = T.movimientos.find(x => x.espejo_de === m?.id); return { ok: m && m.espacio_id === h && m.pagador_id === 'u-andres' && esp && esp.espacio_id === p && esp.subtipo === 'aporte' && +esp.monto === 120000 && esp.cuenta_id === m.cuenta_id } })
ok('Gasto del hogar → aporte espejo en el personal de Andrés', st.ok && /Pagó Andrés/.test(await T()))

// Personal: el espejo se ve, no se borra; presupuesto muestra aportes planificados
await cambiarEspacio('Personal'); await tab('Movim.')
await page.screenshot({ path: 'test/shot-mov-personal.png', fullPage: true })
ok('Espejo visible como "Aporte a Casa Quijano", sin botón eliminar', /Aporte a Casa Quijano · Mercado Éxito/.test(await T()) && /reflejo, se edita allá/.test(await T()) && (await page.locator('button', { hasText: 'Eliminar' }).count()) === 0)
ok('KPI de aportes en personal', /Aportes/.test(await T()))
await tab('Presup.')
ok('Aportes planificados a Casa Quijano: 120.000 / 800.000', /Aportes planificados a mis espacios/.test(await T()) && /\$ 120\.000 \/ \$ 800\.000/.test(await T()))

// Personal: activo + crédito → mover al hogar arrastra el crédito
await tab('Activos'); await page.locator('button[title="Nuevo activo"]').click(); await wait(150)
await fillLabel('Nombre', 'Mazda'); await selectLabel('Tipo', 'Vehículo'); await fillLabel('Valor estimado (COP)', 60000000); await submit('Guardar')
await tab('Deudas'); await click('button', { hasText: 'Nuevo' }); await fillLabel('Nombre', 'Crédito Mazda'); await fillLabel('Capital inicial', 30000000); await fillLabel('Tasa mensual (%)', 1.2); await fillLabel('Total cuotas', 36); await selectLabel('Activo asociado', 'Mazda'); await submit('Guardar')
ok('Crédito creado en personal, en formato tarjeta', /Crédito Mazda/.test(await T()) && /saldo capital/i.test(await T()))
await tab('Activos'); await click('div:has-text("Mazda") >> nth=-1'); await wait(150); await click('button', { hasText: 'Mover a…' }); await click('button', { hasText: 'Casa Quijano' }); await submit('Mover'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const h = T.espacios.find(e => e.tipo === 'hogar').id; return { a: T.activos.find(x => x.nombre === 'Mazda').espacio_id === h, d: T.deudas.find(x => x.nombre === 'Crédito Mazda').espacio_id === h } })
ok('Mover activo → activo y crédito en el hogar', st.a && st.d && !/Mazda/.test(await T()))

// Hogar: compra con la tarjeta de Andrés; factura pagada desde el personal se parte por espacio
await cambiarEspacio('Casa Quijano'); await tab('Deudas')
ok('Tarjeta de Andrés visible en el hogar con compras de este espacio', /Visa Bancolombia/.test(await T()) && /compras de Casa Quijano/.test(await T()) && /se paga desde tu espacio personal/.test(await T()))
await click('button', { hasText: 'Registrar compra' }); await fillLabel('Descripción', 'Mercado mes'); await fillLabel('Monto (COP)', 600000); await submit('Registrar compra')
st = await DB(() => { const T = window.__sb._T; const h = T.espacios.find(e => e.tipo === 'hogar').id; return T.tc_cargos.find(c => c.descripcion === 'Mercado mes')?.espacio_id === h })
ok('Compra registrada en el espacio hogar', st)
await cambiarEspacio('Personal'); await tab('Deudas')
ok('En personal la tarjeta muestra saldo total con la compra del hogar', /Saldo total/i.test(await T()) && /\$ 600\.000/.test(await T()))
await click('button', { hasText: 'Pagar factura' })
ok('Factura lista la compra del hogar con su etiqueta y la porción como aporte', /Mercado mes/.test(await T()) && /Casa Quijano/.test(await T()) && /queda como aporte tuyo/.test(await T()))
await submit('Registrar pago'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const h = T.espacios.find(e => e.tipo === 'hogar').id; const p = T.espacios.find(e => e.tipo === 'personal' && e.dueno_id === 'u-andres').id; const mh = T.movimientos.find(m => m.origen === 'tarjeta' && m.espacio_id === h); const esp = mh && T.movimientos.find(m => m.espejo_de === mh.id); const cp = T.cuotas_pagadas.find(c => c.cargo_id === T.tc_cargos.find(x => x.descripcion === 'Mercado mes').id); return { mh: !!mh && +mh.monto >= 600000, esp: !!esp && esp.espacio_id === p && esp.subtipo === 'aporte', cp: cp && cp.espacio_id === h, personalMov: T.movimientos.filter(m => m.origen === 'tarjeta' && m.espacio_id === p).length } })
ok('Factura: salida en el hogar + aporte espejo en personal, cuota marcada en el hogar, sin salida personal', st.mh && st.esp && st.cp && st.personalMov === 0)

// Programado del hogar pagado → aporte
await cambiarEspacio('Casa Quijano'); await tab('Progr.'); await plusBtn()
await fillLabel('Nombre', 'Internet Claro'); await fillLabel('Monto (COP)', 85000); await selectLabel('Cuenta de pago', 'Bancolombia Andrés'); await submit('Guardar')
await click('button', { hasText: /^Pagar$/ }); await submit('Registrar pago'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const m = T.movimientos.find(x => x.descripcion === 'Internet Claro' && !x.espejo_de); return { mir: !!T.movimientos.find(x => x.espejo_de === m?.id && x.subtipo === 'aporte'), sig: T.programado.filter(p => p.nombre === 'Internet Claro' && p.estado === 'Pendiente').length === 1 } })
ok('Programado pagado → aporte espejo + siguiente ocurrencia', st.mir && st.sig)

// Esposa: se une, ve el hogar, NO ve el personal de Andrés; registra con la cuenta de Andrés
await loginAs('u-esposa', 'esposa@test.co')
ok('Esposa entra a su espacio personal vacío', /Personal/.test(await T()) && !/Mercado/.test(await T()))
await page.fill('input[placeholder="Ej. Andrés"]', 'Esposa'); await click('button', { hasText: 'Guardar' }); await wait(200)
await tab('Config'); await click('button', { hasText: 'Tengo un código' }); await page.fill('input[maxlength="8"]', codigo); await submit('Unirme'); await wait(500)
ok('Esposa en Casa Quijano (miembro)', /Casa Quijano/.test(await T()) && /miembro/.test(await T()))
await click('button', { hasText: 'Cuentas' }); ok('Esposa ve los medios de pago de Andrés, sin saldo', /Bancolombia Andrés/.test(await T()) && /de Andrés/.test(await T()) && !/saldo \$/.test(await T()))
await click('button', { hasText: 'Categorías' }); ok('Esposa (miembro) no administra categorías', /Solo un administrador de Casa Quijano/.test(await T()))
await tab('Movim.'); ok('Esposa ve el gasto de Andrés con pagador y autor', /Mercado Éxito/.test(await T()) && /Pagó Andrés · Registró Andrés/.test(await T()))
await page.locator('button[title="Importar CSV"] + button').last().click(); await wait(150)
await fillLabel('Descripción', 'Farmacia'); await selectLabel('Cuenta de donde sale', 'Bancolombia Andrés · Andrés'); await fillLabel('Monto (COP)', 45000); await submit('Registrar')
st = await DB(() => { const T = window.__sb._T; const m = T.movimientos.find(x => x.descripcion === 'Farmacia'); const esp = T.movimientos.find(x => x.espejo_de === m?.id); const p = T.espacios.find(e => e.tipo === 'personal' && e.dueno_id === 'u-andres').id; return m && m.creado_por === 'u-esposa' && m.pagador_id === 'u-andres' && esp && esp.espacio_id === p && esp.subtipo === 'aporte' })
ok('Esposa paga con la cuenta de Andrés → aporte de Andrés (registró Esposa)', st && /Pagó Andrés · Registró Esposa/.test(await T()))
await cambiarEspacio('Personal'); await tab('Movim.')
ok('Esposa en su personal NO ve movimientos de Andrés ni sus aportes', !/Mercado/.test(await T()) && !/Aporte a/.test(await T()) && /Sin movimientos/.test(await T()))
await tab('Deudas'); ok('Esposa no ve la tarjeta de Andrés en su personal', !/Visa Bancolombia/.test(await T()))

// Andrés: empresa Kontbox paga honorarios → ingreso en su personal
await loginAs('u-andres', 'andres@test.co'); await tab('Config'); await click('button', { hasText: 'Crear hogar o empresa' }); await click('button', { hasText: /^Empresa$/ })
await fillLabel('Nombre de la empresa', 'Kontbox'); await submit('Crear'); await wait(500)
ok('Empresa creada y activa', /Kontbox/.test(await T()) && /Esta empresa/.test(await T()))
await click('button', { hasText: 'Cuentas' }); ok('Empresa con cuenta propia', /Caja Kontbox/.test(await T()))
await cambiarEspacio('Personal'); await tab('Config'); await click('button', { hasText: 'Cuentas' }); await page.locator('button[aria-label="Bancolombia Andrés en Kontbox"]').click(); await wait(200)
await cambiarEspacio('Kontbox'); await tab('Movim.'); await page.locator('button[title="Importar CSV"] + button').last().click(); await wait(150)
await fillLabel('Descripción', 'Honorarios octubre'); await selectLabel('Categoría', 'Honorarios'); await selectLabel('Cuenta de donde sale', 'Caja Kontbox'); await fillLabel('Monto (COP)', 8500000)
await page.locator('label:has-text("Este pago es a un miembro") input').check(); await wait(100); await selectLabel('Cuenta del miembro', 'Bancolombia Andrés'); await submit('Registrar')
st = await DB(() => { const T = window.__sb._T; const m = T.movimientos.find(x => x.descripcion === 'Honorarios octubre'); const esp = T.movimientos.find(x => x.espejo_de === m?.id); const p = T.espacios.find(e => e.tipo === 'personal' && e.dueno_id === 'u-andres').id; return esp && esp.espacio_id === p && esp.tipo === 'Ingreso' && +esp.monto === 8500000 && T.categorias.find(c => c.id === esp.categoria_id)?.nombre === 'Honorarios' })
ok('Kontbox → honorarios caen como Ingreso en el personal de Andrés', st && /Pago a Andrés/.test(await T()))
await cambiarEspacio('Personal'); await tab('Movim.'); ok('Ingreso desde Kontbox visible en personal', /Kontbox · Honorarios octubre/.test(await T()) && /Ingreso desde Kontbox/.test(await T()))
await tab('Inicio'); await page.screenshot({ path: 'test/shot-inicio-personal.png', fullPage: true }); ok('Inicio personal: cuentas con saldo, aportes por espacio', /Mis cuentas/.test(await T()) && /Mis espacios/.test(await T()) && /Casa Quijano/.test(await T()) && /Aporté/.test(await T()))
await cambiarEspacio('Casa Quijano'); await tab('Inicio'); await page.screenshot({ path: 'test/shot-inicio-hogar.png', fullPage: true }); ok('Inicio del hogar: aportes por miembro', /Aportes por miembro/.test(await T()) && /Andrés/.test(await T()))
// Capturas de todas las pantallas (revisión visual)
await cambiarEspacio('Personal')
for (const [k, f] of [['Movim.', 'mov'], ['Presup.', 'presup'], ['Progr.', 'progr'], ['Deudas', 'deudas'], ['Activos', 'activos'], ['Config', 'config']]) { await tab(k); await page.screenshot({ path: `test/shot-${f}.png`, fullPage: true }) }
await tab('Movim.'); await page.locator('button[title="Importar CSV"] + button').last().click(); await wait(200); await page.screenshot({ path: 'test/shot-modal-mov.png' }); await page.locator('button[aria-label="Cerrar"]').click(); await wait(150)
await cambiarEspacio('Casa Quijano'); await tab('Deudas'); await page.screenshot({ path: 'test/shot-deudas-hogar.png', fullPage: true })

// ===== Lote 3 · créditos: cuota decreciente con seguro, anticipo con motivo, abono a capital =====
await cambiarEspacio('Personal'); await tab('Deudas'); await click('button', { hasText: 'Nuevo' })
await fillLabel('Nombre', 'Crédito libre'); await selectLabel('Sistema de cuota', 'Abono fijo a capital (cuota decreciente)'); await fillLabel('Capital inicial', 12000000); await fillLabel('Tasa mensual (%)', 1.5); await fillLabel('Total cuotas', 12); await fillLabel('Seguros mensuales (COP)', 45000)
const fut = new Date(); fut.setDate(fut.getDate() + 20); await fillLabel('Primera cuota', fut.toISOString().slice(0, 10)); await submit('Guardar')
ok('Crédito decreciente creado con seguro', /Crédito libre/.test(await T()) && /Cuota decreciente/.test(await T()) && /seguro \$ 45\.000\/mes/.test(await T()))
st = await DB(() => { const d = window.__sb._T.deudas.find(x => x.nombre === 'Crédito libre'); return { sistema: d.sistema, seg: d.seguro_mensual } })
ok('Crédito guardado con sistema capital y seguro', st.sistema === 'capital' && st.seg === 45000)
// la cuota 1 vence en 20 días → el botón pide motivo
await page.locator('button', { hasText: /Cuota 1 · vence/ }).first().click(); await wait(200)
ok('Pago: modal con valor real y aviso de anticipo', /¿Cuánto pagaste realmente\?/.test(await T()) && /se te pedirá el motivo del anticipo/.test(await T()))
await submit('Registrar pago'); await wait(200)
ok('Pago anticipado: pide motivo', /Pago anticipado/.test(await T()) && /Adelanto de cuota/.test(await T()))
await click('button', { hasText: /^Adelanto de cuota$/ }); await submit('Pagar con este motivo'); await wait(300)
st = await DB(() => { const T = window.__sb._T; const d = T.deudas.find(x => x.nombre === 'Crédito libre'); const m = T.movimientos.find(x => x.deuda_id === d.id && !x.desglose.abono); const c = T.cuotas_pagadas.find(x => x.deuda_id === d.id); return { motivo: m?.motivo, monto: m?.monto, cap: c?.capital, seg: c?.seguro } })
ok('Cuota 1 pagada con motivo, capital 1.000.000 + interés + seguro 45.000', st.motivo === 'Adelanto de cuota' && st.cap === 1000000 && st.seg === 45000 && st.monto === 1000000 + 180000 + 45000)
// abono a capital reduciendo plazo
await page.locator('button', { hasText: 'Ver tabla' }).last().click(); await wait(200)
await click('button', { hasText: 'Abonar a capital' }); await fillLabel('Monto (COP)', 5000000); await submit('Registrar abono'); await wait(300)
st = await DB(() => { const T = window.__sb._T; const d = T.deudas.find(x => x.nombre === 'Crédito libre'); const a = T.abonos_capital.find(x => x.deuda_id === d.id); return { modo: a?.modo, desp: a?.despues_de_cuota, monto: a?.monto } })
ok('Abono a capital registrado tras la cuota 1 (modo plazo)', st.modo === 'plazo' && st.desp === 1 && st.monto === 5000000)
await page.screenshot({ path: 'test/shot-credito.png', fullPage: true })
ok('Tabla recalculada: menos cuotas y abono visible', /abono \$ 5\.000\.000/.test(await T()) && /\/(6|7) cuotas pagadas/.test(await T()))

// ===== Lote 4 · depreciación =====
await tab('Activos'); await page.locator('button[title="Nuevo activo"]').click(); await wait(150)
await fillLabel('Nombre', 'Portátil'); await selectLabel('Tipo', 'Equipo'); await fillLabel('Valor estimado (COP)', 4000000)
const hace = new Date(); hace.setMonth(hace.getMonth() - 12); await fillLabel('Fecha adquisición', hace.toISOString().slice(0, 10))
await page.locator('label:has-text("Deprecia (lineal mensual)") input').check(); await selectLabel('Vida útil', '4 años'); await fillLabel('Valor residual (COP)', 400000); await submit('Guardar')
st = await DB(() => { const a = window.__sb._T.activos.find(x => x.nombre === 'Portátil'); return { vida: a.vida_util_meses, res: a.valor_residual, base: a.valor_base, fb: a.fecha_base } })
ok('Activo con depreciación guardada (48 meses, residual 400.000, base = valor)', st.vida === 48 && st.res === 400000 && st.base === 4000000 && !!st.fb)
ok('Valor neto mostrado: 4.000.000 − 12×75.000 = 3.100.000 (25% depreciado)', /3\.100\.000/.test(await T()) && /25% depreciado/.test(await T()))

// ===== Lote 4 · presupuesto → programado (ítem y CSV) con bloqueo =====
await cambiarEspacio('Casa Quijano'); await tab('Presup.'); await plusBtn()
await fillLabel('Concepto', 'Gas natural'); await fillLabel('Monto (COP)', 85000); await submit('Guardar')
await page.locator('[data-item="Gas natural"] button', { hasText: /^Programar$/ }).click(); await wait(200)
ok('Modal Programar con periodicidad', /Se repite/.test(await T()) && /Primer vencimiento/.test(await T()))
await submit('Programar'); await wait(300)
await page.screenshot({ path: 'test/shot-presup-bloqueado.png', fullPage: true })
ok('Rubro programado y bloqueado (sin editar/eliminar; "Ver en Programado")', /Programado mensual/.test(await T()) && /Ver en Programado/.test(await T()) && /se paga desde Programado/.test(await T()))
st = await DB(() => { const T = window.__sb._T; const r = T.presupuesto.find(x => x.concepto === 'Gas natural'); const o = T.programado.find(x => x.presupuesto_id === r.id); return { estado: r.estado, serie: !!r.programado_serie_id, oc: !!o, nombre: o?.nombre, monto: o?.monto } })
ok('Ocurrencia creada en Programado vinculada al rubro', st.estado === 'Programado' && st.serie && st.oc && st.nombre === 'Gas natural' && st.monto === 85000)
// pagar desde Programado → rubro Pagado, siguiente mes creado
await tab('Progr.'); await page.locator('[data-item="Gas natural"] button', { hasText: /^Pagar$/ }).click(); await wait(200); await submit('Registrar pago'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const rs = T.presupuesto.filter(x => x.concepto === 'Gas natural').sort((a, b) => a.periodo.localeCompare(b.periodo)); const m = T.movimientos.find(x => x.descripcion === 'Gas natural' && x.tipo === 'Salida'); return { n: rs.length, e0: rs[0]?.estado, e1: rs[1]?.estado, auto: rs[1]?.auto_creado, link: m?.presupuesto_id === rs[0]?.id, oc1: T.programado.filter(x => x.nombre === 'Gas natural' && x.estado === 'Pendiente').length } })
ok('Pago desde Programado: rubro de este mes Pagado, el del mes siguiente creado y Programado, movimiento ligado al rubro', st.n === 2 && st.e0 === 'Pagado' && st.e1 === 'Programado' && st.auto === true && st.link && st.oc1 === 1)
// CSV con programar = sí y periodo distinto
await tab('Presup.'); await page.locator('button[title="Importar CSV"]').click(); await wait(150)
const mesSig = new Date(); mesSig.setMonth(mesSig.getMonth() + 2); const mm = String(mesSig.getMonth() + 1).padStart(2, '0'), yy = mesSig.getFullYear()
await page.setInputFiles('input[type=file]', { name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(`concepto,monto,fecha,periodo,programar,periodicidad\nSeguro carro,120000,05/${mm}/${yy},${mm}/${yy},sí,Mensual\nRegalos,200000,,${mm}/${yy},no,\n`) }); await wait(400)
ok('CSV: fila con programar=sí y periodo futuro reconocida', /se programa mensual/.test(await T()) && /Regalos/.test(await T()))
await submit('Importar 2'); await wait(500)
st = await DB(() => { const T = window.__sb._T; const a = T.presupuesto.find(x => x.concepto === 'Seguro carro'); const b = T.presupuesto.find(x => x.concepto === 'Regalos'); const o = T.programado.find(x => x.presupuesto_id === a?.id); return { pa: a?.periodo, ea: a?.estado, eb: b?.estado, pb: b?.periodo, oc: !!o, per: o?.periodicidad } })
ok('CSV importado: "Seguro carro" programado mensual en su periodo; "Regalos" solo en presupuesto', st.pa === `${yy}-${mm}-01` && st.ea === 'Programado' && st.oc && st.per === 'Mensual' && st.eb === 'Planificado' && st.pb === `${yy}-${mm}-01`)
// desprogramar
await page.locator('select').first().selectOption({ index: 0 }); await wait(150)
const sel2 = page.locator('select').first(); const opts = await sel2.locator('option').allTextContents(); const iOpt = opts.findIndex(o => o.toLowerCase().startsWith(mesSig.toLocaleDateString('es-CO', { month: 'long' }))); if (iOpt >= 0) { await sel2.selectOption({ index: iOpt }); await wait(200) }
await page.locator('[data-item="Seguro carro"] button', { hasText: /^Desprogramar$/ }).click(); await wait(300)
st = await DB(() => { const T = window.__sb._T; const a = T.presupuesto.find(x => x.concepto === 'Seguro carro'); return { e: a?.estado, oc: T.programado.filter(x => x.nombre === 'Seguro carro' && x.estado === 'Pendiente').length } })
ok('Desprogramar: rubro vuelve a Planificado y la ocurrencia pendiente desaparece', st.e === 'Planificado' && st.oc === 0)
await page.screenshot({ path: 'test/shot-presup-prog.png', fullPage: true })

await tab('Config'); await click('button', { hasText: 'Avisos' }); ok('Ajustes → Avisos: sección de avisos push', /Avisos de vencimientos/.test(await T()) && /7:00/.test(await T()))

// ===== Importar movimientos (formato MonAi) con reimportación sin duplicados =====
await cambiarEspacio('Personal'); await tab('Movim.'); await page.locator('button[title="Importar CSV"]').click(); await wait(150)
const monai = `date,purpose,amount,currency,original_amount,original_currency,exchange_rate,category,emoji,creator,creator_name,tags,timezone,id,recurrence_id,recurrence_interval
2026-09-03,Supermercado Carulla,-245000,COP,-245000,COP,1,Mercado,🛒,u1,Amigo,hogar,America/Bogota,m-001,,
2026-09-05,Pago cliente ACME,3200000,COP,3200000,COP,1,Honorarios,💼,u1,Amigo,"trabajo, acme",America/Bogota,m-002,,
2026-09-07,Uber,-18500,COP,-18500,COP,1,Transporte,🚗,u1,Amigo,,America/Bogota,m-003,,
2026-09-08,Netflix,-26900,USD,-6.5,USD,4138,Suscripciones,📺,u1,Amigo,,America/Bogota,m-004,r1,monthly
`
await page.setInputFiles('input[type=file]', { name: 'monai.csv', mimeType: 'text/csv', buffer: Buffer.from(monai) }); await wait(400)
ok('CSV de MonAi reconocido: regla por signo sugerida, 4 filas a importar, categorías nuevas detectadas', /Archivo de MonAi reconocido/.test(await T()) && /Por el signo del monto[^<]*sugerido/.test(await T()) && /Suscripciones/.test(await T()))
await page.locator('select').last().selectOption({ label: 'Bancolombia Andrés' }); await submit('Importar 4'); await wait(600)
st = await DB(() => { const T = window.__sb._T; const ms = T.movimientos.filter(m => m.origen === 'importacion'); return { n: ms.length, ing: ms.filter(m => m.tipo === 'Ingreso').map(m => m.monto), sal: ms.filter(m => m.tipo === 'Salida').reduce((a, m) => a + m.monto, 0), refs: ms.map(m => m.ref_externa).sort(), etq: (ms.find(m => m.ref_externa === 'm-002')?.etiqueta_ids || []).map(id => T.etiquetas.find(e => e.id === id)?.nombre).sort(), cat: !!T.categorias.find(c => c.nombre === 'Suscripciones') } })
ok('4 movimientos importados: 1 ingreso de 3.200.000, salidas 290.400, referencias guardadas, tags → etiquetas, categoría creada', st.n === 4 && JSON.stringify(st.ing) === '[3200000]' && st.sal === 290400 && JSON.stringify(st.refs) === '["m-001","m-002","m-003","m-004"]' && JSON.stringify(st.etq) === '["acme","trabajo"]' && st.cat)
await page.locator('button[title="Importar CSV"]').click(); await wait(150)
await page.setInputFiles('input[type=file]', { name: 'monai2.csv', mimeType: 'text/csv', buffer: Buffer.from(monai + '2026-09-09,Farmacia,-42000,COP,-42000,COP,1,Salud,💊,u1,Amigo,,America/Bogota,m-005,,\n') }); await wait(400)
ok('Reimportar: 4 ya importadas se omiten y solo entra la nueva', /Importar 1$/m.test(await T()) || (await page.locator('button', { hasText: /^Importar 1$/ }).count()) === 1)
await submit('Importar 1'); await wait(500)
st = await DB(() => window.__sb._T.movimientos.filter(m => m.origen === 'importacion').length); ok('Sin duplicados tras reimportar (5 en total)', st === 5)
await page.screenshot({ path: 'test/shot-import-mov.png', fullPage: true })

// ===== Saldos de apertura: cuenta con saldo inicial + fecha de corte; crédito con cuotas previas =====
await tab('Config'); await click('button', { hasText: 'Cuentas' })
await page.locator('button[aria-label="Editar Bancolombia Andrés"]').click(); await wait(200)
const saldoAntes = await DB(() => { const T = window.__sb._T; const c = T.cuentas.find(x => x.nombre === 'Bancolombia Andrés'); let s = 0; for (const m of T.movimientos.filter(m => m.espacio_id === c.espacio_id)) { const v = +m.monto; if (m.cuenta_id === c.id) { if (m.tipo === 'Ingreso' || (m.tipo === 'Transferencia' && ['recibido', 'devolucion'].includes(m.subtipo))) s += v; else s -= v } if (m.subtipo === 'traslado' && m.cuenta_destino_id === c.id) s += v } return s })
await page.locator('label:has-text("Saldo al empezar (COP)")').last().locator('xpath=following-sibling::*[1]').fill('1000000'); await page.locator('label:has-text("Fecha de corte")').last().locator('xpath=following-sibling::*[1]').fill('2026-09-30'); await submit('Guardar'); await wait(300)
const septNeto = await DB(() => { const T = window.__sb._T; const c = T.cuentas.find(x => x.nombre === 'Bancolombia Andrés'); return T.movimientos.filter(m => m.cuenta_id === c.id && m.fecha <= '2026-09-30').reduce((a, m) => a + (m.tipo === 'Ingreso' ? +m.monto : -m.monto), 0) })
await tab('Inicio')
const esperado = 1000000 + saldoAntes - septNeto
ok(`Saldo = saldo inicial + movimientos posteriores al corte (${esperado.toLocaleString('es-CO')}); el histórico de septiembre no lo altera`, new RegExp('Bancolombia Andrés[\\s\\S]{0,40}\\$ ' + esperado.toLocaleString('es-CO').replace(/\./g, '\\.')).test(await T()))
await tab('Deudas'); await click('button', { hasText: 'Nuevo' })
await fillLabel('Nombre', 'Crédito viejo'); await fillLabel('Capital inicial', 10000000); await fillLabel('Tasa mensual (%)', 1); await fillLabel('Total cuotas', 10); await fillLabel('Primera cuota', '2026-01-01'); await fillLabel('Cuotas ya pagadas antes de la app', 4); await submit('Guardar'); await wait(300)
ok('Crédito con 4 cuotas previas: 4/10 pagadas y próxima N° 5, sin movimientos de caja', /4\/10 cuotas pagadas/.test(await T()) && /N° 5/.test(await T()) && (await DB(() => window.__sb._T.movimientos.filter(m => /Crédito viejo/.test(m.descripcion)).length)) === 0)

// ===== Extracto de tarjeta (PDF leído en el servidor; aquí se simula la respuesta del lector) =====
const NU = { modo: 'texto', estado: { banco: 'Nu', periodo_inicio: '2026-09-11', periodo_fin: '2026-10-11', fecha_corte: '2026-10-12', fecha_limite: '2026-11-03', cupo: 400000, utilizado: 284221.95, disponible: 115778.05, pago_total: 249561.95, pago_minimo: 60749.09, intereses: 4558.36, mora: 115.85, cuota_manejo: 0, seguro: null, abonos: 258.8 },
  compras: [{ fecha: '2026-09-12', descripcion: 'Apple.Com Bill', monto: 29900, moneda_original: 'COP', cuotas: 1, cuota_actual: 1, cuotas_previas: 0, tasa_mensual: 2.12, saldo_pendiente: 0 }, { fecha: '2026-04-23', descripcion: 'Claude.Ai Subscription', monto: 71377.6, moneda_original: 'COP', cuotas: 24, cuota_actual: 6, cuotas_previas: 5, tasa_mensual: 1.97, saldo_pendiente: 53533.18 }, { fecha: '2024-12-06', descripcion: 'Openai *Chatgpt Subscr', monto: 88491.2, moneda_original: 'COP', cuotas: 24, cuota_actual: 23, cuotas_previas: 22, tasa_mensual: 1.96, saldo_pendiente: 2586.61 }],
  otros: [{ fecha: '2026-10-08', descripcion: 'Gracias por tu pago', tipo: 'pago', monto: 34355.12 }], advertencias: [] }
let cuerpoLectura = null
await page.route('**/.netlify/functions/extracto-leer-background', async route => { const b = JSON.parse(route.request().postData()); cuerpoLectura = b; await page.evaluate(([id, r]) => { const l = window.__sb._T.tc_lecturas.find(x => x.id === id); Object.assign(l, { estado: 'lista', resultado: r }) }, [b.lectura_id, NU]); await route.fulfill({ status: 202, body: '' }) })
await cambiarEspacio('Personal'); await tab('Config'); await click('button', { hasText: 'Cuentas' })
await fillLabel('Nombre', 'Nu Mastercard'); await selectLabel('Tipo', 'Tarjeta crédito'); await fillLabel('Cupo (COP)', 300000); await fillLabel('Tasa mensual (%)', 2.0); await fillLabel('Día de corte', 12); await click('button', { hasText: 'Agregar cuenta' })
await tab('Deudas'); await page.locator('[data-item="Nu Mastercard"] button[title="Cargar extracto"]').click(); await wait(200)
ok('Cargar extracto: modal con explicación de privacidad (el PDF no sale del dispositivo, se tachan identificadores)', /Cargar extracto · Nu Mastercard/.test(await T()) && /no sale de tu dispositivo/.test(await T()) && /se tachan/.test(await T()))
await page.setInputFiles('input[type=file]', { name: 'nu.pdf', mimeType: 'application/pdf', buffer: PDF_PRUEBA }); await wait(3500)
ok('Al servidor viaja solo texto extraído en el dispositivo (sin archivo), con las compras legibles', !!cuerpoLectura && !cuerpoLectura.base64 && /Compra de prueba numero 3/.test(cuerpoLectura.texto))
ok('Vista previa: estado del extracto (pago total, mínimo, límite) y 3 compras nuevas con cuotas previas', /249\.562/.test(await T()) && /60\.749/.test(await T()) && /03\/11\/2026/.test(await T()) && /Compras nuevas[\s\S]*3/.test(await T()) && /5 cuotas ya pagadas antes de la app/.test(await T()))
ok('Cupo distinto: ofrece actualizarlo a 400.000', /Actualizar el cupo de la tarjeta a \$ 400\.000/.test(await T()))
await submit('Aplicar (3 nuevas, 0 ajustes)'); await wait(600)
st = await DB(() => { const T = window.__sb._T; const tc = T.cuentas.find(c => c.nombre === 'Nu Mastercard'); const cs = T.tc_cargos.filter(c => c.cuenta_id === tc.id); const ex = T.tc_extractos.find(x => x.cuenta_id === tc.id); return { n: cs.length, previas: cs.map(c => c.cuotas_previas).sort((a, b) => a - b), refs: cs.every(c => c.ref_extracto), cupo: tc.cupo, ex: ex && ex.pago_total, lim: ex && ex.fecha_limite } })
ok('Aplicado: 3 compras con cuotas previas 0/5/22, huella guardada, cupo actualizado, estado del extracto guardado', st.n === 3 && JSON.stringify(st.previas) === '[0,5,22]' && st.refs && st.cupo === 400000 && st.ex === 249561.95 && st.lim === '2026-11-03')
ok('La tarjeta muestra el extracto: pago total, mínimo y fecha límite', /Extracto del 12\/10\/2026 · Nu/.test(await T()) && /Pago total \$ 249\.562 · mínimo \$ 60\.749/.test(await T()) && /Paga antes del 03\/11\/2026/.test(await T()))
ok('Saldo de la tarjeta refleja las cuotas previas (ChatGPT casi liquidado: 1 cuota pendiente)', (await DB(() => { const T = window.__sb._T; const c = T.tc_cargos.find(c => c.descripcion === 'Openai *Chatgpt Subscr'); return c.cuotas - c.cuotas_previas })) === 2)
// segunda carga del mismo extracto → nada nuevo
await page.locator('[data-item="Nu Mastercard"] button[title="Cargar extracto"]').click(); await wait(150); await page.setInputFiles('input[type=file]', { name: 'nu.pdf', mimeType: 'application/pdf', buffer: PDF_PRUEBA }); await wait(3500)
ok('Recargar el mismo extracto: 3 ya registradas, 0 nuevas', /Ya registradas[\s\S]*3/.test(await T()) && (await page.locator('button', { hasText: 'Aplicar (0 nuevas, 0 ajustes)' }).count()) === 1)
await page.locator('button[aria-label="Cerrar"]').click(); await wait(150)
await page.unroute('**/.netlify/functions/extracto-leer-background')
await page.screenshot({ path: 'test/shot-extracto.png', fullPage: true })

// ===== Lote 5 · perfil, ofertas, operador, privacidad =====
await cambiarEspacio('Personal'); await wait(8600)   // los eventos se envían por lotes cada 8 s
st = await DB(() => window.__sb._T.eventos.filter(e => e.user_id === 'u-andres').map(e => e.tipo))
ok('Eventos de uso registrados con finalidad analítica (pantallas y acciones)', st.includes('pantalla') && st.includes('accion'))
// perfil calculado "por la tarea nocturna" (se simula) con una señal y su oferta
await DB(() => { const T = window.__sb._T; T.perfil_usuario.push({ user_id: 'u-andres', codigo: 'U-TEST01', indicadores: { salud: 72, salud_explicacion: 'Puntualidad 20/30 · presupuesto 25/25 · carga de deuda 15/25 · registro 5/10 · patrimonio 10/10.', puntualidad_pct: 67, creditos_activos: 2, patrimonio_neto: 35600000 }, senales: ['creditos_multiples'], calculado_en: new Date().toISOString() }); T.ofertas.push({ id: 'of1', user_id: 'u-andres', senal: 'creditos_multiples', estado: 'mostrada', creado_en: new Date().toISOString() }) })
await cambiarEspacio('Casa Quijano'); await cambiarEspacio('Personal'); await tab('Inicio')
ok('Inicio muestra la oferta de Kontbox (finalidad comercial aceptada)', /Kontbox puede ayudarte/.test(await T()) && /Reestructuración/.test(await T()))
await click('div:has-text("Kontbox puede ayudarte") >> nth=-1'); await wait(300)
await page.screenshot({ path: 'test/shot-mi-perfil.png', fullPage: true })
ok('Tocar la oferta abre Mi perfil con código, salud y situaciones', /Mi perfil/.test(await T()) && /U-TEST01/.test(await T()) && /72/.test(await T()) && /Varios créditos activos/.test(await T()))
st = await DB(() => window.__sb._T.ofertas[0].estado); ok('Oferta pasa a "tocada"', st === 'tocada')
await click('button', { hasText: 'Me interesa, que me contacten' }); await wait(300)
st = await DB(() => window.__sb._T.ofertas[0].estado); ok('Oferta aceptada por el usuario', st === 'aceptada' && /Kontbox te escribirá/.test(await T()))
// operador (Andrés tiene rol en el mock)
await tab('Config'); await click('button', { hasText: 'Privacidad' })
await page.screenshot({ path: 'test/shot-privacidad.png', fullPage: true })
ok('Privacidad: finalidades con interruptores y derechos (descargar, eliminar)', (await page.locator('[role=switch]').count()) === 4 && /Descargar mis datos/.test(await T()) && /Eliminar mi cuenta/.test(await T()))
await click('button', { hasText: 'Abrir el panel del operador' }); await click('button', { hasText: 'Cargar panel' }); await wait(300)
await page.screenshot({ path: 'test/shot-operador.png', fullPage: true })
ok('Panel del operador: resumen anónimo y perfil seudonimizado con oferta aceptada', /Resumen \(anónimo\)/.test(await T()) && /U-TEST01/.test(await T()) && /creditos_multiples: aceptada/.test(await T()))
await click('button', { hasText: 'Identificar para contactar' }); await page.fill('input[placeholder^="Motivo"]', 'Seguimiento a oferta aceptada'); await submit('Revelar identidad'); await wait(300)
ok('Identificación con motivo revela correo y queda registrada', /u-andres@test.co/.test(await T()) && (await DB(() => window.__sb._T.accesos_operador.some(a => a.accion === 'identificar' && a.motivo === 'Seguimiento a oferta aceptada'))))
await page.locator('button[aria-label="Cerrar"]').click(); await wait(150)
await click('button', { hasText: /^Venta$/ }); await wait(300)
st = await DB(() => window.__sb._T.ofertas[0]); ok('Resultado "venta" anotado: oferta convertida (la señal se mide)', st.estado === 'convertida' && st.resultado === 'venta')
// retirar finalidad perfil borra el perfil
await tab('Config'); await click('button', { hasText: 'Privacidad' }); await page.locator('[role=switch]').nth(2).click(); await wait(300)
st = await DB(() => window.__sb._T.perfil_usuario.filter(p => p.user_id === 'u-andres').length); ok('Retirar la finalidad "perfil" borra el perfil calculado', st === 0 && /retirada/.test(await T()))
await page.locator('[role=switch]').nth(2).click(); await wait(300)
// Esposa: sin comercial → sin ofertas; sin analítica → sin eventos
await loginAs('u-esposa', 'esposa@test.co', { sinAnalitica: true })
await DB(() => { const T = window.__sb._T; T.perfil_usuario.push({ user_id: 'u-esposa', codigo: 'U-TEST02', indicadores: { salud: 50 }, senales: ['activos_sin_cobertura'], calculado_en: new Date().toISOString() }) })
await cambiarEspacio('Casa Quijano'); await cambiarEspacio('Personal'); await page.locator('button[aria-label="Mi perfil"]').click(); await wait(300)
ok('Esposa ve su perfil sin ofertas (no autorizó la finalidad comercial)', /U-TEST02/.test(await T()) && /No autorizaste ofertas comerciales/.test(await T()) && !/Ofertas de Kontbox/.test(await T()))
await cambiarEspacio('Personal'); await tab('Deudas'); await wait(8600)
st = await DB(() => window.__sb._T.eventos.filter(e => e.user_id === 'u-esposa').length); ok('Esposa sin analítica: ningún evento registrado', st === 0)
await loginAs('u-andres', 'andres@test.co')

// ── Lote 7 · pagos reales, saldo según extracto, etiquetas ──────────────────
await cambiarEspacio('Personal'); await tab('Deudas'); await click('button', { hasText: 'Nuevo' })
await fillLabel('Nombre', 'Libre inversión'); await fillLabel('Capital inicial', 12000000); await fillLabel('Tasa mensual (%)', 1.5); await fillLabel('Total cuotas', 12); await fillLabel('Cuotas ya pagadas antes de la app', 2); const hace2 = new Date(); hace2.setMonth(hace2.getMonth() - 3); await fillLabel('Primera cuota', hace2.toISOString().slice(0, 10)); await fillLabel('Saldo real hoy según extracto (opcional)', 10480000); await submit('Guardar'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const d = T.deudas.find(x => x.nombre === 'Libre inversión'); const a = T.ajustes_saldo_deuda.find(x => x.deuda_id === d.id); return { a: !!a, n: a?.despues_de_cuota, s: a?.saldo_real } })
ok('Crédito con saldo real al crear: ajuste registrado tras las 2 cuotas previas', st.a && st.n === 2 && st.s === 10480000 && /saldo según extracto/.test(await T()))
ok('Saldo capital mostrado = saldo real (10.480.000)', /10\.480\.000/.test(await T()))
// Pago con valor real distinto: reparte la diferencia
await page.locator('[data-item="Libre inversión"] button', { hasText: 'Pagar cuota 3' }).first().click(); await wait(200)
ok('Modal de pago muestra cuota calculada y pide el valor pagado', /Cuota calculada/.test(await T()) && /¿Cuánto pagaste realmente\?/.test(await T()))
const cuotaCalc = +((await T()).match(/Cuota calculada\s*\$ ([\d.]+)/)?.[1] || '0').replace(/\./g, '')
await page.locator('input[aria-label="Valor pagado"]').fill(String(cuotaCalc + 15000)); await wait(150)
ok('Diferencia detectada: pide repartir 15.000', /Pagaste \$ 15\.000 más que la cuota/.test(await T()) && /Falta explicar \$ 15\.000/.test(await T()))
ok('Botón bloqueado hasta explicar la diferencia', await page.locator('button', { hasText: 'Registrar pago' }).last().isDisabled())
await fillLabel('Intereses de mora', 12000); await fillLabel('Otro concepto', 3000); await wait(100)
ok('"Otro concepto" exige detalle', /¿Qué es ese otro concepto\?/.test(await T()) && await page.locator('button', { hasText: 'Registrar pago' }).last().isDisabled())
await fillLabel('¿Qué es ese otro concepto?', 'Comisión por canal'); await wait(100)
ok('Diferencia explicada → se puede registrar', /La diferencia queda explicada/.test(await T()) && !(await page.locator('button', { hasText: 'Registrar pago' }).last().isDisabled()))
await submit('Registrar pago'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const d = T.deudas.find(x => x.nombre === 'Libre inversión'); const m = T.movimientos.filter(x => x.deuda_id === d.id); return { n: m.length, monto: +m[0]?.monto, mora: m[0]?.desglose?.mora, det: m[0]?.desglose?.otros_detalle, esperado: m[0]?.desglose?.esperado } })
ok('Un solo movimiento por el valor real, con mora y detalle en el desglose', st.n === 1 && st.monto === st.esperado + 15000 && st.mora === 12000 && st.det === 'Comisión por canal')
// Pago parcial exige motivo
await page.locator('[data-item="Libre inversión"] button', { hasText: 'Pagar cuota 4' }).first().click(); await wait(200)
const cc2 = +((await T()).match(/Cuota calculada\s*\$ ([\d.]+)/)?.[1] || '0').replace(/\./g, '')
await page.locator('input[aria-label="Valor pagado"]').fill(String(cc2 - 200000)); await wait(150)
ok('Pago parcial: aviso y motivo obligatorio', /pago parcial/.test(await T()) && await page.locator('button', { hasText: 'Registrar pago' }).last().isDisabled())
await fillLabel('Motivo del pago parcial', 'Acuerdo con el banco'); await submit('Registrar pago'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const d = T.deudas.find(x => x.nombre === 'Libre inversión'); const m = T.movimientos.filter(x => x.deuda_id === d.id).sort((a, b) => a.desglose.cuota - b.desglose.cuota)[1]; return { monto: +m?.monto, parcial: m?.desglose?.parcial, motivo: m?.motivo } })
ok('Pago parcial registrado por lo que salió de caja, con motivo', st.parcial === -200000 && /Acuerdo con el banco/.test(st.motivo || ''))
// Ajustar saldo después
await page.locator('[data-item="Libre inversión"] button', { hasText: 'Ver tabla' }).first().click(); await wait(200); await page.locator('[data-item="Libre inversión"] button[title="Ajustar saldo según extracto"]').first().click(); await wait(200)
ok('Modal de ajuste muestra saldo calculado y cuotas restantes', /La app calcula un saldo de capital/.test(await T()) && /8 cuotas restantes/.test(await T()))
await page.locator('input[aria-label="Saldo real"]').fill('9000000'); await wait(100)
ok('Avisa en qué dirección cambia la cuota', /la cuota (subirá|bajará)/.test(await T()))
await submit('Ajustar saldo'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const d = T.deudas.find(x => x.nombre === 'Libre inversión'); return { aj: T.ajustes_saldo_deuda.filter(x => x.deuda_id === d.id).length, mov: T.movimientos.filter(x => x.deuda_id === d.id).length } })
ok('Ajuste posterior registrado sin movimiento de caja', st.aj === 2 && st.mov === 2 && /9\.000\.000/.test(await T()))
// Inicio: deuda vs costo financiero
await tab('Inicio'); ok('Inicio separa capital pagado de costo financiero', /Deuda y costo financiero/.test(await T()) && /Capital pagado/.test(await T()) && /Intereses de mora/.test(await T()) && /sin capital de deudas/.test(await T()))
// Etiquetas: crear en Ajustes, usar en movimiento, filtrar, ver en Inicio
await tab('Config'); await click('button', { hasText: 'Etiquetas' }); await page.fill('input[placeholder="Nueva etiqueta…"]', 'Mateo'); await page.locator('button[aria-label="Agregar etiqueta"]').click(); await wait(200)
await page.fill('input[placeholder="Nueva etiqueta…"]', 'mateo'); await page.locator('button[aria-label="Agregar etiqueta"]').click(); await wait(200)
ok('Etiqueta creada; duplicada (mayúsculas) rechazada', (await page.locator('[data-etiqueta="Mateo"]').count()) >= 1 && /Ya existe/.test(await T()))
await tab('Movim.'); await plusBtn(); await fillLabel('Descripción', 'Uniforme colegio'); await fillLabel('Monto (COP)', 90000)
await page.locator('[data-etiqueta="Mateo"]').last().click(); await page.locator('button', { hasText: '+ nueva' }).click(); await page.fill('input[placeholder="Nombre y Enter"]', 'Familia'); await page.keyboard.press('Enter'); await wait(250)
await submit('Registrar'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const m = T.movimientos.find(x => x.descripcion === 'Uniforme colegio'); return { n: m?.etiqueta_ids?.length, fam: T.etiquetas.some(e => e.nombre === 'Familia') } })
ok('Movimiento con dos etiquetas (una creada al vuelo desde el formulario)', st.n === 2 && st.fam)
await page.locator('[data-etiqueta="Mateo"]').first().click(); await wait(200)
ok('Filtro por etiqueta: solo el movimiento de Mateo, con total', /Uniforme colegio/.test(await T()) && /1 salidas · \$ 90\.000/.test(await T()) && !/Mercado Éxito/.test(await T()))
await page.locator('[data-etiqueta="Mateo"]').first().click(); await wait(100)
await page.locator('button[aria-label^="Etiquetar Libre inversión"]').first().click(); await wait(200); await page.locator('[data-etiqueta="Familia"]').last().click(); await submit('Guardar etiquetas'); await wait(300)
st = await DB(() => { const T = window.__sb._T; const d = T.deudas.find(x => x.nombre === 'Libre inversión'); return T.movimientos.filter(x => x.deuda_id === d.id).some(m => m.etiqueta_ids.length === 1) })
ok('Pago de crédito existente etiquetado después', st)
await tab('Inicio'); ok('Inicio: totales por etiqueta', /Por etiqueta/.test(await T()) && /Mateo/.test(await T()) && /Familia/.test(await T()))
await page.screenshot({ path: 'test/shot-inicio-lote7.png', fullPage: true })
// Programado con etiqueta → el movimiento la hereda; mover rubro al hogar crea la etiqueta allá
await tab('Progr.'); await plusBtn(); await fillLabel('Nombre', 'Natación Mateo'); await fillLabel('Monto (COP)', 120000); await page.locator('[data-etiqueta="Mateo"]').last().click(); await submit('Guardar'); await wait(300)
await page.locator('[data-item="Natación Mateo"] button', { hasText: /^Pagar$/ }).first().click(); await wait(200); await submit('Registrar pago'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const m = T.movimientos.find(x => x.descripcion === 'Natación Mateo'); return m && m.etiqueta_ids.length === 1 })
ok('Movimiento nacido de un programado hereda la etiqueta', st)
await tab('Presup.'); await plusBtn(); await fillLabel('Concepto', 'Colegio Mateo'); await fillLabel('Monto (COP)', 800000); await page.locator('[data-etiqueta="Mateo"]').last().click(); await submit('Guardar'); await wait(300)
ok('Rubro de presupuesto con etiqueta', (await page.locator('[data-item="Colegio Mateo"] [data-etiqueta="Mateo"]').count()) === 1)
st = await DB(async () => { const T = window.__sb._T; const h = T.espacios.find(e => e.tipo === 'hogar').id; const p = T.presupuesto.find(x => x.concepto === 'Colegio Mateo'); await window.__sb.rpc('mover_item', { p_tabla: 'presupuesto', p_id: p.id, p_destino: h }); const e = T.etiquetas.find(x => x.id === p.etiqueta_ids[0]); return { h: p.espacio_id === h, e: e?.espacio_id === h && e?.nombre === 'Mateo' } })
ok('Mover rubro etiquetado al hogar: la etiqueta se crea allá con el mismo nombre', st.h && st.e)

// ── Extracto Falabella/CMR: plan según el banco ("4 de 1"), compras sin tasa, intereses como línea de la factura ──
const FA = { modo: 'texto', estado: { banco: 'Banco Falabella', fecha_corte: '2026-10-14', fecha_limite: '2026-10-31', cupo: 4000000, utilizado: 4014522.44, pago_total: 4014522.44, pago_minimo: 1542890.69, intereses: 68712.5, cuota_manejo: 31990, seguro: 4990, mora: 1739.1, abonos: 692891.45 },
  compras: [{ fecha: '2024-07-30', descripcion: 'COLCHONES SPRING 247 CCO EM', monto: 992982, moneda_original: 'COP', cuotas: 36, cuota_actual: 27, cuotas_previas: 26, tasa_mensual: 2.118, valor_cuota_mes: 16814.37, saldo_pendiente: 151329.39 }, { fecha: '2026-06-20', descripcion: 'ADIDAS OUTLET CL 5 55 00 LC', monto: 500000, moneda_original: 'COP', cuotas: 1, cuota_actual: 4, cuotas_previas: 0, tasa_mensual: 2.118, valor_cuota_mes: 83333.33, saldo_pendiente: 166666.68 }, { fecha: '2026-10-06', descripcion: 'PAYU PAGOSONLINE CLL 99 14-', monto: 253600, moneda_original: 'COP', cuotas: 1, cuota_actual: 1, cuotas_previas: 0, tasa_mensual: 2.118, valor_cuota_mes: 253600, saldo_pendiente: 0 }],
  otros: [], advertencias: [] }
await page.route('**/.netlify/functions/extracto-leer-background', async route => { const b = JSON.parse(route.request().postData()); await page.evaluate(([id, r]) => { const l = window.__sb._T.tc_lecturas.find(x => x.id === id); Object.assign(l, { estado: 'lista', resultado: r }) }, [b.lectura_id, FA]); await route.fulfill({ status: 202, body: '' }) })
await tab('Config'); await click('button', { hasText: 'Cuentas' })
await fillLabel('Nombre', 'CMR Falabella'); await selectLabel('Tipo', 'Tarjeta crédito'); await fillLabel('Cupo (COP)', 4000000); await fillLabel('Tasa mensual (%)', 2.1); await fillLabel('Día de corte', 14); await click('button', { hasText: 'Agregar cuenta' })
await tab('Deudas'); await page.locator('[data-item="CMR Falabella"] button[title="Cargar extracto"]').click(); await wait(200)
await page.setInputFiles('input[type=file]', { name: 'cmr.pdf', mimeType: 'application/pdf', buffer: PDF_PRUEBA }); await wait(3500)
ok('Vista previa corrige el plan: "4 de 1" → 6 cuotas y capital financiado de COLCHONES', /por el saldo pendiente son 6 cuotas/.test(await T()) && /capital financiado 605\.317/.test(await T()))
await submit('Aplicar (3 nuevas, 0 ajustes)'); await wait(600)
st = await DB(() => { const T = window.__sb._T; const tc = T.cuentas.find(c => c.nombre === 'CMR Falabella'); const cs = T.tc_cargos.filter(c => c.cuenta_id === tc.id); const ad = cs.find(c => /ADIDAS/.test(c.descripcion)), co = cs.find(c => /COLCHONES/.test(c.descripcion)); return { n: cs.length, ad: [ad.cuotas, ad.cuotas_previas, ad.monto, ad.tasa_mensual], co: [co.cuotas, co.cuotas_previas, Math.round(co.monto), co.tasa_mensual] } })
ok('Compras del extracto: ADIDAS 6 cuotas/3 previas/500.000/sin tasa; COLCHONES 36/26/605.317/sin tasa', st.n === 3 && JSON.stringify(st.ad) === '[6,3,500000,0]' && JSON.stringify(st.co) === '[36,26,605317,0]')
await page.locator('[data-item="CMR Falabella"] button', { hasText: 'Pagar factura' }).first().click(); await wait(250)
ok('Factura: cuotas de capital (83.333 + 16.814 + 253.600) e intereses del extracto como línea aparte (68.713)', /83\.333/.test(await T()) && /16\.814/.test(await T()) && (await page.locator('label:has-text("Intereses corrientes")').first().locator('xpath=following-sibling::*[1]').inputValue()) === '68712.5')
const totalFa = (await T()).match(/TOTAL A PAGAR[^$]*\$ ([\d.]+)/)?.[1]
ok('Total de la factura = capital de las 3 cuotas (353.747) + intereses + manejo + seguro + mora (107.432) = 461.179', totalFa === '461.179')
await submit('Registrar pago'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const m = T.movimientos.find(x => x.origen === 'tarjeta' && /CMR Falabella/.test(x.descripcion)); return { monto: Math.round(+m.monto), int: m.desglose.extras.intereses, cap: Math.round(m.desglose.capital) } })
ok('Pago registrado: un movimiento por el total (461.179), capital 353.747 e intereses 68.713 en el desglose', Math.abs(st.monto - 461179) <= 1 && st.int === 68713 && st.cap === 353747)
await tab('Inicio'); ok('Inicio: los intereses de la tarjeta suman al costo financiero', /Intereses/.test(await T()) && /Cuota de manejo y comisiones/.test(await T()))
await page.unroute('**/.netlify/functions/extracto-leer-background')
await page.screenshot({ path: 'test/shot-extracto-falabella.png', fullPage: true })

// ── Cambiar la cuenta de un movimiento ya registrado (con confirmación y registro) · cuenta de pago al final de la factura ──
await tab('Config'); await click('button', { hasText: 'Cuentas' }); await fillLabel('Nombre', 'Nequi'); await click('button', { hasText: 'Agregar cuenta' })
await tab('Deudas'); await page.locator('[data-item="CMR Falabella"] button', { hasText: 'Pagar factura' }).first().click(); await wait(250)
st = await DB(() => { const labels = [...document.querySelectorAll('label')].map(l => l.textContent); const btn = [...document.querySelectorAll('button')].find(b => /Registrar pago/.test(b.textContent)); const sel = document.querySelector('select[aria-label], label + select'); const cta = [...document.querySelectorAll('label')].find(l => /Desde qué cuenta pagas/.test(l.textContent)); return { idx: labels.findIndex(l => /Desde qué cuenta pagas/.test(l)), n: labels.length, cerca: cta && btn ? btn.getBoundingClientRect().top - cta.getBoundingClientRect().top : 9999 } })
ok('Factura: la cuenta de pago es el último campo, justo encima del botón', st.idx === st.n - 1 && st.cerca > 0 && st.cerca < 160)
await page.locator('button[aria-label="Cerrar"]').click(); await wait(150)
await tab('Movim.')
await page.locator('button[aria-label^="Cambiar cuenta de Pago factura CMR"]').first().click(); await wait(200)
ok('Modal de cambio: muestra cuenta actual, pide cuenta, motivo y confirmación', /hoy en Bancolombia Andrés/.test(await T()) && /Confirmo que el dinero realmente salió/.test(await T()) && await page.locator('button', { hasText: 'Cambiar cuenta' }).last().isDisabled())
await page.locator('select[aria-label="Cuenta correcta"]').selectOption({ label: 'Nequi' }); await fillLabel('¿Por qué cambias la cuenta?', 'Pagué sin revisar el medio de pago')
ok('Sin confirmar, el botón sigue bloqueado', await page.locator('button', { hasText: 'Cambiar cuenta' }).last().isDisabled())
await page.locator('input[type=checkbox]').last().check(); await submit('Cambiar cuenta'); await wait(400)
st = await DB(() => { const T = window.__sb._T; const m = T.movimientos.find(x => x.origen === 'tarjeta' && /CMR Falabella/.test(x.descripcion)); const nq = T.cuentas.find(c => c.nombre === 'Nequi'); const c = T.cambios_cuenta.find(x => x.movimiento_id === m.id); return { ok: m.cuenta_id === nq.id, reg: !!c && c.cuenta_despues === nq.id && /sin revisar/.test(c.motivo), n: T.cambios_cuenta.length } })
ok('Cuenta cambiada y registrada con motivo (cambios_cuenta)', st.ok && st.reg && st.n === 1)
ok('La fila muestra el historial del cambio', /Cuenta cambiada el/.test(await T()) && /Bancolombia Andrés → Nequi/.test(await T()))
await tab('Inicio'); ok('El saldo de Nequi refleja el pago movido', /Nequi/.test(await T()) && /-\s?461\.179/.test(await T()))
await page.screenshot({ path: 'test/shot-cambio-cuenta.png', fullPage: true })

// ── Borrar el movimiento de un pago libera las cuotas (0015) ──
await tab('Movim.'); st = await DB(() => { const T = window.__sb._T; const tc = T.cuentas.find(c => c.nombre === 'CMR Falabella'); return T.cuotas_pagadas.filter(c => T.tc_cargos.find(x => x.id === c.cargo_id)?.cuenta_id === tc.id).length })
ok('Antes de borrar: 3 cuotas de la factura CMR marcadas como pagadas', st === 3)
await page.locator('button[aria-label^="Eliminar Pago factura CMR Falabella"]').first().click(); await wait(500)
st = await DB(() => { const T = window.__sb._T; const tc = T.cuentas.find(c => c.nombre === 'CMR Falabella'); return { cuotas: T.cuotas_pagadas.filter(c => T.tc_cargos.find(x => x.id === c.cargo_id)?.cuenta_id === tc.id).length, mov: T.movimientos.filter(m => m.origen === 'tarjeta' && /CMR Falabella/.test(m.descripcion)).length } })
ok('Al borrar el pago, las cuotas vuelven a pendientes y la próxima factura recupera su valor', st.cuotas === 0 && st.mov === 0)
await tab('Deudas'); ok('Deudas: la factura CMR vuelve a mostrar las 3 cuotas por pagar', /CMR Falabella/.test(await T()) && /3 compras activas/.test(await T()))

// Amigo: aislamiento total
await loginAs('u-amigo', 'amigo@test.co'); await page.fill('input[placeholder="Ej. Andrés"]', 'Amigo'); await click('button', { hasText: 'Guardar' }); await wait(200)
await tab('Config'); ok('Amigo solo ve su espacio personal', /Mis espacios/.test(await T()) && !/Casa Quijano/.test(await T()) && !/Kontbox/.test(await T()))
await click('button', { hasText: 'Crear hogar o empresa' }); await fillLabel('Nombre del hogar', 'Casa Amigo'); await submit('Crear'); await wait(400)
await tab('Movim.'); ok('Amigo NO ve movimientos ajenos', !/Mercado/.test(await T()) && /Sin movimientos/.test(await T()))
await tab('Deudas'); ok('Amigo NO ve tarjeta ni crédito ajenos', !/Visa Bancolombia/.test(await T()) && !/Crédito Mazda/.test(await T()))
st = await DB(() => { const T = window.__sb._T; return { esp: T.espacios.length, movA: T.movimientos.filter(m => m.espacio_id === T.espacios.find(e => e.tipo === 'hogar' && e.nombre === 'Casa Amigo').id).length } })
await tab('Config'); await click('button', { hasText: 'Privacidad' }); await click('button', { hasText: 'Eliminar mi cuenta' }); await page.fill('input[placeholder="ELIMINAR"]', 'ELIMINAR'); await submit('Eliminar definitivamente'); await wait(600)
ok('Amigo elimina su cuenta: vuelve al login y sus datos desaparecen', /Enviarme el código por correo/.test(await T()) && (await DB(() => !window.__sb._T.espacios.some(e => e.dueno_id === 'u-amigo') && !window.__sb._T.espacio_miembros.some(m => m.user_id === 'u-amigo'))))
ok('Datos de Amigo aislados', st.movA === 0)

await page.screenshot({ path: 'test/shot-amigo.png' })
await browser.close(); server.close()
console.log(results.map(r => r.join('  ')).join('\n'))
const fails = results.filter(r => r[0] === 'FAIL').length
console.log(`\n${results.length - fails}/${results.length} pruebas OK`)
process.exit(fails ? 1 : 0)
