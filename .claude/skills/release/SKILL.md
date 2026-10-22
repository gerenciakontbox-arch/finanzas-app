---
name: release
description: Cierra un cambio de Akontapp: pruebas SQL, unitarias y e2e, revisión de capturas, build, commit en español y push a main (Netlify despliega). Usar antes de publicar cualquier cambio.
---
# /release · verificar y publicar

1. `npm run build` sin errores.
2. `npm run test:sql` (Postgres local o CI) → todos ✓ con los errores esperados.
3. `npm run test:unit` y `npm run test:e2e` → N/N. Si cambiaste texto o selectores, actualiza `test/e2e.mjs` (usa `data-item`, `aria-label` o `title` como ganchos, no texto suelto).
4. Mira las capturas `test/shot-*.png` de las pantallas tocadas (compón varias con PIL si son muchas) y corrige lo que se vea mal: etiquetas cortadas, pastillas pastel, sombras, abreviaturas, zona segura de iOS.
5. Actualiza `README.md` (y `CLAUDE.md` si cambió el modelo o una decisión).
6. Commit en español: qué y por qué, una línea por pieza; termina con las líneas de atribución de la sesión. `git push origin HEAD:main`.
7. Mensaje al dueño: commit, qué cambió en dos o tres frases, **qué migración debe ejecutar** y **qué variable de Netlify** falta (si aplica), y el siguiente paso real. Sin recapitular los pasos.
