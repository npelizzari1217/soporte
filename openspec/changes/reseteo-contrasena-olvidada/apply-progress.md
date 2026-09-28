# Apply Progress: Reseteo de contraseña por olvido (self-service)

Mode: Standard (TDD disabled — feature).

## WU-1 — Modelo, migración y entidad — COMPLETO (1.1–1.4)

Files: migración `20260928120000_add_password_reset_tokens`, `schema.prisma` (modelo
`PasswordResetToken` + back-relations), `password-reset-token.entity.ts` + `.spec.ts`.

Deviations: none — sigue ADR-6. `usuario_id` FK usa `ON DELETE CASCADE` (deliberado, diverge de
`refresh_tokens`/`RESTRICT`, tal como fija el design).

Evidence: focused test `pnpm vitest run backend/src/auth/domain/entities/password-reset-token.entity.spec.ts`
→ 14/14 passed. Runtime harness: N/A (sin tabla poblada, sin ruta expuesta). Rollback: revert del
commit; migración aditiva queda huérfana, sin filas.

Verification: `pnpm lint` OK · `pnpm typecheck` OK · `pnpm test` → 465 archivos / 5431 tests OK.
Migración aplicada a `soporte_master` y `soporte_master_test`; cliente Prisma regenerado.

Status: 4/4 tareas completas. Ready for WU-2.

## WU-2 — Puerto, mapper y repo Prisma — COMPLETO (2.1–2.4)

Files: `i-password-reset-token.repository.ts` (create), `password-reset-token.mapper.ts` (create),
`prisma-password-reset-token.repository.ts` + `.integration.spec.ts` (create). Molde:
`prisma-encuesta-token.repository.ts` / `.mapper.ts` (CSAT).

Deviations: none — sigue ADR-5/ADR-6. El puerto no tiene `liberarUso` (a diferencia de
`IEncuestaTokenRepository`): no hay INSERT en el tenant que compensar, `save()` del usuario ya es
el punto de no retorno (ADR-5).

Evidence: focused test
`pnpm vitest run backend/src/auth/infrastructure/persistence/prisma/prisma-password-reset-token.repository.integration.spec.ts`
→ 11/11 passed, incluye el CAS concurrente (`Promise.all` de dos `consumirSiVigente` da
exactamente un `true`) y el CAS sobre token revocado/vencido (`false`). Runtime harness:
`usarLockMasterTest()` contra `soporte_master_test` real (Postgres, no mocks). Rollback: revert
del commit; repo sin consumidores, WU-1 intacto.

Verification: `pnpm lint` OK · `pnpm typecheck` OK · `pnpm test` → 466 archivos / 5442 tests OK.

**`size:exception`** (criterio del dueño, 2026-09-28): 444 líneas cambiadas. Partir habría
mandado a `main` el CAS sin sus tests de abuso (revocado, vencido, concurrencia).

Status: 4/4 tareas implementadas, verificadas y commiteadas.
