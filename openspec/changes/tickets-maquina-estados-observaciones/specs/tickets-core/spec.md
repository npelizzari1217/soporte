# Delta Spec: Tickets Core — tickets-maquina-estados-observaciones

> **Tipo:** delta
> **Sobre:** `openspec/specs/tickets-core/spec.md` y delta `openspec/changes/tickets-list-filtros-resolucion/specs/tickets-core/spec.md`
> **Change:** `tickets-maquina-estados-observaciones`
> **Fecha:** 2026-06-29
>
> Este archivo describe únicamente los REQUISITOS ADICIONALES y las ENMIENDAS que deben ser
> verdaderos después de aplicar el change. Los requirements de la spec canónica siguen vigentes
> salvo donde se indica explícitamente "Enmienda". No describe implementación — solo
> comportamiento observable y verificable. Aplica a todos los flujos (SOPORTE, COMPRAS, EDILICIA).

---

## Cambios en modelo de datos

### Delta: Tabla `estados` — catálogo de 7 estados activos + 3 congelados

Después de aplicar este change, el catálogo de estados obligatorio para todo tenant nuevo o
migrado es:

| codigo | nombre | orden | activo | UUID determinista | Notas |
|--------|--------|-------|--------|-------------------|-------|
| `ABIERTO` | Abierto | 10 | TRUE | c0000000-0000-4000-c000-000000000001 | Sin cambio |
| `PENDIENTE_APROBACION` | Pendiente de aprobación | 20 | TRUE | c0000000-0000-4000-c000-000000000002 | **Congelado** — sin arcos |
| `APROBADO` | Aprobado | 30 | TRUE | c0000000-0000-4000-c000-000000000003 | Sin cambio |
| `RECHAZADO` | Rechazado | 35 | TRUE | c0000000-0000-4000-c000-000000000004 | Pasa a **terminal** |
| `EN_PROGRESO` | En progreso | 40 | TRUE | c0000000-0000-4000-c000-000000000005 | Sin cambio |
| `RESUELTO` | Resuelto | 50 | TRUE | c0000000-0000-4000-c000-000000000006 | Pasa a **terminal** |
| `CERRADO` | Cerrado | 60 | TRUE | c0000000-0000-4000-c000-000000000007 | **Congelado** — sin arcos |
| `CANCELADO` | Cancelado | 70 | TRUE | c0000000-0000-4000-c000-000000000008 | **Congelado** — sin arcos |
| `SUSPENDIDO` | Suspendido | 45 | TRUE | c0000000-0000-4000-c000-000000000009 | **NUEVO** |
| `SIN_SOLUCION` | Sin solución | 55 | TRUE | c0000000-0000-4000-c000-00000000000a | **NUEVO** |

**Estados congelados** (`PENDIENTE_APROBACION`, `CERRADO`, `CANCELADO`): no participan en ningún
arco de transición de entrada ni salida. Los tickets ya existentes en estos estados quedan en
estado definitivo sin posibilidad de transicionar. No se migran datos de esos tickets.

`SUSPENDIDO` y `SIN_SOLUCION` MUST ser insertados vía migración idempotente
(`INSERT ... ON CONFLICT (codigo) DO NOTHING`) en TODAS las tenant DBs activas y en el seeder
estándar de tenants nuevos.

---

### Delta: Tabla `tipo_operacion` — nuevo tipo OBSERVACION

| codigo | nombre | UUID determinista | Notas |
|--------|--------|-------------------|-------|
| `OBSERVACION` | Observación técnica | f0000000-0000-4000-f000-000000000009 | **NUEVO** |

El tipo `OBSERVACION` MUST ser insertado en el catálogo de TODA tenant DB (nueva y existente)
de forma idempotente (`ON CONFLICT (codigo) DO NOTHING`).

---

### Delta: Tabla `tickets` — rename `fecha_resolucion` → `fecha_cierre`

| Columna antes | Columna después | Tipo Postgres | Nullability | Cambio |
|---|---|---|---|---|
| `fecha_resolucion` | `fecha_cierre` | `date` | NULL | `ALTER TABLE tickets RENAME COLUMN fecha_resolucion TO fecha_cierre`. Tipo y nullability sin cambio. |

La migración MUST ejecutarse en TODAS las tenant DBs. El runner MUST ser idempotente: verificar
que `fecha_resolucion` existe antes del `RENAME`; si ya se renombró, saltar sin error.

`fecha_cierre` es seteada automáticamente a `now()::date` por el caso de uso cuando el ticket
entra a cualquier estado terminal. No es un campo aceptado en ningún body de request.

---

## Enmiendas a requirements existentes

### Enmienda: Máquina de estados base (reemplaza el requirement completo)

> Reemplaza el `Requirement: Máquina de estados base (todos los tipos)` en
> `openspec/specs/tickets-core/spec.md`.
> El flujo legacy de 4 estados (ABIERTO → EN_PROGRESO → RESUELTO → CERRADO, con reapertura)
> queda completamente reemplazado. Los nuevos requirements de esta sección son los únicos
> válidos a partir de este change.

Las transiciones válidas son (y SOLO estas):

```
ABIERTO     → APROBADO
ABIERTO     → RECHAZADO
APROBADO    → EN_PROGRESO
APROBADO    → RESUELTO
APROBADO    → SUSPENDIDO
APROBADO    → SIN_SOLUCION
EN_PROGRESO → RESUELTO
EN_PROGRESO → SUSPENDIDO
EN_PROGRESO → SIN_SOLUCION
SUSPENDIDO  → EN_PROGRESO
```

**Estados terminales** (`TERMINAL_STATES`): `RESUELTO`, `SIN_SOLUCION`, `RECHAZADO`.
Ninguna transición de salida es posible desde ellos.

**Estados congelados**: `CERRADO`, `CANCELADO`, `PENDIENTE_APROBACION`. Ninguna transición
de entrada ni salida.

Cualquier arco no listado arriba MUST ser tratado como error de dominio (HTTP 422).

---

### Enmienda: Bloqueo de edición de datos — ABIERTO únicamente

> Reemplaza los scenarios "Edición rechazada — ticket en estado terminal CERRADO/CANCELADO"
> del `Requirement: Edición de campos de datos del ticket` en la spec canónica y su delta
> `tickets-editar-borrar`.
> La lógica anterior permitía edición en cualquier estado no-terminal. La nueva lógica
> permite edición EXCLUSIVAMENTE cuando el estado del ticket es `ABIERTO`.

**Regla:** `EditarTicketUseCase` MUST rechazar (HTTP 422) si `ticket.estado.codigo !== 'ABIERTO'`,
independientemente de si el estado es terminal o no.

---

### Enmienda: Bloqueo de borrado — ABIERTO únicamente

> Reemplaza el scenario "Soft delete de ticket en estado terminal (CERRADO / CANCELADO) —
> permitido" del `Requirement: Soft delete de tickets` en la spec canónica y su delta
> `tickets-editar-borrar`.
> La lógica anterior permitía soft delete incluso en terminales. La nueva lógica permite
> soft delete EXCLUSIVAMENTE cuando el estado del ticket es `ABIERTO`.

**Regla:** `EliminarTicketUseCase` MUST rechazar (HTTP 422) si `ticket.estado.codigo !== 'ABIERTO'`.

---

### Enmienda: fechaResolucion supersedida por fechaCierre (ADR-6)

> Reemplaza el `Requirement: fechaResolucion seteada por el técnico al transicionar a RESUELTO`
> en `openspec/changes/tickets-list-filtros-resolucion/specs/tickets-core/spec.md`.
> Cambios de comportamiento:
> 1. La columna se renombra a `fecha_cierre` (ver Cambios en modelo de datos).
> 2. `fecha_cierre` se gestiona de forma distinta según el estado terminal destino (ADR-6):
>    - `RESUELTO`: el caller DEBE proveer `fechaCierre` en el body del request (ISO 8601).
>      Si falta → `HTTP 422 FECHA_CIERRE_REQUERIDA`. El use case usa el valor provisto.
>    - `SIN_SOLUCION` y `RECHAZADO`: el use case la setea a `now()` servidor automáticamente.
>      El caller NO la provee; si llega en el body MUST ser ignorada silenciosamente.
> 3. El body de `PATCH /tickets/:id/estado` acepta `fechaCierre` SOLO cuando
>    `nuevoEstadoCodigo === 'RESUELTO'`; para otros destinos el campo es ignorado.
> 4. El scenario "Reapertura desde RESUELTO limpia fechaResolucion" queda eliminado:
>    RESUELTO es terminal; la transición RESUELTO → EN_PROGRESO ya no existe.

---

## Nuevos Requirements

### Requirement: Máquina de estados de 7 estados

`TransicionarEstadoUseCase` MUST usar la tabla `VALID_TRANSITIONS` definida en la enmienda
anterior. `TERMINAL_STATES` MUST ser `{ RESUELTO, SIN_SOLUCION, RECHAZADO }`. Cualquier arco
no listado MUST ser rechazado por la máquina de estados antes de tocar la DB.

#### Scenario: Transición válida actualiza estado y registra operación en misma transacción

**Given** un ticket en estado `APROBADO` en el tenant del usuario
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'EN_PROGRESO' }`
**Then** la respuesta MUST ser `HTTP 200`
**And** dentro de la MISMA transacción Postgres MUST:
  - actualizarse `tickets.estado_id` al UUID del estado `EN_PROGRESO`
  - insertarse una fila en `operaciones_ticket` con `tipo_operacion.codigo = 'CAMBIO_ESTADO'`,
    `estado_anterior_id` = UUID de `APROBADO`, `estado_nuevo_id` = UUID de `EN_PROGRESO`,
    `autor_id` del usuario autenticado
**And** si cualquiera de las operaciones falla MUST hacerse rollback completo

#### Scenario: Arco inválido rechazado con HTTP 422

**Given** un ticket en estado `EN_PROGRESO`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'ABIERTO' }`
**Then** la respuesta MUST ser `HTTP 422`
**And** el body de error MUST indicar que la transición `EN_PROGRESO → ABIERTO` no es válida
**And** MUST NOT modificar `tickets.estado_id`
**And** MUST NOT registrar ninguna `operaciones_ticket`

#### Scenario: Arco ABIERTO → EN_PROGRESO (antiguo arco legacy) es inválido

**Given** un ticket en estado `ABIERTO`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'EN_PROGRESO' }`
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar `tickets.estado_id`

#### Scenario: Estado terminal bloquea toda transición de salida

**Given** un ticket en estado `RESUELTO` (aplica igualmente a `SIN_SOLUCION` o `RECHAZADO`)
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con CUALQUIER `nuevoEstadoCodigo`
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar `tickets.estado_id`
**And** MUST NOT registrar ninguna `operaciones_ticket`

#### Scenario: Estado congelado bloqueado como destino de transición

**Given** un ticket en estado `APROBADO`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `nuevoEstadoCodigo` igual a
  `CERRADO`, `CANCELADO` o `PENDIENTE_APROBACION`
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar `tickets.estado_id`

#### Scenario: Retomar SUSPENDIDO → EN_PROGRESO (arco válido)

**Given** un ticket en estado `SUSPENDIDO`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'EN_PROGRESO' }`
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.estado_id` MUST apuntar al UUID del estado `EN_PROGRESO`
**And** dentro de la MISMA transacción MUST insertarse en `operaciones_ticket` con
  `tipo_operacion.codigo = 'CAMBIO_ESTADO'`, `estado_anterior_id` = UUID de `SUSPENDIDO`,
  `estado_nuevo_id` = UUID de `EN_PROGRESO`

#### Scenario: Reapertura RESUELTO → EN_PROGRESO ya no es un arco válido

**Given** un ticket en estado `RESUELTO` con `fecha_cierre IS NOT NULL`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'EN_PROGRESO' }`
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar `tickets.estado_id`
**And** MUST NOT limpiar `tickets.fecha_cierre`

---

### Requirement: Bloqueo de edición por estado (solo ABIERTO)

`EditarTicketUseCase` MUST cargar el estado actual del ticket y verificar que es `ABIERTO`
antes de ejecutar la edición. Cualquier otro estado — incluyendo no-terminales como
`APROBADO`, `EN_PROGRESO`, `SUSPENDIDO` — MUST resultar en rechazo.

#### Scenario: Edición en ABIERTO — permitida

**Given** un ticket con `estado.codigo = 'ABIERTO'` y `deleted_at IS NULL`
**And** el usuario tiene permiso `ticket:editar` y pertenece al mismo tenant
**When** el usuario envía `PATCH /tickets/{id}` con al menos un campo válido
**Then** la respuesta MUST ser `HTTP 200`
**And** la edición MUST ejecutarse normalmente (igual al requirement canónico de edición)

#### Scenario: Edición en APROBADO — bloqueada

**Given** un ticket con `estado.codigo = 'APROBADO'`
**And** el usuario tiene permiso `ticket:editar`
**When** el usuario envía `PATCH /tickets/{id}` con campos válidos
**Then** la respuesta MUST ser `HTTP 422`
**And** el body de error MUST indicar que el ticket no es editable en su estado actual
**And** MUST NOT modificar ningún campo de la fila `tickets`
**And** MUST NOT registrar ninguna `operaciones_ticket`

#### Scenario: Edición en EN_PROGRESO — bloqueada

**Given** un ticket con `estado.codigo = 'EN_PROGRESO'`
**And** el usuario tiene permiso `ticket:editar`
**When** el usuario envía `PATCH /tickets/{id}` con cualquier campo
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar la fila en `tickets`

#### Scenario: Edición en SUSPENDIDO — bloqueada

**Given** un ticket con `estado.codigo = 'SUSPENDIDO'`
**And** el usuario tiene permiso `ticket:editar`
**When** el usuario envía `PATCH /tickets/{id}` con cualquier campo
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar la fila en `tickets`

#### Scenario: Edición en estados terminales (RESUELTO, SIN_SOLUCION, RECHAZADO) — bloqueada

**Given** un ticket con `estado.codigo` en {`RESUELTO`, `SIN_SOLUCION`, `RECHAZADO`}
**And** el usuario tiene permiso `ticket:editar`
**When** el usuario envía `PATCH /tickets/{id}` con cualquier campo
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar la fila en `tickets`

---

### Requirement: Bloqueo de borrado por estado (solo ABIERTO)

`EliminarTicketUseCase` MUST cargar el estado actual del ticket y verificar que es `ABIERTO`
antes de ejecutar el soft delete. Cualquier otro estado MUST resultar en rechazo.

#### Scenario: Borrado en ABIERTO — permitido

**Given** un ticket con `estado.codigo = 'ABIERTO'` y `deleted_at IS NULL`
**And** el usuario tiene permiso `ticket:eliminar` y pertenece al mismo tenant
**When** el usuario envía `DELETE /tickets/{id}`
**Then** la respuesta MUST ser `HTTP 204 No Content`
**And** el soft delete MUST ejecutarse normalmente (igual al requirement canónico de soft delete)

#### Scenario: Borrado en APROBADO — bloqueado

**Given** un ticket con `estado.codigo = 'APROBADO'`
**And** el usuario tiene permiso `ticket:eliminar`
**When** el usuario envía `DELETE /tickets/{id}`
**Then** la respuesta MUST ser `HTTP 422`
**And** el body de error MUST indicar que el ticket no es eliminable en su estado actual
**And** MUST NOT modificar `tickets.deleted_at`
**And** MUST NOT registrar ninguna `operaciones_ticket` de tipo ELIMINACION

#### Scenario: Borrado en EN_PROGRESO — bloqueado

**Given** un ticket con `estado.codigo = 'EN_PROGRESO'`
**And** el usuario tiene permiso `ticket:eliminar`
**When** el usuario envía `DELETE /tickets/{id}`
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar `tickets.deleted_at`

#### Scenario: Borrado en SUSPENDIDO — bloqueado

**Given** un ticket con `estado.codigo = 'SUSPENDIDO'`
**And** el usuario tiene permiso `ticket:eliminar`
**When** el usuario envía `DELETE /tickets/{id}`
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar `tickets.deleted_at`

#### Scenario: Borrado en estados terminales (RESUELTO, SIN_SOLUCION, RECHAZADO) — bloqueado

**Given** un ticket con `estado.codigo` en {`RESUELTO`, `SIN_SOLUCION`, `RECHAZADO`}
**And** el usuario tiene permiso `ticket:eliminar`
**When** el usuario envía `DELETE /tickets/{id}`
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT modificar `tickets.deleted_at`

---

### Requirement: Observaciones del técnico

`POST /tickets/:id/observaciones` registra una observación técnica en el timeline del ticket.
Cuando el ticket está en `APROBADO`, la operación dispara automáticamente una transición de
estado. Todo ocurre en una ÚNICA transacción Postgres.

El endpoint MUST exigir el permiso `ticket:observar` (ver delta `auth-rbac` de este change).

**Body de request:**

```json
{
  "contenido": "string (requerido, no vacío)",
  "nuevoEstadoCodigo": "EN_PROGRESO | RESUELTO | SUSPENDIDO | SIN_SOLUCION (opcional)"
}
```

`nuevoEstadoCodigo` solo tiene efecto cuando el ticket está en `APROBADO`. Para cualquier
otro estado, el campo MUST ser ignorado silenciosamente.

#### Scenario: Observación en ticket APROBADO — auto-transición a EN_PROGRESO (default)

**Given** un ticket con `estado.codigo = 'APROBADO'` en el tenant del usuario
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones` con `{ "contenido": "Inicio trabajos" }`
  (sin `nuevoEstadoCodigo`)
**Then** la respuesta MUST ser `HTTP 201`
**And** dentro de la MISMA transacción Postgres MUST:
  - insertarse una fila en `operaciones_ticket` con `tipo_operacion.codigo = 'OBSERVACION'`,
    `descripcion = "Inicio trabajos"`, `autor_id` del usuario autenticado,
    `estado_anterior_id = NULL`, `estado_nuevo_id = NULL`
  - actualizarse `tickets.estado_id` al UUID del estado `EN_PROGRESO`
  - insertarse una segunda fila en `operaciones_ticket` con `tipo_operacion.codigo = 'CAMBIO_ESTADO'`,
    `estado_anterior_id` = UUID de `APROBADO`, `estado_nuevo_id` = UUID de `EN_PROGRESO`,
    `autor_id` del usuario autenticado
**And** si cualquiera de las operaciones falla MUST hacerse rollback completo

#### Scenario: Observación en ticket APROBADO + nuevoEstadoCodigo EN_PROGRESO — equivalente al default

**Given** un ticket con `estado.codigo = 'APROBADO'`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones` con `{ "contenido": "Inicio", "nuevoEstadoCodigo": "EN_PROGRESO" }`
**Then** la respuesta MUST ser `HTTP 201`
**And** el comportamiento MUST ser idéntico al scenario anterior (auto-transición a `EN_PROGRESO`)

#### Scenario: Observación en ticket APROBADO + nuevoEstadoCodigo RESUELTO — directo a RESUELTO

**Given** un ticket con `estado.codigo = 'APROBADO'` y `fecha_cierre IS NULL`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones`
  con `{ "contenido": "Solucionado de inmediato", "nuevoEstadoCodigo": "RESUELTO", "fechaCierre": "2026-06-29T00:00:00.000Z" }`
**Then** la respuesta MUST ser `HTTP 201`
**And** dentro de la MISMA transacción MUST:
  - insertarse la fila OBSERVACION en `operaciones_ticket`
  - actualizarse `tickets.estado_id` al UUID de `RESUELTO`
  - insertarse la fila CAMBIO_ESTADO en `operaciones_ticket`
  - setearse `tickets.fecha_cierre` al valor `fechaCierre` provisto por el caller
**And** si cualquiera falla MUST hacerse rollback completo

#### Scenario: Observación APROBADO → RESUELTO sin fechaCierre — rechazado con 422

**Given** un ticket con `estado.codigo = 'APROBADO'`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones`
  con `{ "contenido": "Solucionado", "nuevoEstadoCodigo": "RESUELTO" }` (sin `fechaCierre`)
**Then** la respuesta MUST ser `HTTP 422`
**And** el error MUST tener código `FECHA_CIERRE_REQUERIDA`

#### Scenario: Observación en ticket APROBADO + nuevoEstadoCodigo SUSPENDIDO — directo a SUSPENDIDO

**Given** un ticket con `estado.codigo = 'APROBADO'`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones`
  con `{ "contenido": "En espera de repuesto", "nuevoEstadoCodigo": "SUSPENDIDO" }`
**Then** la respuesta MUST ser `HTTP 201`
**And** dentro de la MISMA transacción MUST:
  - insertarse la fila OBSERVACION
  - actualizarse `tickets.estado_id` al UUID de `SUSPENDIDO`
  - insertarse la fila CAMBIO_ESTADO
**And** MUST NOT setearse `tickets.fecha_cierre` (SUSPENDIDO no es terminal)

#### Scenario: Observación en ticket APROBADO + nuevoEstadoCodigo SIN_SOLUCION — directo a SIN_SOLUCION

**Given** un ticket con `estado.codigo = 'APROBADO'` y `fecha_cierre IS NULL`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones`
  con `{ "contenido": "Sin solución viable", "nuevoEstadoCodigo": "SIN_SOLUCION" }`
**Then** la respuesta MUST ser `HTTP 201`
**And** dentro de la MISMA transacción MUST:
  - insertarse la fila OBSERVACION
  - actualizarse `tickets.estado_id` al UUID de `SIN_SOLUCION`
  - insertarse la fila CAMBIO_ESTADO
  - setearse `tickets.fecha_cierre` a `now()::date`

#### Scenario: nuevoEstadoCodigo inválido desde APROBADO — rechazado con 422

**Given** un ticket con `estado.codigo = 'APROBADO'`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones`
  con `{ "contenido": "Texto", "nuevoEstadoCodigo": "ABIERTO" }` (arco no válido desde APROBADO)
**Then** la respuesta MUST ser `HTTP 422`
**And** MUST NOT insertarse ninguna fila en `operaciones_ticket`
**And** MUST NOT modificarse `tickets.estado_id`

#### Scenario: Observación en ticket EN_PROGRESO — registra sin cambiar estado

**Given** un ticket con `estado.codigo = 'EN_PROGRESO'`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones` con `{ "contenido": "Avance parcial" }`
**Then** la respuesta MUST ser `HTTP 201`
**And** MUST insertarse una fila en `operaciones_ticket` con `tipo_operacion.codigo = 'OBSERVACION'`
**And** MUST NOT modificarse `tickets.estado_id`
**And** MUST NOT insertarse ninguna fila `CAMBIO_ESTADO` adicional

#### Scenario: nuevoEstadoCodigo ignorado cuando ticket no está en APROBADO

**Given** un ticket con `estado.codigo = 'EN_PROGRESO'`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones`
  con `{ "contenido": "Nota", "nuevoEstadoCodigo": "RESUELTO" }`
**Then** la respuesta MUST ser `HTTP 201`
**And** MUST insertarse la fila OBSERVACION
**And** MUST NOT modificarse `tickets.estado_id` (el campo fue ignorado)

#### Scenario: Observación en ticket ABIERTO — registra sin cambiar estado

**Given** un ticket con `estado.codigo = 'ABIERTO'`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones` con `{ "contenido": "Nota inicial" }`
**Then** la respuesta MUST ser `HTTP 201`
**And** MUST insertarse la fila OBSERVACION
**And** MUST NOT modificarse `tickets.estado_id`

#### Scenario: Observación en ticket SUSPENDIDO — registra sin cambiar estado

**Given** un ticket con `estado.codigo = 'SUSPENDIDO'`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones` con `{ "contenido": "Aguardando proveedor" }`
**Then** la respuesta MUST ser `HTTP 201`
**And** MUST insertarse la fila OBSERVACION
**And** MUST NOT modificarse `tickets.estado_id`

#### Scenario: Observación bloqueada en estado terminal

**Given** un ticket con `estado.codigo` en {`RESUELTO`, `SIN_SOLUCION`, `RECHAZADO`}
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones` con cualquier body válido
**Then** la respuesta MUST ser `HTTP 422`
**And** el body de error MUST indicar que el ticket está cerrado y no acepta observaciones
**And** MUST NOT insertarse ninguna fila en `operaciones_ticket`
**And** MUST NOT modificarse `tickets.estado_id`

#### Scenario: Observación bloqueada — sin permiso ticket:observar

**Given** un usuario sin `ticket:observar` en su JWT
**When** el usuario envía `POST /tickets/{id}/observaciones`
**Then** la respuesta MUST ser `HTTP 403`
**And** MUST NOT ejecutarse ningún caso de uso ni modificarse datos

#### Scenario: Observación bloqueada — ticket de otro tenant

**Given** un ticket que existe en la DB del tenant B
**And** el usuario autenticado pertenece al tenant A
**When** el usuario envía `POST /tickets/{id}/observaciones`
**Then** la respuesta MUST ser `HTTP 404`
**And** MUST NOT modificar datos del tenant B

#### Scenario: Rollback si falla cualquier operación de la transacción

**Given** un ticket en estado `APROBADO`
**And** la inserción de la fila `CAMBIO_ESTADO` en `operaciones_ticket` falla
  (ej. seed de tipo_operacion faltante, error de FK)
**When** `CrearObservacionUseCase` intenta ejecutar
**Then** la transacción MUST hacer rollback completo
**And** MUST NOT persistirse la fila OBSERVACION
**And** `tickets.estado_id` MUST permanecer en `APROBADO`
**And** `tickets.fecha_cierre` MUST permanecer sin cambios
**And** la respuesta MUST ser `HTTP 500`

---

### Requirement: Autorización granular por arco de transición

`PATCH /tickets/:id/estado` MUST validar que el usuario autenticado posee el permiso requerido
para el arco específico solicitado. La ausencia del permiso MUST resultar en `HTTP 403` sin
ejecutar ningún caso de uso.

Mapa de permisos requeridos por arco:

| Arco | Permiso requerido |
|------|-------------------|
| `ABIERTO → APROBADO` | `ticket:aprobar` |
| `ABIERTO → RECHAZADO` | `ticket:rechazar` |
| `APROBADO → *`, `EN_PROGRESO → *`, `SUSPENDIDO → EN_PROGRESO` | `ticket:transicionar` |

#### Scenario: Transición ABIERTO → APROBADO con ticket:aprobar — permitida

**Given** un ticket en estado `ABIERTO`
**And** el usuario tiene `ticket:aprobar` en su JWT
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'APROBADO' }`
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.estado_id` MUST apuntar al UUID de `APROBADO`

#### Scenario: Transición ABIERTO → APROBADO sin ticket:aprobar — rechazada con 403

**Given** un ticket en estado `ABIERTO`
**And** el usuario NO tiene `ticket:aprobar` en su JWT (aunque tenga `ticket:transicionar`)
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'APROBADO' }`
**Then** la respuesta MUST ser `HTTP 403`
**And** MUST NOT modificar `tickets.estado_id`
**And** MUST NOT registrar ninguna `operaciones_ticket`

#### Scenario: Transición ABIERTO → RECHAZADO sin ticket:rechazar — rechazada con 403

**Given** un ticket en estado `ABIERTO`
**And** el usuario NO tiene `ticket:rechazar` en su JWT
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'RECHAZADO' }`
**Then** la respuesta MUST ser `HTTP 403`
**And** MUST NOT modificar `tickets.estado_id`

#### Scenario: Arcos técnicos sin ticket:transicionar — rechazados con 403

**Given** un ticket en estado `APROBADO`, `EN_PROGRESO` o `SUSPENDIDO`
**And** el usuario NO tiene `ticket:transicionar` en su JWT
**When** el usuario envía `PATCH /tickets/{id}/estado` con cualquier `nuevoEstadoCodigo` de un arco técnico
**Then** la respuesta MUST ser `HTTP 403`
**And** MUST NOT ejecutar ningún caso de uso ni modificar datos

#### Scenario: Transición técnica con ticket:transicionar — permitida (APROBADO → RESUELTO)

**Given** un ticket en estado `APROBADO`
**And** el usuario tiene `ticket:transicionar` en su JWT
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'RESUELTO' }`
**Then** la respuesta MUST ser `HTTP 200`

#### Scenario: Validación usuario+tenant antes de ejecutar transición

**Given** un ticket que existe en la DB del tenant B
**And** el usuario autenticado pertenece al tenant A y tiene todos los permisos de transición
**When** el usuario envía `PATCH /tickets/{id}/estado` con cualquier `nuevoEstadoCodigo`
**Then** la respuesta MUST ser `HTTP 404` (el ticket no se expone cross-tenant)
**And** MUST NOT modificar datos del tenant B

---

### Requirement: fechaCierre en los estados terminales (ADR-6)

`tickets.fecha_cierre` se gestiona de forma distinta según el estado terminal:

- **RESUELTO**: el caller DEBE incluir `fechaCierre` en el body del request (ISO 8601).
  Si falta → `HTTP 422 FECHA_CIERRE_REQUERIDA`. Aplica a `PATCH /tickets/:id/estado`
  y a `POST /tickets/:id/observaciones` con `nuevoEstadoCodigo: 'RESUELTO'`.
- **SIN_SOLUCION** y **RECHAZADO**: el use case setea `fecha_cierre` a `now()` servidor
  automáticamente. El caller no la provee.

#### Scenario: Transición a RESUELTO — fecha_cierre provista por el caller (REQUERIDA)

**Given** un ticket con `estado.codigo = 'EN_PROGRESO'` y `fecha_cierre IS NULL`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado`
  con `{ nuevoEstadoCodigo: 'RESUELTO', fechaCierre: '2026-06-29' }`
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.estado_id` MUST apuntar al UUID de `RESUELTO`
**And** `tickets.fecha_cierre` MUST ser seteada al valor `fechaCierre` del body

#### Scenario: Transición a RESUELTO sin fechaCierre — rechazado con 422

**Given** un ticket con `estado.codigo = 'EN_PROGRESO'`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado`
  con `{ nuevoEstadoCodigo: 'RESUELTO' }` (sin `fechaCierre`)
**Then** la respuesta MUST ser `HTTP 422`
**And** el error MUST tener código `FECHA_CIERRE_REQUERIDA`

#### Scenario: Transición a SIN_SOLUCION — fecha_cierre seteada automáticamente

**Given** un ticket con `estado.codigo = 'EN_PROGRESO'` y `fecha_cierre IS NULL`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'SIN_SOLUCION' }`
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.fecha_cierre` MUST ser seteada a `now()::date` dentro de la MISMA transacción
**And** `tickets.estado_id` MUST apuntar al UUID de `SIN_SOLUCION`

#### Scenario: Transición a RECHAZADO — fecha_cierre seteada automáticamente

**Given** un ticket con `estado.codigo = 'ABIERTO'` y `fecha_cierre IS NULL`
**And** el usuario tiene permiso `ticket:rechazar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'RECHAZADO' }`
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.fecha_cierre` MUST ser seteada a `now()::date` dentro de la MISMA transacción
**And** `tickets.estado_id` MUST apuntar al UUID de `RECHAZADO`

#### Scenario: Transición a estado no-terminal NO setea fecha_cierre

**Given** un ticket con `estado.codigo = 'ABIERTO'` y `fecha_cierre IS NULL`
**And** el usuario tiene permiso `ticket:aprobar`
**When** el usuario transiciona el ticket a `APROBADO`
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.fecha_cierre` MUST permanecer `NULL`

#### Scenario: Auto-transición via observación a RESUELTO setea fecha_cierre

**Given** un ticket con `estado.codigo = 'APROBADO'` y `fecha_cierre IS NULL`
**And** el usuario tiene permiso `ticket:observar`
**When** el usuario envía `POST /tickets/{id}/observaciones`
  con `{ "contenido": "Resuelto en sitio", "nuevoEstadoCodigo": "RESUELTO" }`
**Then** la respuesta MUST ser `HTTP 201`
**And** `tickets.fecha_cierre` MUST ser seteada a `now()::date` dentro de la misma transacción
**And** la fecha_cierre MUST participar del rollback si la transacción falla

#### Scenario: Campo fechaCierre (o fechaResolucion) en body es ignorado silenciosamente

**Given** un ticket en estado `EN_PROGRESO`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado`
  con `{ nuevoEstadoCodigo: 'RESUELTO', fechaCierre: '2020-01-01' }`
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.fecha_cierre` MUST ser la fecha de ejecución del use case, NOT `2020-01-01`

---

### Requirement: Catálogo de estados actualizado en provisioning de tenant

#### Scenario: Nuevo tenant incluye los 10 estados (7 activos + 3 congelados)

**Given** se completa el provisioning de un nuevo cliente
**When** se conecta a la DB tenant y consulta `estados`
**Then** MUST existir exactamente los 10 estados definidos en la tabla de modelo de datos de
  esta delta (incluyendo SUSPENDIDO y SIN_SOLUCION con sus UUIDs deterministas)
**And** todos MUST tener `activo = TRUE` y `deleted_at IS NULL`

#### Scenario: Tenants existentes reciben SUSPENDIDO y SIN_SOLUCION por migración idempotente

**Given** una tenant DB donde `SUSPENDIDO` y `SIN_SOLUCION` aún no existen
**When** el runner de migración ejecuta sobre ese tenant
**Then** MUST insertarse las dos filas con los UUIDs deterministas definidos en esta delta
**And** la inserción MUST ser `ON CONFLICT (codigo) DO NOTHING` (idempotente)

#### Scenario: Runner de migración no duplica estados ya existentes

**Given** una tenant DB donde `SUSPENDIDO` y `SIN_SOLUCION` ya fueron insertados previamente
**When** el runner de migración ejecuta nuevamente
**Then** MUST NOT crear filas duplicadas en `estados`
**And** MUST NOT modificar las filas existentes

#### Scenario: tipo_operacion OBSERVACION presente en todo tenant

**Given** la DB de cualquier tenant existente o nuevo
**When** se consulta `tipo_operacion`
**Then** MUST existir una fila con `codigo = 'OBSERVACION'` y `activo = TRUE`
**And** el UUID MUST ser `f0000000-0000-4000-f000-000000000009`
**And** el seed MUST ser idempotente (re-ejecución no duplica)

---

### Requirement: Migración rename fecha_resolucion → fecha_cierre

La migración `RENAME COLUMN fecha_resolucion TO fecha_cierre` MUST cumplir:

1. **Idempotencia**: si la columna ya fue renombrada, MUST detectarlo y saltar sin error.
2. **Cobertura total**: MUST ejecutarse en TODAS las tenant DBs activas antes de desplegar
   código que referencie `fecha_cierre`.
3. **Verificación post-migración**: el runner MUST confirmar que `fecha_cierre` existe en
   cada tenant DB después del rename.
4. **Rollback**: ante fallo en cualquier tenant, MUST reportar los tenants fallidos sin
   afectar los ya migrados correctamente.

#### Scenario: Migración exitosa en tenant con columna fecha_resolucion

**Given** una tenant DB con columna `fecha_resolucion` en la tabla `tickets`
**When** el runner de migración ejecuta sobre ese tenant
**Then** la columna MUST renombrarse a `fecha_cierre`
**And** todos los datos existentes MUST estar accesibles bajo `fecha_cierre`
**And** ninguna fila MUST perderse ni modificarse en contenido

#### Scenario: Migración idempotente — tenant ya migrado

**Given** una tenant DB donde `fecha_cierre` ya existe (migración aplicada previamente)
**When** el runner de migración ejecuta nuevamente
**Then** MUST NOT arrojar error
**And** MUST NOT modificar ninguna columna ni dato
**And** el runner MUST reportar el tenant como "ya migrado, saltado"

#### Scenario: Rollback transaccional en tenant fallido

**Given** la migración falla en un tenant específico (ej. permisos insuficientes en la DB)
**When** el runner detecta el error
**Then** la tabla `tickets` en ese tenant MUST permanecer en el estado previo al intento
**And** el runner MUST reportar el tenant fallido sin afectar los demás tenants ya migrados
