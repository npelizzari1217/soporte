```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:f84aae0e15217aa445f6c97df252d6a552fc295b5e588b216c24e162cd4e6e5f
verdict: pass
blockers: 0
critical_findings: 0
requirements: 14/14
scenarios: 18/18
test_command: PWSH_PATH=/tmp/claude-1000/-home-usuario-proyectos-soporte/80a61f74-7c6b-4885-aa58-e5abb6a98169/scratchpad/pwsh/pwsh pnpm vitest run scripts/lib/cifrado-secreto-v1.spec.ts scripts/rotar-email-crypto-key.spec.ts scripts/rotar-email-crypto-key.integration.spec.ts scripts/rotar-email-crypto-key.proceso.spec.ts scripts/ps1-ascii.spec.ts scripts/rotate-email-crypto-key.ps1.spec.ts
test_exit_code: 0
test_output_hash: sha256:2adba1bf9085606e1b3e695f54fe757a09ed9a68771538f41e5bec01c2e28745
build_command: pnpm typecheck && pnpm lint
build_exit_code: 0
build_output_hash: sha256:42cb804fe1f22859c73ca2244d92fde1db5b7a9f33ecddd8332f3d8182524c11
```

## Verification Report (final re-verify after the docs-only runbook correction)

**Change**: rotacion-email-crypto-key
**Version**: N/A
**Mode**: Standard (feature; Strict TDD not active)
**Candidate**: `feat/rotacion-email-crypto-key-wu3-fix2` @ `366a8cc` (PR 7 amended). `evidence_revision` = sha256 of `git diff main...HEAD`. This replaces the previous report (`sha256:5a5bac1...`, verdict fail, blocker C-R1).

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 36 |
| Tasks complete | 36 |
| Tasks incomplete | 0 |

### Scope of this correction

`git diff f2ab92d 366a8cc` touches only `DEPLOY-VPS-runbook.md` (§5, "Recuperacion manual"), `apply-progress.md` and `tasks.md`. `git diff --quiet f2ab92d 366a8cc -- rotate-email-crypto-key.ps1 backend/` exits 0, so the code is byte-identical to the state that was verified last time.

### Build & Tests Execution

**Build**: Passed. `pnpm typecheck && pnpm lint` in `backend/`: exit 0, 0 errors.

**Tests**: 53 passed / 0 failed / 0 skipped. These are the 6 script specs, run with `PWSH_PATH` pointing to a portable pwsh 7.4.6.

**Runbook recovery: verifier's own sequential reproduction** (pwsh 7.4.6, scratchpad).

The harness reads the three `powershell` fences inside "Recuperacion manual (exit 3, 4 o 5)" straight from `DEPLOY-VPS-runbook.md`. It swaps only the absolute Windows paths for temp paths and replaces `C:\nodejs24\node.exe <script>` with a Node stub. The stub exits 0 only when `ROTACION_VERIFICAR_KEY` is NEW and `DATABASE_URL_MASTER` is set. The blocks run in sequence through `Invoke-Expression`.

Positive path. Input `.env`: `PORT`, a quoted `DATABASE_URL_MASTER` with `?schema=public`, `EMAIL_CRYPTO_KEY=<OLD>`, `JWT_SECRET`.

| Block | Result |
|---|---|
| 1 | verify OLD -> fail (exit 3); verify NEW -> ok (exit 0); env vars removed |
| 2 | `$newKey` re-read from PENDIENTE, validated, temp + `Replace(..., [NullString]::Value)`; `Remove-Variable newKey` |
| 3 | Key re-read from `.env` on disk and validated; `--verificar` -> exit 0; env vars removed |

- Resulting `.env`: `EMAIL_CRYPTO_KEY=<NEW>`, and the other 3 lines are intact and in order.
- No `.env.rotacion-tmp` is left behind.
- No `ROTACION_VERIFICAR_KEY`, `DATABASE_URL_MASTER` or `$newKey` survives the session.

Negative paths:
- (a) PENDIENTE with a corrupted `NEW_KEY`: block 2 throws "NEW_KEY ilegible en el PENDIENTE: no seguir", and `.env` is unchanged (still OLD).
- (b) `.env` with an empty `EMAIL_CRYPTO_KEY=` (the C-R1 failure mode): block 3 throws "EMAIL_CRYPTO_KEY invalida en .env: no borrar el PENDIENTE".
- (c) `.env` still on OLD: block 3's `--verificar` returns `$LASTEXITCODE=3`. The block does not throw; the gate is the prose "Si este bloque no termina en exit 0, no seguir" (see S-I).

### Prior findings: status

| ID | Status | Evidence |
|----|--------|----------|
| C1, C2, C-N1, W-A, W-B | Resolved (code unchanged since `f2ab92d`) | Same tests GREEN, 53/53 |
| **C-R1** runbook recovery blanked the key | **Resolved** | Block 2 reads `NEW_KEY` from PENDIENTE into `$newKey` and validates 64 hex. Mandatory block 3 re-reads and verifies `.env` before PENDIENTE is touched. Reproduced end to end above |
| S-B `node` from PATH | Resolved | Every runbook invocation now uses `C:\nodejs24\node.exe` |
| S-H continue only when NEW verifies | Resolved | "y **solo** si ese `--verificar` devolvio exit 0" |
| S-F exit 3 with `.env` already on NEW | Documented | "Si `.env` ya tenia `NEW_KEY` ... el bloque lo deja igual". The regex replaces NEW with NEW, so the result is idempotent |
| W3 | Accepted deviation (declared) | Unchanged |

### §5 regression check

**Exit table** (`DEPLOY-VPS-runbook.md:342-346`): unchanged since `f2ab92d`, and it still matches the script:

| Exit | Script location | Runbook meaning |
|---|---|---|
| 0 | `:297` | Rotation confirmed |
| 1 | Guarded paths restart services | No changes, services up |
| 3 | `:250`, step 7-8 catch | Database on NEW, `.env` not updated |
| 4 | `:215` | Ambiguous, services stopped |
| 5 | `:291`, step-9 catch | Rotation confirmed, final cleanup incomplete |

**Rest of §5**: unchanged.
- Usage with `-File`.
- "Que hace, en orden".
- Block 1, except for the `node.exe` path.
- The exit-5 guidance.
- Retention with the `icacls` SIDs.
- No key is typed or pasted in any block, and every key is read from a file.

`README.md:155` and the `README.md:385` pwsh note are still accurate.

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1 | Invalid length rejected | `rotar-email-crypto-key.spec.ts`; `proceso.spec.ts > entrada invalida: exit 2` | COMPLIANT |
| R1 | OLD == NEW rejected | `rotar-email-crypto-key.spec.ts > rechaza OLD_KEY y NEW_KEY iguales` (+ case variant) | COMPLIANT |
| R2 | Mid-way interruption reverts everything | `integration.spec.ts > round-trip fallido via deps.cifrar`; `> fila indescifrable` | COMPLIANT |
| R3 | Dry-run persists nothing | `integration.spec.ts > --dry-run ... byte a byte` | COMPLIANT |
| R4 | A failing row aborts the COMMIT | `integration.spec.ts > round-trip fallido via deps.cifrar` | COMPLIANT |
| R5 | Undecryptable row aborts | `integration.spec.ts > fila indescifrable`; `proceso.spec.ts > exit 3` | COMPLIANT |
| R6 | Re-run changes nothing | `integration.spec.ts > re-corrida`; `proceso.spec.ts` | COMPLIANT |
| R7 | Mixed rows: only pending migrate | `integration.spec.ts > filas mixtas` | COMPLIANT |
| R8 | Ciphertext bound to clienteId | `integration.spec.ts > AAD ligado` | COMPLIANT |
| R9 | NULL row untouched | `integration.spec.ts > ... NULL` | COMPLIANT |
| R10 | AesGcmSecretCipher -> script | `cifrado-secreto-v1.spec.ts` | COMPLIANT |
| R10 | script -> AesGcmSecretCipher | `cifrado-secreto-v1.spec.ts` | COMPLIANT |
| R11 | All rows decrypt -> exit 0 | `integration.spec.ts`; `proceso.spec.ts` | COMPLIANT |
| R11 | One row fails -> exit != 0 | `integration.spec.ts`; `proceso.spec.ts` | COMPLIANT |
| R11 | No sensitive output | `proceso.spec.ts` (`assertSinSecretos`) | COMPLIANT |
| R12 | No key or plaintext in any output | `proceso.spec.ts`; `rotate-email-crypto-key.ps1.spec.ts > fallo forzado ... sin claves` | COMPLIANT |
| R13 | `.env` rewrite failure after COMMIT is recoverable | `rotate-email-crypto-key.ps1.spec.ts > fallo forzado en --verificar final ... exit 3` (+ `camino exitoso`). The manual completion path was reproduced by the verifier | COMPLIANT |
| R14 | `.ps1` is ASCII without BOM | `ps1-ascii.spec.ts` | COMPLIANT |

**Compliance summary**: 18/18 scenarios and 14/14 requirements compliant.

### Issues Found

**CRITICAL**: None.

**WARNING**: None.

**SUGGESTION** (non-blocking)
- **S-I.** Recovery blocks 1 and 3 rely on the operator reading `$LASTEXITCODE`. Block 3 does not throw when `--verificar` fails; see case (c) above. Adding `if ($LASTEXITCODE -ne 0) { throw '...: no seguir' }` after the `node.exe` line in block 3 would make the gate mechanical, like the two format checks.
- **S-J.** Block 2 depends on `$pendiente` from block 1. Re-declaring it at the top of block 2 would make the block safe to run in a fresh session.
- **Still open from earlier reports**: S-A (unguarded `Start-Service` inside catches), S-C (the "cerrar esa sesion" wording), S-D (amend ADR-1 in `design.md`), S-G (conditional "Se conserva PENDIENTE" message), and S1-S5 from the first report.

**Residual manual gap (declared, not a finding)**: the full `.ps1` still cannot run end to end outside Windows, because of `Start-Service`, `icacls` and `C:\soporte`. Every branch that decides the outcome now has runtime coverage through AST harnesses: the Node invocation, the `.env` rewrite and the step-9 cleanup, the last one by verifier probe. Per the design's Testing Strategy, `-File ... -DryRun` on the VPS stays the first production step.

**Not a finding**: the §2.2 row in `~/proyectos/CLAUDE.md` is a declared follow-up outside this cycle.

### Verdict

PASS

C-R1 is resolved and reproduced by running the runbook's own blocks in sequence, including three negative paths. The code is unchanged from the verified `f2ab92d`, and lint, typecheck and 53/53 script specs are green. All 14 requirements and 18 scenarios are compliant, and only non-blocking suggestions remain.
