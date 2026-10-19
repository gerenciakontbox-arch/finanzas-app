// Recorrido end-to-end sobre el bundle de prueba con Playwright + backend en memoria (esquema de espacios).
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

const root = path.resolve('test/dist')
const server = createServer((req, res) => { let p = path.join(root, req.url.split('?')[0]); if (!existsSync(p) || p.endsWith('/')) p = path.join(root, 'index.html'); const ext = path.extname(p); res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' }[ext] || 'application/octet-stream'); res.end(readFileSync(p)) }).listen(4177)

const results = []; const ok = (n, c) => { results.push([c ? 'PASS' : 'FAIL', n]); if (!c) console.log('   ✗', n) }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 200)) })
page.on('dialog', d => d.accept())
const T = () => page.evaluate(() => document.body.innerText)
const DB = fn => page.evaluate(fn)
const wait = ms => page.waitForTimeout(ms)
const NAV = { 'Inicio': ['Inicio'], 'Movim.': ['Movimientos'], 'Deudas': ['Deudas'], 'Presup.': ['Plan', 'Presupuesto'], 'Progr.': ['Plan', 'Programado'], 'Activos': ['Más', 'Activos'], 'Config': ['Más', 'Ajustes'] }
const tab = async l => { const [n, seg] = NAV[l] || [l]; await page.locator('nav button', { hasText: new RegExp('^' + n + '$') }).click(); await wait(150); if (seg) { await page.locator('[role=tab]', { hasText: seg }).click(); await wait(200) } }
const click = async (sel, opt) => { await page.locator(sel, opt).first().click(); await wait(150) }
const submit = async (txt) => { await page.locator('button', { hasText: txt }).last().click(); await wait(250) }
const fillLabel = async (label, v) => { const el = page.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::*[1]'); await el.fill(String(v)) }
const selectLabel = async (label, v) => { const el = page.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::select'); await el.selectOption({ label: v }) }
const plusBtn = async () => { await page.locator('div:has(> button[title="Importar CSV"]) > button').last().click(); await wait(150) }
const cambiarEspacio = async nombre => { await page.locator('button[aria-label="Cambiar de espacio"]').click(); await wait(100); await page.locator('[data-menu="espacios"] button', { hasText: nombre }).first().click(); await wait(400) }
const loginAs = async (uid, mail) => { await DB(() => window.__sb._logout()); await wait(200); await page.evaluate(([u, m]) => window.__sb._login(u, m), [uid, mail]); await wait(500) }

await page.goto('http://localhost:4177/'); await wait(400)
ok('Pantalla de login (Akontapp)', /Enviarme el código por correo/.test(await T()) && /Akontapp/.test(await T()))
await page.fill('input[type=email]', 'andres@test.co'); await click('button', { hasText: 'Enviarme el código' })
ok('Pide el código del correo', /código numérico/.test(await T()))
await page.fill('input[inputmode=numeric]', '999999'); await click('button', { hasText: 'Entrar con el código' }); await wait(200)
ok('Código inválido rechazado', /Código inválido o vencido/.test(await T()))
await page.fill('input[inputmode=numeric]', '123456'); await click('button', { hasText: 'Entrar con el código' }); await wait(500)
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
await tab('Movim.'); await page.locator('div:has(> div > button:has-text("Todos")) > button').last().click(); await wait(150)
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
await page.locator('div:has(> div > button:has-text("Todos")) > button').last().click(); await wait(150)
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
await cambiarEspacio('Kontbox'); await tab('Movim.'); await page.locator('div:has(> div > button:has-text("Todos")) > button').last().click(); await wait(150)
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
await tab('Movim.'); await page.locator('div:has(> div > button:has-text("Todos")) > button').last().click(); await wait(200); await page.screenshot({ path: 'test/shot-modal-mov.png' }); await page.locator('button[aria-label="Cerrar"]').click(); await wait(150)
await cambiarEspacio('Casa Quijano'); await tab('Deudas'); await page.screenshot({ path: 'test/shot-deudas-hogar.png', fullPage: true })

// Amigo: aislamiento total
await loginAs('u-amigo', 'amigo@test.co'); await page.fill('input[placeholder="Ej. Andrés"]', 'Amigo'); await click('button', { hasText: 'Guardar' }); await wait(200)
await tab('Config'); ok('Amigo solo ve su espacio personal', /Mis espacios/.test(await T()) && !/Casa Quijano/.test(await T()) && !/Kontbox/.test(await T()))
await click('button', { hasText: 'Crear hogar o empresa' }); await fillLabel('Nombre del hogar', 'Casa Amigo'); await submit('Crear'); await wait(400)
await tab('Movim.'); ok('Amigo NO ve movimientos ajenos', !/Mercado/.test(await T()) && /Sin movimientos/.test(await T()))
await tab('Deudas'); ok('Amigo NO ve tarjeta ni crédito ajenos', !/Visa Bancolombia/.test(await T()) && !/Crédito Mazda/.test(await T()))
st = await DB(() => { const T = window.__sb._T; return { esp: T.espacios.length, movA: T.movimientos.filter(m => m.espacio_id === T.espacios.find(e => e.tipo === 'hogar' && e.nombre === 'Casa Amigo').id).length } })
ok('Datos de Amigo aislados', st.movA === 0)

await page.screenshot({ path: 'test/shot-amigo.png' })
await browser.close(); server.close()
console.log(results.map(r => r.join('  ')).join('\n'))
const fails = results.filter(r => r[0] === 'FAIL').length
console.log(`\n${results.length - fails}/${results.length} pruebas OK`)
process.exit(fails ? 1 : 0)
