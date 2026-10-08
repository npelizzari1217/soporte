# Archive Report: Verificación en dos pasos (2FA)

**Change**: `verificacion-dos-pasos`  
**Cycle Issue**: #436  
**Archived at**: 2026-10-08  
**Deployed to production**: 2026-10-07 at commit 20b320a4

## Executive Summary

Verificación en dos pasos (2FA) with TOTP, trusted devices, client policies, and 2FA reset is complete, verified, and deployed. All 13 work units (WU-1 through WU-13) were delivered in 35 chained PRs (#437–#471) plus remediation #473. Verification passed with 61/61 requirements and 124/124 scenarios. Backend and frontend test suites both pass at full coverage. The feature is operational in production with ROOT enrollment forced.

## Delivery Summary

| Metric | Value |
|--------|-------|
| Work units | 13 (WU-1 through WU-13) |
| Chained PRs | 35 (#437–#471) + remediation #473 |
| Integration PR | #472 (tracker branch to main at 20b320a4) |
| Production deployment | 2026-10-07 20:07 UTC, predeploy dump `backups\utc-backfill-20261007-184122` |
| Master migration | 20261008120000_verificacion_dos_pasos |
| Roadmap point | Stage 2, Point 5: delivered and marked Cumplida (PR #477) |

## Final State Authority

**Verification Report**: pass 2 PASS WITH WARNINGS (per launch prompt final-state facts)  
- Verification pass 1: FAIL (C1 uncovered T4 scenario; W1 24 `as unknown as` casts added)
- Remediation: commit d3812808 (T4 test mutation RED/GREEN; casts replaced by typed mocks)
- Verification pass 2: PASS, 61/61 requirements, 124/124 scenarios, 0 CRITICAL issues

**Test Coverage**:
- Backend: 7955 tests, pass 2 (per final-state facts)
- Frontend: 2064 tests, all pass
- Script specs (rotación, reseteo): included and pass

**Work Unit Completion**: All 13 WU tasks marked [x] complete in `tasks.md` per Task Completion Gate.

**Known Warnings**:
- W1: 24 `as unknown as` casts in mock setups (frontend login state machine and 2FA challenge flow); addressed by typed MSW fixture replacement in remediation
- W2: `ROOT_ADMIN_TOTP_SECRET` environment variable documented in `.env.example` requires file permission (resolved outside SDD cycle per final-state facts, PR #475, issue #474)

## Specs Synced to Main

### New Capabilities (6 created in `openspec/specs/`)

| Capability | Location |
|------------|----------|
| `auth-2fa-totp` | `openspec/specs/auth-2fa-totp/spec.md` |
| `auth-2fa-login` | `openspec/specs/auth-2fa-login/spec.md` |
| `auth-2fa-dispositivo-confiable` | `openspec/specs/auth-2fa-dispositivo-confiable/spec.md` |
| `auth-limite-intentos` | `openspec/specs/auth-limite-intentos/spec.md` |
| `auth-2fa-politica-cliente` | `openspec/specs/auth-2fa-politica-cliente/spec.md` |
| `auth-2fa-reseteo` | `openspec/specs/auth-2fa-reseteo/spec.md` |

### Modified Capabilities (3 merged via `sdd-archive-compose`)

#### `usuarios-reset-password` (requirements merged)
- Un admin del tenant resetea la contraseña de un miembro activo
- El aislamiento de tenant nunca filtra existencia
- Un actor sin rol de administración es rechazado
- Sin restricciones adicionales de administrador a administrador
- El campo de contraseña vacío no modifica la contraseña
- La contraseña nueva respeta el largo mínimo de alta
- Las sesiones del destino se revocan tras un reset exitoso
- Un fallo de revocación no hace fallar la respuesta
- No se establece contraseña sobre una cuenta global no disponible
- El plaintext nunca se expone
- **U1** El reset invalida los dispositivos confiables del destino y falla cerrado *(ADDED)*
- **U2** El reset de contraseña no desactiva el 2FA del destino *(ADDED)*

#### `auth-reseteo-por-olvido` (requirements merged)
- La solicitud de reset devuelve una respuesta uniforme
- La solicitud no filtra información por tiempo de respuesta
- El token es opaco y solo su hash se persiste
- Emitir un token nuevo revoca los vigentes del usuario
- Confirmar cambia la contraseña como máximo una vez bajo concurrencia
- Confirmar con un token inválido responde igual sin importar la causa
- La contraseña nueva respeta el mínimo de alta y usa el hasher del login
- Las sesiones se revocan tras un reset exitoso sin condicionar la respuesta
- Una cuenta no disponible no cambia su contraseña al confirmar
- Un reset exitoso dispara un mail de confirmación
- El link de reset se construye solo desde APP_BASE_URL
- Ningún log contiene el plaintext ni el token crudo
- Ambas rutas aplican rate limiting propio
- El frontend ofrece el flujo completo de self-service
- La Ayuda deja de decir que no existe la opción de recuperar contraseña
- **O1** Confirmar el reset invalida los dispositivos confiables y falla cerrado *(ADDED)*
- **O2** El reset por mail no desactiva el 2FA *(ADDED)*

#### `email-crypto-key-rotacion` (requirements merged)
- Validación de las claves de entrada
- Transacción única para toda la rotación
- Modo `--dry-run` no escribe nada
- Verificación round-trip antes del COMMIT
- Fallo duro ante clave desconocida o payload corrupto
- Re-corrida explícita sobre filas ya migradas
- Una corrida puede procesar una mezcla de filas OLD/NEW
- El AAD por cliente se preserva en el re-cifrado
- Filas sin configuración SMTP quedan intactas
- Compatibilidad de cifrado cruzado con `AesGcmSecretCipher`
- Modo `--verificar` de solo lectura confirma qué clave está vigente
- Ningún secreto se expone en ninguna salida
- La reescritura de `.env` ocurre después del COMMIT confirmado
- El script operativo es ASCII puro sin BOM
- **K1** La rotación preserva todos los secretos TOTP *(ADDED)*
- **K2** Atomicidad y fallo duro también para los secretos TOTP *(ADDED)*
- **K3** `--verificar` cubre los secretos TOTP *(ADDED)*
- **K4** Un secreto que no descifra nunca produce un 500 en el login *(ADDED)*

## Archive Contents Verified

- [x] `proposal.md` — scope, approach, rollback plan
- [x] `specs/` — 9 total (6 new + 3 modified)
- [x] `design.md` — architectural decisions and safety contracts
- [x] `tasks.md` — 13 WU with 100+ tasks, all [x] complete
- [x] `apply-progress.md` — WU completion and PR history
- [x] `verify-report.md` — pass 2 PASS WITH WARNINGS, 61/61 requirements

Archived to: `openspec/changes/archive/2026-10-08-verificacion-dos-pasos/`

## Implementation Artifacts

**Backend modules** (NestJS hexagonal architecture):
- `src/auth/domain/tfa/` — domain logic (TOTP, formats, obligation rules)
- `src/auth/domain/ports/` — repository and service ports
- `src/auth/application/tfa/` — use cases and application services
- `src/auth/infrastructure/tfa/` — Prisma repositories and native services
- `src/auth/interface/` — HTTP controllers and DTOs
- Master migration: `backend/prisma_master/migrations/20261008120000_verificacion_dos_pasos/` (5 tables + rollback.sql)

**Frontend components** (React + Zod):
- `src/features/auth/components/` — `DesafioTfaForm`, `EnrolamientoTfa`, `CodigosRecuperacion`, `ConfigurarTfaDialog`
- `src/features/auth/hooks/` — `use-login` state machine refactor
- `src/features/usuarios/` — `PoliticaTfaCard`, reset button in edit dialog
- `src/app/api/` — BFF routes: login, 2fa/verificar, login/continuar, login/seleccionar
- Trusted device cookie: `__Host-td` (30 days, httpOnly, sameSite=lax)

**Scripts**:
- `backend/scripts/resetear-2fa-root.ts` — ROOT 2FA reset with forced enrollment
- `backend/scripts/rotar-email-crypto-key.mjs` — generalized for TOTP secret re-encryption with AAD
- `backend/test/barrido-huerfanas.global-setup.mjs` — cleanup of orphaned tenant databases

**Documentation**:
- Runbook updates: `DEPLOY-VPS-runbook.md` §5 (rotación + TOTP), new section for reset script, IP verification post-deploy, EMAIL_CRYPTO_KEY pre-deploy check
- `.env.example` documentation: `ROOT_ADMIN_TOTP_SECRET` for dev/test (W2 pre-deployment configuration)

## Deployment Notes

- **Single deployment unit**: the entire chain (WU-1 through WU-13 merged at 20b320a4) was deployed 2026-10-07. Partial deployment would leave ROOT unable to login (backend requires challenge, old frontend absent).
- **Master migration**: `20261008120000_verificacion_dos_pasos` creates 5 tables with enforced constraints, includes rollback.sql for full revert.
- **Post-deployment**: predeploy dump confirmed (`backups\utc-backfill-20261007-184122`), ROOT forced enrollment activated, IP limiter registers browser IP correctly (port stripped), no error log lines.
- **Roadmap closing**: PR #477 marks stage-2 point-5 Entregado with decision Cumplida (two precisions: ROOT→ROOT reset via API/script only, soft-deleted memberships count toward ADMINISTRADOR reset authority); `check-roadmap-fresco` passes.

## Open Suggestions (documented, not blocked)

The following improvements were identified but are explicitly out of scope:
- **S1**: Ticket lasts 5 min after forced enrollment (slow "Los guardé" response, UX improvement, low impact)
- **S2**: Accepted residuals (device row after rotation, log-and-swallow on revocation failure, rare races, client-side expiry heuristics)
- **S3**: Stale WU comments in PRs
- **S5**: Differently-cased `/api/Auth/Login` routes reach the generic proxy

**Ayuda (KB) debt**: writing suspended; debit notes added to commits for WU-5c, WU-11a, WU-11b, WU-12, WU-13 (every 2FA screen requires documentation when writing resumes).

## Traceability

- **Cycle issue**: #436
- **Proposal**: `openspec/changes/archive/2026-10-08-verificacion-dos-pasos/proposal.md`
- **Spec**: `openspec/specs/auth-2fa-{totp,login,dispositivo-confiable,politica-cliente,reseteo}/spec.md` + modified `usuarios-reset-password`, `auth-reseteo-por-olvido`, `email-crypto-key-rotacion`
- **Design**: `openspec/changes/archive/2026-10-08-verificacion-dos-pasos/design.md`
- **Tasks**: `openspec/changes/archive/2026-10-08-verificacion-dos-pasos/tasks.md`
- **Apply progress**: `openspec/changes/archive/2026-10-08-verificacion-dos-pasos/apply-progress.md` (35 chained PRs + remediation)
- **Verify report**: pass 2 PASS WITH WARNINGS (per launch prompt, W1 and W2 resolved)
- **Archive date**: 2026-10-08

## Verification Commands

To verify this archive and the final state:

```bash
# Check archive structure
ls -R openspec/changes/archive/2026-10-08-verificacion-dos-pasos/

# Verify spec merge completeness
for spec in usuarios-reset-password auth-reseteo-por-olvido email-crypto-key-rotacion; do
  echo "=== $spec ===" && grep "^### Requirement:" openspec/specs/$spec/spec.md | wc -l
done

# View merged requirement headings
grep "^### Requirement:" openspec/specs/usuarios-reset-password/spec.md | head -3

# Check status
gentle-ai sdd-status verificacion-dos-pasos
```

---

**Archived**: 2026-10-08  
**Ready for next cycle**: no follow-up work needed
