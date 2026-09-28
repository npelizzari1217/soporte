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

## Remaining

WU-2 a WU-11 pendientes — ver `tasks.md`.
