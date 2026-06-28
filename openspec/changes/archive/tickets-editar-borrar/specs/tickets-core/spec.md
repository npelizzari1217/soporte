# Delta Spec: Tickets Core — tickets-editar-borrar

> **Tipo:** delta  
> **Sobre:** `openspec/specs/tickets-core/spec.md`  
> **Change:** `tickets-editar-borrar`  
> **Fecha:** 2026-06-27  
>
> Este archivo describe únicamente los REQUISITOS ADICIONALES que deben ser
> verdaderos después de aplicar el change. Los requirements de la spec canónica
> siguen vigentes sin modificación. No describe implementación — solo comportamiento
> observable y verificable.

---

## Cambios en modelo de datos

### Delta: Tabla `tipo_operacion` — seeds adicionales

Se agregan dos entradas al catálogo semilla de `tipo_operacion` (schema TENANT):

| codigo | nombre |
|--------|--------|
| `EDICION` | Edición de datos |
| `ELIMINACION` | Eliminación (baja lógica) |

Estos seeds MUST aplicarse en la misma migración tenant que agrega los nuevos
permisos de master. El seed MUST ser idempotente
(`INSERT ... ON CONFLICT (codigo) DO NOTHING`).

---

## Requirements

### Requirement: Edición de campos de datos del ticket

`PATCH /tickets/:id` permite modificar el subconjunto de campos de datos
del ticket. Los campos que identifican ciclo de vida, identidad del
solicitante o número de registro son INMUTABLES por este endpoint.

**Campos permitidos en el body:** `titulo`, `descripcion`, `prioridadId`,
`tipoId`, `cicloId`, `fechaVencimiento`. Todos opcionales (PATCH parcial).

**Campos inmutables** (nunca modificables por este endpoint):
`estadoId`, `solicitanteId`, `asignadoId`, `numero`, `autorId`, `clienteId`, `anio`.

#### Scenario: Edición exitosa de campos de datos

**Given** un ticket activo (`deleted_at IS NULL`) en estado no terminal  
**And** el usuario autenticado tiene permiso `ticket:editar`  
**And** el ticket pertenece al tenant del usuario  
**When** el usuario envía `PATCH /tickets/{id}` con al menos un campo permitido  
**Then** la respuesta MUST ser `HTTP 200` con el `TicketResponseDto` reflejando los valores actualizados  
**And** `tickets.updated_at` MUST ser actualizado a `now()`  
**And** los campos no incluidos en el body MUST permanecer sin cambios  
**And** dentro de la MISMA transacción Postgres MUST registrarse una fila en `operaciones_ticket`
con `tipo_operacion.codigo = 'EDICION'`, `autor_id` del usuario autenticado,
y `metadata` que incluya al menos `{ camposModificados: [lista de claves modificadas] }`

#### Scenario: Campo prohibido incluido en el body es ignorado

**Given** un ticket activo en estado no terminal  
**And** el usuario tiene permiso `ticket:editar`  
**When** el body de `PATCH /tickets/{id}` incluye `estadoId`, `solicitanteId` u otro campo inmutable  
**Then** la respuesta MUST ser `HTTP 200` (no error de validación)  
**And** los valores de los campos inmutables en la DB MUST NOT haber cambiado  
**And** solo los campos permitidos presentes en el body MUST ser actualizados

#### Scenario: Edición rechazada — ticket en estado terminal CERRADO

**Given** un ticket cuyo estado actual tiene `codigo = 'CERRADO'`  
**And** el usuario tiene permiso `ticket:editar`  
**When** el usuario envía `PATCH /tickets/{id}` con cualquier campo válido  
**Then** la respuesta MUST ser `HTTP 422`  
**And** el body de error MUST comunicar que el ticket no es editable en su estado actual  
**And** MUST NOT modificar ningún campo de la fila `tickets`  
**And** MUST NOT registrar ninguna `operaciones_ticket`

#### Scenario: Edición rechazada — ticket en estado terminal CANCELADO

**Given** un ticket cuyo estado actual tiene `codigo = 'CANCELADO'`  
**And** el usuario tiene permiso `ticket:editar`  
**When** el usuario envía `PATCH /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 422`  
**And** MUST NOT modificar la fila en `tickets`

#### Scenario: Edición rechazada — ticket soft-deleted

**Given** un ticket con `deleted_at IS NOT NULL`  
**When** el usuario envía `PATCH /tickets/{id}` (independientemente del permiso)  
**Then** la respuesta MUST ser `HTTP 404`  
**And** MUST NOT modificar la fila en `tickets`

#### Scenario: Edición rechazada — ticket de otro tenant

**Given** un ticket que existe en la DB del tenant B  
**And** el usuario autenticado pertenece al tenant A  
**When** el usuario envía `PATCH /tickets/{id}` con el ID de ese ticket  
**Then** la respuesta MUST ser `HTTP 404` (no 403; la existencia del ticket no se revela)  
**And** MUST NOT modificar ningún dato del tenant B

#### Scenario: Edición rechazada — sin permiso ticket:editar

**Given** un usuario autenticado sin el permiso `ticket:editar` en su JWT  
**When** envía `PATCH /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 403`  
**And** MUST NOT ejecutar ningún caso de uso ni modificar datos

---

### Requirement: Soft delete de tickets

`DELETE /tickets/:id` da de baja lógica un ticket seteando `deleted_at`.
A diferencia de la edición, el soft delete es permitido incluso en estados
terminales (CERRADO/CANCELADO). La operación es NO idempotente: un segundo
intento de borrar el mismo ticket DEBE ser rechazado.

#### Scenario: Soft delete exitoso de ticket activo

**Given** un ticket con `deleted_at IS NULL`  
**And** el usuario autenticado tiene permiso `ticket:eliminar`  
**And** el ticket pertenece al tenant del usuario  
**When** el usuario envía `DELETE /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 200` con el `TicketResponseDto` del ticket  
**And** `tickets.deleted_at` MUST ser seteado a `now()`  
**And** `tickets.updated_at` MUST ser actualizado a `now()`  
**And** dentro de la MISMA transacción MUST registrarse una fila en `operaciones_ticket`
con `tipo_operacion.codigo = 'ELIMINACION'` y `autor_id` del usuario autenticado  
**And** MUST NOT eliminar físicamente la fila de `tickets`

#### Scenario: Soft delete de ticket en estado terminal (CERRADO / CANCELADO) — permitido

**Given** un ticket con `deleted_at IS NULL` cuyo estado tiene `codigo = 'CERRADO'` o `codigo = 'CANCELADO'`  
**And** el usuario tiene permiso `ticket:eliminar`  
**When** el usuario envía `DELETE /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 200`  
**And** `tickets.deleted_at` MUST ser seteado a `now()`  
**And** MUST NOT rechazar la operación por estar en estado terminal

#### Scenario: Doble borrado rechazado — ticket ya soft-deleted

**Given** un ticket con `deleted_at IS NOT NULL` (ya eliminado)  
**And** el usuario tiene permiso `ticket:eliminar`  
**When** el usuario envía `DELETE /tickets/{id}` por segunda vez  
**Then** la respuesta MUST ser `HTTP 409 Conflict`  
**And** el body de error MUST comunicar que el ticket ya fue eliminado  
**And** MUST NOT modificar `deleted_at` ni `updated_at`  
**And** MUST NOT registrar una segunda `operaciones_ticket` de tipo ELIMINACION

#### Scenario: Soft delete rechazado — ticket de otro tenant

**Given** un ticket que existe en la DB del tenant B  
**And** el usuario autenticado pertenece al tenant A  
**When** el usuario envía `DELETE /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 404`  
**And** MUST NOT modificar ningún dato del tenant B

#### Scenario: Soft delete rechazado — sin permiso ticket:eliminar

**Given** un usuario autenticado sin el permiso `ticket:eliminar` en su JWT  
**When** envía `DELETE /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 403`  
**And** MUST NOT ejecutar ningún caso de uso ni modificar datos

---

### Requirement: Exclusión de tickets soft-deleted en listados

Este requirement extiende el comportamiento ya existente de `GET /tickets` y
`GET /tickets?estado=` para confirmar que el soft delete del change aplica
el mismo patrón de exclusión que ya existe en la capa de repositorio.

#### Scenario: Ticket recién eliminado no aparece en el listado

**Given** un ticket que existía con `deleted_at IS NULL`  
**And** el ticket fue eliminado vía `DELETE /tickets/{id}` exitosamente  
**When** cualquier usuario del mismo tenant llama `GET /tickets`  
**Then** el ticket eliminado MUST NOT aparecer en el array de respuesta  
**And** los demás tickets activos del tenant MUST seguir apareciendo normalmente

#### Scenario: GET /tickets/:id retorna 404 para ticket soft-deleted

**Given** un ticket con `deleted_at IS NOT NULL`  
**When** un usuario llama `GET /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 404`  
**And** MUST NOT devolver los datos del ticket eliminado

---

### Requirement: Auditoría transaccional de edición y eliminación

Las operaciones de edición y eliminación son eventos de negocio significativos
que DEBEN quedar reflejados en el timeline inmutable `operaciones_ticket`,
en la MISMA transacción que el cambio principal. Un fallo en el registro de
auditoría DEBE hacer rollback del cambio principal.

#### Scenario: Rollback si falla el registro de auditoría en edición

**Given** un ticket activo en estado no terminal  
**And** el registro en `operaciones_ticket` falla (ej. error de FK por seed faltante)  
**When** `EditarTicketUseCase` intenta ejecutar  
**Then** la transacción MUST hacer rollback completo  
**And** `tickets` MUST permanecer sin cambios (ni los campos de datos ni `updated_at`)  
**And** la respuesta MUST ser `HTTP 500` (error interno de catálogo no sembrado)

#### Scenario: Rollback si falla el registro de auditoría en eliminación

**Given** un ticket activo  
**And** el registro en `operaciones_ticket` falla  
**When** `EliminarTicketUseCase` intenta ejecutar  
**Then** la transacción MUST hacer rollback completo  
**And** `tickets.deleted_at` MUST permanecer `NULL`  
**And** la respuesta MUST ser `HTTP 500`

#### Scenario: Seed de tipo_operacion EDICION y ELIMINACION presente en todo tenant

**Given** se conecta a la DB de cualquier tenant existente o nuevo  
**When** se consulta `tipo_operacion`  
**Then** MUST existir una fila con `codigo = 'EDICION'` y `activo = TRUE`  
**And** MUST existir una fila con `codigo = 'ELIMINACION'` y `activo = TRUE`  
**And** el seed MUST ser idempotente (re-ejecución no duplica filas)
