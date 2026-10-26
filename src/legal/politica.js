// Política de tratamiento de datos personales de Akontapp. Versión = fecha; cambiarla obliga a re-autorizar.
// Los corchetes [ ] son datos que el responsable debe completar antes de publicar.
export const POLITICA_VERSION = '2026-10-26'
export const RESPONSABLE = { nombre: 'KONTBOX S.A.S.', nit: '[NIT]', direccion: '[Dirección], Cali, Colombia', correo: '[correo de datos personales]', telefono: '[teléfono]' }

export const FINALIDADES = [
  { k: 'servicio', obligatoria: true, titulo: 'Prestarte el servicio', texto: 'Guardar y mostrarte tus cuentas, movimientos, presupuesto, obligaciones, deudas y activos, compartirlos con los miembros de los espacios a los que te unas, enviarte el código de acceso por correo y los avisos que actives. Si cargas un extracto de tarjeta, se interpreta con un modelo de lenguaje (Anthropic) sin guardar el archivo y tachando antes tus identificadores.' },
  { k: 'analitica', obligatoria: false, titulo: 'Mejorar la app con datos de uso', texto: 'Registrar qué pantallas abres y qué acciones haces (no el contenido de lo que escribes) para entender qué funciona y qué no. Se conserva 90 días y se usa de forma agregada.' },
  { k: 'perfil', obligatoria: false, titulo: 'Construir tu perfil financiero', texto: 'Calcular a diario indicadores sobre cómo manejas tu dinero (puntualidad de pagos, disciplina presupuestal, carga de deuda, patrimonio, hábitos de registro) y mostrártelos en "Mi perfil". Solo tú lo ves.' },
  { k: 'comercial', obligatoria: false, titulo: 'Recibir ofertas de Kontbox según tu perfil', texto: 'Usar tu perfil para detectar situaciones en las que Kontbox puede ayudarte (por ejemplo, honorarios recurrentes sin empresa, varios créditos activos) y mostrarte una oferta dentro de la app. Kontbox solo conoce tu nombre y correo si tocas una oferta o aceptas que te contacten; mientras tanto te ve con un código, no con tu nombre.' },
]

export const POLITICA = `POLÍTICA DE TRATAMIENTO DE DATOS PERSONALES · AKONTAPP
Versión ${POLITICA_VERSION}

1. Responsable del tratamiento
${RESPONSABLE.nombre}, NIT ${RESPONSABLE.nit}, ${RESPONSABLE.direccion}. Correo para asuntos de datos personales: ${RESPONSABLE.correo}. Teléfono: ${RESPONSABLE.telefono}.

2. Marco legal
Ley 1581 de 2012, Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y demás normas que los modifiquen. La autoridad de protección de datos es la Superintendencia de Industria y Comercio (SIC).

3. Datos que se tratan
Datos de identificación y contacto (correo electrónico, nombre que elijas), datos financieros que tú registras (cuentas, saldos calculados, movimientos, presupuesto, obligaciones programadas, créditos, tarjetas, activos) y, si lo autorizas, datos de uso de la app (pantallas y acciones, sin el contenido de los formularios) y los indicadores derivados de tu información financiera. No se tratan datos sensibles ni datos de menores de edad; la app no está dirigida a menores.

4. Finalidades
a) Prestar el servicio: obligatoria para usar la app.
b) Mejorar la app con datos de uso: opcional.
c) Construir tu perfil financiero y mostrártelo: opcional.
d) Ofrecerte servicios de Kontbox a partir de tu perfil: opcional. Kontbox solo conoce tu identidad si respondes a una oferta; mientras tanto, tu perfil se identifica con un código.
Cada finalidad se autoriza por separado y puedes cambiar tu decisión en cualquier momento en Ajustes → Privacidad. Retirar b), c) o d) borra de inmediato los datos derivados de esa finalidad.

5. Quién accede a tus datos
Tú y los miembros de los espacios compartidos (hogar o empresa) a los que decidas unirte, en los términos que la app muestra al compartir. El operador de la app accede a cifras agregadas y anónimas; solo accede a tu identidad en el caso de la finalidad d) descrito arriba, y cada acceso queda registrado. No se venden ni ceden datos a terceros.

6. Encargados y transferencia internacional
La app usa Supabase (base de datos y autenticación), Netlify (alojamiento y funciones) y, solo cuando cargas un extracto de tarjeta, Anthropic (interpretación del documento mediante un modelo de lenguaje), todos con servidores en Estados Unidos, país que la Circular Externa 005 de 2017 de la SIC reconoce con nivel adecuado de protección. Actúan como encargados bajo sus términos de servicio y medidas de seguridad (cifrado en tránsito y en reposo, control de acceso). El extracto no se almacena: se procesa en memoria, con número de tarjeta, documento, nombre, dirección, correo y teléfono tachados antes del envío, y se conservan únicamente las compras y los totales extraídos.

7. Seguridad
Acceso por código de un solo uso enviado al correo, aislamiento de datos por usuario y por espacio mediante reglas en la base de datos, registro de cambios (bitácora) y de accesos del operador.

8. Conservación
Tus datos financieros se conservan mientras tengas la cuenta. Los datos de uso se eliminan a los 90 días. Al eliminar tu cuenta se borran tus datos y tu usuario; se conserva únicamente el registro de las autorizaciones que diste y retiraste, como prueba del tratamiento, sin vínculo a tu usuario.

9. Tus derechos (Ley 1581 de 2012, art. 8)
Conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización; ser informado del uso que se les ha dado; presentar quejas ante la SIC; revocar la autorización y solicitar la supresión. Desde la app: Ajustes → Privacidad (ver y cambiar autorizaciones, descargar tus datos, eliminar tu cuenta) y "Mi perfil" (ver lo que la app concluye de ti). Por escrito: al correo del numeral 1. Consultas: respuesta máxima en diez (10) días hábiles; reclamos: quince (15) días hábiles, prorrogables conforme a la ley.

10. Cambios
Si esta política cambia de forma que afecte las finalidades o tus derechos, la app te pedirá de nuevo tu autorización antes de continuar.
`
