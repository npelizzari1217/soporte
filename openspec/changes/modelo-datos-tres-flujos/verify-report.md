# Verify Report — PR-08: TENANT schema DDL + initial migration (task 3.D.3)

> Change: `modelo-datos-tres-flujos`  
> Scope: PR-08 only — `prisma_tenant/schema.prisma`, `migration.sql`, `prisma.tenant.config.ts`, 18 integration tests  
> Verdict: **PASS-WITH-WARNINGS**  
> Date: 2026-06-23  
> Reviewer: sdd-verify (adversarial pass)

---

## Summary

0 CRITICAL, 1 WARNING, 4 SUGGESTION. All 11 tenant models are faithfully implemented against the spec. Migration SQL matches schema.prisma. CHECK constraints and partial indexes are present in the SQL. Multi-schema isolation is clean. TDD discipline confirmed by git commit order. All gates pass: 361/361 tests green, 0 lint errors, TypeScript clean.

---

## Gate Results

| Gate | Command | Result |
|------|---------|--------|
| Tests | `pnpm test` | 361/361 green (28 suites) |
| Lint | `pnpm lint` | 0 errors |
| TypeScript | `tsc --noEmit` | clean |
| Tenant integration | `pnpm test --testPathPatterns=tenant-schema` | 18/18 green |

---

## Spec Fidelity — Per Model

### `estados` — PASS

All 9 columns match spec (uuid PK, varchar(50) codigo UNIQUE, varchar(100) nombre, varchar(20)? color, int orden DEFAULT 0, bool activo DEFAULT true, audit triple). Named relations `EstadoAnterior`/`EstadoNuevo` in `OperacionTicket` correctly handled with back-relations in `Estado`. Soft delete present. Migration SQL matches schema.

Note: spec column restriction says "UNIQUE, CHECK ver abajo" for `codigo` but defines no CHECK below. Implementation correctly implements UNIQUE only (estados are tenant-extensible). See SUGGESTION-1.

### `prioridades` — PASS

All 9 columns match spec. UNIQUE on `codigo`. Regular indexes not required by spec (only seeds noted). ✅

### `tipos_ticket` — PASS

All 7 columns match spec (no `color`/`orden` — correct, spec omits them). UNIQUE on `codigo`. CHECK constraint `tipos_ticket_codigo_check CHECK ("codigo" IN ('SOPORTE', 'COMPRAS', 'EDILICIA'))` present in migration SQL as raw SQL (not expressible in Prisma schema). ✅

### `tipo_operacion` — PASS

Table name is `tipo_operacion` (singular, matching spec). All 7 columns match. UNIQUE on `codigo`. ✅

### `ciclos_cliente` — PASS

All 10 columns match spec (includes `ciclo_vigente_id` as soft ref, `fecha_inicio`/`fecha_fin` as DATE). Both indexes present: `ciclos_cliente_ciclo_vigente_id_idx` and `ciclos_cliente_activo_idx`. See WARNING-1 and SUGGESTION-5 re the index comment.

### `tickets` — PASS

All 14 columns match spec (including nullable `ciclo_id`, `asignado_id`, `descripcion`, `fecha_vencimiento`; NOT NULL `solicitante_id`). All 7 required indexes created. Critical: partial indexes for `ciclo_id WHERE ciclo_id IS NOT NULL` and `asignado_id WHERE asignado_id IS NOT NULL` are present in migration SQL. FK `tickets_ciclo_id_fkey` uses `ON DELETE SET NULL` — ACCEPTED DECISION (ratified). ✅

### `operaciones_ticket` — PASS

All 11 columns match spec (metadata JSONB nullable, estado_anterior_id/estado_nuevo_id nullable). Two named FKs to `estados` for the dual state refs. Three required indexes present. ✅

### `archivos` — PASS

All 9 columns match spec (storage_key TEXT UNIQUE, tamano_bytes BIGINT NOT NULL). CHECK `archivos_tamano_check (tamano_bytes > 0)` present in migration SQL. ✅

### `archivos_ticket` — PASS

Composite PK `(archivo_id, ticket_id)`, `created_at` only (no `updated_at`/`deleted_at` — ACCEPTED DECISION). Both FKs with ON DELETE CASCADE. Index on `ticket_id`. ✅

### `archivos_operacion` — PASS

Composite PK `(archivo_id, operacion_id)`, `created_at` only (no soft delete — ACCEPTED DECISION). Both FKs with ON DELETE CASCADE. No extra index required by spec. ✅

### `usuario_tipos_ticket` — PASS

Composite PK `(usuario_id, tipo_ticket_id)`, `created_at` only (no soft delete — ACCEPTED DECISION). `usuario_id` is a soft ref (no FK to master.usuarios — correct). `tipo_ticket_id` has FK to `tipos_ticket` with RESTRICT. Index on `usuario_id`. ✅

---

## Multi-Schema Isolation — PASS

- `prisma.config.ts` (master): reads `DATABASE_URL_MASTER` — used by `migrate:master`
- `prisma.tenant.config.ts` (tenant): reads `DATABASE_URL_TENANT` — explicitly passed via `--config` in `migrate:tenant`
- `migrate:master` uses default `prisma.config.ts` auto-resolution → `DATABASE_URL_MASTER` ✅
- `migrate:tenant` passes `--config prisma.tenant.config.ts` explicitly → `DATABASE_URL_TENANT` ✅
- No cross-contamination between master and tenant migration paths
- `_prisma_migrations` tables are separate per-DB (applied to their respective DBs)

---

## TDD Discipline — CONFIRMED

Git commit order (newest last):
1. `c31880d test(tenant): add RED schema verification test for 3.D.3 (18 assertions)` — RED first
2. `7cab640 feat(tenant): add 11 Prisma models for tickets-core tenant schema (3.D.3)` — schema
3. `067eb03 feat(tenant): add initial migration, tenant config, and migrate:tenant update` — migration GREEN
4. `9cf7a7b fix(tenant): rename tamanoBytyes → tamanoBytes (Prisma field name typo)` — post-green fix

Test file predates schema and migration. RED→GREEN order confirmed. ✅

---

## Integration Test Quality Assessment

The 18 tests genuinely query `information_schema`, `check_constraints`, and `referential_constraints` on the real `soporte_tenant_test` DB. Not trivial assertions. Coverage:
- Table existence (all 11 tables)
- Column presence, data_type, is_nullable for 6 key tables
- CHECK constraints (2 verified)
- FK referential integrity (5 tables verified)
- ON DELETE CASCADE in join tables (2 tables verified)
- Absence of `cliente_id` in all 11 tables (physical isolation)

Minor weakness: see SUGGESTION-2 and SUGGESTION-3.

---

## Findings

### WARNING-1 — Misleading schema comment on `ciclos_cliente_activo_idx`

**File**: `backend/prisma_tenant/schema.prisma`, line 144  
**Comment**: `@@index([activo]) // el índice real puede ser parcial WHERE deleted_at IS NULL — ver migration SQL`  
**Actual migration**: `CREATE INDEX "ciclos_cliente_activo_idx" ON "ciclos_cliente"("activo");` — REGULAR index, no WHERE clause.

The phrase "ver migration SQL" directs developers to the migration expecting to find a partial index. They find a regular one. The spec only requires `INDEX (activo)` without specifying partial, so the implementation is spec-conformant. The comment is aspirational but misleading. A developer who trusts it may incorrectly assume rows with `deleted_at IS NOT NULL` are excluded from the index.

**Action**: Update comment to clarify the index is regular (not partial). E.g., `// spec requiere INDEX(activo) — regular, no partial WHERE. Ver migration SQL.`

---

### SUGGESTION-1 — Orphaned "CHECK ver abajo" note in spec for `estados.codigo`

**File**: `openspec/changes/modelo-datos-tres-flujos/specs/tickets-core/spec.md`  
**Table row**: `| codigo | varchar(50) | NOT NULL | UNIQUE, CHECK ver abajo | ... |`  
**Issue**: No CHECK is defined below for `estados.codigo`. For `tipos_ticket.codigo` a CHECK IN (...) is explicitly defined. For `estados.codigo` there is none (estados are tenant-extensible).

**Implementation**: Correctly implements UNIQUE only. No CHECK added.  
**Action at archive**: Update spec to remove "CHECK ver abajo" note or add explicit explanation that `estados.codigo` has no DB-level CHECK (extensibility is intentional).

---

### SUGGESTION-2 — Weak assertion in `tamano_bytes > 0` CHECK test

**File**: `backend/src/shared/infrastructure/persistence/tenant-schema.integration.spec.ts`, line 249  
**Code**: `const hasPositiveCheck = res.rows.some((r) => r.check_clause.includes('0'));`  
**Issue**: `.includes('0')` passes for `tamano_bytes >= 0` and `tamano_bytes > 0`. Should verify `> 0` specifically.  
**Suggested fix**: `r.check_clause.includes('> 0')` or `r.check_clause.match(/tamano_bytes\s*>\s*0/)`  
**Severity**: Low — the migration SQL is correct; this is a test precision issue only.

---

### SUGGESTION-3 — `tipos_ticket` CHECK test only verifies one of three values

**File**: `backend/src/shared/infrastructure/persistence/tenant-schema.integration.spec.ts`, lines 226-233  
**Code**: The test checks for 'SOPORTE' presence only. A constraint like `CHECK (codigo = 'SOPORTE')` would pass.  
**Suggested fix**: Also verify 'COMPRAS' and 'EDILICIA' are included in the check_clause.  
**Severity**: Low — migration SQL defines the correct three-value CHECK. Test is imprecise.

---

### SUGGESTION-4 — Stale TODO in `prisma.config.ts`

**File**: `backend/prisma.config.ts`, comment header  
**Text**: `// TODO(PR-08 — tenant migrations): parametrizar la url por target (DATABASE_URL_MASTER vs. url por-tenant). Hoy solo aplica a MASTER.`  
**Status**: This TODO was resolved by PR-08 (created `prisma.tenant.config.ts`). The comment was not removed.  
**Action**: Remove the TODO line from `prisma.config.ts` header.

---

## Accepted Decisions (not flagged)

Per scope instructions, the following were ratified before verify and are confirmed correctly implemented:

1. **Join tables without `updatedAt`/`deletedAt`**: `archivos_ticket`, `archivos_operacion`, `usuario_tipos_ticket` have only `created_at`. Physical delete via ON DELETE CASCADE or explicit delete. Confirmed in schema, migration, and integration tests. ✅

2. **`tickets.ciclo_id` FK uses `ON DELETE SET NULL`**: Implemented as `ON DELETE SET NULL ON UPDATE CASCADE` in migration line 271. Makes ciclo_id nullable-on-parent-delete, not cascaded. ✅

---

## Artifacts

- Spec read: `openspec/changes/modelo-datos-tres-flujos/specs/tickets-core/spec.md`
- Shared audit: `openspec/changes/modelo-datos-tres-flujos/specs/_shared-audit-pattern.md`
- Schema: `backend/prisma_tenant/schema.prisma`
- Migration: `backend/prisma_tenant/migrations/20260623120000_init_tenant_schema/migration.sql`
- Config: `backend/prisma.tenant.config.ts`
- Tests: `backend/src/shared/infrastructure/persistence/tenant-schema.integration.spec.ts`
