// Lee un extracto de tarjeta de crédito (PDF o foto) y devuelve compras, otros cargos y el estado de la
// tarjeta como datos. El archivo NO se guarda: se procesa en memoria y se descarta. Antes de enviar texto
// al modelo se tachan identificadores (tarjeta, documento, correo, teléfono, dirección, nombre).
// Variables en Netlify: ANTHROPIC_API_KEY (obligatoria), ANTHROPIC_MODEL (opcional, por defecto claude-sonnet-5-5).
import Anthropic from '@anthropic-ai/sdk'
import { admin, env } from './_push.mjs'
import { textoDePdf, tachar } from './_pdf.mjs'

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

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })

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
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); if (!token) return json({ error: 'Sin sesión' }, 401)
  if (!env('ANTHROPIC_API_KEY')) return json({ error: 'El servidor no tiene configurada la llave ANTHROPIC_API_KEY.' }, 500)
  let sb; try { sb = admin() } catch (e) { return json({ error: e.message }, 500) }
  const { data: { user }, error } = await sb.auth.getUser(token); if (error || !user) return json({ error: 'Sesión inválida' }, 401)
  let body; try { body = await req.json() } catch { return json({ error: 'Cuerpo inválido' }, 400) }
  const { base64, tipo, nombres = [] } = body || {}; if (!base64) return json({ error: 'Falta el archivo' }, 400)
  const buffer = Buffer.from(base64, 'base64'); if (buffer.length > 12 * 1024 * 1024) return json({ error: 'El archivo supera 12 MB' }, 413)

  const cliente = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
  let contenido, modo
  if (/pdf/i.test(tipo || '')) {
    let texto = ''; try { texto = (await textoDePdf(buffer)).texto } catch (e) { texto = '' }
    if (texto.replace(/\s+/g, '').length >= 400) { modo = 'texto'; contenido = [{ type: 'text', text: 'Extracto (texto extraído del PDF, identificadores tachados):\n\n' + tachar(texto, [user.email?.split('@')[0], ...nombres]) }] }
    else { modo = 'pdf'; contenido = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: 'Extrae los datos de este extracto. No devuelvas datos personales.' }] }
  } else if (/^image\/(png|jpe?g|webp|gif)$/i.test(tipo || '')) {
    modo = 'imagen'; contenido = [{ type: 'image', source: { type: 'base64', media_type: tipo.toLowerCase(), data: base64 } }, { type: 'text', text: 'Extrae los datos de este extracto. No devuelvas datos personales.' }]
  } else return json({ error: 'Formato no soportado: sube un PDF o una foto (JPG/PNG).' }, 400)

  try {
    const r = await cliente.messages.create({ model: MODELO(), max_tokens: 8000, system: SISTEMA, messages: [{ role: 'user', content: contenido }] })
    const texto = r.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
    const out = normalizar(extraerJson(texto))
    out.modo = modo; out.modelo = MODELO(); out.uso = { entrada: r.usage?.input_tokens, salida: r.usage?.output_tokens }
    return json(out)
  } catch (e) {
    console.error('extracto-leer', e.status || '', e.message)
    return json({ error: e.status === 401 ? 'La llave ANTHROPIC_API_KEY no es válida.' : e.status === 429 ? 'Límite de uso de la API alcanzado; intenta en un minuto.' : 'No se pudo leer el extracto: ' + e.message }, 502)
  }
}
