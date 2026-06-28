# Spec: Tickets CRUD UI

> Capability: `tickets-ui`
> Stack: react-hook-form + zod + @hookform/resolvers, TanStack Query v5, sonner, @radix-ui/react-alert-dialog
> Authority: CLAUDE.md §2 (Scope Rule), §3 (Patrones Premium), §7 (Seguridad por Diseño)
> Archivado desde: `tickets-crud` (2026-06-28)
> Depends on: `frontend-design-system` (FormField, FormModal, ConfirmDialog, Toaster), `frontend-api-client` (apiFetch), `frontend-ui-states` (Interactive State, permisos)

## Context

tickets-ui introduce las primeras operaciones de escritura de Tickets en el frontend. El backend
expone tres endpoints: POST /tickets (crear), PATCH /tickets/:id (editar campos parciales),
DELETE /tickets/:id (soft-delete idempotente). El solicitante NUNCA aparece en el formulario —
se auto-inyecta como `user.sub` del JWT decodificado por el SessionProvider. El formulario de
edición excluye `tipoId` y `estado` porque el PATCH del backend los rechaza con 422 si se
envían. RBAC es UX (ocultar/deshabilitar acciones), nunca la autoridad final — el backend valida
independientemente en cada request (§7).

Los formularios se presentan en `<FormModal>` (Radix Dialog glassmorphism): el flujo crea/edita
sin navegar a una página nueva, maximizando la reutilización de la infra × 4 entidades.

Las validaciones Zod son la única validación por campo: el backend usa interfaces planas sin
class-validator y devuelve strings de dominio únicos (no arrays por campo).

---

## Requirements

### Requirement: Schemas Zod por operación correctamente tipados

El frontend MUST definir dos schemas Zod independientes: `CreateTicketSchema` para POST y
`UpdateTicketSchema` para PATCH. Los schemas MUST ser la fuente de verdad de validación por campo
en la UI — el backend no valida a nivel de campo.

`CreateTicketSchema` MUST incluir: `titulo` (string, min 1, max 255), `descripcion` (string max
1000, nullable opcional), `tipoId` (UUID, requerido), `prioridadId` (UUID, requerido), `cicloId`
(UUID, nullable opcional), `fechaVencimiento` (string ISO date, nullable opcional). MUST NOT
incluir `solicitanteId` en el schema del formulario.

`UpdateTicketSchema` MUST incluir: `titulo` (string, min 1, max 255, opcional), `descripcion`
(string max 1000, nullable opcional), `prioridadId` (UUID, opcional), `cicloId` (UUID, nullable
opcional), `fechaVencimiento` (string ISO date, nullable opcional). MUST NOT incluir `tipoId`
ni ningún campo de estado. Todos los campos son opcionales — semántica REST PATCH parcial.

#### Scenario: CreateTicketSchema rechaza titulo vacío con mensaje de error

- GIVEN `CreateTicketSchema` está definido
- WHEN se llama a `CreateTicketSchema.safeParse({ titulo: '', tipoId: '<uuid>', prioridadId: '<uuid>' })`
- THEN el resultado MUST tener `success: false`
- AND el error MUST apuntar al campo `titulo`
- AND el mensaje MUST ser legible en español (ej. "El título es requerido")

#### Scenario: CreateTicketSchema rechaza titulo superior a 255 caracteres

- GIVEN `CreateTicketSchema` está definido
- WHEN se parsea un objeto con `titulo` de 256 caracteres
- THEN el resultado MUST tener `success: false`
- AND el error MUST apuntar al campo `titulo`

#### Scenario: CreateTicketSchema rechaza tipoId que no es UUID

- GIVEN `CreateTicketSchema` está definido
- WHEN se parsea un objeto con `tipoId: 'no-es-uuid'`
- THEN el resultado MUST tener `success: false`
- AND el error MUST apuntar al campo `tipoId`

#### Scenario: CreateTicketSchema acepta objeto mínimo válido

- GIVEN `CreateTicketSchema` está definido
- WHEN se parsea `{ titulo: 'Falla red', tipoId: '<uuid válido>', prioridadId: '<uuid válido>' }`
- THEN el resultado MUST tener `success: true`
- AND los campos opcionales ausentes (descripcion, cicloId, fechaVencimiento) MUST ser undefined o null sin error

#### Scenario: UpdateTicketSchema no acepta tipoId ni campos de estado

- GIVEN `UpdateTicketSchema` está definido
- WHEN se examina el schema resultante
- THEN MUST NOT tener las keys `tipoId` ni `estado` como campos válidos
- AND parsear un objeto que incluya `tipoId` MUST ignorarlo (Zod `.strip()` por defecto)

#### Scenario: UpdateTicketSchema acepta objeto vacío — todos los campos son opcionales (edición parcial)

- GIVEN `UpdateTicketSchema` está definido
- WHEN se parsea un objeto vacío `{}`
- THEN MUST tener `success: true` (PATCH semántico: ningún campo es obligatorio)
- AND la validación de presencia recae en el formulario, que pre-pobla los campos con los
  valores actuales del ticket (defaultValues); no en el schema
- NOTE: si el hook se usa fuera del formulario sin defaultValues, el PATCH puede llegar sin
  campos — la autoridad de rechazo es el backend. La semántica REST parcial es correcta por
  diseño (ADR en `tickets-crud/design.md §3`).

---

### Requirement: Acción "Crear ticket" solo visible para usuarios con permiso ticket:crear

El botón o enlace "Crear ticket" en la lista de tickets MUST solo renderizar en el DOM si el
usuario autenticado tiene el permiso `ticket:crear` en su JWT (vía `useSession().can()`). Si no
tiene el permiso, el elemento MUST NOT estar en el DOM.

#### Scenario: Usuario con ticket:crear ve el botón "Crear ticket"

- GIVEN un usuario autenticado con `permisos: ['ticket:crear', 'ticket:ver_todos']`
- AND SessionProvider tiene el usuario en contexto
- WHEN la página de lista de tickets renderiza
- THEN el botón "Crear ticket" (o equivalente) MUST estar presente y clickeable en el DOM

#### Scenario: Usuario sin ticket:crear no ve el botón "Crear ticket"

- GIVEN un usuario autenticado con `permisos: ['ticket:ver_todos']` (sin ticket:crear)
- WHEN la página de lista de tickets renderiza
- THEN el botón "Crear ticket" MUST NOT estar en el DOM
- AND MUST NOT ser accesible vía aria-hidden ni display:none (exclusión condicional en render)

---

### Requirement: Formulario de creación en FormModal con validación por campo

Cuando el usuario abre el formulario de creación, MUST presentarse dentro de un `<FormModal>`.
El formulario MUST usar react-hook-form con el resolver de zod conectado a `CreateTicketSchema`.
Los errores por campo MUST mostrarse via `<FormField>` inmediatamente al abandonar el campo (blur)
o al intentar enviar con campos inválidos.

El campo `solicitanteId` MUST auto-inyectarse desde `user.sub` en el `mutationFn` del hook —
MUST NOT aparecer como campo visible en el formulario.

#### Scenario: FormModal de creación se abre al hacer click en "Crear ticket"

- GIVEN el usuario tiene permiso `ticket:crear`
- AND la página de lista de tickets renderiza
- WHEN el usuario hace click en "Crear ticket"
- THEN MUST aparecer un modal (Radix Dialog) con el formulario de creación
- AND el modal MUST tener foco en el primer campo (titulo) por accesibilidad
- AND el resto de la página MUST quedar inaccesible via teclado (focus trap del modal)

#### Scenario: Error de validación en titulo aparece inline al blur

- GIVEN el FormModal de creación está abierto
- AND el campo titulo está vacío
- WHEN el usuario hace foco en titulo y luego lo abandona (blur)
- THEN MUST aparecer un mensaje de error debajo del campo titulo
- AND el mensaje MUST ser visible y accesible (role="alert" o aria-describedby)
- AND el formulario MUST NOT enviar el request aún

#### Scenario: Intentar enviar con campos requeridos vacíos muestra todos los errores

- GIVEN el FormModal de creación está abierto y todos los campos están vacíos
- WHEN el usuario hace click en el botón de submit
- THEN MUST aparecer mensajes de error en titulo, tipoId y prioridadId simultáneamente
- AND el request POST MUST NOT dispararse
- AND el modal MUST permanecer abierto

#### Scenario: Campo tipoId usa los valores del catálogo TIPOS existente

- GIVEN el FormModal de creación está abierto
- AND el catálogo TIPOS tiene al menos una entrada (UUID → label)
- WHEN se renderiza el campo tipoId
- THEN MUST ser un control Select cuyas opciones mapean desde el catálogo TIPOS
- AND cada opción MUST tener value = UUID y label = nombre del tipo

#### Scenario: Campo prioridadId usa los valores del catálogo PRIORIDADES existente

- GIVEN el FormModal de creación está abierto
- AND el catálogo PRIORIDADES tiene al menos una entrada
- WHEN se renderiza el campo prioridadId
- THEN MUST ser un control Select con opciones del catálogo PRIORIDADES
- AND cada opción MUST tener value = UUID y label = nombre de la prioridad

#### Scenario: Submit exitoso — POST 201 — modal cierra y toast aparece

- GIVEN el FormModal de creación tiene todos los campos válidos completados
- AND MSW intercepta POST /api/tickets → responde 201 con el ticket creado
- WHEN el usuario hace click en submit
- THEN el botón MUST mostrar estado isLoading inmediatamente
- AND el request MUST incluir `solicitanteId: user.sub` en el body
- AND MUST NOT incluir ningún campo de `solicitanteId` que el usuario haya introducido manualmente
- AND cuando la respuesta 201 llega: el modal MUST cerrarse
- AND un toast de éxito MUST aparecer con mensaje positivo (ej. "Ticket creado")
- AND la lista de tickets MUST actualizarse (TanStack Query invalida queryKeys.tickets.all)

#### Scenario: Submit — error 422 — feedback en formulario, modal permanece abierto

- GIVEN el FormModal de creación está abierto con campos válidos según Zod
- AND MSW intercepta POST /api/tickets → responde 422 con `{ statusCode: 422, message: "Solicitante inválido" }`
- WHEN el usuario hace click en submit
- THEN MUST aparecer el mensaje de error de dominio visible dentro del formulario
- AND el modal MUST permanecer abierto
- AND el botón MUST volver al estado no-loading
- AND MUST NOT mostrarse toast de éxito

#### Scenario: Submit — error de red — toast de error, modal permanece abierto

- GIVEN el FormModal de creación está abierto con datos válidos
- AND MSW simula un error de red (sin respuesta HTTP)
- WHEN el usuario hace click en submit
- THEN MUST aparecer un toast de error (ej. "No se pudo crear el ticket. Intentá de nuevo.")
- AND el modal MUST permanecer abierto
- AND el botón MUST volver al estado normal (no-loading)

#### Scenario: ESC cierra el FormModal de creación sin enviar

- GIVEN el FormModal de creación está abierto y el usuario completó algunos campos
- WHEN el usuario presiona la tecla ESC
- THEN el modal MUST cerrarse
- AND MUST NOT dispararse el request POST
- AND los datos llenados MUST descartarse (el form se resetea al próximo open)

---

### Requirement: Acción "Editar" solo visible para usuarios con permiso ticket:editar

El botón "Editar" en la fila-tarjeta o en la vista de detalle del ticket MUST solo renderizar
en el DOM si el usuario tiene el permiso `ticket:editar`.

#### Scenario: Usuario con ticket:editar ve la acción "Editar" en cada ticket

- GIVEN un usuario con `permisos: ['ticket:editar']`
- AND la lista de tickets muestra al menos un ticket
- WHEN la lista renderiza
- THEN cada fila-tarjeta MUST mostrar una acción "Editar" (botón o ícono) clickeable

#### Scenario: Usuario sin ticket:editar no ve la acción "Editar"

- GIVEN un usuario sin el permiso `ticket:editar`
- WHEN la lista o el detalle de tickets renderiza
- THEN la acción "Editar" MUST NOT estar en el DOM para ningún ticket

---

### Requirement: Formulario de edición en FormModal — excluye tipoId y estado, todos los campos opcionales

El formulario de edición MUST abrirse pre-poblado con los valores actuales del ticket y usar
`UpdateTicketSchema`. MUST NOT incluir campos para `tipoId` ni para ningún campo de estado.
La semántica es PATCH parcial: todos los campos del schema son opcionales; el formulario
siempre provee defaultValues pre-poblados, por lo que en la práctica el usuario edita sobre
datos existentes.

#### Scenario: FormModal de edición se abre pre-poblado con los valores del ticket

- GIVEN un ticket existe con `titulo: "Falla en red"`, `descripcion: "Sin conexión"`, `prioridad: <uuid-media>`
- AND el usuario tiene permiso `ticket:editar`
- WHEN el usuario hace click en "Editar" para ese ticket
- THEN el modal MUST abrirse con el campo titulo pre-llenado con "Falla en red"
- AND el campo descripcion MUST pre-llenarse con "Sin conexión"
- AND el Select de prioridadId MUST tener seleccionada la opción correspondiente a <uuid-media>

#### Scenario: FormModal de edición NO muestra campos tipoId ni estado

- GIVEN el FormModal de edición está abierto para cualquier ticket
- WHEN se inspecciona el DOM del formulario
- THEN MUST NOT haber ningún campo, Select ni input con name "tipoId" o "tipo"
- AND MUST NOT haber ningún campo con name "estado" o "nuevoEstadoCodigo"

#### Scenario: Submit de edición exitoso — PATCH 200 — modal cierra y toast aparece

- GIVEN el FormModal de edición está abierto con datos modificados válidos
- AND MSW intercepta PATCH /api/tickets/:id → responde 200 con el ticket actualizado
- WHEN el usuario hace click en submit
- THEN el botón MUST mostrar isLoading inmediatamente
- AND el request MUST NOT incluir tipoId ni estado en el body
- AND cuando la respuesta 200 llega: el modal MUST cerrarse
- AND un toast de éxito MUST aparecer
- AND la lista y/o el detalle MUST actualizarse (queryKeys.tickets.all invalidado)

#### Scenario: Submit de edición — error 422 — feedback inline, modal permanece

- GIVEN el FormModal de edición está abierto
- AND MSW intercepta PATCH /api/tickets/:id → responde 422 con mensaje de dominio
- WHEN el usuario hace click en submit
- THEN el mensaje de error MUST aparecer dentro del formulario
- AND el modal MUST permanecer abierto
- AND el botón MUST volver al estado no-loading

#### Scenario: Submit de edición — 404 ticket no encontrado — toast error, modal cierra

- GIVEN el FormModal de edición está abierto
- AND MSW intercepta PATCH /api/tickets/:id → responde 404
- WHEN el usuario hace click en submit
- THEN un toast de error MUST aparecer (ej. "El ticket ya no existe")
- AND el modal MUST cerrarse
- AND la lista MUST invalidarse para reflejar el estado actual

---

### Requirement: Acción "Eliminar" solo visible para usuarios con permiso ticket:eliminar

El botón "Eliminar" MUST solo renderizar en el DOM si el usuario tiene el permiso
`ticket:eliminar`. La eliminación MUST requerir confirmación explícita antes de enviar el DELETE.

#### Scenario: Usuario con ticket:eliminar ve la acción "Eliminar"

- GIVEN un usuario con `permisos: ['ticket:eliminar']`
- WHEN la lista de tickets renderiza
- THEN cada fila-tarjeta MUST mostrar una acción "Eliminar" clickeable

#### Scenario: Usuario sin ticket:eliminar no ve la acción "Eliminar"

- GIVEN un usuario sin `ticket:eliminar`
- WHEN la lista renderiza
- THEN la acción "Eliminar" MUST NOT estar en el DOM para ningún ticket

#### Scenario: Click en "Eliminar" abre ConfirmDialog — no dispara DELETE directamente

- GIVEN el usuario tiene permiso `ticket:eliminar`
- WHEN el usuario hace click en "Eliminar" para un ticket con titulo "Falla en red"
- THEN MUST abrirse un `<ConfirmDialog>` (Radix AlertDialog)
- AND el dialog MUST mostrar el titulo del ticket en el mensaje de confirmación
- AND MUST NOT dispararse el request DELETE todavía

#### Scenario: ConfirmDialog no se cierra con click-outside (seguridad destructiva)

- GIVEN el ConfirmDialog de eliminación está abierto
- WHEN el usuario hace click fuera del dialog (overlay)
- THEN el dialog MUST permanecer abierto
- AND MUST NOT dispararse el DELETE

#### Scenario: Confirmar eliminación — DELETE 204 — toast y lista actualizada

- GIVEN el ConfirmDialog de eliminación está abierto para un ticket
- AND MSW intercepta DELETE /api/tickets/:id → responde 204 sin body
- WHEN el usuario hace click en "Confirmar" (o equivalente destructivo)
- THEN el botón de confirmar MUST mostrar isLoading
- AND cuando 204 llega: el dialog MUST cerrarse
- AND un toast de éxito MUST aparecer (ej. "Ticket eliminado")
- AND queryKeys.tickets.all MUST invalidarse → la lista MUST refrescar y el ticket MUST desaparecer

#### Scenario: Eliminar un ticket ya eliminado (idempotente) — igualmente éxito

- GIVEN el ConfirmDialog está abierto para un ticket que ya fue eliminado (soft-delete previo)
- AND MSW intercepta DELETE /api/tickets/:id → responde 204 (idempotente)
- WHEN el usuario confirma
- THEN el comportamiento MUST ser idéntico al escenario de éxito normal:
  dialog cierra + toast éxito + lista invalida

#### Scenario: Cancelar en ConfirmDialog — no dispara DELETE

- GIVEN el ConfirmDialog de eliminación está abierto
- WHEN el usuario hace click en "Cancelar"
- THEN el dialog MUST cerrarse
- AND MUST NOT dispararse ningún request DELETE

---

### Requirement: Hooks de mutación por operación con invalidación garantizada

Los hooks `useCreateTicket`, `useUpdateTicket` y `useDeleteTicket` MUST ser unidades
importables que encapsulan el TanStack Query `useMutation` con la estrategia de error e
invalidación correctas. Son el contrato de integración para los form containers.

#### Scenario: useCreateTicket exporta mutate, isPending, error desde un módulo

- GIVEN el módulo `@/features/tickets/hooks/use-create-ticket` existe
- WHEN cualquier componente lo importa y llama a `useCreateTicket()`
- THEN MUST exponer al menos: `mutate` (o `mutateAsync`), `isPending` (boolean), `error` (ApiError | null)

#### Scenario: useCreateTicket invoca apiFetch POST /tickets con el DTO

- GIVEN `useCreateTicket` está montado en un test con QueryClientProvider
- WHEN se llama a `mutate(createTicketDto)`
- THEN MUST llamar a `apiFetch('tickets', { method: 'POST', json: createTicketDto })`

#### Scenario: useCreateTicket invalida queryKeys.tickets.all en onSuccess

- GIVEN `useCreateTicket` está montado
- AND el backend responde 201
- WHEN la mutación completa exitosamente
- THEN `queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })` MUST haberse llamado

#### Scenario: useUpdateTicket invoca apiFetch PATCH /tickets/:id

- GIVEN `useUpdateTicket` está montado
- WHEN se llama a `mutate({ id: 'uuid-del-ticket', data: updateDto })`
- THEN MUST llamar a `apiFetch('tickets/uuid-del-ticket', { method: 'PATCH', json: updateDto })`

#### Scenario: useDeleteTicket invoca apiFetch DELETE /tickets/:id

- GIVEN `useDeleteTicket` está montado
- WHEN se llama a `mutate('uuid-del-ticket')`
- THEN MUST llamar a `apiFetch('tickets/uuid-del-ticket', { method: 'DELETE' })`

#### Scenario: useDeleteTicket invalida queryKeys.tickets.all tras 204

- GIVEN `useDeleteTicket` está montado
- AND el backend responde 204
- WHEN la mutación completa
- THEN `queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })` MUST haberse llamado

---

### Requirement: Mapeo de ApiError a feedback de UI

El helper de mapeo MUST transformar `ApiError` en feedback apropiado según el `statusCode`.
Para errores 422 (dominio), el feedback es SIEMPRE inline dentro del formulario (no solo toast) —
el modal o form permanece abierto para que el usuario corrija. Para otros errores (0, 403, 404,
500), el feedback es toast.error.

#### Scenario: 422 domain error se muestra dentro del formulario (root error)

- GIVEN el hook de mutación recibe `ApiError { statusCode: 422, message: "Ciclo inválido" }`
- WHEN el `onError` del hook procesa el error
- THEN MUST llamarse a `setError('root', { message: 'Ciclo inválido' })` en react-hook-form
- AND el mensaje MUST renderizarse dentro del formulario (no en toast)
- AND el formulario MUST permanecer abierto

#### Scenario: Error de red se muestra como toast.error

- GIVEN el hook de mutación recibe `ApiError { statusCode: 0, message: "Error de red" }`
- WHEN el `onError` procesa el error
- THEN MUST llamarse a `toast.error` con un mensaje de error genérico
- AND el formulario MUST permanecer abierto (el usuario puede reintentar)

#### Scenario: 403 Forbidden se muestra como toast.error

- GIVEN el hook de mutación recibe `ApiError { statusCode: 403 }`
- WHEN el `onError` procesa el error
- THEN MUST llamarse a `toast.error` con un mensaje de "Sin permisos"
- AND el modal/formulario MUST cerrarse (el usuario no puede resolver este error con datos)
