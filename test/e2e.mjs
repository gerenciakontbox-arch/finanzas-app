// Recorrido end-to-end sobre el bundle de prueba con Playwright + backend en memoria.
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

const root = path.resolve('test/dist')
const server = createServer((req, res) => { let p = path.join(root, req.url.split('?')[0]); if (!existsSync(p) || p.endsWith('/')) p = path.join(root, 'index.html'); const ext = path.extname(p); res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' }[ext] || 'application/octet-stream'); res.end(readFileSync(p)) }).listen(4177)

const results = []; const ok = (n, c) => { results.push([c ? 'PASS' : 'FAIL', n]); if (!c) console.log('   ✗', n) }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)) })
page.on('dialog', d => d.accept())
const T = () => page.evaluate(() => document.body.innerText)
const tab = async l => { await page.locator('button', { hasText: l }).last().click(); await page.waitForTimeout(150) }
const click = async (sel, opt) => { await page.locator(sel, opt).first().click(); await page.waitForTimeout(150) }
const submit = async (txt) => { await page.locator('button', { hasText: txt }).last().click(); await page.waitForTimeout(200) }
const fillLabel = async (label, v) => { const el = page.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::*[1]'); await el.fill(String(v)); }
const selectLabel = async (label, v) => { const el = page.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::select'); await el.selectOption({ label: v }) }

await page.goto('http://localhost:4177/'); await page.waitForTimeout(400)
ok('Pantalla de login', /Enviarme el código por correo/.test(await T()))
await page.fill('input[type=email]', 'andres@test.co'); await click('button', { hasText: 'Enviarme el código' })
ok('Pide el código del correo', /código numérico/.test(await T()))
await page.fill('input[inputmode=numeric]', '999999'); await click('button', { hasText: 'Entrar con el código' }); await page.waitForTimeout(200)
ok('Código inválido rechazado', /Código inválido o vencido/.test(await T()))
await page.fill('input[inputmode=numeric]', '123456'); await click('button', { hasText: 'Entrar con el código' }); await page.waitForTimeout(300)
ok('Onboarding tras login', /Crear un hogar/.test(await T()))
await fillLabel('Tu nombre', 'Andrés'); await fillLabel('Nombre del hogar', 'Casa Quijano'); await click('button', { hasText: 'Crear mi hogar' }); await page.waitForTimeout(400)
ok('Dashboard del hogar', /Casa Quijano/.test(await T()) && /Presupuestado/.test(await T()))

// Config → cuentas: agregar banco y tarjeta
await tab('Config'); await click('button', { hasText: 'Cuentas' })
await fillLabel('Nombre', 'Bancolombia Andrés'); await click('button', { hasText: 'Agregar cuenta' })
await fillLabel('Nombre', 'Visa Bancolombia'); await selectLabel('Tipo', 'Tarjeta crédito'); await fillLabel('Cupo (COP)', 5000000); await fillLabel('Tasa mensual (%)', 2.8); await fillLabel('Día de corte', 15); await click('button', { hasText: 'Agregar cuenta' })
ok('Cuentas creadas (banco + TC)', /Bancolombia Andrés/.test(await T()) && /Visa Bancolombia/.test(await T()) && /TC/.test(await T()))
// Invitación
await click('button', { hasText: 'Hogar' }); const codigo = await page.evaluate(() => window.__sb._T.hogares[0].codigo_invitacion)
ok('Código de invitación visible', (await T()).includes(codigo))

// Presupuesto: crear rubro
await tab('Presup.'); await page.locator('button:has(svg)').filter({ hasText: '' }).last(); await page.locator('div:has(> input[placeholder="Buscar…"]) button').last().click(); await page.waitForTimeout(150)
await fillLabel('Concepto', 'Arriendo apto'); await fillLabel('Monto (COP)', 2200000); await click('button', { hasText: 'Guardar' })
ok('Rubro creado', /Arriendo apto/.test(await T()) && /2\.200\.000/.test(await T()))

// Movimientos: salida vinculada
await tab('Movim.'); await page.locator('div:has(> div > button:has-text("Todos")) > button').last().click(); await page.waitForTimeout(150)
await fillLabel('Descripción', 'Pago arriendo'); await fillLabel('Monto (COP)', 2200000); await selectLabel('Vincular a rubro', 'Arriendo apto'); await click('button', { hasText: 'Registrar' })
ok('Movimiento creado con autor', /Pago arriendo/.test(await T()) && /Registró Andrés/.test(await T()))
await tab('Presup.'); ok('Ejecutado refleja movimiento (100%)', /100%/.test(await T()))

// Deudas: tarjeta → compra → factura
await tab('Deudas'); ok('Tarjeta visible en Deudas', /Visa Bancolombia/.test(await T()) && /Registrar compra/.test(await T()))
await click('button', { hasText: 'Registrar compra' }); await fillLabel('Descripción', 'Televisor'); await fillLabel('Monto (COP)', 2400000); await click('button', { hasText: /^12$/ }); await submit('Registrar compra')
ok('Compra registrada, cupo descontado', /Televisor/.test(await T()) || /2\.600\.000/.test(await T()))
let mBefore = await page.evaluate(() => window.__sb._T.movimientos.length)
await click('button', { hasText: 'Pagar factura' }); ok('Modal factura con cuota', /Cuota 1\/12/.test(await T()))
await fillLabel('Cuota de manejo', 25000); await click('button', { hasText: /Registrar pago/ })
let st = await page.evaluate(() => ({ m: window.__sb._T.movimientos.length, cp: window.__sb._T.cuotas_pagadas.length, ult: window.__sb._T.movimientos.at(-1) }))
ok('Factura → 1 movimiento + 1 cuota pagada', st.m === mBefore + 1 && st.cp === 1 && st.ult.origen === 'tarjeta' && st.ult.desglose.cuota_manejo === 25000)
// Crédito
await click('button', { hasText: 'Nuevo' }); await fillLabel('Nombre', 'Crédito vehicular'); await fillLabel('Capital inicial', 15000000); await fillLabel('Tasa mensual (%)', 1.2); await fillLabel('Total cuotas', 36); await click('button', { hasText: 'Guardar' })
ok('Crédito creado', /Crédito vehicular/.test(await T()))
await click('div:has-text("Crédito vehicular") >> nth=-1'); await page.waitForTimeout(150)
await page.locator('button', { hasText: /^Pagar$/ }).first().click(); await page.waitForTimeout(200)
st = await page.evaluate(() => ({ cp: window.__sb._T.cuotas_pagadas.filter(c => c.deuda_id).length, m: window.__sb._T.movimientos.filter(m => m.origen === 'credito').length }))
ok('Pago de cuota de crédito → movimiento + cuota pagada', st.cp === 1 && st.m === 1)

// Programado: ingreso recurrente (R1) + cobrar (R2) + ficha + deshacer
await tab('Progr.'); await click('button', { hasText: 'Ingresos' }); await page.locator('button:has(svg)').last(); await page.locator('div:has(> button[title="Importar CSV"]) > button').last().click(); await page.waitForTimeout(150)
await fillLabel('Nombre', 'Honorarios Kontbox'); await fillLabel('Monto (COP)', 6000000); await click('button', { hasText: 'Guardar' })
ok('Ingreso programado creado', /Honorarios Kontbox/.test(await T()) && /Cobrar/.test(await T()))
await click('button', { hasText: 'Cobrar' }); ok('Modal cobrar', /Registrar cobro/.test(await T())); await fillLabel('Monto recibido', 5800000); await click('button', { hasText: 'Registrar cobro' }); await page.waitForTimeout(250)
st = await page.evaluate(() => ({ p: window.__sb._T.programado.filter(x => x.nombre === 'Honorarios Kontbox').map(x => x.estado).sort(), m: window.__sb._T.movimientos.filter(m => m.tipo === 'Ingreso') }))
ok('Cobro → movimiento Ingreso 5.8M + siguiente ocurrencia', st.p.join() === 'Completado,Pendiente' && st.m.length === 1 && +st.m[0].monto === 5800000)
await click('button', { hasText: 'Historial' }); ok('Historial muestra completado', /Completado/.test(await T()))
await click('button', { hasText: 'Deshacer' }); await page.waitForTimeout(250)
st = await page.evaluate(() => ({ p: window.__sb._T.programado.filter(x => x.nombre === 'Honorarios Kontbox').length, m: window.__sb._T.movimientos.filter(m => m.tipo === 'Ingreso').length }))
ok('Deshacer → 1 ocurrencia pendiente, 0 ingresos', st.p === 1 && st.m === 0)
// Obligación con ficha
await click('button', { hasText: 'Obligaciones' }); await click('button', { hasText: 'Pendientes' }); await page.locator('div:has(> button[title="Importar CSV"]) > button').last().click(); await page.waitForTimeout(150)
await fillLabel('Nombre', 'Internet Claro'); await fillLabel('Monto (COP)', 85000); await fillLabel('Enlace de pago', 'https://claro.com.co/pagar'); await fillLabel('Referencia', 'Contrato 998877')
await page.fill('input[placeholder="Etiqueta (NIT, convenio…)"]', 'Convenio'); await page.fill('input[placeholder="Valor"]', '12345'); await page.locator('input[placeholder="Valor"]').press('Enter')
await click('button', { hasText: 'Guardar' })
ok('Obligación con ficha creada', /Internet Claro/.test(await T()) && /Ver ficha de pago/.test(await T()))
await click('button', { hasText: 'Ver ficha de pago' }); ok('Ficha muestra enlace, referencia y convenio', /Ir a pagar/.test(await T()) && /998877/.test(await T()) && /convenio/i.test(await T()))
await click('button', { hasText: 'Ya lo pagué' }); await submit('Registrar pago'); await page.waitForTimeout(250)
st = await page.evaluate(() => window.__sb._T.programado.filter(x => x.nombre === 'Internet Claro').map(x => [x.estado, x.ficha_referencia]))
ok('Pago desde ficha → siguiente ocurrencia hereda ficha', st.length === 2 && st.every(x => x[1] === 'Contrato 998877'))

// Importación CSV de obligaciones (con entidad/cuenta nuevas, fila con error, ficha) y de ingresos
const csvObl = '﻿nombre;monto;periodicidad;vencimiento;tipo;entidad;categoria;cuenta;enlace;referencia;contraseña\r\nSOAT Mazda;650.000;anual;15/03/2027;Seguro;Kontbox SAS;Seguros;Davivienda;https://sura.co;ABC123;secreta\r\nAgua EMCALI;$ 78.500;mensual;20/11/2026;Servicio;;Servicios públicos;;;;\r\nSin fecha;10000;Mensual;;Otro;;;;;;\r\n'
await click('button[title="Importar CSV"]'); ok('Modal importar obligaciones', /Importar obligaciones/.test(await T()) && /contraseñas no/.test(await T()))
await page.setInputFiles('input[type="file"]', { name: 'obl.csv', mimeType: 'text/csv', buffer: Buffer.from(csvObl, 'utf8') }); await page.waitForTimeout(300)
let tt = await T(); ok('Vista previa: 2 válidas, 1 con error, propone crear Kontbox SAS/Seguros/Davivienda', /Crear lo que no existe: Kontbox SAS, Seguros, Davivienda/.test(tt) && /Sin fecha de vencimiento/.test(tt) && /Importar 2/.test(tt))
await click('button', { hasText: 'Importar 2' }); await page.waitForTimeout(400)
st = await page.evaluate(() => { const T = window.__sb._T; const soat = T.programado.find(x => x.nombre === 'SOAT Mazda'); const agua = T.programado.find(x => x.nombre === 'Agua EMCALI'); return { soat, agua, sinFecha: T.programado.some(x => x.nombre === 'Sin fecha'), ent: T.entidades.find(e => e.nombre === 'Kontbox SAS'), cat: T.categorias.find(c => c.nombre === 'Seguros'), cta: T.cuentas.find(c => c.nombre === 'Davivienda') } })
ok('Importadas 2 obligaciones con maestros creados, fecha DD/MM, monto con puntos, sin contraseña', st.soat && +st.soat.monto === 650000 && st.soat.vencimiento === '2027-03-15' && st.soat.periodicidad === 'Anual' && st.soat.flujo === 'salida' && st.soat.estado === 'Pendiente' && st.soat.ficha_url === 'https://sura.co' && st.soat.ficha_referencia === 'ABC123' && !JSON.stringify(st.soat).includes('secreta') && st.ent && st.soat.entidad_id === st.ent.id && st.cat && st.soat.categoria_id === st.cat.id && st.cta && st.soat.cuenta_id === st.cta.id && st.agua && +st.agua.monto === 78500 && st.agua.vencimiento === '2026-11-20' && !st.sinFecha)
ok('Lista muestra las importadas', /SOAT Mazda/.test(await T()) && /Agua EMCALI/.test(await T()))
await click('button', { hasText: 'Ingresos' }); await click('button[title="Importar CSV"]'); ok('Modal importar ingresos', /Importar ingresos programados/.test(await T()))
await page.setInputFiles('input[type="file"]', { name: 'ing.csv', mimeType: 'text/csv', buffer: Buffer.from('concepto,valor,frecuencia,fecha de cobro\nArriendo local,"1,800,000",Mensual,2026-11-05\n', 'utf8') }); await page.waitForTimeout(300)
await click('button', { hasText: 'Importar 1' }); await page.waitForTimeout(400)
st = await page.evaluate(() => window.__sb._T.programado.find(x => x.nombre === 'Arriendo local'))
ok('Ingreso importado con alias de columnas y coma decimal/miles', st && st.flujo === 'ingreso' && +st.monto === 1800000 && st.vencimiento === '2026-11-05' && st.tipo === 'Honorarios' && /Cobrar/.test(await T()))

// Dashboard refleja todo
await tab('Inicio'); const d = await T()
ok('Dashboard: próximas facturas TC + próximos 7 días', /Próximas facturas de tarjeta/.test(d) && /Próximos 7 días/.test(d))

// Segundo usuario: se une con código y ve lo mismo; tercero crea hogar aparte y no ve nada
await page.evaluate(() => window.__sb._logout()); await page.waitForTimeout(200); await page.evaluate(() => window.__sb._login('u-esposa', 'esposa@test.co')); await page.waitForTimeout(300)
await click('button', { hasText: 'Tengo un código' }); await fillLabel('Tu nombre', 'Esposa'); await page.fill('input[maxlength="8"]', codigo); await click('button', { hasText: 'Unirme al hogar' }); await page.waitForTimeout(400)
ok('Esposa entra al mismo hogar y ve datos', /Casa Quijano/.test(await T()) && /Esposa/.test(await T()))
await tab('Movim.'); ok('Esposa ve movimiento de Andrés con su autor', /Pago arriendo/.test(await T()) && /Registró Andrés/.test(await T()))
await page.evaluate(() => window.__sb._logout()); await page.waitForTimeout(200); await page.evaluate(() => window.__sb._login('u-amigo', 'amigo@test.co')); await page.waitForTimeout(300)
await fillLabel('Tu nombre', 'Amigo'); await fillLabel('Nombre del hogar', 'Casa Amigo'); await click('button', { hasText: 'Crear mi hogar' }); await page.waitForTimeout(400)
await tab('Movim.'); ok('Amigo NO ve movimientos ajenos', !/Pago arriendo/.test(await T()) && /Sin movimientos/.test(await T()))
await tab('Deudas'); ok('Amigo NO ve tarjeta ni crédito ajenos', !/Visa Bancolombia/.test(await T()) && !/Crédito vehicular/.test(await T()))

await page.screenshot({ path: 'test/shot-amigo.png' })
await browser.close(); server.close()
const fails = results.filter(r => r[0] === 'FAIL').length
console.log(results.map(r => `${r[0]}  ${r[1]}`).join('\n')); console.log(`\n${results.length - fails}/${results.length} pruebas OK`)
process.exit(fails ? 1 : 0)
