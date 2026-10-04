# Archive Report: formulario-publico-qr

**Change**: Formulario público por cliente + QR en equipos  
**Archive date**: 2026-10-04  
**Status**: Complete with warnings resolved  
**Verdict**: PASS WITH WARNINGS → 2 warnings resolved post-verify; 1 warning remains (W1)

---

## Final State at Archive

### Task Completion

- **Total tasks**: 73
- **Completed**: 73
- **Incomplete**: 0
- **Work units**: WU-1 to WU-20 (WU-20 was a post-verify remediation for W2)

All implementation tasks checked [x] in `tasks.md`. `sdd-status` reports `apply: all_done, tasks 73/73`.

### Verification Outcome

**Verdict**: PASS WITH WARNINGS (no blockers)

| Metric | Status |
|--------|--------|
| Requirements | 21/21 covered |
| Scenarios | 57/57 covered |
| Tests | 7237 backend + 1901 frontend (first pass); 7237 backend re-run WU-20 |
| Lint | 0 errors |
| Typecheck | 0 errors |
| Blockers | 0 |
| Critical findings | 0 |

**Candidate at archive**: commit `f19b92ff` on `feat/formulario-publico-qr-wu20` (WU-20 remediation of W2).

### Post-Verify Resolutions (Orchestrator Final-State Facts)

#### W2 — Resolved by WU-20 (`f19b92ff`)

**Original**: PII in unconfirmed or orphan `pedidos_publicos_pendientes` rows was purged only by the next solicitud in the same tenant. A tenant with no further requests, or with the form disabled, keeps that PII indefinitely.

**Remediation**: `PurgaPendientesVencidosScheduler` runs `purgarVencidos` **hourly in every active tenant**, whether the form is on or off, with no dependence on traffic. PII in expired rows now outlives the 24 h TTL by at most ~1 h.

**Implementation**:
- `backend/src/publico/infrastructure/schedulers/purga-pendientes-vencidos.scheduler.ts` (new)
- `@Cron(process.env.PURGA_PENDIENTES_CRON ?? CronExpression.EVERY_HOUR)`
- Enumerates active tenants with `ITenantEnumerator.listActiveTenants()`
- Binds `TenantContext.run()` per tenant; calls `purgarVencidos()`
- Per-tenant error isolation; logs only `dbName`, count, and error message (no PII)
- Wiring in `FormularioPublicoModule` and registered via `ScheduleModule.forRoot()` in `AppModule`

**Verification**: 6 unit tests (all pass), 4 mutations that go RED when sweep is disabled, 1 runtime probe confirming cron registration in real `AppModule`. TDD Cycle Evidence reported in `apply-progress.md`. Tasks 20.1 and 20.2 checked.

#### W3 — Resolved post-verify in `357bd405` (docs-only)

**Original**: ADR-7 stated "no hay scheduler" after WU-20 added the hourly sweep. Design artifact became stale.

**Resolution**: Commit `357bd405` updated ADR-7 bullet to name the hourly sweep, its scope (active tenants only) and `PURGA_PENDIENTES_CRON` env var. Lint and typecheck re-run and pass.

#### S5 — Resolved post-verify in `357bd405` (docs-only)

**Original**: `FormularioPublicoModule` JSDoc and `confirmar-pedido-publico.use-case.ts` had stale comments saying the module was not yet registered in AppModule.

**Resolution**: Commit `357bd405` removed the stale paragraphs. Lint and typecheck re-run and pass.

### Delivery Status

All 20 work units and the WU-20 remediation have been merged into `main`:

- **Tracker PR**: `feat/formulario-publico-qr` → `main` at commit `f39cf601` (PR #300)
- **WU PRs**: #301–#340 chained; #340 merged into tracker at `21d3daea`; #301 shows merged; #302–#339 closed with a comment they are included via #300
- **Issue #299**: Closed automatically by tracker merge
- **Roadmap**: Point "Segunda etapa, punto 1" declared **Cumplida** (verified as TRUE in verify-report)
- **Roadmap verification**: `node scripts/check-roadmap-fresco.mjs` passes

### Open Warnings (Not Blockers)

**W1: Three scenarios proven by combined evidence**

The 57 scenarios are all covered by passing tests, but 3 lack single end-to-end tests:

1. **solicitante-externo "Alta de un externo"**: No assertion that no `Usuario`/`Membresia` is created (implied by confirm path not touching master users; inspection shows correct).
2. **pedido-publico "Dos tenants con guards reales"**: No single e2e for solicitud with a token from B followed by confirm (multiple tests together prove the isolation; inspection shows correct).
3. **pedido-publico "Descripcion excesiva"**: The HTTP 400 without mail is tested at entity level and with invalid email, not both in one test (inspection shows correct).

No deviation from spec; these are test-scope observations. Each deserves a direct test as a follow-up.

### Open Suggestions (Non-Critical)

**S1**: Add BFF rationale for `contexto` XFF tracker to ADR-8 (today only in code). State that rotating XFF bypasses enumeration throttle.  
**S2**: Add unit tests for `trackerEmail`, `trackerCliente`, `trackerConfirmacion` (design lists them as unit; only e2e covers them today).  
**S3**: Add one Playwright or real-process smoke for browser → BFF → backend on `publico/*`.  
**S4**: WU-18 UX follow-ups: keep `siguiente` on direct `/pedido-qr` visit; add `enabled: Boolean(slug)` to `useResolverQr`; landing fallback after dialog close.  
**S6**: WU-20 sweep does not reach inactive or soft-deleted clients. Expired pending rows created up to 24 h before a suspension stay in the tenant DB until reactivation, then purge within ~1 h. Add to D11 and client-lifecycle retention review.

---

## Artifacts Archived

The entire change folder has been moved with `git mv` to preserve history:

**Source**: `openspec/changes/formulario-publico-qr/`  
**Destination**: `openspec/changes/archive/2026-10-04-formulario-publico-qr/`

**Archived contents**:
- ✅ `proposal.md`
- ✅ `specs/equipos-qr/spec.md`
- ✅ `specs/formulario-publico-cliente/spec.md`
- ✅ `specs/pedido-publico/spec.md`
- ✅ `specs/solicitante-externo/spec.md`
- ✅ `design.md`
- ✅ `tasks.md` (all 73 tasks checked)
- ✅ `apply-progress.md`
- ✅ `verify-report.md`

**New specs merged into main source of truth**:
- `openspec/specs/equipos-qr/spec.md` (new, mechanically copied)
- `openspec/specs/formulario-publico-cliente/spec.md` (new, mechanically copied)
- `openspec/specs/pedido-publico/spec.md` (new, mechanically copied)
- `openspec/specs/solicitante-externo/spec.md` (new, mechanically copied)

All spec copies verified byte-identical to source via `diff -q`.

---

## Deployment Notes

The change is **merged to main** (`f39cf601`) and **ready for deploy**. The orchestrator final-state facts note:

### Database Migrations Required

**Master** (soporte_master):
- `20261003120000_add_cliente_formulario_publico` (slug, habilitacion, congelamiento, habilitado flag)
- `20261003160000_pedido_publico_tokens` (tokens table)

**Tenant** (per-client base):
- `equipos_qr` (qr_token_hash, qr_emitido_at)
- `solicitantes_externos` (id, nombre, email, telefono, email_verificado_at, timestamps)
- `tickets_solicitante_externo` (solicitante_id nullable, solicitante_externo_id FK, CHECK)
- `pedidos_publicos_pendientes` (description, equipo_id, created/expires)

### Frontend Dependency

**Lockfile changed**: `uqr@0.1.3` (QR library, MIT, 0 dependencies).  
**Pre-deploy step**: Run `pnpm install` manually with services stopped before running `deploy.ps1` (the script will abort if it detects the lockfile change without a fresh install).

### New Environment Variable

**Optional**: `PURGA_PENDIENTES_CRON` (default: every hour, `0 * * * *`). Cron expression for the hourly purge of expired pending orders in every active tenant.

### Form Status

The public form starts **disabled for each client** (`formulario_publico_habilitado` default `false`). ROOT enables it per client via the PATCH `/clientes/:id/formulario-publico` endpoint after configuring a slug.

### CI/Known Issues

**Flaky test** (unrelated follow-up): `backend/scripts/rotate-email-crypto-key.ps1.spec.ts` timed out once on each of PRs #340 and #300, passed on rerun. Suggest investigation into timeout sensitivity in that test.

---

## Roadmap Declaration

The roadmap entry for "Segunda etapa, punto 1 — formulario público + QR" was declared **Cumplida** in `docs/roadmap-comercial.md` (PR #300 commit `b7365b93`).

**Verification outcome**: The declaration is **TRUE**. All 13 product bullets are implemented and verified in the delivered code:

1. ✅ Single-use link (ticket only on confirmation)
2. ✅ External requester in tenant DB, no Usuario/Membresia
3. ✅ Session-only path for disabled email (SESION mode)
4. ✅ Direct NUEVO, no moderation
5. ✅ Notifications (number, status, comments, CSAT by mail)
6. ✅ 24-hour link expiry
7. ✅ SOPORTE + MEDIA fixed types
8. ✅ Slug (ROOT-loaded, immutable after first QR)
9. ✅ One QR per equipment, opaque regenerable token, no batch printing
10. ✅ No attachments
11. ✅ Throttling (3 per 15 min per client, 30 per hour per client)
12. ✅ Data retention while ticket exists (D11: FK RESTRICT, no delete path)
13. ✅ Off by default, enabled by ROOT

The roadmap wording was updated to reflect the merged state:  
**Old**: "Implementado — ... pendiente de merge y deploy"  
**New**: "Merged into main (`f39cf601`), deploy pending."

---

## Archival Verification

**Spec sync**: All 4 delta specs mechanically copied to main specs with shell `cp` and verified identical.

```
✓ equipos-qr: identical
✓ formulario-publico-cliente: identical
✓ pedido-publico: identical
✓ solicitante-externo: identical
```

**Folder move**: Entire change folder moved with `git mv` from `openspec/changes/formulario-publico-qr/` to `openspec/changes/archive/2026-10-04-formulario-publico-qr/`, verified with pre-move snapshot via `diff -r`.

```
Archive verification: identical to pre-move snapshot (empty diff)
```

**Task Completion Gate**: Passed. All 73 tasks checked [x]; no stale unchecked tasks.

**Archive readiness**: Confirmed. `sdd-status` shows `apply: all_done, tasks 73/73`.

---

## Summary

The change **formulario-publico-qr** is complete, verified PASS WITH WARNINGS (no blockers), merged to `main` at commit `f39cf601`, and archived in `openspec/changes/archive/2026-10-04-formulario-publico-qr/` with all delta specs synced to the main source of truth. Two post-verify warnings (W3, S5) were resolved with docs-only updates in commit `357bd405`. One warning (W1) remains as a test-scope observation (no deviation from spec).

**The SDD cycle is closed.** Ready for deployment with pre-deploy database migrations and manual `pnpm install` for the frontend lockfile change.
