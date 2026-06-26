# Tasks: frontend-shell
> Change: `frontend-shell` · Phase: tasks · Store: hybrid · 2026-06-26
> Reads: spec (frontend-shell + frontend-design-system delta) + design.md
> TDD mode: strict (RED → GREEN per pair) · Delivery: auto-chain stacked PRs < 400 lines

---

## Dependency Graph

```
S1 (tokens+FOUC) ──┬──► S2 (sidebar+app-shell+drawer) ──► S4 (UserMenu Radix)
                   └──► S3 (form atoms+Badge) ─────────► S5a (CardRow+Tickets+Compras)
                                                                    │
                                                                    ▼
                                                         S5b (Reparaciones+Equipos+print)
```

S2 and S3 are **parallel** from S1 (each opens a separate stacked PR). All others are sequential.

---

## Locked Decisions (do not re-open)

- Sidebar `w-72` fijo, no colapsable en este change.
- Modo dual via `.dark` en `<html>` (`@theme inline` + `:root`/`.dark`). No `dark:` por componente.
- FOUC: script inline bloqueante en root `layout.tsx` + `suppressHydrationWarning`. Lógica pura en `resolveTheme()`.
- Tenant: fallback elegante — muestra brand "Soporte" + inicial del email (`user.email[0]`). `clienteNombre` no existe en `JwtPayload` todavía (campo llega en `auth-cliente-nombre`, follow-up).
- `@radix-ui/react-dropdown-menu` para UserMenu (S4); `@radix-ui/react-select` para Select atom (S3).
- Badge paleta semántica completa (5 tonos, ver T3.1).

---

## Badge Tone Palette — Definición Canónica

Esta paleta cubre todos los estados del catálogo (`ESTADOS` en `catalogos.ts`). Debe vivir como constante tipada en `shared/lib/badge-tones.ts` (S3, T3.1) y ser importada por `Badge`, `catalogos.ts`, y los list components.

| Tono | Clases Tailwind | Estados que lo usan |
|------|-----------------|---------------------|
| `neutral` | `bg-muted text-muted-foreground` | Abierto, Cerrado |
| `warning` | `bg-amber-500/10 text-amber-600 dark:text-amber-400` | Pendiente de aprobación |
| `success` | `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400` | Aprobado, Resuelto |
| `danger` | `bg-red-500/10 text-red-600 dark:text-red-400` | Rechazado, Cancelado |
| `info` | `bg-blue-500/10 text-blue-600 dark:text-blue-400` | En progreso |

Para prioridades: Baja → `neutral`, Media → `info`, Alta → `warning`, Crítica → `danger`.

---

## Slice 1 — Tokens duales + FOUC

**PR #1** · Dep: ninguna · ~150 líneas estimadas

Cubre: design-system MODIFIED req 1 (modo dual, FOUC), req 2 (--radius-xl), req 3 (variables @theme), ADDED req 5 (Inter).

### T1.1 · TEST RED — `resolveTheme()` unit
- [x] Crear `frontend/src/shared/theme/resolve-theme.test.ts`
- Casos obligatorios (puro, sin mocks):
  - `(null, false)` → `'dark'` (sin preferencia, sistema oscuro → default dark)
  - `(null, true)` → `'light'` (sin preferencia, sistema claro → sigue sistema)
  - `('dark', true)` → `'dark'` (preferencia explícita dark gana sobre sistema claro)
  - `('light', false)` → `'light'` (preferencia explícita light gana sobre sistema oscuro)
  - `('invalid', false)` → `'dark'` (valor desconocido → default dark)
- Sin mocks, sin DOM — función pura

### T1.2 · IMPL GREEN — `resolveTheme()`
- [x] Crear `frontend/src/shared/theme/resolve-theme.ts`
- Firma: `resolveTheme(pref: string | null, systemPrefersLight: boolean): 'light' | 'dark'`
- Lógica: `pref === 'light'` → `'light'`; `pref === 'dark'` → `'dark'`; else: `systemPrefersLight ? 'light' : 'dark'`
- Dep: T1.1 pasa RED

### T1.3 · TEST RED — Script FOUC en `<head>`
- [x] Crear `frontend/src/app/layout.test.tsx`
- Render `RootLayout` con RTL, buscar el elemento `<script>` en el `<head>`
- Aserciones:
  - El string del script contiene `localStorage.getItem('theme')`
  - El string contiene `classList.toggle('dark'`
  - El string contiene `prefers-color-scheme`
  - El `<html>` renderiza con `suppressHydrationWarning`
- Mock: no DOM mutations necesarias — solo leer el string via `dangerouslySetInnerHTML`

### T1.4 · IMPL — Modificar `frontend/src/styles/globals.css`
- [x] Reemplazar el bloque `@theme {}` monolítico con la estrategia dual:
  ```css
  @import "tailwindcss";
  @custom-variant dark (&:where(.dark, .dark *));

  @theme {
    /* Tokens estáticos: no flipean en runtime */
    --radius-lg: 0.5rem;    /* 8px — cards, paneles (MANTENER valor actual) */
    --radius-md: 0.375rem;  /* 6px — botones, dropdowns, badges */
    --radius-xl: 0.75rem;   /* 12px — inputs, forms (NUEVO) */
    --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  }

  @theme inline {
    /* Indirección: las utilidades referencian vars que flipean por selector */
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-destructive: var(--destructive);
    --color-destructive-foreground: var(--destructive-foreground);
  }

  :root {
    /* LIGHT — alto contraste WCAG AA */
    --background: oklch(0.99 0 0);
    --foreground: oklch(0.20 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.20 0 0);
    --primary: oklch(0.62 0.19 256);
    --primary-foreground: oklch(0.98 0 0);
    --muted: oklch(0.94 0 0);
    --muted-foreground: oklch(0.50 0 0);
    --border: oklch(0.88 0 0);
    --input: oklch(0.88 0 0);
    --ring: oklch(0.62 0.19 256);
    --accent: oklch(0.94 0 0);
    --accent-foreground: oklch(0.20 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.20 0 0);
    --secondary: oklch(0.94 0 0);
    --secondary-foreground: oklch(0.20 0 0);
    --destructive: oklch(0.58 0.22 27);
    --destructive-foreground: oklch(0.97 0 0);
  }

  .dark {
    /* DARK = slate-950 cinematográfico (migrar valores actuales del @theme) */
    --background: oklch(0.16 0 0);
    --foreground: oklch(0.97 0 0);
    --card: oklch(0.19 0 0);
    --card-foreground: oklch(0.97 0 0);
    --primary: oklch(0.62 0.19 256);
    --primary-foreground: oklch(0.98 0 0);
    --muted: oklch(0.24 0 0);
    --muted-foreground: oklch(0.65 0 0);
    --border: oklch(0.27 0 0);
    --input: oklch(0.27 0 0);
    --ring: oklch(0.62 0.19 256);
    --accent: oklch(0.24 0 0);
    --accent-foreground: oklch(0.97 0 0);
    --popover: oklch(0.19 0 0);
    --popover-foreground: oklch(0.97 0 0);
    --secondary: oklch(0.24 0 0);
    --secondary-foreground: oklch(0.97 0 0);
    --destructive: oklch(0.58 0.22 27);
    --destructive-foreground: oklch(0.97 0 0);
  }
  ```
- Nota: `--radius-lg` NO cambia (ya es 0.5rem = 8px). Solo se agrega `--radius-xl`.
- Dep: T1.1, T1.2

### T1.5 · IMPL GREEN — Modificar `frontend/src/app/layout.tsx`
- [x] Agregar script FOUC inline bloqueante en `<head>` via `dangerouslySetInnerHTML`:
  ```tsx
  <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=localStorage.getItem('theme');var s=matchMedia('(prefers-color-scheme: light)').matches;var t=p||(!s?'dark':'light');document.documentElement.classList.toggle('dark',t!=='light');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.classList.add('dark');}})();` }} />
  ```
- [x] Cambiar `<html lang="es" className="dark">` → `<html lang="es" suppressHydrationWarning>`
- [x] Remover `className="dark"` del `<html>` (el script lo maneja)
- Dep: T1.2 (resolveTheme pasa tests), T1.3 (test pasa RED → este impl lo pone GREEN)

### T1.6 · [OPCIONAL] E2E — Test FOUC Playwright
- [ ] Crear `frontend/e2e/theme-fouc.spec.ts`
- Casos: sin localStorage → dark al recargar; `theme=light` en localStorage → no class .dark; no flash perceptible (screenshot comparison o timing check)
- Alto valor, no bloqueante para S1 merge
- Dep: T1.5

---

## Slice 2 — Sidebar + AppShell + Drawer + Layout flex-row

**PR #2** · Dep: S1 completo · ~365 líneas estimadas
**Parallel track con S3** (ambos dependen solo de S1)

Cubre: frontend-shell req 1 (sidebar w-72), req 2 (flex-row layout), req 3 (nav 4 secciones + active state), req 4 (tenant display), req 6 (responsive drawer), req 7 (accesibilidad).

### T2.1 · TEST RED — `Sidebar` component
- [x] Crear `frontend/src/components/shell/sidebar.test.tsx`
- Setup: mock `usePathname` (de `next/navigation`), mock `useSession` (de `@/shared/hooks/use-session`)
- Casos:
  - Renderiza exactamente 4 links: Tickets (`/tickets`), Compras (`/compras`), Reparaciones (`/reparaciones`), Equipos (`/equipos`)
  - Cada link tiene un ícono Lucide (verificar `aria-hidden` o presencia del SVG)
  - `pathname = '/tickets'` → ítem Tickets tiene `aria-current="page"`; los demás NO tienen `aria-current`
  - `pathname = '/compras'` → ítem Compras activo; Tickets inactivo
  - Existe `<nav aria-label="Navegación principal">` en el árbol DOM
  - Links están en estructura `<ul>/<li>`
  - Header del sidebar: sin `useSession().user` → muestra brand "Soporte"
  - Header con `user = { email: 'john@test.com', ... }` → muestra inicial "J" o similar fallback
  - No existe ningún `<button>`, `<select>` ni dropdown en el header (tenant display solo lectura)
  - UserMenu está en el footer del sidebar (último hijo del componente raíz)

### T2.2 · IMPL GREEN — Crear `frontend/src/components/shell/sidebar.tsx`
- [x] `"use client"` (requiere `usePathname`)
- NAV_LINKS con íconos Lucide: `{ href: '/tickets', label: 'Tickets', Icon: TicketIcon }` etc.
  - Importar: `Ticket`, `ShoppingCart`, `Wrench`, `Monitor` de `lucide-react`
- `usePathname()` para active detection: `pathname.startsWith(href)`
- `useSession()` para tenant display — fallback: `user ? user.email[0].toUpperCase() : null`
- Estructura del componente:
  ```
  <aside className="w-72 flex flex-col h-full min-h-screen bg-card border-r border-white/5 dark:border-white/5 border-slate-200/50 backdrop-blur-sm">
    <header> {/* tenant display — solo lectura */}
      <p>{brand "Soporte"}</p>
      <span>{user initial avatar}</span>
    </header>
    <nav aria-label="Navegación principal">
      <ul>
        {NAV_LINKS.map → <li><Link aria-current={active ? "page" : undefined} /></li>}
      </ul>
    </nav>
    <div className="mt-auto">
      <UserMenu />
    </div>
  </aside>
  ```
- Activo: clases `bg-muted text-foreground font-medium`; inactivo: `text-muted-foreground hover:bg-muted hover:text-foreground`
- Dep: T2.1 pasa RED

### T2.3 · TEST RED — `AppShell` drawer behavior
- [x] Crear `frontend/src/components/shell/app-shell.test.tsx`
- Mock: `usePathname`, `userEvent` de `@testing-library/user-event`
- Casos:
  - Desktop (simular `md:` via datos o skip responsive): sidebar renderiza como `hidden md:flex`
  - Mobile: botón hamburger es visible (buscar `aria-label="Abrir menú"`)
  - Click hamburger → aparece el drawer (sidebar como overlay) + overlay backdrop visible
  - Drawer abierto + `userEvent.keyboard('{Escape}')` → drawer se cierra
  - Drawer abierto + click en el overlay → drawer se cierra
  - Drawer abierto, cambio de `pathname` (re-render con nuevo valor) → drawer se cierra
  - Drawer: tiene `role="dialog"` y `aria-modal="true"`
  - Foco después de cerrar con ESC → retorna al botón hamburger (verificar `document.activeElement`)
- Nota sobre responsive: jsdom no ejecuta CSS media queries. Testear la lógica de estado, no la visibilidad CSS. Usar `data-testid` o `aria-*` para identificar elementos.

### T2.4 · IMPL GREEN — Crear `frontend/src/components/shell/app-shell.tsx`
- [x] `"use client"` (requiere `useState`, `useEffect`, `usePathname`)
- Props: `{ children: React.ReactNode }`
- Estado: `const [open, setOpen] = useState(false)`
- Refs: `hamburgerRef` (para devolver foco), `firstNavItemRef` (para recibir foco al abrir)
- `useEffect` para ESC: `keydown → 'Escape' → setOpen(false)` + `hamburgerRef.current?.focus()`
- `useEffect` para route change: `pathname change → setOpen(false)`
- Render:
  ```tsx
  <div className="flex h-screen w-full overflow-hidden">
    {/* Sidebar desktop — oculto en mobile */}
    <div className="hidden md:flex w-72 flex-shrink-0">
      <Sidebar />
    </div>

    {/* Hamburger mobile */}
    <button ref={hamburgerRef} className="md:hidden ..." aria-label="Abrir menú"
            onClick={() => setOpen(true)}>
      <Menu className="h-5 w-5" />
    </button>

    {/* Drawer + overlay (mobile) */}
    {open && (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} aria-hidden />
        <div role="dialog" aria-modal="true" className="fixed left-0 inset-y-0 z-50 w-72">
          <Sidebar />
        </div>
      </>
    )}

    {/* Contenido principal */}
    <main className="flex-1 overflow-auto px-6 py-6">
      {children}
    </main>
  </div>
  ```
- Dep: T2.3 pasa RED

### T2.5 · IMPL — Modificar `frontend/src/app/(dashboard)/layout.tsx`
- [x] Reemplazar `<AppNav>` con `<AppShell>`:
  ```tsx
  import { AppShell } from "@/components/shell/app-shell";
  // ...
  return (
    <Providers initialUser={initialUser}>
      <AppShell>{children}</AppShell>
    </Providers>
  );
  ```
- [x] Eliminar el `<div className="flex min-h-screen flex-col">` wrapper (AppShell lo maneja)
- [x] Mantener `app-nav.tsx` en disco hasta verify (rollback disponible)
- Dep: T2.4

---

## Slice 3 — Form atoms (Input/Label/Select) + Badge

**PR #3** · Dep: S1 completo · ~335 líneas estimadas
**Parallel track con S2** (ambos dependen solo de S1)

Cubre: design-system ADDED req 6 (átomos form premium), req 7 (badges translúcidos).

### T3.0 · SETUP — Instalar `@radix-ui/react-select`
- [ ] En `frontend/`: `npm install @radix-ui/react-select@latest`
- [ ] Verificar compat con React 19.1: revisar `@radix-ui/react-select` peerDependencies (v2+ soporta React 18/19)
- [ ] Confirmar que no hay conflicto con `@radix-ui/react-slot` ya instalado
- [ ] Actualizar `frontend/package.json` (verificar que `@radix-ui/react-select` aparece en dependencies)

### T3.1 · IMPL — Crear `frontend/src/shared/lib/badge-tones.ts`
- [ ] Crear constante tipada (no requiere test unitario — type safety es el contrato):
  ```ts
  export type BadgeTone = 'neutral' | 'warning' | 'success' | 'danger' | 'info'

  export const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
    neutral: 'bg-muted text-muted-foreground',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    danger:  'bg-red-500/10 text-red-600 dark:text-red-400',
    info:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  }
  ```
- Dep: T3.0

### T3.2 · TEST RED — `<Input>`
- [ ] Crear `frontend/src/components/ui/input.test.tsx`
- Casos:
  - Renderiza con clase `rounded-xl`
  - Forwardea props HTML input: `value`, `onChange`, `disabled`, `placeholder`
  - Prop `error=true` agrega clases de error (ring destructive)
  - Prop `error=false` (o ausente) → no aplica clases de error
  - `ref` forwardeado: `ref.current` es el `<input>` DOM

### T3.3 · IMPL GREEN — Crear `frontend/src/components/ui/input.tsx`
- [ ] `forwardRef<HTMLInputElement, InputProps>`
- `InputProps extends React.InputHTMLAttributes<HTMLInputElement> { error?: boolean }`
- `cva` base: `flex w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`
- Variant error: `border-destructive focus-visible:ring-destructive/30`
- Dep: T3.2

### T3.4 · TEST RED — `<Label>`
- [ ] Crear `frontend/src/components/ui/label.test.tsx`
- Casos:
  - Renderiza con clases `text-xs`, `tracking-wider`, `uppercase`
  - Acepta `htmlFor` → atributo `for` en el DOM
  - Acepta `children` y los renderiza
  - Extiende estilos via `className`

### T3.5 · IMPL GREEN — Crear `frontend/src/components/ui/label.tsx`
- [ ] `forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>`
- `cva` base: `text-xs font-medium tracking-wider uppercase text-muted-foreground`
- Dep: T3.4

### T3.6 · TEST RED — `<Select>`
- [ ] Crear `frontend/src/components/ui/select.test.tsx`
- Casos (usar Radix real, no over-mock):
  - Trigger tiene clase `rounded-xl`
  - Renderiza `placeholder` cuando `value` es undefined
  - `userEvent.click(trigger)` → panel se abre (Radix renderiza el listbox)
  - Click en un `SelectItem` → `onValueChange` se llama con el valor correcto
  - Panel abierto tiene `rounded-md` en el contenedor
  - `disabled=true` → trigger tiene `disabled` attribute
- Nota: Radix Select usa portal — usar `{ wrapper: document.body }` o `within(document.body)` para encontrar el panel

### T3.7 · IMPL GREEN — Crear `frontend/src/components/ui/select.tsx`
- [ ] Sobre `@radix-ui/react-select`
- Exportar: `Select` (componente wrapper), `SelectProps`
- Interface: `{ value?: string; onValueChange?: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean; className?: string }`
- Trigger: `rounded-xl border border-input bg-transparent px-3 py-2 text-sm`
- Content/portal: `rounded-md border border-border bg-popover shadow-md z-50`
- Item: `rounded-sm px-3 py-1.5 text-sm cursor-pointer hover:bg-muted focus:bg-muted`
- Dep: T3.0, T3.6

### T3.8 · TEST RED — `<Badge>`
- [ ] Crear `frontend/src/components/ui/badge.test.tsx`
- Casos (verificar clase CSS, no estilo computado):
  - `tone="warning"` → contiene clase `bg-amber-500/10`
  - `tone="success"` → contiene clase `bg-emerald-500/10`
  - `tone="danger"` → contiene clase `bg-red-500/10`
  - `tone="info"` → contiene clase `bg-blue-500/10`
  - `tone="neutral"` → contiene clase `bg-muted`
  - Todos los tonos tienen `rounded-md` (NO `rounded-full`)
  - `children` se renderiza

### T3.9 · IMPL GREEN — Crear `frontend/src/components/ui/badge.tsx`
- [ ] `cva` con variante `tone`
- Props: `{ tone?: BadgeTone; children: React.ReactNode; className?: string }`
- Base: `inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium`
- Variantes: usar `BADGE_TONE_CLASSES` de `badge-tones.ts` como valores de `cva`
- Default tone: `neutral`
- Dep: T3.1, T3.8

---

## Slice 4 — UserMenu → Radix DropdownMenu

**PR #4** · Dep: S2 completo · ~120 líneas estimadas

Cubre: frontend-shell req 5 (UserMenu click-outside, ESC, foco).

### T4.0 · SETUP — Instalar `@radix-ui/react-dropdown-menu`
- [x] En `frontend/`: `npm install @radix-ui/react-dropdown-menu@latest`
- [x] Verificar compat con React 19.1 (v2+ soporta React 18/19; confirmar peerDeps del paquete instalado)
- [x] Verificar que no hay conflicto con `@radix-ui/react-slot` ni `@radix-ui/react-select`

### T4.1 · TEST RED — `UserMenu` (el test que FALLA hoy)
- [x] Crear `frontend/src/components/shell/user-menu.test.tsx`
- Setup: mock `useSession` retorna `{ user: { email: 'test@example.com', sub: '123', cliente_id: 'abc', roles: [], permisos: [] } }`, spy `global.fetch` retorna `{ ok: true }`, mock `useRouter`
- Casos:
  - **[FALLA HOY] Click fuera del componente cierra el dropdown**: abrir con `userEvent.click(trigger)` → `userEvent.click(document.body)` → dropdown ya no visible
  - **[FALLA HOY] ESC cierra el dropdown**: abrir → `userEvent.keyboard('{Escape}')` → dropdown ya no visible
  - Foco retorna al trigger después de cerrar con ESC (verificar `document.activeElement === triggerEl`)
  - El dropdown muestra el email del usuario
  - Click en "Cerrar sesión" → `fetch('/api/auth/logout', { method: 'POST' })` llamado
  - Durante logout: botón deshabilitado + texto "Cerrando sesión…"
- No usar MSW — logout con spy de `fetch` es suficiente (atómico §5)

### T4.2 · IMPL GREEN — Modificar `frontend/src/components/shell/user-menu.tsx`
- [x] Reemplazar implementación manual con Radix `DropdownMenu`:
  ```tsx
  import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

  export function UserMenu() {
    const { user } = useSession()
    // ...
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="...">
            {user.email}
            <ChevronDown />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="rounded-md border border-border bg-popover shadow-lg z-50 w-44 p-1" align="end">
            <DropdownMenu.Item onSelect={handleLogout} disabled={isLoggingOut} className="rounded-sm px-3 py-2 text-sm cursor-pointer hover:bg-muted focus:bg-muted">
              {isLoggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
  }
  ```
- [x] Eliminar `useState(open)` manual → Radix maneja open state; `isLoggingOut` mantenido para UX
- [x] Mantener lógica de logout idéntica (`fetch + router.push`)
- [x] Agregar `ChevronDown` de `lucide-react` si no está
- Dep: T4.0, T4.1

---

## Slice 5a — CardRow + Tickets list + Compras list

**PR #5a** · Dep: S3 completo · ~375 líneas estimadas

Cubre: design-system ADDED req 8 (filas-tarjeta, primeras 2 listas).

### T5a.0 · IMPL — Actualizar `frontend/src/shared/lib/catalogos.ts`
- [ ] Agregar `ESTADO_TONE` y `PRIORIDAD_TONE` mapas usando los UUIDs del seed:
  ```ts
  import type { BadgeTone } from '@/shared/lib/badge-tones'

  export const ESTADO_TONE: Record<string, BadgeTone> = {
    'c0000000-0000-4000-c000-000000000001': 'neutral',   // Abierto
    'c0000000-0000-4000-c000-000000000002': 'warning',   // Pendiente de aprobación
    'c0000000-0000-4000-c000-000000000003': 'success',   // Aprobado
    'c0000000-0000-4000-c000-000000000004': 'danger',    // Rechazado
    'c0000000-0000-4000-c000-000000000005': 'info',      // En progreso
    'c0000000-0000-4000-c000-000000000006': 'success',   // Resuelto
    'c0000000-0000-4000-c000-000000000007': 'neutral',   // Cerrado
    'c0000000-0000-4000-c000-000000000008': 'danger',    // Cancelado
  }

  export const PRIORIDAD_TONE: Record<string, BadgeTone> = {
    'd0000000-0000-4000-d000-000000000001': 'neutral',   // Baja
    'd0000000-0000-4000-d000-000000000002': 'info',      // Media
    'd0000000-0000-4000-d000-000000000003': 'warning',   // Alta
    'd0000000-0000-4000-d000-000000000004': 'danger',    // Crítica
  }
  ```
- Dep: T3.1 (badge-tones.ts existe)

### T5a.1 · TEST RED — `<CardRow>`
- [ ] Crear `frontend/src/components/ui/card-row.test.tsx`
- Casos:
  - Renderiza `icon` cuando se provee (buscar por el contenido del icon slot)
  - Renderiza `title` (texto visible)
  - Renderiza `subtitle` cuando se provee
  - Renderiza `badges` cuando se provee
  - `onClick` se llama al hacer click en la fila
  - Sin `onClick`: no tiene `role="button"`; con `onClick`: tiene `role="button"` y `tabIndex={0}`
  - Tiene clase `rounded-lg` en el wrapper

### T5a.2 · IMPL GREEN — Crear `frontend/src/components/ui/card-row.tsx`
- [ ] Interface:
  ```ts
  interface CardRowProps {
    icon?: React.ReactNode
    title: React.ReactNode
    subtitle?: React.ReactNode
    badges?: React.ReactNode
    onClick?: () => void
    className?: string
  }
  ```
- Layout: `flex items-center gap-4 p-4 rounded-lg border bg-card backdrop-blur-sm`
- Border glassmorphism: `border-white/5 dark:border-white/5` + override light `border-slate-200/50` (usar `dark:` con D1)
- Slot izquierdo: `<div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">{icon}</div>`
- Slot centro: `<div className="flex-1 min-w-0"><div className="text-sm font-medium text-foreground truncate">{title}</div>{subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}</div>`
- Slot derecho: `<div className="flex items-center gap-2 flex-shrink-0">{badges}</div>`
- Si `onClick`: `role="button"`, `tabIndex={0}`, `onKeyDown` para Enter/Space
- Dep: T5a.1

### T5a.3 · TEST RED — `TicketsList` migrado a CardRow
- [ ] Crear/reemplazar `frontend/src/features/tickets/components/TicketsList.test.tsx`
- Datos fixture: array de tickets con distintos `estadoId` y `prioridadId`
- Casos:
  - No hay `<table>` en el output (buscar `queryByRole('table')` → null)
  - No hay `<tr>` en el output
  - Cada ticket renderiza como `role="button"` o como un card (verificar por count)
  - El badge de estado usa el tono correcto (ej. `estadoId` Pendiente → `bg-amber-500/10`)
  - El badge de prioridad Crítica → `bg-red-500/10`
  - El título del ticket es visible

### T5a.4 · IMPL GREEN — Migrar `frontend/src/features/tickets/components/TicketsList.tsx`
- [ ] Reemplazar `<table>` con lista de `<CardRow>`:
  ```tsx
  import { CardRow } from '@/components/ui/card-row'
  import { Badge } from '@/components/ui/badge'
  import { ESTADO_TONE, PRIORIDAD_TONE } from '@/shared/lib/catalogos'
  import { Ticket as TicketIcon } from 'lucide-react'

  <div className="space-y-2">
    {tickets.map(ticket => (
      <CardRow
        key={ticket.id}
        icon={<TicketIcon className="h-5 w-5 text-muted-foreground" />}
        title={ticket.titulo}
        subtitle={`${ticket.numero} · ${labelFor(TIPOS, ticket.tipoId)} · ${formatDate(ticket.createdAt)}`}
        badges={
          <>
            <Badge tone={PRIORIDAD_TONE[ticket.prioridadId] ?? 'neutral'}>
              {labelFor(PRIORIDADES, ticket.prioridadId)}
            </Badge>
            <Badge tone={ESTADO_TONE[ticket.estadoId] ?? 'neutral'}>
              {labelFor(ESTADOS, ticket.estadoId)}
            </Badge>
          </>
        }
      />
    ))}
  </div>
  ```
- [ ] Remover import de `PRIORIDAD_BADGE` (ya no se usa)
- [ ] Mantener `formatDate` helper
- Dep: T5a.0, T5a.2, T5a.3

### T5a.5 · TEST RED — `ComprasList` migrado a CardRow
- [ ] Crear/reemplazar `frontend/src/features/compras/components/ComprasList.test.tsx`
- Casos:
  - No hay `<table>` en el output
  - Badge de estado usa tono correcto para el estadoId
  - La celda de aprobación preserva su lógica (Rechazada / Aprobada / —)
  - Título y número visibles

### T5a.6 · IMPL GREEN — Migrar `frontend/src/features/compras/components/ComprasList.tsx`
- [ ] Reemplazar `<table>` con `<CardRow>`:
  - Icon: `ShoppingCart` de `lucide-react`
  - Title: `compra.titulo`
  - Subtitle: `${compra.numero} · ${formatDate(compra.createdAt)}`
  - Badges: badge de estado + inline text de aprobación (mantener `AprobacionCell` como sub-componente, renderizado junto a los badges o como segundo subtitle)
- Dep: T5a.0, T5a.2, T5a.5

---

## Slice 5b — Reparaciones list + Equipos list + Print styles

**PR #5b** · Dep: S5a completo · ~230 líneas estimadas

Cubre: design-system ADDED req 8 (últimas 2 listas), req 9 (@media print).

### T5b.1 · TEST RED — `ReparacionesList` migrado a CardRow
- [x] Crear/reemplazar `frontend/src/features/reparaciones/components/ReparacionesList.test.tsx`
- Casos:
  - No hay `<table>` en el output
  - El avance (`porcentajeAvance`) es visible (ya sea como progress bar o texto)
  - Badge de estado usa tono correcto
  - Título y número visibles

### T5b.2 · IMPL GREEN — Migrar `frontend/src/features/reparaciones/components/ReparacionesList.tsx`
- [x] Reemplazar `<table>` con `<CardRow>`:
  - Icon: `Wrench` de `lucide-react`
  - Title: `rep.titulo`
  - Subtitle: `${rep.numero} · ${rep.ubicacionNombre ?? '—'}`
  - Badges: badge de estado; mantener `AvanceCell` como slot adicional dentro de badges o como segundo badge visual
- Dep: T5a.0, T5a.2, T5b.1

### T5b.3 · TEST RED — `EquiposList` migrado a CardRow
- [x] Crear/reemplazar `frontend/src/features/equipos/components/EquiposList.test.tsx`
- Casos:
  - No hay `<table>` en el output
  - Equipo activo → badge con `bg-emerald-500/10` (tone success)
  - Equipo inactivo → badge con `bg-muted` (tone neutral)
  - Nombre, marca y modelo visibles

### T5b.4 · IMPL GREEN — Migrar `frontend/src/features/equipos/components/EquiposList.tsx`
- [x] Reemplazar `<table>` con `<CardRow>`:
  - Icon: `Monitor` de `lucide-react`
  - Title: `equipo.nombre`
  - Subtitle: `${equipo.marca ?? '—'} ${equipo.modelo ?? '—'} · N° ${equipo.numeroSerie ?? '—'}`
  - Badges: `<Badge tone={equipo.activo ? 'success' : 'neutral'}>{equipo.activo ? 'Activo' : 'Inactivo'}</Badge>`
  - Info adicional: `formatDate(equipo.fechaAdquisicion)` como parte del subtitle
- [x] Remover `ACTIVO_BADGE` inline (reemplazado por `Badge` component)
- Dep: T5a.2, T5b.3

### T5b.5 · IMPL — Agregar `@media print` a `frontend/src/styles/globals.css`
- [x] Agregar al final del archivo:
  ```css
  @media print {
    /* Sidebar y controles de navegación ocultos en impresión */
    aside,
    [data-sidebar],
    nav,
    button,
    [role="button"] {
      display: none !important;
    }

    /* Contenido principal al 100% del ancho imprimible */
    main {
      width: 100% !important;
      max-width: 100% !important;
      padding: 0 !important;
    }

    /* Fondo blanco, texto negro máxima legibilidad */
    *,
    *::before,
    *::after {
      background: white !important;
      color: black !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    /* Divisores finos y minimalistas */
    hr,
    .divide-y > * + * {
      border-color: oklch(0.85 0 0) !important;
    }
  }
  ```
- Nota: Test unitario no aplica para `@media print` (jsdom no ejecuta media queries). Verificación en fase `sdd-verify` con Playwright o inspección manual.
- Req: design-system ADDED req 9

---

## Archivos afectados (resumen)

| Archivo | Acción | Slice |
|---------|--------|-------|
| `frontend/src/shared/theme/resolve-theme.ts` | Create | S1 |
| `frontend/src/shared/theme/resolve-theme.test.ts` | Create | S1 |
| `frontend/src/styles/globals.css` | Modify (dual tokens + print) | S1, S5b |
| `frontend/src/app/layout.tsx` | Modify (FOUC script) | S1 |
| `frontend/src/app/layout.test.tsx` | Create | S1 |
| `frontend/src/components/shell/sidebar.tsx` | Create | S2 |
| `frontend/src/components/shell/sidebar.test.tsx` | Create | S2 |
| `frontend/src/components/shell/app-shell.tsx` | Create | S2 |
| `frontend/src/components/shell/app-shell.test.tsx` | Create | S2 |
| `frontend/src/app/(dashboard)/layout.tsx` | Modify (AppShell) | S2 |
| `frontend/src/components/shell/app-nav.tsx` | Keep until verify (rollback) | — |
| `frontend/src/shared/lib/badge-tones.ts` | Create | S3 |
| `frontend/src/components/ui/input.tsx` | Create | S3 |
| `frontend/src/components/ui/input.test.tsx` | Create | S3 |
| `frontend/src/components/ui/label.tsx` | Create | S3 |
| `frontend/src/components/ui/label.test.tsx` | Create | S3 |
| `frontend/src/components/ui/select.tsx` | Create | S3 |
| `frontend/src/components/ui/select.test.tsx` | Create | S3 |
| `frontend/src/components/ui/badge.tsx` | Create | S3 |
| `frontend/src/components/ui/badge.test.tsx` | Create | S3 |
| `frontend/src/components/shell/user-menu.tsx` | Modify (Radix) | S4 |
| `frontend/src/components/shell/user-menu.test.tsx` | Create | S4 |
| `frontend/package.json` | Modify (+2 radix deps) | S3, S4 |
| `frontend/src/shared/lib/catalogos.ts` | Modify (+ESTADO_TONE, PRIORIDAD_TONE) | S5a |
| `frontend/src/components/ui/card-row.tsx` | Create | S5a |
| `frontend/src/components/ui/card-row.test.tsx` | Create | S5a |
| `frontend/src/features/tickets/components/TicketsList.tsx` | Modify (→ CardRow) | S5a |
| `frontend/src/features/tickets/components/TicketsList.test.tsx` | Create/Replace | S5a |
| `frontend/src/features/compras/components/ComprasList.tsx` | Modify (→ CardRow) | S5a |
| `frontend/src/features/compras/components/ComprasList.test.tsx` | Create/Replace | S5a |
| `frontend/src/features/reparaciones/components/ReparacionesList.tsx` | Modify (→ CardRow) | S5b |
| `frontend/src/features/reparaciones/components/ReparacionesList.test.tsx` | Create/Replace | S5b |
| `frontend/src/features/equipos/components/EquiposList.tsx` | Modify (→ CardRow) | S5b |
| `frontend/src/features/equipos/components/EquiposList.test.tsx` | Create/Replace | S5b |

---

## Review Workload Forecast

| Slice | PR | Dep | ~Líneas | Bajo budget (< 400)? |
|-------|----|-----|---------|----------------------|
| S1 Tokens + FOUC | #1 | — | ~150 | ✓ |
| S2 Sidebar + AppShell + Drawer | #2 | S1 | ~365 | ✓ (margen 35) |
| S3 Form atoms + Badge | #3 | S1 | ~335 | ✓ |
| S4 UserMenu Radix | #4 | S2 | ~120 | ✓ |
| S5a CardRow + Tickets + Compras | #5a | S3 | ~375 | ✓ (margen 25) |
| S5b Reparaciones + Equipos + Print | #5b | S5a | ~230 | ✓ |
| **Total** | **6 PRs** | | **~1.575** | |

**Chained/stacked PRs recomendado:** Sí — la estrategia auto-chain ya está activa.
**Algún slice supera el budget de 400 líneas:** No — todos bajo el límite.
**Decisión necesaria antes de apply:** No — todas las decisiones están lockeadas en el design.

### Riesgos de entrega

1. **S2 tiene margen ajustado (~35 líneas)**: Si `AppShell` con focus trap + a11y crece más de lo previsto, puede superar 400 líneas. Mitigación: separar `app-shell.tsx` en S2a (Sidebar) y S2b (AppShell+drawer) si se da el caso.
2. **S5a tiene margen ajustado (~25 líneas)**: Si la lógica de aprobación de `ComprasList` migrada resulta más compleja, podría acercarse al límite. Mitigación: mover `EquiposList` a S5a y `ComprasList` a S5b si hay riesgo.
3. **S3 depende de compat React 19.1 con `@radix-ui/react-select`**: Verificar en T3.0 antes de escribir tests. Si hay conflicto, evaluar versión @2.x del paquete.
4. **`@media print` no tiene test unitario**: La verificación de req 9 queda para `sdd-verify` (Playwright o inspección manual). No es un bloqueante para el merge de S5b, pero sí para verify.
5. **Tenant display fallback**: `JwtPayload.clienteNombre` no existe. El fallback ("Soporte" + inicial de email) satisface el spec en modo preview pero la verificación del req 4 scenario 1 puede marcarse como PARTIAL en verify hasta que llegue `auth-cliente-nombre`.
