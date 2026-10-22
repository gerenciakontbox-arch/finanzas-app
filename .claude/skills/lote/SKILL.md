---
name: lote
description: Convierte una lista de requerimientos del dueño en un plan de lote de Akontapp con preguntas numeradas, decisiones por defecto y alcance por capa (SQL, UI, pruebas). Usar cuando el dueño pide funcionalidades nuevas o cambios de reglas de negocio.
---
# /lote · de requerimientos a plan

1. Lee `CLAUDE.md` (reglas, modelo, historial de decisiones). No reabras decisiones ya tomadas.
2. Clasifica cada requerimiento: **A** cero ambigüedad (se construye ya), **B** necesita una decisión del dueño, **C** cambia el modelo de datos o la política de datos (no se asume nada).
3. Para B y C escribe **preguntas numeradas** con la opción por defecto que tomarías y su consecuencia ("si no respondes, hago X"). Máximo una pregunta por decisión real; nada de preguntas de cortesía.
4. Entrega el plan como: Lote N · nombre → migración (tablas/columnas/RPC/trigger + pruebas SQL con errores esperados) → UI (pantallas, primitivas, textos en español) → mock + e2e → variables/configuración que el dueño debe tocar → riesgos (incluye datos personales: ¿nueva finalidad?).
5. Arranca con los A mientras esperas respuestas; nunca construyas C antes de la respuesta.
6. Al cerrar el lote usa `/release`.
