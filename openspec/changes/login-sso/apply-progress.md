# Apply progress: login-sso

## Unidad 1 (WU-1a) - lotes 1 y 2 (ramas `feat/login-sso-wu01a` y `feat/login-sso-wu01a2`)

Partida por la contingencia de tasks.md (el diff real de la WU superaba el tope duro de 380 lineas):
- `feat/login-sso-wu01a` (base `feat/login-sso`): tareas 1.1 a 1.7.
- `feat/login-sso-wu01a2` (base `feat/login-sso-wu01a`): tareas 1.8 a 1.11 (repositorio de estados, su integracion y las mutaciones).

Modo: estandar (feature, sin TDD estricto).

### Tareas

- [x] 1.1 a 1.4 spike `jose` (gate PASADO)
- [x] 1.5 migracion M1 y rollback
- [x] 1.6 esquema Prisma y cliente
- [x] 1.7 `PROVEEDORES_SSO` y puerto `ISsoEstadoRepository`
- [x] 1.8 a 1.9 repositorio de estados e integracion (rama `wu01a2`)
- [x] 1.10 mutaciones (rama `wu01a2`)
- [x] 1.11 verificacion (rama `wu01a2`)

### Resultado del gate del spike (1.4), Node v24.20.0

| Criterio | Resultado |
|---|---|
| 1. `pnpm typecheck` sin shim | 0 errores. No hizo falta `src/types/jose.d.ts` |
| 2. `pnpm build` + `node -e "require('./dist/auth/infrastructure/sso/jose-humo.js').humo().then(console.log)"` | build exit 0; imprime `ok`; sin `ERR_REQUIRE_ESM`, sin `ERR_REQUIRE_ASYNC_MODULE` y sin `ExperimentalWarning` |
| 3. `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts` | 1 test en verde |
| 4. `pnpm lint` | exit 0, 0 errores |
| 5. `pnpm start` | arranca (`Nest application successfully started`) con `DATABASE_URL_MASTER` de test, `JWT_SECRET` y `APP_BASE_URL` por entorno; se repite en 9.5 con `AuthModule` importando el adaptador |

Solo se probo Node 24 (el de esta maquina). El VPS usa Node 22.12 o superior segun el diseno: se confirma en el runbook (WU-9).

### Notas

- `pnpm add jose@^6.2.8` resolvio `jose 6.2.12`; `package.json` quedo con `^6.2.12` (cumple el mayor del diseno).
- Migracion `20261010120000_login_sso` aplicada a `soporte_master_test` con `prisma migrate deploy`; `rollback.sql` ejecutado una vez y la migracion reaplicada. Las tablas deben quedar con duenio `soporte` (el rol de los tests): la reaplicacion se hizo con ese rol, no con `$POSTGRES_USER`, porque si no el repositorio falla con `permission denied`.
- La URL de la base de test sale del default de `src/testing/lock-master-test.ts` (`URL_MASTER_TEST_POR_DEFECTO`); no se leyo ni se creo ningun `.env`.
- El puerto recibe los hashes ya calculados (el caso de uso de la WU-4a los calcula con `pkce.sha256`).

### Work Unit Evidence (lote 1)

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts`: 1 passed |
| Harness de runtime | criterios 2 y 5 del spike (arriba) |
| Frontera de rollback | `git revert` del commit; `rollback.sql` de M1; sin consumidores |

### Lote 2 (rama `feat/login-sso-wu01a2`)

Mutaciones (1.10), cada una revertida:
- Quitar `usado_at IS NULL` del CAS: en rojo "consumir devuelve ... una sola vez" y "dos consumos concurrentes".
- Quitar `navegador_hash` del CAS: en rojo "navegador ajeno devuelve null y la fila sigue consumible".

Verificacion (1.11), desde `backend/`: `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts src/auth/infrastructure/sso/prisma-sso-estado.repository.integration.spec.ts` 2 archivos, 12 tests en verde. Raiz: `node scripts/check-casts-en-specs.mjs` 617 en 114 archivos (base 617), sin subir. Migracion M1 aplicada a `soporte_master_test`, rollback ejecutado una vez y reaplicada (`prisma migrate status`: al dia).

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts src/auth/infrastructure/sso/prisma-sso-estado.repository.integration.spec.ts`: 12 passed |
| Harness de runtime | integracion sobre `soporte_master_test` (CAS, concurrencia, purga) |
| Frontera de rollback | `prisma-sso-estado.repository.ts` y su spec; sin consumidores |
