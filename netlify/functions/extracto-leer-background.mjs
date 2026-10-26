// Interpreta el TEXTO de un extracto de tarjeta EN SEGUNDO PLANO (sufijo -background: Netlify responde 202 de
// inmediato y deja correr hasta 15 min) y escribe el resultado en tc_lecturas (compras, otros cargos y estado de
// la tarjeta, sin datos personales). El PDF nunca llega aquí: la app extrae el texto en el dispositivo y lo tacha
// (src/lib/pdfTexto.js + src/lib/tachar.js); el servidor vuelve a tachar por si acaso. Límite de Netlify: 256 KB por envío.
// Variables en Netlify: ANTHROPIC_API_KEY (obligatoria), ANTHROPIC_MODEL (opcional, por defecto claude-sonnet-5-5).
import Anthropic from '@anthropic-ai/sdk'
import { admin, env } from './_push.mjs'
import { tachar } from './_pdf.mjs'

const MODELO = () => env('ANTHROPIC_MODEL') || 'claude-sonnet-5-5'

const SISTEMA = `Eres un extractor de datos de extractos de tarjeta de crédito de bancos colombianos (Nu, Bancolombia, Davivienda, Banco Falabella/CMR, BBVA, Rappi, Lulo, Scotiabank Colpatria, Banco de Bogotá, Itaú, etc.).
Devuelves SOLO un objeto JSON válido, sin comentarios ni texto alrededor, con esta forma exacta:
{
 "banco": "texto corto o null",
 "periodo_inicio": "AAAA-MM-DD o null", "periodo_fin": "AAAA-MM-DD o null",
 "fecha_corte": "AAAA-MM-DD o null", "fecha_limite": "AAAA-MM-DD o null",
 "cupo": número o null, "utilizado": número o null, "disponible": número o null,
 "pago_total": número o null, "pago_minimo": número o null,
 "intereses": número o null, "mora": número o null, "cuota_manejo": número o null, "seguro": número o null, "abonos": número o null,
 "compras": [ { "fecha": "AAAA-MM-DD", "descripcion": "texto", "monto_cop": número, "moneda_original": "COP|USD|...", "monto_original": número o null,
                "cuotas_total": entero, "cuota_actual": entero, "tasa": número o null, "tasa_tipo": "MV|EA|null", "valor_cuota_mes": número o null, "saldo_pendiente": número o null, "nota": "texto o null" } ],
 "otros": [ { "fecha": "AAAA-MM-DD o null", "descripcion": "texto", "tipo": "pago|interes|mora|cuota_manejo|seguro|avance|comision|ajuste|otro", "monto": número } ],
 "advertencias": [ "texto" ]
}
Reglas:
- Montos en pesos colombianos como números sin separadores (ej. 1234567.89). El separador de miles es el punto y el decimal la coma ("$1.004.000,00" → 1004000). A veces las cifras vienen con espacios intercalados ("$ 16 . 814, 37" → 16814.37).
- "compras" son los consumos del tarjetahabiente (compras, suscripciones, cambios de cuotas), NUNCA pagos, intereses, cuota de manejo, seguros, avances ni ajustes: esos van en "otros".
- Si la compra fue en moneda extranjera, "monto_cop" es el valor en pesos que el extracto muestra para esa compra (suele estar en la línea inmediatamente anterior o posterior, o calcularse con la T.C.); "monto_original" y "moneda_original" guardan el valor original.
- "cuotas_total" y "cuota_actual" vienen de expresiones como "6 de 24" (cuota_actual = 6, cuotas_total = 24). Si no hay cuotas, ambos = 1. Si es incoherente (ej. "4 de 1"), usa cuota_actual = 1, cuotas_total = 1 y explícalo en "nota".
- "tasa": el porcentaje que el extracto muestra para esa compra; "tasa_tipo" = "MV" si el extracto dice mes vencido / M.V., "EA" si dice efectiva anual / E.A.
- "valor_cuota_mes": lo que se paga de esa compra este mes (capital + interés si el extracto lo suma así); "saldo_pendiente": lo que queda por pagar de esa compra tras este mes.
- Fechas en formato AAAA-MM-DD; meses en español (ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT NOV DIC). Si la fecha de una compra no trae año, dedúcelo del periodo facturado (una compra con cuota_actual = k ocurrió aproximadamente k-1 meses antes del corte).
- Si un dato no aparece, usa null. No inventes. No incluyas nombres de personas, números de documento, de tarjeta, direcciones, correos ni teléfonos en ningún campo.
- "advertencias": lo que un contador debería revisar (ej. líneas ilegibles, totales que no cuadran, cuotas incoherentes).`

function extraerJson(texto) {
  const m = texto.match(/\{[\s\S]*\}/); if (!m) throw new Error('El modelo no devolvió datos legibles')
  return JSON.parse(m[0])
}
const num = v => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : Math.round(n * 100) / 100 }
const fecha = v => { if (!v) return null; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null }
const tasaMensual = (t, tipo) => { if (t == null) return null; const x = +t; if (!x) return 0; if ((tipo || '').toUpperCase() === 'EA') return Math.round((Math.pow(1 + x / 100, 1 / 12) - 1) * 100 * 1000) / 1000; return Math.round(x * 1000) / 1000 }

export function normalizar(raw) {
  const compras = (raw.compras || []).map(c => {
    const total = Math.max(1, parseInt(c.cuotas_total) || 1); let actual = Math.max(1, parseInt(c.cuota_actual) || 1); if (actual > total) actual = total
    return { fecha: fecha(c.fecha), descripcion: String(c.descripcion || '').trim().slice(0, 120), monto: num(c.monto_cop) ?? num(c.monto_original), moneda_original: c.moneda_original || 'COP', monto_original: num(c.monto_original), cuotas: total, cuota_actual: actual, cuotas_previas: actual - 1, tasa_mensual: tasaMensual(num(c.tasa), c.tasa_tipo), valor_cuota_mes: num(c.valor_cuota_mes), saldo_pendiente: num(c.saldo_pendiente), nota: c.nota || null }
  }).filter(c => c.fecha && c.monto > 0)
  const otros = (raw.otros || []).map(o => ({ fecha: fecha(o.fecha), descripcion: String(o.descripcion || '').trim().slice(0, 120), tipo: o.tipo || 'otro', monto: num(o.monto) })).filter(o => o.monto != null)
  const estado = { banco: raw.banco || null, periodo_inicio: fecha(raw.periodo_inicio), periodo_fin: fecha(raw.periodo_fin), fecha_corte: fecha(raw.fecha_corte), fecha_limite: fecha(raw.fecha_limite), cupo: num(raw.cupo), utilizado: num(raw.utilizado), disponible: num(raw.disponible), pago_total: num(raw.pago_total), pago_minimo: num(raw.pago_minimo), intereses: num(raw.intereses), mora: num(raw.mora), cuota_manejo: num(raw.cuota_manejo), seguro: num(raw.seguro), abonos: num(raw.abonos) }
  const advertencias = Array.isArray(raw.advertencias) ? raw.advertencias.map(String).slice(0, 10) : []
  const sumaPend = compras.reduce((a, c) => a + (c.saldo_pendiente || 0), 0)
  if (estado.utilizado && sumaPend && Math.abs(sumaPend - estado.utilizado) / estado.utilizado > 0.15) advertencias.push(`La suma de saldos pendientes de las compras (${Math.round(sumaPend).toLocaleString('es-CO')}) difiere del total utilizado (${Math.round(estado.utilizado).toLocaleString('es-CO')}); revisa que no falten líneas.`)
  return { estado, compras, otros, advertencias }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  let body; try { body = await req.json() } catch { return new Response('Cuerpo inválido', { status: 400 }) }
  const { lectura_id, token, texto, nombres = [] } = body || {}
  if (!lectura_id || !token || !texto) return new Response('Faltan datos', { status: 400 })
  let sb; try { sb = admin() } catch (e) { console.error(e.message); return new Response(e.message, { status: 500 }) }
  const terminar = async (campos) => { await sb.from('tc_lecturas').update({ ...campos, actualizado_en: new Date().toISOString() }).eq('id', lectura_id) }
  const { data: { user }, error } = await sb.auth.getUser(token); if (error || !user) return new Response('Sesión inválida', { status: 401 })
  const { data: lectura } = await sb.from('tc_lecturas').select('id,user_id,estado').eq('id', lectura_id).maybeSingle()
  if (!lectura || lectura.user_id !== user.id || lectura.estado !== 'pendiente') return new Response('Lectura no válida', { status: 400 })
  if (!env('ANTHROPIC_API_KEY')) { await terminar({ estado: 'error', error: 'El servidor no tiene configurada la llave ANTHROPIC_API_KEY.' }); return new Response('', { status: 202 }) }
  const limpio = tachar(String(texto).slice(0, 120000), [user.email?.split('@')[0], ...nombres])
  try {
    const cliente = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
    const r = await cliente.messages.create({ model: MODELO(), max_tokens: 8000, system: SISTEMA, messages: [{ role: 'user', content: [{ type: 'text', text: 'Extracto (texto extraído del PDF, identificadores tachados):\n\n' + limpio }] }] })
    const salida = r.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
    const out = normalizar(extraerJson(salida))
    out.modo = 'texto'; out.modelo = MODELO(); out.uso = { entrada: r.usage?.input_tokens, salida: r.usage?.output_tokens }
    await terminar({ estado: 'lista', resultado: out })
  } catch (e) {
    console.error('extracto-leer', e.status || '', e.message)
    await terminar({ estado: 'error', error: e.status === 401 ? 'La llave ANTHROPIC_API_KEY no es válida.' : e.status === 429 ? 'Límite de uso de la API alcanzado; intenta en un minuto.' : 'No se pudo leer el extracto: ' + e.message })
  }
  return new Response('', { status: 202 })
}
