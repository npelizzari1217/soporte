# Archive Report: admin-general

**Archived:** 2026-07-02
**Branch at close:** `chore/archive-admin-general`
**Verdict:** DONE — funcionalmente completo, CRITICAL de verify corregido antes del archive, cero criticals abiertos

---

## Scope Delivered (PR1–PR6, auto-chain + follow-ups)

Panel de administración multi-tenant con 3 niveles de acceso: operador global (`is_global_admin`),
admin-cliente (rol `ADMINISTRADOR`), usuario no-admin.

| PR | Slice | Tasks | Estado |
|----|-------|-------|--------|
| PR1 | Seguridad base — `GlobalAdminGuard`, guards en `ClientesController`/`CiclosVigentesController`, migración `is_global_admin` nestor, `JwtPayload.is_global_admin` frontend | T1.1–T1.x | DONE |
| PR2 | Backend clientes (listado + provisioning reconectado) + ciclos tenant (`ciclos_cliente`, listar/crear/activar) | T2.1–T2.16 | DONE |
| PR3 | Backend usuarios (crear, listar, baja lógica auditada) | T3.1–T3.10 | DONE |
| PR4 | Módulo reportes completo (4 use cases: tickets-por-usuario, tickets-por-tipo, tickets-por-estado, tiempo-resolución) | T4.1–T4.14 | DONE |
| PR5 | BFF x-tenant-id + TenantContext + selectores Cliente/Ciclo + Sidebar dinámico + middleware `/admin/*` | T5.x | DONE |
| PR6 | Pantallas admin: Clientes, Ciclos, Usuarios, Reportes (@media print) | T6.x | DONE |

**Total tasks:** 75/75 completadas (`tasks.md` checkoff sincronizado en este archive — T2.1–T2.16,
T3.1–T3.10, T4.1–T4.14 tenían bookkeeping pendiente por WARNING #1 del verify-report; corregido).

**Follow-up fuera de PR1–PR6:**
- PR #19 — ValidationPipe global (cubre los 5 DTOs de admin-general).
- PR #28 — fix post-verify: gate de rol en middleware para todas las rutas `/admin/*` (ver abajo).

**PRs de referencia (GitHub):** #15, #16, #17, #18, #20, #22, #23, #24, #25, #26, #19, #28 — todos mergeados a `master`.

---

## Verification Results (sdd-verify — obs #1613)

**Veredicto original del verify:** PASS WITH WARNINGS.

| Gate | Resultado |
|------|-----------|
| Backend `pnpm test` | PASS — 132 files / 1934 tests |
| Backend `pnpm lint` | PASS — 0 errores/warnings |
| Backend `tsc --noEmit` | PASS — 0 errores |
| Frontend `pnpm test` | PASS — 60 files / 493 tests (al momento del verify); 509 tests al momento del archive |
| Frontend `pnpm lint` | PASS — 0 errores, 3 warnings preexistentes ajenos a admin-general |
| Frontend `tsc --noEmit` | PASS — 0 errores |
| `as any`/`as unknown as` en lógica nueva | Cero — solo en `.spec.ts` (mocks) y patrón preexistente `_createdAt/_updatedAt` |

**Al momento del archive** (re-confirmado por el usuario): backend 1934 passed, frontend 509 passed, lint y `tsc --noEmit` limpios en ambos.

---

## CRITICAL corregido después del verify

### C1 — Rutas `/admin/*` sin gate de rol en middleware (verify-report obs #1613)

**Problema detectado en verify:** `frontend/src/middleware.ts:135` solo redirigía en
`/admin/clientes` cuando `is_global_admin !== true`. Las rutas `/admin/ciclos`,
`/admin/usuarios`, `/admin/reportes` no tenían ningún chequeo de rol (ni middleware ni guard
client-side) — violación literal del spec `admin-ui`, scenario "Usuario regular no ve ninguna
sección ADMINISTRACIÓN": "ninguna ruta bajo `/admin/*` MUST ser accesible" para
USUARIO/COLABORADOR/TECNICO. El backend sí protegía los datos (`PermissionsGuard`/
`AdminOrGlobalGuard` devolvían 403), por lo que no hubo fuga de datos, pero el shell de la
página se renderizaba para cualquier usuario autenticado.

**Corrección:** PR #28 (`fix(admin): gate all /admin/* routes by role in middleware`), mergeado
a `master` después del verify-report y antes de este archive. El requirement queda cumplido sin
desviación conocida — reflejado en el canonical `openspec/specs/admin-ui/spec.md`.

**Resultado:** el change se archiva SIN criticals abiertos.

---

## Deferred Debt (WARNINGS abiertos — no bloqueantes, registrados para no perderse)

| # | Item | Severidad | Detalle | Acción recomendada |
|---|------|-----------|---------|---------------------|
| D1 | ValidationPipe parcial | WARNING | El `ValidationPipe` global (PR #19) solo decora los 5 DTOs de `admin-general` (`create-ciclo`, `create-cliente`, `create-ciclo-vigente`, `reporte-query`, `CreateUsuarioDto`). `tickets/`, `compras/`, `equipos/`, `reparaciones/` siguen usando `interface` (no `class`) para sus DTOs de creación — el pipe los saltea en silencio (metatype `Object`). | Slice de validación pendiente para los 4 módulos restantes, fuera de scope de `admin-general`. |
| D2 | Tests de rol end-to-end incompletos en controllers nuevos | WARNING | `usuarios.controller.spec.ts` no tiene test explícito de `TECNICO → 403` a nivel HTTP (solo mockea el guard). `reportes.controller.spec.ts` mockea `TenantGuard` completo (`vi.mock`) — el aislamiento de tenant en reportes no está probado end-to-end a nivel de controller. `TenantGuard`/`PermissionsGuard` sí tienen unit tests exhaustivos y preexistentes en `guards.spec.ts`. | Agregar tests de integración HTTP con roles reales (sin mock del guard) en ambos controllers. |
| D3 | Migración `is_global_admin` de nestor pendiente en PROD | WARNING (operativo) | La migración idempotente `20260630_set_global_admin_nestor` (PR1) NO fue ejecutada en el server de producción al momento del archive. `nestor@sesitec.com.ar` NO tiene aún `is_global_admin = TRUE` en prod. | Correr `pnpm migrate:master` en PROD. Anotado también en el canonical `clientes-tenancy/spec.md`. |
| D4 | Deploy: feature flag y rebuild pendientes | WARNING (operativo) | El panel admin está detrás de `NEXT_PUBLIC_ADMIN_PANEL`, y como es un env var `NEXT_PUBLIC_*` se hornea en build time — no alcanza con setear la variable en runtime. | Activar `NEXT_PUBLIC_ADMIN_PANEL` en el entorno de build de producción y rebuildear Next antes de considerar el panel visible para usuarios reales. |

---

## Canonical Specs Merged/Created

| Capability | Tipo de merge | Path canonical | Notas |
|-----------|----------------|-----------------|-------|
| `auth-rbac` | MERGE (delta → canonical existente) | `openspec/specs/auth-rbac/spec.md` | Agregados 4 requirements (GlobalAdminGuard, ClientesController/CiclosVigentesController con JwtAuthGuard, claim `is_global_admin` en JwtPayload frontend). 890 → 1032 líneas. Sin pérdida de contenido previo. |
| `clientes-tenancy` | MERGE (delta → canonical existente) | `openspec/specs/clientes-tenancy/spec.md` | Agregada tabla `ciclos_cliente` (TENANT) al modelo de datos + 9 requirements de endpoints (`/clientes`, `/ciclos`, `/usuarios`, migración nestor). 157 → 627 líneas. |
| `admin-ui` | CREATE (promoción directa, NEW) | `openspec/specs/admin-ui/spec.md` | Sin deviaciones — el CRITICAL de rutas fue corregido en PR #28 antes del archive; el spec ya describía el comportamiento correcto (que ahora es AS-BUILT real). |
| `reportes` | CREATE (promoción directa, NEW) | `openspec/specs/reportes/spec.md` | Confirmado contrato `usuarioId` unificado (decisión PR4-W1, commit `2357e2e`) consistente en spec, backend y frontend — NO quedó el contrato viejo `asignadoId`/`solicitanteId`. |

---

## Observation IDs (Engram Traceability)

| Artefacto | Topic Key | Observation ID |
|-----------|-----------|-----------------|
| Proposal | `sdd/admin-general/proposal` | #1604 |
| Spec (delta original) | `sdd/admin-general/spec` | #1606 |
| Design | `sdd/admin-general/design` | #1605 |
| Tasks | `sdd/admin-general/tasks` | #1607 |
| Verify report | `sdd/admin-general/verify-report` | #1613 |
| Decisión PR4-W1 (usuarioId) | — | #1634 |
| Archive report | `sdd/admin-general/archive-report` | (guardado en mem_save al archivar) |

---

## Files Changed/Moved Summary

**Moved (`git mv`):**
- `openspec/changes/admin-general/` → `openspec/archive/admin-general/` (proposal.md, design.md,
  tasks.md, verify-report.md, apply-progress.md, apply-progress-pr3.md, apply-progress-pr4.md,
  apply-progress-pr6d.md, specs/auth-rbac/spec.md, specs/clientes-tenancy/spec.md,
  specs/admin-ui/spec.md, specs/reportes/spec.md)
- Directorio activo `openspec/changes/admin-general/` eliminado tras el `git mv` (no queda rastro
  en `changes/`).

**Modified (canonical specs, merge de delta):**
- `openspec/specs/auth-rbac/spec.md`
- `openspec/specs/clientes-tenancy/spec.md`

**Created (canonical specs, promoción directa):**
- `openspec/specs/admin-ui/spec.md`
- `openspec/specs/reportes/spec.md`

**Created (archive report):**
- `openspec/archive/admin-general/archive-report.md`
