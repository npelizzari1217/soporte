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

## WU-4a — Repositorio de 2FA con CAS (completa)

Modo: estandar. Tareas 4a.1 a 4a.6 marcadas en `tasks.md`. Rama `feat/verificacion-dos-pasos-wu04a` (base `...-wu03b`).

### Archivos

- `backend/src/auth/domain/ports/tfa-repository.port.ts`: `ITfaRepository`, `EstadoTfa`, token `TFA_REPOSITORY`.
- `backend/src/auth/infrastructure/tfa/prisma-tfa.repository.ts`: `registrarPaso` y `promoverPendiente` como un solo `UPDATE` condicional (SQL del ADR-2); `consumirCodigo` con `updateMany ... usadoAt: null`; `reemplazarCodigos` y `eliminarTodo` en `$transaction`.
- `auth.module.ts`: registra `TFA_REPOSITORY` (sin consumidores hasta 4b).
- `prisma-tfa.repository.integration.spec.ts`: 13 tests contra Postgres real, sin truncar (usuarios con sufijo aleatorio, borrado por cascada).

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/auth/infrastructure/tfa`: 4 archivos, 43 tests verdes |
| Mutacion | `ultimo_paso <` a `<=` en `registrarPaso`: 4 tests en rojo; restaurado |
| Lint / tipos / casts | `pnpm lint`, `pnpm typecheck` sin errores; ratchet de casts sin cambios (617) |
| Rollback | Puerto y adaptador sin consumidores; revertir el commit no deja huerfanos |

### Decisiones tomadas en apply

- Se agrego `obtenerCodigosDisponibles(usuarioId)` al puerto (no estaba en la lista de 4a.5): los codigos van hasheados con argon2id, asi que el verificador necesita los hashes para comparar con `IHashProvider.verify` y luego consumir por `id`. El repositorio no hashea; recibe y devuelve hashes.
- `consumirCodigo` recibe el `id` del codigo, no el texto.
- El fallo forzado de `reemplazarCodigos` usa un NUL en el hash (Postgres lo rechaza en `text`); el de `eliminarTodo` usa un trigger temporal acotado al usuario del test, que se elimina en `finally`.

## WU-4b — Verificador comun y confirmador de pendiente (partida: 4b-i confirmador y cifrado, 4b-ii verificador)

Modo: estandar. Tareas 4b.1 a 4b.8 marcadas en `tasks.md`. Rama `feat/verificacion-dos-pasos-wu04b` (base `...-wu04a`).

### Archivos

- `backend/src/auth/domain/errors/tfa.errors.ts`: `SegundoPasoRechazadoError` (401, generico) y `SecretoTotpIndescifrableError`.
- `backend/src/auth/domain/tfa/tfa.constants.ts`: `claveLimiteCodigo(usuarioId)` = `cod:{usuarioId}`, compartida por verificador y confirmador (I6).
- `backend/src/auth/application/tfa/secreto-totp-cifrado.ts`: `cifrar`/`descifrar` con AAD `tfa:{usuarioId}`; el fallo es `Result.fail`.
- `backend/src/auth/application/tfa/verificador-codigo-tfa.ts`: TOTP activo (con `registrarPaso`) o recuperacion (`IHashProvider.verify` + `consumirCodigo`); reserva primero; exito `liberar`; indescifrable `devolver` y log `TFA_SECRETO_INDESCIFRABLE | usuarioId=…`.
- `backend/src/auth/application/tfa/confirmador-secreto-pendiente.ts`: solo TOTP del pendiente, `promoverPendiente` con el paso confirmado.
- Specs: unit de los tres, mas `verificador-codigo-tfa.integration.spec.ts` (limitador real, 3 fallos + indescifrable = 3).

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/auth/application/tfa`: 4 archivos, 26 tests verdes |
| Mutacion | `devolver` a `liberar` en el verificador: 3 tests en rojo (incluido el de integracion); restaurado |
| Lint / tipos / casts | `pnpm lint`, `pnpm typecheck` sin errores; ratchet de casts sin cambios (617) |
| Rollback | Servicios sin rutas ni consumidores; revertir el commit no deja huerfanos |

### Decisiones tomadas en apply

- Un codigo de formato invalido cuenta como fallo (la reserva queda) y no consulta el repositorio.
- Los providers de Nest no se registran en `auth.module.ts` hasta 4c, que es el primer consumidor.
- El confirmador tambien devuelve la reserva si el pendiente no descifra.

### WU-4b — reparto final

- **4b-i** (`feat/verificacion-dos-pasos-wu04b`, tareas 4b.1, 4b.2, 4b.6, 4b.7): `SecretoTotpCifrado`, errores de dominio, `claveLimiteCodigo`, `resultado-segundo-paso.ts` (tipo comun, extraido para que cada mitad compile sola) y `ConfirmadorSecretoPendiente`.
- **4b-ii** (`feat/verificacion-dos-pasos-wu04b2`, tareas 4b.3, 4b.4, 4b.5, 4b.8): `VerificadorCodigoTfa` con su unit y su integracion con el limitador real. `pnpm vitest run src/auth/application/tfa`: 4 archivos, 26 tests verdes; typecheck, lint y ratchet de casts limpios.
- WU-4b completa sumaba ~596 lineas de codigo y tests; el orquestador la partio por la costura que propuso el ejecutor.

## WU-4c — Autogestion de 2FA (partida: 4c-i casos de uso, 4c-ii HTTP y cableado)

WU-4c entera sumaba ~650 lineas de codigo y tests; el orquestador la partio por la costura que propuso el ejecutor.

### 4c-i (`feat/verificacion-dos-pasos-wu04c`, tareas 4c.1 y 4c.2; 4c.3 solo casos de uso)

- `backend/src/auth/application/tfa/codigos-recuperacion.ts`: genera 10 codigos Crockford, los hashea y reemplaza el set anterior.
- `backend/src/auth/application/tfa/tfa-cuenta.use-cases.ts`: `ObtenerEstadoTfa`, `IniciarSecretoTfa`, `ConfirmarSecretoTfa`, `RegenerarCodigosTfa` + spec unit (T3, T4, T9, T10, T11 y el 503 sin clave maestra).
- `TfaNoDisponibleError` en `tfa.errors.ts`.
- Sin cableado en `auth.module.ts` (llega con el primer consumidor HTTP en 4c-ii).
- `obligado` usa por ahora solo ROOT: la regla del cliente que exige 2FA llega con la politica en WU-7 (`TODO(WU-7)`).
- `IniciarSecretoTfa` con 2FA activo y sin codigo llama al verificador con cadena vacia: cuenta como fallo del limitador, a proposito.
- Evidencia: `pnpm vitest run src/auth/application/tfa` 33 tests verdes; typecheck y lint limpios. Suite completa sobre WU-4c entera: 641 archivos, 7828 tests verdes.

### 4c-ii (`feat/verificacion-dos-pasos-wu04c2`, tareas 4c.3 DTOs, 4c.4, 4c.5, 4c.6)

- `TfaCuentaController` (`GET /auth/2fa`, `POST /auth/2fa/secreto/iniciar|confirmar`, `POST /auth/2fa/codigos`) bajo `JwtAuthGuard`; errores de codigo en 422 y falta de clave maestra en 503. DTOs en `interface/dtos/tfa-cuenta.dto.ts` (el directorio real es `dtos/`, no `dto/` como decia la tarea).
- e2e `tfa-cuenta.e2e.spec.ts` con guards reales; cableado en `auth.module.ts` (TOTP, cifrado, verificador, confirmador, los 4 casos de uso y el controller).
- Correccion del validador: `ConfirmarSecretoTfa` genera y hashea los codigos ANTES de promover el secreto (`prepararJuegoCodigos`), asi una falla del hash no deja el 2FA activo sin codigos. Queda solo el error de base entre las dos escrituras; el usuario regenera con un TOTP.
- Evidencia: `pnpm vitest run src/auth/application/tfa` + e2e: 6 archivos, 37 tests verdes; typecheck, lint y ratchet de casts limpios.

## WU-5a — Desafios, EmitirSesion, verificar y enrolamiento (partida: 5a repo, 5a2 sesion y casos de uso)

WU-5a entera sumaba ~640 lineas de codigo y tests. El orquestador la partio en dos, cada mitad bajo 400 y compilando sola: el repo de desafios no depende del resto, y el resto importa solo su puerto.

### 5a (`feat/verificacion-dos-pasos-wu05a`, tareas 5a.3 y 5a.4)

- `backend/src/auth/domain/ports/desafio-login-repository.port.ts` (`PropositoDesafio`, `DesafioVigente`): `crear`, `buscarSinVerificar(token, proposito)` (cubre VERIFICAR y ENROLAR), `verificar` (CAS que rota el token a ticket) y `consumir` (CAS de uso unico).
- `backend/src/auth/infrastructure/tfa/prisma-desafio-login.repository.ts` con reloj inyectable (el vencimiento se compara con el reloj de la aplicacion, no con `now()` de la base) + spec de integracion contra Postgres real: 7 tests.
- Sin cableado hasta 5a2.

### 5a2 (`feat/verificacion-dos-pasos-wu05a2`, tareas 5a.1, 5a.2, 5a.5 a 5a.8)

- `backend/src/auth/application/emitir-sesion.service.ts`: pasos 5-6 de `LoginUseCase` extraidos sin cambio de conducta (scope, JWT, refresh, respuesta `tokens`); `LoginUseCase` lo construye adentro y conserva su firma. Su no regresion la cubre el spec de login sin cambios.
- `backend/src/auth/application/tfa/desafio-login.use-cases.ts` + spec: `VerificarDesafioUseCase` (busca el desafio antes de reservar en el limitador; TOTP o recuperacion; rota a ticket; no emite sesion), `IniciarEnrolamientoLoginUseCase` y `ConfirmarEnrolamientoLoginUseCase` (solo desafios ENROLAR; reusan `IniciarSecretoTfa` y `ConfirmarSecretoTfa`; confirmar devuelve los 10 codigos y rota a ticket).
- `auth.module.ts`: repo de desafios con `useFactory` (reloj) y los 3 casos de uso.
- La sesion se emite solo en `continuar` (WU-5b): el "guarde los codigos" es la UI mas ese paso diferido.
- Carreras raras aceptadas: si el desafio vence entre confirmar y rotar, el 2FA queda activo sin que el usuario vea los codigos (los regenera con un TOTP); si la rotacion falla en verificar, un codigo de recuperacion queda gastado.
- Evidencia: suite completa 643 archivos, 7845 tests verdes; typecheck, lint y ratchet de casts limpios.

## WU-5b — Continuar, seleccionar y rutas publicas (partida: 5b casos de uso, 5b2 HTTP y cableado)

WU-5b entera sumaba ~640 lineas de codigo y tests; el orquestador la partio por la costura que propuso el ejecutor.

### 5b (`feat/verificacion-dos-pasos-wu05b`, tareas 5b.1, 5b.2 y la primera mitad de 5b.4)

- `buscarTicket(ticket)` en el puerto y el adaptador de desafios: lectura de un ticket verificado, sin usar y vigente (`buscarSinVerificar` excluye los verificados). Con su test de integracion.
- `backend/src/auth/application/tfa/continuar-login.use-cases.ts` + spec: `ContinuarLoginUseCase` es el unico lugar del flujo de 2FA que emite sesion; ROOT sale con alcance MASTER, una membresia emite, mas de una devuelve la lista y el MISMO ticket sin consumirlo. `SeleccionarClienteLoginUseCase` valida la membresia antes de consumir (si no existe, mismo rechazo y el ticket sigue vigente). Ninguno pide contrasena ni codigo.
- Consume antes de emitir: si `emitir` falla, el ticket queda gastado y el usuario vuelve a loguear (se prefiere a arriesgar dos sesiones con un ticket).

### 5b2 (`feat/verificacion-dos-pasos-wu05b2`, tareas 5b.3 a 5b.6)

- `TfaLoginController` con las cinco rutas publicas del segundo paso (`2fa/verificar`, `2fa/enrolamiento/iniciar|confirmar`, `login/continuar`, `login/seleccionar`): errores de codigo y de ticket en 401 (tabla del diseno), falta de clave maestra en 503, sin membresia activa en 403. `clienteId` con `@IsUUID()` (un id mal formado hacia que Prisma lanzara y la ruta diera 500).
- `auth.module.ts`: `EmitirSesionService` como provider y los dos casos de uso.
- e2e `tfa-login.e2e.spec.ts` con desafios sembrados por el repo; limpia sus filas.
- 5b.3 (L8) lo cubre el e2e para el refresh; el cambio de cliente queda para el e2e de 5c.7.
- Para WU-10/11: el `apiFetch` del frontend refresca ante cualquier 401; `auth/2fa/*` y `auth/login/continuar|seleccionar` tienen que entrar en el conjunto de rutas que nunca refrescan.
- Evidencia: suite completa sobre WU-5b entera 645 archivos, 7858 tests verdes; specs focales 55 verdes; typecheck, lint y ratchet limpios.

## WU-5c — LoginUseCase con la decision de segundo paso (5c con size:exception; 5c.7 en WU-5c2)

### 5c (`feat/verificacion-dos-pasos-wu05c`, tareas 5c.1 a 5c.6)

- Tras la contrasena correcta: 2FA activo (`secretoCifrado != null`) devuelve un desafio VERIFICAR `{needs2fa, desafio, recordarDisponible}` sin tokens; obligado sin 2FA devuelve uno ENROLAR `{needsEnrolamiento2fa, desafio}`; si no, la conducta de antes. El paso corre antes de la rama de `clienteId`, asi que el `clienteId` del body no lo saltea. La respuesta de seleccion suma `ticket`.
- `MembresiaResuelta.clienteRequiere2fa` (mapper + fixtures): `esObligado2fa` ya cuenta la politica por cliente; como `requiere_2fa` nace en false, hasta WU-7 solo ROOT obliga en la practica.
- `tfa-de-test.ts` (helper solo de specs): activa 2FA con un secreto conocido y genera codigos con los servicios reales. Los e2e e integracion que loguean como ROOT (`auth.e2e`, `autorizacion.e2e`, `prisma-auth.integration`) pasan por el segundo paso; no hay bypass ni variable de entorno.
- `recordarDisponible = !isGlobalAdmin` se anuncia pero no tiene efecto hasta WU-6a.
- Contrato que cambia: ROOT con `clienteId` en el login ya no recibe un token con alcance; entra con alcance MASTER por continuar y se mueve con el cambio de cliente (L7).
- **size:exception autorizado por el dueno el 2026-10-07** (~510 lineas): partir separaria el cambio de conducta de los specs que necesita para quedar en verde. Reset del ledger autorizado en la misma decision.
- Evidencia: suite completa 646 archivos, 7862 tests verdes; typecheck, lint y ratchet de casts limpios.
- Cobertura que se movio: "el token master de ROOT guarda `clienteId` null en el refresh" sale del unit de login y entra en el e2e de 5c.7.
