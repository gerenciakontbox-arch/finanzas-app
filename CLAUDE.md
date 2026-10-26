# Akontapp · guía para agentes (Claude Code) y personas

App de finanzas personales/hogar/empresa. React + Vite (PWA) · Supabase (Postgres, RLS, Auth por código OTP) · Netlify (sitio y funciones programadas). Idioma del producto y del código: español. Responsable del tratamiento de datos: KONTBOX S.A.S.

## Reglas que no se negocian
1. **Una migración por cambio de base**, numerada (`supabase/migrations/000N_*.sql`), idempotente, y termina subiendo `app_meta.schema_version` al mismo número que `SCHEMA_VERSION` en `src/lib/auth.jsx` y `valor:` en `test/mockSupabase.js`. La app se bloquea ("Base de datos desactualizada") hasta que el dueño la ejecute en Supabase → SQL Editor. Nunca editar una migración ya publicada: se escribe la siguiente.
2. **La base de datos es la autoridad**: aislamiento por RLS (`mis_espacios()`), reglas de negocio en triggers/RPC `security definer set search_path = public`. La UI no se fía de sí misma. Ojo: en Supabase `pgcrypto` vive en `extensions` y no está en ese `search_path` (usar `md5`, no `gen_random_bytes`).
3. **Toda regla de negocio nueva lleva prueba SQL** en `test/schemaN.test.sql` con los `ERROR` esperados contados en `test/run-sql.sh`, y **toda pantalla nueva o cambiada lleva verificación e2e** en `test/e2e.mjs` (backend simulado en `test/mockSupabase.js`, que debe emular las reglas nuevas) y captura revisada a ojo.
4. **Seguridad**: la `service_role` de Supabase solo en funciones de Netlify (variables sin prefijo `VITE_`); nunca en el navegador ni en el repo. Nada de contraseñas en fichas de pago. Las llaves VAPID se generan con `npx web-push generate-vapid-keys`.
5. **Datos personales (Ley 1581/2012)**: cualquier dato o uso nuevo se encaja en una finalidad de `src/legal/politica.js` (`servicio`, `analitica`, `perfil`, `comercial`). Si cambia la política, sube `POLITICA_VERSION` (todos re-autorizan). Lo derivado de una finalidad se borra al retirarla. El operador solo ve seudónimos; identificar exige motivo y queda en `accesos_operador`.
6. **Identidad visual** (dirección "flat bancario"): tokens en `src/lib/ui.jsx` (`T`), un solo morado `#4B1D9E` plano, sin degradados ni sombras (salvo la nav), Montserrat, etiquetas en minúscula, estados como texto de color, botones píldora, zonas seguras de iOS respetadas (`safe-top`/`safe-bot`, nunca `padding` abreviado en línea sobre ellas).
7. **Antes de construir un lote**: resumen de estructura + preguntas numeradas al dueño; decisiones que cambian el modelo de datos no se asumen. Después: commit descriptivo en español, push a `main` (Netlify despliega solo) y aviso de qué migración debe ejecutar y qué variable de Netlify falta, si aplica.

## Mapa
- `src/App.jsx` cabecera, nav de 6 secciones (Inicio · Movimientos · Plan[Presupuesto|Programado] · Deudas · Activos · Ajustes), vistas `perfil` y `operador`, deep links `/?ir=...`.
- `src/lib/` `auth.jsx` (sesión, espacios, consentimientos, `SCHEMA_VERSION`), `data.jsx` (carga de tablas, `db` filtrado por espacio, `saldoCuenta`, `insertar/actualizar/borrar/rpc` con eventos), `finanzas.js` (amortización, depreciación, aportes), `util.js` (`amortizacion` con sistemas fija/capital, seguro, abonos), `ui.jsx` (primitivas y tokens), `push.js`, `eventos.js`, `csv.js`.
- `src/modules/` una pantalla por archivo; `Privacidad.jsx` (autorizaciones, derechos, Mi perfil, ofertas, operador); `MoverA.jsx` (mover ítems entre espacios).
- `src/legal/politica.js` política y finalidades.
- `netlify/functions/` `avisos-diarios` (push 12:00 UTC), `aviso-prueba`, `perfil-diario` (06:00 UTC), `perfil-ahora`, `extracto-leer-background` (PDF/foto → JSON con Anthropic, en segundo plano vía `tc_lecturas`; `_pdf.mjs` extrae y tacha), `_push.mjs`, `_perfil.mjs` (indicadores y `SENALES`).
- `supabase/migrations/` 0001 base → 0010. `supabase/email-magic-link.html` plantilla del código OTP (`{{ .Token }}`).
- `test/` `run-sql.sh`, `schema*.test.sql`, `mockSupabase.js`, `e2e.mjs`, `perfil.test.mjs`, capturas `shot-*.png`.

## Comandos
```
npm run build                      # producción
npm run test:unit                  # indicadores del perfil
npm run test:e2e                   # build de prueba + Playwright (89 verificaciones)
PGHOST=... PGPORT=... PGUSER=postgres npm run test:sql   # Postgres 16; crea la base fintest2
```
Postgres local de este entorno: `su pguser -c "/usr/lib/postgresql/16/bin/pg_ctl -D /home/pguser/pg/data -l /home/pguser/pg/log start -o '-p 5499 -k /tmp'"` y `PGHOST=/tmp PGPORT=5499`. Chromium: en este entorno `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e` (en CI Playwright instala el suyo).

## Modelo (lo esencial)
- **Espacios**: personal (automático por usuario), hogar y empresa (compartidos por código). Toda fila lleva `espacio_id`. Cuentas personales se habilitan como medio de pago en espacios compartidos (`cuentas_espacio`); pagar algo del hogar con cuenta personal genera un **aporte espejo** en el personal (`movimientos.espejo_de`, solo lectura). Kontbox = espacio empresa como tesorería.
- **Saldo de cuenta** = `saldo_inicial` + movimientos del propio espacio posteriores a `fecha_corte`.
- **Presupuesto → Programado**: `programar_presupuesto` crea la serie; el rubro queda bloqueado (trigger `presupuesto_guardia`) y se cierra al pagar desde Programado, que vincula o crea el rubro del mes siguiente (`auto_creado`).
- **Créditos**: sistema `fija`/`capital`, `seguro_mensual`, `cuotas_previas`, abonos a capital (`abonos_capital`, modo plazo/cuota), pago anticipado (> 5 días) exige motivo.
- **Activos**: depreciación lineal mensual (`vida_util_meses` 24–120, `valor_residual`, `valor_base`, `fecha_base`); inmuebles no deprecian.
- **Extractos TC**: `tc_extractos` por corte; compras nuevas con `cuotas_previas = cuota_actual − 1`; huella `tc_cargos.ref_extracto`; conciliación en `src/lib/extracto.js`. El archivo nunca se guarda; el texto se tacha antes de salir (regla 5).
- **Perfil y señales**: `perfil_usuario` (indicadores + `senales`), `senales_def` + `SENALES` en `_perfil.mjs`, `ofertas` (mostrada → tocada → aceptada/rechazada → convertida). Nueva señal = fila + función con la misma clave.

## Historial de decisiones del dueño (no reabrir sin motivo)
Historial no se mueve con un activo entre espacios · miembros ven nombre de cuentas ajenas, nunca saldo · cuota variable = abono constante a capital · seguro fijo mensual dentro de la cuota · anticipo N = 5 días con motivo; abono a capital recalcula · inmuebles no deprecian; activos previos se remiden (valor base + fecha base) · presupuesto anual cargado una vez; programable desde ítem o CSV; lo no programado queda en presupuesto · finalidad comercial opcional y apagada por defecto; el usuario ve lo mismo que el operador · Activos y Ajustes como pestañas propias · extractos: modelo por API, sin guardar el archivo y tachando identificadores; solo se crean compras (intereses/manejo/seguros son extras de la factura); la app muestra diferencias y el usuario ajusta.
