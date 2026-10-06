export const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function parseCSV(text) {
  text = text.replace(/^﻿/, '')
  const first = text.split(/\r?\n/)[0] || ''
  const delim = [';', ',', '\t', '|'].map(d => [d, (first.match(new RegExp('\\' + d, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1]
    if (q) { if (ch === '"' && nx === '"') { field += '"'; i++ } else if (ch === '"') q = false; else field += ch }
    else { if (ch === '"') q = true; else if (ch === delim) { row.push(field); field = '' } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && nx === '\n') i++; row.push(field); rows.push(row); row = []; field = '' } else field += ch }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return { delim, rows: rows.filter(r => r.some(c => String(c).trim() !== '')) }
}

export function parseMonto(v) {
  let t = String(v || '').replace(/[$\s]/g, '').replace(/COP/i, ''); if (!t) return NaN
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-'); t = t.replace(/[()\-]/g, '')
  const hasDot = t.includes('.'), hasCom = t.includes(',')
  if (hasDot && hasCom) { const dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ','; t = t.replace(dec === ',' ? /\./g : /,/g, '').replace(dec, '.') }
  else if (hasDot) { const p = t.split('.'); if (p.length > 2 || (p.length === 2 && p[1].length === 3)) t = t.replace(/\./g, '') }
  else if (hasCom) { const p = t.split(','); if (p.length > 2 || (p.length === 2 && p[1].length === 3)) t = t.replace(/,/g, ''); else t = t.replace(',', '.') }
  const n = parseFloat(t); return isNaN(n) ? NaN : Math.round(neg ? -n : n)
}

export function parseFecha(v) {
  const t = String(v || '').trim(); if (!t) return null
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/); if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  const d = new Date(t); return isNaN(d) ? null : d.toISOString().slice(0, 10)
}

export const matchOpt = (v, opts, key = x => x) => { const n = norm(v); if (!n) return null; return opts.find(o => norm(key(o)) === n) || opts.find(o => norm(key(o)).startsWith(n) || n.startsWith(norm(key(o)))) || null }

export const toCSV = rows => { const esc = v => { const t = String(v ?? ''); return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t }; return '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n') }

export const descargar = (nombre, contenido, mime = 'text/csv;charset=utf-8') => {
  const blob = new Blob([contenido], { type: mime }); const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 500)
}

export const leerArchivoTexto = file => new Promise((res, rej) => {
  const fr = new FileReader()
  fr.onload = () => { const buf = fr.result; let text = new TextDecoder('utf-8').decode(buf); if ((text.match(/�/g) || []).length > 2) text = new TextDecoder('windows-1252').decode(buf); res(text) }
  fr.onerror = rej; fr.readAsArrayBuffer(file)
})
