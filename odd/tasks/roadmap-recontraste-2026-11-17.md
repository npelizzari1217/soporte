# roadmap-recontraste-2026-11-17 — el roadmap vuelve a decir la verdad sobre `main`

Rama `docs/roadmap-recontraste-2026-11-17`. `check-roadmap-fresco` falla: el ancla `a2f312fa`
(2026-10-27) quedó a 90 commits de `main` (`d2527894`), con un umbral de 75. Mismo procedimiento que
`odd/tasks/roadmap-recontraste.md`.

## Specs

- **S1 — Afirmaciones vencidas.** Toda afirmación de `docs/roadmap-comercial.md` que los commits
  posteriores a `a2f312fa` volvieron falsa se corrige con evidencia (sha o `path:line`).
- **S2 — Entregas nuevas.** Lo entregado desde `a2f312fa` figura en el documento, con sha de `main`.
- **S3 — Ancla.** El encabezado declara el `main` contra el que se contrastó, y
  `node scripts/check-roadmap-fresco.mjs` sale en verde.
- No se decide nada de producto: lo que pide una decisión se marca como pendiente del dueño.

## Tasks

- [x] T1 — S1: relevar y corregir las afirmaciones vencidas. Commit: `581be35a`
- [x] T2 — S2: sumar las entregas nuevas en "Recontraste del 2026-11-17". Commit: `581be35a`
- [x] T3 — S3: mover el ancla, correr el check. Commit: `581be35a`

## Log

- **L1 — Pedido (2026-11-17):** "encara el problema", sobre el check `roadmap` en rojo del PR #548
  (ancla `a2f312fa` a 80 commits de `main`, umbral 75), que se mergeó igual por decisión del dueño
  ("Opcion 1").
- **L2 — Relevamiento (2026-11-17).** 13 merges y 2 commits directos de docs desde `a2f312fa`. Sin
  afirmaciones falsas en lo de antes; sí matices: obra externa (`88664234`) cambia para tickets
  EXTERNA el avance (por peso), lo que se puede descompletar o borrar (tareas certificadas), el cierre
  (no se cierra con tareas sin certificar) y la métrica de técnicos (solo INTERNA); la compra solo de
  servicios no bloquea y el anclaje `bloqueo-reparacion.ts:48` pasó a `:66`; existen exportaciones y
  un PDF de una compra individual, además de las 5 de listados. Ningún documento ODD nuevo dejó tareas
  abiertas. Deuda de Ayuda nueva anotada en commits: obra externa y aviso de saturación.
- **L3 — Cierre (2026-11-17).** Lo histórico no se reescribe: se corrigieron en el lugar el
  encabezado (ancla `d2527894`) y una nota en "Deuda de Ayuda"; lo demás va en la sección nueva
  "Recontraste del 2026-11-17". Los 20 shas citados son ancestros de `main` y los 5 `path:line`
  apuntan a lo que dicen. `node scripts/check-roadmap-fresco.mjs`: "El roadmap esta fresco." (0
  commits).
