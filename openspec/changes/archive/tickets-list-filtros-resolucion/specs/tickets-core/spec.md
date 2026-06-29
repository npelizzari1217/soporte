# Delta Spec: Tickets Core — tickets-list-filtros-resolucion

> **Tipo:** delta
> **Sobre:** `openspec/specs/tickets-core/spec.md`
> **Change:** `tickets-list-filtros-resolucion`
> **Fecha:** 2026-06-28
>
> Este archivo describe únicamente los REQUISITOS ADICIONALES y las ENMIENDAS
> que deben ser verdaderos después de aplicar el change. Los requirements de la
> spec canónica siguen vigentes salvo donde se indica explícitamente "Enmienda".
> No describe implementación — solo comportamiento observable y verificable.
> Aplica a todos los flujos (SOPORTE, COMPRAS, EDILICIA).

---

## Cambios en modelo de datos

### Delta: Tabla `tickets` — rename `fecha_vencimiento` → `fecha_resolucion`

| Columna antes | Columna después | Tipo Postgres | Nullability | Cambio |
|---|---|---|---|---|
| `fecha_vencimiento` | `fecha_resolucion` | `date` | NULL | Rename vía `ALTER TABLE tickets RENAME COLUMN fecha_vencimiento TO fecha_resolucion`. Tipo y nullability sin cambio. |

La migración MUST ejecutarse en TODAS las tenant DBs. El runner MUST ser idempotente: verificar que `fecha_vencimiento` existe antes del `RENAME`; si ya se renombró, saltar sin error.

El campo continúa siendo `NULL` hasta que un técnico transiciona el ticket a `RESUELTO`.

`fecha_resolucion` MUST NOT ser aceptado en `POST /tickets` ni en `PATCH /tickets/:id` (edición de datos). Solo es setteable vía `PATCH /tickets/:id/estado` cuando `nuevoEstadoCodigo = 'RESUELTO'`.

### Delta: Tabla `tickets` — `created_at` sobreescribible por la aplicación

`tickets.created_at` MUST aceptar un valor explícito provisto por el use case cuando `POST /tickets` recibe `fechaCreacion`. El `DEFAULT now()` de Postgres permanece como fallback para inserciones directas (seeds, scripts), pero el use case MUST siempre proveer el valor explícito derivado del DTO.

> No hay cambio de DDL. La diferencia es comportamental: el use case deja de depender del default de DB para el alta de tickets.

---

## Enmiendas a requirements existentes

### Enmienda: Campos editables vía `PATCH /tickets/:id`

> Modifica el listado de campos permitidos del Requirement "Edición de campos de datos del ticket"
> en `openspec/specs/tickets-core/spec.md` (y su delta en `tickets-editar-borrar`).

**Después de esta change**, los campos permitidos en el body de `PATCH /tickets/:id` son:
`titulo`, `descripcion`, `prioridadId`, `cicloId`.

`fechaResolucion` (ex `fechaVencimiento`) MUST NOT ser aceptada por este endpoint.

#### Scenario: fechaResolucion en body de PATCH /tickets/:id es ignorada silenciosamente

**Given** un ticket activo con `deleted_at IS NULL`
**And** el usuario autenticado tiene permiso `ticket:editar`
**When** el body de `PATCH /tickets/{id}` incluye `fechaResolucion` con cualquier valor
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.fecha_resolucion` MUST NOT haber cambiado
**And** solo los campos editables presentes en el body MUST ser actualizados

---

## Nuevos Requirements

### Requirement: Listado filtrable con orden compuesto

`GET /tickets` MUST aceptar los query params opcionales:

| Param | Tipo | Semántica |
|---|---|---|
| `tiposIds[]` | UUID[] | Filtro IN: solo tickets cuyo `tipo_id` esté en la lista. Ausente = sin restricción de tipo. |
| `fechaDesde` | `YYYY-MM-DD` | Rango inclusivo inferior: `tickets.created_at::date >= fechaDesde` |
| `fechaHasta` | `YYYY-MM-DD` | Rango inclusivo superior: `tickets.created_at::date <= fechaHasta` |

El resultado MUST ordenarse: sort primario `tickets.created_at DESC`, sort secundario (desempate) `tipos_ticket.nombre ASC` (nombre del tipo en texto, orden alfabético ascendente — NOT por `tipo_id` ni por UUID del tipo).

No hay paginación (sin `limit`/`offset`). El endpoint devuelve todos los tickets del tenant que cumplen los filtros, excluyendo soft-deleted.

El endpoint MUST validar TenantContext (usuario+tenant) antes de consultar la DB.

#### Scenario: Sin filtros devuelve todos los tickets activos ordenados

**Given** un tenant con tickets de distintos tipos y fechas, todos con `deleted_at IS NULL`
**And** el usuario autenticado tiene permiso `ticket:ver`
**When** el usuario llama `GET /tickets` sin query params
**Then** la respuesta MUST ser `HTTP 200` con todos los tickets activos del tenant
**And** el array MUST estar ordenado: primary `tickets.created_at DESC`; secondary `tipos_ticket.nombre ASC` (nombre del tipo, alfabético)
**And** tickets de otros tenants MUST NOT aparecer

#### Scenario: Filtro tiposIds[] limita resultados al tipo indicado

**Given** un tenant con tickets de tipo SOPORTE, COMPRAS y EDILICIA
**And** el usuario tiene permiso `ticket:ver`
**When** el usuario llama `GET /tickets?tiposIds[]=<uuid_soporte>&tiposIds[]=<uuid_compras>`
**Then** la respuesta MUST ser `HTTP 200`
**And** todos los items de la respuesta MUST tener `tipo_id` igual a `<uuid_soporte>` o `<uuid_compras>`
**And** tickets de tipo EDILICIA MUST NOT aparecer

#### Scenario: tiposIds[] ausente no restringe por tipo

**Given** tickets de los 3 tipos en el tenant
**And** el usuario tiene permiso `ticket:ver`
**When** el usuario llama `GET /tickets` sin el param `tiposIds[]`
**Then** tickets de todos los tipos MUST aparecer en la respuesta

#### Scenario: tiposIds[] con UUID de tipo inexistente devuelve array vacío sin error

**Given** el usuario tiene permiso `ticket:ver`
**When** el usuario llama `GET /tickets?tiposIds[]=<uuid_que_no_existe_en_este_tenant>`
**Then** la respuesta MUST ser `HTTP 200` con un array vacío `[]`
**And** MUST NOT devolver `HTTP 4xx` ni `HTTP 5xx`

#### Scenario: Filtro fechaDesde/fechaHasta limita por rango de created_at

**Given** tickets creados en fechas 2026-01-01, 2026-06-15 y 2026-12-31 en el tenant
**And** el usuario tiene permiso `ticket:ver`
**When** el usuario llama `GET /tickets?fechaDesde=2026-06-01&fechaHasta=2026-06-30`
**Then** solo el ticket creado en 2026-06-15 MUST aparecer
**And** los tickets de 2026-01-01 y 2026-12-31 MUST NOT aparecer

#### Scenario: Filtros combinados (tipo + rango) aplican ambas condiciones simultáneamente

**Given** tickets de tipos SOPORTE y COMPRAS en distintas fechas en el tenant
**And** el usuario tiene permiso `ticket:ver`
**When** el usuario llama `GET /tickets?tiposIds[]=<uuid_soporte>&fechaDesde=2026-01-01&fechaHasta=2026-06-30`
**Then** solo tickets de tipo SOPORTE creados entre 2026-01-01 y 2026-06-30 MUST aparecer
**And** tickets de COMPRAS y tickets fuera del rango MUST NOT aparecer

#### Scenario: fechaDesde mayor que fechaHasta rechazado con 422

**Given** el usuario tiene permiso `ticket:ver`
**When** el usuario llama `GET /tickets?fechaDesde=2026-12-31&fechaHasta=2026-01-01`
**Then** la respuesta MUST ser `HTTP 422`
**And** el body de error MUST indicar que el rango de fechas es inválido (fechaDesde > fechaHasta)
**And** MUST NOT devolver datos de tickets

#### Scenario: Ticket de otro tenant no aparece aunque coincida con los filtros

**Given** el usuario autenticado pertenece al tenant A
**And** el tenant B tiene tickets que coincidirían con los filtros activos
**When** el usuario llama `GET /tickets` con o sin filtros
**Then** los tickets del tenant B MUST NOT aparecer
**And** el TenantContext MUST confinar los resultados a la DB del tenant A

---

### Requirement: GET /tickets/ciclo-activo expone el ciclo activo del tenant

`GET /tickets/ciclo-activo` MUST estar definido en `TicketsController` y retornar el ciclo activo (`activo = TRUE`, `deleted_at IS NULL`) de la tabla `ciclos_cliente` de la DB tenant autenticada.

Este endpoint es **solo lectura**. La creación, edición y desactivación de ciclos pertenece al change `gestion-ciclos-cliente` (fuera de alcance de esta change).

El endpoint MUST validar TenantContext antes de consultar.

#### Scenario: Tenant con ciclo activo — devuelve el ciclo

**Given** el tenant tiene exactamente un `ciclos_cliente` con `activo = TRUE` y `deleted_at IS NULL`
**And** el usuario autenticado tiene permiso `ticket:ver`
**When** el usuario llama `GET /tickets/ciclo-activo`
**Then** la respuesta MUST ser `HTTP 200`
**And** el body MUST incluir al menos: `id`, `nombre`, `fechaInicio` (ISO date `YYYY-MM-DD`), `fechaFin` (ISO date `YYYY-MM-DD`), `activo: true`

#### Scenario: Tenant sin ciclo activo — devuelve 404

**Given** el tenant NO tiene ningún `ciclos_cliente` con `activo = TRUE` y `deleted_at IS NULL`
**When** el usuario autenticado llama `GET /tickets/ciclo-activo`
**Then** la respuesta MUST ser `HTTP 404`
**And** el body de error MUST incluir mensaje indicando que no hay ciclo activo
**And** MUST NOT exponer datos de ciclos de otros tenants

#### Scenario: Sin TenantContext válido — rechazado

**Given** una request sin JWT válido o sin TenantContext activo
**When** se llama `GET /tickets/ciclo-activo`
**Then** la respuesta MUST ser `HTTP 401` o `HTTP 403`
**And** MUST NOT devolver datos de ningún tenant

#### Scenario: Aislamiento de tenant en ciclo activo

**Given** el usuario pertenece al tenant A
**And** el tenant B tiene un ciclo activo, el tenant A no tiene ninguno
**When** el usuario llama `GET /tickets/ciclo-activo`
**Then** la respuesta MUST ser `HTTP 404` (no hay ciclo activo en tenant A)
**And** MUST NOT devolver el ciclo activo del tenant B

---

### Requirement: POST /tickets acepta fechaCreacion explícita

`POST /tickets` MUST aceptar el campo opcional `fechaCreacion` (string, formato `YYYY-MM-DD`). Cuando está presente, `tickets.created_at` MUST ser seteado a ese valor por el use case. Cuando está ausente, el use case MUST usar `new Date()` (momento de creación de la request).

No hay restricción sobre si la fecha es pasada o futura.

La validación de usuario+tenant MUST ocurrir antes de persistir (igual que el flujo existente).

#### Scenario: Alta con fechaCreacion pasada — aceptada

**Given** el usuario tiene permiso `ticket:crear`
**And** el body incluye `fechaCreacion: '2025-06-15'`
**When** el usuario envía `POST /tickets` con todos los campos requeridos válidos
**Then** la respuesta MUST ser `HTTP 201`
**And** `tickets.created_at` MUST reflejar la fecha 2025-06-15
**And** MUST NOT retornar `HTTP 422` por la fecha siendo pasada

#### Scenario: Alta con fechaCreacion futura — aceptada

**Given** el usuario tiene permiso `ticket:crear`
**And** el body incluye `fechaCreacion: '2030-12-31'`
**When** el usuario envía `POST /tickets` con campos requeridos válidos
**Then** la respuesta MUST ser `HTTP 201`
**And** `tickets.created_at` MUST reflejar la fecha 2030-12-31

#### Scenario: Alta sin fechaCreacion — created_at setteado a now()

**Given** el usuario tiene permiso `ticket:crear`
**And** el body NO incluye el campo `fechaCreacion`
**When** el usuario envía `POST /tickets`
**Then** la respuesta MUST ser `HTTP 201`
**And** `tickets.created_at` MUST ser aproximadamente el momento de ejecución del use case (margen de 5 segundos)

#### Scenario: fechaCreacion con formato inválido — rechazada con 422

**Given** el usuario tiene permiso `ticket:crear`
**And** el body incluye `fechaCreacion: 'no-es-fecha'`
**When** el usuario envía `POST /tickets`
**Then** la respuesta MUST ser `HTTP 422`
**And** el body de error MUST indicar que `fechaCreacion` tiene formato inválido

---

### Requirement: fechaResolucion seteada por el técnico al transicionar a RESUELTO

`PATCH /tickets/:id/estado` MUST extender su body con el campo `fechaResolucion` (string `YYYY-MM-DD`, requerido cuando `nuevoEstadoCodigo = 'RESUELTO'`). Para cualquier otro estado destino, el campo MUST ser ignorado.

El use case MUST validar usuario+tenant (principio de menor privilegio, aislamiento multi-tenant) antes de ejecutar.

La transición MUST seguir siendo atómica: `tickets.estado_id`, `tickets.fecha_resolucion` y la `operaciones_ticket` se actualizan en la misma transacción Postgres.

**Reapertura:** cuando un ticket en estado `RESUELTO` transiciona a cualquier estado activo (ej. `EN_PROGRESO`), `tickets.fecha_resolucion` MUST ser seteada a `NULL` en la misma transacción. Al volver a transicionar a `RESUELTO`, `fechaResolucion` MUST ser requerida nuevamente.

#### Scenario: Transición a RESUELTO con fechaResolucion — exitosa

**Given** un ticket activo en estado `EN_PROGRESO`
**And** el usuario autenticado tiene permiso `ticket:transicionar`
**And** el ticket pertenece al tenant del usuario
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'RESUELTO', fechaResolucion: '2026-06-28' }`
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.estado_id` MUST apuntar al UUID del estado `RESUELTO`
**And** `tickets.fecha_resolucion` MUST ser `2026-06-28`
**And** dentro de la MISMA transacción MUST registrarse en `operaciones_ticket` con `tipo_operacion.codigo = 'CAMBIO_ESTADO'`, `estado_anterior_id` = UUID de `EN_PROGRESO`, `estado_nuevo_id` = UUID de `RESUELTO`, `autor_id` del usuario autenticado

#### Scenario: Transición a RESUELTO sin fechaResolucion — rechazada con 422

**Given** un ticket activo en estado `EN_PROGRESO`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'RESUELTO' }` sin `fechaResolucion`
**Then** la respuesta MUST ser `HTTP 422`
**And** el body de error MUST indicar que `fechaResolucion` es requerida para transicionar a RESUELTO
**And** MUST NOT modificar `tickets.estado_id` ni `tickets.fecha_resolucion`
**And** MUST NOT registrar ninguna `operaciones_ticket`

#### Scenario: Transición a RESUELTO con fechaResolucion en formato inválido — rechazada

**Given** un ticket activo en estado `EN_PROGRESO`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'RESUELTO', fechaResolucion: 'no-es-fecha' }`
**Then** la respuesta MUST ser `HTTP 422`
**And** el body MUST indicar que `fechaResolucion` tiene formato inválido
**And** MUST NOT modificar datos del ticket

#### Scenario: Transición a estado distinto de RESUELTO ignora fechaResolucion

**Given** un ticket activo en estado `ABIERTO`
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'EN_PROGRESO', fechaResolucion: '2026-06-28' }`
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.estado_id` MUST apuntar al estado `EN_PROGRESO`
**And** `tickets.fecha_resolucion` MUST permanecer sin cambios (no fue modificada)

#### Scenario: Reapertura desde RESUELTO limpia fechaResolucion

**Given** un ticket con `estado.codigo = 'RESUELTO'` y `fecha_resolucion = '2026-06-28'`
**And** el usuario autenticado tiene permiso `ticket:transicionar`
**And** el ticket pertenece al tenant del usuario
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'EN_PROGRESO' }` (reapertura)
**Then** la respuesta MUST ser `HTTP 200`
**And** `tickets.estado_id` MUST apuntar al estado `EN_PROGRESO`
**And** `tickets.fecha_resolucion` MUST ser `NULL` (limpiada por la reapertura)
**And** dentro de la MISMA transacción MUST registrarse en `operaciones_ticket` con `tipo_operacion.codigo = 'CAMBIO_ESTADO'`, `estado_anterior_id` = UUID de `RESUELTO`, `estado_nuevo_id` = UUID de `EN_PROGRESO`, `autor_id` del usuario autenticado

#### Scenario: Ticket reabierto que vuelve a RESUELTO requiere fechaResolucion nuevamente

**Given** un ticket en estado `EN_PROGRESO` con `fecha_resolucion = NULL` (fue reabierto previamente)
**And** el usuario tiene permiso `ticket:transicionar`
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'RESUELTO' }` sin `fechaResolucion`
**Then** la respuesta MUST ser `HTTP 422`
**And** el body de error MUST indicar que `fechaResolucion` es requerida para transicionar a RESUELTO
**And** `tickets.fecha_resolucion` MUST permanecer `NULL`
**And** MUST NOT modificar `tickets.estado_id`

---

#### Scenario: Transición a RESUELTO desde ticket de otro tenant — rechazada con 404

**Given** un ticket que existe en la DB del tenant B
**And** el usuario autenticado pertenece al tenant A
**When** el usuario envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'RESUELTO', fechaResolucion: '2026-06-28' }`
**Then** la respuesta MUST ser `HTTP 404`
**And** MUST NOT modificar datos del tenant B

#### Scenario: Transición a RESUELTO sin permiso ticket:transicionar — rechazada con 403

**Given** un usuario autenticado sin el permiso `ticket:transicionar` en su JWT
**When** envía `PATCH /tickets/{id}/estado` con `{ nuevoEstadoCodigo: 'RESUELTO', fechaResolucion: '2026-06-28' }`
**Then** la respuesta MUST ser `HTTP 403`
**And** MUST NOT ejecutar ningún use case ni modificar datos

---

### Requirement: Migración multi-tenant rename idempotente y verificable

La migración `RENAME COLUMN fecha_vencimiento TO fecha_resolucion` MUST cumplir:

1. **Idempotencia**: si la columna ya fue renombrada (ej. segunda ejecución), MUST detectarlo y saltar sin error.
2. **Cobertura total**: MUST ejecutarse en TODAS las tenant DBs activas antes de desplegar código que referencie `fecha_resolucion`.
3. **Verificación post-migración**: el runner MUST confirmar que `fecha_resolucion` existe en cada tenant DB después del rename.
4. **Rollback**: ante fallo en cualquier tenant, MUST reportar qué tenants fallaron sin afectar los ya migrados correctamente.

#### Scenario: Migración exitosa en tenant con columna original

**Given** una tenant DB con columna `fecha_vencimiento` en la tabla `tickets`
**When** el runner de migración ejecuta sobre ese tenant
**Then** la columna MUST renombrarse a `fecha_resolucion`
**And** todos los datos existentes en `fecha_vencimiento` MUST estar accesibles bajo `fecha_resolucion`
**And** ninguna fila MUST perderse ni modificarse en contenido

#### Scenario: Migración idempotente — tenant ya migrado

**Given** una tenant DB donde `fecha_resolucion` ya existe (migración aplicada previamente)
**When** el runner de migración ejecuta nuevamente sobre ese tenant
**Then** MUST NOT arrojar error
**And** MUST NOT modificar ninguna columna ni dato
**And** el runner MUST reportar el tenant como "ya migrado, saltado"

#### Scenario: Rollback transaccional en tenant

**Given** la migración falla a mitad de camino en un tenant específico (ej. error de permisos DB)
**When** el runner detecta el error
**Then** la tabla `tickets` en ese tenant MUST permanecer en el estado previo al intento
**And** el runner MUST reportar el tenant fallido sin afectar los demás tenants ya migrados
