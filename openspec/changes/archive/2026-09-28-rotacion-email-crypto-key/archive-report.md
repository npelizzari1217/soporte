# Archive Report: Rotación de `EMAIL_CRYPTO_KEY`

**Change**: `rotacion-email-crypto-key`
**Archived**: 2026-09-28
**Archive Location**: `openspec/changes/archive/2026-09-28-rotacion-email-crypto-key/`

## Cycle Summary

The SDD cycle `rotacion-email-crypto-key` delivered a complete infrastructure for rotating the `EMAIL_CRYPTO_KEY` secret across all SMTP passwords in the multitenant database, without rendering them unreadable. This closes a critical technical debt registered in `docs/roadmap-comercial.md:486` since the multi-tenant architecture was put in place.

**Change Status**: ✅ COMPLETE

The work includes:
- A pure-JavaScript cryptographic library (`cifrado-secreto-v1.mjs`, tested for byte-compatibility with the existing `AesGcmSecretCipher`)
- A transactional Node.js script (`rotar-email-crypto-key.mjs`) with full rollback semantics and independent verification modes
- A Windows PowerShell orchestrator (`rotate-email-crypto-key.ps1`) with 9-step recovery procedures and comprehensive error handling
- 53 passing test specifications covering cryptography, transactions, process isolation, and PowerShell AST execution
- Updated operational runbook and README documentation

## Delivery Topology

**Implementation Strategy**: `auto-chain` with `stacked-to-main` PR topology.

**Work Units**:
- **WU1a** (PR 1): Pure cryptography library + cross-cipher tests (212 lines)
- **WU1b** (PR 2): Validation and row classification (209 lines)
- **WU2a** (PR 3): `size:exception` (488 lines) — transactional rotation + `--dry-run` + integration tests
- **WU2b** (PR 4): `--verificar` read-only mode + process-level testing (170 lines)
- **WU3** (PR 5): PowerShell orchestrator + runbook + README (345 lines)
- **WU3-fix** (PR 6): First bounded correction from `verify-report` FAIL (C1, C2, C3, W1, W2, W3)
- **WU3-fix2** (PR 7): Second bounded correction (C-N1, W-A, W-B) authorized by the repository owner

**Total Lines of Production Code + Tests**: ~1,075 (split across 5 PRs as forecast in tasks.md)

**Stacked Commits** (over `main`): 7 commits total
- `c00ba59` WU1a
- `4cbfdf0` WU1b
- `34fab64` WU2a (`size:exception`)
- `e9604af` WU2b
- `78c4216` WU3
- `f7fe6c6` WU3-fix (first bounded correction)
- `366a8cc` WU3-fix2 (second bounded correction)

## Task Completion

**Tasks Total**: 36  
**Tasks Completed**: 36 (100%)  
**Tasks Incomplete**: 0

All implementation tasks, including corrections C-R1 (third correction, docs-only), are marked complete in `tasks.md`. WU3-fix2 additions are integrated into the existing checkboxes for WU3 (`3.4`, `3.5`, `3.6`, `3.8`).

## Verification

**Final Verification**: ✅ PASS  
**Evidence Revision**: `sha256:f84aae0e15217aa445f6c97df252d6a552fc295b5e588b216c24e162cd4e6e5f`

### Test Coverage

| Metric | Value |
|--------|-------|
| Build | `pnpm typecheck && pnpm lint` — 0 errors, 0 warnings |
| Tests | 53/53 passed (6 script specs, with full PowerShell harness via `PWSH_PATH`) |
| Requirements | 14/14 compliant |
| Scenarios | 18/18 compliant |
| Test Command Exit Code | 0 |

**Test Specs**:
- `scripts/lib/cifrado-secreto-v1.spec.ts` (R8, R10)
- `scripts/rotar-email-crypto-key.spec.ts` (R1, R5, R6)
- `backend/scripts/rotar-email-crypto-key.integration.spec.ts` (R2, R3, R4, R5, R6, R7, R8, R9)
- `backend/scripts/rotar-email-crypto-key.proceso.spec.ts` (R11, R12)
- `backend/scripts/ps1-ascii.spec.ts` (R14)
- `backend/scripts/rotate-email-crypto-key.ps1.spec.ts` (R12, R13, via AST extraction and pwsh harness)

### Verification Enhancements

After the initial PASS report, the following corrections were applied and re-verified:

1. **C-N1 (Critical)**: `[System.IO.File]::Replace($tmpEnvFile, $envFile, [NullString]::Value)` — corrected a typing issue where `$null` was passed to a .NET parameter expecting `[string]`.

2. **W-B (Warning)**: Step 9 refactored into a unified `try/catch` — now the entire environment-file cleanup and verification logic exits with code 5 on any failure, never 1 or 3, and preserves the `PENDIENTE` file for manual recovery.

3. **W-A (Warning)**: Extended `backend/scripts/rotate-email-crypto-key.ps1.spec.ts` with a new harness block testing the environment-file rewrite path (steps 7-8) in isolation, covering both success and failure scenarios.

### Prior Corrections

- **C1, C2, C3** (WU3-fix): Fixed three CRITICAL findings in the `.ps1` script (stdout mixing, error handling, and AST spec creation).
- **W1, W2, W3** (WU3-fix): Addressed three WARNINGs (service restart error handling, runbook clarity, and declared deviation of ADR-1).

All corrections have been verified GREEN (53/53 tests pass, both builds pass).

## Specification & Design Decisions

### Merged Specifications

A new specification domain was created in `openspec/specs/email-crypto-key-rotacion/spec.md`, mirroring the delta spec from the change folder. This is the canonical source of truth for the rotation capability.

**Requirements Traceability Matrix**:

| Req | Description | Implemented In | Verified |
|-----|-------------|-----------------|----------|
| R1 | Input key validation (64 hex chars, OLD ≠ NEW) | `validarClaves()` + CLI parsing | ✅ Scenarios: Invalid length, OLD==NEW |
| R2 | Single transaction with full rollback | `ejecutarRotacion()` + `BEGIN/COMMIT/ROLLBACK` | ✅ Mid-way interruption reverts |
| R3 | `--dry-run` mode (read-only) | `--dry-run` flag + `BEGIN READ ONLY` | ✅ No changes persisted |
| R4 | Failing row aborts COMMIT | `rowCount===1` check + validation | ✅ Failing row aborting |
| R5 | Undecryptable row aborts | `clasificarFila()` logic | ✅ Classified as `indescifrable` |
| R6 | Re-run no-op detection | Classification state machine (ADR-1) | ✅ Re-run idempotent |
| R7 | Mixed OLD/NEW rows processed | Multi-state classification | ✅ Mixed rows handled |
| R8 | Ciphertext bound to clienteId (AAD) | `clienteId` as AAD in crypto operations | ✅ AAD-binding verified |
| R9 | NULL rows untouched | `NOT NULL` predicate in SELECT | ✅ Nulls left unchanged |
| R10 | Cross-cipher compatibility | `AesGcmSecretCipher` byte-for-byte tests | ✅ Both directions |
| R11 | `--verificar` mode (read-only verification) | `--verificar` flag + `BEGIN READ ONLY` | ✅ Exit code 0/non-0 |
| R12 | No secrets in output (any command) | No logging of keys/plaintext anywhere | ✅ `processo.spec.ts` asserts |
| R13 | `.env` rewrite after COMMIT | `.env` update follows transaction success | ✅ Recovery documented |
| R14 | `.ps1` is ASCII without BOM | File encoding constraint | ✅ `ps1-ascii.spec.ts` |

### Key Design Decisions (ADR-1)

**Row Classification State Machine** (Requirement R5, R6, R7):

Each row is classified into one of four states:
1. **`pendiente`**: Decrypts with OLD_KEY only → rotate to NEW_KEY
2. **`ya_migrada`**: Decrypts with NEW_KEY only → leave unchanged
3. **`indescifrable`**: Decrypts with neither → abort transaction
4. **`NULL`**: `smtp_password_cifrada IS NULL` → leave unchanged

Malformed payloads (wrong version prefix or segment count) are also classified as `indescifrable`.

**W3 Declared Deviation** (Captured in `apply-progress.md`):  
The classification and UPDATE occur in the same loop iteration, within a single transaction. Correctness depends on the ROLLBACK mechanism to revert all rows if classification fails partway through. This is acceptable because:
- The transaction is atomic: either all updates succeed or none do.
- The verification round-trip (R4) re-reads all rows and validates them before COMMIT.

## Roadmap Closure

The debt row **"Rotación de `EMAIL_CRYPTO_KEY`"** in `docs/roadmap-comercial.md` (Deuda técnica conocida section) has been marked **RESUELTA** (2026-09-28) with a reference to this archived cycle.

## Artifacts Archived

The complete cycle is preserved in `openspec/changes/archive/2026-09-28-rotacion-email-crypto-key/`:

- ✅ `proposal.md` — initial scope and approach
- ✅ `specs/email-crypto-key-rotacion/spec.md` — 14 requirements, 18 scenarios
- ✅ `design.md` — cryptographic design and testing strategy
- ✅ `tasks.md` — 36 tasks (all complete), with work-unit breakdown and size forecasting
- ✅ `exploration.md` — initial context and research
- ✅ `apply-progress.md` — implementation tracking and corrections narrative
- ✅ `verify-report.md` — final PASS verdict with all requirement/scenario compliance
- ✅ `state.yaml` — cycle metadata (phase: tasks, all WUs complete)
- ✅ `archive-report.md` — this document

## Known Gaps and Follow-Ups

### Non-Blocking Suggestions from Verification

Per `verify-report.md`, the following are open suggestions (non-critical, non-blocking):

- **S-A**: `Start-Service` calls inside error handlers could be guarded more defensively.
- **S-C**: Runbook wording "cerrar esa sesion" could be clarified.
- **S-D**: ADR-1 could be formally added to `design.md`.
- **S-G**: Conditional "Se conserva PENDIENTE" message could be refined.
- **S-I**: Block 3 recovery could add an explicit `if ($LASTEXITCODE -ne 0)` gate (currently relies on operator reading exit code).
- **S-J**: Block 2 recovery could re-declare `$pendiente` for isolation.
- **S1–S5**: Earlier-report suggestions.

### Declared Production Limitation

The full `.ps1` script cannot run end-to-end outside Windows due to `Start-Service`, `icacls`, and hardcoded paths (`C:\soporte`). Every decision branch is covered by AST harnesses and verifier probes; the first production invocation will be `powershell -File .\rotate-email-crypto-key.ps1 -DryRun` on the VPS to validate the environment.

### Out-of-Cycle Follow-Up

The section §2.2 of the parent repository's `CLAUDE.md` (`/home/usuario/proyectos/CLAUDE.md`) must be updated to include a row for `rotate-email-crypto-key.ps1`, mapping it to the VPS operations exception. This is a separate edit in the parent repository and not part of this cycle.

## Source of Truth

All specifications, designs, and tasks have been merged into the canonical `openspec/` locations and are now the single source of truth:

- **Main Spec**: `openspec/specs/email-crypto-key-rotacion/spec.md`

The implementation (code, tests, documentation) is committed to the repository under the stacked branches and will be merged to `main` via the chained PR strategy.

## Final Status

✅ **ARCHIVED AND CLOSED** — The change is fully implemented, verified, and ready for production deployment. All 14 requirements, 18 scenarios, and 53 test specifications are compliant. No blockers or critical findings remain.

---

**Archive Completed**: 2026-09-28  
**Cycle Duration**: From proposal through two bounded corrections and final verification  
**Verification Confidence**: High (53/53 tests pass, lint/typecheck clean, cross-cipher compatibility proven, process isolation verified)
