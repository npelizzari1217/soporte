# Decisiones de producto pendientes de obra externa

Continuación de `odd/tasks/edilicia-obra-externa.md` (PR #539, mergeada en `88664234`). Implementa
las decisiones del dueño del 2026-11-06 sobre los advisories que dejaron las verificaciones.

## Specs

- **S1** (L30 de edilicia-obra-externa): un ticket con certificados vigentes no se puede borrar.
  Respuesta del dueño: "Bloquear el borrado (recomendado)" — "422 mientras haya certificados
  vigentes: primero se anulan."
- **S2** (L19): en EXTERNA, con todas las tareas completadas y la suma de pesos debajo de 100, el
  detalle muestra un aviso. Respuesta del dueño: "Aviso visual en el detalle (recomendado)" — "Un
  banner «los pesos suman X %, faltan Y %», sin bloquear el estado."
- **S3** (L10/L11): un bien RECHAZADO junto a servicios no bloquea. Respuesta del dueño: "Que no
  bloquee (cambia L11)" — "Solo cuentan los ítems no rechazados para decidir si la compra es «solo
  de servicio»."

Sin cambio de código (decididos el 2026-11-06): exigir la suma de 100 en cada emisión (L28) y que
«Copiar permisos» copie CERTIFICAR (L25). Congelar `esServicio` tras la decisión ya estaba hecho
(L11).

## Tasks

- [ ] T1 — S3 — inline — commit: —
- [ ] T2 — S1 — inline — commit: —
- [ ] T3 — S2 — inline — commit: —

## Log

- **L1 (usuario):** "Hagamos el punto 1 y vamos con las decisiones del punto 2"
- **L2 (usuario, decisiones):** borrar ticket → "Bloquear el borrado (recomendado)"; repesar →
  "Sí, exigir en cada emisión (recomendado)"; avance < 100 → "Aviso visual en el detalle
  (recomendado)"; copiar permisos → "Mantener (recomendado)"; esServicio → "Congelar tras la
  aprobación (recomendado)" (ya implementado en L11); bien rechazado → "No debe bloquear
  (recomendado)".
- **L3 (usuario, conflicto con L11):** "Que no bloquee (cambia L11)". La decisión de hoy reemplaza
  la del 2026-11-04.
