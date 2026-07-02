# Spec: Admin UI

> Capability: `admin-ui` (NEW)
> Stack: Next.js App Router, Tailwind CSS v4, Lucide icons, Radix UI/Shadcn
> Base spec: `openspec/specs/frontend-shell/spec.md` (sidebar extendido)
> Autoridad de diseño: `CLAUDE.md §3` (SUPER PREMIUM)
> Introducido en change: `admin-general` (2026-06-30)

## Contexto

Esta capability agrega la interfaz de administración al dashboard. Extiende (no reemplaza) la
spec `frontend-shell`:

1. **Sección ADMINISTRACIÓN en sidebar** — bloque condicional renderizado sobre la sección
   operativa, visible solo para `is_global_admin = true` o rol `ADMINISTRADOR`. Separado por
   un divider con label.
2. **Selectores Cliente + Ciclo** — renderizados sobre la navegación en el sidebar.
   Operador ve ambos; ADMINISTRADOR ve solo Ciclo; usuarios regulares no ven ninguno.
3. **`TenantContext`** — React context que provee `{ clienteId, clienteNombre, cicloId, cicloNombre }`
   al dashboard completo. Ciclo default = ciclo activo del cliente resuelto.
4. **Pantallas admin** — Clientes (solo operador), Ciclos, Usuarios, Reportes — bajo la ruta
   `(dashboard)/admin/`.
5. **Estado "Elegí un cliente"** — placeholder en el área de contenido principal cuando el
   operador aún no seleccionó un cliente.

**Diseño:** filas-tarjeta (no tablas HTML densas), glassmorphism cards, skeleton/empty/interactive
states, modo dual dark + light, `@media print` en pantalla Reportes. Conforme a `CLAUDE.md §3`.

**Protección de rutas:** el frontend MUST proteger rutas admin en el middleware de Next.js.
Acceso a `/admin/clientes` sin `is_global_admin = true` MUST redirigir (no 403 — el backend
es la fuente de verdad; el frontend solo mejora la UX).

---

## Requirements

### Requirement: Sección ADMINISTRACIÓN en sidebar condicional por nivel

El sidebar MUST renderizar condicionalmente una sección ADMINISTRACIÓN basada en el claim
`is_global_admin` y el rol del JWT. La sección MUST aparecer sobre la sección operativa
(Tickets, Compras, Reparaciones, Equipos), separada por un divider con label. La sección
operativa existente MUST permanecer sin cambios para todos los niveles de usuario.

#### Scenario: Operador ve la sección ADMINISTRACIÓN completa (4 ítems)

**Given** un usuario con `is_global_admin: true` en su JWT está autenticado
**When** el sidebar del dashboard renderiza
**Then** MUST renderizar una sección con label `ADMINISTRACIÓN` sobre la sección operativa
**And** la sección ADMINISTRACIÓN MUST contener exactamente: Clientes, Ciclos, Usuarios,
  Reportes (en ese orden, con íconos Lucide)
**And** MUST existir un divider visual con label que separe la sección ADMINISTRACIÓN de
  la sección operativa (Tickets, Compras, Reparaciones, Equipos)
**And** ambas secciones MUST ser visibles simultáneamente en el sidebar

#### Scenario: Admin-cliente ve sección ADMINISTRACIÓN reducida (3 ítems, sin Clientes)

**Given** un usuario con rol `ADMINISTRADOR` y `is_global_admin: false` en su JWT
**When** el sidebar renderiza
**Then** MUST renderizar la sección ADMINISTRACIÓN con: Ciclos, Usuarios, Reportes (sin Clientes)
**And** el ítem "Clientes" MUST NOT aparecer en ningún lugar del sidebar para este usuario
**And** el divider y el label ADMINISTRACIÓN MUST ser visibles

#### Scenario: Usuario regular no ve ninguna sección ADMINISTRACIÓN

**Given** un usuario con rol `USUARIO`, `COLABORADOR` o `TECNICO`
**When** el sidebar del dashboard renderiza
**Then** MUST NOT renderizarse ninguna sección ADMINISTRACIÓN ni divider
**And** MUST renderizarse solo los 4 ítems operativos: Tickets, Compras, Reparaciones, Equipos
  (sin cambios respecto a la base spec `frontend-shell`)
**And** ninguna ruta bajo `/admin/*` MUST ser accesible para este usuario

#### Scenario: Ítem activo en sección ADMINISTRACIÓN tiene aria-current="page"

**Given** un usuario con `is_global_admin: true` está en la ruta `/admin/clientes`
**When** el sidebar renderiza
**Then** el ítem "Clientes" MUST tener `aria-current="page"` y estilo activo sutil
**And** ningún otro ítem MUST tener `aria-current="page"`
**And** el estilo activo MUST cumplir el patrón definido en la base spec `frontend-shell`

#### Scenario: ADMINISTRACIÓN label cumple el design system

**Given** la sección ADMINISTRACIÓN está renderizada en el sidebar
**When** se inspecciona el elemento del label/divider
**Then** el label MUST usar tipografía en uppercase con letter-spacing generoso
  (`text-xs tracking-wider` o equivalente conforme a `CLAUDE.md §3`)
**And** el divider MUST ser ultra-fino y atenuado (no disruptivo)
**And** MUST cumplir contraste WCAG AA en modo oscuro y claro

---

### Requirement: Selectores Cliente + Ciclo sobre la navegación del sidebar

Los selectores se posicionan en la parte superior del sidebar, sobre todos los ítems de
navegación (tanto ADMINISTRACIÓN como operativos). El selector de Cliente carga opciones
desde `GET /clientes`. El selector de Ciclo carga opciones desde `GET /ciclos` filtrado al
cliente seleccionado.

#### Scenario: Operador ve ambos selectores (Cliente + Ciclo)

**Given** un usuario con `is_global_admin: true`
**When** el sidebar renderiza
**Then** MUST renderizarse un selector de Cliente (dropdown/combobox) en la parte superior
**And** MUST renderizarse un selector de Ciclo debajo del selector de Cliente (también sobre
  la navegación)
**And** el selector de Cliente MUST cargar opciones desde `GET /clientes`
**And** el selector de Ciclo MUST mostrar ciclos del cliente seleccionado

#### Scenario: Ciclo selector del operador default al ciclo activo del cliente seleccionado

**Given** un operador selecciona el cliente "Acme Corp"
**And** Acme Corp tiene 3 ciclos: C1 (inactivo), C2 (activo), C3 (inactivo)
**When** el selector de Ciclo renderiza o el cliente cambia
**Then** C2 MUST ser la opción seleccionada por defecto en el selector de Ciclo
**And** las 3 opciones MUST estar disponibles en el dropdown

#### Scenario: Admin-cliente ve solo el selector de Ciclo (sin selector de Cliente)

**Given** un usuario con rol `ADMINISTRADOR` y `is_global_admin: false`
**When** el sidebar renderiza
**Then** MUST renderizarse un selector de Ciclo sobre la navegación
**And** MUST NOT renderizarse ningún selector de Cliente
**And** el selector de Ciclo MUST cargar opciones desde `GET /ciclos` (tenant propio, implícito)
**And** la selección default MUST ser el ciclo activo

#### Scenario: Usuario regular no ve ningún selector

**Given** un usuario con rol `USUARIO`, `COLABORADOR` o `TECNICO`
**When** el sidebar del dashboard renderiza
**Then** MUST NOT renderizarse ningún selector (ni de Cliente ni de Ciclo)
**And** el tenant y ciclo activo del usuario MUST resolverse implícitamente desde el JWT

#### Scenario: Cambio de selector de Cliente actualiza el selector de Ciclo

**Given** un operador tiene el cliente A seleccionado (con ciclos CA1, CA2)
**When** el operador cambia el selector de Cliente a cliente B (con ciclos CB1, CB2, CB3)
**Then** el selector de Ciclo MUST actualizar sus opciones a {CB1, CB2, CB3} inmediatamente
**And** la selección default MUST ser el ciclo activo de cliente B
**And** las secciones operativas (Tickets, etc.) MUST refiltrar al cliente B + ciclo activo

#### Scenario: Estado de carga del selector durante fetch de opciones

**Given** el operador carga el dashboard por primera vez
**When** el selector de Cliente está cargando opciones desde `GET /clientes`
**Then** el selector MUST mostrar estado skeleton o deshabilitado durante la carga
**And** MUST NOT mostrar opciones vacías o stale sin indicar el estado de carga
**And** una vez cargado MUST habilitar la interacción inmediatamente

---

### Requirement: TenantContext provee cliente + ciclo al dashboard completo

Un React context `TenantContext` MUST proveer `{ clienteId, clienteNombre, cicloId, cicloNombre }`
a todos los componentes del dashboard. Los componentes que filtran por cliente o ciclo MUST
consumir `TenantContext` — MUST NOT recibir cliente/ciclo como props perforadas a través de
múltiples capas.

#### Scenario: TenantContext se inicializa con el cliente y ciclo activo del usuario regular

**Given** un usuario con rol `USUARIO` (no admin) hace login
**When** el dashboard se inicializa
**Then** `TenantContext.clienteId` MUST ser el `cliente_id` del JWT del usuario
**And** `TenantContext.cicloId` MUST ser el ciclo activo de ese cliente
  (fetch desde `GET /ciclos` con filtro `activo=true`)
**And** MUST NOT requerir ninguna acción del usuario para inicializarse

#### Scenario: TenantContext del operador se actualiza al seleccionar un cliente distinto

**Given** un operador tiene TenantContext con cliente A + ciclo CA_activo
**When** cambia el selector de Cliente a cliente B
**Then** `TenantContext.clienteId` MUST actualizarse al ID de cliente B
**And** `TenantContext.cicloId` MUST actualizarse al ciclo activo de cliente B
**And** todos los componentes que leen de `TenantContext` MUST re-renderizar con los nuevos valores

#### Scenario: Cambio de ciclo en selector se propaga a pantalla de Reportes

**Given** un admin tiene la pantalla de Reportes abierta mostrando datos del ciclo C1
**When** el admin cambia el selector de Ciclo a C2
**Then** `TenantContext.cicloId` MUST actualizarse a C2
**And** la pantalla de Reportes MUST re-fetchar los 4 reportes con `cicloId = C2`
**And** MUST NOT mostrar datos de C1 después de seleccionar C2

---

### Requirement: Estado "Elegí un cliente" para operador sin cliente seleccionado

Cuando un operador carga el dashboard por primera vez y no ha seleccionado un cliente, el área
de contenido principal MUST mostrar un estado placeholder que invita a seleccionar un cliente.
La sección operativa del sidebar (Tickets, Compras, etc.) MUST estar deshabilitada o ausente
hasta que se seleccione un cliente.

#### Scenario: Operador ve placeholder "Elegí un cliente" en primera carga

**Given** un usuario con `is_global_admin: true` carga el dashboard por primera vez
**And** no hay cliente pre-seleccionado (sin estado en localStorage/cookies/URL)
**When** el área de contenido principal renderiza
**Then** MUST mostrar un estado placeholder con texto "Elegí un cliente" (o equivalente)
**And** los ítems de navegación operativos MUST estar visualmente deshabilitados o ausentes
**And** el selector de Cliente en el sidebar MUST ser el elemento interactivo primario

#### Scenario: Contenido operativo se activa al seleccionar un cliente

**Given** el operador está viendo el placeholder "Elegí un cliente"
**When** selecciona un cliente desde el selector de Cliente
**Then** el placeholder MUST reemplazarse por el contenido operativo default (ej. lista de tickets)
**And** los ítems de navegación operativos MUST activarse completamente
**And** `TenantContext` MUST estar populado con el cliente seleccionado y su ciclo activo

#### Scenario: El estado "Elegí un cliente" no impide acceder a las pantallas admin

**Given** el operador aún no seleccionó un cliente
**When** navega a `/admin/clientes`
**Then** MUST poder ver la pantalla Clientes (no requiere selección de cliente para administración)
**And** la pantalla Clientes MUST funcionar independientemente de la selección en TenantContext

---

### Requirement: Pantalla Clientes (solo operador)

Ruta: `(dashboard)/admin/clientes`. Solo accesible con `is_global_admin: true`. El middleware
de Next.js MUST redirigir a no-operadores a `/tickets` antes de renderizar la página.

Layout: filas-tarjeta (no tablas HTML densas), skeleton loader, empty state, interactive states.

#### Scenario: Operador ve lista de clientes como filas-tarjeta

**Given** un usuario con `is_global_admin: true` navega a `/admin/clientes`
**When** la página carga
**Then** MUST mostrar skeleton loader mientras se resuelve `GET /clientes`
**And** MUST renderizar los clientes como filas-tarjeta una vez cargados
**And** cada tarjeta MUST mostrar: nombre, badge de estado activo/suspendido, db_name,
  y acciones (Suspender/Reactivar según estado)
**And** MUST existir un botón "Nuevo cliente" en el header de la sección

#### Scenario: Operador provisiona un nuevo cliente

**Given** el operador está en `/admin/clientes`
**When** hace click en "Nuevo cliente"
**Then** MUST abrirse un formulario (modal o página dedicada) con campos:
  nombre, db_name, email admin, nombre admin, apellido admin, contraseña admin
**And** el botón de submit MUST entrar en estado loading (disabled + spinner) al hacer click
**And** on success MUST mostrar toast de éxito y refrescar la lista de clientes
**And** on error de `db_name` duplicado MUST mostrar "Ese identificador de DB ya existe"
**And** on error genérico MUST mostrar el mensaje de error del servidor

#### Scenario: Protección de ruta — no-operador es redirigido

**Given** un usuario con rol `ADMINISTRADOR` (no global admin) navega a `/admin/clientes`
**When** el middleware de Next.js evalúa la ruta
**Then** MUST redirigir a `/tickets` (o ruta operativa default)
**And** MUST NOT renderizar ningún contenido de `/admin/clientes` a este usuario

#### Scenario: Empty state cuando no hay clientes

**Given** `GET /clientes` devuelve una lista vacía
**When** la pantalla Clientes renderiza
**Then** MUST mostrar empty state: ilustración amigable + texto "No hay clientes registrados"
  + botón "Nuevo cliente" como acción primaria
**And** MUST NOT mostrar una lista vacía sin contexto

---

### Requirement: Pantalla Ciclos (ADMINISTRADOR o operador)

Ruta: `(dashboard)/admin/ciclos`. Accesible para ADMINISTRADOR y operador. Muestra los ciclos
del cliente resuelto por TenantContext.

#### Scenario: Admin-cliente ve ciclos de su propio tenant

**Given** un usuario con rol `ADMINISTRADOR` (no global admin) navega a `/admin/ciclos`
**When** la página carga con TenantContext resuelto a su tenant
**Then** MUST fetchear ciclos desde `GET /ciclos` (tenant propio)
**And** MUST renderizar ciclos como filas-tarjeta con: nombre, fechaInicio, fechaFin,
  badge activo/inactivo, botón "Activar" (solo para ciclos inactivos)
**And** el ciclo activo MUST tener un badge distintivo (ej. badge emerald)
**And** MUST mostrar skeleton loader durante la carga

#### Scenario: Admin-cliente activa un ciclo

**Given** el admin está en `/admin/ciclos` y el ciclo C2 está inactivo
**When** hace click en "Activar" sobre el ciclo C2
**Then** MUST llamar a `PATCH /ciclos/{C2.id}/activar`
**And** el botón "Activar" MUST entrar en estado loading durante el request
**And** on success MUST refrescar la lista mostrando C2 como activo y los demás como inactivos
**And** on error MUST mostrar un toast con el mensaje de error

#### Scenario: Admin-cliente puede crear un nuevo ciclo

**Given** el admin está en `/admin/ciclos`
**When** hace click en "Nuevo ciclo"
**Then** MUST abrirse un formulario con campos: nombre, fechaInicio (date picker), fechaFin (date picker)
**And** on submit MUST llamar a `POST /ciclos`
**And** on success MUST agregar el nuevo ciclo a la lista (inactivo por defecto)
**And** on error de solapamiento MUST mostrar "Las fechas solapan con un ciclo existente"

#### Scenario: Operador ve ciclos del cliente seleccionado en TenantContext

**Given** un operador tiene seleccionado el cliente "Acme Corp" en TenantContext
**And** navega a `/admin/ciclos`
**When** la página carga
**Then** MUST fetchear ciclos via `GET /ciclos` con `X-Tenant-Id` de Acme Corp
**And** MUST renderizar solo los ciclos de Acme Corp

---

### Requirement: Pantalla Usuarios (ADMINISTRADOR o operador)

Ruta: `(dashboard)/admin/usuarios`. Accesible para ADMINISTRADOR y operador. Muestra usuarios
del tenant resuelto por TenantContext.

#### Scenario: Admin-cliente ve usuarios de su tenant como filas-tarjeta

**Given** un usuario con rol `ADMINISTRADOR` navega a `/admin/usuarios`
**When** la página carga
**Then** MUST fetchear usuarios desde `GET /usuarios`
**And** MUST renderizar como filas-tarjeta: nombre + apellido, email, badge de rol,
  badge activo/inactivo, botón "Dar de baja" (disabled para el usuario autenticado)
**And** MUST NOT mostrar ningún campo relacionado con contraseña

#### Scenario: Admin-cliente crea un nuevo usuario

**Given** el admin está en `/admin/usuarios`
**When** hace click en "Nuevo usuario"
**Then** MUST abrirse un formulario con campos: nombre, apellido, email, rol (selector con
  opciones: USUARIO, COLABORADOR, TECNICO, ADMINISTRADOR), contraseña
**And** on submit MUST llamar a `POST /usuarios`
**And** el botón de submit MUST entrar en estado loading durante el request
**And** on success MUST agregar el nuevo usuario a la lista con badge activo
**And** on error de email duplicado MUST mostrar "Este email ya está registrado"

#### Scenario: Admin-cliente da de baja a un usuario

**Given** el admin está en `/admin/usuarios`
**And** hay un usuario activo (que no es el admin autenticado)
**When** hace click en "Dar de baja" sobre ese usuario
**Then** MUST mostrarse un dialog de confirmación (acción destructiva — requiere confirmación)
**And** on confirmar MUST llamar a `PATCH /usuarios/{userId}/baja`
**And** on success MUST actualizar el badge del usuario a inactivo en la lista
**And** on cancel del dialog MUST NO realizar ninguna acción

#### Scenario: El botón "Dar de baja" está deshabilitado para el usuario autenticado

**Given** el admin autenticado aparece en su propia lista de usuarios
**When** la pantalla renderiza
**Then** el botón "Dar de baja" de su propia fila MUST estar deshabilitado (atributo `disabled`)
  o ausente
**And** MUST NOT ser posible dar de baja al usuario actualmente autenticado desde la UI

---

### Requirement: Pantalla Reportes (ADMINISTRADOR o operador)

Ruta: `(dashboard)/admin/reportes`. Accesible para ADMINISTRADOR y operador. Renderiza las
4 agregaciones de reportes para el cliente + ciclo resuelto por TenantContext.

V1 es on-screen solamente. `@media print` MUST aplicarse para soporte de impresión a PDF
desde el browser. No hay botón de export PDF/XLSX (out of scope v1).

#### Scenario: Reportes cargan para el cliente + ciclo resuelto en TenantContext

**Given** un usuario autorizado navega a `/admin/reportes`
**And** TenantContext tiene `clienteId = A` y `cicloId = C1`
**When** la página carga
**Then** MUST emitir los 4 fetches en paralelo:
  `GET /reportes/tickets-por-usuario?cicloId=C1`,
  `GET /reportes/tickets-por-tipo?cicloId=C1`,
  `GET /reportes/tickets-por-estado?cicloId=C1`,
  `GET /reportes/tiempo-resolucion?cicloId=C1`
**And** MUST mostrar skeleton loaders para cada sección mientras los reportes cargan
**And** MUST renderizar cada reporte como sección/card con título descriptivo y datos en tabla
  o resumen (filas-tarjeta o table ligera según la densidad de datos)

#### Scenario: Cambio de ciclo en selector recarga todos los reportes

**Given** el operador o admin está en la pantalla Reportes con datos del ciclo C1
**When** cambia el selector de Ciclo a C2 (actualiza TenantContext.cicloId)
**Then** MUST re-fetchar los 4 reportes con `cicloId = C2`
**And** MUST mostrar skeleton durante el refetch
**And** MUST NOT mostrar datos de C1 después de la selección de C2

#### Scenario: @media print oculta sidebar y botones de acción

**Given** el usuario activa la impresión del browser (Ctrl+P) desde la pantalla Reportes
**When** el stylesheet de impresión aplica
**Then** el sidebar MUST estar oculto (no impreso, `display: none`)
**And** los botones de acción (Nuevo, Dar de baja, etc.) MUST estar ocultos
**And** el contenido de cada reporte MUST renderizarse con fondo blanco y texto negro de alta
  legibilidad
**And** las tarjetas de reporte MUST tener bordes visibles para separación en impresión
**And** el logo o nombre del sistema MUST ser visible en el encabezado impreso (opcional)

#### Scenario: Sin ciclo activo — mensaje de usuario amigable

**Given** el tenant del usuario no tiene ningún ciclo con `activo = TRUE`
**And** el selector de Ciclo no tiene ninguna selección
**When** los endpoints de reporte devuelven HTTP 422
**Then** MUST mostrar un mensaje amigable: "No hay ciclo activo. Seleccioná un ciclo para
  ver los reportes."
**And** MUST NOT mostrar un error crudo de API ni producir crash

#### Scenario: Reporte sin datos muestra empty state por sección

**Given** el ciclo seleccionado no tiene tickets
**When** la pantalla Reportes renderiza
**Then** cada sección de reporte MUST mostrar "Sin datos para este ciclo" (o equivalente)
**And** MUST NOT mostrar valores nulos, NaN ni celdas vacías sin contexto
**And** la pantalla MUST mantener la estructura visual completa (no colapsarse)

#### Scenario: Error de red en un reporte no rompe los demás

**Given** el fetch de `GET /reportes/tickets-por-usuario` falla con error de red
**And** los otros 3 reportes cargan exitosamente
**When** la pantalla renderiza
**Then** la sección de tickets-por-usuario MUST mostrar un error inline con botón "Reintentar"
**And** las otras 3 secciones MUST renderizarse normalmente con sus datos
**And** MUST NOT hacer crash de toda la pantalla por el fallo de un reporte individual
