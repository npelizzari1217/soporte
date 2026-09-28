# Design: Reseteo de contraseña por olvido (self-service)

## Technical Approach

Replica el molde CSAT (token opaco, solo SHA-256 en MASTER, CAS de uso único, envío directo
por `EMAIL_SENDER`) dentro de `auth/`, con tres piezas nuevas que el molde no tenía:

1. **La solicitud responde antes de hacer cualquier trabajo que dependa de la rama** (ADR-2).
   El controller encola la tarea y devuelve 204. La búsqueda del email, el conteo de membresías,
   la emisión del token y el SMTP corren después, fuera del camino de la respuesta.
2. **Un adaptador que bindea un `TenantContext` mínimo** para mandar el mail del tenant de la
   única membresía activa (ADR-4).
3. **Un módulo Nest propio, `RecuperacionPasswordModule`**, con su controller bajo el prefijo
   `auth` (ADR-1). No entra en `AuthController`: ver el motivo en ADR-1.

Todo lo reutilizable ya existe y **no se toca**:

- `UsuarioEntity.hashPassword()` (`usuario.entity.ts:191`).
- `IMembresiaRepository.findActivasByUsuario()`, la misma consulta que usa el login
  (`login.use-case.ts:124`).
- `IRefreshTokenRepository.revokeAllByUsuarioId()` (`i-refresh-token.repository.ts:32`).
- `TenantAwareEmailSender` (`tenant-aware-email-sender.ts:72-102`).

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué |
|---|---|---|
| `PasswordResetTokenEntity` | domain | Estado y reglas de vigencia (`isExpired/isUsed/isRevoked`). Molde de `encuesta-token.entity.ts` |
| `IPasswordResetTokenRepository`, `ICorreoDeCliente` | domain (puertos) | Contratos que consume `application/`, sin Prisma ni Nest |
| `ITareasSegundoPlano` | shared/domain (puerto) | Mecanismo transversal, sin semántica de auth |
| `templateResetPassword`, `templateResetConfirmado` | domain (`auth/domain/templates/`) | Funciones puras. Precedente: `csat/domain/templates/encuesta-email.template.ts` |
| `escaparHtml` | shared/domain | Hoy es privada en `notificaciones/domain/templates/email-templates.ts:37`. Pasa a tener dos consumidores de features distintas |
| `SolicitarResetPasswordUseCase`, `ConfirmarResetPasswordUseCase` | application | Clases planas, construidas con `useFactory`. `Confirmar` devuelve `Result<void, DomainError>` |
| `PrismaPasswordResetTokenRepository` + mapper | infrastructure | Único lugar que toca Prisma |
| `CorreoDeClienteAdapter` | infrastructure | Usa `PrismaService.getTenantClient` y `TenantContext.run`; ninguno de los dos puede vivir en `application/` |
| `TareasSegundoPlano` | shared/infrastructure | Implementación con `setImmediate` y un `Set` de pendientes |
| `RecuperacionPasswordThrottlerGuard`, trackers | infrastructure/guards | Borde HTTP |
| `RecuperacionPasswordController` + DTOs | interface | Traduce HTTP ↔ casos de uso. Cero lógica |

### Autorización: los dos lugares donde vive (`rules.design`)

Las dos rutas son **públicas**: no llevan `JwtAuthGuard`.

1. **Borde.** Llevan `@UseGuards(RecuperacionPasswordThrottlerGuard)` y un `@Throttle` por método,
   con su propio `getTracker`.
2. **Inline.** La posesión del token **es** la autorización.
   - `ConfirmarResetPasswordUseCase` obtiene `usuarioId` y `clienteId` **únicamente de la fila
     del token**. El DTO no declara ninguno de los dos, y `whitelist: true` (`app.module.ts:71`)
     los descartaría si llegaran.
   - `SolicitarResetPasswordUseCase` obtiene `clienteId` **únicamente** de
     `findActivasByUsuario`, nunca de la request.

---

## Architecture Decisions

### ADR-1: módulo propio y rutas públicas en `/auth`

**Choice**: `RecuperacionPasswordModule` (`backend/src/auth/recuperacion-password.module.ts`).

- **Imports**: `AuthModule` y `NotificacionesModule`.
- **Registro**: en `app.module.ts`, **recién en WU-11**, el work unit donde el flujo completo
  existe por primera vez (ver "Migration / Rollout").
  - Hasta entonces el módulo existe y se prueba, pero la app real no lo monta: ninguna ruta
    queda expuesta en `main`.
  - Los e2e de WU-7 y WU-8 arman su propio `TestHarnessModule`, que importa
    `RecuperacionPasswordModule` directamente. Es el mismo patrón que `csat.e2e.spec.ts:91`.
  - No hay feature flag.
- **Controller**: `RecuperacionPasswordController` con `@Controller('auth')`.
- **Rutas**: `POST /auth/forgot-password` y `POST /auth/reset-password`, que son los nombres
  que fija la spec.

| Alternativa | Por qué no |
|---|---|
| Rutas en `AuthController` (lo que dice el proposal) | `EMAIL_SENDER` lo provee `NotificacionesModule` (`notificaciones.module.ts:127`). Ese módulo importa `TicketsModule` (`:62`), y `TicketsModule` importa `AuthModule` (`tickets.module.ts:138`): importarlo desde `AuthModule` cierra un ciclo que exige `forwardRef` |
| `forwardRef` | Hace que el orden de inicialización sea frágil, y solo para evitar un archivo |

**Precedente**: `CsatModule` importa `AuthModule` y `NotificacionesModule` por el mismo motivo
(`csat.module.ts:80-84`).

**Cambio en `AuthModule`**: se exporta `REFRESH_TOKEN_REPOSITORY`. Es una línea, y hoy no se
exporta (`auth.module.ts:361-388`).

### ADR-2: defensa de timing — responder primero, trabajar después

**Choice**: el handler de `forgot-password` hace exactamente esto, en toda rama:

```ts
this.tareas.lanzar('reset-password.solicitud', () => this.solicitar.ejecutar(dto.email));
```

Después devuelve **204 sin cuerpo**. `lanzar` difiere el arranque con `setImmediate`: ninguna
consulta dependiente de la rama arranca antes de que el handler retorne. Antes de la respuesta
solo corren el throttler, el `ValidationPipe` y la llamada a `lanzar`, y los tres son idénticos
en todas las ramas.

| Opción | A favor | En contra | Decisión |
|---|---|---|---|
| **Asíncrono tras responder** | El tiempo de respuesta no depende de la rama **por construcción**. Aísla también la latencia SMTP, que ninguna forma constante puede igualar: un `sendMail` real tarda cientos de ms, o hasta el timeout de nodemailer | Los errores no llegan a la respuesta. Los tests necesitan esperar lo pendiente | **Elegida** |
| Trabajo síncrono de forma constante | Sin infraestructura nueva | Para igualar el INSERT del token con un email inexistente hay que escribir filas falsas o simular escrituras. Y el SMTP seguiría filtrando | Rechazada |

**Errores**: `TareasSegundoPlano` envuelve cada tarea en `catch` y registra
`logger.error('SEGUNDO_PLANO_ERROR | tarea=<etiqueta> | error=<message>')`.
`SolicitarResetPasswordUseCase` además atrapa internamente y no lanza nunca.

**Tests**:

- Existe `esperarPendientes()`, que resuelve cuando el `Set` queda vacío.
- `onApplicationShutdown` la llama, para no cortar envíos en curso al apagar.
- Los e2e hacen `await app.get(TAREAS_SEGUNDO_PLANO).esperarPendientes()`, sin `sleep`.

**`DUMMY_HASH`** (`login.use-case.ts:38`) **no se reutiliza**, porque en la solicitud no hay
contraseña que verificar. La regla 1 del proposal ("defensa de timing") se cumple por esta vía.

### ADR-3: valores exactos

| Parámetro | Valor | Motivo |
|---|---|---|
| TTL del token | **60 min** | Recomendación de la exploración. Un token que cambia una credencial no puede durar como el de CSAT (30 días, `emitir-encuesta.use-case.ts:38`). Si vence, se pide otro |
| Límite de `forgot-password` | **3 cada 15 min por email** (`trim().toLowerCase()`) | El recurso que se abusa es el buzón de un tercero. Tres alcanzan para reintentos legítimos |
| Límite de `reset-password` | **5 cada 15 min por token** | El frontend ya valida largo e igualdad antes de enviar; cinco cubren errores de red |
| Ruta backend (solicitud) | `POST /auth/forgot-password` | Fijada por la spec |
| Ruta backend (confirmación) | `POST /auth/reset-password` | Fijada por la spec |
| Ruta frontend (solicitud) | `/olvide-password` | En `(auth)` |
| Ruta frontend (confirmación) | `/restablecer-password#token=<hex>` | En `(auth)` |
| Respuesta de la solicitud | 204 | Siempre |
| Respuesta de la confirmación | 204 si tiene éxito | Toda causa de token inválido, **y** la cuenta no disponible, responden **400** con el mismo mensaje. No es 401, porque `apiFetch` dispararía el refresh (`client.ts:74`). No es 404 como CSAT, porque aquí el token viaja en el body y no es un recurso de la ruta |

**El tracker es solo el email, o solo el token, sin `x-forwarded-for`.** `CsatThrottlerGuard` usa
`${xff}:${token}` (`csat-throttler.guard.ts:45`). Aquí eso sería un bypass: basta con rotar el
`xff`, que es falsificable, para obtener un cupo nuevo sobre el mismo buzón.

**Caveat del BFF**: el backend ve una sola IP para todos (`csat-throttler.guard.ts:5-11`). Por
eso no hay límite por IP: sería un único cupo global.

**Wiring del throttler**:

- `ThrottlerModule` es `@Global()` (`@nestjs/throttler@6.5.0`, `throttler.module.js:61`) y
  `CsatModule` ya llama `forRoot` (`csat.module.ts:85`). Un segundo `forRoot` registraría dos
  `THROTTLER_OPTIONS` globales. No se verificó cómo resuelve Nest ese caso; se evita por
  construcción.
- `RecuperacionPasswordThrottlerGuard` es una subclase vacía de `ThrottlerGuard`, construida por
  `useFactory` con opciones propias, una instancia propia de `ThrottlerStorageService` y el
  `Reflector`.
- Los límites y trackers van por método: `@Throttle({ default: { limit, ttl, getTracker } })`.
  El guard lee `THROTTLER_TRACKER` por ruta (`throttler.guard.js:80`).

Hay un beneficio adicional: los harness e2e que importan `AuthModule` sin `CsatModule` siguen
compilando.

### ADR-4: resolución de tenant y cómo se sabe si hubo mail

`ICorreoDeCliente` tiene dos métodos:

- **`estado(clienteId)`** devuelve `'LISTO' | 'SIN_CORREO' | 'CLIENTE_NO_DISPONIBLE'`.
  - Primero hace `IClienteRepository.findById`: si el cliente no existe, está inactivo o
    `isDeleted()`, devuelve `CLIENTE_NO_DISPONIBLE`.
  - Después hace `IClienteEmailConfigRepository.findState(clienteId).configurado`
    (`i-cliente-email-config.repository.ts:84`). Es barato y **no descifra**.
- **`enviar(clienteId, msg)`** bindea el contexto con
  `tenantContext.run({ prismaClient: getTenantClient(dbName), dbName, clienteId }, () => emailSender.send(msg))`.
  Es el molde de `sla-sweep.scheduler.ts:45-49`.

El caso de uso **no emite token** si `estado ≠ LISTO`.

**Qué sabe el caso de uso, solo para el log**:

- Sabe "despachado a un cliente con correo configurado".
- **No** sabe si el mail se entregó. Las degradaciones posteriores las registra el propio sender
  con literales distintos:
  - `EMAIL_CRYPTO_KEY_AUSENTE`, en `tenant-aware-email-sender.ts:87-89`;
  - `EMAIL_SMTP_ERROR`, en `smtp-email-sender.ts:60`.

| Alternativa | Por qué no |
|---|---|
| Cambiar `IEmailSender.send` para que devuelva un resultado | Es un puerto compartido: cuatro listeners y CSAT lo implementan o lo mockean. Tocarlo ensancha el radio del cambio sin un consumidor que lo necesite para decidir, porque la respuesta no depende de eso |
| Precheck con `findForSend` | Descifra la contraseña SMTP dos veces por solicitud |

**Líneas de log**: `RESET_PASSWORD_SOLICITUD | resultado=<CUENTA_INEXISTENTE|CUENTA_NO_DISPONIBLE|MEMBRESIAS_0|MEMBRESIAS_N|CLIENTE_SIN_CORREO|MAIL_DESPACHADO>`,
con `usuarioId` y `clienteId` cuando existen.

**Qué nunca se loguea**: el email, el token ni el plaintext.

`CLIENTE_EMAIL_CONFIG_REPOSITORY` se provee localmente en el módulo, igual que en
`notificaciones.module.ts:65-68`.

### ADR-5: confirmación — CAS primero, `save()` después, sin transacción

**Orden** en `ConfirmarResetPasswordUseCase`:

1. `findByHash(sha256(token))`. Si no hay fila, o el token está usado, revocado o vencido:
   `ResetLinkInvalidoError`.
2. `findById(token.usuarioId)`. Si no existe, `!activo` o `isDeleted()`: el **mismo** error, sin
   consumir el token.
3. `await usuario.hashPassword(passwordNueva, hashProvider)`, en memoria.
4. `consumirSiVigente(token.id)`: una sola sentencia,
   `UPDATE … SET used_at=now() WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`.
   Si devuelve `false`, el mismo error.
5. `usuarioRepo.save(usuario)`: el punto de no retorno.
6. `try { revokeAllByUsuarioId } catch { logger.error(usuarioId + message) }`. No propaga
   (`cambiar-password.use-case.ts:77-84`).
7. `tareas.lanzar('reset-password.confirmacion', …)`: mail de confirmación por `token.clienteId`,
   con la misma pareja `estado` → `enviar`.

**Sin carrera**: solo el ganador del CAS llega a escribir `passwordHash`. Dos confirmaciones
concurrentes, o una confirmación contra una emisión nueva que revoca (`revokedAt IS NULL` en la
condición), se resuelven en la base.

**Fallo aceptado**: si el CAS gana y después `save()` falla, el token queda quemado y la
contraseña sin cambiar. Es un fallo cerrado: el usuario pide otro link.

**Rechazada — la transacción MASTER**: no existe un runner transaccional para MASTER
(`tenant-transaction-runner.ts` es solo para tenant), y crearlo es infraestructura nueva sin un
beneficio de corrección sobre este orden.

**Hash antes del CAS**: minimiza la ventana entre el CAS y el `save()`.

### ADR-6: modelo y migración

**Migración**: `backend/prisma_master/migrations/20260928120000_add_password_reset_tokens/`.
Sigue la convención `YYYYMMDDHHMMSS_snake`; la última es `20260923150000_…`.

**Tabla `password_reset_tokens`**, modelo `PasswordResetToken`:

| Columna | Tipo / restricción |
|---|---|
| `id` | UUID |
| `usuario_id` | UUID, **FK a `usuarios` con `ON DELETE CASCADE`**. Un token no tiene valor sin su usuario, y los TRUNCATE de los e2e existentes (`auth.e2e.spec.ts:207`) lo alcanzan por CASCADE |
| `cliente_id` | UUID, **FK a `clientes`**. Es el tenant que emitió el token; la confirmación lo reutiliza (spec, "mismo tenant que emitió el token") |
| `token_hash` | TEXT **UNIQUE** |
| `expires_at` | `timestamptz` |
| `used_at` | `timestamptz`, nulable |
| `revoked_at` | `timestamptz`, nulable |
| `created_at`, `updated_at`, `deleted_at` | Por paridad con `BaseEntity` |

**Índice**: `(usuario_id)`, para `revocarVigentesDeUsuario`.

**Back-relations**: en `Usuario` y en `Cliente`.

**Limpieza: no se hace, por decisión.** Ni `refresh_tokens` ni `encuesta_tokens` tienen barrido
(no hay `deleteMany` por `expiresAt` en `backend/src`). El volumen está acotado por el throttle de
3 cada 15 minutos por email. Queda como seguimiento.

### ADR-7: plantillas

**Archivo**: `backend/src/auth/domain/templates/reset-password-email.template.ts`, con dos
funciones puras:

- `templateResetPassword({ nombre, token, appBaseUrl, vigenciaMinutos })`. El link es
  `${appBaseUrl}/restablecer-password#token=${token}`.
- `templateResetConfirmado({ nombre })`.

**Escapado**: todo valor interpolado en el HTML pasa por `escaparHtml`, movida a
`backend/src/shared/domain/escapar-html.ts`. `email-templates.ts` la importa desde ahí.

**`appBaseUrl`**:

- Llega al caso de uso por constructor, desde `entorno.APP_BASE_URL`, en el factory del módulo.
  Es la misma variable que exige `validar-entorno.ts:15,114`.
- `application/` no lee `process.env`.
- Nada lee el header `Host`.

**El token en el fragmento (`#`)**:

- El fragmento no viaja al servidor. El token crudo no aparece en los access logs del frontend
  ni del proxy, y el `Referer` lo excluye.
- El token se consume solo en el POST, nunca en el GET: un escáner de links que abra la URL no
  lo quema.

### ADR-8: frontend

**Rutas**:

- `/olvide-password` y `/restablecer-password`, en `frontend/src/app/(auth)/`.
- Se suman a `RUTAS_PUBLICAS` en `middleware.ts:35`. Sin eso, el middleware las redirige a
  `/login` (`:79-85`).

**BFF: no hay rutas dedicadas.** El proxy genérico `app/api/[...path]/route.ts` ya reenvía un POST
sin sesión, tal cual, hacia `${BACKEND_URL}/auth/forgot-password`.

- Las rutas dedicadas de `api/auth/*` existen porque **manipulan cookies**
  (`change-password/route.ts:57-61`). Estas dos no tocan cookies.
- Si hay sesión, el proxy agrega `Authorization`, que el backend ignora en rutas sin
  `JwtAuthGuard`.
- Es un desvío del proposal. Queda anotado en Open Questions.

**Schemas** (`features/auth/schemas.ts`):

- `solicitarResetSchema { email }` espeja `@IsEmail`.
- `restablecerPasswordSchema { passwordNueva: min(8), repetirPassword }`, con `.refine` de
  igualdad, copia textual de `cambiarPasswordSchema` (`:25-34`).
- **Fuente única**: los DTO del backend. El JSDoc lo dice.

**Hooks** (container):

- `hooks/use-solicitar-reset.ts` y `hooks/use-restablecer-password.ts`, con `apiFetch` y
  `useMutation`.
- **Mensajes**:
  - La solicitud muestra **siempre el mismo mensaje** tras el 204.
  - 429: aviso de límite.
  - 0 o 5xx: infraestructura (criterio de `mensajeDeErrorDeLogin`, `use-login.ts:74-81`).
  - 400 en la confirmación: "link no válido o vencido", con un enlace a `/olvide-password`.

**Componentes** (presentacionales): `SolicitarResetForm.tsx` y `RestablecerPasswordForm.tsx`.

**Página de confirmación**:

- Lee `window.location.hash` en un `useEffect`.
- Hace `history.replaceState` para sacar el token de la barra de direcciones.
- Sin token, muestra el mensaje de link inválido.

**`LoginForm.tsx`**: un `<Link href="/olvide-password">¿Olvidaste tu contraseña?</Link>` estático.

**Ayuda**: `backend/ayuda/mi-cuenta-contrasena.md:31-35` se reescribe en el último work unit del
frontend, que es cuando el flujo completo existe. Describe:

- el link del login;
- el vencimiento de 60 minutos;
- el cierre de sesiones;
- que, si el mail no llega, el administrador puede restablecerla.

---

## Data Flow

```
POST /auth/forgot-password {email}
  ThrottlerGuard (email) → ValidationPipe → tareas.lanzar(...) → 204   ← idéntico en toda rama
  └─(setImmediate)─ SolicitarResetPasswordUseCase
       findByEmail ─ null/inactivo ──→ log, fin
       findActivasByUsuario ─ ≠1 ────→ log MEMBRESIAS_0|N, fin
       correo.estado(clienteId) ─ ≠LISTO → log, fin (sin token)
       revocarVigentesDeUsuario → randomBytes(32) → save(sha256, +60min, clienteId)
       correo.enviar(clienteId, link APP_BASE_URL#token) → TenantContext.run → EMAIL_SENDER

POST /auth/reset-password {token, passwordNueva(min 8)}
  ThrottlerGuard (token) → ValidationPipe → ConfirmarResetPasswordUseCase
       findByHash → vigente? → findById → disponible? → hashPassword (memoria)
       consumirSiVigente (CAS) ─ false → 400 genérico
       save(usuario) → try revokeAll catch log → lanzar(mail confirmación) → 204
```

---

## File Changes

| Archivo | Acción | WU |
|---|---|---|
| `backend/prisma_master/schema.prisma` | Modify: modelo, back-relations en `Usuario` y `Cliente` | 1 |
| `backend/prisma_master/migrations/20260928120000_add_password_reset_tokens/migration.sql` | Create | 1 |
| `backend/src/auth/domain/entities/password-reset-token.entity.ts` + `.spec.ts` | Create | 1 |
| `backend/src/auth/domain/ports/i-password-reset-token.repository.ts` | Create | 2 |
| `backend/src/auth/infrastructure/persistence/prisma/password-reset-token.mapper.ts` | Create | 2 |
| `backend/src/auth/infrastructure/persistence/prisma/prisma-password-reset-token.repository.ts` + `.integration.spec.ts` | Create | 2 |
| `backend/src/shared/domain/escapar-html.ts` | Create; `notificaciones/domain/templates/email-templates.ts` Modify (importa) | 3 |
| `backend/src/auth/domain/templates/reset-password-email.template.ts` + `.spec.ts` | Create | 3 |
| `backend/src/auth/domain/ports/i-correo-de-cliente.port.ts` | Create | 3 |
| `backend/src/auth/infrastructure/email/correo-de-cliente.adapter.ts` + `.spec.ts` | Create | 3 |
| `backend/src/shared/domain/ports/i-tareas-segundo-plano.port.ts` | Create | 4 |
| `backend/src/shared/infrastructure/segundo-plano/tareas-segundo-plano.ts` + `.spec.ts` | Create | 4 |
| `backend/src/auth/infrastructure/guards/recuperacion-password-throttler.guard.ts` + `.spec.ts` | Create | 4 |
| `backend/src/auth/recuperacion-password.module.ts` | Create (sin registrar en la app) | 4 |
| `backend/src/app.module.ts` | Modify: registra `RecuperacionPasswordModule` | 11 |
| `backend/src/auth/application/use-cases/solicitar-reset-password.use-case.ts` + `.spec.ts` | Create | 5 |
| `backend/src/auth/application/use-cases/confirmar-reset-password.use-case.ts` + `.spec.ts` | Create | 6 |
| `backend/src/auth/domain/errors/auth.errors.ts` | Modify: `ResetLinkInvalidoError` | 6 |
| `backend/src/auth/auth.module.ts` | Modify: exporta `REFRESH_TOKEN_REPOSITORY` | 6 |
| `backend/src/auth/interface/dtos/recuperacion-password.dto.ts` | Create | 7-8 |
| `backend/src/auth/interface/controllers/recuperacion-password.controller.ts` + `.spec.ts` | Create | 7-8 |
| `backend/src/auth/interface/controllers/recuperacion-password.e2e.spec.ts` | Create | 7-8 |
| `frontend/src/features/auth/schemas.ts` + `schemas.test.ts` | Modify | 9 |
| `frontend/src/features/auth/hooks/use-solicitar-reset.ts`, `use-restablecer-password.ts` + tests | Create | 9 |
| `frontend/src/features/auth/components/RestablecerPasswordForm.tsx` + test | Create | 10 |
| `frontend/src/app/(auth)/restablecer-password/page.tsx` + test | Create | 10 |
| `frontend/src/middleware.ts` + `middleware.test.ts` | Modify | 10, 11 |
| `frontend/src/features/auth/components/SolicitarResetForm.tsx` + test | Create | 11 |
| `frontend/src/app/(auth)/olvide-password/page.tsx` + test | Create | 11 |
| `frontend/src/features/auth/components/LoginForm.tsx` + test | Modify | 11 |
| `backend/ayuda/mi-cuenta-contrasena.md` | Modify (`:31-35`) | 11 |
| `backend/scripts/reset-password.ts`, `ResetearPasswordUsuarioTenantUseCase`, `IEmailSender`, `CsatModule` | **Sin cambios** | — |

---

## Interfaces / Contracts

```ts
// auth/domain/ports/i-password-reset-token.repository.ts
export interface IPasswordResetTokenRepository {
  findByHash(tokenHash: string): Promise<PasswordResetTokenEntity | null>;
  save(token: PasswordResetTokenEntity): Promise<void>;
  /** Revoca los vigentes (usedAt y revokedAt nulos). @returns cantidad revocada */
  revocarVigentesDeUsuario(usuarioId: string): Promise<number>;
  /** CAS: true solo si ESTA llamada lo marcó usado estando vigente. */
  consumirSiVigente(tokenId: string): Promise<boolean>;
}
// auth/domain/ports/i-correo-de-cliente.port.ts
export type EstadoCorreoCliente = 'LISTO' | 'SIN_CORREO' | 'CLIENTE_NO_DISPONIBLE';
export interface ICorreoDeCliente {
  estado(clienteId: string): Promise<EstadoCorreoCliente>;
  enviar(clienteId: string, msg: EmailMessage): Promise<void>; // nunca lanza (IEmailSender)
}
// shared/domain/ports/i-tareas-segundo-plano.port.ts
export interface ITareasSegundoPlano {
  lanzar(etiqueta: string, tarea: () => Promise<void>): void;
}
```

```
POST /auth/forgot-password   Body { email }                    204 · 400 (email mal formado) · 429
POST /auth/reset-password    Body { token, passwordNueva(≥8) } 204 · 400 (mensaje único) · 429
```

---

## Superficie de abuso

| Si esto falla | Abuso | Test que DEBE existir |
|---|---|---|
| La solicitud hace trabajo de la rama antes de responder | Enumeración por timing | Controller: `ejecutar` NO se llama durante el handler, solo `lanzar`. e2e: con un `send` fake bloqueado, igual llega el 204 |
| La respuesta difiere por rama | Enumeración directa | e2e: las 6 ramas dan el mismo status, el mismo cuerpo y el mismo conjunto de headers (sin `Date`) |
| El tracker incluye `xff` | Bypass del límite sobre un buzón | Guard: el mismo email con `xff` distintos comparte cupo; el 4.º intento da 429 |
| El CAS no incluye `revoked_at` ni `expires_at` | Un link revocado o vencido cambia la clave | Integración: `consumirSiVigente` sobre un token revocado o vencido devuelve `false` |
| Dos confirmaciones pasan el CAS | Doble reset | Integración: `Promise.all` de dos `consumirSiVigente` da exactamente un `true`. e2e: dos POST concurrentes dan un 204 y un 400, y el hash final verifica una sola de las dos claves |
| Se hashea sin `hashPassword()` | Incidente `scripts/reset-password.ts` | e2e: el login funciona con la clave nueva y falla con la vieja |
| La revocación propaga su fallo | 500 tras un cambio exitoso | UC: `revokeAll` rechaza → `ok` + `logger.error` |
| Un log contiene el token o el plaintext | Secuestro vía agregador de logs | UC: se captura el token del `msg` enviado y ninguna llamada a `logger.*` lo contiene, ni el plaintext |
| `usuarioId` o `clienteId` salen de la request | Reset de un tercero | Controller: el DTO no declara esos campos. UC: salen solo del token o de las membresías |
| El link usa `Host` | Phishing con un link propio | Plantilla: el link empieza con `appBaseUrl`. e2e: con un `Host` manipulado, el link no lo refleja |

---

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | Entidad, plantillas (escapado y link), adaptador (estado × 3, `run` con el `clienteId`), `TareasSegundoPlano` (difiere, captura, `esperarPendientes`), guard (trackers) | Vitest con dobles |
| Unit (UC) | Solicitar: tabla de ramas con las llamadas esperadas por rama; en las ramas sin mail, ni `save` ni `enviar`. Confirmar: 4 causas → mismo error, cuenta no disponible, CAS `false`, revocación degradada, mail vía `lanzar` | Molde `cambiar-password.use-case.spec.ts` |
| Integración | Repositorio: CAS concurrente, revocación, condiciones de vigencia | `usarLockMasterTest()` + `TRUNCATE` de `soporte_master_test`, molde `prisma-encuesta-token.repository.integration.spec.ts` |
| E2E | Solicitud: 6 ramas indistinguibles, fuera del camino de la respuesta, throttle. Confirmación: flujo completo (token extraído del link del `msg`), concurrencia, login con la clave nueva, sesiones revocadas | `usarLockMasterTest()`; `overrideProvider(EMAIL_SENDER)` con un fake; `esperarPendientes()`; emails distintos por test, porque el storage del throttler vive mientras vive la app |
| Frontend | Schemas, hooks (mensaje único, 400, 429), forms, páginas (fragmento, `replaceState`), middleware, link del login | Testing Library, molde `CambiarPasswordDialog.test.tsx` |

**Timing sin cronómetro**: nunca se miden milisegundos. Se asertan tres cosas, las tres
deterministas:

1. el handler no invoca el caso de uso;
2. la respuesta llega con el SMTP bloqueado;
3. las respuestas son iguales byte a byte.

---

## Threat Matrix

**N/A**: sin shell, subprocesos, automatización de VCS/PR ni clasificación de ejecutables. El
borde adversarial real es HTTP público, y está cubierto por "Superficie de abuso", que `sdd-tasks`
debe propagar como tests.

---

## Migration / Rollout

La migración es aditiva: una tabla nueva con FKs. `prisma migrate deploy` corre contra
`soporte_master` real, según `DEPLOY-VPS-runbook.md`.

**Exposición gradual.** Cada PR de la cadena se fusiona a `main` por separado. Si el módulo se
registrara antes de que existan las páginas, cualquiera podría disparar mails reales con links a
una página inexistente: eso sería un incidente de soporte.

Por eso `RecuperacionPasswordModule` se registra en `app.module.ts` recién en WU-11, en el mismo
PR que agrega la página de solicitud, el link del login y la corrección de la Ayuda.

| Tramo | Estado en la app real |
|---|---|
| WU-1 a WU-10 | Las rutas `POST /auth/forgot-password` y `POST /auth/reset-password` **no existen**: responden 404, igual que hoy. Tabla, casos de uso y controller están probados vía los harness propios de los e2e |
| WU-11 | El módulo se registra junto con la UI completa. La página de restablecer ya existe desde WU-10 |

La migración de WU-1 sí corre con el deploy. Es aditiva, y nada escribe en la tabla hasta WU-11.

**Rollback**: revert en orden inverso. La tabla huérfana es inofensiva, y las contraseñas
cambiadas siguen siendo válidas.

---

## Work Units (cadena `auto-chain`, ≤400 por PR incluyendo openspec)

| WU | Alcance | Código+tests | +openspec | Techo con margen |
|---|---|---|---|---|
| 1 | Modelo, migración y entidad + spec | ~155 | ~20 | **≤200** |
| 2 | Puerto, mapper y repo Prisma + integración (CAS) | ~210 | ~20 | **≤265** |
| 3 | `escaparHtml` a shared, plantillas y `ICorreoDeCliente` + adaptador | ~260 | ~20 | **≤320** |
| 4 | `TareasSegundoPlano`, guard de throttling y módulo (sin controller, **sin registrar en `AppModule`**) | ~208 | ~20 | **≤265** |
| 5 | `SolicitarResetPasswordUseCase` + spec + provider | ~235 | ~20 | **≤285** |
| 6 | `ConfirmarResetPasswordUseCase` + error + export + provider | ~265 | ~20 | **≤320** |
| 7 | DTO, ruta de solicitud, spec del controller y e2e de la solicitud | ~225 | ~20 | **≤280** |
| 8 | DTO, ruta de confirmación, spec y e2e de la confirmación | ~235 | ~20 | **≤290** |
| 9 | FE: schemas y hooks + tests | ~205 | ~20 | **≤260** |
| 10 | FE: form y página de restablecer + middleware | ~225 | ~20 | **≤285** |
| 11 | FE: form y página de solicitud, link del login, middleware, **Ayuda `:31-35`** y **registro de `RecuperacionPasswordModule` en `app.module.ts`** (~4 líneas) | ~200 | ~20 | **≤255** |

**Total estimado**: ~2400 líneas de código más ~220 de openspec, por encima de las 1350-1775 del
proposal. La diferencia la explican:

- la infraestructura async y el adaptador de correo por cliente;
- el throttler con wiring propio;
- dos e2e;
- el estilo del repo, con JSDoc extenso.

Las estimaciones son pesimistas a propósito, y ningún WU necesita excepción.

**Orden**: cada WU compila y pasa sus tests solo. Las dependencias siguen el orden 1→11. Ningún
WU anterior a WU-11 expone rutas nuevas en la app real (ADR-1).

**Deuda de Ayuda**: el artículo nuevo sobre el flujo se anota en el commit y el PR de WU-11. La
pausa del 2026-09-07 sigue vigente.

---

## Open Questions

- [ ] **Desvíos del proposal (no bloqueantes)**:
  - Las rutas viven en un controller y un módulo propios, no en `AuthController` (ADR-1: ciclo
    de módulos).
  - No hay BFF dedicados; se reutiliza el proxy genérico (ADR-8).
  - **La regla no negociable 1 del proposal** nombra el patrón `DUMMY_HASH`
    (`login.use-case.ts:22-39`) como defensa de timing. El diseño lo **reemplaza** por "responder
    primero": el 204 sale antes de cualquier trabajo que dependa de la rama (ADR-2).
    - `DUMMY_HASH` iguala el costo de un `verify` de argon2 en el login, pero este flujo **no
      tiene contraseña que verificar en falso**.
    - El costo variable acá es el de las consultas, el INSERT del token y el SMTP, y ninguna
      verificación ficticia lo iguala.
    - El objetivo de la regla, que el tiempo no distinga la rama, se cumple. El mecanismo cambia.

  El orquestador los confirma antes de `sdd-tasks`.
- [ ] **Riesgo residual aceptado**:
  - No hay tope agregado entre emails distintos: quien rote emails manda 3 mails cada 15 min a
    cada víctima.
  - El storage del throttler vive en memoria de un proceso (misma deuda que CSAT).
  - **Bloqueo del propio reset**: el cupo de 3 cada 15 min es por email, sin otro
    discriminador. Un tercero que conozca el email de la víctima puede agotarlo y dejarla
    **15 minutos** sin poder pedir su propio link. Se acepta por tres motivos:
    - La ventana es corta y se renueva sola.
    - No afecta el login ni las sesiones vigentes: solo retrasa la recuperación.
    - El reset por admin (`PATCH /usuarios/:id/password`) sigue disponible como vía asistida.

    Sostener el bloqueo exige repetir el ataque cada 15 min, y ese patrón queda visible en los
    429 del log.

    La mitigación descartada es sumar un discriminador por IP. Detrás del BFF todo llega con una
    sola IP, y el `x-forwarded-for` es falsificable (ADR-3), así que abriría un bypass del cupo
    sin proteger a la víctima.
