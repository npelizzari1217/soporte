# Delta Spec: Tickets UI — tickets-list-filtros-resolucion

> **Tipo:** delta
> **Sobre:** `openspec/specs/tickets-ui/spec.md`
> **Change:** `tickets-list-filtros-resolucion`
> **Fecha:** 2026-06-28
>
> Este archivo describe únicamente los REQUISITOS ADICIONALES y las ENMIENDAS
> que deben ser verdaderos después de aplicar el change. Los requirements de la
> spec canónica de `tickets-ui` siguen vigentes salvo donde se indica "Enmienda".
> No describe implementación — solo comportamiento observable y verificable.

---

## Enmiendas a requirements existentes

### Enmienda: CreateTicketSchema — agrega fechaCreacion, elimina fechaVencimiento

> Modifica `CreateTicketSchema` en el Requirement "Schemas Zod por operación correctamente tipados"
> de `openspec/specs/tickets-ui/spec.md`.

**Después de esta change:**

- `fechaVencimiento` MUST NOT existir en `CreateTicketSchema`.
- `fechaResolucion` MUST NOT existir en `CreateTicketSchema` (solo se setea vía transición de estado).
- `fechaCreacion` (string ISO date `YYYY-MM-DD`, opcional) MUST ser agregado. El formulario provee siempre un default = fecha de hoy; el schema no aplica el default (lo hace el form con `defaultValues`).
- `tipoId` continúa siendo requerido (UUID); el formulario lo pre-popula desde el contexto de filtro (ver Requirement: Pre-población de tipoId en formulario de alta).

#### Scenario: CreateTicketSchema acepta fechaCreacion con formato válido

- GIVEN `CreateTicketSchema` está definido
- WHEN se parsea `{ titulo: 'Test', tipoId: '<uuid>', prioridadId: '<uuid>', fechaCreacion: '2026-01-15' }`
- THEN el resultado MUST tener `success: true`

#### Scenario: CreateTicketSchema rechaza fechaCreacion con formato inválido

- GIVEN `CreateTicketSchema` está definido
- WHEN se parsea un objeto con `fechaCreacion: 'no-es-fecha'`
- THEN el resultado MUST tener `success: false`
- AND el error MUST apuntar al campo `fechaCreacion`

#### Scenario: CreateTicketSchema acepta objeto mínimo sin fechaCreacion

- GIVEN `CreateTicketSchema` está definido
- WHEN se parsea `{ titulo: 'Test', tipoId: '<uuid>', prioridadId: '<uuid>' }` sin `fechaCreacion`
- THEN el resultado MUST tener `success: true`
- AND `fechaCreacion` ausente MUST resolverse como `undefined` (el formulario siempre lo envía con default hoy)

#### Scenario: CreateTicketSchema no tiene campos fechaVencimiento ni fechaResolucion

- GIVEN `CreateTicketSchema` está definido
- WHEN se examina el schema resultante
- THEN MUST NOT contener las keys `fechaVencimiento` ni `fechaResolucion`

---

### Enmienda: UpdateTicketSchema — elimina fechaVencimiento

> Modifica `UpdateTicketSchema` en el mismo Requirement.

- `fechaVencimiento` MUST NOT existir en `UpdateTicketSchema`.
- `fechaResolucion` MUST NOT existir en `UpdateTicketSchema`.

#### Scenario: UpdateTicketSchema no tiene campos de resolución

- GIVEN `UpdateTicketSchema` está definido
- WHEN se examina el schema resultante
- THEN MUST NOT contener las keys `fechaVencimiento` ni `fechaResolucion`

---

## Nuevos Requirements

### Requirement: useTickets acepta filtros y parametriza query key

`useTickets` MUST aceptar un objeto de filtros `{ tiposIds?: string[]; fechaDesde?: string; fechaHasta?: string }` y construir la URL con los query params correspondientes. El query key MUST incluir los valores de filtro para evitar cache stale entre distintas combinaciones de filtros.

La invalidación por mutaciones (crear/editar/eliminar ticket) MUST invalidar toda la familia con prefijo `["tickets"]` para cubrir todas las variantes de filtro activas.

#### Scenario: useTickets pasa filtros como query params en la request

- GIVEN `useTickets` está montado con `{ tiposIds: ['<uuid>'], fechaDesde: '2026-01-01', fechaHasta: '2026-06-30' }`
- WHEN se ejecuta la query
- THEN MUST llamar a `apiFetch` con una URL que incluya `tiposIds[]=<uuid>`, `fechaDesde=2026-01-01` y `fechaHasta=2026-06-30` como query params

#### Scenario: useTickets sin filtros no agrega query params

- GIVEN `useTickets` está montado con objeto de filtros vacío `{}` o sin argumento
- WHEN se ejecuta la query
- THEN MUST llamar a `apiFetch` con URL `tickets` sin query params adicionales

#### Scenario: Cambio de filtros produce query key distinta y dispara nuevo fetch

- GIVEN `useTickets` está montado con filtros `A`
- WHEN los filtros cambian a `B` (distintos de `A`)
- THEN la query key MUST ser distinta entre `A` y `B`
- AND la query con filtros `B` MUST disparar una nueva request (no reutiliza cache de `A`)

#### Scenario: useCreateTicket invalida prefijo ["tickets"] — cubre todas las variantes de filtro

- GIVEN `useCreateTicket` completa exitosamente con HTTP 201
- WHEN `invalidateQueries` se ejecuta en `onSuccess`
- THEN MUST invalidar el prefijo `["tickets"]` (no solo un `queryKey` puntual)
- AND todas las instancias activas de `useTickets` con cualquier combinación de filtros MUST re-fetchar

---

### Requirement: useCicloActivo — hook para el ciclo activo del tenant

`useCicloActivo` MUST ser un custom hook de TanStack Query que llama a `GET /api/tickets/ciclo-activo`. El hook MUST distinguir entre "sin ciclo activo" (HTTP 404) y errores inesperados (5xx).

Un HTTP 404 del backend MUST tratarse como estado válido de negocio: `data = null`, `error = null`, `isLoading = false`. No es un error fatal.

#### Scenario: useCicloActivo devuelve el ciclo cuando existe

- GIVEN el backend responde `HTTP 200` con `{ id, nombre, fechaInicio: '2026-01-01', fechaFin: '2026-12-31', activo: true }`
- WHEN `useCicloActivo` está montado
- THEN `data` MUST contener el objeto con `fechaInicio` y `fechaFin` como strings ISO date
- AND `isLoading` MUST ser `false`
- AND `error` MUST ser `null`

#### Scenario: useCicloActivo devuelve null cuando no hay ciclo activo (HTTP 404)

- GIVEN el backend responde `HTTP 404`
- WHEN `useCicloActivo` está montado
- THEN `data` MUST ser `null`
- AND `error` MUST ser `null`
- AND `isLoading` MUST ser `false`
- AND MUST NOT propagarse ninguna excepción al componente consumidor

#### Scenario: useCicloActivo expone error en falla inesperada (HTTP 5xx)

- GIVEN el backend responde `HTTP 500`
- WHEN `useCicloActivo` está montado
- THEN `error` MUST ser no-null (instancia de `ApiError` o equivalente)
- AND `data` MUST ser `null` o `undefined`

---

### Requirement: Panel de filtros — tipos y rango temporal

La página de lista de tickets MUST incluir un FilterPanel con:

1. Controles de selección para los 3 tipos de ticket (SOPORTE, COMPRAS, EDILICIA). Cuando ningún tipo está seleccionado, la query no incluye el param `tiposIds[]`.
2. Inputs de fecha `fechaDesde` y `fechaHasta`.

Los valores por defecto de `fechaDesde` y `fechaHasta` MUST provenir del ciclo activo: `fechaInicio` y `fechaFin` respectivamente. Mientras `useCicloActivo` está cargando, los inputs de fecha MUST mostrar skeleton (no son interactivos). Los controles de tipo MUST ser accesibles aunque el ciclo no haya cargado.

#### Scenario: FilterPanel renderiza con los 3 tipos de ticket

- GIVEN la página de lista de tickets renderiza
- WHEN el FilterPanel se monta
- THEN MUST mostrarse exactamente 3 controles de tipo (uno por SOPORTE, COMPRAS, EDILICIA)
- AND cada control MUST mostrar el nombre del tipo

#### Scenario: Desseleccionar un tipo actualiza la query de tickets

- GIVEN el FilterPanel tiene todos los tipos activos
- WHEN el usuario desselecciona el tipo SOPORTE
- THEN `useTickets` MUST recibir filtros actualizados excluyendo SOPORTE
- AND la lista MUST re-fetchar mostrando solo tickets de COMPRAS y EDILICIA

#### Scenario: Inputs de fecha se inicializan con las fechas del ciclo activo

- GIVEN `useCicloActivo` devuelve `{ fechaInicio: '2026-01-01', fechaFin: '2026-12-31' }`
- WHEN el FilterPanel se monta por primera vez
- THEN el input `fechaDesde` MUST tener valor `2026-01-01`
- AND el input `fechaHasta` MUST tener valor `2026-12-31`

#### Scenario: Sin ciclo activo — inputs de fecha arrancan sin valor por defecto

- GIVEN `useCicloActivo` devuelve `null`
- WHEN el FilterPanel se monta
- THEN los inputs de fecha MUST estar vacíos (sin valor predeterminado)
- AND MUST mostrarse el aviso de "no hay ciclo activo" (ver Requirement: Aviso cuando no hay ciclo activo)

#### Scenario: Cambio manual de fechaDesde actualiza la query

- GIVEN el FilterPanel tiene `fechaDesde = '2026-01-01'` (default del ciclo)
- WHEN el usuario cambia `fechaDesde` a `2026-03-01`
- THEN `useTickets` MUST recibir `fechaDesde: '2026-03-01'` y re-fetchar

#### Scenario: Skeleton en inputs de fecha durante carga del ciclo activo

- GIVEN `useCicloActivo` está en estado `isLoading = true`
- WHEN el FilterPanel renderiza
- THEN los inputs de fecha MUST mostrar skeleton (no valores reales ni inputs interactivos)
- AND los controles de tipo MUST ser interactivos (no esperan el ciclo)

---

### Requirement: Aviso cuando no hay ciclo activo

Cuando `useCicloActivo` devuelve `null`, la lista de tickets MUST estar vacía y MUST mostrarse un aviso visible indicando que no hay ciclo activo para este tenant.

`useTickets` MUST NOT disparar ningún fetch al backend mientras no haya ciclo activo. El aviso MUST ser persistente (no descartable) mientras el estado de "sin ciclo" persista.

#### Scenario: Sin ciclo activo — lista vacía con aviso y sin fetch

- GIVEN `useCicloActivo` devuelve `null`
- WHEN la página de lista de tickets renderiza
- THEN la lista de tickets MUST estar vacía (sin filas-tarjeta ni skeleton de tickets)
- AND MUST mostrarse un aviso/banner con texto que incluya "ciclo activo" (u equivalente en español)
- AND `useTickets` MUST NOT haber disparado ninguna request a `GET /api/tickets`

#### Scenario: Aviso de sin ciclo incluye texto legible y rol de alerta accesible

- GIVEN la página renderiza con `useCicloActivo` = `null`
- WHEN se inspecciona el DOM
- THEN MUST existir un elemento con texto que mencione la ausencia de ciclo activo
- AND el elemento MUST tener `role="alert"` o equivalente ARIA para accesibilidad

#### Scenario: Con ciclo activo — el aviso no aparece en el DOM

- GIVEN `useCicloActivo` devuelve un ciclo con `activo: true`
- WHEN la página de lista de tickets renderiza
- THEN el aviso de "no hay ciclo activo" MUST NOT estar en el DOM

#### Scenario: Ciclo activo cargando — no se muestra el aviso ni la lista

- GIVEN `useCicloActivo` está en estado `isLoading = true`
- WHEN la página renderiza
- THEN MUST mostrarse skeleton de la página (FilterPanel en skeleton + lista en skeleton)
- AND MUST NOT mostrarse el aviso de sin ciclo
- AND MUST NOT mostrarse una lista vacía

---

### Requirement: Pre-población de tipoId en formulario de alta

Cuando el usuario abre el formulario de alta, el campo `tipoId` MUST pre-popularse con el tipo actualmente filtrado en el FilterPanel **si y solo si hay exactamente un tipo seleccionado**. Con cero o más de un tipo seleccionado, `tipoId` arranca vacío.

El campo `tipoId` MUST seguir siendo editable independientemente del valor pre-poblado.

#### Scenario: Un solo tipo activo en filtros — tipoId pre-poblado

- GIVEN el FilterPanel tiene seleccionado únicamente el tipo SOPORTE (`<uuid_soporte>`)
- WHEN el usuario abre el formulario de alta
- THEN el campo `tipoId` MUST tener pre-seleccionado `<uuid_soporte>`
- AND el campo MUST seguir siendo editable (el usuario puede cambiarlo)

#### Scenario: Varios tipos activos en filtros — tipoId arranca vacío

- GIVEN el FilterPanel tiene seleccionados SOPORTE y COMPRAS (más de uno)
- WHEN el usuario abre el formulario de alta
- THEN el campo `tipoId` MUST inicializarse sin selección

#### Scenario: Ningún tipo seleccionado en filtros — tipoId arranca vacío

- GIVEN el FilterPanel no tiene ningún tipo seleccionado (todos activos o ninguno)
- WHEN el usuario abre el formulario de alta
- THEN el campo `tipoId` MUST inicializarse sin selección

#### Scenario: Usuario cambia tipoId pre-poblado — submit usa el valor editado

- GIVEN el campo `tipoId` se pre-pobló con SOPORTE
- WHEN el usuario selecciona COMPRAS en el campo `tipoId`
- AND hace submit con campos válidos
- THEN el body del `POST /tickets` MUST incluir el `tipoId` de COMPRAS (no el original SOPORTE)

---

### Requirement: fechaCreacion editable en formulario de alta

El formulario de alta MUST incluir un campo `fechaCreacion` visible, de tipo fecha (input date o equivalente), con valor por defecto = la fecha de hoy en formato `YYYY-MM-DD`. El campo MUST ser editable. El DTO enviado al backend MUST siempre incluir `fechaCreacion`.

#### Scenario: Formulario de alta muestra fechaCreacion con default hoy

- GIVEN el formulario de alta se abre (supongamos hoy = 2026-06-28)
- WHEN se renderiza el campo `fechaCreacion`
- THEN el campo MUST tener valor `2026-06-28`
- AND el campo MUST ser interactivo (no readonly)

#### Scenario: Usuario cambia fechaCreacion — el submit envía la nueva fecha

- GIVEN el formulario de alta está abierto con `fechaCreacion` = hoy
- WHEN el usuario cambia `fechaCreacion` a `2025-03-15`
- AND hace submit con todos los campos requeridos válidos
- THEN el body del `POST /tickets` MUST incluir `fechaCreacion: '2025-03-15'`

#### Scenario: Submit sin modificar fechaCreacion — envía la fecha de hoy

- GIVEN el formulario de alta se abre y el usuario no modifica `fechaCreacion`
- WHEN el usuario hace submit
- THEN el body MUST incluir `fechaCreacion` con la fecha de hoy en `YYYY-MM-DD`
- AND MUST NOT omitir el campo `fechaCreacion`

---

### Requirement: Campo fechaResolucion (ex fechaVencimiento) eliminado de los formularios

El formulario de alta (CreateTicketModal) y el de edición (EditTicketModal) MUST NOT incluir ningún campo visible, oculto (hidden) o en el schema para `fechaResolucion` ni `fechaVencimiento`. Este dato solo se gestiona desde la vista de detalle del ticket al transicionar a RESUELTO.

#### Scenario: Formulario de alta no incluye campo de resolución

- GIVEN el formulario de alta se abre
- WHEN se inspecciona el DOM del formulario
- THEN MUST NOT existir ningún input, select ni elemento hidden con name `fechaResolucion` o `fechaVencimiento`

#### Scenario: Formulario de edición no incluye campo de resolución

- GIVEN el formulario de edición se abre para un ticket (incluso uno con `fechaResolucion` ya seteada)
- WHEN se inspecciona el DOM del formulario
- THEN MUST NOT existir ningún input, select ni hidden con name `fechaResolucion` o `fechaVencimiento`

#### Scenario: Submit de edición no incluye fechaResolucion en el body del PATCH

- GIVEN el formulario de edición está abierto para un ticket con `fechaResolucion: '2026-05-01'` en la DB
- WHEN el usuario hace submit (modificando o no otros campos)
- THEN el body del `PATCH /tickets/:id` MUST NOT incluir `fechaResolucion` ni `fechaVencimiento`
- AND `tickets.fecha_resolucion` en DB MUST permanecer sin cambios
