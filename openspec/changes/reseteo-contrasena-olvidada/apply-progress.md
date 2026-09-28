# Apply Progress: Reseteo de contraseña por olvido (self-service)

Mode: Standard (TDD disabled — feature).

## WU-1 — Modelo, migración y entidad — COMPLETO (1.1–1.4)

Files: migración `20260928120000_add_password_reset_tokens`, `schema.prisma` (modelo
`PasswordResetToken` + back-relations), `password-reset-token.entity.ts` + `.spec.ts`.

Deviations: none — sigue ADR-6. `usuario_id` FK usa `ON DELETE CASCADE` (deliberado, diverge de
`refresh_tokens`/`RESTRICT`, tal como fija el design).

Evidence: focused test `pnpm vitest run backend/src/auth/domain/entities/password-reset-token.entity.spec.ts`
→ 14/14 passed. Runtime harness: N/A (sin tabla poblada, sin ruta expuesta). Rollback: revert del
commit; migración aditiva queda huérfana, sin filas.

Verification: `pnpm lint` OK · `pnpm typecheck` OK · `pnpm test` → 465 archivos / 5431 tests OK.
Migración aplicada a `soporte_master` y `soporte_master_test`; cliente Prisma regenerado.

Status: 4/4 tareas completas. Ready for WU-2.

## WU-2 — Puerto, mapper y repo Prisma — COMPLETO (2.1–2.4)

Files: `i-password-reset-token.repository.ts` (create), `password-reset-token.mapper.ts` (create),
`prisma-password-reset-token.repository.ts` + `.integration.spec.ts` (create). Molde:
`prisma-encuesta-token.repository.ts` / `.mapper.ts` (CSAT).

Deviations: none — sigue ADR-5/ADR-6. El puerto no tiene `liberarUso` (a diferencia de
`IEncuestaTokenRepository`): no hay INSERT en el tenant que compensar, `save()` del usuario ya es
el punto de no retorno (ADR-5).

Evidence: focused test
`pnpm vitest run backend/src/auth/infrastructure/persistence/prisma/prisma-password-reset-token.repository.integration.spec.ts`
→ 11/11 passed, incluye el CAS concurrente (`Promise.all` de dos `consumirSiVigente` da
exactamente un `true`) y el CAS sobre token revocado/vencido (`false`). Runtime harness:
`usarLockMasterTest()` contra `soporte_master_test` real (Postgres, no mocks). Rollback: revert
del commit; repo sin consumidores, WU-1 intacto.

Verification: `pnpm lint` OK · `pnpm typecheck` OK · `pnpm test` → 466 archivos / 5442 tests OK.

**`size:exception`** (criterio del dueño, 2026-09-28): 444 líneas cambiadas. Partir habría
mandado a `main` el CAS sin sus tests de abuso (revocado, vencido, concurrencia).

Status: 4/4 tareas implementadas, verificadas y commiteadas.

## WU-3 — escaparHtml, plantillas y adaptador de correo — COMPLETO (3.1–3.6)

Files: `shared/domain/escapar-html.ts` (create), `notificaciones/domain/templates/email-templates.ts`
(modify: importa), `auth/domain/templates/reset-password-email.template.ts` + `.spec.ts`,
`auth/domain/ports/i-correo-de-cliente.port.ts`, `auth/infrastructure/email/correo-de-cliente.adapter.ts`
+ `.spec.ts` (create).

Deviations: none — sigue ADR-4/ADR-7. `enviar()` resuelve `dbName` con un `clienteRepo.findById`
propio (el puerto solo recibe `clienteId`); si el cliente ya no existe, no lanza — defensivo, el
caller ya validó `estado() === 'LISTO'` con el mismo id.

Evidence: focused test `pnpm vitest run backend/src/auth/domain/templates/reset-password-email.template.spec.ts
backend/src/auth/infrastructure/email/correo-de-cliente.adapter.spec.ts` → 11/11 passed. No
regresión: `email-templates.spec.ts` → 14/14 passed. Runtime harness: N/A (funciones puras y
adaptador con dobles). Rollback: revert del commit; `email-templates.ts` vuelve a su
`escaparHtml` local.

Verification: `pnpm lint` OK · `pnpm typecheck` OK · `pnpm test` OK.

Status: 6/6 tareas implementadas y verificadas. Ready for WU-4.

## WU-4 — TareasSegundoPlano, guard de throttling y módulo (sin registrar) — COMPLETO (4.1–4.6)

Files: `shared/domain/ports/i-tareas-segundo-plano.port.ts` (create),
`shared/infrastructure/segundo-plano/tareas-segundo-plano.ts` + `.spec.ts` (create),
`auth/infrastructure/guards/recuperacion-password-throttler.guard.ts` + `.spec.ts` (create),
`auth/recuperacion-password.module.ts` + `.spec.ts` (create).

Deviations: none — sigue ADR-2/ADR-3. El módulo no declara `controllers` todavía (array vacío):
`RecuperacionPasswordController` no existe hasta WU-7/WU-8, tal como fija la lista de archivos
de esta WU en tasks.md. `RecuperacionPasswordThrottlerGuard` se construye por `useFactory` con
una `ThrottlerStorageService` propia — evita un segundo `ThrottlerModule.forRoot()` global
(`CsatModule` ya lo llama). `app.module.ts` sigue sin referenciar el módulo nuevo (verificado con
`rg`).

Evidence: focused test
`pnpm vitest run backend/src/shared/infrastructure/segundo-plano/ backend/src/auth/infrastructure/guards/`
→ 13/13 passed. Runtime harness: N/A — módulo creado, sin controller, no registrado en
`app.module.ts` (mismo criterio que WU-1). Rollback: revert del commit; módulo huérfano sin
importar, `app.module.ts` intacto.

Verification: `pnpm lint` OK · `pnpm typecheck` OK · `pnpm test` OK (ver conteo abajo) ·
`rg -n RecuperacionPasswordModule backend/src/app.module.ts` sin resultados.

Status: 6/6 tareas completas. Ready for WU-5.

## WU-5 — SolicitarResetPasswordUseCase — PARCIAL (5.1–5.3; 5.4 diferida)

Files: `solicitar-reset-password.use-case.ts` + `.spec.ts` (create).

**Presupuesto de línea**: 5.1–5.3 (use case + spec) dan 346 líneas — el flujo de 7 ramas con
log auditable pesa más que el estimado (~285) de tasks.md. Sumar 5.4 (provider de
`SolicitarResetPasswordUseCase`, más wirear `CORREO_DE_CLIENTE`→`CorreoDeClienteAdapter` y
`PASSWORD_RESET_TOKEN_REPOSITORY`→`PrismaPasswordResetTokenRepository`, ninguno provisto en
ningún módulo desde WU-2/WU-3) sumaba ~90 líneas más, total 439 — sobre el techo duro de 400 de
este apply. Costura limpia: el use case y su spec no dependen de DI (se instancian directo en
el test), así que 5.4 se separa sin romper nada — mismo patrón de exposición gradual que WU-1/
WU-4 (pieza creada y probada, no conectada todavía).

Deviations: ninguna en la lógica (ADR-2/3/4/7). Desvío de alcance: 5.4 queda sin commitear por
presupuesto de línea; se resuelve en la próxima pasada de `sdd-apply` o con `size:exception`
del dueño. WU-6 reusa `CORREO_DE_CLIENTE`, así que necesita 5.4 resuelto antes de arrancar.

Evidence: focused test
`pnpm vitest run backend/src/auth/application/use-cases/solicitar-reset-password.use-case.spec.ts`
→ 7/7 passed (las 7 ramas; la de `LISTO` incluye el chequeo de abuso: ningún log contiene el
token crudo ni el email). Runtime harness: N/A — sin DI wireada (5.4 diferida). Rollback:
revert del commit; caso de uso sin consumidores.

Verification: `pnpm lint` OK · `pnpm typecheck` OK · `pnpm test` (ver conteo abajo).

Status: 4/4 tareas completas (5.1–5.3 en WU-5; 5.4 movida a WU-5b, ver abajo). Ready for WU-6.

## WU-5b — Wiring de DI en RecuperacionPasswordModule — COMPLETO (5.4b–5.4c)

Files: `recuperacion-password.module.ts` (modify), `recuperacion-password.module.spec.ts`
(modify: reemplaza el spec de solo-metadata por una compilación real).

Deviations: none — sigue ADR-1/ADR-4/ADR-5/ADR-6/ADR-7. `CLIENTE_EMAIL_CONFIG_REPOSITORY` se
provee local en este módulo (mismo criterio que `notificaciones.module.ts:65-68`, documentado
en `SharedModule` sobre `TENANT_ENUMERATOR`): es un token de alcance módulo, y una segunda
instancia de un adaptador de solo lectura es inofensiva.

Evidence: focused test `pnpm vitest run backend/src/auth/recuperacion-password.module.spec.ts`
→ 3/3 passed, incluye `Test.createTestingModule({ imports: [SharedModule,
RecuperacionPasswordModule] }).compile()` real y `get(SolicitarResetPasswordUseCase)`
resuelve. Runtime harness: la propia compilación de Nest es el harness — arma el grafo de DI
completo (AuthModule + NotificacionesModule + TicketsModule transitivo) sin mocks, molde
`TestHarnessModule` de `csat.e2e.spec.ts:91`; `SharedModule` se importa explícito porque sus
providers son `@Global()` y este grafo aislado no los ve si no. Sin conexión real a Postgres:
`PrismaService` es lazy (`pg.Pool` no abre hasta la primera query). Rollback: revert del
commit; el módulo vuelve a proveer solo lo de WU-4, `app.module.ts` sigue sin registrar nada
(eso es WU-11).

Verification: `pnpm lint` OK · `pnpm typecheck` OK ·
`pnpm vitest run src/auth/recuperacion-password.module.spec.ts` → 3/3 passed ·
`rg -n RecuperacionPasswordModule src/app.module.ts` sin resultados ·
`pnpm test` → 472 archivos / 5476 tests OK.

Status: 2/2 tareas (5.4b–5.4c) completas y commiteadas. WU-5 y WU-5b cierran juntas la tarea
5.4 original. Ready for WU-6.
