# Proposal: Reset de contraseña por admin/root

## Intent

Hoy un usuario que perdió su contraseña **no tiene salida dentro del producto**. `POST /auth/change-password` exige `passwordActual` y fija `usuarioId` en `user.sub` (`backend/src/auth/interface/controllers/auth.controller.ts:215-231`): sirve solo para el autocambio. Ninguna de las 8 rutas de `UsuariosController` toca `passwordHash`. La única vía existente es `backend/scripts/reset-password.ts`, un script de operaciones que corre con acceso a la base de producción — es decir, una escalación operativa para un problema de soporte cotidiano.

Este ciclo cierra ese hueco: un ADMINISTRADOR o ROOT del tenant establece una contraseña nueva para un usuario de su tenant, desde la pantalla que ya usa para gestionarlo.

## Decisiones cerradas por el dueño

| # | Decisión | Razón |
|---|---|---|
| 1 | **El admin ESCRIBE la contraseña**, en un campo dentro del `EditarUsuarioDialog` existente (`frontend/src/features/usuarios/components/editar-usuario-dialog.tsx`). **Campo vacío = "no cambiar la contraseña"** | Reusa el molde que ya edita `nombre`/`apellido`; no necesita canal de entrega ni modal de éxito con clave visible una sola vez |
| 2 | **La entrega la hace el admin**, fuera del sistema | No se toca `backend/src/notificaciones/`: mandar la clave en claro por email la deja en la bandeja y en los logs del SMTP, y el módulo no tiene hoy ningún consumidor fuera de `tickets/` |
| 3 | **No se fuerza el cambio en el próximo login** | No existe ningún campo tipo `mustChangePassword` en `master.usuarios`. Evita deliberadamente la migración de Prisma más el cambio en `LoginUseCase` y en el login del frontend. El usuario cambia su clave cuando quiera por la pantalla existente |
| 4 | **Sin restricciones de autorización extra**: cualquier ADMINISTRADOR o ROOT del tenant puede resetear a cualquier usuario con membresía activa en ese tenant, incluido otro admin y él mismo | Es exactamente cómo se comportan hoy `PATCH /:id/rol` (`usuarios.controller.ts:230`), `PATCH /:id` (:264-265) y `DELETE /:id/membresia` (:291-292), cada uno con `@UseGuards(AdminClienteGuard)` por método y ninguna excepción de auto-reset ni de admin-a-admin. El aislamiento multi-tenant queda igual que está |
| 5 | **El reset usa su PROPIO endpoint**, no `PATCH /usuarios/:id` (decisión técnica del orquestador, ya comunicada al dueño) | El reset debe revocar las sesiones del destino, y la regla del repo es que un fallo de revocación NO debe hacer fallar la respuesta porque la contraseña ya cambió. Esa semántica no se mezcla con "guardé el apellido". Además `EditarUsuarioDto` hoy solo acepta `nombre?` y `apellido?` (`backend/src/auth/interface/dtos/usuario-tenant.dto.ts:92-101`) |

## Reglas NO NEGOCIABLES (restricciones, no sugerencias)

Heredadas de un incidente real de producción y de `CambiarPasswordUseCase` (`backend/src/auth/application/use-cases/cambiar-password.use-case.ts:41-49,74-84`):

1. **Hashear SOLO vía `usuario.hashPassword()`** (`backend/src/auth/domain/entities/usuario.entity.ts:191`), la misma instancia de `IHashProvider` con la que verifica el login. **Prohibido invocar `argon2` directo.** El JSDoc del caso de uso cita *"el bug real de `scripts/reset-password.ts`"*, cuyo header documenta un wrapper de PowerShell que reportó éxito con un hash que no validaba contra `LoginUseCase`, **dejando al usuario afuera pese al "OK"** (`backend/scripts/reset-password.ts:6-19`).
2. **Revocar todas las sesiones del destino después de persistir**, dentro de un `try/catch` que **NO propaga el fallo**: la contraseña ya cambió y fallar la respuesta mentiría sobre el estado real de la credencial. Solo deja rastro con `logger.error`.
3. **El plaintext nunca se loguea ni se imprime**, ni parcial, ni en mensajes de error, ni en un evento de dominio.

## Scope

### In Scope

- Caso de uso nuevo en `backend/src/auth/application/use-cases/`, con el molde de scoping por membresía de `EditarUsuarioTenantUseCase` (`editar-usuario-tenant.use-case.ts:52-63`) más las tres reglas de arriba.
- Endpoint propio en `UsuariosController`, con `@UseGuards(AdminClienteGuard)` **por método** (ADR-P5), más DTO de request.
- Wiring en `backend/src/auth/auth.module.ts`.
- Campo de contraseña opcional dentro de `EditarUsuarioDialog`, su schema Zod y el hook de mutación.
- Tests de caso de uso, de controlador y del componente.

### Out of Scope

- **Email o cualquier notificación**: no se toca `backend/src/notificaciones/`.
- **Forzado de cambio en el próximo login**, y por lo tanto **ninguna migración de Prisma**.
- **Tabla o mecanismo de auditoría**: no existe audit-trail genérico para acciones administrativas; inventarlo excede este ciclo. Trazabilidad, si se quiere, es un `logger.info` estructurado sin plaintext.
- **`backend/scripts/reset-password.ts`**: sigue siendo el mecanismo de última instancia fuera de la UI, sin cambios.
- **`AdminClienteGuard` y `esAdminDeCliente`**: no se reescriben. El aislamiento de tenant sigue viviendo dentro del caso de uso.
- **Artículos de Ayuda**: pausa vigente desde el 2026-09-07. Ver abajo.

## Capabilities

### New Capabilities

- `usuarios-reset-password`: quién puede establecer la contraseña de otro usuario del tenant, qué pasa con las sesiones del usuario reseteado, y cómo convive ese campo con la edición de identidad en el mismo diálogo.

### Modified Capabilities

- Ninguna. `openspec/specs/` hoy solo contiene `preventivo-*`, `repuestos-autoridad-catalogo`, `fechas-sesion-utc` y `modelos-equipo-catalogo`; ninguna describe auth ni gestión de usuarios.

## Approach

| Pieza | Enfoque |
|---|---|
| Caso de uso | `findActivaByUsuarioYCliente(usuarioId, actor.cliente_id)` primero; sin membresía → `MembresiaNoEncontradaError`. Luego `hashPassword()` → `save()` → revocación en `try/catch` no propagante |
| Endpoint | Ruta propia bajo `usuarios/:id`, verbo y path exactos a fijar en `sdd-design`. `clienteId` SIEMPRE de `actor.cliente_id`, nunca del body |
| Errores | Reusa `MembresiaNoEncontradaError` → 404 vía el `toHttpException` existente (`usuarios.controller.ts:136-148`). Error nuevo solo si el diseño lo justifica |
| Frontend | Campo opcional en el diálogo existente; el schema espeja el `min(8)` de `crearUsuarioTenantSchema` (`frontend/src/features/usuarios/schemas.ts:28`). Hook nuevo con el molde de `useEditarUsuarioTenant` (`use-usuarios-tenant-mutations.ts:55-69`) |

## Comportamientos verificables para `sdd-spec`

1. Un ADMINISTRADOR (o ROOT) del tenant resetea la contraseña de un usuario con membresía activa en ese tenant, y el usuario puede loguearse con la clave nueva.
2. Tras un reset exitoso, las sesiones activas del usuario destino quedan revocadas.
3. Si la revocación falla, la respuesta sigue siendo exitosa y queda registro en el log; la contraseña quedó cambiada.
4. Un TECNICO o SOLICITANTE sin `esAdminDeCliente` recibe **403**.
5. Un ADMINISTRADOR del cliente A **no puede** resetear a un usuario cuya única membresía está en el cliente B, y recibe **el mismo error que ante un usuario inexistente**, de modo que no se filtra existencia entre tenants (es lo que ya hace `EditarUsuarioTenantUseCase`, `editar-usuario-tenant.use-case.ts:52-62`).
6. Con el campo de contraseña vacío, guardar el diálogo **no modifica** la contraseña del usuario.
7. Ni la respuesta, ni los logs, ni los mensajes de error contienen el plaintext.

## Pregunta abierta — la resuelve `sdd-design`, no esta propuesta

**El botón "Guardar" del diálogo pasa a poder disparar DOS mutaciones**: la edición de identidad (`PATCH /usuarios/:id`) y el reset de contraseña (endpoint propio). Eso es una **superficie de fallo parcial**: una puede tener éxito y la otra fallar, y el usuario vería un solo botón con dos resultados posibles. Orden, atomicidad aparente, qué se le informa al admin cuando una sola falla, y si el diálogo se cierra o no en ese caso, son decisiones de diseño. **Esta propuesta las registra; no las decide.**

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `backend/src/auth/application/use-cases/` | New | Caso de uso del reset y su test |
| `backend/src/auth/interface/controllers/usuarios.controller.ts` | Modified | Ruta nueva con `AdminClienteGuard` por método |
| `backend/src/auth/interface/dtos/usuario-tenant.dto.ts` | Modified | DTO de request del reset |
| `backend/src/auth/auth.module.ts` | Modified | Wiring del caso de uso |
| `backend/src/auth/domain/errors/auth.errors.ts` | Sin cambios previstos | Reusa `MembresiaNoEncontradaError` |
| `frontend/src/features/usuarios/components/editar-usuario-dialog.tsx` | Modified | Campo de contraseña opcional |
| `frontend/src/features/usuarios/schemas.ts` · `hooks/use-usuarios-tenant-mutations.ts` | Modified | Schema y hook de mutación |
| `backend/src/notificaciones/**` · `backend/scripts/reset-password.ts` | **Sin cambios** | Cerrado por las decisiones 2 y por alcance |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| **Escalación de privilegios.** Es el riesgo central: un endpoint que escribe `passwordHash` de un tercero | Alta | Los tests DEBEN probar los comportamientos 4 y 5 de arriba como escenarios explícitos. `sdd-verify` debería dirigir su mutación adversarial al chequeo de membresía y al guard |
| **Hash inconsistente con el login** si alguien hashea con `argon2` directo | Media | Regla 1, escrita como restricción. Reproduce EXACTAMENTE el incidente de `scripts/reset-password.ts`: usuario bloqueado pese a un éxito reportado. Segundo objetivo de la mutación adversarial |
| **Filtración del plaintext** por log, mensaje de error o respuesta | Media | Regla 3. Ningún test debe imprimir la clave; ningún DTO de respuesta la devuelve |
| **Sesiones viejas sobreviven** si la revocación falla en silencio | Baja | Es el mismo trade-off ya aceptado en el autocambio. Se documenta en el diseño; no se cambia la regla |
| **Fallo parcial de las dos mutaciones del botón "Guardar"** | Media | Pregunta abierta arriba: la cierra `sdd-design` |
| **Presupuesto de revisión de 400 líneas.** La exploración estima **~430-610 líneas** sin email | Alta | La estrategia de entrega es `ask-on-risk`. `sdd-tasks` DEBE producir el Review Workload Forecast formal con sus tres líneas guarda y recomendar el encadenamiento si corresponde; **esta propuesta no decide el corte** |
| **Deuda de Ayuda** | Media | El cambio agrega una capacidad visible en `Admin > Usuarios`, así que **genera deuda**: se anota en el mensaje del commit y en el cuerpo del PR. **No se escribe ningún artículo** mientras dure la pausa del 2026-09-07. Si algún artículo existente queda FALSO, corregirlo — esa excepción sigue vigente |

## Rollback Plan

`git revert` de los commits del ciclo. No hay migración ni cambio de forma de datos: `passwordHash` ya existe y el reset solo lo sobrescribe. Las contraseñas establecidas mientras la funcionalidad estuvo viva **siguen siendo válidas** después del revert — están hasheadas con el mismo `IHashProvider` que usa el login — y las sesiones revocadas siguen revocadas. Lo único que desaparece es la capacidad de volver a hacerlo desde la UI; `scripts/reset-password.ts` queda como estaba y sigue cubriendo el caso de última instancia.

## Dependencies

- Ninguna externa. Se apoya en `CambiarPasswordUseCase`, `EditarUsuarioTenantUseCase`, `AdminClienteGuard` y `IRefreshTokenRepository`, todos ya entregados.

## Success Criteria

- [ ] Un ADMINISTRADOR del tenant establece una contraseña nueva para un usuario de su tenant, y ese usuario se loguea con ella.
- [ ] Tras el reset, las sesiones activas del usuario destino quedan revocadas; si la revocación falla, la operación igual responde éxito y deja rastro en el log.
- [ ] Un usuario sin `esAdminDeCliente` recibe 403 al intentarlo.
- [ ] Un admin del cliente A recibe el mismo error ante un usuario del cliente B que ante un usuario inexistente.
- [ ] Guardar el diálogo con el campo de contraseña vacío deja la contraseña intacta.
- [ ] El hasheo pasa por `usuario.hashPassword()`; no hay ninguna llamada directa a `argon2` en el camino nuevo.
- [ ] Ningún log, mensaje de error ni cuerpo de respuesta contiene la contraseña en claro.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde en backend; `pnpm lint`, `pnpm type-check` y `pnpm test` en verde en frontend.
- [ ] La deuda de Ayuda queda anotada en el commit y en el cuerpo del PR.
