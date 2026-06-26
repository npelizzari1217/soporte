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
