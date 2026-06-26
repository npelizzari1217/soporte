# Archive Report — modelo-datos-tres-flujos

> Fecha de cierre: 2026-06-26
> Artefacto generado por: sdd-archive
> Estado final: **CERRADO** — implementación completa, verificada y archivada

---

## Resumen ejecutivo

Change `modelo-datos-tres-flujos` cerrado completamente. Las 7 fases (PR-05 a PR-18) fueron
implementadas bajo Strict TDD, verificadas adversarialmente (0 CRITICAL en todas las fases),
y la suite completa cierra con **1448/1448 tests verdes — 98 suites**. Las 6 specs delta
fueron mergeadas como specs canónicas en `openspec/specs/`. El change folder se movió a
`openspec/archive/modelo-datos-tres-flujos/`. La carpeta activa `openspec/changes/modelo-datos-tres-flujos/`
fue eliminada.

---

## Trazabilidad de artefactos

| Artefacto | Backend | ID / Ruta |
|-----------|---------|-----------|
| Proposal | openspec | `openspec/archive/modelo-datos-tres-flujos/proposal.md` |
| Design | openspec | `openspec/archive/modelo-datos-tres-flujos/design.md` |
| Tasks | openspec | `openspec/archive/modelo-datos-tres-flujos/tasks.md` |
| Apply progress | openspec + engram | `openspec/archive/modelo-datos-tres-flujos/apply-progress.md` / engram #1355 |
| Verify report (Fase 7) | openspec + engram | `openspec/archive/modelo-datos-tres-flujos/verify-report.md` / engram #1356 |
| Archive report | openspec + engram | `openspec/archive/modelo-datos-tres-flujos/archive-report.md` / topic: sdd/modelo-datos-tres-flujos/archive-report |

---

## Fases completadas

| Fase | PR | Rama | Commit | Tests al cierre | Veredicto verify |
|------|----|------|--------|-----------------|------------------|
| 1 — Auth RBAC & master schema | PR-05/06 | feat/pr05-auth-rbac | — | — | — |
| 2 — Clientes & tenant provisioning (schema) | PR-08 | feat/pr08-clientes | — | — | — |
| 3 — Tickets Core | PR-10/11 | feat/pr10-tickets-core | — | — | — |
| 4 — Compras | PR-13a/13b | feat/pr13b-compras-interface | — | 879/879 | PASS-WITH-WARNINGS (0 CRITICAL) |
| 5 — Reparaciones edilicias | PR-15a/15b | feat/pr15b-reparaciones-interface | — | 1107/1107 | PASS-WITH-WARNINGS (0 CRITICAL) |
| 6 — Equipos informáticos | PR-17a/17b | feat/pr17b-equipos-interface | — | 1324/1324 | PASS-WITH-WARNINGS (0 CRITICAL) |
| 7 — Integración cross-cutting (provisioning) | PR-18 | feat/pr18-integracion | 87869d2 | 1448/1448 | PASS-WITH-WARNINGS (0 CRITICAL) |

---

## Spec merge: delta → main specs

Todas las specs son NUEVAS (primera vez que se archiva este change; no existían specs canónicas previas).
Las 6 deltas se promovieron verbatim como specs canónicas.

| Capability | Operación | Conflictos | Ruta canónica |
|------------|-----------|------------|---------------|
| `auth-rbac` | CREADA (desde delta) | Ninguno | `openspec/specs/auth-rbac/spec.md` |
| `clientes-tenancy` | CREADA (desde delta) | Ninguno | `openspec/specs/clientes-tenancy/spec.md` |
| `compras` | CREADA (desde delta) | Ninguno | `openspec/specs/compras/spec.md` |
| `equipos` | CREADA (desde delta) | Ninguno | `openspec/specs/equipos/spec.md` |
| `reparaciones` | CREADA (desde delta) | Ninguno | `openspec/specs/reparaciones/spec.md` |
| `tickets-core` | CREADA (desde delta) | Ninguno | `openspec/specs/tickets-core/spec.md` |
| `_shared-audit-pattern` | CREADA (desde delta) | Ninguno | `openspec/specs/_shared-audit-pattern.md` |

---

## Warnings post-verify: estado de cierre

### RESUELTOS (confirmados en engram #1355 — commit 87869d2)

| ID | Descripción | Resolución |
|----|-------------|------------|
| W1 | Unit tests de `TenantContext.bind()` solo cubrían el path fallback (`enterWith`). El path de producción (`initScope → bind → store mutation`) no tenía cobertura. | FIXED: 2 nuevos unit tests en `tenant-context.spec.ts` cubren el path de producción. Tests: +2, suite de 1446 → 1448. |
| W2 | `dropDatabase()` sin `WITH (FORCE)` — podía dejar DBs huérfanas si cleanup fallaba antes del drop. | FIXED: `PostgresAdminService.dropDatabase` ahora usa `DROP DATABASE IF EXISTS "x" WITH (FORCE)`. Test actualizado (RED→GREEN). E2E real confirmó que FORCE funciona en PG 16.13. |
| W3 | Work de Fase 7 sin commitear / rama incorrecta. | RESUELTO: Todo Fase 7 commiteado en `feat/pr18-integracion` (commit 87869d2), 30 archivos, +3486/−53. |
| S2 | JSDoc obsoleto en `TenantGuard:9` mencionaba `AsyncLocalStorage.enterWith` en lugar del patrón de mutación de store. | FIXED: Comentario actualizado en `tenant.guard.ts`. |

### DEUDA DIFERIDA (decisión explícita del usuario — no bloquean producción)

| ID | Descripción | Riesgo | Acción futura |
|----|-------------|--------|---------------|
| W4 | Rollback compensatorio de provisioning solo verificado con mocks (31 unit tests). Ningún e2e simula fallo real de migración/seed y verifica que `dropDatabase()` elimina la DB con conexiones reales. | Bajo — adapters tienen `try/finally` explícitos; cobertura unit existe. | Implementar si se requiere confianza empírica del rollback en un SDD posterior. |
| S1 | `scripts/` fuera del scope de ESLint (`eslint.config.js` usa `files: ['src/**/*.ts']`). `migrate-tenants.ts` y `migrate-tenants.runner.ts` sin enforcement. | Bajo — código revisado manualmente (clean, tipado, idiomático). | Agregar `{ files: ['scripts/**/*.ts'] }` en `eslint.config.js` en próxima sesión de hardening. |

---

## Estado final del repositorio

- **Rama**: `feat/pr18-integracion`
- **Commit HEAD**: `87869d2`
- **Tests**: 1448/1448 verdes, 98 suites, 0 tests `.skip`/`.todo` en código nuevo
- **Fitness rules**: `@prisma/client` fuera de `infrastructure/` → 0 violaciones
- **DBs huérfanas**: 0 (verificado via `pg_database` query post-suite)
- **TypeScript**: `tsc --noEmit` → 0 errores
- **ESLint** (src/): 0 errores

---

## Próximo paso recomendado

Frontend (Next.js App Router + Tailwind + Shadcn) — iniciar con `/sdd-new` para la capa
de presentación de los 3 flujos (tickets, compras, reparaciones). El backend está
100% operativo y listo para consumo.
