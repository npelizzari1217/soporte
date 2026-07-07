# Archive note — rbac-security-hardening

**Archivado**: 2026-07-07 · **Motivo**: reconciliación de estado SDD (implementación ya presente en código).

## Por qué se archiva sin ciclo SDD completo

Este change quedó con solo `proposal.md` (sin specs/design/tasks/verify), pero los **3 fixes de seguridad de su scope ya están aplicados en el código** (verificado sobre `master`, HEAD previo a este archive):

| Fix del scope | Estado | Evidencia en código |
|---|---|---|
| 1. Guards `GlobalAdminGuard` en Clientes (suspender/reactivar) | ✅ Aplicado | `backend/src/clientes/interface/controllers/clientes.controller.ts` — `@UseGuards(GlobalAdminGuard)` en `@Delete(':id')` (:120) y `@Put(':id/reactivar')` (:141) |
| 2. `findByCodigo` filtra soft-delete | ✅ Aplicado | `backend/src/auth/infrastructure/persistence/prisma/prisma-role.repository.ts:28-30` → `findFirst({ where: { codigo, deletedAt: null } })` |
| 3. `AsignarRolDto` con `@IsIn(ROLES_VALIDOS)` | ✅ Aplicado | `backend/src/auth/interface/dtos/auth.dto.ts:50-53` → `class AsignarRolDto` |

Los fixes se aplicaron directo (hotfix de seguridad urgente) sin generar el rastro SDD intermedio. No hay implementación pendiente.

## Deuda / caveat honesto

- No se corrió `/sdd-verify` formal sobre este change. La cobertura de tests de regresión por fix (que el proposal exigía RED→GREEN) NO se re-auditó en esta reconciliación — decisión explícita del usuario de archivar por la vía rápida. Si se necesita garantía formal, backfillear specs/tasks + verify.
- Deuda registrada en el propio proposal (permiso RBAC huérfano `cliente:gestionar`) sigue vigente y fuera de alcance.
