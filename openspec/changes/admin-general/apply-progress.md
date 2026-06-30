# Apply Progress: admin-general

> Última actualización: 2026-06-30 | Rama: `feat/admin-general-pr1-security`

## PR1 — Security guard + is_global_admin front + migración nestor

### Estado: COMPLETO (incluyendo correcciones W1+W2 del verify-report)

### Archivos modificados / creados

| Archivo | Acción |
|---------|--------|
| `backend/src/auth/infrastructure/guards/global-admin.guard.ts` | NUEVO |
| `backend/src/auth/infrastructure/guards/global-admin.guard.spec.ts` | NUEVO |
| `backend/src/auth/auth.module.ts` | MODIFICADO — GlobalAdminGuard en providers + exports |
| `backend/src/auth/auth.module.spec.ts` | NUEVO — 2 tests metadata reflection (W1) |
| `backend/src/clientes/interface/controllers/clientes.controller.ts` | MODIFICADO — @UseGuards(JwtAuthGuard) |
| `backend/src/clientes/interface/controllers/clientes.controller.spec.ts` | MODIFICADO — T1.3 tests |
| `backend/src/clientes/interface/controllers/ciclos-vigentes.controller.ts` | MODIFICADO — @UseGuards(JwtAuthGuard) |
| `backend/src/clientes/interface/controllers/ciclos-vigentes.controller.spec.ts` | NUEVO — T1.5 tests |
| `backend/src/clientes/clientes.module.ts` | MODIFICADO — imports AuthModule |
| `backend/prisma_master/migrations/20260630000000_set_global_admin_nestor/migration.sql` | NUEVO |
| `frontend/src/shared/api/types.ts` | MODIFICADO — is_global_admin?: boolean |
| `frontend/src/shared/api/types.test.ts` | MODIFICADO — T1.8 tests |
| `frontend/src/shared/hooks/use-session.ts` | MODIFICADO — isGlobalAdmin |
| `frontend/src/shared/hooks/use-session.test.ts` | NUEVO — T1.10 tests |
| `openspec/changes/admin-general/tasks.md` | MODIFICADO — T1.7 path corregido (W2) |

### Tasks completadas

- [x] T1.1 — [RED] Unit test GlobalAdminGuard (5 tests)
- [x] T1.2 — [GREEN] GlobalAdminGuard implementado (O(1), sin DB)
- [x] T1.3 — [RED] Test ClientesController con JwtAuthGuard
- [x] T1.4 — [GREEN] @UseGuards(JwtAuthGuard) en ClientesController
- [x] T1.5 — [RED] Test CiclosVigentesController con JwtAuthGuard
- [x] T1.6 — [GREEN] @UseGuards(JwtAuthGuard) en CiclosVigentesController
- [x] T1.7 — Migración idempotente nestor@sesitec.com.ar → is_global_admin=true
- [x] T1.8 — [RED] Test JwtPayload frontend incluye is_global_admin?: boolean
- [x] T1.9 — [GREEN] is_global_admin?: boolean en types.ts
- [x] T1.10 — isGlobalAdmin en useSession + tests
- [x] W1 — [RED→GREEN] GlobalAdminGuard registrado y exportado en AuthModule
- [x] W2 — Typo path T1.7 corregido en tasks.md (prisma/ → prisma_master/)

### Evidencia final (post W1+W2)

- Backend: **117 archivos, 1786 tests PASS** (+2 nuevos vs baseline). `tsc --noEmit` clean. `pnpm lint` clean.
- Frontend: sin cambios en W1+W2.

### Pendiente

- T2.x–T6.x (PR2–PR6)
