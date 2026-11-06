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

- [x] T1 — S3 — inline — commit: 6b8055aa
- [x] T2 — S1 — inline — commit: ff010757
- [x] T3 — S2 — inline — commit: 4fa31b97

## Log

- **L1 (usuario):** "Hagamos el punto 1 y vamos con las decisiones del punto 2"
- **L2 (usuario, decisiones):** borrar ticket → "Bloquear el borrado (recomendado)"; repesar →
  "Sí, exigir en cada emisión (recomendado)"; avance < 100 → "Aviso visual en el detalle
  (recomendado)"; copiar permisos → "Mantener (recomendado)"; esServicio → "Congelar tras la
  aprobación (recomendado)" (ya implementado en L11); bien rechazado → "No debe bloquear
  (recomendado)".
- **L3 (usuario, conflicto con L11):** "Que no bloquee (cambia L11)". La decisión de hoy reemplaza
  la del 2026-11-04.
- **L4 (evidencia T1):** `esSoloDeServicio` descarta los ítems RECHAZADOS antes de decidir. RED: «un bien RECHAZADO junto a servicios no bloquea» en rojo, el único. GREEN más los casos hermanos (bien vigente junto a uno rechazado sigue bloqueando; un servicio rechazado no vuelve de servicio a una compra de bienes). Reparaciones + compras 74/74 archivos, 1430 tests; typecheck 0; lint 0. Ayuda `reparaciones-edilicias.md` actualizada.
- **L5 (evidencia T2):** `BorrarTicketUseCase` lee los certificados del ticket dentro de la transacción con el lock (el fake lo afirma) y suma los vigentes al 422 de `TicketConPendientesNoBorrableError` («anular su certificado de avance vigente» / «anular sus N certificados de avance vigentes»); sin clase de error nueva, el catálogo del controller no cambia. Tests: uno vigente → 422 y nada cambia; vigentes y anulados junto con una compra → cuenta solo los vigentes; todos anulados → se borra. Sin RED útil: es feature (no exige TDD) y, con el constructor viejo, el fake nuevo desplaza los argumentos y falla todo por cableado. Tickets 121/121 archivos, 1612 tests (incluida la integración de concurrencia del borrado); typecheck 0; lint 0. Ayuda `tickets-detalle.md` actualizada.
- **L6 (evidencia T3):** aviso con `role="status"` en `TicketTareas` cuando la modalidad es EXTERNA, todas las tareas están completadas y los pesos suman menos de 100: «Todas las tareas están completadas, pero los pesos suman X %: faltan Y % para llegar a 100 %.» RED: el caso positivo en rojo, el único; hermanos (una pendiente, suma 100, INTERNA) en verde. Frontend tickets 26/26 archivos, 365 tests; type-check 0; lint 0. Ayuda: no hay artículo de pesos (suspendida), anotado en el commit.
- **L7 (verificación independiente):** PASS de S1, S2 y S3, sin blockers. `comprasQueBloquean` es la única implementación de la regla (chip de Edilicia, `compra.bloquea`, `bloqueada` del detalle); `modalidadEsEditable` cuenta todas las compras vinculadas y no depende de «solo de servicio». El 422 del borrado llega como toast (`notifyError`). Mutantes en rojo: sin el filtro de RECHAZADO; sin el chequeo de certificados; contando anulados; sin «todas completadas», sin `conPeso`, `<` por `<=`. Backend reparaciones + tickets 144/144 archivos, 1912 tests; frontend tickets 26/26, 365 tests; typecheck, type-check y lint en 0. Advisories tomados: test de EXTERNA sin tareas (el mutante sin `avance.total > 0` quedaba verde; ahora en rojo, 39/39) y el comentario de `ticket-borrar-button.tsx` que no nombraba los certificados. No tomados: una línea larga de JSDoc (cosmético) y el caso INTERNA con `modalidad` ausente (mismo camino de código).
