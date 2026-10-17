# Finanzas Integradas

App de finanzas del hogar, multi-hogar y multi-miembro. React + Vite en el frontend, Supabase (Postgres + Auth + Storage) como backend, desplegada en Netlify.

## Puesta en marcha (una sola vez)

### 1. Supabase
1. Crea una cuenta en https://supabase.com y un proyecto nuevo (región **East US (N. Virginia)**, la más cercana a Colombia). Guarda la contraseña de la base de datos aunque la app no la usa.
2. En el panel: **SQL Editor → New query**. Pega el contenido completo de `supabase/migrations/0001_schema.sql` y ejecuta (**Run**). Debe terminar sin errores. Es idempotente: puedes volver a ejecutarlo.
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
1. Abre la URL en el celular, escribe tu correo y escribe el **código de 6 dígitos** que llega. (El correo también trae un enlace; sirve si lo abres en el mismo navegador, pero en la app instalada usa siempre el código.)
2. Crea tu hogar. Para invitar a tu familia: **Config → Hogar → Compartir**.
3. Carga masiva: en **Presupuesto** y en **Programado** (Obligaciones e Ingresos) el botón de subir (↑) importa un CSV; cada uno ofrece su plantilla descargable. Acepta `;` o `,`, montos `1.200.000` / `$ 78.500` y fechas `DD/MM/AAAA`. Maestros faltantes (entidad, categoría, cuenta) se crean al importar si lo autorizas.
4. En iPhone: Safari → Compartir → **Agregar a pantalla de inicio**.

## Desarrollo local
```
cp .env.example .env     # y pon tus credenciales
npm install
npm run dev              # http://localhost:5173
npm run build            # genera dist/
```

## Pruebas
`test/e2e.mjs` recorre los flujos principales (34 verificaciones) contra un backend simulado en memoria (`test/mockSupabase.js`), incluyendo aislamiento entre hogares. Requiere Chromium de Playwright:
```
npx vite build -c test/vite.test.config.js && node test/e2e.mjs
```
`supabase/migrations/0001_schema.sql` fue validado contra Postgres 16 con políticas RLS activas (ver `test/schema.test.sql`).

## Modelo de datos (resumen)
- `hogares` ← `miembros` (user, rol dueño/miembro) ← `perfiles` (hogar activo).
- Maestros por hogar: `entidades`, `categorias`, `cuentas` (incluye tarjetas con cupo/tasa/corte), `activos`.
- `presupuesto` por `periodo` (1° del mes); `movimientos` (lo único que mueve caja); `deudas` + `tc_cargos` + `cuotas_pagadas`; `programado` (obligaciones e ingresos, cada ocurrencia es una fila enlazada por `serie_id`, con ficha de pago) + `programado_adjuntos` en Storage.
- Toda tabla de dominio lleva `creado_por/actualizado_por` y queda en `bitacora`. RLS: un usuario solo ve filas de los hogares a los que pertenece.
- RPC: `crear_hogar`, `unirse_hogar`, `regenerar_codigo`, `completar_programado` (crea movimiento + siguiente ocurrencia, transaccional), `deshacer_programado`.
