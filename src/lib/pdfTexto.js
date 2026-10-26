// Extrae el texto de un PDF en el navegador (pdf.js) conservando la disposición por líneas, igual que
// netlify/functions/_pdf.mjs. El PDF no sale del dispositivo: al servidor solo viaja el texto ya tachado.
export async function textoDePdf(file, maxPaginas = 12, password = undefined) {
  // Build 'legacy' de pdf.js 4.x: funciona en Safari/iOS y navegadores de hace unos años (la 6.x exige APIs muy recientes).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  let doc
  try { doc = await pdfjs.getDocument({ data, isEvalSupported: false, password }).promise }
  catch (e) { if (e && e.name === 'PasswordException') { const err = new Error(password ? 'Contraseña incorrecta.' : 'Este PDF tiene contraseña.'); err.password = true; throw err } throw e }
  const paginas = []
  for (let p = 1; p <= Math.min(doc.numPages, maxPaginas); p++) {
    const page = await doc.getPage(p); const tc = await page.getTextContent()
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || 8, s: i.str }))
    const lineas = []
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const l = lineas.find(L => Math.abs(L.y - it.y) <= Math.max(2, it.h * 0.5)); if (l) l.items.push(it); else lineas.push({ y: it.y, items: [it] })
    }
    paginas.push(lineas.sort((a, b) => b.y - a.y).map(L => {
      const its = L.items.sort((a, b) => a.x - b.x); let s = '', fin = null, prev = null
      for (const it of its) {
        if (prev && prev.s === it.s && Math.abs(prev.x - it.x) < 1.5) continue
        prev = it
        if (fin !== null) { const gap = it.x - fin; s += gap > 14 ? '   ' : gap > 1.5 ? ' ' : '' }
        s += it.s; fin = it.x + it.w
      }
      return s
    }).join('\n'))
  }
  return { texto: paginas.join('\n\n--- página ---\n\n'), paginas: doc.numPages }
}
