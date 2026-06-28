# Spec: UI States Delta — Mutation Feedback

> Capability: `frontend-ui-states` (delta)
> Delta on: `openspec/specs/frontend-ui-states/spec.md`
> Stack: TanStack Query v5 (useMutation), sonner (toast), react-hook-form (setError)
> Authority: CLAUDE.md §3 "Fases Obligatorias de Interfaz", §5 (Testing efectivo)
> Change: `tickets-crud` (2026-06-28)

## Context

El spec canónico de `frontend-ui-states` establece que todo submit MUST mostrar Interactive
State durante el envío (botón loading + disabled). Este delta extiende esa cobertura con los
estados de **resultado de mutación**: qué pasa DESPUÉS de que la mutación completa (éxito,
error de dominio 422, error genérico).

Los tres estados de resultado que este delta hace obligatorios:

1. **Éxito**: toast.success + invalidación de caché + cierre del formulario/modal.
2. **Error de dominio (422)**: feedback inline en el formulario (setError en react-hook-form) —
   el formulario permanece abierto. Toast opcional solo para errores donde no cabe feedback inline.
3. **Error genérico (0, 403, 404, 500)**: toast.error — el usuario sabe qué pasó.

Estos estados son **obligatorios para todas las mutaciones del proyecto** (Tickets, Compras,
Reparaciones, Catálogos), no solo para tickets-crud. Este delta establece el patrón.

El spec canónico ya establece que la invalidación de caché existe ("la lista MUST actualizarse");
este delta lo hace **explícito como parte del contrato de onSuccess** con scenarios testeables.

---

## Requirements

### Requirement: Mutación exitosa MUST emitir toast.success E invalidar el caché de queries

Toda mutación de escritura (create, update, delete) que recibe una respuesta exitosa del backend
MUST: (1) llamar a `toast.success` con un mensaje descriptivo, y (2) llamar a
`queryClient.invalidateQueries` con la query key correspondiente. Ambas acciones son obligatorias
y deben ocurrir en el `onSuccess` del `useMutation`. El orden MUST ser: invalidar primero, luego
toast (así la lista ya tiene los datos frescos cuando el usuario ve la notificación).

#### Scenario: onSuccess de create — invalida queries y muestra toast de éxito

- GIVEN un hook de mutación create (ej. useCreateTicket) con onSuccess configurado
- AND el backend responde 201 Created
- WHEN la mutación completa exitosamente
- THEN `queryClient.invalidateQueries` MUST ser llamado con la query key de la entidad
- AND `toast.success` MUST ser llamado con un mensaje de éxito no vacío
- AND ambas llamadas MUST ocurrir en el mismo `onSuccess` (no diferido ni en el componente caller)

#### Scenario: onSuccess de update — invalida queries y muestra toast de éxito

- GIVEN un hook de mutación update (ej. useUpdateTicket) con onSuccess configurado
- AND el backend responde 200 OK
- WHEN la mutación completa exitosamente
- THEN `queryClient.invalidateQueries` MUST ser llamado con la query key de la entidad
- AND `toast.success` MUST ser llamado con un mensaje de éxito

#### Scenario: onSuccess de delete — invalida queries y muestra toast de éxito tras 204

- GIVEN un hook de mutación delete (ej. useDeleteTicket) con onSuccess configurado
- AND el backend responde 204 No Content (sin body)
- WHEN la mutación completa exitosamente
- THEN `queryClient.invalidateQueries` MUST ser llamado con la query key de la entidad
- AND `toast.success` MUST ser llamado
- AND MUST NOT lanzarse ningún error al parsear el body vacío (apiFetch maneja 204 correctamente
  per spec `frontend-api-client` — Scenario "Respuesta 204 No Content retorna undefined sin error")

#### Scenario: Modal/formulario se cierra DESPUÉS de que onSuccess complete

- GIVEN el hook de mutación tiene onSuccess que invalida queries y llama toast.success
- AND el componente consumer usa un estado `open` para controlar el FormModal
- WHEN el onSuccess completa
- THEN el FormModal MUST cerrarse (onOpenChange(false)) después de la invalidación
- AND MUST NOT cerrarse antes de que onSuccess ejecute completamente
- AND si la invalidación falla (raro), el toast de éxito MUST aún mostrarse (los fallos de
  invalidación no revierten el éxito de la operación)

---

### Requirement: Error 422 (dominio) MUST mostrarse como feedback inline en el formulario

Los errores 422 son errores de negocio que el usuario puede resolver corrigiendo datos. Por eso
MUST presentarse dentro del formulario — no como toast efímero. El formulario MUST permanecer
abierto. El hook de mutación MUST aceptar una callback `onDomainError` o equivalente para que
el form container llame a `setError` de react-hook-form.

Nota: el backend devuelve `message` como string único (no array por campo). El mapeo toma ese
string y lo presenta en `setError('root', { message })`. Si en futuras versiones el backend
mapea a campos específicos, el helper puede enrutarlo a `setError(fieldName, ...)`.

#### Scenario: 422 en create — error aparece dentro del formulario, modal sigue abierto

- GIVEN el FormModal de create está abierto y el usuario completó los campos
- AND MSW intercepta el endpoint → responde 422 con `{ message: "Tipo de ticket no válido" }`
- WHEN el usuario envía el formulario
- THEN MUST aparecer el mensaje "Tipo de ticket no válido" visible dentro del modal
- AND el modal MUST permanecer abierto (onOpenChange NO se llama con false)
- AND MUST NOT mostrarse toast.success
- AND el botón de submit MUST volver al estado no-loading

#### Scenario: 422 en update — feedback inline, formulario sigue abierto

- GIVEN el FormModal de update está abierto
- AND MSW intercepta PATCH → responde 422 con un mensaje de dominio
- WHEN el usuario envía
- THEN el mensaje de error MUST aparecer dentro del formulario (setError('root') o equivalente)
- AND el modal MUST permanecer abierto con los datos del formulario intactos
- AND MUST NOT cerrarse el modal

#### Scenario: El error inline 422 desaparece cuando el usuario intenta enviar nuevamente con éxito

- GIVEN un error 422 previo muestra un mensaje inline en el formulario
- AND el usuario corrige los datos
- AND el siguiente submit devuelve 201/200
- WHEN la segunda respuesta exitosa llega
- THEN el mensaje de error inline MUST desaparecer
- AND el modal MUST cerrarse con toast.success normal

#### Scenario: El error inline 422 es accesible (no solo visual)

- GIVEN un error 422 setea `setError('root', { message: '...' })`
- WHEN el mensaje de error renderiza en el formulario
- THEN MUST tener `role="alert"` o equivalente ARIA para notificar a screen readers
- AND MUST ser anunciado por el screen reader cuando aparece (live region)

---

### Requirement: Errores no-422 MUST mostrarse como toast.error

Los errores que no son de dominio del usuario (errores de red, permisos, not found, internal
error) no pueden resolverse modificando el formulario, por lo que el feedback apropiado es un
toast efímero. El formulario puede cerrarse o mantenerse abierto según el tipo de error.

#### Scenario: Error de red (statusCode 0) — toast.error, formulario permanece abierto

- GIVEN un formulario está enviando una mutación
- AND MSW simula un error de red (sin respuesta HTTP)
- WHEN la mutación falla
- THEN `toast.error` MUST ser llamado con un mensaje de error legible
- AND el formulario MUST permanecer abierto (el usuario puede reintentar)
- AND MUST NOT mostrarse toast.success

#### Scenario: 403 Forbidden — toast.error, formulario/modal se cierra

- GIVEN una mutación recibe `ApiError { statusCode: 403 }`
- WHEN el onError procesa
- THEN `toast.error` MUST ser llamado con mensaje de "Sin permisos" o equivalente
- AND el formulario/modal MUST cerrarse (no hay acción del usuario que lo resuelva)

#### Scenario: 404 Not Found — toast.error, formulario/modal se cierra

- GIVEN una mutación de update o delete recibe `ApiError { statusCode: 404 }`
- WHEN el onError procesa
- THEN `toast.error` MUST ser llamado con mensaje indicando que el recurso no existe
- AND el formulario/modal MUST cerrarse
- AND la query MUST invalidarse para que la lista refleje el estado actual

#### Scenario: 500 Internal Server Error — toast.error genérico

- GIVEN una mutación recibe `ApiError { statusCode: 500 }`
- WHEN el onError procesa
- THEN `toast.error` MUST ser llamado con un mensaje genérico de error del servidor
- AND el formulario MUST permanecer abierto si la operación era create/update (puede ser transitorio)

---

### Requirement: Patrón de hook de mutación observable y testeable en aislamiento

Los hooks de mutación (useCreate*, useUpdate*, useDelete*) MUST ser testeables sin el componente
UI que los consume. El patrón MUST ser el mismo para todas las entidades, formando la convención
de hooks de mutación del proyecto.

#### Scenario: El hook de mutación es testeable con QueryClientProvider + wrapper mínimo

- GIVEN un test monta el hook con un QueryClientProvider y un MSW handler
- WHEN el test llama a `result.current.mutate(dto)`
- THEN MUST poder verificar: que el request correcto se disparó, que `isPending` fue true,
  y que tras la respuesta del MSW `isPending` volvió a false
- AND MUST NOT requerir montar el componente UI completo (no end-to-end obligatorio)

#### Scenario: Estado isPending es true mientras el request está en vuelo

- GIVEN el hook de mutación está montado y el MSW handler tiene delay
- WHEN se llama a `mutate(dto)`
- THEN `result.current.isPending` MUST ser `true` mientras el request no resolvió
- AND el componente UI que lo consume MUST poder leer `isPending` para mostrar el botón loading

#### Scenario: Estado isPending vuelve a false después de success o error

- GIVEN la mutación completó (éxito o error)
- WHEN se re-renderiza el consumidor
- THEN `isPending` MUST ser `false`
- AND el botón MUST haber salido del estado loading (per spec canónico de Interactive State)
