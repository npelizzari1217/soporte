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
| 10 | FE: form + página restablecer + middleware | PR 10 (base PR9) | `pnpm vitest run frontend/src/app/(auth)/restablecer-password` | Playwright manual: navegar la ruta de restablecer con `#token=x` | revert PR10: ruta pública desregistrada en `middleware.ts` |
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

**`size:exception`** (criterio del dueño, 2026-09-28): 414 líneas tras la corrección del
verificador independiente (el adaptador no cumplía el "nunca lanza" del puerto). Partir
habría separado el adaptador de sus tests de falla.

Files: `backend/src/shared/domain/escapar-html.ts` (create),
`backend/src/notificaciones/domain/templates/email-templates.ts` (modify: importa),
`backend/src/auth/domain/templates/reset-password-email.template.ts` + `.spec.ts`,
`backend/src/auth/domain/ports/i-correo-de-cliente.port.ts`,
`backend/src/auth/infrastructure/email/correo-de-cliente.adapter.ts` + `.spec.ts`

- [x] 3.1 Mover `escaparHtml` de `email-templates.ts:37` a `backend/src/shared/domain/escapar-html.ts`;
      `email-templates.ts` importa desde ahí. [Req 12]
- [x] 3.2 `templateResetPassword({nombre, token, appBaseUrl, vigenciaMinutos})`: link
      `${appBaseUrl}/restablecer-password#token=${token}`; todo valor interpolado pasa por
      `escaparHtml`. [Req 11]
- [x] 3.3 `templateResetConfirmado({nombre})`. [Req 10]
- [x] 3.4 `.spec.ts` de plantillas: el link empieza con `appBaseUrl` (nunca con `Host`); escapado
      de valores interpolados. [Req 11 — abuso: link con `Host`]
- [x] 3.5 `ICorreoDeCliente` (`estado`, `enviar`) + `CorreoDeClienteAdapter`: `estado()` vía
      `IClienteRepository.findById` + `IClienteEmailConfigRepository.findState().configurado`;
      `enviar()` bindea `tenantContext.run(...)` (molde `sla-sweep.scheduler.ts:45-49`). [Req 1,
      Req 10]
- [x] 3.6 `.spec.ts` del adaptador: los tres estados (`LISTO`/`SIN_CORREO`/`CLIENTE_NO_DISPONIBLE`)
      y que `enviar` corre dentro del `TenantContext` del `clienteId` recibido. [Req 1, Req 10]

Focused test: `pnpm vitest run backend/src/auth/domain/templates/reset-password-email.template.spec.ts backend/src/auth/infrastructure/email/correo-de-cliente.adapter.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/shared/domain/ backend/src/auth/domain/templates/ backend/src/auth/infrastructure/email/` · `pnpm test`
Rollback boundary: revert de PR3; `email-templates.ts` vuelve a su `escaparHtml` local.

## WU-4 — TareasSegundoPlano, guard de throttling y módulo (sin registrar)

**`size:exception`** (criterio del dueño, 2026-09-28): 412 líneas tras la corrección del
verificador independiente (`esperarPendientes()` no esperaba las tareas lanzadas durante la
espera). Partir habría separado el arreglo de su test.

Files: `backend/src/shared/domain/ports/i-tareas-segundo-plano.port.ts`,
`backend/src/shared/infrastructure/segundo-plano/tareas-segundo-plano.ts` + `.spec.ts`,
`backend/src/auth/infrastructure/guards/recuperacion-password-throttler.guard.ts` + `.spec.ts`,
`backend/src/auth/recuperacion-password.module.ts`

- [x] 4.1 `ITareasSegundoPlano.lanzar(etiqueta, tarea)`. [Req 2]
- [x] 4.2 `TareasSegundoPlano`: difiere con `setImmediate`, `Set` de pendientes, `catch` +
      `logger.error('SEGUNDO_PLANO_ERROR | tarea=<etiqueta> | error=<message>')`,
      `esperarPendientes()`, `onApplicationShutdown` la llama. [Req 2, Req 12]
- [x] 4.3 `.spec.ts`: la tarea no corre síncronamente; un rechazo se captura y loguea sin abortar;
      `esperarPendientes()` resuelve cuando el `Set` queda vacío. [Req 2 — abuso: trabajo de rama
      antes de responder]
- [x] 4.4 `RecuperacionPasswordThrottlerGuard` (subclase vacía de `ThrottlerGuard`, `useFactory`,
      storage y `Reflector` propios); tracker por email o por token, sin `x-forwarded-for`.
      [Req 13]
- [x] 4.5 `.spec.ts` del guard: mismo email con `xff` distintos comparte cupo; el intento que
      excede el límite fijado en diseño da 429. [Req 13 — abuso: tracker con `xff`]
- [x] 4.6 `RecuperacionPasswordModule` (imports `AuthModule`, `NotificacionesModule`; controller
      `@Controller('auth')`) creado y probado; **NO se registra en `app.module.ts`** (queda para
      WU-11).

Focused test: `pnpm vitest run backend/src/shared/infrastructure/segundo-plano/tareas-segundo-plano.spec.ts backend/src/auth/infrastructure/guards/recuperacion-password-throttler.guard.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/shared/infrastructure/segundo-plano/ backend/src/auth/infrastructure/guards/` · `pnpm test`
Rollback boundary: revert de PR4; módulo huérfano sin importar, `app.module.ts` intacto.

## WU-5 — SolicitarResetPasswordUseCase

Files: `backend/src/auth/application/use-cases/solicitar-reset-password.use-case.ts` + `.spec.ts`

- [x] 5.1 `SolicitarResetPasswordUseCase.ejecutar(email)`: `findByEmail` → inactivo/inexistente
      fin; `findActivasByUsuario` (mismo query que login) ≠1 fin; `correo.estado(clienteId)`
      ≠`LISTO` fin (sin token); si `LISTO`: `revocarVigentesDeUsuario` → `randomBytes(32)` →
      `save(sha256, +60min TTL, clienteId)` → `correo.enviar(...)` con link `APP_BASE_URL`.
      Atrapa todo internamente, nunca lanza. [Req 1, Req 3, Req 4, Req 11]
- [x] 5.2 Log único `RESET_PASSWORD_SOLICITUD | resultado=<...>` con `usuarioId`/`clienteId`
      cuando existan; nunca email, token ni plaintext. [Req 12]
- [x] 5.3 `.spec.ts`: tabla de ramas (inexistente, inactivo, 0 membresías, 2+ membresías,
      `SIN_CORREO`, `CLIENTE_NO_DISPONIBLE`, `LISTO`) con las llamadas esperadas por rama; en
      ramas sin mail, ni `save` ni `enviar`; se captura el token del mensaje enviado y ninguna
      llamada a `logger.*` lo contiene. [Req 1, Req 12 — abuso: log con token/plaintext]
- [x] 5.4 Provider en el módulo (`useFactory`, `appBaseUrl` desde `entorno.APP_BASE_URL`) —
      DEFERIDO por presupuesto de línea en WU-5; movido a **WU-5b** (costura limpia por
      criterio de dueño, ver apply-progress.md WU-5b).

Focused test: `pnpm vitest run backend/src/auth/application/use-cases/solicitar-reset-password.use-case.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/application/use-cases/solicitar-reset-password.use-case.spec.ts` · `pnpm test`
Rollback boundary: revert de PR5; caso de uso sin controller que lo invoque.

## WU-5b — Wiring de DI en RecuperacionPasswordModule (split de la tarea 5.4)

Split sobre costura limpia (criterio de dueño, 2026-09-28): 5.4 quedó fuera de WU-5 por
presupuesto de línea. El use case y su spec no dependen de DI (se instancian directo en el
test), así que separar el wiring no rompe nada — mismo patrón de exposición gradual que
WU-1/WU-4.

Files: `backend/src/auth/recuperacion-password.module.ts` (modify: agrega los providers),
`backend/src/auth/recuperacion-password.module.spec.ts` (modify: reemplaza el spec de
metadata por una compilación real)

- [x] 5.4b Provider de `SolicitarResetPasswordUseCase` en `RecuperacionPasswordModule`:
      `CORREO_DE_CLIENTE` → `CorreoDeClienteAdapter` (factory con sus colaboradores),
      `PASSWORD_RESET_TOKEN_REPOSITORY` → `PrismaPasswordResetTokenRepository`, y
      `appBaseUrl` desde `entorno.APP_BASE_URL`. Reusa los tokens y providers ya exportados
      por `AuthModule`/`NotificacionesModule`/`SharedModule` — no duplica ninguno. [Req 1,
      Req 3, Req 4, Req 11]
- [x] 5.4c `recuperacion-password.module.spec.ts`: reemplaza el spec de solo-metadata
      (hallazgo del verificador independiente de WU-4: nunca compilaba el módulo) por
      `Test.createTestingModule({ imports: [SharedModule, RecuperacionPasswordModule] }).compile()`
      y asertar que `get(SolicitarResetPasswordUseCase)` resuelve.

Focused test: `pnpm vitest run backend/src/auth/recuperacion-password.module.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/recuperacion-password.module.spec.ts` · `pnpm test` ·
`rg -n RecuperacionPasswordModule backend/src/app.module.ts` sin resultados
Rollback boundary: revert del commit de WU-5b; el módulo vuelve a proveer solo lo de WU-4,
sin `SolicitarResetPasswordUseCase` conectado. `app.module.ts` sigue sin registrar el
módulo (eso es WU-11).

## WU-6 — ConfirmarResetPasswordUseCase

**`size:exception`** (criterio del dueño, 2026-09-28): ~420 líneas. El caso de uso, su error y
su matriz de abuso son un solo flujo (ADR-5); no hay corte limpio.

Files: `backend/src/auth/application/use-cases/confirmar-reset-password.use-case.ts` + `.spec.ts`,
`backend/src/auth/domain/errors/auth.errors.ts` (modify),
`backend/src/auth/auth.module.ts` (modify: exporta `REFRESH_TOKEN_REPOSITORY`)

- [x] 6.1 `ResetLinkInvalidoError` en `recuperacion-password.errors.ts` (no en `auth.errors.ts`: el
      test guardián de `AuthController` exige mapear todo lo que exporta ese archivo). [Req 6]
- [x] 6.2 `AuthModule` exporta `REFRESH_TOKEN_REPOSITORY` (`auth.module.ts:361-388`). [Req 8]
- [x] 6.3 `ConfirmarResetPasswordUseCase.ejecutar(token, passwordNueva)`: `findByHash`
      inválido/usado/revocado/vencido → `ResetLinkInvalidoError`; `findById`
      inactivo/inexistente/soft-deleted → mismo error sin consumir; `usuario.hashPassword()` en
      memoria; `consumirSiVigente` CAS → `false` mismo error; `usuarioRepo.save()`; `try
      revokeAllByUsuarioId catch logger.error` sin propagar; `tareas.lanzar(mail confirmación)`
      por `token.clienteId`. [Req 5, Req 6, Req 7, Req 8, Req 9, Req 10]
- [x] 6.4 `.spec.ts`: las 4 causas de token inválido dan el mismo error; cuenta inactiva no
      consume el token ni cambia `passwordHash`; `revokeAll` rechaza → éxito + `logger.error` sin
      plaintext; mail vía `lanzar` con `clienteId` del token; `usuarioId`/`clienteId` salen solo
      del token, nunca de un parámetro externo. [Req 5, Req 6, Req 7, Req 8, Req 9, Req 10, Req 12
      — abuso: revocación propaga fallo, ids fuera del token]

Focused test: `pnpm vitest run backend/src/auth/application/use-cases/confirmar-reset-password.use-case.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/application/use-cases/confirmar-reset-password.use-case.spec.ts backend/src/auth/domain/errors/` · `pnpm test`
Rollback boundary: revert de PR6; sin controller que exponga el caso de uso.

## WU-7 — Ruta de solicitud

**`size:exception`** (criterio del dueño, 2026-09-28): ~650 líneas. El e2e es la única prueba
del throttling y de las respuestas idénticas; partir separaba la ruta (y el arreglo del guard
de WU-4, que nunca estuvo cableado) de su prueba.

Files: `backend/src/auth/interface/dtos/recuperacion-password.dto.ts` (parte solicitud),
`backend/src/auth/interface/controllers/recuperacion-password.controller.ts` + `.spec.ts` (parte
solicitud), `backend/src/auth/interface/controllers/recuperacion-password.e2e.spec.ts` (parte
solicitud)

- [x] 7.1 `SolicitarResetDto { email: @IsEmail() }`. [Req 1]
- [x] 7.2 `RecuperacionPasswordController`: `POST /auth/forgot-password`,
      `@UseGuards(RecuperacionPasswordThrottlerGuard)`, `@Throttle` 3/15min por email; el handler
      solo llama `tareas.lanzar(...)` y devuelve 204, sin awaitear `ejecutar`. [Req 1, Req 2, Req 13]
- [x] 7.3 `.spec.ts` del controller: `ejecutar` NO se invoca de forma síncrona en el handler.
      [Req 2 — abuso: trabajo de rama antes de responder]
- [x] 7.4 e2e (`TestHarnessModule` propio importando `RecuperacionPasswordModule`, molde
      `csat.e2e.spec.ts:91`; llama `usarLockMasterTest()`): las 6 ramas sin mail dan 204 idéntico
      byte a byte (status, cuerpo, headers sin `Date`); con `EMAIL_SENDER` fake bloqueado, igual
      llega el 204; el 4.º intento del mismo email da 429. [Req 1, Req 2, Req 13 — abuso: respuesta
      difiere por rama, tracker con `xff`]

Focused test: `pnpm vitest run backend/src/auth/interface/controllers/recuperacion-password.controller.spec.ts`
Verification: `pnpm lint` · `pnpm typecheck` · `pnpm vitest run backend/src/auth/interface/controllers/` · `pnpm test`
Rollback boundary: revert de PR7; DTO/ruta viven en módulo aún no registrado en `app.module.ts`.

## WU-8 — Ruta de confirmación

**`size:exception`** (criterio del dueño, 2026-09-28): el e2e es la única prueba del flujo
completo, del reuso y de la concurrencia. Incluye dos correcciones del verificador de WU-7
(caso de email mal formado en el e2e y JSDoc del guard), que tocan el mismo archivo.

Files: `backend/src/auth/interface/dtos/recuperacion-password.dto.ts` (parte confirmación),
`backend/src/auth/interface/controllers/recuperacion-password.controller.ts` + `.spec.ts` (parte
confirmación), `backend/src/auth/interface/controllers/recuperacion-password.e2e.spec.ts` (parte
confirmación)

- [x] 8.1 `ConfirmarResetDto { token: string, passwordNueva: @MinLength(8) }` — el DTO no declara
      `usuarioId` ni `clienteId`; `whitelist: true` (`app.module.ts:71`) los descartaría si
      llegaran. [Req 7 — abuso: ids fuera del token]
- [x] 8.2 `POST /auth/reset-password`, `@Throttle` 5/15min por token; 204 en éxito, 400 con
      mensaje único en cualquier rechazo. [Req 5, Req 6, Req 13]
- [x] 8.3 e2e (llama `usarLockMasterTest()`): token extraído del link del mensaje enviado en
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

- [x] 9.1 `solicitarResetSchema { email }` espeja `@IsEmail`. [Req 14]
- [x] 9.2 `restablecerPasswordSchema { passwordNueva: min(8), repetirPassword }` con `.refine` de
      igualdad, copia de `cambiarPasswordSchema:25-34`. [Req 7, Req 14]
- [x] 9.3 `use-solicitar-reset.ts` (`apiFetch` + `useMutation`): mismo mensaje siempre tras 204;
      429 aviso de límite; 0/5xx infraestructura (criterio `mensajeDeErrorDeLogin`). [Req 1,
      Req 14]
- [x] 9.4 `use-restablecer-password.ts`: 400 → "link no válido o vencido" con enlace a
      la ruta `olvide-password`. [Req 6, Req 14]
- [x] 9.5 Tests de schemas y hooks para cada rama de mensaje.

Focused test: `pnpm vitest run frontend/src/features/auth/schemas.test.ts`
Verification: `pnpm lint` · `pnpm type-check` · `pnpm vitest run frontend/src/features/auth/` · `pnpm test`
Rollback boundary: revert de PR9; hooks y schemas sin página que los importe.

## WU-10 — Frontend: página de restablecer + middleware

**`size:exception`** (criterio del dueño, 2026-09-28): corrección del verificador independiente.
Un 429 o un error de red/5xx ocultaba el formulario sin salida (el token ya no estaba en la
URL); ahora el formulario sigue visible para reintentar. El middleware pasa a coincidencia exacta
para rutas sin `/` final. Partir habría separado el arreglo de sus tests.

Files: `frontend/src/features/auth/components/RestablecerPasswordForm.tsx` + test (create),
`frontend/src/app/(auth)/restablecer-password/page.tsx` + test (create),
`frontend/src/middleware.ts` + `middleware.test.ts` (modify)

- [x] 10.1 `RestablecerPasswordForm.tsx` (presentacional): valida localmente largo mínimo e
      igualdad antes de enviar. [Req 14]
- [x] 10.2 `page.tsx`: lee `window.location.hash` en `useEffect`, `history.replaceState` saca el
      token de la barra de direcciones, sin token muestra mensaje de link inválido. [Req 14]
- [x] 10.3 Suma la ruta `restablecer-password` a `RUTAS_PUBLICAS` en `middleware.ts:35`. [Req 14]
- [x] 10.4 Tests: form (validación local), página (fragmento, `replaceState`, sin token),
      middleware (ruta pública).

Focused test: `pnpm vitest run frontend/src/app/(auth)/restablecer-password`
Verification: `pnpm lint` · `pnpm type-check` · `pnpm vitest run frontend/src/app/(auth)/restablecer-password frontend/src/features/auth/components/RestablecerPasswordForm.test.tsx frontend/src/middleware.test.ts` · `pnpm test`
Rollback boundary: revert de PR10; ruta pública se retira de `middleware.ts`, página deja de
existir.

## WU-11 — Frontend: solicitud, link de login, Ayuda y registro del módulo

Files: `frontend/src/features/auth/components/SolicitarResetForm.tsx` + test (create),
`frontend/src/app/(auth)/olvide-password/page.tsx` + test (create),
`frontend/src/features/auth/components/LoginForm.tsx` + test (modify),
`frontend/src/middleware.ts` (modify: suma la ruta `olvide-password`),
`backend/ayuda/mi-cuenta-contrasena.md` (modify `:31-35`),
`backend/src/app.module.ts` (modify: registra `RecuperacionPasswordModule`)

- [x] 11.1 `SolicitarResetForm.tsx`: siempre el mismo mensaje tras enviar, exista o no el email.
      [Req 14]
- [x] 11.2 `page.tsx` de la ruta `olvide-password`; suma la ruta a `RUTAS_PUBLICAS`. [Req 14]
- [x] 11.3 `LoginForm.tsx`: `<Link href="/olvide-password">¿Olvidaste tu contraseña?</Link>`
      estático. [Req 14]
- [x] 11.4 Reescribe `backend/ayuda/mi-cuenta-contrasena.md:31-35`: ya no afirma la ausencia del
      botón; describe el link nuevo, el vencimiento de 60 min, el cierre de sesiones y el reset
      por admin como vía asistida si el mail no llega. Anota en el commit y en el cuerpo del PR
      la deuda del artículo nuevo (pausa del 2026-09-07 sigue vigente: no se escribe artículo
      nuevo ahora). [Req 15]
- [x] 11.5 **Único punto de registro del módulo**: agrega `RecuperacionPasswordModule` a los
      imports de `app.module.ts`. Ninguna tarea anterior a esta lo hace (ADR-1, Migration /
      Rollout del diseño).
- [x] 11.6 Tests: form (mensaje único), página, `LoginForm` (link presente), middleware
      (la ruta `olvide-password` pública).
- [x] 11.7 e2e manual/smoke post-merge: `POST /auth/forgot-password` contra la app montada
      responde 204 (módulo ya registrado). Verificado vía suite backend completa con el módulo
      registrado (`pnpm test` → 475/475 archivos, 5501/5501 tests), sin un e2e HTTP dedicado
      nuevo — los e2e reales de la ruta ya viven en WU-7/WU-8 contra su propio
      `TestHarnessModule`; este WU solo confirma que el mismo módulo, ya montado en `AppModule`,
      sigue compilando y sin colisión de rutas con `AuthController` (`rg` confirmado).

Focused test: `pnpm vitest run frontend/src/app/(auth)/olvide-password frontend/src/features/auth/components/LoginForm.test.tsx`
Verification (frontend): `pnpm lint` · `pnpm type-check` · `pnpm vitest run frontend/src/app/(auth)/olvide-password frontend/src/features/auth/components/SolicitarResetForm.test.tsx frontend/src/features/auth/components/LoginForm.test.tsx frontend/src/middleware.test.ts` · `pnpm test`
Verification (backend): `pnpm lint` · `pnpm typecheck` · `pnpm test`
Rollback boundary: revert de PR11; `app.module.ts` deja de montar el módulo (las dos rutas
vuelven a 404), Ayuda vuelve al texto previo.

## WU-12 — Corrección acotada tras `sdd-verify` (PASS WITH WARNINGS)

Una única transacción de corrección sobre `verify-report.md` (revisión
`feat/reseteo-contrasena-olvidada-wu11` @ `6c351ad`), con las 5 `WARNING` y las
5 `SUGGESTION` del reporte. Rama `feat/reseteo-contrasena-olvidada-wu12`,
apilada sobre `wu11` (`stacked-to-main`).

Files (todas `modify`): backend — `recuperacion-password.e2e.spec.ts`,
`solicitar-reset-password.use-case.spec.ts`, `confirmar-reset-password.use-case.spec.ts`,
`ayuda/mi-cuenta-contrasena.md`, `reset-password-email.template.ts` + `.spec.ts`,
`correo-de-cliente.adapter.ts`, `tareas-segundo-plano.ts` + `.spec.ts`. frontend —
`use-solicitar-reset.ts`, `use-restablecer-password.ts` (docstring), `olvide-password/page.tsx` +
`.test.tsx`, `restablecer-password/page.tsx` + `.test.tsx`, `middleware.ts`. openspec —
`apply-progress.md`, `state.yaml`.

- [x] 12.1 [W1] e2e: `passwordNueva: 'corta'` con token válido da 400, no toca `password_hash`
      y no consume el token (`used_at IS NULL`). [Req 7]
- [x] 12.2 [W4] `solicitar-reset-password.use-case.spec.ts`: en las 6 ramas sin mail (inexistente,
      inactiva, 0/2+ membresías, `SIN_CORREO`, `CLIENTE_NO_DISPONIBLE`) se asertan
      `tokenRepo.revocarVigentesDeUsuario` y `tokenRepo.save` NO llamados. [Req 4]
- [x] 12.3 [S1] Caso "activo pero soft-deleted" (`UsuarioEntity.reconstitute` con `deletedAt`
      seteado y `activo: true`) en `solicitar-reset-password.use-case.spec.ts` y en
      `confirmar-reset-password.use-case.spec.ts`. [Req 6, Req 9]
- [x] 12.4 [W2] Reescribe `backend/ayuda/mi-cuenta-contrasena.md` — el mail (solicitud y
      confirmación) sale solo con cuenta activa, **una única** membresía activa y correo
      configurado en ese cliente; toda otra combinación no envía nada y deriva al admin. TTL,
      cierre de sesiones y vía asistida sin cambios (pausa del 2026-09-07 vigente). [Req 15]
- [x] 12.5 [W3] `reset-password-email.template.ts`: el mail de confirmación dice "contactá a
      tu administrador" (decisión 3 del dueño), no "contactá a soporte"; test que lo fija.
      [Req 10]
- [x] 12.6 [S2] `CorreoDeClienteAdapter.logError` y `TareasSegundoPlano` loguean
      `error.name`, no `error.message` — mismo criterio que los use cases. [Req 12]
- [x] 12.7 [S3] `/olvide-password`: un 429 o un error de red/5xx mantiene el formulario
      visible con el mensaje arriba (`esTransitorio` en `use-solicitar-reset.ts`), en vez
      de ocultarlo; test `it.each([429, 500])`. [Req 14]
- [x] 12.8 [S4] `/restablecer-password`: `decodeURIComponent` del fragmento en try/catch —
      un token mal codificado se trata como ausente (mensaje genérico de link inválido);
      test con `#token=%E0`. [Req 14]
- [x] 12.9 [S5] Corrige el JSDoc de `use-restablecer-password.ts` (proxy real
      `/api/auth/reset-password`, no `/api/reset-password`) y el comentario de
      `RUTAS_PUBLICAS` en `middleware.ts` (ya no es "match por prefijo").
- [x] 12.10 [W5] Corrige en `apply-progress.md`: el párrafo de WU-7 pegado al final de WU-6
      (sin Status propio), "`pnpm test` completo en curso" en WU-8, la Deviations de WU-10
      que decía que cualquier error ocultaba el formulario, el "(ver conteo abajo)" sin
      conteo de WU-4, y el conteo frontend de WU-11 (1554 → 1557). Suma esta sección WU-12.
      `state.yaml` pasa a `phase: apply` con WU-12 completa.

Focused test (backend): 6 specs tocados arriba — ver `apply-progress.md` WU-12 (50/50 passed).
Verification: backend — `pnpm lint` · `pnpm typecheck` · focused tests · `pnpm test`. frontend —
`pnpm lint` · `pnpm type-check` · specs de `olvide-password`/`restablecer-password`/
`use-solicitar-reset`/`middleware` · `pnpm test`. Detalle y resultados en `apply-progress.md`.
Prueba de mutación (working tree, revertida): quitar `@MinLength(8)` mata 12.1; revocar en
`MEMBRESIAS_N` mata 12.2; quitar `isDeleted()` de cada use case mata 12.3.
Rollback boundary: revert del commit de WU-12; WU-1 a WU-11 quedan intactas — solo agrega tests,
corrige texto/logs y ajusta dos páginas del frontend, sin tocar el contrato HTTP ni el modelo.

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
