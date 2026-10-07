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

## WU-2 — TOTP nativo, formatos y regla de obligacion (completa)

Modo: estandar. Tareas 2.1 a 2.7 marcadas en `tasks.md`. Rama `feat/verificacion-dos-pasos-wu02` (base `...-wu01`).

### Archivos (todos nuevos, sin consumidores)

- `backend/src/auth/domain/ports/totp-service.port.ts` (`ITotpService`, token `TOTP_SERVICE`).
- `backend/src/auth/infrastructure/tfa/totp-nativo.service.ts` + spec (vectores SHA-1 del RFC 6238 apendice B, ventana +-1/+-2, mal formados, base32, URI).
- `backend/src/auth/domain/tfa/{formato-codigo,tfa.constants,es-obligado-2fa}.ts` + specs de los dos primeros y de `es-obligado-2fa`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/auth/domain/tfa src/auth/infrastructure/tfa/totp-nativo.service.spec.ts`: 3 archivos, 33 tests verdes |
| Lint / tipos | `pnpm lint` y `pnpm typecheck` sin errores; ratchet de casts 617 (base 617) |
| Rollback | Archivos nuevos sin consumidores |

### Decisiones tomadas en apply

- `esObligado2fa` recibe `{ activa?, clienteRequiere2fa }[]`: `activa` ausente se asume true (el login consulta solo activas, ADR-8); `activa === false` no cuenta. WU-7 agrega `clienteRequiere2fa` a la proyeccion de membresia.
- `clasificarCodigo` devuelve `'totp' | 'recuperacion' | 'invalido'`; `normalizarCodigoRecuperacion` devuelve `null` si el largo (12) o el alfabeto Crockford no cierran.
- `verificar` recorre toda la ventana sin cortar y compara con `timingSafeEqual`.
- Constantes: `DESAFIO_DURACION_MS`, `DESAFIO_ENROLAMIENTO_DURACION_MS`, `TICKET_DURACION_MS`, `DISPOSITIVO_CONFIABLE_DURACION_MS`, `LIMITADOR_VENTANA_MS`, `LIMITADOR_MAX_INTENTOS`.

## WU-3a — Limitador de intentos (completa; WU-3 partida en 3a y 3b)

Modo: estandar. Tareas 3.1, 3.2 y 3.7 marcadas en `tasks.md`. Rama `feat/verificacion-dos-pasos-wu03` (base `...-wu02`). WU-3 completa sumaba 546 lineas de codigo y tests; el orquestador la partio por la costura que marca la tarea 3.9: el limitador y su higiene van en 3a, la IP y su aplicacion en el login van en 3b (`feat/verificacion-dos-pasos-wu03b`).

### Archivos

- `backend/src/auth/domain/ports/limitador-intentos.port.ts` (`ILimitadorIntentos`, `ReservaIntento`).
- `backend/src/auth/infrastructure/tfa/prisma-limitador-intentos.ts` + spec de integracion (reserva atomica, `liberar` en exito, `devolver` acotado por `ventana_inicio`, purga horaria con reloj inyectable). Sin consumidores hasta 3b.
- `backend/test/barrido-huerfanas.global-setup.mjs`: `TRUNCATE auth_intentos_fallidos` una vez por corrida, bajo el lock de master.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/auth/infrastructure/tfa/prisma-limitador-intentos.integration.spec.ts`: 7 tests verdes |
| Lint / tipos | `pnpm lint` y `pnpm typecheck` sin errores |
| Suite completa | Corrida sobre WU-3 entera (3a+3b): 634 archivos, 7779 tests verdes |
| Rollback | Archivos nuevos sin consumidores; el truncate del setup es inocuo sin la tabla en uso |

### Decisiones tomadas en apply

- `devolver` compara `date_trunc('milliseconds', ventana_inicio)`: `timestamptz` guarda microsegundos y un `Date` de JS solo milisegundos.
- El adaptador recibe un reloj inyectable como segundo argumento (para testear la purga horaria); en 3b se registra con `useFactory`.

## WU-3b — IP del navegador y limite en el login (completa)

Modo: estandar. Tareas 3.3 a 3.6, 3.8 y 3.9 marcadas en `tasks.md`. Rama `feat/verificacion-dos-pasos-wu03b` (base `...-wu03`).

### Archivos

- `backend/src/auth/interface/ip-del-navegador.ts` + spec: honra `x-soporte-ip-navegador` solo desde un par loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) y solo si `isIP` lo acepta; si no, el socket sin `::ffff:`; si no, `sin-ip`. La forma con puerto no es IP valida (el BFF la recorta en WU-10).
- `LoginUseCase`: reserva antes de buscar el usuario con clave `pwd:{sha256(email normalizado)}:{ip}`; bloqueado corre el verify contra `DUMMY_HASH` y devuelve `CredencialesInvalidasError`; `liberar` solo con la contrasena correcta.
- `AuthController.login` pasa la IP; `auth.module.ts` registra el adaptador con `useFactory`.
- Specs: unit del caso de uso y del controller, e2e `limite-intentos.e2e.spec.ts` (bloqueado igual a invalido, el bloqueo sobrevive a reconstruir el modulo); `prisma-auth.integration.spec.ts` pasa el adaptador real.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/auth`: 64 archivos, 834 tests verdes |
| Suite completa | Sobre WU-3 entera: 634 archivos, 7779 tests verdes |
| Lint / tipos | `pnpm lint` y `pnpm typecheck` sin errores; ratchet de casts sin cambios |
| Rollback | Revertir este commit deja el limitador sin consumidores (WU-3a) |

### Decisiones tomadas en apply

- El "quinto fallo bloquea" de 3.5 lo prueba el e2e; el unit usa el limitador mockeado.
