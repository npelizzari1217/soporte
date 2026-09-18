# Tasks: Reset de contraseña por admin/root

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~808 en total (afina hacia arriba la estimación de ~430-610 del proposal — medida archivo por archivo contra los moldes reales: `cambiar-password.use-case.ts` 88 líneas / su spec 225 líneas para 6 casos, `editar-usuario-dialog.tsx` 112 líneas, `editar-usuario-dialog.test.tsx` 55 líneas para UN escenario que acá necesita crecer a cuatro) |
| 400-line budget risk | High para un PR único; el corte en 3 unidades deja las tres bajo presupuesto (335 / 147 / 326) |
| Chained PRs recommended | Yes |
| Suggested split | 3 PRs encadenados y SECUENCIALES: WU-1 (caso de uso) → WU-2 (endpoint) → WU-3 (frontend). Sin paralelismo posible: WU-2 necesita la clase de WU-1, WU-3 necesita el contrato HTTP de WU-2 (path, body, códigos de error) |
| Delivery strategy | ask-on-risk |
| Chain strategy | Propuesta: Stacked PRs a `main`, en el orden WU-1 → WU-2 → WU-3. Cada unidad es mergeable y segura por sí sola (WU-1 es código sin cablear pero probado; WU-2 deja el endpoint operativo tras el guard; WU-3 lo consume). No hace falta tracker: no hay ensamblado final que coordinar. Decisión final del dueño, no de esta fase |

**Decision needed before apply: Yes** — `delivery_strategy: ask-on-risk` exige que el orquestador lleve este forecast al dueño antes de `sdd-apply`.

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High (PR único, ~808 líneas) / Low-Medium por unidad tras el corte en 3
```

### Por qué el número sube respecto del proposal (~430-610 → ~808)

El proposal estimó sobre la superficie de archivos, no sobre líneas reales de moldes
comparables. Dos fuentes concretas de la diferencia:

1. **Los tests SON el entregable, no cobertura de acompañamiento** (así lo pide esta
   fase): la spec del caso de uso cubre 8 filas de la tabla de abuso de `design.md`
   (aislamiento, no-enumeración, hash, revocación degradada, disponibilidad, plaintext)
   más los dos escenarios admin-a-admin/auto-reset — comparable en tamaño a
   `cambiar-password.use-case.spec.ts` (225 líneas para 6 casos), pero con más casos.
2. **ADR-3 (secuencia de dos mutaciones con corte)** obliga a reescribir el `submit` del
   diálogo y a agregar CUATRO escenarios de componente donde hoy hay uno solo
   (`editar-usuario-dialog.test.tsx`, 55 líneas totales).

### Estimación de líneas por unidad

| Unidad | Archivos | Líneas est. | ¿Bajo 400? |
|---|---|---|---|
| WU-1 — caso de uso | `resetear-password-usuario-tenant.use-case.ts` (crear, ~105), `resetear-password-usuario-tenant.use-case.spec.ts` (crear, ~230) | ~335 | Sí |
| WU-2 — endpoint | `usuario-tenant.dto.ts` diff (~12), `usuarios.controller.ts` diff (~35), `auth.module.ts` diff (~15), `usuarios.controller.spec.ts` diff (~85) | ~147 | Sí |
| WU-3 — frontend | `schemas.ts` diff (~25), `types.ts` diff (~8), `use-usuarios-tenant-mutations.ts` diff (~28), `editar-usuario-dialog.tsx` diff (~95), `editar-usuario-dialog.test.tsx` diff (~170) | ~326 | Sí |

## Convenciones

`strict_tdd: false` para esta feature (no es corrección de defecto): NO hay pasos
RED/GREEN/REFACTOR separados. Cada tarea de código incluye su test en el mismo commit, y
el test puede escribirse antes o después de la implementación — lo único obligatorio es
que viajen juntos. La entrada `rules.tasks` de `openspec/config.yaml` ("Tests ANTES que la
implementación, TDD estricto") es la regla genérica de bugfix; el propio precedente de este
repo (`2026-09-18-modelos-equipo-catalogo-y-compatibilidad/tasks.md:32-35`) confirma que no
aplica a una feature. Como este endpoint escribe la credencial de un tercero, los tests de
autorización van desglosados uno por comportamiento (no como ítem final "agregar tests").

## Orden y paralelismo

Estrictamente secuencial, sin unidades paralelas: WU-2 importa la clase que crea WU-1;
WU-3 llama a un endpoint (`PATCH /usuarios/:id/password`) que solo existe tras WU-2. Es el
mismo criterio que ya señaló el proposal: "el frontend no se puede construir contra un
endpoint que no existe".

WU-1 queda sin consumidor hasta WU-2 (código cableado en ningún lado, pero completo y
probado) — es una concesión deliberada para mantener cada PR bajo el presupuesto de 400
líneas; se revierte solo sin dejar nada roto porque nada lo invoca todavía.

---

## WU-1 — commit 1: `feat(auth): caso de uso de reset de contraseña por admin`

- [x] 1.1 [R1,R2,R9] `backend/src/auth/application/use-cases/resetear-password-usuario-tenant.use-case.ts`:
      crear. Constructor con `Pick<IUsuarioRepository,'findById'|'save'>`,
      `Pick<IMembresiaRepository,'findActivaByUsuarioYCliente'>`, `IHashProvider`,
      `Pick<IRefreshTokenRepository,'revokeAllByUsuarioId'>`, `ILogger` — molde de
      `editar-usuario-tenant.use-case.ts:43-47` (scoping) + `cambiar-password.use-case.ts:51-57`
      (credenciales). `execute()`: 1) `findActivaByUsuarioYCliente(usuarioId, clienteId)` → null
      → `MembresiaNoEncontradaError` (`editar-usuario-tenant.use-case.ts:52-58`); 2)
      `findById(usuarioId)` → null → el MISMO `MembresiaNoEncontradaError` (`:60-63`, no
      enumera entre inquilinos); 3) `!usuario.activo || usuario.isDeleted()` →
      `UsuarioNoDisponibleError` (`auth.errors.ts:215`, ADR-5, molde
      `login.use-case.ts:111`); 4) `usuario.hashPassword(password, hashProvider)`
      (`usuario.entity.ts:191`) — ÚNICA vía, prohibido `argon2` directo; 5)
      `usuarioRepo.save(usuario)`; 6) `try { revokeAllByUsuarioId(usuarioId) } catch { logger.error(...) }`
      SIN propagar, SIN plaintext (molde `cambiar-password.use-case.ts:77-84`); 7)
      `Result.ok(undefined as unknown as void)`.
- [x] 1.2 [R1] Test: un ADMINISTRADOR resetea a un usuario con membresía activa en su
      cliente y un ROOT (`is_global_admin: true`) resetea en el cliente B — ambos verifican
      `hashProvider.hash` llamado con el plaintext y `usuarioRepo.save` llamado con el
      usuario mutado (`resetear-password-usuario-tenant.use-case.spec.ts`, molde
      `cambiar-password.use-case.spec.ts:101-117`).
- [x] 1.3 [R2] Test: un usuario cuya única membresía activa está en el cliente B recibe
      `MembresiaNoEncontradaError` al resolverse desde el cliente A del actor, y
      `usuarioRepo.save` NUNCA se llama.
- [x] 1.4 [R2] Test: un `usuarioId` inexistente devuelve el MISMO `MembresiaNoEncontradaError`
      del caso anterior; test defensivo adicional para `findById` nulo tras una membresía
      encontrada (molde `editar-usuario-tenant.use-case.ts:60-63`).
- [x] 1.5 [R9] Test: cuenta global inactiva o soft-deleted con membresía activa en el tenant
      del actor → `UsuarioNoDisponibleError`; `passwordHash` no se modifica; `usuarioRepo.save`
      NUNCA se llama.
- [x] 1.6 [R1] Test: el hash guardado se produce con LA MISMA instancia de `IHashProvider`
      inyectada (assert sobre `hashProvider.hash`, nunca una llamada a `argon2` fuera de esa
      instancia) — blanco #1 de la mutación adversarial de `sdd-verify`.
- [x] 1.7 [R7,R8] Test: `usuarioRepo.save` ocurre ANTES que `revokeAllByUsuarioId` (sin
      timers, molde `cambiar-password.use-case.spec.ts:155-175`); test separado para la
      revocación que rechaza — `Result.ok`, `save` llamado 1 vez, `logger.error` llamado 1
      vez, molde `cambiar-password.use-case.spec.ts:177-193`.
- [x] 1.8 [R4] Test: un ADMINISTRADOR resetea a otro ADMINISTRADOR del mismo cliente, y un
      ADMINISTRADOR resetea su propia contraseña (`usuarioId === actor.sub`) — ambos casos
      reportan éxito, documentando que el caso de uso NO agrega restricción extra (la única
      restricción de rol vive en el guard de WU-2).
- [x] 1.9 [R10] Test: el argumento pasado a `logger.error` en el camino de revocación
      fallida NO contiene el plaintext de la contraseña (assert explícito sobre el string,
      no un snapshot).
- [x] 1.10 Cierre WU-1: `pnpm vitest run src/auth/application/use-cases/resetear-password-usuario-tenant.use-case.spec.ts`
      + `pnpm lint` + `pnpm typecheck` en verde. Commit.

---

## WU-2 — commit 2: `feat(auth): endpoint PATCH /usuarios/:id/password`

- [x] 2.1 [R6] `backend/src/auth/interface/dtos/usuario-tenant.dto.ts`: agregar
      `ResetearPasswordUsuarioDto { @IsString() @MinLength(8) password: string }`, molde de
      `EditarUsuarioDto` (`:92-101`), SIN `clienteId`.
- [x] 2.2 [R1,R2,R9] `backend/src/auth/interface/controllers/usuarios.controller.ts`:
      agregar `@Patch(':id/password')` + `@UseGuards(AdminClienteGuard)` +
      `@HttpCode(HttpStatus.NO_CONTENT)` junto a `editar()` (`:264-283`, ADR-1).
      `clienteId: actor.cliente_id as string` SIEMPRE del JWT, NUNCA del body ni del path
      (molde `:271-272`). Llama a `ResetearPasswordUsuarioTenantUseCase.execute({ clienteId, usuarioId, password: dto.password })`;
      en fallo, `throw toHttpException(result.getError())` REUTILIZANDO el mapeo existente
      (`:136-148`, sin tocarlo: `MembresiaNoEncontradaError`→404 en la rama `:139-141`,
      `UsuarioNoDisponibleError`→422 por el fallthrough `:145-147`). Actualizar el mapa de
      rutas del JSDoc de cabecera (`:5-13`).
- [x] 2.3 [R1] `backend/src/auth/auth.module.ts`: agregar provider `useFactory` para
      `ResetearPasswordUsuarioTenantUseCase` con `USUARIO_REPOSITORY`, `MEMBRESIA_REPOSITORY`,
      `HASH_PROVIDER`, `REFRESH_TOKEN_REPOSITORY`, `LOGGER` — molde del provider de
      `CambiarPasswordUseCase` (`:234-243`).
- [x] 2.4 [R3] Test controller: un actor sin `esAdminDeCliente` (TECNICO y SOLICITANTE)
      recibe 403 EN ESTA RUTA (`PATCH /:id/password`), nunca heredado del test de una ruta
      hermana.
- [x] 2.5 [R2] Test controller: el `clienteId` que recibe el caso de uso sale de
      `actor.cliente_id` (JWT) aunque el body de la request traiga otro valor — el DTO no lo
      declara y `whitelist: true` lo descartaría si llegara.
- [x] 2.6 [R2,R9] Test controller: `MembresiaNoEncontradaError` → 404;
      `UsuarioNoDisponibleError` → 422 — usando el `toHttpException` existente, sin rama
      nueva.
- [x] 2.7 [R10] Test controller: la respuesta 204 no lleva cuerpo — ninguna superficie de
      respuesta puede transportar el plaintext.
- [x] 2.8 Cierre WU-2: `pnpm vitest run src/auth/interface/controllers/usuarios.controller.spec.ts`
      + `pnpm lint` + `pnpm typecheck` en verde. Commit.

---

## WU-3 — commit 3: `feat(usuarios): campo de reset de contraseña en EditarUsuarioDialog`

- [x] 3.1 [R5,R6] `frontend/src/features/usuarios/schemas.ts`: sumar `password` y
      `repetirPassword` a `editarUsuarioSchema` como `z.string()` (cadena vacía = "no
      cambiar") con `.superRefine` que SOLO valida si `password` no está vacío (mínimo 8 +
      coincidencia con `repetirPassword`) — molde de `cambiarPasswordSchema`
      (`frontend/src/features/auth/schemas.ts:25-34`), ADR-6 (`design.md:242-253`).
- [x] 3.2 `frontend/src/features/usuarios/types.ts`: agregar
      `ResetearPasswordUsuarioDto { password: string }`, espejo del DTO backend, SIN
      `clienteId`.
- [x] 3.3 [R5] `frontend/src/features/usuarios/hooks/use-usuarios-tenant-mutations.ts`:
      crear `useResetearPasswordUsuarioTenant(usuarioId)` — `PATCH usuarios/${usuarioId}/password`,
      SIN toasts (nacen del diálogo, ADR-3). Modificar `useEditarUsuarioTenant` (`:55-69`)
      para ceder sus toasts al diálogo, conservando su `invalidateQueries`.
- [x] 3.4 [R5] `frontend/src/features/usuarios/components/editar-usuario-dialog.tsx`:
      reescribir el `submit()` con la secuencia de corte de ADR-3 (`design.md:119-157`): dos
      campos nuevos `type="password"` (`password`, `repetirPassword`); PATCH de identidad
      primero SOLO si `nombre`/`apellido` cambiaron respecto de `usuario`, y si falla se
      corta ahí (el segundo PATCH nunca se emite); PATCH de password SOLO si el campo no
      está vacío; mensajes y cierre condicional para los tres desenlaces alcanzables (tabla
      `design.md:138-143`); el diálogo emite los toasts, no los hooks.
- [x] 3.5 [R5] Test componente — desenlace 1: identidad y password ok (o solo identidad con
      el campo de password vacío) → toast de éxito, el diálogo cierra.
- [x] 3.6 Test componente — desenlace 2: falla el PATCH de identidad → NADA cambia, el
      PATCH de password NUNCA se emite, el diálogo permanece abierto con el mensaje de
      error.
- [x] 3.7 Test componente — desenlace 3: identidad ok, reset de password falla → mensaje
      explícito de que nombre/apellido se guardaron pero la contraseña NO cambió, diálogo
      abierto, credencial intacta.
- [x] 3.8 [R5] Test componente: con el campo de password vacío, la llamada HTTP al endpoint
      de password NO ocurre — una sola llamada (identidad), fila 8 de la tabla de abuso de
      `design.md:371`.
- [x] 3.9 [R6] Test schema: una contraseña de 7 caracteres se rechaza en el form ANTES de
      tocar el backend; contraseñas distintas marcan `repetirPassword`; campo vacío es
      válido.
- [x] 3.10 Cierre WU-3 y del ciclo: anotar la deuda de Ayuda en el mensaje del commit y en
      el cuerpo del PR (pausa vigente desde 2026-09-07 — `backend/ayuda/*.md` sin cambios;
      este ciclo agrega una capacidad visible en Admin > Usuarios); `pnpm vitest run src/features/usuarios`
      + `pnpm lint` + `pnpm type-check` en verde; correr la suite `pnpm test` COMPLETA de
      frontend Y de backend antes de `sdd-verify`. Commit.

---

## Fuera de alcance (heredado del proposal y del design, no se re-abre)

Email o cualquier notificación (`backend/src/notificaciones/**` sin cambios); forzado de
cambio en el próximo login (sin migración de Prisma); tabla o mecanismo de auditoría
genérico; `backend/scripts/reset-password.ts` sin cambios; reescritura de
`AdminClienteGuard`/`esAdminDeCliente`; endpoint combinado `PATCH /usuarios/:id` con
`password?` (rechazado en ADR-3: ensancharía permanentemente la superficie de escalación
de privilegios); `PUT`/`POST` como verbo de la ruta nueva (rechazados en ADR-1); artículos
de Ayuda nuevos (pausa vigente, la deuda se anota en commit/PR); tests de integración o
e2e (ninguno de los dos precedentes los tiene — el aislamiento es lógica pura del caso de
uso).

## Trazabilidad requisito → tarea

| Requisito (spec) | Tareas |
|---|---|
| R1 Un admin del tenant resetea la contraseña de un miembro activo | 1.1, 1.2, 2.2, 2.3 |
| R2 El aislamiento de tenant nunca filtra existencia | 1.1, 1.3, 1.4, 2.2, 2.5, 2.6 |
| R3 Un actor sin rol de administración es rechazado | 2.2, 2.4 |
| R4 Sin restricciones adicionales admin-a-admin | 1.8 |
| R5 El campo de contraseña vacío no modifica la contraseña | 3.1, 3.3, 3.4, 3.5, 3.6, 3.8 |
| R6 La contraseña nueva respeta el largo mínimo de alta | 2.1, 3.1, 3.9 |
| R7 Las sesiones del destino se revocan tras un reset exitoso | 1.1, 1.7 |
| R8 Un fallo de revocación no hace fallar la respuesta | 1.1, 1.7 |
| R9 No se establece contraseña sobre una cuenta global no disponible | 1.1, 1.5, 2.2, 2.6 |
| R10 El plaintext nunca se expone | 1.1, 1.9, 2.7 |

Threat Matrix del design: N/A — sin filas aplicables (`design.md:390-397`); la superficie
adversarial real es la tabla de autorización HTTP, ya propagada a 1.2-1.9 y 2.4-2.7.
