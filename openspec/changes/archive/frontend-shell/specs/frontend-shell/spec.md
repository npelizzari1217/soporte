# Frontend Shell Specification

> Capability: `frontend-shell`
> Stack: Next.js App Router, Tailwind CSS v4, Lucide icons, Radix UI
> Autoridad: CLAUDE.md §3 "Patrones de Diseño del Frontend"
> Introducido en change: `frontend-shell` (2026-06-26)

## Purpose

Define la arquitectura de información del dashboard: sidebar lateral fijo `w-72` que reemplaza el top-nav horizontal, layout flex-row en el grupo de rutas `(dashboard)`, navegación a las 4 secciones del dominio, display del tenant activo (sin switcher), posición del UserMenu con cierre por click-outside, comportamiento responsive < 768px vía drawer/hamburger, y contratos de accesibilidad.

## Requirements

### Requirement: Sidebar fijo `w-72` presente en todas las rutas del dashboard

El layout `(dashboard)/layout.tsx` MUST renderizar un sidebar izquierdo de ancho fijo `w-72` (288px). El sidebar MUST persistir montado entre navegaciones client-side dentro del grupo `(dashboard)`. El sidebar NO es colapsable en esta versión — colapsabilidad es scope de una iteración futura.

#### Scenario: Sidebar visible en todas las rutas del dashboard

- GIVEN el usuario está autenticado y accede a cualquier ruta bajo `/(dashboard)/`
- WHEN la página carga
- THEN el sidebar MUST ser visible en el lado izquierdo con ancho `w-72`
- AND el contenido principal MUST ocupar el espacio restante a la derecha del sidebar

#### Scenario: Sidebar no se desmonta al navegar entre secciones

- GIVEN el sidebar está montado en `(dashboard)/layout.tsx`
- WHEN el usuario navega de `/tickets` a `/equipos` (client-side navigation)
- THEN el sidebar MUST permanecer montado sin ciclo de desmontaje/remontaje
- AND el estado interno del sidebar (scroll position, etc.) MUST conservarse

---

### Requirement: Layout `(dashboard)` en flex-row

El contenedor root del `(dashboard)/layout.tsx` MUST tener disposición horizontal (`flex flex-row`), con el sidebar como primer hijo y `<main>` consumiendo el espacio restante (`flex-1`).

#### Scenario: Contenedor root es flex-row con sidebar + main

- GIVEN `(dashboard)/layout.tsx` renderiza en viewport >= 768px
- WHEN se inspecciona el árbol DOM
- THEN el contenedor root MUST tener `display: flex` y `flex-direction: row`
- AND el sidebar MUST ser el primer hijo con `width: 18rem` (w-72)
- AND el `<main>` MUST tener `flex: 1` y `min-height: 100vh`

---

### Requirement: Navegación a 4 secciones con estado activo sutil

El sidebar MUST contener los ítems de navegación Tickets, Compras, Reparaciones y Equipos, cada uno con un ícono Lucide asociado. El ítem correspondiente a la ruta activa MUST mostrarse con estilo "activo" sutil. Los ítems inactivos MUST tener estilo atenuado.

#### Scenario: Los 4 ítems de navegación están presentes con íconos

- GIVEN el sidebar está renderizado
- WHEN se inspeccionan los ítems de navegación
- THEN MUST existir exactamente los ítems: Tickets, Compras, Reparaciones, Equipos en ese orden
- AND cada ítem MUST tener un ícono Lucide visible junto al label
- AND cada ítem MUST ser un enlace (`<a>` o `<Link>`) a su ruta correspondiente

#### Scenario: El ítem de la ruta actual tiene estado activo

- GIVEN el usuario está en la ruta `/tickets`
- WHEN el sidebar renderiza
- THEN el ítem "Tickets" MUST tener clase(s) de estilo activo aplicadas (ej. `bg-muted text-foreground font-medium`)
- AND el ítem activo MUST tener `aria-current="page"`
- AND los demás ítems MUST tener estilo inactivo (`text-muted-foreground`)

#### Scenario: Cambio de ruta actualiza el ítem activo

- GIVEN el usuario está en `/reparaciones` (ítem "Reparaciones" activo)
- WHEN navega a `/compras`
- THEN el ítem "Compras" MUST pasar a estado activo
- AND el ítem "Reparaciones" MUST pasar a estado inactivo

---

### Requirement: Display del tenant activo en el header del sidebar

El header del sidebar MUST mostrar el nombre del tenant/cliente activo de la sesión. MUST NOT renderizar ningún control para cambiar de tenant. La información es display-only.

#### Scenario: Nombre del tenant activo es visible en el header del sidebar

- GIVEN el usuario está autenticado con un tenant activo
- WHEN el sidebar renderiza
- THEN el header del sidebar MUST mostrar el nombre del cliente/tenant activo
- AND el nombre MUST ser legible con contraste WCAG AA en modo oscuro y claro

#### Scenario: No existe control de tenant switcher

- GIVEN el sidebar está renderizado
- WHEN se inspeccionan los elementos del header del sidebar
- THEN MUST NOT existir ningún dropdown, `<button>`, `<select>` o lista para cambiar de tenant
- AND el display del tenant MUST ser un elemento de solo lectura (ej. `<span>` o `<p>`)

---

### Requirement: UserMenu posicionado en la base del sidebar

El UserMenu MUST estar en la parte inferior del sidebar. Al abrirse, MUST mostrar el email del usuario y la opción de cerrar sesión. MUST cerrarse al hacer click fuera o al presionar ESC.

#### Scenario: UserMenu se posiciona en la base del sidebar

- GIVEN el sidebar está renderizado
- WHEN se inspecciona la posición del UserMenu en el árbol DOM del sidebar
- THEN el UserMenu MUST estar al fondo del sidebar (estructura flex con `mt-auto` o equivalente)
- AND MUST NOT posicionarse en el header ni en la zona media del sidebar

#### Scenario: UserMenu cierra al hacer click fuera

- GIVEN el dropdown del UserMenu está abierto
- WHEN el usuario hace click en cualquier área fuera del componente UserMenu
- THEN el dropdown MUST cerrarse
- AND el foco MUST retornar al trigger del UserMenu

#### Scenario: UserMenu cierra al presionar ESC

- GIVEN el dropdown del UserMenu está abierto
- WHEN el usuario presiona la tecla `Escape`
- THEN el dropdown MUST cerrarse
- AND el foco MUST retornar al trigger del UserMenu

---

### Requirement: Comportamiento responsive — drawer/hamburger en < 768px

En viewports con ancho < 768px el sidebar MUST estar oculto del layout. MUST aparecer un botón hamburger visible. Al accionarlo, el sidebar se abre como drawer con overlay semi-transparente. Presionar ESC o hacer click en el overlay MUST cerrar el drawer.

#### Scenario: Sidebar oculto y hamburger visible en mobile

- GIVEN el viewport tiene ancho < 768px
- WHEN cualquier ruta del dashboard carga
- THEN el sidebar MUST estar oculto (no ocupa espacio en el layout, no visible)
- AND el botón hamburger MUST ser visible en el área superior de la página

#### Scenario: Drawer se abre al activar el hamburger

- GIVEN el viewport < 768px y el sidebar está oculto
- WHEN el usuario presiona el botón hamburger
- THEN el sidebar MUST abrirse como drawer superpuesto sobre el contenido (overlay)
- AND un overlay semi-transparente MUST cubrir el área de contenido
- AND el foco MUST moverse al primer ítem de navegación del drawer

#### Scenario: ESC cierra el drawer

- GIVEN el drawer está abierto en viewport < 768px
- WHEN el usuario presiona `Escape`
- THEN el drawer MUST cerrarse
- AND el foco MUST retornar al botón hamburger

#### Scenario: Click en el overlay cierra el drawer

- GIVEN el drawer está abierto y el overlay es visible
- WHEN el usuario hace click en el área del overlay (fuera del sidebar)
- THEN el drawer MUST cerrarse

---

### Requirement: Accesibilidad del sidebar y la navegación

El sidebar MUST usar semántica HTML adecuada para screen readers y navegación por teclado. Los ítems activos MUST ser anunciados. La gestión de foco en el drawer MUST ser correcta.

#### Scenario: Elemento nav con aria-label presente

- GIVEN el sidebar está renderizado
- WHEN un screen reader o herramienta de auditoría inspecciona la página
- THEN el sidebar MUST estar contenido en un `<nav>` con `aria-label="Navegación principal"` (o equivalente localizado)
- AND los ítems de navegación MUST estar en estructura `<ul>` / `<li>`

#### Scenario: El ítem activo tiene aria-current

- GIVEN el usuario está en una ruta con ítem de navegación correspondiente
- WHEN se inspecciona el ítem activo
- THEN el ítem activo MUST tener el atributo `aria-current="page"`
- AND los demás ítems MUST NOT tener `aria-current`
