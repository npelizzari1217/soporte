# Design: verificación en dos pasos (2FA)

## Technical Approach

Decisión de producto: `docs/roadmap-comercial.md`, "Segunda etapa, punto 5", incluidas las
"Precisiones del 2026-10-07". Specs que cubre: `auth-2fa-totp` (T1-T12), `auth-2fa-login`
(L1-L11), `auth-2fa-dispositivo-confiable` (D1-D7), `auth-limite-intentos` (I1-I8),
`auth-2fa-politica-cliente` (C1-C5), `auth-2fa-reseteo` (S1-S8) y los deltas
`usuarios-reset-password` (U1-U2), `auth-reseteo-por-olvido` (O1-O2) y
`email-crypto-key-rotacion` (K1-K4).

El login pasa a ser una máquina de estados con un **desafío opaco en MASTER** entre la contraseña
y la sesión. Se reutilizan cinco moldes del repo sin cambiarlos de forma:

1. **Token opaco** de 32 bytes con SHA-256 persistido y CAS de uso único (`refresh_tokens`,
   `password_reset_tokens`, `login.use-case.ts:191-192`).
2. **Cifrado de secretos** con `ISecretCipher` / `AesGcmSecretCipher`
   (`shared/infrastructure/crypto/aes-gcm-secret-cipher.ts:30-104`), ya provisto global en
   `shared.module.ts:85`.
3. **Escritura acotada** de columnas que el upsert de `save()` no debe pisar (`slug`, `schema.prisma:131-134`).
4. **Ruta de configuración del tenant** con `JwtAuthGuard, TenantGuard` por clase y
   `AdminClienteGuard` por método (`horario-laboral.controller.ts:66-87`).
5. **Rotación transaccional** de `rotar-email-crypto-key.mjs:140-243`.

La pieza nueva es el **verificador de código** (`VerificadorCodigoTfa`): un único punto que
acepta TOTP o código de recuperación, aplica el limitador por usuario y el antireplay. Lo usan
el login, el enrolamiento forzado y las cuatro acciones de autogestión.

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué |
|---|---|---|
| `esObligado2fa(isGlobalAdmin, membresiasActivas)`, `normalizarCodigoRecuperacion`, `clasificarCodigo` (6 dígitos o recuperación), `normalizarEmail` | domain (`auth/domain/tfa/`) | Reglas puras; fuente única para login (L3) y desactivación (T8) |
| `ITotpService`, `ITfaRepository`, `IDesafioLoginRepository`, `IDispositivoConfiableRepository`, `ILimitadorIntentos` | domain (puertos de `auth`) | Contratos sin Prisma ni `crypto` |
| `TotpNativoService` (RFC 6238, base32, URI `otpauth://`) | infrastructure (`auth/infrastructure/tfa/`) | Usa `crypto` de Node; sustituible detrás del puerto |
| `SecretoTotpCifrado` (envuelve `ISecretCipher` con AAD `tfa:{usuarioId}`) | application | Traduce el fallo de descifrado a un `Result`, nunca a una excepción hacia arriba (T12) |
| `VerificadorCodigoTfa`, `EmitirSesionService` (pasos 5-6 actuales de `LoginUseCase`, `login.use-case.ts:153-206`) | application | Orquestan puertos; compartidos por varios use cases, como `resolverScope` |
| Use cases de login, enrolamiento, autogestión, reseteo y política | application | Un caso por acción |
| Repos Prisma, SQL del limitador | infrastructure | Único lugar con `@prisma/client` |
| `ipDelNavegador(req)` | interface (`auth/interface/`) | Lee socket y cabecera: es transporte, no regla |
| Controllers, DTOs (`class-validator`) | interface | Traducen, sin lógica |
| BFF (`frontend/src/app/api/auth/**`), cookie `td` | frontend server | Único dueño de cookies httpOnly |

**Fuente única** (`rules.specs`):

- **Formato del código TOTP** (6 dígitos) y **del código de recuperación** (12 caracteres
  Crockford base32, `XXXX-XXXX-XXXX`): `auth/domain/tfa/formato-codigo.ts`. El Zod del frontend
  (`features/auth/schemas.ts`) los espeja.
- **Regla de obligación**: `esObligado2fa`. El DTO de estado (`GET /auth/2fa`) expone `obligado`
  calculado por ella; el frontend nunca la recalcula.
- **Duraciones** (desafío, ticket, dispositivo, ventana del limitador): `auth/domain/tfa/tfa.constants.ts`.
  `TRUSTED_DEVICE_MAX_AGE` del BFF (`shared/auth/cookies.ts`) espeja los 30 días.

### Autorización: los dos lugares donde vive

| Ruta | Borde | Inline |
|---|---|---|
| `POST /auth/2fa/verificar`, `/auth/2fa/enrolamiento/*`, `/auth/login/continuar`, `/auth/login/seleccionar` | Ninguno (públicas, como `/auth/login`) | El desafío o ticket ES la autorización: CAS por `token_hash`, `proposito`, `verificado_at`, `usado_at`, `expira_at`. `seleccionar` exige `findActivaByUsuarioYCliente` (L7) |
| `GET/POST /auth/2fa/**` (autogestión) | `JwtAuthGuard` (como `/auth/change-password`, `auth.controller.ts:215-231`) | `usuarioId = user.sub`; código válido vía `VerificadorCodigoTfa`; `desactivar` exige `!esObligado2fa` (T8) |
| `GET/PUT /politica-2fa` | `JwtAuthGuard, TenantGuard` por clase; `AdminClienteGuard` por método | `clienteId = actor.cliente_id`, nunca del body (C1) |
| `DELETE /usuarios/:id/2fa` | `UsuariosController` (`JwtAuthGuard, TenantGuard`, `usuarios.controller.ts:153`) + `AdminClienteGuard` | `ResetearTfaUsuarioUseCase`: ROOT sin restricción (S1); ADMINISTRADOR exige membresía activa en su cliente, todas las membresías en su cliente y destino no ROOT (S2, S4) |
| `scripts/resetear-2fa-root.ts` | Acceso al VPS | Exige `isGlobalAdmin` del destino (S6) |

---

## Architecture Decisions

### ADR-1: desafío opaco en MASTER y ticket de selección

| Opción | Tradeoff | Decisión |
|---|---|---|
| JWT corto con claim `typ` | Sin tabla, pero no es revocable ni de un solo uso (L2); la exclusión de `JwtAuthGuard` dependería de que falte `v` (`jwt-auth.guard.ts:74`), un resguardo implícito | Rechazada |
| Re-postear email, contraseña y código | El selector re-enviaría un TOTP ya consumido (T2) | Rechazada |
| **Fila opaca en `auth_desafios`, con CAS y rotación del token al verificar** | Una tabla más; molde usado cuatro veces | **Elegida** |

- **Propósitos**: `VERIFICAR` (2FA activo), `ENROLAR` (obligado sin 2FA), `SELECCIONAR`
  (sin 2FA, más de una membresía: nace verificado).
- **Duración**: `VERIFICAR` 5 min; `ENROLAR` 15 min (escanear el QR y guardar los códigos
  lleva tiempo); el **ticket** vale 5 min desde la verificación.
- **Transiciones** (todas `updateMany` con `WHERE token_hash, usado_at IS NULL, expira_at > now()`):
  - `verificar` / `enrolamiento/confirmar`: exige `verificado_at IS NULL`; fija `verificado_at`,
    **reemplaza `token_hash`** por el de un ticket nuevo y extiende `expira_at` a +5 min. El
    string del desafío queda inservible (L2 "reutilizado").
  - `continuar`: exige `verificado_at IS NOT NULL`. Si corresponde sesión (ROOT o una
    membresía), consume (`usado_at`); si corresponde selector, devuelve las membresías y el
    mismo ticket sin consumir.
  - `seleccionar`: valida la membresía activa ANTES de consumir; si no existe, el mismo error
    que un ticket inválido (L7) y el ticket sigue vigente.
- **L5**: un `ENROLAR` sin `verificado_at` solo sirve para `enrolamiento/iniciar|confirmar`;
  `continuar` y `seleccionar` lo rechazan. Nunca es un access token: es opaco.
- **Compatibilidad hacia atrás**: `POST /auth/login` conserva `clienteId` opcional. Para quien
  no necesita segundo paso, `{email, password, clienteId}` sigue emitiendo sesión (los e2e de
  `dar-de-baja-equipo.e2e.spec.ts:320` y similares no cambian). Para quien necesita segundo
  paso, `clienteId` se ignora y el flujo sigue por el desafío. La respuesta de selección suma
  `ticket`; el frontend nuevo deja de re-enviar la contraseña (L7).
- **Errores**: desafío o ticket desconocido, vencido, usado o de otro usuario, código erróneo
  y bloqueo → un único `SegundoPasoRechazadoError`, 401, mensaje genérico.

### ADR-2: TOTP nativo detrás de `ITotpService`

| Opción | Tradeoff | Decisión |
|---|---|---|
| `otplib` | Menos código propio; dependencia de seguridad nueva (README, auditoría de versión, `AGENTS.md:118`) | Rechazada |
| **`crypto.createHmac('sha1')`** | ~80 líneas; vectores del apéndice B del RFC 6238 como test; mismo criterio que el cifrado SMTP | **Elegida** |

- Secreto de 20 bytes (`crypto.randomBytes`), base32 RFC 4648 sin padding. 6 dígitos, paso
  30 s, ventana ±1 (T1). Comparación con `timingSafeEqual`.
- `verificar(secreto, codigo, ahora)` devuelve el **paso** aceptado o `null`.
- **Antireplay (T2)**: `ITfaRepository.registrarPaso(usuarioId, paso, secretoCifradoLeido)` =
  `UPDATE usuarios_tfa SET ultimo_paso = $paso WHERE usuario_id = $1 AND ultimo_paso < $paso AND secreto_cifrado = $leido`.
  0 filas = replay (o cambio de celular concurrente) = rechazo. `ultimo_paso` es `integer`
  (paso actual ≈ 5,9·10⁷; evita el `BigInt` de Prisma, mismo criterio que ADR-1 del SLA).
- URI: `otpauth://totp/Soporte:{email}?secret=…&issuer=Soporte&algorithm=SHA1&digits=6&period=30`.
- **Confirmación de un secreto pendiente** (enrolamiento forzado, activación voluntaria y cambio
  de celular; T4, T10): acepta **solo** un TOTP del secreto **pendiente**, nunca un código de
  recuperación ni uno del secreto activo. Un único CAS promueve el pendiente y fija el paso:
  `UPDATE usuarios_tfa SET secreto_cifrado = secreto_pendiente_cifrado, confirmado_at = now(), ultimo_paso = $paso, secreto_pendiente_cifrado = NULL, pendiente_creado_at = NULL WHERE usuario_id = $1 AND secreto_pendiente_cifrado = $pendienteLeido`.
  `ultimo_paso` arranca en el paso de la confirmación, no en el valor del secreto anterior: el
  código que confirmó no se puede repetir (T2), y el secreto nuevo no hereda un paso ajeno.
- **Dónde se reutiliza `VerificadorCodigoTfa`** (TOTP del secreto activo **o** código de
  recuperación, con limitador y antireplay): verificación del login, iniciar cambio de celular,
  regenerar códigos y desactivar. **Dónde no**: las dos confirmaciones de pendiente usan
  `ConfirmadorSecretoPendiente`, que comparte el limitador `cod:{usuarioId}` (I6) y el
  `ITotpService`, pero verifica contra el pendiente y escribe con el CAS de arriba.

### ADR-3: modelo de datos en MASTER (migración única M1)

Tablas propias y nunca columnas en `usuarios`: `UsuarioEntity` se persiste por upsert de todas
sus props, y un `save()` con lectura vieja (cambio de contraseña concurrente con una
activación) pisaría el estado de 2FA. Mismo motivo y misma solución que `slug` (`schema.prisma:131-134`).

| Tabla | Columnas | Restricciones |
|---|---|---|
| `usuarios_tfa` | `usuario_id uuid PK FK→usuarios ON DELETE CASCADE`, `secreto_cifrado text NULL`, `confirmado_at timestamptz NULL`, `ultimo_paso integer NOT NULL DEFAULT 0`, `secreto_pendiente_cifrado text NULL`, `pendiente_creado_at timestamptz NULL`, `created_at`, `updated_at` | CHECK `(secreto_cifrado IS NULL) = (confirmado_at IS NULL)`; CHECK `(secreto_pendiente_cifrado IS NULL) = (pendiente_creado_at IS NULL)` |
| `tfa_codigos_recuperacion` | `id uuid PK`, `usuario_id FK CASCADE`, `codigo_hash text`, `usado_at timestamptz NULL`, `created_at` | índice `usuario_id` |
| `tfa_dispositivos_confiables` | `id`, `usuario_id FK CASCADE`, `token_hash text UNIQUE`, `expira_at`, `revocado_at NULL`, `created_at` | índice `usuario_id` |
| `auth_desafios` | `id`, `usuario_id FK CASCADE`, `token_hash text UNIQUE`, `proposito varchar(12)`, `verificado_at NULL`, `usado_at NULL`, `expira_at`, `created_at` | CHECK `proposito IN ('VERIFICAR','ENROLAR','SELECCIONAR')`; índice `usuario_id` |
| `auth_intentos_fallidos` | `clave varchar(200) PK`, `fallos integer NOT NULL`, `ventana_inicio timestamptz NOT NULL` | Sin FK: la clave de contraseña existe aunque el email no (I3) |
| `clientes.requiere_2fa` | `boolean NOT NULL DEFAULT false` | Default en DDL y Prisma (C2) |

- **2FA activo** = `secreto_cifrado IS NOT NULL`. Un pendiente no activa nada (T4) y, en un
  cambio de celular, convive con el activo hasta la confirmación (T10).
- **`requiere_2fa` fuera del upsert**: `ClienteMapper.toPersistence` no la incluye; se escribe
  solo por `IClienteRepository.fijarRequiere2fa(clienteId, valor)` y se lee por
  `obtenerRequiere2fa`. `ClienteEntity` no la lleva.
- **Obligación en el login sin queries extra**: `findActivasByUsuario` ya hace `include: { cliente: true }`
  (`prisma-membresia.repository.ts:36-58`); `MembresiaResuelta` suma `clienteRequiere2fa`
  desde el mapper.
- **`TRUNCATE … CASCADE`** de los specs (`sectores.e2e.spec.ts:226` y otros) arrastra las
  cuatro tablas con FK. `auth_intentos_fallidos` no tiene FK y no cae por cascada: ver
  "Higiene de tests" en Testing Strategy.

### ADR-4: códigos de recuperación con argon2id

| Opción | Tradeoff | Decisión |
|---|---|---|
| SHA-256 de un código de ~50 bits | Una fuga de la base se ataca offline en horas | Rechazada |
| HMAC con clave del servidor | Rotar la clave invalida todos los códigos (no se pueden re-derivar) | Rechazada |
| Prefijo en claro + argon2id | Una sola verificación, pero filtra 20 bits por código y complica el formato | Rechazada |
| **12 caracteres Crockford base32 (60 bits) + argon2id vía `IHashProvider`** | Hasta 10 verificaciones argon2 (≤ ~1 s) solo en el camino de recuperación, acotado por el limitador por usuario (5 por ventana) | **Elegida** |

- Formato `XXXX-XXXX-XXXX`; se normaliza (mayúsculas, sin guiones ni espacios, `O→0`, `I/L→1`).
- El verificador recorre los códigos sin usar del usuario y consume el que coincide con
  `UPDATE … SET usado_at = now() WHERE id = $1 AND usado_at IS NULL` (T5, concurrencia).
- Generar o regenerar: borrar el juego anterior e insertar 10 en **una** transacción (T9).

### ADR-5: clave de cifrado del secreto TOTP — se comparte `EMAIL_CRYPTO_KEY`

| Opción | Tradeoff | Decisión |
|---|---|---|
| `TFA_CRYPTO_KEY` dedicada | Separa radio de daño en teoría; en la práctica las dos claves viven en el mismo `backend/.env` del mismo VPS. Duplica rotación, `.ps1` (tabla §2.2), specs y runbook | Rechazada |
| **`EMAIL_CRYPTO_KEY` con AAD de dominio separado y la rotación extendida** | Un solo procedimiento ya probado; el nombre de la variable queda impreciso (se documenta) | **Elegida** |

- **AAD** = `tfa:{usuarioId}`. Un ciphertext SMTP (AAD = id de cliente) nunca descifra como TOTP
  ni viceversa, y uno movido entre usuarios falla (K1).
- **Rotación**: `rotar-email-crypto-key.mjs` pasa de una columna a una lista de destinos
  (`clientes.smtp_password_cifrada` con AAD `id`; `usuarios_tfa.secreto_cifrado` y
  `usuarios_tfa.secreto_pendiente_cifrado` con AAD `tfa:{usuario_id}`). Misma transacción, mismo
  `FOR UPDATE`, misma relectura round-trip, mismos exit codes (K2); `--verificar` recorre todos
  los destinos (K3). La línea final conserva `migradas=N ya_migradas=M` (totales) para no tocar
  el contrato con `rotate-email-crypto-key.ps1`; solo cambia su comentario de cabecera.
- **Descifrado fallido (T12, L11, K4)**: `SecretoTotpCifrado.descifrar` devuelve `Result.fail`;
  el verificador responde `SegundoPasoRechazadoError` (401), loguea
  `TFA_SECRETO_INDESCIFRABLE | usuarioId=…` sin código ni material de clave, y **no** cuenta el
  intento como fallo: llama a `devolver` sobre su reserva (ADR-6), sin borrar los fallos previos. Los códigos de recuperación siguen funcionando: no dependen del cifrado.
- **Clave ausente al enrolar**: `isAvailable() === false` → 503 controlado. El runbook agrega la
  verificación previa al deploy (la clave ya existe en producción por el SMTP).

### ADR-6: limitador de intentos persistido con reserva atómica

| Opción | Tradeoff | Decisión |
|---|---|---|
| `@nestjs/throttler` | Cuenta éxitos y vive en memoria (I1, I8) | Rechazada |
| Leer, verificar y registrar el fallo | N requests concurrentes con el contador en 4 pasan todas el chequeo | Rechazada |
| **Reserva condicional en un solo `INSERT … ON CONFLICT DO UPDATE … WHERE`** | La reserva ES el fallo provisional; un éxito la borra | **Elegida** |

```sql
INSERT INTO auth_intentos_fallidos AS t (clave, fallos, ventana_inicio) VALUES ($1, 1, now())
ON CONFLICT (clave) DO UPDATE SET
  fallos         = CASE WHEN t.ventana_inicio <= now() - interval '15 minutes' THEN 1     ELSE t.fallos + 1 END,
  ventana_inicio = CASE WHEN t.ventana_inicio <= now() - interval '15 minutes' THEN now() ELSE t.ventana_inicio END
WHERE t.ventana_inicio <= now() - interval '15 minutes' OR t.fallos < 5
RETURNING fallos, ventana_inicio;
```

- Sin fila devuelta = bloqueado: no se incrementa (I7) y no se verifica nada. Con fila: se
  verifica, y el resultado decide una de tres salidas. El lock de fila del `ON CONFLICT`
  serializa los concurrentes: como máximo 5 verificaciones por ventana.

| Resultado | Operación | Efecto |
|---|---|---|
| Éxito | `liberar(clave)` = `DELETE` | Contador a cero (I2) |
| Fallo (credencial o código incorrecto) | ninguna | La reserva queda como fallo (I1) |
| Ni éxito ni fallo (secreto indescifrable T12, desafío inválido antes de evaluar el código, error de infraestructura) | `devolver(clave)` = `UPDATE … SET fallos = fallos - 1 WHERE clave = $1 AND fallos > 0 AND ventana_inicio = $ventanaReservada` | Deshace **solo** esa reserva; los fallos previos siguen contando. El guard por `ventana_inicio` evita restar en una ventana nueva |

- `reservar` devuelve `{ventanaInicio} | null` para que `devolver` lleve su guard. Un
  `devolver` que falla se loguea y no se propaga: el error queda del lado conservador (un fallo
  de más, nunca uno de menos). El desafío se valida **antes** de reservar, así que un desafío
  inválido no consume cupo.
- **Claves**: contraseña `pwd:{sha256(normalizarEmail)}:{ip}` (I3, sin PII en claro); código
  `cod:{usuarioId}` compartida por login, enrolamiento y autogestión (I6).
- **I5**: bloqueado en la contraseña ejecuta igual `verify(password, DUMMY_HASH)`
  (`login.use-case.ts:38-39, 111-113`) y devuelve `CredencialesInvalidasError`.
- **Purga**: como máximo una vez por hora por proceso, `DELETE … WHERE ventana_inicio < now() - interval '1 day'`.
- **IP (I4)**: el BFF manda `x-soporte-ip-navegador`. `ipDelNavegador(req)` la honra **solo si el
  par TCP es loopback** (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`: el BFF y el backend corren en el
  mismo VPS) y si `net.isIP` la acepta; si el par no es loopback, usa la dirección del socket e
  ignora la cabecera. Sin cabecera válida desde loopback, el valor es `sin-ip` (determinístico:
  el límite nunca se omite). Se rechazó un secreto compartido BFF-backend: otra variable a rotar
  para el mismo resultado. Loopback verificado en el VPS: IIS reescribe a `http://localhost:3100`
  por ARR y el BFF llama al backend en `http://localhost:3101/api`.
- **El BFF** toma la entrada **más a la derecha** de `x-forwarded-for`, la que agrega IIS (ARR)
  como proxy confiable; lo que el navegador mande a la izquierda se descarta. Next 15 no expone
  la IP del socket en route handlers.
- **Puerto en la entrada de ARR**: con la configuración por defecto
  (`includePortInXForwardedFor=true`) la entrada es `ip:puerto`. `ipDelNavegador` del BFF
  (`shared/auth/sesion-bff.ts`) quita el puerto antes de reenviar: `1.2.3.4:56789` → `1.2.3.4`,
  `[2001:db8::1]:56789` → `2001:db8::1`; una IP sin puerto pasa igual. Lo que no queda como IP
  válida no se reenvía. El backend valida con `net.isIP` la forma ya limpia. Tests de los dos
  formatos con y sin puerto en el BFF y en el backend; sin esto, todo cae en `sin-ip`.

### ADR-7: dispositivo confiable y su invalidación fail-closed

- Token opaco de 32 bytes, SHA-256 en `tfa_dispositivos_confiables`, `expira_at = +30 días` (D2).
  Se emite solo si `recordar` y `!isGlobalAdmin` (D4); la respuesta lo trae en
  `dispositivoConfiable` y el BFF lo **quita del body** y lo guarda en la cookie `td` (httpOnly,
  `sameSite lax`, `__Host-` en prod, `maxAge` 30 días, `cookies.ts:46-57`).
- El BFF manda la cookie como `dispositivoConfiable` en el body de `POST /auth/login`. Se honra
  solo si `usuario_id` coincide, no está revocado ni vencido, el usuario no es ROOT al momento
  del login y tiene 2FA activo (D3, D4). Si no, se ignora y sigue el desafío.
- **Fail-closed por orden, no por transacción entre repos** (D5, U1, O1): en cada camino se
  revocan los dispositivos **antes** de persistir la contraseña. Si la revocación lanza, la
  excepción se propaga (Nest responde 500) y `passwordHash` no cambió. Si revoca y después falla
  el `save`, quedan dispositivos revocados de más: inocuo.

| Camino | Orden nuevo |
|---|---|
| `CambiarPasswordUseCase` (`cambiar-password.use-case.ts:74-84`) | verificar actual → hash en memoria → **revocar dispositivos** → `save` → revocar refresh (log-and-swallow, sin cambios) |
| `ResetearPasswordUsuarioTenantUseCase` (`:95-105`) | igual |
| `ConfirmarResetPasswordUseCase` (`:62-94`) | hash en memoria → **revocar dispositivos** → CAS del token → `save` → refresh. Si la revocación falla, el token **no** se consumió: el usuario puede reintentar o pedir otro (O1) |
| `scripts/reset-password.ts` (`:91-95`) | `$transaction([updateMany dispositivos, update usuario])` |
| Reseteo y desactivación de 2FA | `ITfaRepository.eliminarTodo(usuarioId)`: en **una** transacción Prisma borra `usuarios_tfa` y códigos, revoca dispositivos e invalida desafíos abiertos (D6); luego refresh con log-and-swallow |

- La revocación de refresh tokens conserva su log-and-swallow (U "MODIFIED", O "MODIFIED").
- Se rechazó propagar el error **después** del `save`: dejaría la contraseña cambiada informando
  fallo, que es justo lo que D5 prohíbe.

### ADR-8: obligación y consulta nueva para el reseteo

- **Login (L3)**: `esObligado2fa = isGlobalAdmin || membresiasActivas.some(m => m.clienteRequiere2fa)`,
  sobre `findActivasByUsuario` (membresía y cliente activos, `prisma-membresia.repository.ts:49-60`).
- **Reseteo por ADMINISTRADOR (S2)**: nuevo `IMembresiaRepository.findClientesDeTodasByUsuario(usuarioId): Promise<string[]>`,
  **sin ningún filtro** (`activo`, `deletedAt` ni estado del cliente). **También cuentan las
  membresías soft-deleted** (`deleted_at` no nulo): es más estricto que P3, que solo nombra
  inactivas y de clientes suspendidos, y es deliberado. Ante la duda, el ADMINISTRADOR no
  baja la seguridad y el reseteo queda en manos de ROOT. Regla:
  `findActivaByUsuarioYCliente(destino, actor.cliente_id) != null` **y** todos los ids iguales a
  `actor.cliente_id` **y** `!destino.isGlobalAdmin`. Cualquier incumplimiento →
  `MembresiaNoEncontradaError` (404, `usuarios.controller.ts:142-143`), el mismo que un id
  inexistente (S4). Un ADMINISTRADOR puede resetearse a sí mismo si cumple la regla.

### ADR-9: política por cliente y rutas de reseteo

- `PoliticaTfaController` en `clientes/interface/controllers/politica-tfa.controller.ts`, ruta
  `/politica-2fa`: `GET` y `PUT {requiere2fa: boolean}`, ambos con `AdminClienteGuard` (molde
  `HorarioLaboralController`). `ConfigurarPoliticaTfaUseCase` usa `fijarRequiere2fa`. No revoca
  sesiones (C4) ni borra 2FA al desactivar (C5).
- `DELETE /usuarios/:id/2fa` en `UsuariosController`. ROOT puede resetear a cualquier usuario,
  incluido otro ROOT, por id (S1); la UI solo lista usuarios del tenant, así que el camino
  ROOT→ROOT sin UI es el script o la API.

### ADR-10: script de operador para el ROOT

- `backend/scripts/resetear-2fa-root.ts` (molde `reset-password.ts`): lee `RESET_EMAIL`, carga
  `.env` con `process.loadEnvFile()`, exige que el usuario exista **y** sea `isGlobalAdmin`
  (exit 1 sin tocar nada si no, S6), aplica los efectos de S3 en una transacción e imprime
  solo `OK`. Nunca imprime secretos ni códigos (S7).
- **Sin `.ps1`**: se invoca con `corepack pnpm exec ts-node scripts/resetear-2fa-root.ts`, como
  documenta el runbook. Si el dueño prefiere un envoltorio `.ps1`, debe agregarse a la tabla §2.2
  de `~/proyectos/CLAUDE.md` (este diseño no la edita).

### ADR-11: frontend

- **BFF**: rutas propias solo donde hay cookies: `login` (modificada), `2fa/verificar`,
  `login/continuar`, `login/seleccionar`. Helper `shared/auth/sesion-bff.ts`
  (`responderConSesion`, `ipDelNavegador`). Enrolamiento y autogestión van por el proxy genérico
  `[...path]` (precedente: `auth/forgot-password` y `auth/reset-password` no tienen ruta propia).
- **`apiFetch`** (`shared/api/client.ts:74`): el chequeo `path !== "auth/refresh"` pasa a un set
  `RUTAS_SIN_REFRESH` con las rutas del flujo de login. Hoy un 401 de `auth/login` dispara un
  refresh y, si hay `rt` viva, re-postea la contraseña: con el limitador contaría doble.
- **Autogestión**: errores de código responden **422**, no 401, para no disparar el refresh.
- **`use-login.ts`**: estado `paso: credenciales | codigo | enrolamiento | codigos | seleccion`,
  guarda `desafio`/`ticket` en memoria y **nunca** la contraseña (hoy `:88-99`).
- Componentes presentacionales en `features/auth/components/`: `DesafioTfaForm` (código o
  recuperación, "Recordar este dispositivo" oculto si `recordarDisponible === false`),
  `EnrolamientoTfa` (QR con `encode` de `uqr`, como `features/equipos/qr-equipo.ts:6`, y clave
  manual), `CodigosRecuperacion` (lista, copiar, casilla "Los guardé", Continuar).
- **Perfil**: `ConfigurarTfaDialog` junto a `CambiarPasswordDialog` en `dashboard-header.tsx:41`.
- **Administración**: `PoliticaTfaCard` en `usuarios-admin-view.tsx`; botón "Resetear 2FA" con
  confirmación en `editar-usuario-dialog.tsx`.
- **`middleware.ts`**: sin rutas públicas nuevas; todo ocurre dentro de `/login` y `/api` ya está
  excluido del matcher (`middleware.ts:151`).

---

## Data Flow

```
Navegador ─ /api/auth/login (BFF: ip←XFF derecha, td→body) ─ POST /auth/login
  LoginUseCase: reservar(pwd:email:ip) ─ verificar contraseña (DUMMY si bloqueado)
   ├ éxito: liberar(pwd) ─ membresías activas ─ esObligado2fa / estado TFA / dispositivo td
   │   ├ 2FA activo y td válido (no ROOT) ─────────────┐
   │   ├ 2FA activo ─ desafío VERIFICAR ─ {needs2fa}    │
   │   ├ obligado sin 2FA ─ desafío ENROLAR ─ {needsEnrolamiento2fa}
   │   └ sin 2FA ──────────────────────────────────────┤
   │                                ROOT/1 membresía → EmitirSesion → at/rt
   │                                >1 → desafío SELECCIONAR → {needsClienteSelection, ticket}
/api/auth/2fa/verificar ─ VerificarDesafio: CAS desafío ─ VerificadorCodigoTfa
   reservar(cod:usuario) ─ TOTP(descifrar, ±1, CAS ultimo_paso) | recuperación(argon2, CAS usado_at)
   ─ rota token → ticket ─ continuar (sesión | selector) [+ dispositivo si recordar y no ROOT → cookie td]
enrolamiento/iniciar (pendiente cifrado) ─ confirmar (código del pendiente → activo + 10 códigos + ticket)
   ─ "Los guardé" ─ /api/auth/login/continuar ─ sesión | selector ─ /api/auth/login/seleccionar
Cambio de contraseña (3 vías + script) ─ revocar dispositivos (propaga) ─ save ─ revocar refresh (traga)
```

---

## Interfaces / Contracts

```ts
// auth/domain/ports
export interface ITotpService {
  generarSecreto(): string;                                   // base32, 20 bytes
  uri(secreto: string, email: string): string;
  verificar(secreto: string, codigo: string, ahora: Date): number | null; // paso aceptado
}
export interface ReservaIntento { clave: string; ventanaInicio: Date }
export interface ILimitadorIntentos {
  reservar(clave: string): Promise<ReservaIntento | null>;    // null = bloqueado, no incrementa
  liberar(clave: string): Promise<void>;                      // éxito: DELETE
  devolver(reserva: ReservaIntento): Promise<void>;           // ni éxito ni fallo: resta 1 en esa ventana
}
export interface IDispositivoConfiableRepository {
  crear(usuarioId: string, tokenHash: string, expiraAt: Date): Promise<void>;
  esValido(usuarioId: string, tokenHash: string, ahora: Date): Promise<boolean>;
  revocarTodosDe(usuarioId: string): Promise<void>;           // lanza ante fallo: fail-closed
}
```

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /auth/login` | `email, password, clienteId?, dispositivoConfiable?` + cabecera `x-soporte-ip-navegador` | `{accessToken, refreshToken}` · `{needsClienteSelection, membresias, ticket}` · `{needs2fa, desafio, recordarDisponible}` · `{needsEnrolamiento2fa, desafio}` · 401 |
| `POST /auth/2fa/verificar` | `desafio, codigo, recordar?` | sesión o selector (+`ticket`), `dispositivoConfiable?` · 401 |
| `POST /auth/2fa/enrolamiento/iniciar` | `desafio` | `{otpauthUri, claveManual}` · 401 |
| `POST /auth/2fa/enrolamiento/confirmar` | `desafio, codigo` | `{codigosRecuperacion[10], ticket}` · 401 |
| `POST /auth/login/continuar` | `ticket` | sesión o selector · 401 |
| `POST /auth/login/seleccionar` | `ticket, clienteId` | sesión · 401 |
| `GET /auth/2fa` | — | `{activo, obligado, codigosRestantes, pendiente}` |
| `POST /auth/2fa/secreto/iniciar` | `codigo?` (obligatorio si activo, T10) | `{otpauthUri, claveManual}` · 422 |
| `POST /auth/2fa/secreto/confirmar` | `codigo` | `{codigosRecuperacion?}` (solo en la primera activación) · 422 |
| `POST /auth/2fa/codigos` | `codigo` | `{codigosRecuperacion[10]}` · 422 |
| `POST /auth/2fa/desactivar` | `codigo` | 204 · 422 (código) · 409 (`Tfa2faObligatorioError`) |
| `GET/PUT /politica-2fa` | `requiere2fa` | `{requiere2fa}` · 403 |
| `DELETE /usuarios/:id/2fa` | — | 204 · 403 · 404 |

---

## Invariantes que DEBEN tener test

| Si esto falla | Defecto | Test |
|---|---|---|
| Se acepta un código de un paso ya usado | Replay (T2) | Integración: dos verificaciones concurrentes del mismo código → exactamente una acepta. Mutación: `<` → `<=` en el CAS pone el test en rojo |
| La reserva no es atómica | Más de 5 contraseñas por ventana | Integración: 10 reservas concurrentes con la clave en 0 → 5 `true` |
| Un bloqueo cuenta como fallo | I7 | Integración: reservar bloqueado deja `fallos = 5` |
| Un secreto indescifrable cuenta o borra el contador | T12, I1 | Integración: 3 fallos, luego un intento con secreto indescifrable → `fallos = 3`. Mutación: `devolver` → `liberar` deja 0 y el test falla |
| `devolver` resta en una ventana nueva | Cupo extra | Integración: reserva vieja + ventana renovada → `devolver` no cambia nada |
| La confirmación de un pendiente acepta un código de recuperación o del secreto activo | T4, T10 | Unit de `ConfirmadorSecretoPendiente` |
| El secreto nuevo hereda `ultimo_paso` o no lo fija | Replay del código de confirmación (T2) | Integración: confirmar y repetir el mismo código en el login → rechazo |
| El BFF reenvía `ip:puerto` | Todo cae en `sin-ip` | Unit de `ipDelNavegador` (BFF y backend) con IPv4 e IPv6, con y sin puerto |
| El seed acepta el secreto con `NODE_ENV` ausente o desconocido | Puerta trasera en el VPS | Unit del seed: sin `NODE_ENV`, `production`, `staging` → rechaza; `development`, `test` → activa |
| La revocación de dispositivos corre después del `save` | Contraseña nueva con dispositivo válido (D5, U1, O1) | Unit de los 3 use cases: el puerto lanza → `save` nunca llamado; en `ConfirmarReset`, tampoco `consumirSiVigente` |
| `requiere_2fa` entra en `toPersistence` | Un `save` viejo apaga la política | Integración: cargar cliente, fijar política, `save` → sigue `true` |
| El desafío ENROLAR sirve para `continuar` | Sesión sin 2FA (L5) | Unit y e2e |
| El ticket no rota al verificar | Desafío reutilizable (L2) | Integración: el string del desafío no sirve tras verificar |
| La cabecera de IP se honra desde un par no loopback | I4 | Unit de `ipDelNavegador` con socket `203.0.113.9` |
| Un secreto indescifrable lanza | 500 (T12) | E2e con AAD manipulado → 401 y log sin código |
| ROOT recibe dispositivo | D4 | Unit de `VerificarDesafio` con `recordar: true` |
| Mutación de `esObligado2fa` (`some` → `every`) | Usuario en dos clientes sin 2FA (L3) | Unit |

---

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | `TotpNativoService` con los vectores SHA-1 del RFC 6238 apéndice B (secreto `12345678901234567890`, T = 59, 1111111109, 1111111111, 1234567890, 2000000000, truncados a 6 dígitos), ±1, mal formados; base32; formato y normalización de recuperación; `esObligado2fa`; use cases con puertos mockeados (orden fail-closed, I5, L5, D4); `ipDelNavegador` | Vitest, sin Nest |
| Integración | M1 (CHECKs, defaults Prisma/DDL, cascada), CAS de `ultimo_paso`, de códigos y de desafío, reserva concurrente, `eliminarTodo` transaccional con fallo forzado, `findClientesDeTodasByUsuario`, rotación con destinos TOTP (K1-K3), script de ROOT | Postgres real, `usarLockMasterTest()` en todo spec que trunca `soporte_master_test` |
| E2E | Login completo (sin 2FA, con 2FA y 1 o 2 clientes, forzado, dispositivo, bloqueo), autogestión, política, reseteo ROOT/ADMIN/TECNICO | Guards reales; `auth.e2e.spec.ts` actualiza sus casos ROOT |
| Frontend | BFF (cookie `td`, IP derecha de XFF, cookies de sesión), `apiFetch` sin refresh en el flujo de login, máquina de `use-login`, componentes | Vitest + Testing Library + msw; los `.test` existentes se amplían |

**Secreto conocido (L10)**: `backend/src/auth/test-helpers/tfa-de-test.ts` exporta
`SECRETO_TOTP_DE_TEST` (base32 del secreto del RFC), `activarTfaDeTest(prisma, usuarioId)` (cifra
con el `EMAIL_CRYPTO_KEY` de `test/entorno-test.setup.ts`) y `codigoDeTest(usuarioId)`, que usa el
`TotpNativoService` real y avanza al paso +1 si el actual ya se usó (el antireplay permite dos
logins por paso; para más, `reiniciarAntireplay`). Los e2e de usuarios normales no cambian:
sus clientes nacen con `requiere_2fa = false`.

**Seed (L10)**: `root-bootstrap.seed.ts` lee `ROOT_ADMIN_TOTP_SECRET` opcional. **Lista positiva,
fail-closed**: activa el 2FA del ROOT con ese secreto solo si `NODE_ENV` vale exactamente
`development` o `test`. Con `NODE_ENV` ausente (el VPS: el backend nunca lo lee y ni
`deploy.ps1` ni el runbook lo fijan), `production` o cualquier otro valor, y la variable
presente, el seed **termina con error** sin crear ni tocar el ROOT: un secreto conocido en el VPS
sería una puerta trasera. Un guard `!== 'production'` fallaría abierto y se rechazó. Test unitario
de la tabla de valores (ver invariantes). `.env.example` y el README documentan el valor de
desarrollo. Sin la variable, el ROOT pasa por la configuración forzada.

**Higiene de tests del limitador**: `auth_intentos_fallidos` no cae con el `TRUNCATE … CASCADE` de
los specs, y hoy 24 specs llaman a `/auth/login` (algunos con contraseña incorrecta y email fijo),
todos sin cabecera de IP, es decir bajo `sin-ip`. Dos medidas, ambas en la **WU-3**, que es la
que introduce el limitador:

1. `test/barrido-huerfanas.global-setup.mjs` (el `globalSetup` ya existente) hace
   `TRUNCATE auth_intentos_fallidos` en `soporte_master_test` una vez por corrida: las corridas
   anteriores no contaminan a la siguiente.
2. Dentro de una corrida, los specs que prueban el limitador usan emails aleatorios
   (`randomBytes`) y su propia `x-soporte-ip-navegador`; los demás conservan sus emails fijos,
   que solo fallan a propósito en uno o dos casos por archivo, lejos de 5.

---

## Threat Matrix

N/A: el cambio no toca rutas de clasificación de archivos, selección de repositorio Git, estado de
commit o push ni comandos de PR. Los riesgos de seguridad de la feature (IP, replay, fail-closed)
están en los ADR y en la tabla de invariantes.

---

## Migration / Rollout

| # | WU | Contenido | Rollback |
|---|---|---|---|
| M1 `prisma_master/migrations/20261008120000_verificacion_dos_pasos` | 1 | Las 5 tablas de ADR-3, CHECKs, índices y `clientes.requiere_2fa boolean NOT NULL DEFAULT false` | `rollback.sql`: `DROP TABLE` de las 5 y `ALTER TABLE clientes DROP COLUMN requiere_2fa` |

- **Sin backfill**: todos los clientes quedan sin política (C2) y ningún usuario tiene 2FA.
- **Primer login de cada ROOT tras el deploy**: recibe `needsEnrolamiento2fa`; escanea el QR,
  confirma un código, guarda los 10 códigos y recién entonces entra. Hay que tener el celular a
  mano en la ventana del deploy.
- **Antes del deploy**: comprobar `EMAIL_CRYPTO_KEY` válida en `backend/.env` (sin ella nadie
  obligado puede enrolarse). El proxy de ARR ya está verificado: `<proxy enabled="true">` por
  defecto, con `X-Forwarded-For` en formato `ip:puerto`.
- **Después del deploy**: smoke de login de un usuario sin 2FA (contrato compatible) y del ROOT
  completo. **Verificar la IP**: dos contraseñas incorrectas desde fuera con un email de prueba y
  `SELECT clave FROM auth_intentos_fallidos` en master: la clave tiene que terminar en una IP
  pública, nunca en `sin-ip` ni en `127.0.0.1`. Después, borrar esa fila. El runbook agrega este
  paso.
- **Exposición**: se despliega con la cadena completa. Entre la WU-5c y la WU-11 el backend ya
  exige el desafío y el frontend viejo no sabe presentarlo.
- **Runbook**: §5 (rotación) menciona los secretos TOTP; sección nueva para
  `resetear-2fa-root.ts`.
- **Revert total**: `git revert` de la cadena + `rollback.sql`: el login vuelve a contraseña sola.

---

## Delivery slices (`auto-chain` sobre `feat/verificacion-dos-pasos`, un PR por WU)

| WU | Alcance (código + tests juntos) | Depende de | Líneas |
|---|---|---|---|
| 1 | M1 + `rollback.sql`, `schema.prisma`, spec de integración de la migración (CHECKs, defaults, cascada) | — | ~260 |
| 2 | `ITotpService` + `TotpNativoService` (vectores RFC), base32, `formato-codigo.ts`, `tfa.constants.ts`, `esObligado2fa` | — | ~330 |
| 3 | `ILimitadorIntentos` (`reservar`/`liberar`/`devolver`) + adaptador SQL + purga, `ipDelNavegador` del backend (IPv4/IPv6, loopback), aplicación en `LoginUseCase` (I1-I5, I8), `TRUNCATE` en el `globalSetup` | 1 | ~390 |
| 4a | `ITfaRepository` Prisma: CAS de `ultimo_paso`, promoción del pendiente, consumo de códigos, `eliminarTodo` transaccional, con sus specs de concurrencia | 1 | ~340 |
| 4b | `SecretoTotpCifrado` (AAD, T12), `VerificadorCodigoTfa`, `ConfirmadorSecretoPendiente` (solo TOTP del pendiente), con unit tests y uso de `devolver` | 2, 3, 4a | ~330 |
| 4c | Autogestión: `GET /auth/2fa`, secreto iniciar/confirmar (T4, T7, T10), regenerar (T9), `TfaCuentaController` | 4b | ~380 |
| 5a | `IDesafioLoginRepository` Prisma (CAS y rotación del token), `EmitirSesionService` (extraído sin cambio de conducta), use cases verificar y enrolamiento iniciar/confirmar | 4b | ~360 |
| 5b | Use cases continuar y seleccionar, `TfaLoginController` con las 5 rutas públicas, todavía sin enganchar al login | 5a | ~280 |
| 5c | `LoginUseCase` con la decisión, `MembresiaResuelta.clienteRequiere2fa`, respuestas nuevas, helper `tfa-de-test.ts`, casos ROOT de `auth.e2e.spec.ts`, e2e del flujo | 5b | ~380 |
| 6a | Dispositivo confiable: repo, emisión (no ROOT) y uso en el login, desactivación propia (T8, D6) | 5c | ~330 |
| 6b | Fail-closed en `CambiarPassword`, `ResetearPasswordUsuarioTenant`, `ConfirmarResetPassword` y `reset-password.ts` | 6a | ~300 |
| 7 | Política: `fijarRequiere2fa`/`obtenerRequiere2fa`, mapper, use case, `PoliticaTfaController` (C1-C5) | 1 | ~280 |
| 8 | Reseteo: `findClientesDeTodasByUsuario`, `ResetearTfaUsuarioUseCase`, `DELETE /usuarios/:id/2fa`, `resetear-2fa-root.ts` y su spec (S1-S8) | 6a | ~390 |
| 9 | Rotación con destinos TOTP, sus 3 specs, cabecera del `.ps1`, runbook (rotación y verificación de IP); seed `ROOT_ADMIN_TOTP_SECRET` con lista positiva y su test + `.env.example` + README | 4b | ~390 |
| 10 | BFF: `cookies.ts` (`td`), `sesion-bff.ts` (`ipDelNavegador` que quita el puerto, tests IPv4/IPv6), rutas `login`, `2fa/verificar`, `login/continuar`, `login/seleccionar`, `RUTAS_SIN_REFRESH` | 5c, 6a | ~395 |
| 11a | `use-login.ts` (máquina de estados), `DesafioTfaForm`, selector con ticket, página de login | 10 | ~380 |
| 11b | `EnrolamientoTfa` (QR), `CodigosRecuperacion`, enrolamiento forzado | 11a | ~360 |
| 12 | `ConfigurarTfaDialog` (activar, cambiar celular, regenerar, desactivar) | 4c, 11b | ~390 |
| 13 | `PoliticaTfaCard`, botón de reseteo, viñeta del roadmap "Cumplida" o "Desviación" | 7, 8 | ~280 |

- **Total**: ~6.250 líneas en 19 WU. Supera la estimación de la propuesta (3.0-3.4k): el
  verificador común, el desafío con rotación, el fail-closed en cuatro caminos, los tests de
  concurrencia y las particiones nuevas no estaban contados. **El orquestador aceptó el desvío**
  y lo anota en la propuesta. Ninguna WU pasa de 400; las más cercanas (3, 9, 10) llevan su
  código y sus tests juntos y no tienen un corte más limpio.
- Orden: 1, 2, 3, 4a, 4b, 4c, 5a, 5b, 5c, 6a, 6b, 7, 8, 9, 10, 11a, 11b, 12, 13. Cada WU compila y
  queda en verde sola; se revierte con `git revert` en orden inverso. La exposición de la cadena
  completa aplica desde la WU-5c.
- **Deuda de Ayuda** (suspendida desde el 2026-09-07): desafío y enrolamiento (11a, 11b), ajustes
  de 2FA en el perfil (12), política y reseteo (13). Se anota en el commit y en el PR.

---

## Open Questions

- [x] **Topología de IIS**: verificada por el orquestador (solo lectura). ARR con `<proxy enabled="true">`
  por defecto (XFF `ip:puerto`), sitio reescrito a `localhost:3100`, backend en
  `localhost:3101`. Queda la verificación posterior al deploy (Migration / Rollout).
- [ ] **ROOT→ROOT sin UI**: S1 se cumple por API y por el script; si se quiere un botón para
  resetear a otro ROOT, falta una vista de ROOTs que hoy no existe.
