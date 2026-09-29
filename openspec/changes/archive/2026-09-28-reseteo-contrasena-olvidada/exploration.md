# Exploración: Reseteo de contraseña por olvido (self-service)

> Ciclo SDD `reseteo-contrasena-olvidada`. Cita `docs/roadmap-comercial.md:448-450,468-469`
> ("El reseteo por olvido sigue sin construirse... necesita tokens de un solo uso con
> vencimiento").

## Estado actual

### Lo que ya entrega el ciclo `reset-de-contrasena-por-admin` (archivado, 2026-09-21)

El ciclo previo (`openspec/changes/archive/2026-09-21-reset-de-contrasena-por-admin/`,
spec en `openspec/specs/usuarios-reset-password/spec.md`) entregó un reset **iniciado
por un admin**, ya en `main`:
`backend/src/auth/application/use-cases/resetear-password-usuario-tenant.use-case.ts`.
Reutilizable para este ciclo:

- **La regla de hasheo** (`usuarios-reset-password/spec.md:16-19`): hashear únicamente vía
  `UsuarioEntity.hashPassword()` (`usuario.entity.ts:191`), la misma instancia de
  `IHashProvider` que verifica el login. Nunca `argon2` directo — regla no negociable,
  documentada como reproducción de un incidente real (`cambiar-password.use-case.ts:41-44`,
  cita el bug de `scripts/reset-password.ts:6-19`).
- **Revocación de sesiones no propagante**: tras `save()`, `try { revokeAllByUsuarioId() }
  catch { logger.error(...) }` — el `Result` es `ok` igual (`cambiar-password.use-case.ts:74-84`,
  replicado en `resetear-password-usuario-tenant.use-case.ts`).
- **`UsuarioNoDisponibleError` antes de tocar `passwordHash`** cuando la cuenta global está
  inactiva o soft-deleted (`!usuario.activo || usuario.isDeleted()`), mismo criterio que
  `LoginUseCase` (`login.use-case.ts:111`).
- **El plaintext nunca se loguea ni se imprime.**

Lo que **no** es reutilizable directamente: el reset por admin es un `PATCH` autenticado,
scopeado por membresía admin→destino dentro de un tenant conocido (el del JWT del actor). El
self-service es lo opuesto: **público, sin sesión, con el tenant del usuario desconocido hasta
identificarlo por email.**

### El precedente para tokens de un solo uso: CSAT (`EmitirEncuestaUseCase`)

Es el molde más cercano al mecanismo que pide el roadmap:

- `EncuestaTokenEntity` (`backend/src/csat/domain/entities/encuesta-token.entity.ts:11-116`,
  tabla `encuesta_tokens` en `prisma_master/schema.prisma:315-333`): token opaco de 32 bytes
  (`crypto.randomBytes(32)`), se persiste únicamente su SHA-256
  (`emitir-encuesta.use-case.ts:65-66`); el crudo viaja solo en el link del mail. `expiresAt`,
  `usedAt` (uso único vía CAS `marcarUsadoSiNoUsado`, `i-encuesta-token.repository.ts:30-37`),
  `revokedAt`.
- **Revoca todo token vigente antes de emitir uno nuevo** (`revocarVigentesDeTicket`,
  `emitir-encuesta.use-case.ts:63`). El equivalente sería revocar los tokens de reset vigentes
  del mismo usuario.
- **El caso de uso llama `IEmailSender.send()` directo** (`emitir-encuesta.use-case.ts:35,59,86`),
  inyectado por el token `EMAIL_SENDER`, sin `EventEmitter2` ni listener nuevo. Corrige la
  premisa de la exploración del reset por admin (`.../exploration.md:91-93`), que asumía que un
  email exigía un evento nuevo en `AuthModule`.
- **Respuesta genérica anti-enumeración**: `EncuestaPublicaController.toHttpException`
  (`encuesta-publica.controller.ts:66-71`) mapea todo rechazo (inexistente, vencido, usado,
  revocado) al mismo 404 con el mismo texto.
- **Rate limiting con `ThrottlerGuard`**: `CsatThrottlerGuard` (`csat-throttler.guard.ts:26-47`),
  tracker `${xff}:${token}` con el token como componente primario (el BFF de Next hace `fetch()`
  server-side, así que el backend ve una sola IP; `x-forwarded-for` es solo discriminador no
  confiable). Para forgot-password el tracker análogo sería por email.
- El token vive en master con soft-ref sin FK (`ticketId`, `encuesta-token.entity.ts:8-9,14`).
  El token de reset sería más simple: `Usuario` también vive en master, así que `usuarioId`
  puede tener FK.

### Módulo `auth/`

- `AuthController` (`auth.controller.ts:139-237`): `/login`, `/refresh`, `/logout` públicos;
  `/logout-all`, `/switch`, `/change-password`, `/me` con `JwtAuthGuard`. **Ningún endpoint de
  `auth/` tiene rate limiting hoy**: el único `ThrottlerGuard` es `CsatThrottlerGuard`.
  `/change-password` (`:215-231`) exige `passwordActual`; no sirve de molde para "no sé mi
  contraseña".
- `LoginUseCase` (`login.use-case.ts:104-207`): defensa de timing —
  `hashProvider.verify(password, DUMMY_HASH)` corre siempre, aunque el usuario no exista
  (`:108-114`). **El mismo patrón aplica a "olvidé mi contraseña": la respuesta genérica no
  alcanza si el tiempo de cómputo varía según si el email existe.**
- `IRefreshTokenRepository.revokeAllByUsuarioId()` (`i-refresh-token.repository.ts:27-32`)
  ya existe y es reutilizable.
- `IHashProvider` (`usuario.entity.ts:191,203`): sin cambios.

### Multi-tenencia: identidad global, sin resolución por subdominio

No hay mecanismo de subdominio o slug de tenant en el backend (búsqueda de
`subdominio|subdomain|slug` en `backend/src`: los matches son de KB y reparaciones).

- `Usuario` (`prisma_master/schema.prisma:199-219`) **no tiene `cliente_id`**: identidad
  global, única por `email` (`:201`). El tenant se resuelve después de autenticar, vía
  `Membresia` (N:N usuario↔cliente).
- `LoginUseCase` resuelve el tenant en 4 ramas (`login.use-case.ts:126-151`): `clienteId`
  explícito; ROOT sin `clienteId` → scope master; 0 membresías → `SinMembresiaActivaError`;
  1 → auto-selección; 2+ → `{kind:'selection'}` sin emitir tokens.
- **El problema nuevo**: en el login, mostrar "tenés 2 clientes, elegí uno" es seguro porque el
  usuario ya probó su contraseña. En forgot-password el email **no está autenticado**: mostrar
  el selector antes de probar posesión de la cuenta filtra existencia y cardinalidad de
  membresías. Es una decisión de producto abierta.

### Correo saliente: sin fallback de plataforma, por decisión de producto

- `TenantAwareEmailSender.send()` (`tenant-aware-email-sender.ts:72-102`) resuelve el
  `clienteId` desde `TenantContext.get()`. Sin contexto de tenant no envía y solo loguea
  `EMAIL_SIN_TENANT_CONTEXT` (`:75-80`). Las otras degradaciones silenciosas:
  `EMAIL_CRYPTO_KEY_AUSENTE` (`:83-91`) y `EMAIL_CLIENTE_SIN_CONFIG` (`:93-98`). **Nunca lanza.**
- **No existe SMTP de plataforma.** `validarEntorno` solo exige `DATABASE_URL_MASTER`,
  `APP_BASE_URL`, `JWT_SECRET` (`validar-entorno.ts:15`). Es decisión explícita:
  `docs/roadmap-comercial.md:83` — "Configuración de correo SMTP **por cliente**... cada cliente
  manda con su identidad, nada genérico". Un fallback de plataforma revertiría esa decisión.
- `TenantAwareEmailSender` solo necesita `TenantContext.get()?.clienteId` (`:73`); la config se
  lee de `master.clientes` (`prisma-cliente-email-config.repository.ts:13-24`). El caso de uso
  puede bindear un `TenantContext` mínimo fuera de un request HTTP, como ya hacen
  `sla-sweep.scheduler.ts:46` y `preventivo-sweep.scheduler.ts:64` con `tenantContext.run(...)`.
- `email-templates.ts` (`:37-44`) tiene `escaparHtml()` reutilizable. `APP_BASE_URL` sale
  siempre de `entorno.ts` (validada al arrancar, `validar-entorno.ts:15,114`), nunca del header
  `Host`: **sin riesgo de Host-header injection en el link.**

### Frontend

- `/login` vive en el grupo público `(auth)` (`frontend/src/app/(auth)/login/page.tsx`).
  `/olvide-password` y `/restablecer-password` encajan en el mismo grupo.
- `LoginForm.tsx` (`:24-78`) es presentacional (react-hook-form + zod) y **no tiene link a
  "¿olvidaste tu contraseña?"**.
- El BFF `POST /api/auth/login/route.ts` (`:24-61`) setea cookies httpOnly; un BFF de
  forgot-password sería más simple (sin cookies, solo forward de la respuesta genérica).
- `CambiarPasswordDialog.tsx` (`:56-182`) y `cambiarPasswordSchema`
  (`frontend/src/features/auth/schemas.ts:25-35`: `min(8)`, `.refine` de igualdad) son el molde
  del formulario de nueva contraseña.

### Amenazas a diseñar

- **Enumeración de usuarios**: respuesta idéntica exista o no el email (criterio de
  `CredencialesInvalidasError`, `auth.errors.ts:9-15`, y del 404 de CSAT), **más defensa de
  timing** (patrón `DUMMY_HASH`, `login.use-case.ts:22-39`).
- **Token**: 32 bytes de `crypto.randomBytes`, solo SHA-256 persistido — mismo patrón que
  `RefreshToken` (`login.use-case.ts:191-192`) y `EncuestaToken`.
- **Uso único e invalidación de previos**: CAS `marcarUsadoSiNoUsado` para que dos requests
  concurrentes con el mismo token nunca reseteen dos veces.
- **Rate limiting**: por email en `POST /auth/forgot-password` (el recurso abusado es el buzón
  de un tercero) y por token en `POST /auth/reset-password`.

## Áreas afectadas

- `backend/prisma_master/schema.prisma` + migración nueva — modelo `PasswordResetToken` (o
  equivalente), análogo a `EncuestaToken`. El ciclo de reset por admin no necesitó migración.
- `backend/src/auth/domain/entities/`, `domain/ports/`, `infrastructure/persistence/prisma/` —
  entidad, puerto e implementación del token (moldes de CSAT).
- `backend/src/auth/application/use-cases/` — dos casos de uso: solicitar reset y confirmar
  reset.
- `backend/src/auth/interface/controllers/auth.controller.ts` + `dtos/auth.dto.ts` — rutas
  públicas `POST /auth/forgot-password` y `POST /auth/reset-password`, con guard de throttling
  propio y sin `JwtAuthGuard`.
- `backend/src/auth/domain/errors/auth.errors.ts` — solo si el diseño lo justifica.
- `backend/src/auth/auth.module.ts` — wiring con inyección directa de `EMAIL_SENDER`.
- Plantillas de mail — archivo propio en `auth/domain/templates/`, como hizo CSAT con
  `csat/domain/templates/encuesta-email.template.ts`.
- `frontend/src/app/(auth)/olvide-password/`, `(auth)/restablecer-password/`, BFF
  `api/auth/forgot-password` y `api/auth/reset-password`, formularios, hooks, `schemas.ts` y el
  link en `LoginForm.tsx`.
- **Tests**: unit y `*.e2e.spec.ts` (moldes `auth.e2e.spec.ts`, `csat.e2e.spec.ts`). Un e2e que
  trunque `soporte_master_test` **debe** llamar `usarLockMasterTest()`.
- **Ayuda**: pausa vigente desde 2026-09-07. El cambio agrega pantallas visibles en el flujo de
  login: se anota la deuda en commit y PR, sin escribir artículo.

## Decisiones de producto abiertas (antes de `sdd-propose`)

### 1. ¿Qué usuarios pueden auto-resetearse?

| Opción | A favor | En contra |
|---|---|---|
| **Todos los usuarios activos, incluido ROOT** (recomendada) | Consistente con login, que no excluye a ROOT; menos ramas especiales | ROOT es la cuenta más privilegiada: un buzón comprometido da control cross-tenant |
| Excluir ROOT (solo `scripts/reset-password.ts`) | Reduce la superficie de ataque sobre la cuenta más crítica | Chequeo extra que login no tiene; ROOT sin vía self-service |

### 2. TTL del token

**Recomendación**: 30 a 60 minutos. `EncuestaToken` usa 30 días porque es de baja
sensibilidad; un token que cambia una credencial es mucho más sensible. Tradeoff: frustra a
quien revisa el mail tarde; se mitiga pidiendo otro link.

### 3. ¿Qué tenant envía el mail si el usuario tiene 0 o 2+ membresías? — la decisión central

Con 1 membresía activa la elección es obvia. Con 0 o 2+:

| Opción | A favor | En contra |
|---|---|---|
| **Misma respuesta genérica, pero no se envía mail** (recomendada) | Preserva anti-enumeración sin ramas nuevas en la respuesta; queda rastro en el log | Un usuario multi-tenant o ROOT sin membresías queda sin vía self-service: pide reset a un admin o usa el script |
| Enviar vía cualquier tenant del usuario con SMTP (en orden) | Maximiza la tasa de éxito | Tenant elegido implícito y no auditable; remitentes distintos confunden |
| Pedir `clienteId` con un selector previo (patrón login) | Reusa `dto.clienteId` | Filtra cardinalidad de membresías antes de probar posesión del email |

### 4. ¿Mail de confirmación tras un reset exitoso?

| Opción | A favor | En contra |
|---|---|---|
| **Sí** (recomendada) | Si alguien completa el flujo con un buzón comprometido, la víctima se entera | Una plantilla y un `send()` más |
| No (como `CambiarPasswordUseCase`) | Menos código | Sin señal hacia la víctima de un secuestro vía buzón |

### 5. Rate limiting

**Recomendación**: partir de `CsatThrottlerGuard` (`CSAT_THROTTLE_LIMIT = 10` en 60 s,
`csat-throttler.guard.ts:30-33`) con dos guards: por email en `forgot-password` y por token en
`reset-password`. Los números exactos se fijan en `sdd-design`.

## Alcance no incluido (recomendado)

- Fallback de SMTP de plataforma — reabre una decisión cerrada (`docs/roadmap-comercial.md:83`).
- Selector de cliente antes de que el token pruebe posesión del email.
- Tocar `scripts/reset-password.ts`, `AdminClienteGuard` o
  `ResetearPasswordUsuarioTenantUseCase`: el reset por admin sigue siendo el mecanismo asistido.
- Artículos de Ayuda (pausa vigente; solo se anota la deuda).

## Estimación de superficie

Backend ~900-1170 líneas (modelo + migración, entidad, puerto, repo Prisma, 2 casos de uso, 2
endpoints + DTOs, plantillas, wiring, tests unit + e2e). Frontend ~455-605 líneas (2 páginas, 2
BFF, formularios, hooks, schemas, link, tests). **Total ~1350-1775 líneas**: `sdd-tasks` tiene
que partirlo en varias work units (mínimo: modelo+entidad+repo, solicitar+endpoint,
confirmar+endpoint, frontend).

## Riesgos

- **El mail es el único canal de entrega del link.** Si el tenant no tiene SMTP, el usuario no
  tiene vía self-service, y la degradación es silenciosa por diseño.
- **Enumeración de usuarios y de cardinalidad de tenants**: respuesta genérica y defensa de
  timing no negociables.
- **Migración nueva en `prisma_master`**: corre contra `soporte_master` real; revisar el runbook
  de deploy.
- **Hash inconsistente con el login** si la confirmación usa `argon2` directo en vez de
  `usuario.hashPassword()` — blanco prioritario de la mutación adversarial en `sdd-verify`.
- **Presupuesto de revisión**: muy por encima de 400 líneas.
- **Deuda de Ayuda**: pantallas nuevas visibles.

## Listo para propuesta

Sí, una vez que el dueño resuelva las decisiones 1 a 5 (la 3 es la más consecuente).
