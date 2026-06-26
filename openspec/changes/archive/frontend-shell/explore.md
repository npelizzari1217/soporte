# Exploración: frontend-shell

> Change: `frontend-shell`
> Fase: explore
> Fecha: 2026-06-26
> Autor: sdd-explore sub-agent

---

## 1. Estado actual del shell

### DashboardLayout (`frontend/src/app/(dashboard)/layout.tsx`)

Server Component que:
1. Lee la cookie `at` httpOnly vía `next/headers cookies()`.
2. Decodifica el JWT (base64url → JSON) sin verificar firma — solo para hidratación de UI.
3. Pasa `initialUser` a `<Providers>` para evitar FOUC de autenticación.
4. Renderiza estructura: `div.flex.min-h-screen.flex-col` → `<AppNav />` arriba + `<main className="flex-1 px-6 py-6">` abajo.

Layout actual: **flex-col** (apilado vertical). AppNav ocupa la franja superior.

### AppNav (`frontend/src/components/shell/app-nav.tsx`)

Top-nav horizontal fijo. Estructura:

```
<nav class="flex h-14 items-center justify-between border-b border-border bg-card px-6">
  <div>                          ← izquierda
    brand: "Soporte" (text-sm font-semibold)
    <ul role="list">             ← links inline
      Tickets · Compras · Reparaciones · Equipos
      active: bg-muted text-foreground font-medium
      inactive: text-muted-foreground hover:bg-muted
      todos: rounded-md px-3 py-1.5
    </ul>
  </div>
  <UserMenu />                   ← derecha
</nav>
```

El comentario del archivo dice literalmente `sidebar/top navigation` — el propio código reconoce la ambigüedad sin resolverla.

Dimensión del contenido: 14 * 4px = 56px de altura consumidos por la nav. El contenido útil comienza debajo.

### UserMenu (`frontend/src/components/shell/user-menu.tsx`)

Dropdown custom con `useState(false)`. Muestra email del usuario + botón "Cerrar sesión".

**Bug detectado**: el dropdown no cierra al hacer click fuera del elemento — no tiene `onClickOutside` ni usa Radix DropdownMenu. Solo cierra con el mismo botón.

Logout: POST `/api/auth/logout` → `router.push('/login')`. Correcto según spec `frontend-auth`.

### PageHeader (`frontend/src/components/shell/page-header.tsx`)

Componente simple, independiente de la nav. Props: `title: string`, `actions?: ReactNode`. Renderiza `flex items-center justify-between py-4` + `<h1 className="text-xl font-semibold tracking-tight">`.

Es agnóstico al tipo de nav — puede reutilizarse en cualquier layout.

---

## 2. Hueco de specs confirmado

Specs existentes en `openspec/specs/`:

| Spec | Cubre |
|------|-------|
| `frontend-design-system` | Tokens de color, radios, átomos (Skeleton, EmptyState, Button) |
| `frontend-ui-states` | Loading / Empty / Error / Interactive states, authz de UI |
| `frontend-api-client` | Proxy catch-all, manejo de 401/403, ApiError |
| `frontend-auth` | Login, logout, cookies httpOnly, BFF Route Handlers |
| `frontend-route-protection` | Middleware Edge, protección de rutas, redirect a /login |

**Ninguna spec cubre**: arquitectura de información del shell, patrón de navegación (sidebar/top-nav), layout del dashboard, comportamiento responsive del nav, posición del tenant/cliente, colapsabilidad, estado activo de links.

El hueco es total — no hay ni una línea en ninguna spec que dicte qué tipo de nav usar.

---

## 3. Comparación de enfoques de navegación

**Contexto concreto**: 4 secciones hoy (Tickets, Compras, Reparaciones, Equipos), multi-tenant, estética Stripe/Linear declarada en constitución §3, dark-only, Next.js App Router.

**Dato verificado**: tanto Stripe (rediseño mayo 2024) como Linear usan sidebar lateral izquierdo en sus dashboards. El top-nav es el patrón de marketing sites, no de product dashboards. Linear específicamente permite colapsar el sidebar (con shortcut `[`), con un ícono persistente en el top-left para re-expandir.

| Criterio | A: Top-nav horizontal (actual) | B: Sidebar lateral fijo | C: Sidebar colapsable |
|----------|-------------------------------|------------------------|----------------------|
| Fit con Stripe/Linear | BAJO — ambos usan sidebar | ALTO — idéntico patrón | ALTO |
| Escala a más secciones | Malo — se satura con 6-7 items | Bueno — hasta 15+ items con grupos | Excelente |
| Soporte de jerarquía (sub-items) | No viable | Viable con secciones | Óptimo |
| Espacio horizontal para contenido | Máximo (nav no consume ancho) | Pierde 240-280px | Recuperable al colapsar (64px icon rail) |
| Tenant/cliente branding | Solo texto pequeño | Panel superior del sidebar | Panel superior del sidebar |
| Comportamiento responsive | Requiere hamburger o scroll horizontal | Requiere drawer en mobile | Drawer en mobile |
| Costo de migrar desde actual | 0 (ya existe) | MEDIO — layout.tsx flex-col→flex-row + Sidebar nuevo | ALTO — ídem + estado colapsado + tooltips icon rail |
| Esfuerzo estimado | — | 3-5 horas (componente + layout + tests) | 6-10 horas |

**Recomendación de exploración**: Opción B (sidebar fijo). Razones:
1. Fidelidad estética con Stripe/Linear es un requisito de constitución, no una preferencia.
2. La app tiene dominio técnico (4 módulos + potencial de crecimiento) — la nav debe reflejarlo.
3. El contexto multi-tenant se beneficia de un panel de sidebar donde mostrar el cliente activo.
4. Costo de migración medio y acotado: es un cambio de composición, no de lógica de negocio.
5. La colapsabilidad puede agregarse como iteración posterior (Opción C) sin redesign.

---

## 4. Modo claro/oscuro — impacto como posible requirement nuevo

La spec `frontend-design-system` (línea 13) dice explícitamente:
> "No hay modo light en este change — dark es el único tema obligatorio."

La constitución §3 dice "oscura por defecto" — lo que podría interpretarse como "default dark pero con opción de light".

### Costo real de agregar un theme toggle

| Aspecto | Detalle |
|---------|---------|
| Tokens duales | Doblar el bloque `@theme` en `globals.css` — un set para dark, uno para light. Hoy hay ~20 variables; serían ~40. O usar `[data-theme="light"] { ... }` overrides. |
| Aplicación del tema | Necesita un atributo `data-theme` o clase `.dark` en `<html>`. Con Tailwind v4 CSS-first, se usa `@layer base` con el selector del atributo. |
| Persistencia | `localStorage` para recordar preferencia del usuario. |
| FOUC en SSR/Next App Router | **El problema más crítico.** El Server Component del root layout no puede leer localStorage. Sin una solución de script bloqueante en `<head>` (inline JS que lee localStorage y aplica la clase antes del paint), hay un flash del tema incorrecto en el primer render. |
| Solución FOUC | Script inline en `<head>` del root layout (`/src/app/layout.tsx`, no el dashboard layout). Requiere `dangerouslySetInnerHTML`. No trivial en App Router. |
| Componentes de Shadcn | Consumen las CSS variables del `@theme` — si los tokens están bien definidos para ambos temas, funcionan sin cambios. |
| Impacto en esta spec | La spec `frontend-design-system` necesita ser extendida o una nueva spec `frontend-theme` creada. |
| Decisión requerida | **El usuario debe decidir sí/no ANTES de la fase propose.** Cambia el alcance del change significativamente. |

**Veredicto exploración**: agregar modo claro es un requirement independiente con costo propio (estimado: +1 día de trabajo adicional, principalmente por el FOUC fix en SSR). NO debe bloquearse si el usuario quiere postergar. Si se incluye en este change, la spec del design system necesita revisión.

---

## 5. Preguntas abiertas — el usuario debe responder antes de `sdd-propose`

1. **Patrón de navegación**: ¿Sidebar lateral fijo (recomendado) o top-nav (actual)? Si sidebar: ¿la primera versión lo hace colapsable o fijo?
2. **Modo claro**: ¿Se incluye un theme toggle en este change o se pospone?
3. **Responsive**: ¿Cómo se comporta el nav en pantallas <768px? (a) drawer desde hamburger, (b) bottom nav, (c) no soportar mobile en esta versión.
4. **Contexto multi-tenant en el shell**: ¿El nombre del cliente/organización debe aparecer en el sidebar? ¿Hay tenant switcher o cada usuario opera en un único tenant?
5. **Bug del UserMenu**: ¿Se corrige el click-outside en este change o se posterga?
6. **Componente UserMenu**: ¿Se migra a Radix DropdownMenu o se mantiene custom?

---

## 6. Archivos relevantes para la fase propose

- `frontend/src/app/(dashboard)/layout.tsx` — punto de intervención principal
- `frontend/src/components/shell/app-nav.tsx` — componente a reemplazar o refactorizar
- `frontend/src/components/shell/user-menu.tsx` — bug de click-outside a resolver
- `frontend/src/components/shell/page-header.tsx` — compatible con cualquier layout, sin cambios
- `frontend/src/styles/globals.css` — tokens actuales; extensión requerida si se agrega modo claro
- `openspec/specs/frontend-design-system/spec.md` — spec a actualizar/extender si se agrega modo claro
