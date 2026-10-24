# Preventivo: plan con tipo de ticket y acceso por tipo

Cada plan preventivo tiene un tipo de ticket (cualquiera); genera tickets de ese tipo, y verlo, crearlo,
editarlo y darlo de baja se decide con los permisos sobre ese tipo. Rama sobre feat/preventivo-anticipacion
más feat/responsables-por-tipo (merge 1db294af).

## Specs

- **S1** — "Los tecnicos o colaboradores que hacen preventivos, que solo puedan ver los preventivos según
  los tipos de ticket que tengan habilitados, de esa forma los filtramos como los ticket comunes".
- **S2** — El plan tiene un tipo de ticket, elegible entre "Cualquier tipo (rec.)"; Preventivo es la
  opción por defecto. El ticket generado es de ese tipo (L2).
- **S3** — Planes existentes: tipo Preventivo, generan lo mismo que hoy (L2).
- **S4** — Permisos "Por el tipo del plan (rec.)": ver con Ver sobre el tipo, crear con Crear, editar con
  Modificar, dar de baja con Borrar; deja de usarse el permiso del módulo Preventivo para los planes (L2).
- **S5** — El responsable del plan sale de los técnicos y colaboradores con Ver sobre el tipo del plan (hoy
  sobre Preventivo), y el backend rechaza a otro (consecuencia de S2 con feat/responsables-por-tipo).

## Tasks

- [ ] T1 — S1-S5 — worker — migración (tipo_id con backfill a PREVENTIVO), dominio, permisos por tipo,
  generación por el tipo del plan, responsables por tipo, frontend — (pendiente)

## Log

- **L1** (dueño, 2026-10-23) — pedido S1, textual.
- **L2** (decisiones del dueño, 2026-10-24) — "a" (agregar al plan un tipo de ticket); tipos "Cualquier
  tipo (rec.)"; planes actuales "Preventivo (rec.)"; permisos "Por el tipo del plan (rec.)".
- **L3** (evidencia) — Hoy el plan no tiene tipo: la generación usa siempre `TIPO_CODIGO_PREVENTIVO`
  (`generar-preventivos.use-case.ts:112`) y las rutas piden `PREVENTIVO:LECTURA|ALTAS|MODIFICACION|BORRADO`
  (`preventivo.controller.ts:107-196`).
