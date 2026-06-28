# Spec: Frontend UI States

> Capability: `frontend-ui-states`
> Stack: React (Next.js App Router), TanStack Query v5, Shadcn, Tailwind v4
> Autoridad: CLAUDE.md §3 "Fases Obligatorias de Interfaz"
> Archivado desde: `frontend-fundacion` (2026-06-26)

## Context

La constitución del proyecto establece tres estados de UI obligatorios para toda interacción con
datos. No son opcionales: son criterios de aceptación de cualquier componente que liste datos
o envíe formularios.

La autorización de UI (authz) refleja los `roles` y `permisos` del JWT decodificado por el
`SessionProvider`. Los guards del backend validan independientemente en cada request — la UI
no reemplaza esa validación, la complementa mostrando solo lo que el usuario puede usar.

---

## Requirements

### Requirement: Todo listado MUST mostrar Skeleton Loader durante la carga inicial

#### Scenario: Lista en carga inicial muestra skeletons estructurados, NO spinner full-screen
**Given** un componente de lista (ej. TicketsList, ComprasList, EquiposList) monta por primera vez
**And** TanStack Query tiene `isLoading: true` (no hay datos en caché todavía)
**When** el componente renderiza
**Then** MUST mostrar placeholders de `<Skeleton>` que imiten la estructura de cada ítem (altura de título, subtítulo, badge)
**And** MUST NOT mostrar un spinner de pantalla completa (overlay full-screen)
**And** MUST NOT mostrar ningún dato real ni el componente `<EmptyState>` durante la carga

#### Scenario: El skeleton muestra múltiples placeholders proporcionales a la lista esperada
**Given** la lista normalmente muestra entre 5 y 15 ítems
**When** está en estado `isLoading`
**Then** el Skeleton MUST mostrar entre 3 y 10 placeholders (no solo 1, no un bloque genérico)
**And** cada placeholder MUST replicar la estructura visual del ítem real (al menos: área de título + área de metadatos)

#### Scenario: Re-fetch en background no reemplaza los datos visibles con skeletons
**Given** TanStack Query tiene datos en caché (`isLoading: false`) y dispara un re-fetch (`isFetching: true`)
**When** el re-fetch está en progreso
**Then** la lista MUST continuar mostrando los datos del caché
**And** MUST NOT reemplazar el contenido con skeletons
**And** MAY mostrar un indicador sutil de actualización no intrusivo (ej. spinner pequeño en el header de la sección)

---

### Requirement: Todo listado MUST mostrar Empty State cuando no hay registros

#### Scenario: Lista vacía muestra ilustración + mensaje descriptivo + acción primaria
**Given** el request al backend completó con HTTP 200 y `data = []`
**When** el componente de lista renderiza
**Then** MUST mostrar el componente `<EmptyState>` con:
  - Un ícono o ilustración relevante al dominio de la lista (no un bloque de texto genérico)
  - Un título descriptivo en primera persona (ej. "No tenés tickets todavía")
  - Una acción primaria si el usuario tiene permiso para crear (ej. botón "Crear ticket")
**And** MUST NOT mostrar una tabla vacía con encabezados y cero filas
**And** MUST NOT mostrar skeletons

#### Scenario: Empty State con filtros activos incluye acción para limpiar filtros
**Given** el usuario aplicó uno o más filtros y el resultado es `data = []`
**When** el componente renderiza el Empty State
**Then** MUST incluir una acción secundaria para limpiar los filtros (ej. "Limpiar filtros")
**And** el texto del Empty State MUST indicar que la lista vacía se debe a los filtros activos
**And** MUST NOT mostrar el botón de "Crear" como única opción

---

### Requirement: Todo submit MUST mostrar Interactive State durante el envío

#### Scenario: Botón de submit muestra Loading+disabled+spinner mientras el mutation está pendiente
**Given** un formulario de creación o edición (ej. LoginForm, CreateTicketForm, ApproveCompraForm)
**When** el usuario presiona el botón de submit y `mutation.isPending === true`
**Then** el botón MUST cambiar a estado loading INMEDIATAMENTE (sin esperar la respuesta)
**And** MUST mostrar un spinner interno al botón más un texto alternativo (ej. "Guardando...")
**And** MUST tener el atributo `disabled = true` para prevenir doble-submit
**And** MUST NOT navegar ni cerrar el formulario hasta que la mutation complete

#### Scenario: Botón vuelve al estado normal tras completar (éxito o error)
**Given** la mutation completó (`mutation.isPending` volvió a `false`)
**When** el estado actualiza
**Then** el botón MUST mostrar su texto y apariencia originales (sin spinner, `disabled = false`)
**And** si fue exitoso: el formulario MUST cerrar o navegar según el flujo definido por el feature
**And** si fue fallido: el formulario MUST permanecer abierto con el mensaje de error visible

#### Scenario: LoginForm tiene Interactive State durante la autenticación
**Given** el usuario completó email y password y presionó "Iniciar sesión"
**When** el Route Handler `/api/auth/login` está procesando
**Then** el botón "Iniciar sesión" MUST mostrar spinner + texto "Iniciando sesión..." + `disabled = true`
**And** los campos de email y password MUST estar deshabilitados durante el proceso
**And** el formulario MUST permanecer visible (no redirect inmediato antes de recibir la respuesta)

---

### Requirement: Autorización de UI basada en roles y permisos del JWT

#### Scenario: Elemento gated por permiso no renderiza si el usuario no tiene ese permiso
**Given** un usuario con `permisos = ['ticket:crear', 'ticket:ver_todos']` en su JWT
**And** existe un botón "Aprobar compra" que requiere el permiso `compra:aprobar`
**When** el dashboard renderiza
**Then** el botón "Aprobar compra" MUST NOT estar presente en el DOM
**And** MUST NOT ser accesible vía inspección del DOM (exclusión condicional en render, no solo `display:none`)

#### Scenario: Ruta protegida por rol cuyo enlace no aparece en nav tampoco es accesible directamente
**Given** un usuario con `roles = ['SOLICITANTE']` sin permiso `usuario:gestionar`
**And** el enlace "Gestionar usuarios" no fue renderizado en la navegación
**When** el usuario intenta navegar directamente a `/usuarios` por la barra de direcciones
**Then** el middleware de protección de rutas MUST redirigir a `/dashboard` o mostrar `/unauthorized`
**And** la UI de gestión de usuarios MUST NOT renderizar para ese usuario
**Note**: la validación final siempre la hace el backend (guards) — la UI solo evita ruido de UX

#### Scenario: SessionProvider expone roles y permisos para decisiones de UI
**Given** el usuario autenticado tiene una cookie `at` con JWT válido
**When** el `SessionProvider` inicializa (hidratado via `DashboardLayout` server-side)
**Then** MUST decodificar el JWT del lado del servidor en `DashboardLayout` y pasarlo como `initialUser`
**And** MUST exponer vía React Context: `{ user: { sub, email, roles, permisos, cliente_id }, isLoading: false }`
**And** el payload MUST ser el mismo que emite el backend (sin transformaciones ni renombrado de campos)

#### Scenario: Durante la inicialización del SessionProvider, no hay flash de contenido sin autorizar
**Given** el `SessionProvider` está inicializando (`isLoading: true`)
**When** un componente hijo intenta leer `user` del contexto
**Then** `user` MUST ser `null` mientras `isLoading === true`
**And** los componentes hijos que renderizan contenido gated por permiso MUST mostrar skeleton o nada mientras `isLoading === true`
**And** MUST NOT mostrar brevemente contenido de un rol incorrecto (no flash de contenido sin autorizar, FOUC de autorización)

---

### Requirement: Mutación exitosa MUST emitir toast de éxito E invalidar el caché de queries

Toda mutación de escritura (create, update, delete) que recibe una respuesta exitosa del backend
MUST: (1) invalidar el caché (`queryClient.invalidateQueries`) con la query key correspondiente,
y (2) emitir un toast de éxito (`notify.success` o `toast.success`). Ambas acciones son
obligatorias. El patrón implementado en `tickets-crud` es el de referencia para todas las entidades.

ADR (tickets-crud): los efectos UI (toast, cierre de modal, reset) viven en el container hook
(`useTicketForm`), no en el hook de mutación puro (ADR-3). Esto permite testear los hooks de
mutación en aislamiento sin espiar `notify`. El objetivo (que el toast aparezca tras el éxito)
se cumple; la cláusula de co-localización en `onSuccess` del hook queda como convención a decidir
antes de replicar a otras entidades (ver deuda W2 en `tickets-crud/verify-report.md`).

Agregado en change: `tickets-crud` (2026-06-28) — aplica a todas las entidades.

#### Scenario: onSuccess de create — invalida queries y muestra toast de éxito

- GIVEN un hook de mutación create (ej. useCreateTicket) con invalidación configurada
- AND el backend responde 201 Created
- WHEN la mutación completa exitosamente
- THEN `queryClient.invalidateQueries` MUST ser llamado con la query key de la entidad
- AND un toast de éxito (notify.success o toast.success) MUST ser emitido con mensaje no vacío
- AND el FormModal MUST cerrarse después de que el éxito procese

#### Scenario: onSuccess de update — invalida queries y muestra toast de éxito

- GIVEN un hook de mutación update (ej. useUpdateTicket) con onSuccess configurado
- AND el backend responde 200 OK
- WHEN la mutación completa exitosamente
- THEN `queryClient.invalidateQueries` MUST ser llamado (all + detail del item)
- AND un toast de éxito MUST ser emitido

#### Scenario: onSuccess de delete — invalida queries y muestra toast de éxito tras 204

- GIVEN un hook de mutación delete (ej. useDeleteTicket) con onSuccess configurado
- AND el backend responde 204 No Content (sin body)
- WHEN la mutación completa exitosamente
- THEN `queryClient.invalidateQueries` MUST ser llamado con la query key de la entidad
- AND un toast de éxito MUST ser emitido
- AND MUST NOT lanzarse ningún error al parsear el body vacío (apiFetch maneja 204 correctamente
  per spec `frontend-api-client`)

#### Scenario: Modal/formulario se cierra después de que el éxito procese

- GIVEN el hook de mutación completó con éxito
- WHEN el componente consumer procesa onSuccess
- THEN el FormModal MUST cerrarse (onOpenChange(false) o equivalente)
- AND MUST NOT cerrarse antes de que el éxito ejecute completamente

---

### Requirement: Error 422 (dominio) MUST mostrarse como feedback inline en el formulario

Los errores 422 son errores de negocio que el usuario puede resolver corrigiendo datos. MUST
presentarse dentro del formulario — no como toast efímero. El formulario MUST permanecer abierto.
El mensaje de error del backend (string único) se mapea a `setError('root', { message })` de
react-hook-form y se renderiza con `role="alert"` en el tope del form.

Nota: el backend devuelve `message` como string único (no array por campo, per exploración
`tickets-crud`). Si en futuras versiones el backend mapea a campos específicos, el helper
`mapApiError` puede enrutarlo a `setError(fieldName, ...)`.

Agregado en change: `tickets-crud` (2026-06-28) — aplica a todas las entidades.

#### Scenario: 422 en create — error aparece dentro del formulario, modal sigue abierto

- GIVEN el FormModal de create está abierto y el usuario completó los campos
- AND el backend responde 422 con `{ message: "Tipo de ticket no válido" }`
- WHEN el usuario envía el formulario
- THEN MUST aparecer el mensaje de error visible dentro del modal (banner root con role="alert")
- AND el modal MUST permanecer abierto (onOpenChange NO se llama con false)
- AND MUST NOT mostrarse toast.success
- AND el botón de submit MUST volver al estado no-loading

#### Scenario: 422 en update — feedback inline, formulario sigue abierto

- GIVEN el FormModal de update está abierto
- AND el backend responde 422 con un mensaje de dominio
- WHEN el usuario envía
- THEN el mensaje de error MUST aparecer dentro del formulario (setError('root') o equivalente)
- AND el modal MUST permanecer abierto con los datos del formulario intactos

#### Scenario: El error inline 422 es accesible (live region)

- GIVEN un error 422 setea `setError('root', { message: '...' })`
- WHEN el mensaje de error renderiza en el formulario
- THEN MUST tener `role="alert"` para notificar a screen readers cuando aparece

---

### Requirement: Errores no-422 MUST mostrarse como toast.error

Los errores que no son de dominio del usuario (red, permisos, not found, internal error) no
pueden resolverse modificando el formulario. El feedback es un toast efímero vía `notify.error`.
El formulario puede cerrarse o mantenerse abierto según el tipo de error.

Agregado en change: `tickets-crud` (2026-06-28) — aplica a todas las entidades.

#### Scenario: Error de red (statusCode 0) — toast.error, formulario permanece abierto

- GIVEN un formulario está enviando una mutación
- AND MSW simula un error de red (sin respuesta HTTP)
- WHEN la mutación falla
- THEN `notify.error` (o `toast.error`) MUST ser llamado con un mensaje legible
- AND el formulario MUST permanecer abierto (el usuario puede reintentar)

#### Scenario: 404 Not Found — toast.error, formulario/modal se cierra

- GIVEN una mutación de update o delete recibe `ApiError { statusCode: 404 }`
- WHEN el onError procesa
- THEN `notify.error` MUST ser llamado con mensaje indicando que el recurso no existe
- AND el formulario/modal MUST cerrarse
- AND la query MUST invalidarse para reflejar el estado actual

#### Scenario: 500 Internal Server Error — toast.error genérico

- GIVEN una mutación recibe `ApiError { statusCode: 500 }`
- WHEN el onError procesa
- THEN `notify.error` MUST ser llamado con un mensaje genérico de error del servidor

---

### Requirement: Patrón de hook de mutación testeable en aislamiento

Los hooks de mutación (useCreate*, useUpdate*, useDelete*) MUST ser testeables sin el componente
UI que los consume. El patrón es el mismo para todas las entidades (tickets-crud establece la
convención).

Agregado en change: `tickets-crud` (2026-06-28).

#### Scenario: El hook de mutación es testeable con QueryClientProvider + MSW

- GIVEN un test monta el hook con un QueryClientProvider y un MSW handler
- WHEN el test llama a `result.current.mutate(dto)` (o `mutateAsync`)
- THEN MUST poder verificar: que el request correcto se disparó, que `isPending` fue true,
  y que tras la respuesta del MSW `isPending` volvió a false
- AND MUST NOT requerir montar el componente UI completo

#### Scenario: Estado isPending refleja correctamente el ciclo de vida de la mutación

- GIVEN el hook de mutación está montado y el MSW handler tiene delay
- WHEN se llama a `mutate(dto)`
- THEN `result.current.isPending` MUST ser `true` mientras el request no resolvió
- AND MUST ser `false` después de éxito o error
- AND el componente UI que lo consume MUST poder leer `isPending` para mostrar el botón loading
