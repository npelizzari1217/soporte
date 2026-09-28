# Tasks: Reseteo de contraseña por olvido (self-service)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2400 código + ~220 openspec (~2620 total), repartidos en 11 PRs |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 → PR6 → PR7 → PR8 → PR9 → PR10 → PR11 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

TDD: disabled (cambio tipo feature, `~/proyectos/CLAUDE.md` §6.3). Los tests viajan en el
mismo commit que el código que verifican, no antes.

Rama base: `main`. Ramas: `feat/reseteo-contrasena-olvidada-wu01` … `wu11`. PR1 apunta a
`main`; cada PR siguiente apunta a la rama del PR anterior (`stacked-to-main`).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Modelo `PasswordResetToken` + migración + entidad | PR 1 (base `main`) | `pnpm vitest run backend/src/auth/domain/entities/password-reset-token.entity.spec.ts` | N/A — sin tabla poblada, sin ruta expuesta | revert PR1: migración aditiva, huérfana, sin filas |
| 2 | Puerto + mapper + repo Prisma + integración CAS | PR 2 (base PR1) | `pnpm vitest run backend/src/auth/infrastructure/persistence/prisma/prisma-password-reset-token.repository.integration.spec.ts` | `usarLockMasterTest()` + TRUNCATE `soporte_master_test` | revert PR2 sin tocar PR1 (repo sin consumidores) |
| 3 | `escaparHtml` a shared + plantillas + `ICorreoDeCliente`/adaptador | PR 3 (base PR2) | `pnpm vitest run backend/src/auth/domain/templates/reset-password-email.template.spec.ts backend/src/auth/infrastructure/email/correo-de-cliente.adapter.spec.ts` | N/A — funciones puras y adaptador con dobles | revert PR3: `email-templates.ts` vuelve a su `escaparHtml` local |
| 4 | `TareasSegundoPlano` + guard throttling + módulo (sin registrar) | PR 4 (base PR3) | `pnpm vitest run backend/src/shared/infrastructure/segundo-plano/tareas-segundo-plano.spec.ts backend/src/auth/infrastructure/guards/recuperacion-password-throttler.guard.spec.ts` | N/A — módulo creado, no registrado en `app.module.ts` | revert PR4: módulo huérfano, `app.module.ts` intacto |
| 5 | `SolicitarResetPasswordUseCase` + provider | PR 5 (base PR4) | `pnpm vitest run backend/src/auth/application/use-cases/solicitar-reset-password.use-case.spec.ts` | N/A — sin controller, sin ruta HTTP | revert PR5 sin afectar PR1-4 |
| 6 | `ConfirmarResetPasswordUseCase` + error + export | PR 6 (base PR5) | `pnpm vitest run backend/src/auth/application/use-cases/confirmar-reset-password.use-case.spec.ts` | N/A — sin controller | revert PR6 sin afectar anteriores |
| 7 | DTO + ruta solicitud + controller spec + e2e solicitud | PR 7 (base PR6) | `pnpm vitest run backend/src/auth/interface/controllers/recuperacion-password.controller.spec.ts` | `usarLockMasterTest()`; e2e con `TestHarnessModule` propio (`csat.e2e.spec.ts:91`), `overrideProvider(EMAIL_SENDER)` fake, `esperarPendientes()` | revert PR7: DTO/ruta en módulo aún no registrado |
| 8 | DTO + ruta confirmación + controller spec + e2e confirmación | PR 8 (base PR7) | `pnpm vitest run backend/src/auth/interface/controllers/recuperacion-password.e2e.spec.ts` | idem WU-7 | revert PR8 sin afectar anteriores |
| 9 | FE: schemas + hooks | PR 9 (base PR8) | `pnpm vitest run frontend/src/features/auth/schemas.test.ts` | N/A — hooks sin página que los use | revert PR9: schemas/hooks sin import |
| 10 | FE: form + página restablecer + middleware | PR 10 (base PR9) | `pnpm vitest run frontend/src/app/(auth)/restablecer-password` | Playwright manual: navegar `/restablecer-password#token=x` | revert PR10: ruta pública desregistrada en `middleware.ts` |
| 11 | FE: form + página solicitud, link login, Ayuda, registro del módulo | PR 11 (base PR10) | `pnpm vitest run frontend/src/app/(auth)/olvide-password frontend/src/features/auth/components/LoginForm.test.tsx` | e2e completo: `POST /auth/forgot-password` real contra app montada | revert PR11: `app.module.ts` deja de montar el módulo, rutas vuelven a 404 |

---

## WU-1 — Modelo, migración y entidad

Files: `backend/prisma_master/schema.prisma`,
`backend/prisma_master/migrations/20260928120000_add_password_reset_tokens/migration.sql`,
`backend/src/auth/domain/entities/password-reset-token.entity.ts` + `.spec.ts`

- [x] 1.1 Migración `20260928120000_add_password_reset_tokens` (convención `YYYYMMDDHHMMSS_snake`,
      sigue a `20260923150000_…`): tabla `password_reset_tokens` — `id`, `usuario_id` FK
      `usuarios` `ON DELETE CASCADE`, `cliente_id` FK `clientes`, `token_hash` TEXT UNIQUE,
      `expires_at`, `used_at`, `revoked_at`, `created_at/updated_at/deleted_at`, índice
      `(usuario_id)`. [Req 3]
- [x] 1.2 `schema.prisma`: modelo `PasswordResetToken` + back-relations en `Usuario` y `Cliente`.
      [Req 3]
- [x] 1.3 `PasswordResetTokenEntity` (molde `encuesta-token.entity.ts`): `isExpired()`,
      `isUsed()`, `isRevoked()`. [Req 3, Req 4, Req 6]
- [x] 1.4 `password-reset-token.entity.spec.ts`: vigencia para cada combinación de
      `expiresAt/usedAt/revokedAt`. [Req 6]

Focused test: `pnpm vitest run backend/src/auth/domain/entities/password-reset-token.entity.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/domain/entities/password-reset-token.entity.spec.ts` · `pnpm test`
Rollback boundary: revert de PR1; migración aditiva queda huérfana, sin filas.

## WU-2 — Puerto, mapper y repo Prisma

Files: `backend/src/auth/domain/ports/i-password-reset-token.repository.ts`,
`backend/src/auth/infrastructure/persistence/prisma/password-reset-token.mapper.ts`,
`backend/src/auth/infrastructure/persistence/prisma/prisma-password-reset-token.repository.ts` +
`.integration.spec.ts`

- [x] 2.1 `IPasswordResetTokenRepository`: `findByHash`, `save`, `revocarVigentesDeUsuario`,
      `consumirSiVigente`. [Req 3, Req 4]
- [x] 2.2 Mapper Prisma ↔ entidad. [Req 3]
- [x] 2.3 `PrismaPasswordResetTokenRepository.consumirSiVigente`: `UPDATE … SET used_at=now()
      WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`. [Req 5, Req 6]
- [x] 2.4 Integración (llama `usarLockMasterTest()` antes de truncar `soporte_master_test`): CAS
      concurrente — `Promise.all` de dos `consumirSiVigente` da exactamente un `true`;
      `consumirSiVigente` sobre token revocado o vencido da `false`; `revocarVigentesDeUsuario`
      revoca solo los vigentes. [Req 4, Req 5, Req 6 — abuso: CAS sin `revoked_at`/`expires_at`,
      doble reset]

Focused test: `pnpm vitest run backend/src/auth/infrastructure/persistence/prisma/prisma-password-reset-token.repository.integration.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/infrastructure/persistence/prisma/` · `pnpm test`
Rollback boundary: revert de PR2; repo sin consumidores, PR1 intacto.

## WU-3 — escaparHtml, plantillas y adaptador de correo

Files: `backend/src/shared/domain/escapar-html.ts` (create),
`backend/src/notificaciones/domain/templates/email-templates.ts` (modify: importa),
`backend/src/auth/domain/templates/reset-password-email.template.ts` + `.spec.ts`,
`backend/src/auth/domain/ports/i-correo-de-cliente.port.ts`,
`backend/src/auth/infrastructure/email/correo-de-cliente.adapter.ts` + `.spec.ts`

- [ ] 3.1 Mover `escaparHtml` de `email-templates.ts:37` a `backend/src/shared/domain/escapar-html.ts`;
      `email-templates.ts` importa desde ahí. [Req 12]
- [ ] 3.2 `templateResetPassword({nombre, token, appBaseUrl, vigenciaMinutos})`: link
      `${appBaseUrl}/restablecer-password#token=${token}`; todo valor interpolado pasa por
      `escaparHtml`. [Req 11]
- [ ] 3.3 `templateResetConfirmado({nombre})`. [Req 10]
- [ ] 3.4 `.spec.ts` de plantillas: el link empieza con `appBaseUrl` (nunca con `Host`); escapado
      de valores interpolados. [Req 11 — abuso: link con `Host`]
- [ ] 3.5 `ICorreoDeCliente` (`estado`, `enviar`) + `CorreoDeClienteAdapter`: `estado()` vía
      `IClienteRepository.findById` + `IClienteEmailConfigRepository.findState().configurado`;
      `enviar()` bindea `tenantContext.run(...)` (molde `sla-sweep.scheduler.ts:45-49`). [Req 1,
      Req 10]
- [ ] 3.6 `.spec.ts` del adaptador: los tres estados (`LISTO`/`SIN_CORREO`/`CLIENTE_NO_DISPONIBLE`)
      y que `enviar` corre dentro del `TenantContext` del `clienteId` recibido. [Req 1, Req 10]

Focused test: `pnpm vitest run backend/src/auth/domain/templates/reset-password-email.template.spec.ts backend/src/auth/infrastructure/email/correo-de-cliente.adapter.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/shared/domain/ backend/src/auth/domain/templates/ backend/src/auth/infrastructure/email/` · `pnpm test`
Rollback boundary: revert de PR3; `email-templates.ts` vuelve a su `escaparHtml` local.

## WU-4 — TareasSegundoPlano, guard de throttling y módulo (sin registrar)

Files: `backend/src/shared/domain/ports/i-tareas-segundo-plano.port.ts`,
`backend/src/shared/infrastructure/segundo-plano/tareas-segundo-plano.ts` + `.spec.ts`,
`backend/src/auth/infrastructure/guards/recuperacion-password-throttler.guard.ts` + `.spec.ts`,
`backend/src/auth/recuperacion-password.module.ts`

- [ ] 4.1 `ITareasSegundoPlano.lanzar(etiqueta, tarea)`. [Req 2]
- [ ] 4.2 `TareasSegundoPlano`: difiere con `setImmediate`, `Set` de pendientes, `catch` +
      `logger.error('SEGUNDO_PLANO_ERROR | tarea=<etiqueta> | error=<message>')`,
      `esperarPendientes()`, `onApplicationShutdown` la llama. [Req 2, Req 12]
- [ ] 4.3 `.spec.ts`: la tarea no corre síncronamente; un rechazo se captura y loguea sin abortar;
      `esperarPendientes()` resuelve cuando el `Set` queda vacío. [Req 2 — abuso: trabajo de rama
      antes de responder]
- [ ] 4.4 `RecuperacionPasswordThrottlerGuard` (subclase vacía de `ThrottlerGuard`, `useFactory`,
      storage y `Reflector` propios); tracker por email o por token, sin `x-forwarded-for`.
      [Req 13]
- [ ] 4.5 `.spec.ts` del guard: mismo email con `xff` distintos comparte cupo; el intento que
      excede el límite fijado en diseño da 429. [Req 13 — abuso: tracker con `xff`]
- [ ] 4.6 `RecuperacionPasswordModule` (imports `AuthModule`, `NotificacionesModule`; controller
      `@Controller('auth')`) creado y probado; **NO se registra en `app.module.ts`** (queda para
      WU-11).

Focused test: `pnpm vitest run backend/src/shared/infrastructure/segundo-plano/tareas-segundo-plano.spec.ts backend/src/auth/infrastructure/guards/recuperacion-password-throttler.guard.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/shared/infrastructure/segundo-plano/ backend/src/auth/infrastructure/guards/` · `pnpm test`
Rollback boundary: revert de PR4; módulo huérfano sin importar, `app.module.ts` intacto.

## WU-5 — SolicitarResetPasswordUseCase

Files: `backend/src/auth/application/use-cases/solicitar-reset-password.use-case.ts` + `.spec.ts`

- [ ] 5.1 `SolicitarResetPasswordUseCase.ejecutar(email)`: `findByEmail` → inactivo/inexistente
      fin; `findActivasByUsuario` (mismo query que login) ≠1 fin; `correo.estado(clienteId)`
      ≠`LISTO` fin (sin token); si `LISTO`: `revocarVigentesDeUsuario` → `randomBytes(32)` →
      `save(sha256, +60min TTL, clienteId)` → `correo.enviar(...)` con link `APP_BASE_URL`.
      Atrapa todo internamente, nunca lanza. [Req 1, Req 3, Req 4, Req 11]
- [ ] 5.2 Log único `RESET_PASSWORD_SOLICITUD | resultado=<...>` con `usuarioId`/`clienteId`
      cuando existan; nunca email, token ni plaintext. [Req 12]
- [ ] 5.3 `.spec.ts`: tabla de ramas (inexistente, inactivo, 0 membresías, 2+ membresías,
      `SIN_CORREO`, `CLIENTE_NO_DISPONIBLE`, `LISTO`) con las llamadas esperadas por rama; en
      ramas sin mail, ni `save` ni `enviar`; se captura el token del mensaje enviado y ninguna
      llamada a `logger.*` lo contiene. [Req 1, Req 12 — abuso: log con token/plaintext]
- [ ] 5.4 Provider en el módulo (`useFactory`, `appBaseUrl` desde `entorno.APP_BASE_URL`).

Focused test: `pnpm vitest run backend/src/auth/application/use-cases/solicitar-reset-password.use-case.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/application/use-cases/solicitar-reset-password.use-case.spec.ts` · `pnpm test`
Rollback boundary: revert de PR5; caso de uso sin controller que lo invoque.

## WU-6 — ConfirmarResetPasswordUseCase

Files: `backend/src/auth/application/use-cases/confirmar-reset-password.use-case.ts` + `.spec.ts`,
`backend/src/auth/domain/errors/auth.errors.ts` (modify),
`backend/src/auth/auth.module.ts` (modify: exporta `REFRESH_TOKEN_REPOSITORY`)

- [ ] 6.1 `ResetLinkInvalidoError` en `auth.errors.ts`. [Req 6]
- [ ] 6.2 `AuthModule` exporta `REFRESH_TOKEN_REPOSITORY` (`auth.module.ts:361-388`). [Req 8]
- [ ] 6.3 `ConfirmarResetPasswordUseCase.ejecutar(token, passwordNueva)`: `findByHash`
      inválido/usado/revocado/vencido → `ResetLinkInvalidoError`; `findById`
      inactivo/inexistente/soft-deleted → mismo error sin consumir; `usuario.hashPassword()` en
      memoria; `consumirSiVigente` CAS → `false` mismo error; `usuarioRepo.save()`; `try
      revokeAllByUsuarioId catch logger.error` sin propagar; `tareas.lanzar(mail confirmación)`
      por `token.clienteId`. [Req 5, Req 6, Req 7, Req 8, Req 9, Req 10]
- [ ] 6.4 `.spec.ts`: las 4 causas de token inválido dan el mismo error; cuenta inactiva no
      consume el token ni cambia `passwordHash`; `revokeAll` rechaza → éxito + `logger.error` sin
      plaintext; mail vía `lanzar` con `clienteId` del token; `usuarioId`/`clienteId` salen solo
      del token, nunca de un parámetro externo. [Req 5, Req 6, Req 7, Req 8, Req 9, Req 10, Req 12
      — abuso: revocación propaga fallo, ids fuera del token]

Focused test: `pnpm vitest run backend/src/auth/application/use-cases/confirmar-reset-password.use-case.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/application/use-cases/confirmar-reset-password.use-case.spec.ts backend/src/auth/domain/errors/` · `pnpm test`
Rollback boundary: revert de PR6; sin controller que exponga el caso de uso.

## WU-7 — Ruta de solicitud

Files: `backend/src/auth/interface/dtos/recuperacion-password.dto.ts` (parte solicitud),
`backend/src/auth/interface/controllers/recuperacion-password.controller.ts` + `.spec.ts` (parte
solicitud), `backend/src/auth/interface/controllers/recuperacion-password.e2e.spec.ts` (parte
solicitud)

- [ ] 7.1 `SolicitarResetDto { email: @IsEmail() }`. [Req 1]
- [ ] 7.2 `RecuperacionPasswordController`: `POST /auth/forgot-password`,
      `@UseGuards(RecuperacionPasswordThrottlerGuard)`, `@Throttle` 3/15min por email; el handler
      solo llama `tareas.lanzar(...)` y devuelve 204, sin awaitear `ejecutar`. [Req 1, Req 2, Req 13]
- [ ] 7.3 `.spec.ts` del controller: `ejecutar` NO se invoca de forma síncrona en el handler.
      [Req 2 — abuso: trabajo de rama antes de responder]
- [ ] 7.4 e2e (`TestHarnessModule` propio importando `RecuperacionPasswordModule`, molde
      `csat.e2e.spec.ts:91`; llama `usarLockMasterTest()`): las 6 ramas sin mail dan 204 idéntico
      byte a byte (status, cuerpo, headers sin `Date`); con `EMAIL_SENDER` fake bloqueado, igual
      llega el 204; el 4.º intento del mismo email da 429. [Req 1, Req 2, Req 13 — abuso: respuesta
      difiere por rama, tracker con `xff`]

Focused test: `pnpm vitest run backend/src/auth/interface/controllers/recuperacion-password.controller.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/interface/controllers/` · `pnpm test`
Rollback boundary: revert de PR7; DTO/ruta viven en módulo aún no registrado en `app.module.ts`.

## WU-8 — Ruta de confirmación

Files: `backend/src/auth/interface/dtos/recuperacion-password.dto.ts` (parte confirmación),
`backend/src/auth/interface/controllers/recuperacion-password.controller.ts` + `.spec.ts` (parte
confirmación), `backend/src/auth/interface/controllers/recuperacion-password.e2e.spec.ts` (parte
confirmación)

- [ ] 8.1 `ConfirmarResetDto { token: string, passwordNueva: @MinLength(8) }` — el DTO no declara
      `usuarioId` ni `clienteId`; `whitelist: true` (`app.module.ts:71`) los descartaría si
      llegaran. [Req 7 — abuso: ids fuera del token]
- [ ] 8.2 `POST /auth/reset-password`, `@Throttle` 5/15min por token; 204 en éxito, 400 con
      mensaje único en cualquier rechazo. [Req 5, Req 6, Req 13]
- [ ] 8.3 e2e (llama `usarLockMasterTest()`): token extraído del link del mensaje enviado en
      WU-7; flujo completo hasta 204; dos POST concurrentes con el mismo token dan un 204 y un
      400, y solo una de las dos claves verifica login; login funciona con la clave nueva y falla
      con la vieja; sesiones quedan revocadas; se envía el mail de confirmación por el mismo
      `clienteId`. [Req 5, Req 6, Req 7, Req 8, Req 10 — abuso: doble reset, hash sin
      `hashPassword()`]

Focused test: `pnpm vitest run backend/src/auth/interface/controllers/recuperacion-password.e2e.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/interface/controllers/` · `pnpm test`
Rollback boundary: revert de PR8 sin afectar PR1-7.

## WU-9 — Frontend: schemas y hooks

Files: `frontend/src/features/auth/schemas.ts` + `schemas.test.ts` (modify),
`frontend/src/features/auth/hooks/use-solicitar-reset.ts`, `use-restablecer-password.ts` + tests
(create)

- [ ] 9.1 `solicitarResetSchema { email }` espeja `@IsEmail`. [Req 14]
- [ ] 9.2 `restablecerPasswordSchema { passwordNueva: min(8), repetirPassword }` con `.refine` de
      igualdad, copia de `cambiarPasswordSchema:25-34`. [Req 7, Req 14]
- [ ] 9.3 `use-solicitar-reset.ts` (`apiFetch` + `useMutation`): mismo mensaje siempre tras 204;
      429 aviso de límite; 0/5xx infraestructura (criterio `mensajeDeErrorDeLogin`). [Req 1,
      Req 14]
- [ ] 9.4 `use-restablecer-password.ts`: 400 → "link no válido o vencido" con enlace a
      `/olvide-password`. [Req 6, Req 14]
- [ ] 9.5 Tests de schemas y hooks para cada rama de mensaje.

Focused test: `pnpm vitest run frontend/src/features/auth/schemas.test.ts`
Verification: `pnpm lint` · `pnpm type-check` · `pnpm vitest run frontend/src/features/auth/` · `pnpm test`
Rollback boundary: revert de PR9; hooks y schemas sin página que los importe.

## WU-10 — Frontend: página de restablecer + middleware

Files: `frontend/src/features/auth/components/RestablecerPasswordForm.tsx` + test (create),
`frontend/src/app/(auth)/restablecer-password/page.tsx` + test (create),
`frontend/src/middleware.ts` + `middleware.test.ts` (modify)

- [ ] 10.1 `RestablecerPasswordForm.tsx` (presentacional): valida localmente largo mínimo e
      igualdad antes de enviar. [Req 14]
- [ ] 10.2 `page.tsx`: lee `window.location.hash` en `useEffect`, `history.replaceState` saca el
      token de la barra de direcciones, sin token muestra mensaje de link inválido. [Req 14]
- [ ] 10.3 Suma `/restablecer-password` a `RUTAS_PUBLICAS` en `middleware.ts:35`. [Req 14]
- [ ] 10.4 Tests: form (validación local), página (fragmento, `replaceState`, sin token),
      middleware (ruta pública).

Focused test: `pnpm vitest run frontend/src/app/(auth)/restablecer-password`
Verification: `pnpm lint` · `pnpm type-check` · `pnpm vitest run frontend/src/app/(auth)/restablecer-password frontend/src/features/auth/components/RestablecerPasswordForm.test.tsx frontend/src/middleware.test.ts` · `pnpm test`
Rollback boundary: revert de PR10; ruta pública se retira de `middleware.ts`, página deja de
existir.

## WU-11 — Frontend: solicitud, link de login, Ayuda y registro del módulo

Files: `frontend/src/features/auth/components/SolicitarResetForm.tsx` + test (create),
`frontend/src/app/(auth)/olvide-password/page.tsx` + test (create),
`frontend/src/features/auth/components/LoginForm.tsx` + test (modify),
`frontend/src/middleware.ts` (modify: suma `/olvide-password`),
`backend/ayuda/mi-cuenta-contrasena.md` (modify `:31-35`),
`backend/src/app.module.ts` (modify: registra `RecuperacionPasswordModule`)

- [ ] 11.1 `SolicitarResetForm.tsx`: siempre el mismo mensaje tras enviar, exista o no el email.
      [Req 14]
- [ ] 11.2 `page.tsx` de `/olvide-password`; suma la ruta a `RUTAS_PUBLICAS`. [Req 14]
- [ ] 11.3 `LoginForm.tsx`: `<Link href="/olvide-password">¿Olvidaste tu contraseña?</Link>`
      estático. [Req 14]
- [ ] 11.4 Reescribe `backend/ayuda/mi-cuenta-contrasena.md:31-35`: ya no afirma la ausencia del
      botón; describe el link nuevo, el vencimiento de 60 min, el cierre de sesiones y el reset
      por admin como vía asistida si el mail no llega. Anota en el commit y en el cuerpo del PR
      la deuda del artículo nuevo (pausa del 2026-09-07 sigue vigente: no se escribe artículo
      nuevo ahora). [Req 15]
- [ ] 11.5 **Único punto de registro del módulo**: agrega `RecuperacionPasswordModule` a los
      imports de `app.module.ts`. Ninguna tarea anterior a esta lo hace (ADR-1, Migration /
      Rollout del diseño).
- [ ] 11.6 Tests: form (mensaje único), página, `LoginForm` (link presente), middleware
      (`/olvide-password` pública).
- [ ] 11.7 e2e manual/smoke post-merge: `POST /auth/forgot-password` contra la app montada
      responde 204 (módulo ya registrado).

Focused test: `pnpm vitest run frontend/src/app/(auth)/olvide-password frontend/src/features/auth/components/LoginForm.test.tsx`
Verification (frontend): `pnpm lint` · `pnpm type-check` · `pnpm vitest run frontend/src/app/(auth)/olvide-password frontend/src/features/auth/components/SolicitarResetForm.test.tsx frontend/src/features/auth/components/LoginForm.test.tsx frontend/src/middleware.test.ts` · `pnpm test`
Verification (backend): `pnpm lint` · `pnpm typecheck` · `pnpm test`
Rollback boundary: revert de PR11; `app.module.ts` deja de montar el módulo (las dos rutas
vuelven a 404), Ayuda vuelve al texto previo.

---

## Requirement Coverage

| Requirement (spec) | Work Units |
|---|---|
| 1. Respuesta uniforme | WU-3, WU-5, WU-7, WU-9 |
| 2. Sin filtrado por tiempo | WU-4, WU-5, WU-7 |
| 3. Token opaco, solo hash | WU-1, WU-2, WU-5 |
| 4. Nuevo token revoca vigentes | WU-1, WU-2, WU-5 |
| 5. CAS bajo concurrencia | WU-2, WU-6, WU-8 |
| 6. Mismo rechazo, 4 causas | WU-1, WU-2, WU-6, WU-8, WU-9 |
| 7. Mínimo 8 y `hashPassword()` | WU-6, WU-8, WU-9 |
| 8. Revocar sesiones sin condicionar | WU-6, WU-8 |
| 9. Cuenta no disponible no cambia | WU-6, WU-8 |
| 10. Mail de confirmación | WU-3, WU-6, WU-8 |
| 11. Link solo desde APP_BASE_URL | WU-3, WU-5 |
| 12. Sin plaintext/token en logs | WU-3, WU-4, WU-5, WU-6 |
| 13. Rate limiting propio | WU-4, WU-7, WU-8 |
| 14. Flujo self-service completo | WU-9, WU-10, WU-11 |
| 15. Ayuda actualizada | WU-11 |

## Threat Matrix

N/A — el diseño la marca `N/A` (sin shell, subprocesos, automatización de VCS/PR ni
clasificación de ejecutables). El borde adversarial real es HTTP público, cubierto arriba por
cada tarea etiquetada `abuso:` (Superficie de abuso del diseño), propagada como test explícito
en WU-2, WU-3, WU-4, WU-5, WU-6, WU-7 y WU-8.
