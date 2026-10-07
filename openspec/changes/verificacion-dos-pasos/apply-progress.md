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

### 5c2 (`feat/verificacion-dos-pasos-wu05c2`, tareas 5c.7 y 5c.8)

- `backend/src/auth/interface/controllers/login-2fa.e2e.spec.ts` (8 tests, Postgres real, filas con sufijo aleatorio y limpieza propia): sin 2FA con 1 y 2 clientes; con 2FA con 1 y 2 clientes (verificar, continuar, seleccionar); desafio no reusable (L2); refresh y `/auth/switch` sin codigo (L8); refresh token que sigue valido (L9); ENROLAR rechazado en continuar y seleccionar hasta confirmar (L5); secreto con AAD de otro usuario da 401 sin sesion (L11); C3; ROOT con `cliente_id` NULL en el refresh token.
- Mutacion verificada: `some` por `every` en `es-obligado-2fa.ts` hace fallar C3 y L5; revertida.
- 5c.8: lint, typecheck, ratchet de casts limpios y el spec nuevo en verde; la suite completa no se corrio en esta unidad (la corre el orquestador).
- Para el PR: el login cambia de contrato (`needs2fa`, `needsEnrolamiento2fa`, `ticket` en la seleccion; ROOT entra por continuar con alcance MASTER); deuda de Ayuda anotada (suspendida); advertir la exposicion de la cadena (ver Despliegue).

## WU-6a — Dispositivo confiable y desactivacion propia (COMPLETA; partida en tres: 6a-i repo, 6a-ii emision y uso, 6a-iii desactivacion)

WU-6a entera sumaba ~730 lineas de codigo y tests (presupuesto 400); el orquestador la partio por la costura propuesta, cada parte con su rama y compilando sola. El resto del trabajo (6a-ii y 6a-iii) esta implementado y verde (`src/auth`: 80 archivos, 946 tests) y guardado fuera del repo para reaplicarlo por partes.

### 6a-i — Repositorio (hecha; tareas 6a.1 y 6a.2)

- `backend/src/auth/domain/ports/dispositivo-confiable-repository.port.ts`: `IDispositivoConfiableRepository` (`crear`, `esValido`, `revocarTodosDe`) y el token `DISPOSITIVO_CONFIABLE_REPOSITORY`.
- `backend/src/auth/infrastructure/tfa/prisma-dispositivo-confiable.repository.ts`: guarda solo el hash; `esValido` exige usuario, no revocado y `expira_at > ahora` (el limite exacto ya vencio); `revocarTodosDe` lanza ante fallo (fail-closed).
- `prisma-dispositivo-confiable.repository.integration.spec.ts`: 5 tests contra Postgres real (solo hash en la fila, 30 dias, dueno, vigencia exacta, revocacion y fallo forzado).
- `application/tfa/token-dispositivo.ts`: token opaco de 32 bytes y su SHA-256; sin consumidores hasta 6a-ii.
- `auth.module.ts`: solo el registro de `DISPOSITIVO_CONFIABLE_REPOSITORY`.
- Evidencia: typecheck, lint y ratchet de casts (617) limpios; el spec de integracion en verde.

### 6a-ii — Emision y uso (hecha; tareas 6a.3, 6a.4, 6a.5; 6a.8 queda para 6a-iii)

`VerificarDesafioUseCase` acepta `recordar` y emite el dispositivo (ROOT nunca); `LoginUseCase` suma `dispositivos` y omite el desafio con un token valido de un usuario no ROOT con 2FA activo; DTOs y controladores (`dispositivoConfiable` en el body de login; `recordar` y `dispositivoConfiable` en la respuesta de `2fa/verificar`); e2e `dispositivo-confiable.e2e.spec.ts` sin el tramo de desactivar (verificar con `recordar` emite el token, el login siguiente lo usa, sin la contrasena no entra, un token ajeno sigue con el desafio). Evidencia: `src/auth` 79 archivos, 940 tests verdes; typecheck, lint y ratchet (617) limpios. El tramo de desactivar del e2e y la casilla 6a.8 llegan con 6a-iii.

### 6a-iii — Desactivacion propia (hecha; tareas 6a.6, 6a.7, 6a.8)

- `Tfa2faObligatorioError` (`tfa.errors.ts`) y `application/tfa/desactivar-tfa.use-case.ts` + spec unit (5 tests): el obligado (`esObligado2fa` con las membresias activas, igual que el login) se rechaza ANTES de reservar cupo; codigo invalido no borra; `eliminarTodo` y despues revocar refresh con log-and-swallow.
- `POST /auth/2fa/desactivar` en `TfaCuentaController`: 204, 409 obligado, 422 codigo. Provider en `auth.module.ts`.
- e2e `dispositivo-confiable.e2e.spec.ts`: suma el tramo de desactivar (204, dispositivo revocado, `usuarios_tfa` vacio).
- Evidencia: `src/auth` 80 archivos, 946 tests verdes; typecheck, lint y ratchet de casts (617) limpios; sin `as unknown as` nuevos.

### Evidencia de WU-6a completa y riesgos residuales

- Riesgo: la fila del dispositivo se crea DESPUES de rotar el ticket; si `crear` lanza, el ticket ya se gasto y el usuario vuelve a loguear.
- Riesgo: en la desactivacion, si revocar los refresh tokens falla se loguea y se traga; el 2FA ya quedo desactivado y las sesiones abiertas siguen vivas hasta vencer.
- Deuda de Ayuda (suspendida): el usuario ya puede desactivar su propio 2FA; la pantalla llega en WU-12 y el articulo se escribe en la tanda final.

## WU-6b — Fail-closed al cambiar la contrasena (COMPLETA; tareas 6b.1 a 6b.7)

- Orden nuevo, con `IDispositivoConfiableRepository.revocarTodosDe` (ya existia desde 6a-i, sin cambios al puerto) ANTES de guardar la contrasena: `CambiarPasswordUseCase` (verificar actual, hash, revocar dispositivos, save, refresh log-and-swallow), `ResetearPasswordUsuarioTenantUseCase` (igual, sobre el destino) y `ConfirmarResetPasswordUseCase` (hash en memoria, revocar dispositivos, CAS del token, save). Si la revocacion lanza, se propaga y no corre ni el CAS ni el save: el token queda vigente y el usuario reintenta o pide otro link. Ningun camino desactiva el 2FA.
- Los casos de uso reciben `Pick<IDispositivoConfiableRepository, 'revocarTodosDe'>` despues del repo de refresh; `auth.module.ts` lo inyecta y exporta `DISPOSITIVO_CONFIABLE_REPOSITORY` para `recuperacion-password.module.ts`.
- `backend/scripts/reset-password.ts`: `$transaction([updateMany dispositivos, update usuario])`. Integracion: revoca y cambia; el fallo del UPDATE (byte nulo en `text`, rechazado por Postgres despues del updateMany) deja contrasena vieja y los 2 dispositivos vivos.
- Evidencia: `src/auth` 80 archivos, 955 tests verdes; typecheck y lint limpios; ratchet de casts 617 (sin subir). ~310 lineas de codigo y tests.
- Deuda de Ayuda (suspendida): cambiar o resetear la contrasena ahora cierra los dispositivos confiables; el articulo se escribe en la tanda final.

## WU-7 — Politica de 2FA por cliente (partida: 7 repo y obligado, 7b ruta y caso de uso)

WU-7 entera sumaba 448 lineas de codigo y tests: agregar dos metodos obligatorios a `IClienteRepository` obligo a tocar 21 mocks de specs (~42 lineas). El orquestador la partio por la costura que propuso el ejecutor.

### 7 (`feat/verificacion-dos-pasos-wu07`, tareas 7.1 y 7.2 + correccion de `ObtenerEstadoTfa`)

- `IClienteRepository.fijarRequiere2fa` (`updateMany` dirigido que devuelve boolean, nunca por el upsert de `save`) y `obtenerRequiere2fa` (null si el cliente no existe), con 2 tests de integracion; los 21 mocks existentes se completaron sin casts.
- `ObtenerEstadoTfa` calcula `obligado` con las membresias activas (`esObligado2fa(isGlobalAdmin, activas)`): `GET /auth/2fa` ya refleja la politica del cliente. Se quito el `TODO(WU-7)`.
- Evidencia: specs focales 22 verdes; typecheck y lint limpios. Sobre WU-7 entera: `src/auth src/clientes` 132 archivos, 1358 tests verdes; ratchet de casts 617.

### 7b (`feat/verificacion-dos-pasos-wu07b`, tareas 7.3 a 7.6)

- `ConfigurarPoliticaTfaUseCase` (`execute({clienteId, requiere2fa})` y `obtener(clienteId)`): depende solo de `IClienteRepository`, asi que no puede revocar sesiones (C4) ni tocar el 2FA (C5).
- `PoliticaTfaController` (`GET` y `PUT /politica-2fa`) bajo `JwtAuthGuard` + `TenantGuard` y `AdminClienteGuard` en los dos metodos: el `clienteId` sale del JWT (un token sin cliente recibe 403 en `TenantGuard`); un `clienteId` en el body se ignora (DTO con whitelist); cliente inexistente, 404.
- e2e `politica-tfa.e2e.spec.ts`: TECNICO 403 en GET y PUT, aislamiento entre clientes, body ignorado, body invalido 400, sesiones abiertas sobreviven a activar y desactivar (C4). C3 y C5 de punta a punta quedan cubiertos en unit (y C3 en el e2e de login de 5c2).
- Evidencia: `src/auth src/clientes` 132 archivos, 1358 tests verdes; typecheck, lint y ratchet limpios.

## WU-8 — Reseteo de 2FA por API y por script (partida en tres: 8 regla y ruta, 8b e2e, 8c script)

WU-8 entera sumaba ~875 lineas de codigo y tests; la costura de tasks.md ("API vs script") no alcanzaba, asi que el orquestador la partio en tres, cada parte en verde con sus predecesoras.

### 8 (`feat/verificacion-dos-pasos-wu08`, tareas 8.1 a 8.4)

- `IMembresiaRepository.findClientesDeTodasByUsuario` (sin ningun filtro: cuenta membresias inactivas, de clientes suspendidos y borradas) con su test de integracion; 8 mocks existentes completados.
- `ResetearTfaUsuarioUseCase` (dependencias `Pick<>`): ROOT resetea a cualquiera, incluido otro ROOT; un ADMINISTRADOR solo a un usuario no ROOT con membresia ACTIVA en su cliente y con TODAS sus membresias en ese cliente (puede resetearse a si mismo con la misma regla). Todo rechazo es el mismo `MembresiaNoEncontradaError` (404) que un id inexistente. El reseteo corre `eliminarTodo` y despues revoca los refresh (registrar y seguir).
- `DELETE /usuarios/:id/2fa` en `UsuariosController` con `AdminClienteGuard`, 204. Bajo `TenantGuard`: un ROOT con token MASTER debe cambiar de cliente antes; el ROOT bloqueado de todo usa el script (8c).
- Evidencia: `src/auth` 81 archivos, 968 tests verdes; typecheck, lint y ratchet limpios.

### 8b (`feat/verificacion-dos-pasos-wu08b`, tarea 8.5)

- e2e `usuarios-reseteo-tfa.e2e.spec.ts`: ROOT, ADMINISTRADOR y TECNICO contra cada caso de la regla; tras el reseteo, el siguiente login obliga a enrolar de nuevo (S5). Un ROOT con token MASTER cambia de cliente antes de resetear (la ruta vive bajo `TenantGuard`).

### 8c (`feat/verificacion-dos-pasos-wu08c`, tareas 8.6 a 8.8)

- `backend/scripts/resetear-2fa-root.ts` (molde `reset-password.ts`, sin `.ps1`): solo para un usuario existente con `isGlobalAdmin`; si no, sale con 1 sin escribir nada. Un unico `$transaction` con los efectos de `eliminarTodo` mas la revocacion de refresh; imprime solo `OK`; lee `RESET_EMAIL` y el `.env` con `process.loadEnvFile()`. Se corre con `corepack pnpm exec ts-node scripts/resetear-2fa-root.ts`; la entrada del runbook va en WU-9.
- Sus efectos duplican los de `eliminarTodo`: si uno cambia, el otro tambien.
- Evidencia: spec del script 4 tests verdes (dos corridas reales de ts-node: `OK` con salida 0, y salida 1 para un no ROOT sin cambios); typecheck, lint y ratchet limpios.

## WU-9 — Rotacion con destinos TOTP, seed del ROOT y runbook (partida en A y B)

WU-9 entera estimaba ~390 lineas de codigo y tests pero la rotacion sola ya sumaba 363; con el e2e 9.5 y el seed pasaba de ~500. El orquestador aprobo partirla.

### A (`feat/verificacion-dos-pasos-wu09`, tareas 9.1 a 9.4 y la parte de runbook de 9.8)

- `rotar-email-crypto-key.mjs` recorre una lista `DESTINOS` (SMTP con AAD `id`; `secreto_cifrado` y `secreto_pendiente_cifrado` con AAD `tfa:{usuario_id}`) en una sola transaccion: rotar, `--dry-run`, relectura round-trip y `--verificar`. Un destino indescifrable revierte todo. La linea de salida `migradas=N ya_migradas=M` suma todos los destinos. `clasificarFila` conserva su firma; se agrego `clasificarPayload`.
- `rotate-email-crypto-key.ps1`: solo el comentario de cabecera (ASCII, sin BOM).
- Los specs de integracion y de proceso reproducen el schema hasta `20261008120000_verificacion_dos_pasos` y cubren round-trip, re-corrida idempotente, atomicidad con SMTP ya re-cifrado, AAD movido y `--verificar`.
- `DEPLOY-VPS-runbook.md`: seccion 5 menciona los secretos TOTP; preflight de `EMAIL_CRYPTO_KEY` y enrolamiento forzado del ROOT; verificacion de IP en `auth_intentos_fallidos`; recuperacion con `resetear-2fa-root.ts`.

### B (pendiente)

- 9.5 (e2e del login con secreto manipulado: 401 y log `TFA_SECRETO_INDESCIFRABLE`), 9.6-9.7 (seed con lista positiva de `NODE_ENV`), README y 9.9 (incluye `pnpm test` completo).
- `backend/.env.example` no se puede leer ni editar con los permisos actuales: su documentacion de `ROOT_ADMIN_TOTP_SECRET` queda para quien tenga acceso. 9.8 sigue sin tildar por ese resto.

### B (`feat/verificacion-dos-pasos-wu09b`, tareas 9.5 a 9.7, resto de 9.8 y 9.9)

- e2e `tfa-secreto-indescifrable.e2e.spec.ts`: un secreto TOTP manipulado, cifrado para otro usuario o basura hace que `POST /auth/2fa/verificar` responda 401 (nunca 500) y loguee `TFA_SECRETO_INDESCIFRABLE`.
- `root-bootstrap.seed.ts`: `assertTotpPermitido` (lista positiva `development`/`test`, fail-closed) corre como primera sentencia de `bootstrapRoot`, antes de leer o escribir la base; exige base32. Con el secreto permitido, `usuarios_tfa` se activa por upsert con `SecretoTotpCifrado` real (AAD `tfa:{usuarioId}`), tambien para un ROOT preexistente. `bootstrapRoot` recibe `entorno` (por defecto `process.env`) y `secretos` como parametros.
- Tests en `root-bootstrap.seed.integration.spec.ts` (base real, no un fake: armar un cliente Prisma falso exigia casts): un caso por valor de `NODE_ENV` ausente, `production`, `staging`, `Production`, vacio, que verifican que no se crea ni toca nada; `development` y `test` activan el 2FA y el secreto descifra; sin la variable no hay 2FA.
- README: fila de `ROOT_ADMIN_TOTP_SECRET` (solo desarrollo y test).
- **Pendiente para una persona:** `backend/.env.example` no se puede leer ni editar con los permisos actuales; falta agregarle una linea `ROOT_ADMIN_TOTP_SECRET=` comentada, con el valor de desarrollo documentado en el README.

## WU-10 — BFF: cookie `td`, IP y rutas de login (partida: 10 helper y login, 10b rutas nuevas)

WU-10 entera sumaba ~560 lineas (~170 de codigo, ~350 de tests). El orquestador la partio por la costura que propuso el ejecutor.

### 10 (`feat/verificacion-dos-pasos-wu10`, tareas 10.1, 10.2, 10.5, 10.6 y la parte de login de 10.3/10.4)

- `frontend/src/shared/auth/sesion-bff.ts`: `ipDelNavegador` toma la entrada MAS A LA DERECHA de `x-forwarded-for` (la agrega IIS ARR), le saca el puerto (`ip:puerto`, `[v6]:puerto`, `[v6]`; ARR usa `includePortInXForwardedFor=true` por defecto) y la devuelve solo si `net.isIP` la acepta. `responderConSesion` pone `at`/`rt` solo si la respuesta trae los dos tokens; si no, pasa el cuerpo sin cookies.
- `cookies.ts`: cookie `td` (httpOnly, mismo `cookieAttrs`, `__Host-` en produccion, 30 dias).
- `login/route.ts` reescrita: manda la IP como `x-soporte-ip-navegador` solo si es valida, manda la cookie `td` como `dispositivoConfiable` (descarta uno que mande el cliente) y no lo devuelve en la respuesta.
- `client.ts`: `RUTAS_SIN_REFRESH` (`auth/refresh`, `auth/login`, `auth/2fa/verificar`, `auth/2fa/enrolamiento/*` por prefijo, `auth/login/continuar`, `auth/login/seleccionar`): un 401 de esas rutas no dispara el refresh ni re-postea la contrasena.
- Evidencia: `src/shared` + test del login 294 verdes; type-check y lint limpios. Sobre WU-10 entera: frontend 249 archivos, 2022 tests verdes; ratchet de casts 617.

### 10b (`feat/verificacion-dos-pasos-wu10b`, tareas 10.3, 10.4 y 10.7)

- Rutas BFF nuevas: `api/auth/2fa/verificar` (pone la cookie `td` desde `dispositivoConfiable` y la saca del JSON; nunca pone `at`/`rt`), `api/auth/login/continuar` y `api/auth/login/seleccionar` (via `responderConSesion`). La IP no viaja en estas rutas: el backend la lee solo en el login.
- El enrolamiento (`auth/2fa/enrolamiento/*`) y la autogestion van por el proxy generico `[...path]` (ADR-11): sin rutas dedicadas.
- Correccion del validador: `verificar` toleraba mal un 2xx con cuerpo vacio o null (desestructurar null daba 500); ahora responde 200 sin cookies, con su test.
- Evidencia: frontend 249 archivos, 2022 tests verdes (antes de la correccion; el test nuevo de verificar pasa); type-check, lint y ratchet limpios.

## WU-11a — Maquina de login y desafio (partida: 11a formulario, 11a2 maquina y pagina)

WU-11a entera sumaba 553 lineas; el orquestador la partio por la costura que propuso el ejecutor.

### 11a (`feat/verificacion-dos-pasos-wu11a`, tarea 11a.3 y la mitad de schema de 11a.2 y de formulario de 11a.4)

- `schemas.ts`: `codigoDesafioSchema` acepta 6 digitos o `XXXX-XXXX-XXXX` (guiones opcionales); `recordar` booleano.
- `DesafioTfaForm` (presentacional): input etiquetado con `inputMode="numeric"` y `autoComplete="one-time-code"`; casilla "Recordar este dispositivo" oculta si `recordarDisponible === false`; deshabilitado mientras envia; errores en linea. Sin cablear hasta 11a2.
- Evidencia: `src/features/auth` 60 tests verdes; type-check y lint limpios. Sobre WU-11a entera: frontend 250 archivos, 2037 tests verdes; ratchet 617.

### 11a2 (`feat/verificacion-dos-pasos-wu11a2`, tareas 11a.1, 11a.2, 11a.4 y 11a.5)

- `use-login.ts`: maquina `credenciales | codigo | enrolamiento | seleccion`. Ya no guarda la contrasena: solo `desafio` o `ticket`. `verificarCodigo` encadena `2fa/verificar` y `login/continuar`; el selector usa `login/seleccionar` con el ticket, tanto en el camino con 2FA como en el multi-cliente sin 2FA. Un codigo incorrecto deja en el paso del codigo con un mensaje generico; 5xx y red usan `mensajeDeErrorDeLogin`. `recordarDisponible` ausente cuenta como true (el backend siempre lo manda; ROOT nunca recibe dispositivo).
- `login/page.tsx` renderiza por paso; el enrolamiento es un aviso provisorio hasta WU-11b.
- Hallazgos del validador que pasan a WU-11b (mismo hook): un desafio o ticket vencido deja al usuario en el mismo paso sin forma de volver a las credenciales, y un 401 del selector dice "Credenciales incorrectas". Falta "Volver" y un mensaje propio para el desafio vencido.
- Evidencia: frontend 250 archivos, 2037 tests verdes; type-check, lint y ratchet limpios.

## WU-11b — Enrolamiento forzado y codigos de recuperacion (partida en dos)

WU-11b entera sumaba ~530 lineas de codigo y tests (tope 400), asi que se parte en dos. Ninguna tarea de tasks.md (11b.1-11b.5) se tilda en la parte A.

### Parte A (`feat/verificacion-dos-pasos-wu11b`): arreglos arrastrados de la validacion de 11a2

- `use-login.ts`: `volver()` descarta desafio y ticket y regresa a `credenciales`; la pagina muestra "Volver" en los pasos codigo, seleccion y enrolamiento (placeholder).
- Desafio o ticket vencido: un 401 de `login/continuar` o `login/seleccionar` muestra `MENSAJE_VENCIDO` ("La verificacion vencio. Volve a iniciar sesion.") y vuelve a `credenciales`, en vez de "Codigo incorrecto" o "Credenciales incorrectas".
- Heuristica de 5 minutos en `2fa/verificar`: el backend responde el MISMO 401 para un codigo equivocado y para un desafio vencido (anti-oraculo, por diseno). El frontend no puede distinguirlos por la respuesta, asi que el paso del codigo guarda `emitidoAt` y un 401 pasados 5 minutos (`DESAFIO_VERIFICAR_MS`, la duracion del desafio VERIFICAR) se trata como vencimiento. Antes del plazo, un 401 sigue siendo "Codigo incorrecto".
- Tests: volver desde codigo y desde seleccion, 401 de continuar, 401 de seleccionar, verificar vencido por plazo (con `Date.now` simulado), y "Volver" en la pagina.
- Parte B pendiente (tareas 11b.1-11b.5): componentes `EnrolamientoTfa` y `CodigosRecuperacion`, estados `enrolamiento` (iniciar) y `codigos`, continuar con ticket. Borrador completo fuera del repo, en el scratchpad de la sesion (`wu11b-rest/`).
