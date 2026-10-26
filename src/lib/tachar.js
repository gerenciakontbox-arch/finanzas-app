// Tachado de identificadores antes de que un texto salga del dispositivo o del servidor. Compartido por la app y las funciones.
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
