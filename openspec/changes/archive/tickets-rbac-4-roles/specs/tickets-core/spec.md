# Spec Delta: tickets-core — Change tickets-rbac-4-roles

> Change: `tickets-rbac-4-roles` (Change B)
> Depende de: Change A `tickets-maquina-estados-observaciones` (ARCHIVED)
> Schema: **TENANT** (por operación de comentario)
> Actualiza canónico: `openspec/specs/tickets-core/spec.md`
> RFC 2119: MUST / MUST NOT / SHOULD / MAY

## Contexto

Change B introduce el permiso `ticket:comentar` (b0..019) para permitir a USUARIO y COLABORADOR
agregar comentarios aclaratorios en tickets **sin disparar transiciones de estado**.

Este diseño preserva la invariante central establecida en Change A:
**solo TECNICO (vía `ticket:observar`) puede cambiar el estado de un ticket.**

`COMENTARIO` (tipo_operacion `f0000000-0000-4000-f000-000000000002`) ya existe en el catálogo
desde el modelo base. Este change añade el caso de uso `CrearComentarioUseCase`, el endpoint
`POST /tickets/:id/comentarios` y la validación de permiso.

**Distinción crítica con `CrearObservacionUseCase` (Change A):**

| Aspecto | CrearComentarioUseCase | CrearObservacionUseCase |
|---------|----------------------|------------------------|
| Permiso requerido | `ticket:comentar` (b0..019) | `ticket:observar` (b0..014) |
| tipo_operacion | `COMENTARIO` (f0..002) | `OBSERVACION` (f0..009) |
| Dispara transición | NO | SÍ (APROBADO → EN_PROGRESO cuando aplica) |
| Roles habilitados | USUARIO, COLABORADOR, TECNICO, ADMINISTRADOR | Solo TECNICO, ADMINISTRADOR |

**Estados de ticket donde comentar está permitido:** ABIERTO, APROBADO, EN_PROGRESO, SUSPENDIDO.
**Comentar está bloqueado en:** RESUELTO, SIN_SOLUCION, RECHAZADO (terminales), CERRADO, CANCELADO,
PENDIENTE_APROBACION (congelados).

---

## Requirements

### Requirement: CrearComentarioUseCase — comentario aclaratorio sin transición de estado

`CrearComentarioUseCase` MUST crear una fila en `operaciones_ticket` con
`tipo_operacion_id` correspondiente a `COMENTARIO` (f0..002), vinculada al ticket y al usuario.
MUST NOT crear ninguna `transicion_estado` ni modificar `tickets.estado_id`.
El caso de uso MUST verificar que el ticket existe en el tenant del usuario y que el estado
no es terminal ni congelado antes de persistir.

#### Scenario: Usuario con ticket:comentar crea comentario en ticket ABIERTO

**Given** un usuario con permiso `ticket:comentar` (rol USUARIO o superior)
**And** existe un ticket en estado `ABIERTO` del mismo tenant
**When** el usuario envía `POST /tickets/{id}/comentarios` con `{ "contenido": "Aclaración sobre el pedido." }`
**Then** MUST crear una fila en `operaciones_ticket` con `tipo_operacion.codigo = 'COMENTARIO'`
**And** MUST devolver HTTP 201 con la representación del comentario creado
**And** `tickets.estado_id` MUST NOT cambiar
**And** MUST NOT crear ninguna fila en `transiciones_estado`

#### Scenario: Comentar en ticket APROBADO o EN_PROGRESO está permitido

**Given** un usuario con permiso `ticket:comentar`
**And** existe un ticket en estado `APROBADO` o en estado `EN_PROGRESO`
**When** el usuario envía `POST /tickets/{id}/comentarios` con contenido válido
**Then** MUST crear el comentario exitosamente y devolver HTTP 201
**And** el estado del ticket MUST NOT cambiar
**And** MUST NOT disparar ninguna transición de estado

#### Scenario: Comentar en ticket SUSPENDIDO está permitido

**Given** un usuario con permiso `ticket:comentar`
**And** existe un ticket en estado `SUSPENDIDO`
**When** el usuario envía `POST /tickets/{id}/comentarios`
**Then** MUST crear el comentario exitosamente y devolver HTTP 201

#### Scenario: Comentar en ticket en estado terminal es rechazado con 422

**Given** un usuario con permiso `ticket:comentar`
**And** existe un ticket en estado `RESUELTO`, `SIN_SOLUCION` o `RECHAZADO` (terminal)
**When** el usuario envía `POST /tickets/{id}/comentarios` con contenido válido
**Then** MUST devolver HTTP 422
**And** MUST NOT crear ninguna fila en `operaciones_ticket`
**And** el mensaje de error MUST indicar que el ticket está en un estado que no permite comentarios

#### Scenario: Comentar en ticket congelado es rechazado con 422

**Given** un usuario con permiso `ticket:comentar`
**And** existe un ticket en estado `CERRADO`, `CANCELADO` o `PENDIENTE_APROBACION` (congelado)
**When** el usuario envía `POST /tickets/{id}/comentarios`
**Then** MUST devolver HTTP 422
**And** MUST NOT crear ninguna fila en `operaciones_ticket`

#### Scenario: Request sin ticket:comentar es rechazada con 403

**Given** un usuario autenticado cuyo JWT no contiene `ticket:comentar`
**When** envía `POST /tickets/{id}/comentarios` con cualquier body
**Then** `PermissionsGuard` MUST rechazar con HTTP 403 antes de ejecutar el use case
**And** MUST NOT crear ninguna fila en `operaciones_ticket`
**And** MUST NOT modificar ningún dato en la DB

#### Scenario: Ticket no encontrado o perteneciente a otro tenant devuelve 404

**Given** un usuario con permiso `ticket:comentar`
**When** envía `POST /tickets/{id}/comentarios` con un `id` inexistente en su tenant
**Then** MUST devolver HTTP 404
**And** MUST NOT revelar si el ticket existe en otro tenant

#### Scenario: Comentario con contenido vacío o solo espacios es rechazado con 422

**Given** un usuario con permiso `ticket:comentar` y un ticket en estado no terminal
**When** envía `POST /tickets/{id}/comentarios` con `contenido` vacío (`""`) o solo espacios
**Then** MUST devolver HTTP 422
**And** MUST NOT crear ninguna fila en `operaciones_ticket`

---

### Requirement: Invariante "solo Técnico cambia el estado" — aislamiento del endpoint de observaciones

El endpoint `POST /tickets/:id/observaciones` (CrearObservacionUseCase, Change A) permanece
protegido por `ticket:observar`, exclusivo de TECNICO y ADMINISTRADOR. MUST NOT ser accesible
para roles sin ese permiso. Esto es un requirement de no-regresión de Change A.

#### Scenario: USUARIO intenta crear una OBSERVACION y recibe 403

**Given** un usuario con rol `USUARIO` (tiene `ticket:comentar`, NO tiene `ticket:observar`)
**When** envía una request al endpoint `POST /tickets/{id}/observaciones`
**Then** `PermissionsGuard` MUST devolver HTTP 403
**And** MUST NOT crear ninguna observación
**And** MUST NOT disparar ninguna transición de estado

#### Scenario: COLABORADOR intenta crear una OBSERVACION y recibe 403

**Given** un usuario con rol `COLABORADOR` (tiene `ticket:aprobar`, NO tiene `ticket:observar`)
**When** envía una request al endpoint `POST /tickets/{id}/observaciones`
**Then** `PermissionsGuard` MUST devolver HTTP 403

#### Scenario: TECNICO puede crear observaciones (ticket:observar — Change A preservado)

**Given** un usuario con rol `TECNICO` (tiene `ticket:observar`)
**And** existe un ticket en estado `APROBADO`
**When** envía `POST /tickets/{id}/observaciones` con body válido
**Then** MUST procesar la observación según las reglas de CrearObservacionUseCase (Change A)
**And** MUST NOT devolver 403 (no hay regresión de permisos)
