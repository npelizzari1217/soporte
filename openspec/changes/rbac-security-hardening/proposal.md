# Propuesta: rbac-security-hardening

## Intent

Cerrar tres brechas de autorización/validación en el backend, todas con causa raíz ya diagnosticada en la exploración. Dos son la raíz del bug de producción (nestor terminó con el rol legacy soft-deleted `ADMIN`) y la tercera es la vulnerabilidad más severa encontrada: cualquier usuario autenticado puede suspender o reactivar clientes de cualquier tenant. Es un **fix urgente de seguridad**, prioridad de deploy alta.

Éxito = los tres endpoints quedan cerrados, con un test de regresión atómico por fix que hoy falla y luego pasa (RED→GREEN).

## Scope (in)

1. **[CRÍTICO] Guards faltantes en Clientes.** Agregar `@UseGuards(GlobalAdminGuard)` a `DELETE /clientes/:id` (suspender) y `PUT /clientes/:id/reactivar` (`clientes.controller.ts:118` y `:138`), consistente con el GET/POST del mismo controller. Hoy solo tienen `JwtAuthGuard` a nivel de clase → autorización operador-only vía `is_global_admin`.
2. **[ALTO — raíz del bug prod] `findByCodigo` no filtra soft-delete.** En `prisma-role.repository.ts:27-32`, reemplazar `findUnique({ where: { codigo } })` por `findFirst({ where: { codigo, deletedAt: null } })` para no resolver roles legacy soft-deleted (ej. `ADMIN`).
3. **[ALTO] `AsignarRolDto` sin validación.** Convertir la interface (`auth.dto.ts:33-35`) en `class` con `@IsIn(ROLES_VALIDOS)` sobre `rolCodigo`, mismo patrón que `CreateUsuarioDto`. Cierra el gap del endpoint legacy `POST /usuarios/:id/roles` que acepta cualquier string.

## Scope (out)

- UX de bloqueo temprano de altas (`can()` en páginas admin) → **Change 2**.
- Auditoría/CRUD de Equipos, Ciclos, Compras, Reparaciones → **Change 3**.
- Re-cablear RBAC: NO se toca el sistema de permisos ni se migran los guards a `roles_permisos`.

## Approach y rationale

Fix mínimo y consistente con lo existente. La autorización de Clientes ya corre por `is_global_admin`/`GlobalAdminGuard` (booleano paralelo al RBAC); **mantenemos ese approach** en vez de cablear el permiso `cliente:gestionar`. Motivo: consistencia con GET/POST del mismo controller y superficie de cambio mínima para un hotfix de seguridad. Los fixes 2 y 3 son defensa en profundidad complementaria: 2 evita resolver el rol muerto en el repo, 3 lo rechaza en el borde HTTP.

TDD estricto pero **atómico**: un test de regresión por fix (403 sin `is_global_admin`; `findByCodigo('ADMIN')` → null; `POST roles` con `ADMIN` → 400/404). Sin andamiaje.

## Deuda registrada (NO se resuelve acá)

**Permiso RBAC huérfano `cliente:gestionar`**: seedeado y asignado a `ADMINISTRADOR`, pero NUNCA chequeado — la autorización real es `is_global_admin`. Coexisten dos sistemas de autorización paralelos. Decisión futura pendiente: eliminar el permiso o cablear los guards de Clientes a RBAC. Fuera del alcance de este change.
