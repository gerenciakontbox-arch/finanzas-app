// Tachado de identificadores antes de que un texto salga del dispositivo o del servidor. Compartido por la app y las funciones.
// Tacha identificadores antes de enviar nada fuera: números de tarjeta, cédulas/NIT, correos, teléfonos, direcciones.
export function tachar(texto, nombres = []) {
  let t = texto
    .replace(/\b(?:\d[ \-]?){13,19}\b/g, '[tarjeta]')
    .replace(/\b\d{4}\s?\d{0,4}\s?\*{2,}[\d*\s]*/g, '[tarjeta] ')
    .replace(/(?:\*{2,}|•[ •]*)\s*\d{4}\b/g, '[tarjeta]')
    .replace(/\b(?:C\.?C\.?|NIT|C[eé]dula|Documento|Identificaci[oó]n)[:\s]*[\d.\- ]{6,15}\b/gi, '[documento]')
    .replace(/\b\d{7,12}(?:-\d)?\b/g, '[número]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]')
    .replace(/(?:\+?57\s?)?\(\d{3}\)\s?\d{3}[ \-]?\d{4}\b/g, '[teléfono]')
    .replace(/^\s*(?:cra?|cl|calle|carrera|av|avenida|diagonal|dg|transversal|tv|kr)\.?\s*\d.*$/gim, '[dirección]')
    // etiquetas que a veces vienen con letras espaciadas ("N o m b r e :"); se tacha solo el valor, hasta el siguiente salto de columna
    .replace(/((?:n\s?o\s?m\s?b\s?r\s?e|d\s?i\s?r\s?e\s?c\s?c\s?i\s?[oó]\s?n|c\s?i\s?u\s?d\s?a\s?d|t\s?i\s?t\s?u\s?l\s?a\s?r|c\s?l\s?i\s?e\s?n\s?t\s?e|c\s?[eé]\s?d\s?u\s?l\s?a|i\s?d\s?e\s?n\s?t\s?i\s?f\s?i\s?c\s?a\s?c\s?i\s?[oó]\s?n)\s*:)[ \t]*[^\n]*?(?=[ \t]{3}|$)/gim, '$1 [dato]')
    .replace(/^.*\bhola\b.*$/gim, '[saludo]')
  for (const n of nombres.filter(x => x && x.length >= 3)) t = t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[nombre]')
  return t
}
