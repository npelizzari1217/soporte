# Archive note — tickets-flujo-estados-rbac

**Archivado**: 2026-07-07 · **Motivo**: exploración huérfana — el trabajo que definió ya se implementó y archivó bajo otros dos changes.

## Por qué se archiva

Este "change" quedó con solo `explore.md` (una exploración, sin proposal/spec/design/tasks). En su sección 7 ("Corte recomendado") propuso **partir el trabajo en dos changes independientes**, y ambos ya están cerrados y archivados:

| Corte propuesto en el explore | Change resultante | Estado |
|---|---|---|
| Change A — máquina de estados + observaciones + fix seguridad `PATCH /estado` | `tickets-maquina-estados-observaciones` | ✅ archivado |
| Change B — 4 roles RBAC + permisos + multi-tenant admin | `tickets-rbac-4-roles` | ✅ archivado |

Ver `openspec/changes/archive/tickets-maquina-estados-observaciones/` y `.../tickets-rbac-4-roles/`.

La exploración cumplió su función (definir el alcance y el corte) y su trabajo derivado ya shippeó. Se conserva como artefacto histórico; no hay nada pendiente.
