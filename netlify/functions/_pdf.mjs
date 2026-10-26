// Extrae el texto de un PDF conservando la disposición por líneas (como `pdftotext -layout`), para que
// un modelo pueda leer tablas de extractos bancarios. Sin dependencias del navegador.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

export async function textoDePdf(buffer, maxPaginas = 12) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, isEvalSupported: false, useSystemFonts: false }).promise
  const paginas = []
  for (let p = 1; p <= Math.min(doc.numPages, maxPaginas); p++) {
    const page = await doc.getPage(p); const tc = await page.getTextContent()
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || 8, s: i.str }))
    // agrupar por línea (misma y ± media altura), ordenar por x, separar columnas con espacios según el hueco
    const lineas = []
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const l = lineas.find(L => Math.abs(L.y - it.y) <= Math.max(2, it.h * 0.5)); if (l) l.items.push(it); else lineas.push({ y: it.y, items: [it] })
    }
    const out = lineas.sort((a, b) => b.y - a.y).map(L => {
      const its = L.items.sort((a, b) => a.x - b.x); let s = '', fin = null, prev = null
      for (const it of its) {
        if (prev && prev.s === it.s && Math.abs(prev.x - it.x) < 1.5) continue   // texto en negrita duplicado (misma posición)
        prev = it
        if (fin !== null) { const gap = it.x - fin; s += gap > 14 ? '   ' : gap > 1.5 ? ' ' : '' } s += it.s; fin = it.x + it.w }
      return s
    })
    paginas.push(out.join('\n'))
  }
  return { texto: paginas.join('\n\n--- página ---\n\n'), paginas: doc.numPages }
}

// Tacha identificadores antes de enviar nada fuera: números de tarjeta, cédulas/NIT, correos, teléfonos, direcciones.
export function tachar(texto, nombres = []) {
  let t = texto
    .replace(/\b(?:\d[ \-]?){13,19}\b/g, '[tarjeta]')
    .replace(/(?:\*{2,}|•[ •]*)\s*\d{4}\b/g, '[tarjeta]')
    .replace(/\b(?:C\.?C\.?|NIT|C[eé]dula|Documento|Identificaci[oó]n)[:\s]*[\d.\- ]{6,15}\b/gi, '[documento]')
    .replace(/\b\d{7,12}(?:-\d)?\b/g, '[número]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]')
    .replace(/(?:\+?57\s?)?\(\d{3}\)\s?\d{3}[ \-]?\d{4}\b/g, '[teléfono]')
    .replace(/^\s*(?:cra?|cl|calle|carrera|av|avenida|diagonal|dg|transversal|tv|kr)\.?\s*\d.*$/gim, '[dirección]')
    .replace(/^\s*(?:direcci[oó]n|nombre|titular|cliente|ciudad)\s*:.*$/gim, '[dato]')
    .replace(/^.*\bhola\b.*$/gim, '[saludo]')
  for (const n of nombres.filter(x => x && x.length >= 3)) t = t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[nombre]')
  return t
}
