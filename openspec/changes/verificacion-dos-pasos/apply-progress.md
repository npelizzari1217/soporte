# Apply progress: verificacion-dos-pasos

## WU-1 — Migracion M1 y schema (completa)

Modo: estandar (sin TDD estricto). Tareas 1.1 a 1.4 marcadas en `tasks.md`. Rama `feat/verificacion-dos-pasos-wu01`, base el tracker `feat/verificacion-dos-pasos`.

### Archivos

- Migracion M1 `backend/prisma_master/migrations/20261008120000_verificacion_dos_pasos/` (`migration.sql` con las 5 tablas, CHECKs, indices, FK `ON DELETE CASCADE` y `clientes.requiere_2fa`; `rollback.sql`).
- `backend/prisma_master/schema.prisma`: modelos `UsuarioTfa`, `TfaCodigoRecuperacion`, `TfaDispositivoConfiable`, `AuthDesafio`, `AuthIntentoFallido`, relaciones en `Usuario` y `Cliente.requiere2fa`.
- `cliente.mapper.ts`: `requiere2fa` entra en el `Omit` de `toPersistence` (queda fuera del upsert, ADR-3); `cliente.mapper.spec.ts`: fila fake con el campo nuevo.
- Test: `backend/src/auth/infrastructure/tfa/migracion-m1.integration.spec.ts` (7 casos).

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/auth/infrastructure/tfa`: 1 archivo, 7 tests verdes |
| Runtime harness | Integracion sobre `soporte_master_test`: CHECKs de par nulo y de `proposito`, defaults DDL/Prisma, cascada en las 4 tablas con FK, `auth_intentos_fallidos` sin FK |
| Rollback | `rollback.sql` de M1; sin consumidores |
| Lint / tipos | `pnpm lint` y `pnpm typecheck` sin errores; ratchet de casts 617 (base 617) |

### Decisiones tomadas en apply

- M1 aplicada con `migrate deploy` solo a `soporte_master_test` (`DATABASE_URL_MASTER` apuntada a esa base); la base de desarrollo no se toco.
- El spec no trunca: crea usuarios/clientes con sufijo aleatorio y borra solo lo suyo; toma `usarLockMasterTest()` por la convivencia con specs que truncan `usuarios`/`clientes`.
- No se afirma "ningun cliente tiene requiere_2fa = true": seria fragil cuando WU-7 escriba la politica en specs; se verifica `NOT NULL DEFAULT false` en el DDL y el default de Prisma en una fila nueva.
- `rollback.sql` usa `DROP ... IF EXISTS`; el `DROP TABLE` de las tablas con FK no necesita orden especial (FK salen del lado hijo).

### Deuda

- M1 no se despliega sin la cadena completa de WU.
