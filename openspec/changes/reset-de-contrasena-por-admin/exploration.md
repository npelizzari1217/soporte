# Exploración: Reset de contraseña por admin/root

> Ciclo SDD `reset-de-contrasena-por-admin`.

## Estado actual

### Superficie HTTP de auth existente

- `UsuariosController` (`backend/src/auth/interface/controllers/usuarios.controller.ts:151-405`) expone 8 rutas de gestión del tenant — **ninguna toca `passwordHash`**. Guards de clase: `@UseGuards(JwtAuthGuard, TenantGuard)` (:150). Cada método de escritura agrega `@UseGuards(AdminClienteGuard)` POR MÉTODO (ADR-P5): `POST /` (:197), `PATCH /:id/rol` (:231), `PATCH /:id` (:265), `DELETE /:id/membresia` (:292), `GET`/`PATCH /:id/permisos` (:318, :353), `POST /:id/permisos/aplicar-preset` (:382).
- `AuthController` (`auth.controller.ts:215-231`) expone `POST /auth/change-password` → `CambiarPasswordUseCase`, con `usuarioId` fijado SIEMPRE a `user.sub` (el propio actor). No sirve para que un admin cambie la contraseña de un tercero: el DTO no acepta un `usuarioId` ajeno, y el caso de uso exige `passwordActual`, que el admin no conoce ni debe pedir.

### `CambiarPasswordUseCase` — el precedente que fija las reglas duras

`backend/src/auth/application/use-cases/cambiar-password.use-case.ts:51-88`. Constructor: `IUsuarioRepository`, `IHashProvider`, `IRefreshTokenRepository`, `ILogger`.

1. `usuarioRepo.findById` + chequeo `activo`/`isDeleted()` → `UsuarioNoDisponibleError`.
2. `usuario.verifyPassword(passwordActual, hashProvider)` — **no aplica a un reset por admin**.
3. Rechazo si `passwordNueva === passwordActual` en plaintext — aplicable solo si el admin *escribe* la contraseña.
4. `usuario.hashPassword(passwordNueva, hashProvider)` — **regla dura, sin excepción**. El JSDoc cita el bug real de `scripts/reset-password.ts`: *"Prohibido invocar `argon2` directo"*. La única vía segura es `UsuarioEntity.hashPassword()`, que delega en la MISMA instancia de `IHashProvider` que usa el login para verificar.
5. `usuarioRepo.save(usuario)` — punto de no retorno.
6. `refreshTokenRepo.revokeAllByUsuarioId()` dentro de un `try/catch` que **NO propaga el error**: la contraseña ya cambió, y fallar la respuesta acá le mentiría al usuario sobre el estado real de su credencial. Solo deja rastro con `logger.error`.
7. El plaintext nunca se loguea ni se imprime — mismo contrato en `scripts/reset-password.ts`.

El header de ese script documenta el incidente real: un wrapper de PowerShell reportó éxito con un hash que no coincidía con el verificador de `LoginUseCase`, **dejando al usuario afuera pese al "OK"**.

Estas tres reglas —hashear solo vía `hashPassword()`, no propagar el fallo de revocación, plaintext nunca logueado— son **NO NEGOCIABLES** para cualquier caso de uso nuevo que toque `passwordHash`.

### Modelo de autorización existente

- `JwtPayload` (`i-token.service.ts:50-62`): `sub`, `cliente_id`, `rol`, `permisos`, `is_global_admin`, `membresias[]`.
- **ROOT** = `is_global_admin: true` en `master.usuarios` (`prisma_master/schema.prisma:199`, con el comentario "NUNCA se deriva del rol de una membresía"). Cross-tenant.
- **ADMINISTRADOR** = un `rol` de la `Membresia` activa del usuario en un cliente específico (`schema.prisma:228-247`), NO un atributo del `Usuario` global.
- `esAdminDeCliente(actor)` (`permisos.util.ts:80-82`) = `is_global_admin || rol === 'ADMINISTRADOR'`.
- **`AdminClienteGuard` (`admin-cliente.guard.ts`) SOLO verifica el rol del ACTOR contra su propio JWT.** No conoce ni valida el tenant del usuario destino — eso es responsabilidad exclusiva del caso de uso.
- `GlobalAdminGuard` exige `is_global_admin === true` puro; se usa en endpoints ROOT-only, fuera de `UsuariosController`.
- `TenantGuard` resuelve `cliente_id` del JWT contra `master.clientes`, valida `activo` y bindea `TenantContext`. Corre antes que `AdminClienteGuard`.

**El aislamiento multi-tenant NO vive en el guard: vive en el caso de uso**, por scoping explícito de `(usuarioId, clienteId)`.

`EditarUsuarioTenantUseCase` (`editar-usuario-tenant.use-case.ts:43-70`) es el precedente MÁS CERCANO a lo que se pide: muta identidad GLOBAL del `Usuario` (nombre/apellido, igual que el reset mutaría `passwordHash`), pero antes llama `membresiaRepo.findActivaByUsuarioYCliente(usuarioId, clienteId)` (:52) y sin membresía devuelve `MembresiaNoEncontradaError`. Su JSDoc es explícito: *"Un ADMINISTRADOR de otro cliente nunca distingue 'usuario inexistente' de 'usuario existe pero en otro tenant'"* — y en efecto devuelve el MISMO error cuando el usuario no existe (:62), así que no filtra existencia. `DesactivarMembresiaUsuarioTenantUseCase` sigue el mismo patrón.

Consecuencia: hoy un ADMINISTRADOR no puede tocar a un usuario de otro tenant, porque la query de membresía filtra siempre por `actor.cliente_id`, nunca por un valor de la request.

### Frontend — patrones a seguir

- `usuarios-admin-view.tsx:31-87` es el CONTAINER: gatea con `<SoloAdminCliente>`, arma columnas y monta un control PRESENTATIONAL por fila (`EditarUsuarioDialog`, `CambiarRolControl`, `AsignarPermisosControl`, `DesactivarMembresiaControl`, :54-57). Un `ResetearPasswordControl` se sumaría a esa lista.
- Dos moldes disponibles:
  - **Modal con formulario** (`editar-usuario-dialog.tsx:27-112`): `Dialog` + `react-hook-form` + `zodResolver`, cierra con `setOpen(false)` en `onSuccess`. Encaja si el admin ESCRIBE la contraseña.
  - **ConfirmDialog simple** (`desactivar-membresia-control.tsx:17-35`): confirmación + mutación sin body. Encaja si el sistema GENERA la clave temporal.
- Hooks de mutación (`use-usuarios-tenant-mutations.ts:34-48,71-81`): `useMutation` + `apiFetch` + `invalidateQueries(["usuarios"])` + `notifySuccess`/`notifyError`.
- Schemas Zod (`schemas.ts:12-52`) espejan los DTOs con límites compartidos. Si el admin escribe la clave, espejaría el `min(8)` de `crearUsuarioTenantSchema` (:28).

## Áreas afectadas

- `backend/src/auth/application/use-cases/` — caso de uso nuevo, con el molde de `EditarUsuarioTenantUseCase` (scoping por membresía) más las tres reglas de `CambiarPasswordUseCase`.
- `backend/src/auth/interface/controllers/usuarios.controller.ts` — ruta nueva, con `AdminClienteGuard` por método.
- `backend/src/auth/interface/dtos/usuario-tenant.dto.ts` — DTOs de request/response.
- `backend/src/auth/domain/errors/auth.errors.ts` — probablemente reusa `MembresiaNoEncontradaError`; error nuevo solo si se agrega una regla de restricción.
- `backend/src/auth/auth.module.ts` — wiring del caso de uso.
- `backend/src/notificaciones/` — solo si se decide notificar por email (ver decisión 4).
- `frontend/src/features/usuarios/` — control nuevo, hook, schema si aplica, y una línea en `usuarios-admin-view.tsx`.
- Tests del caso de uso, del controlador y del componente.
- **Ayuda**: SUSPENDIDA desde 2026-09-07. No se escribe artículo; la deuda se anota en el commit y el PR.

## Decisiones abiertas

### 1. ¿El admin escribe la contraseña o el sistema genera una temporal?

| Opción | A favor | En contra |
|---|---|---|
| **El admin la escribe** | Reusa el molde de `EditarUsuarioDialog` casi sin diseño nuevo; no necesita canal de entrega | El admin ve y maneja el plaintext en su navegador: más superficie humana de exposición (captura de pantalla, historial, red corporativa); hay que validar fortaleza en el formulario |
| **El sistema la genera** | El plaintext solo existe efímero en memoria del backend hasta hashear y entregar | Necesita canal de entrega: mostrarla una sola vez en la UI, o mandarla por email con el costo de la decisión 4 |

Ninguna es gratis respecto de "el plaintext nunca se loguea": las dos exigen la misma disciplina que ya practican `CambiarPasswordUseCase` y `reset-password.ts`.

### 2. ¿Se fuerza el cambio en el próximo login?

**Verificado: no existe ningún campo tipo `mustChangePassword` en `model Usuario` (`prisma_master/schema.prisma:185-209`) ni en ninguna otra tabla de master.** Agregar esa semántica exige una migración de Prisma MÁS lógica nueva en `LoginUseCase` y en el flujo de login del frontend para redirigir a un cambio obligatorio. Es una funcionalidad considerablemente más grande que el reset en sí: debe tratarse como decisión explícita de alcance, no asumirse.

### 3. ¿Quién puede resetear a quién?

Con los guards tal como existen HOY:

- Un **ADMINISTRADOR** puede ejecutar cualquier ruta con `AdminClienteGuard` sobre cualquier `usuarioId` con membresía activa en SU MISMO `cliente_id` — **incluido otro ADMINISTRADOR de ese tenant**. No hay hoy ninguna excepción de "no te resetees a vos mismo" ni "no resetees a otro admin" en ningún endpoint existente.
- Un ADMINISTRADOR **no puede** tocar usuarios de otro tenant: el caso de uso scopea siempre por `actor.cliente_id`.
- Un **ROOT** bypassea todo y puede ejecutar la acción en cualquier tenant al que entre por switch.
- Restringir "admin no puede resetear a otro admin" o "nadie se auto-resetea por esta vía" es una regla **NUEVA** a diseñar; no hay precedente que heredar.

### 4. ¿Cómo llega la contraseña nueva al usuario?

`NotificacionesModule` (`notificaciones.module.ts:52-53,61-129`) **no expone controllers HTTP** y funciona 100% por listeners `@OnEvent` sobre eventos que hoy emite solo `tickets/`. Para que el reset dispare un email haría falta:

- Emitir un evento nuevo desde el caso de uso (vía `EventEmitter2`, hoy no cableado en `AuthModule`).
- Un listener nuevo más una plantilla nueva en `email-templates.ts`.
- Reusar `IUsuarioContactoResolver` e `IEmailSender` (`TenantAwareEmailSender`), que ya existen.

**Costo real**: es wiring nuevo en un módulo que hoy no tiene consumidores fuera de `tickets/`. Y mandar la contraseña en claro por email es un riesgo en sí mismo: queda en la bandeja de entrada y en los logs del servidor SMTP. Muchos sistemas lo evitan.

**Alternativa de menor costo**: devolver la clave generada en la respuesta del `POST` y mostrarla UNA SOLA VEZ en un modal de éxito, sin tocar `notificaciones/` en absoluto.

### 5. ¿Se audita el reset?

**No existe ningún mecanismo de audit-trail genérico** para acciones administrativas sobre usuarios. El único patrón de timeline inmutable del repo, `OperacionTicketEntity` (`operacion-ticket.entity.ts:44-56`), está acotado al dominio de tickets. Inventar un audit-trail genérico queda fuera del alcance razonable de este cambio; la opción de menor costo para trazabilidad es un `logger.info` estructurado en el caso de uso, no una tabla nueva.

## Alcance NO incluido (recomendado)

- NO implementar el forzado de cambio en el próximo login: exige migración de schema y tocar `LoginUseCase` más el frontend de login.
- NO construir un audit-trail genérico de acciones administrativas.
- NO tocar `scripts/reset-password.ts` ni sus variables de entorno: sigue siendo el mecanismo de última instancia fuera de la UI.
- NO reescribir `AdminClienteGuard` ni `esAdminDeCliente`. Si se decide una regla más fina, el chequeo va DENTRO del caso de uso, que es donde ya vive el aislamiento de tenant.
- NO escribir artículos de Ayuda: pausa vigente, solo anotar la deuda.

## Estimación de superficie

**Backend**: caso de uso (~60-90), endpoint (~25), DTOs (~20), wiring (~15), tests de caso de uso y de controlador (~150-200). Total **~260-350 líneas**, sin contar email (que sumaría listener, plantilla y tests: otras ~150-200).

**Frontend**: control (~60-110 según sea modal con formulario o confirmación), hook (~15), schema si aplica (~10), una línea en la vista, tests (~80-120). Total **~170-260 líneas**.

**Total estimado: ~430-610 líneas sin email; ~580-810 con email.** Los dos escenarios rozan o superan el presupuesto de revisión de 400, así que `sdd-tasks` tendrá que partir el trabajo.

## Riesgos

- **Escalación de privilegios si el guard o el caso de uso quedan mal armados.** Es el riesgo central. Los tests DEBEN probar, como mínimo: (a) un ADMINISTRADOR del cliente A no puede resetear a un usuario cuya única membresía está en el cliente B, y recibe el mismo 404 que hoy da `MembresiaNoEncontradaError` sin filtrar si el usuario existe en otro lado; (b) un TECNICO o SOLICITANTE sin `esAdminDeCliente` recibe 403; (c) si se decide restringir admin-a-admin o el auto-reset, un test que confirme el bloqueo explícito.
- **Hash inconsistente con el login.** Si un refactor futuro tienta a hashear directo con `argon2` en vez de `usuario.hashPassword()`, reproduce EXACTAMENTE el incidente documentado en `scripts/reset-password.ts`: usuario bloqueado pese a un éxito reportado. La mutación adversarial de `sdd-verify` debería apuntar a esta llamada.
- **Filtración del plaintext.** Cualquier log, mensaje de error o evento de dominio que lleve la contraseña en claro viola la regla del repo. Si se emite un evento para notificaciones, el evento NO debe llevar el plaintext: puede tener otros listeners.
- **La revocación de sesiones no propaga el fallo.** Replicar esa regla es correcto, pero implica que ante un fallo silencioso las sesiones viejas del usuario reseteado podrían seguir vivas con un token ya emitido. Es el mismo trade-off ya aceptado en el autocambio; documentarlo igual en el diseño.
- **Presupuesto de revisión**: con email, el cambio supera cómodamente las 400 líneas.

## Listo para propuesta

Sí, con una condición: las decisiones 1, 3 y 4 son de PRODUCTO, no técnicas, y el orquestador debe resolverlas con el dueño antes de `sdd-propose`, no inferirlas.

**Recomendación de esta exploración, si hiciera falta un default**: el sistema genera la clave temporal y se muestra una sola vez en un modal de éxito, sin tocar `notificaciones/`; cualquier admin o root del tenant puede resetear a cualquier usuario con membresía activa en ese tenant, sin excepción especial salvo que el producto pida lo contrario; y NO se fuerza el cambio en el próximo login en esta primera iteración, para evitar la migración de schema.
