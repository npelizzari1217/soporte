# roadmap-recontraste — el roadmap vuelve a decir la verdad sobre `main`

Rama `docs/cierre-pendientes`. `check-roadmap-fresco` falla: el ancla `23fbf939` (2026-10-16) quedó a
268 commits de `main`, con un umbral de 75.

## Specs

- **S1 — Afirmaciones vencidas.** Toda afirmación de `docs/roadmap-comercial.md` que los commits
  posteriores a `23fbf939` volvieron falsa se corrige con evidencia (sha o `path:line`).
- **S2 — Entregas nuevas.** Lo entregado desde `23fbf939` figura en el documento, con sha de `main`.
- **S3 — Ancla.** El encabezado declara el `main` contra el que se contrastó, y
  `node scripts/check-roadmap-fresco.mjs` sale en verde.
- No se decide nada de producto: lo que pide una decisión (fila de IA, rama sin mergear
  `docs/sla-reapertura`) se marca como pendiente del dueño.

## Tasks

- [ ] T1 — S1: corregir las afirmaciones vencidas (relevamiento en el Log, L2).
- [ ] T2 — S2: sumar las entregas nuevas.
- [ ] T3 — S3: mover el ancla, correr el check, commit.

## Log

- **L1 — Pedido (2026-10-27):** "hace lo que resuelvas tu y luego me dices como continuamos con lo mio".
- **L2 — Relevamiento (`gentle-ai-explore`, 2026-10-27).** 22 discrepancias: el satélite de Edilicia
  retirado (`1825c6b9`), los permisos por tipo en lugar de `TICKETS:*`/`EDILICIA:*` (`445a2493`), los
  estados que solo admiten comentarios (`765baaeb`, `3ac82584`), el preventivo por tipo (`af75a266`),
  el asistente de IA (`1a57be44`), la tanda de Ayuda (`05c0b5ce`) y los 9 tenants activos. Los shas
  citados son ancestros de `main`; `6044c97b` y `56ec1b47` no lo son y no se citan.
