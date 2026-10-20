# Akontapp

App de finanzas personales con **espacios** compartidos (hogar, empresa). React + Vite en el frontend, Supabase (Postgres + Auth + Storage) como backend, desplegada en Netlify.

## Puesta en marcha (una sola vez)

### 1. Supabase
1. Crea una cuenta en https://supabase.com y un proyecto nuevo (región **East US (N. Virginia)**, la más cercana a Colombia). Guarda la contraseña de la base de datos aunque la app no la usa.
2. En el panel: **SQL Editor → New query**. Pega el contenido completo de `supabase/migrations/0001_schema.sql` y ejecuta (**Run**); luego haz lo mismo, en orden, con `0002_espacios.sql`, `0003_creditos_plan.sql`, `0004_codigo_invitacion.sql`, `0005_push.sql` y `0006_perfil.sql`. Todos son idempotentes: puedes volver a ejecutarlos.
3. En **Authentication → URL Configuration**:
   - *Site URL*: la URL de tu sitio en Netlify (por ejemplo `https://finanzas-quijano.netlify.app`).
   - *Redirect URLs*: agrega esa misma URL y `http://localhost:5173` (para desarrollo).
4. En **Authentication → Providers → Email**: deja activado *Enable email provider*. Puedes desactivar *Confirm email* para que el enlace mágico entre directo.
4b. En **Authentication → Emails → Magic Link** reemplaza el cuerpo por una plantilla que incluya el **código** `{{ .Token }}` además del enlace (ver `supabase/email-magic-link.html`). Sin esto, el correo solo trae el enlace y la app instalada en iPhone (pantalla de inicio) no puede iniciar sesión, porque el enlace abre en Safari y no dentro de la app.
4c. El remitente por defecto de Supabase solo entrega a miembros de tu organización y limita a 2 correos/hora. Antes de invitar a otras personas configura un SMTP propio en **Authentication → Emails → SMTP Settings** (Brevo, Resend, etc.) y sube el límite en **Authentication → Rate Limits**.
5. En **Settings → API** copia:
   - *Project URL* → `VITE_SUPABASE_URL`
   - *anon public* key → `VITE_SUPABASE_ANON_KEY`

> El plan gratuito pausa el proyecto tras 7 días sin actividad. Se reactiva con un clic en el panel, sin pérdida de datos. Si varios hogares usan la app a diario, no pasa.

### 2. GitHub
1. Crea un repositorio (puede ser privado) y sube esta carpeta completa (sin `node_modules` ni `dist`; el `.gitignore` ya los excluye).

### 3. Netlify
1. **Add new site → Import an existing project → GitHub** y elige el repositorio. Netlify detecta `netlify.toml` (build `npm run build`, publish `dist`).
2. **Site configuration → Environment variables**: agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del paso 1.5.
3. **Deploy**. Desde ahora, cada `git push` a la rama principal despliega solo.
4. Vuelve a Supabase y pon la URL definitiva de Netlify en *Site URL* (paso 1.3) si no la tenías.

### 4. Primer uso
1. Abre la URL en el celular, escribe tu correo y escribe el **código numérico** que llega. (El correo también trae un enlace; sirve si lo abres en el mismo navegador, pero en la app instalada usa siempre el código.)
2. Entras directo a tu espacio personal. Para compartir con tu familia o tu empresa: **Config → Espacios → Crear hogar o empresa**, y comparte el código. Tus cuentas se habilitan como medio de pago en cada espacio desde **Config → Cuentas** (espacio personal).
3. Carga masiva: en **Presupuesto**, **Programado** (Obligaciones e Ingresos) y **Activos** el botón de subir (↑) importa un CSV; cada uno ofrece su plantilla descargable. Acepta `;` o `,`, montos `1.200.000` / `$ 78.500` y fechas `DD/MM/AAAA`. Maestros faltantes (entidad, categoría, cuenta) se crean al importar si lo autorizas.
4. En iPhone: Safari → Compartir → **Agregar a pantalla de inicio**.

## Desarrollo local
```
cp .env.example .env     # y pon tus credenciales
npm install
npm run dev              # http://localhost:5173
npm run build            # genera dist/
```

## Pruebas
`test/e2e.mjs` recorre los flujos principales (76 verificaciones) contra un backend simulado en memoria (`test/mockSupabase.js`): espacios, cuentas habilitadas, aportes espejo, factura partida, privacidad entre miembros y entre hogares. Requiere Chromium de Playwright:
```
npx vite build -c test/vite.test.config.js && node test/e2e.mjs
```
Los esquemas fueron validados contra Postgres 16 con RLS activo y tres usuarios: `test/schema.test.sql` (0001), `test/schema2.test.sql` (migración 0002 sobre datos heredados) y `test/schema3.test.sql` (0003: presupuesto → programado, créditos, depreciación; se ejecuta sobre la base que deja schema2):
```
psql -h /tmp -p 5499 -U postgres -f test/schema2.test.sql && psql -h /tmp -p 5499 -U postgres -f test/schema3.test.sql
```

## Tratamiento de datos, perfil y señales (migración 0006 · Lote 5)
Base: Ley 1581 de 2012 y Decreto 1377 de 2013. Responsable: KONTBOX S.A.S. (completar NIT, dirección y correo en `src/legal/politica.js` antes de invitar a nadie; cambiar `POLITICA_VERSION` obliga a todos a re-autorizar).
- **Consentimientos** por finalidad (`servicio` obligatoria; `analitica`, `perfil`, `comercial` opcionales), pantalla de autorizaciones al primer ingreso y Ajustes → Privacidad para cambiarlas. Retirar una finalidad borra de inmediato lo derivado. Las filas de consentimiento nunca se borran (prueba del tratamiento); al eliminar la cuenta se archivan sin usuario.
- **Eventos** (`eventos`): pantalla y acción, sin contenido; solo con `analitica`; RLS lo impone (`consiente()`); poda a 90 días.
- **Perfil** (`perfil_usuario`): indicadores calculados por `netlify/functions/perfil-diario.mjs` (06:00 UTC = 1:00 Bogotá) y bajo demanda por `perfil-ahora.mjs` ("Calcular ahora" en Mi perfil). Cálculo en `_perfil.mjs` (`indicadores()`), probado en `test/perfil.test.mjs`. El usuario ve exactamente lo mismo que el operador.
- **Señales** (`senales_def` + `SENALES` en `_perfil.mjs`): hipótesis comerciales. Para agregar una: fila en `senales_def` + función con la misma clave. Con `comercial` vigente, cada señal activa crea una **oferta** (`ofertas`) que el usuario acepta o rechaza dentro de la app; el operador anota el resultado (venta / sin venta) para medir la señal.
- **Operador** (`app_admins`): panel en Ajustes → Privacidad → "Abrir el panel del operador" (o `/?ir=operador`). Ve agregados anónimos y perfiles **seudonimizados** (código `U-…`) solo de usuarios con `comercial`; la identidad (`operador_identificar`) exige oferta respondida y motivo, y queda en `accesos_operador`. Para dar el rol: en el SQL Editor, `insert into app_admins(user_id, nombre) select id, 'Operador' from auth.users where email = 'correo@...';`. Usa un correo distinto al de tu cuenta de usuario.
- **Derechos**: Mi perfil (conocer), Privacidad (rectificar/oponerse, descargar JSON+CSV, eliminar cuenta con `eliminar_mi_cuenta`). Pruebas: `test/schema6.test.sql` (5 errores esperados: son los bloqueos).

## Avisos push (migración 0005 + funciones de Netlify)
Un aviso diario a las 7:00 (Bogotá) con los vencimientos de hoy y los atrasados de Programado, por usuario y en todos sus espacios. Piezas:
- `public/sw.js`: service worker que muestra la notificación y abre la app en Programado (`/?ir=programado`).
- `src/lib/push.js` + Ajustes → Avisos: activa/desactiva por dispositivo (guarda la suscripción en `push_suscripciones`, RLS por usuario) y "Enviar prueba".
- `netlify/functions/avisos-diarios.mjs`: función programada (`schedule: 0 12 * * *` UTC). `aviso-prueba.mjs`: envío bajo demanda al usuario autenticado. Ambas usan la **service_role** de Supabase solo en el servidor.
- Variables en Netlify: `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`. Generar llaves: `npx web-push generate-vapid-keys`. Tras crearlas, redeploy con caché limpia (la pública entra en el build).
- iPhone: solo con la app instalada en pantalla de inicio (iOS 16.4+); el permiso se pide desde un toque del usuario.

## Migración 0004 · código de invitación sin pgcrypto
En Supabase `pgcrypto` vive en el esquema `extensions` y las funciones de la app fijan `search_path = public`, así que `gen_random_bytes` no existía al crear un espacio. `0004_codigo_invitacion.sql` genera el código con `md5` (core). La base de pruebas local ahora instala pgcrypto en `extensions`, como Supabase, para que esto no vuelva a pasar desapercibido.

## Migración 0003 · créditos, depreciación y presupuesto → programado
Supabase → **SQL Editor** → pega `supabase/migrations/0003_creditos_plan.sql` → **Run** (la app pide esquema v3). Qué agrega:
- **Créditos**: sistema de cuota (*fija* o *abono constante a capital*, cuota decreciente), seguro mensual dentro de la cuota, **abono extraordinario a capital** (reduce plazo o reduce cuota; la tabla se recalcula hacia adelante y las cuotas pagadas no cambian) y **pago anticipado con motivo**: si faltan más de 5 días para el vencimiento, el pago exige elegir un motivo que queda en el movimiento.
- **Activos**: depreciación lineal mensual con valor residual y vida útil de 2 a 10 años (inmuebles no deprecian). Para un activo comprado antes de usar la app: valor base = valor de mercado hoy, "deprecia desde" = hoy, vida útil = años que le quedan. El patrimonio usa el valor neto.
- **Presupuesto → Programado**: un rubro se programa desde el ítem (botón **Programar**) o desde el CSV (`programar = sí`, `periodicidad`, `vencimiento`, y `periodo` MM/AAAA para cargar todo el año en un archivo). Nace una obligación recurrente vinculada; el rubro queda **bloqueado** (no se edita ni se marca pagado a mano) y se cierra al pagarlo desde Programado, que además deja listo y vinculado el rubro del mes siguiente (lo crea si no existe). *Omitir* libera el rubro; *Desprogramar* borra la ocurrencia pendiente y devuelve el rubro a Planificado.

## Actualizar a la versión de espacios (migración 0002)
Si ya usabas la app con el esquema inicial (hogar único):
1. Sube esta versión a GitHub (Netlify despliega). La app mostrará "Base de datos desactualizada" hasta el paso 2; no se pierde nada.
2. Supabase → **SQL Editor → New query** → pega `supabase/migrations/0002_espacios.sql` → **Run**. Si aparece el aviso de "destructive operations / RLS", elige **Run without RLS** (el script activa RLS por su cuenta).
3. Vuelve a abrir la app. Qué hizo la migración con tus datos:
   - El hogar existente se convirtió en un espacio tipo **hogar** (mismo id, mismo código de invitación).
   - Cada miembro recibió su espacio **personal**.
   - Los ítems se repartieron según su entidad: entidad tipo *empresa* → espacio **empresa** nuevo con ese nombre (tú como administrador); entidad *persona* cuyo nombre coincide con un miembro → su espacio personal; el resto (Familia, personas sin cuenta) → se quedó en el hogar.
   - Las cuentas personales que ya se usaban en el hogar quedaron **habilitadas** allí como medio de pago.
   - Los gastos del hogar pagados con cuentas personales generaron sus **aportes espejo** en el personal del pagador.
   Después puedes mover cualquier activo, deuda, programación, compra o rubro entre espacios con el botón **Mover a…**.

## Modelo de datos (resumen)
- `espacios` (tipo personal / hogar / empresa) ← `espacio_miembros` (admin / miembro) ← `perfiles` (espacio activo, espacio personal). Cada usuario tiene un espacio personal creado automáticamente.
- Todo ítem pertenece a exactamente un espacio (`espacio_id`): `categorias` (desactivables; usadas no se borran), `cuentas` (con `dueno_id` si son personales), `activos`, `presupuesto` (con `pagador_id`), `deudas` + `tc_cargos` + `cuotas_pagadas`, `programado` (cada ocurrencia una fila por `serie_id`, con ficha de pago y `pagador_id`) + `programado_adjuntos`, `movimientos`.
- `cuentas_espacio`: cuentas personales habilitadas como medio de pago en espacios compartidos (los demás ven el nombre, nunca el saldo).
- **Aportes espejo**: un movimiento de un espacio compartido pagado con la cuenta personal de un miembro genera por trigger, en el personal del dueño de la cuenta, una `Transferencia` subtipo `aporte` (`espejo_de` → original). Ingreso del espacio en cuenta personal → `recibido`. Salida del espacio hacia la cuenta de un miembro → `Ingreso` (honorarios) o `devolucion`. Los espejos no se editan ni borran directamente (RLS); siguen al original.
- Saldo de una cuenta = solo movimientos cuyo `espacio_id` es el de la cuenta.
- RLS: un usuario ve las filas de los espacios donde es miembro (`mis_espacios()`), más las cuentas habilitadas en ellos. Auditoría (`creado_por/actualizado_por`) y `bitacora` en todas las tablas de dominio.
- RPC: `asegurar_personal`, `crear_espacio`, `unirse_espacio`, `regenerar_codigo`, `cambiar_mi_nombre`, `habilitar_cuenta`, `mover_item`, `completar_programado`, `deshacer_programado`, `pagar_factura_tc` (parte la factura por espacio), `pagar_cuota_credito`.
