# Apply Progress: frontend-shell

> Change: `frontend-shell` · Store: hybrid · Started: 2026-06-27
> TDD: strict (RED → GREEN) · Delivery: auto-chain stacked PRs

---

## Slice 1 — Tokens duales + FOUC (PR #1) — DONE

Status: **COMPLETE** · Tests: 11 RED → 11 GREEN · Zero regressions (116/116 total)

### Tasks

- [x] **T1.1** · TEST RED — `resolveTheme()` unit
  - File: `frontend/src/shared/theme/resolve-theme.test.ts`
  - 5 casos puros, sin mocks, sin DOM
  - RED confirmado: module not found error

- [x] **T1.2** · IMPL GREEN — `resolveTheme()`
  - File: `frontend/src/shared/theme/resolve-theme.ts`
  - Firma: `resolveTheme(pref: string | null, systemPrefersLight: boolean): 'light' | 'dark'`
  - Lógica: `pref === 'light'` → `'light'`; `pref === 'dark'` → `'dark'`; else: sistema → dark fallback
  - GREEN: 5/5

- [x] **T1.3** · TEST RED — Script FOUC en `<head>`
  - File: `frontend/src/app/layout.test.tsx`
  - Estrategia: inspección directa del árbol React (no RTL render de `<html>`)
    - RTL no puede renderizar `<html>` correctamente en jsdom — inspección del elemento JSX es la alternativa canónica
  - 6 casos: suppressHydrationWarning, sin className, script existe, 3 strings en el script
  - RED confirmado: 6/6 failing (layout tenía `className="dark"`, sin script)

- [x] **T1.4** · IMPL — `frontend/src/styles/globals.css`
  - Reemplazado bloque `@theme {}` monolítico → estrategia dual
  - Bloques: `@custom-variant dark`, `@theme` (estáticos), `@theme inline` (indirección), `:root` (light), `.dark` (dark)
  - `--radius-lg: 0.5rem` MANTENIDO
  - `--radius-md: 0.375rem` MANTENIDO
  - `--radius-xl: 0.75rem` AGREGADO (req 2 delta spec)
  - `--font-sans: "Inter", ui-sans-serif, ...` AGREGADO (req 5 ADDED)
  - 17 tokens semánticos con valores light/dark separados

- [x] **T1.5** · IMPL GREEN — `frontend/src/app/layout.tsx`
  - Script FOUC inline bloqueante: `FOUC_SCRIPT` constante documentada
  - `<html lang="es" suppressHydrationWarning>` (sin `className`)
  - `<head>` con `<script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />`
  - JSDoc en el layout y en la constante FOUC_SCRIPT explicando el "por qué"
  - GREEN: 6/6

- [ ] **T1.6** · [OPCIONAL] E2E — Test FOUC Playwright — diferido (no bloqueante)

### Archivos tocados (S1)

| Archivo | Acción |
|---------|--------|
| `frontend/src/shared/theme/resolve-theme.ts` | Creado |
| `frontend/src/shared/theme/resolve-theme.test.ts` | Creado |
| `frontend/src/styles/globals.css` | Modificado (dual tokens) |
| `frontend/src/app/layout.tsx` | Modificado (FOUC script) |
| `frontend/src/app/layout.test.tsx` | Creado |

### Test results (S1)

```
Test command: cd frontend && npm run test
Result: 22 test files passed (116 tests — 0 failures, 0 regressions)
S1 specific: 11 tests (5 resolveTheme + 6 layout FOUC) — all GREEN
```

---

## Slice 2 — Sidebar + AppShell + Drawer + Layout flex-row (PR #2) — DONE

Status: **COMPLETE** · Tests: 20 RED → 20 GREEN · Zero regressions (136/136 total)

### Environment check (pre-S2)

- `lucide-react@1.21.0` already installed in `frontend/node_modules` — no install needed.
- All 6 required icons confirmed available: `Ticket`, `ShoppingCart`, `Wrench`, `Monitor`, `Menu`, `ChevronDown`.
- Icons render with `aria-hidden="true"` by default in their SVG output.

### Tasks

- [x] **T2.1** · TEST RED — `Sidebar` component
  - File: `frontend/src/components/shell/sidebar.test.tsx`
  - Mocks: `usePathname` + `useRouter` (via `next/navigation`), `useSession` (via `@/shared/hooks/use-session`)
  - 11 test cases covering: 4 links, correct hrefs, aria-hidden SVG icons, aria-current="page" active detection,
    nav landmark with aria-label, ul/li structure, tenant display (brand + initial), read-only header, UserMenu in footer
  - RED confirmed: "Failed to resolve import './sidebar'" (module not found)

- [x] **T2.2** · IMPL GREEN — `frontend/src/components/shell/sidebar.tsx`
  - `"use client"` directive
  - NAV_LINKS const: Ticket, ShoppingCart, Wrench, Monitor from lucide-react
  - `usePathname().startsWith(href)` for active detection
  - `useSession()` for tenant display — userInitial = `user.email[0].toUpperCase()`
  - `<aside w-72>` with header (read-only), `<nav aria-label="Navegación principal">` with `<ul>/<li>`, footer with `<UserMenu />`
  - `aria-current={isActive ? "page" : undefined}` on each Link
  - Icons rendered with Lucide (have `aria-hidden="true"` by default)
  - GREEN: 11/11

- [x] **T2.3** · TEST RED — `AppShell` drawer behavior
  - File: `frontend/src/components/shell/app-shell.test.tsx`
  - Mocks: `./sidebar` (mocked to `<div data-testid="sidebar-mock">` to isolate AppShell), `usePathname` + `useRouter`
  - 9 test cases: hamburger button exists, drawer not rendered initially, children in main, click opens dialog+overlay,
    ESC closes drawer, focus returns to hamburger after ESC, click overlay closes, pathname change auto-closes
  - CSS responsive behavior skipped (jsdom has no media queries) — tests target state logic and aria attributes
  - RED confirmed: "Failed to resolve import './app-shell'" (module not found)

- [x] **T2.4** · IMPL GREEN — `frontend/src/components/shell/app-shell.tsx`
  - `"use client"` directive
  - `useState(false)` for open state
  - `useRef<HTMLButtonElement>` for hamburger focus-return ref
  - `useEffect([open])`: keydown listener for Escape → setOpen(false) + hamburgerRef.current?.focus()
    - Why explicit focus return: ARIA APG §3.4 dialog management requires focus to return to trigger
  - `useEffect([pathname])`: route change → setOpen(false)
  - Desktop sidebar: `<div className="hidden md:flex w-72 flex-shrink-0"><Sidebar /></div>`
  - Hamburger: `<button ref={hamburgerRef} aria-label="Abrir menú" className="md:hidden fixed ...">`
  - Drawer: `role="dialog" aria-modal="true"` + overlay `aria-hidden="true" className="fixed inset-0 ..."` 
  - `<main>` wraps children
  - GREEN: 9/9

- [x] **T2.5** · IMPL — `frontend/src/app/(dashboard)/layout.tsx`
  - Replaced `import { AppNav }` with `import { AppShell }`
  - Replaced `<div className="flex min-h-screen flex-col"><AppNav /><main>...</main></div>` with `<AppShell>{children}</AppShell>`
  - AppShell manages its own flex-row layout + main element internally
  - `app-nav.tsx` KEPT on disk (rollback available until sdd-verify passes)
  - Updated JSDoc: spec refs updated to frontend-shell reqs

### Archivos tocados (S2)

| Archivo | Acción |
|---------|--------|
| `frontend/src/components/shell/sidebar.tsx` | Creado |
| `frontend/src/components/shell/sidebar.test.tsx` | Creado |
| `frontend/src/components/shell/app-shell.tsx` | Creado |
| `frontend/src/components/shell/app-shell.test.tsx` | Creado |
| `frontend/src/app/(dashboard)/layout.tsx` | Modificado (AppShell en lugar de AppNav) |
| `frontend/src/components/shell/app-nav.tsx` | MANTENIDO (rollback hasta verify) |

### Test results (S2 + cumulative)

```
Test command: cd frontend && npm run test
S2 specific: 20 tests (11 Sidebar + 9 AppShell) — all GREEN
Cumulative:  24 test files, 136 tests — 0 failures, 0 regressions
```

---

## Slice 3 — Form atoms (Input/Label/Select) + Badge (PR #3) — DONE

Status: **COMPLETE** · Tests: 26 RED → 26 GREEN · Zero regressions (162/162 total)

### Environment check (pre-S3)

- `@radix-ui/react-select@2.3.1` installed via `npm install @radix-ui/react-select@latest`.
- peerDependencies: `react: "^16.8 || ^17.0 || ^18.0 || ^19.0 || ^19.0.0-rc"` — React 19.1 FULLY SUPPORTED.
- No conflict with `@radix-ui/react-slot@^1.3.0` already installed.
- `@radix-ui/react-select` now in `frontend/package.json` dependencies at `^2.3.1`.
- Added jsdom polyfills to `vitest.setup.ts` (inside `typeof window !== 'undefined'` guard):
  - `HTMLElement.prototype.hasPointerCapture` — required by Radix event handling
  - `HTMLElement.prototype.setPointerCapture`
  - `HTMLElement.prototype.releasePointerCapture`
  - `window.ResizeObserver` — required by Radix Select content positioning
  - `HTMLElement.prototype.scrollIntoView` — required by Radix Select item focus

### Tasks

- [x] **T3.0** · SETUP — Instalar `@radix-ui/react-select`
  - Installed: `@radix-ui/react-select@2.3.1`
  - React 19.1 compat: VERIFIED (peerDeps include `^19.0`)
  - No conflict with `@radix-ui/react-slot`
  - In `dependencies` of `package.json`: CONFIRMED

- [x] **T3.1** · IMPL — `frontend/src/shared/lib/badge-tones.ts`
  - No test needed (typed constant — type safety is the contract)
  - 5 tones: neutral, warning, success, danger, info
  - Matches canonical palette table from tasks.md exactly
  - Note: JSDoc comment fixed — `*/10` syntax closed the block comment; reworded to avoid the `*/` sequence

- [x] **T3.2** · TEST RED — `<Input>`
  - File: `frontend/src/components/ui/input.test.tsx`
  - 6 cases: rounded-xl, placeholder, disabled, error=true, error=false, ref forwarding
  - RED confirmed: module not found

- [x] **T3.3** · IMPL GREEN — `frontend/src/components/ui/input.tsx`
  - `forwardRef<HTMLInputElement, InputProps>`
  - `InputProps extends React.InputHTMLAttributes<HTMLInputElement> { error?: boolean }`
  - `cva` base: `rounded-xl border border-input ... focus-visible:ring-2 focus-visible:ring-ring`
  - Variant `error: true` → `border-destructive focus-visible:ring-destructive/30`
  - GREEN: 6/6

- [x] **T3.4** · TEST RED — `<Label>`
  - File: `frontend/src/components/ui/label.test.tsx`
  - 6 cases: text-xs, tracking-wider, uppercase, htmlFor → for attr, children, className merge
  - RED confirmed: module not found

- [x] **T3.5** · IMPL GREEN — `frontend/src/components/ui/label.tsx`
  - `forwardRef<HTMLLabelElement, LabelHTMLAttributes>`
  - `cva` base: `text-xs font-medium tracking-wider uppercase text-muted-foreground`
  - GREEN: 6/6

- [x] **T3.6** · TEST RED — `<Select>`
  - File: `frontend/src/components/ui/select.test.tsx`
  - 6 cases: trigger rounded-xl, placeholder, listbox opens (within document.body), onValueChange, panel rounded-md, disabled
  - Uses Radix REAL (no over-mock); panel queried via `within(document.body)`
  - RED confirmed: module not found

- [x] **T3.7** · IMPL GREEN — `frontend/src/components/ui/select.tsx`
  - Built on `@radix-ui/react-select`
  - Trigger: `rounded-xl border border-input` (form-class per CONSTITUTION §3)
  - Content: `rounded-md border border-border bg-popover shadow-md z-50` (portal into body)
  - Items: `rounded-sm px-3 py-1.5 text-sm cursor-pointer hover:bg-muted`
  - Props: `{ value, onValueChange, options, placeholder, disabled, className }`
  - GREEN: 6/6

- [x] **T3.8** · TEST RED — `<Badge>`
  - File: `frontend/src/components/ui/badge.test.tsx`
  - 8 cases: 5 tone class checks, rounded-md NOT rounded-full, children, default tone=neutral
  - RED confirmed: module not found

- [x] **T3.9** · IMPL GREEN — `frontend/src/components/ui/badge.tsx`
  - `cva` with `tone` variant using `BADGE_TONE_CLASSES` from `badge-tones.ts`
  - Base: `inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium`
  - Default tone: `neutral`
  - `satisfies Record<BadgeTone, string>` for strict type check on variant map
  - GREEN: 8/8

### Archivos tocados (S3)

| Archivo | Acción |
|---------|--------|
| `frontend/package.json` | Modificado (+@radix-ui/react-select@^2.3.1) |
| `frontend/vitest.setup.ts` | Modificado (jsdom polyfills para Radix) |
| `frontend/src/shared/lib/badge-tones.ts` | Creado |
| `frontend/src/components/ui/input.tsx` | Creado |
| `frontend/src/components/ui/input.test.tsx` | Creado |
| `frontend/src/components/ui/label.tsx` | Creado |
| `frontend/src/components/ui/label.test.tsx` | Creado |
| `frontend/src/components/ui/select.tsx` | Creado |
| `frontend/src/components/ui/select.test.tsx` | Creado |
| `frontend/src/components/ui/badge.tsx` | Creado |
| `frontend/src/components/ui/badge.test.tsx` | Creado |

### Test results (S3 + cumulative)

```
Test command: cd frontend && npx vitest run
S3 specific: 26 tests (6 Input + 6 Label + 6 Select + 8 Badge) — all GREEN
Cumulative:  28 test files, 162 tests — 0 failures, 0 regressions
```

---

## Slice 4 — UserMenu → Radix DropdownMenu (PR #4) — DONE

Status: **COMPLETE** · Tests: 2 RED → 7 GREEN · Zero regressions (169/169 total)

### Environment check (pre-S4)

- `@radix-ui/react-dropdown-menu@2.1.18` installed via `npm install @radix-ui/react-dropdown-menu@latest`.
- peerDependencies: `react: "^16.8 || ^17.0 || ^18.0 || ^19.0 || ^19.0.0-rc"` — React 19.1 FULLY SUPPORTED.
- No conflict with `@radix-ui/react-slot@^1.3.0` or `@radix-ui/react-select@^2.3.1`.
- `@radix-ui/react-dropdown-menu` now in `frontend/package.json` dependencies at `^2.1.18`.
- jsdom polyfills from S3 (`hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, `ResizeObserver`, `scrollIntoView`) are sufficient for DropdownMenu — no new polyfills needed.

### Tasks

- [x] **T4.0** · SETUP — Instalar `@radix-ui/react-dropdown-menu`
  - Installed: `@radix-ui/react-dropdown-menu@2.1.18`
  - React 19.1 compat: VERIFIED (peerDeps include `^19.0`)
  - No conflict with `@radix-ui/react-slot` or `@radix-ui/react-select`
  - In `dependencies` of `package.json`: CONFIRMED at `^2.1.18`

- [x] **T4.1** · TEST RED — `UserMenu`
  - File: `frontend/src/components/shell/user-menu.test.tsx`
  - 7 test cases total; 2 confirmed RED against old implementation:
    - "closes the dropdown when clicking outside" — FAILED (no DismissableLayer in old impl)
    - "closes the dropdown on Escape key press" — FAILED (no ESC handler in old impl)
  - 5 already passing: shows email, renders null without user, focus return, logout fetch, loading state
  - Click-outside test uses `fireEvent.pointerDown(document.body)` instead of `user.click(document.body)`
    because Radix sets `pointer-events: none` on `<body>` when a layer is open — fireEvent bypasses CSS check.
    Radix's DismissableLayer listens for `pointerdown` on `document` (capture phase) to detect outside interaction.
  - `e.preventDefault()` in `onSelect` keeps menu open during logout so "Cerrando sesión…" state is visible.
  - Mocks: `useSession` (module mock), `global.fetch` (vi.spyOn), `useRouter` (module mock)
  - No MSW — spy on fetch is sufficient for atomic logout test.

- [x] **T4.2** · IMPL GREEN — `frontend/src/components/shell/user-menu.tsx`
  - Replaced `{open && <div>}` manual toggle with `DropdownMenu.Root/Trigger/Portal/Content/Item`
  - Removed `useState(open)` — Radix manages open state internally
  - Kept `useState(isLoggingOut)` — user-visible loading state (NOT replaced by Radix)
  - Added `ChevronDown` from `lucide-react` (replacing inline SVG)
  - `DropdownMenu.Trigger asChild` wraps the trigger `<button>` — Radix adds `aria-haspopup="menu"` + `aria-expanded`
  - `DropdownMenu.Portal` renders content in `document.body` — avoids stacking context issues
  - `DropdownMenu.Content align="end" sideOffset={4}` — right-aligned, 4px gap
  - `DropdownMenu.Item onSelect={(e) => { e.preventDefault(); handleLogout() }}` — `e.preventDefault()` prevents
    Radix from auto-closing the menu so the loading state is shown during in-flight logout request
  - Logout logic unchanged: `fetch('/api/auth/logout', { method: 'POST' }) + router.push('/login')`
  - Radius: Content `rounded-md`, Item `rounded-sm` (per CONSTITUTION §3)
  - JSDoc documents WHY Radix was chosen: DismissableLayer + FocusScope + ARIA semantics
  - GREEN: 7/7

### Archivos tocados (S4)

| Archivo | Acción |
|---------|--------|
| `frontend/package.json` | Modificado (+@radix-ui/react-dropdown-menu@^2.1.18) |
| `frontend/src/components/shell/user-menu.tsx` | Modificado (Radix DropdownMenu) |
| `frontend/src/components/shell/user-menu.test.tsx` | Creado |

### Test results (S4 + cumulative)

```
Test command: cd frontend && npx vitest run
S4 specific: 7 tests — 2 RED → 7 GREEN (click-outside + ESC confirmed failing before, all passing after)
Cumulative:  29 test files, 169 tests — 0 failures, 0 regressions
```

---

## Slice 5a — CardRow + Tickets list + Compras list (PR #5a) — DONE

Status: **COMPLETE** · Tests: 30 RED → 30 GREEN · Zero regressions (199/199 total)

### UUID check (pre-T5a.0)

UUIDs in tasks.md T5a.0 EXACTLY MATCH `catalogos.ts` ESTADOS and PRIORIDADES maps.
Verified against actual file: `frontend/src/shared/lib/catalogos.ts`. No discrepancies.

### Tasks

- [x] **T5a.0** · IMPL — `frontend/src/shared/lib/catalogos.ts`
  - Added `import type { BadgeTone } from '@/shared/lib/badge-tones'`
  - Added `ESTADO_TONE: Record<string, BadgeTone>` — 8 estados mapped with semantic tones
  - Added `PRIORIDAD_TONE: Record<string, BadgeTone>` — 4 prioridades mapped with semantic tones
  - `PRIORIDAD_BADGE` kept with `@deprecated` JSDoc (backward-compat until all lists migrated)
  - UUIDs verified against actual file: MATCH exactly, no corrections needed
  - JSDoc documents tone semantics: why neutral/warning/success/danger/info per estado

- [x] **T5a.1** · TEST RED — `<CardRow>`
  - File: `frontend/src/components/ui/card-row.test.tsx`
  - 11 cases: icon slot, title, subtitle (present + absent), badges slot,
    onClick called on click, no role="button" without onClick,
    role="button" + tabIndex=0 with onClick, Enter key, Space key, rounded-lg class
  - RED confirmed: "Failed to resolve import './card-row'" (module not found)

- [x] **T5a.2** · IMPL GREEN — `frontend/src/components/ui/card-row.tsx`
  - Interface: `{ icon?, title, subtitle?, badges?, onClick?, className? }`
  - Layout: `flex items-center gap-4 p-4 rounded-lg border bg-card backdrop-blur-sm`
  - Glassmorphism border: `border-slate-200/50 dark:border-white/5` (per CONSTITUTION §3)
  - Conditional interactivity: `role="button"` + `tabIndex={0}` + `onKeyDown` ONLY when `onClick` provided
  - WHY documented in JSDoc: ARIA spec prohibits role="button" on non-interactive elements
  - Slots: icon (left circle `w-10 h-10`), title+subtitle (flex-1 center), badges (right flex-shrink-0)
  - GREEN: 11/11

- [x] **T5a.3** · TEST RED — `TicketsList` migrated to CardRow
  - File: `frontend/src/features/tickets/components/TicketsList.test.tsx`
  - 9 cases: no `<table>`, no `<tr>`, titles visible, correct count,
    Pendiente badge `bg-amber-500/10` (warning), En progreso badge `bg-blue-500/10` (info),
    Crítica badge `bg-red-500/10` (danger), Media badge `bg-blue-500/10` (info), empty list
  - RED confirmed: 6 failures — table exists + old badge classes (PRIORIDAD_BADGE used wrong colors)

- [x] **T5a.4** · IMPL GREEN — `frontend/src/features/tickets/components/TicketsList.tsx`
  - Replaced `<table>` with `<div className="space-y-2">` + `<CardRow>` per ticket
  - Icon: `<Ticket className="h-5 w-5 text-muted-foreground" aria-hidden />`
  - Title: `ticket.titulo` (plain string — RTL `getByText()` exact match works ✓)
  - Subtitle: each part in own `<span>` → `<span>numero</span> · <span>tipo</span> · <span>date</span>`
    WHY: RTL `findByText("SOP-2026-00001")` requires exact match on element textContent;
    isolated spans let integration tests (TicketsPage.test.tsx) continue using `findByText` with no changes.
  - Badges: `<Badge tone={PRIORIDAD_TONE[...]}>` + `<Badge tone={ESTADO_TONE[...]}>` (with `?? 'neutral'` fallback)
  - Removed import of `PRIORIDAD_BADGE` (replaced by `PRIORIDAD_TONE`) and `cn` (no longer needed)
  - Kept `formatDate` helper
  - GREEN: 9/9 | Zero regressions on TicketsPage integration test

- [x] **T5a.5** · TEST RED — `ComprasList` migrated to CardRow
  - File: `frontend/src/features/compras/components/ComprasList.test.tsx`
  - 10 cases: no `<table>`, no `<tr>`, 3 titles visible,
    Aprobado badge `bg-emerald-500/10` (success), Rechazado badge `bg-red-500/10` (danger),
    Pendiente badge `bg-amber-500/10` (warning),
    AprobacionCell: "Aprobada" text, "Rechazada" + title attr on motivo, "—" for pending,
    rejection wins over aprobadoEn (edge case documented in original)
  - RED confirmed: 5 failures — table exists + old badge classes (hardcoded `bg-muted` for all estados)

- [x] **T5a.6** · IMPL GREEN — `frontend/src/features/compras/components/ComprasList.tsx`
  - Replaced `<table>` with `<div className="space-y-2">` + `<CardRow>` per compra
  - Icon: `<ShoppingCart className="h-5 w-5 text-muted-foreground" aria-hidden />`
  - Title: `compra.titulo`
  - Subtitle: `<span><span>numero</span> · <span>date</span></span>` (isolated spans for RTL compat)
  - Badges slot: `<Badge tone={ESTADO_TONE[...]}>` + `<AprobacionCell compra={compra} />`
  - `AprobacionCell` PRESERVED as internal sub-component — same logic as original:
    - Check `motivoRechazo` FIRST (rejection wins when both fields coexist)
    - `aprobadoEn` → "Aprobada {date}"
    - neither → "—"
  - `formatDate` kept
  - GREEN: 10/10 | Zero regressions on ComprasPage integration test

### Archivos tocados (S5a)

| Archivo | Acción |
|---------|--------|
| `frontend/src/shared/lib/catalogos.ts` | Modificado (+ESTADO_TONE, +PRIORIDAD_TONE, import BadgeTone) |
| `frontend/src/components/ui/card-row.tsx` | Creado |
| `frontend/src/components/ui/card-row.test.tsx` | Creado |
| `frontend/src/features/tickets/components/TicketsList.tsx` | Modificado (→ CardRow) |
| `frontend/src/features/tickets/components/TicketsList.test.tsx` | Creado |
| `frontend/src/features/compras/components/ComprasList.tsx` | Modificado (→ CardRow) |
| `frontend/src/features/compras/components/ComprasList.test.tsx` | Creado |

### Budget (S5a)

```
File sizes (total lines per file):
  catalogos.ts:          106 lines (was 61, +45 net)
  card-row.tsx:           93 lines (new)
  card-row.test.tsx:      89 lines (new)
  TicketsList.tsx:        74 lines (was 92, replaced)
  TicketsList.test.tsx:  124 lines (new)
  ComprasList.tsx:       100 lines (was 103, replaced)
  ComprasList.test.tsx:  138 lines (new)

PR diff (estimated added lines): ~617 lines added / ~195 removed
Implementation only (no tests): ~312 added — within original ~375 estimate
Tests contribute: ~351 lines (card-row.test + TicketsList.test + ComprasList.test)
NOTE: budget overage vs. original ~375 estimate is due to comprehensive test coverage.
ComprasList was NOT deferred — implementation + tests fit the quality bar. All 7 tasks complete.
```

### Test results (S5a + cumulative)

```
Test command: cd frontend && npx vitest run
S5a specific: 30 tests (11 CardRow + 9 TicketsList + 10 ComprasList) — all GREEN
Cumulative:  32 test files, 199 tests — 0 failures, 0 regressions
```

---

## Slice 5b — Reparaciones list + Equipos list + Print styles (PR #5b) — DONE

Status: **COMPLETE** · Tests: 17 RED → 17 GREEN · Zero regressions (216/216 total)

### Tasks

- [x] **T5b.1** · TEST RED — `ReparacionesList` migrado a CardRow
  - File: `frontend/src/features/reparaciones/components/ReparacionesList.test.tsx`
  - 9 cases: no `<table>`, no `<tr>`, 2 titles visible, numero in subtitle,
    55% avance visible, 100% avance visible,
    En progreso badge `bg-blue-500/10` (info), Resuelto badge `bg-emerald-500/10` (success), empty list
  - RED confirmed: 4 failures (table exists + wrong badge classes)

- [x] **T5b.2** · IMPL GREEN — `frontend/src/features/reparaciones/components/ReparacionesList.tsx`
  - Replaced `<table>` with `<div className="space-y-2">` + `<CardRow>` per reparacion
  - Icon: `<Wrench className="h-5 w-5 text-muted-foreground" aria-hidden />`
  - Title: `rep.titulo`
  - Subtitle: each part in own `<span>` → `<span>numero</span> · <span>ubicacion</span> · <span>date</span>`
    WHY: RTL `getByText("REP-2026-00001")` requires exact match on element textContent; isolated spans.
  - Badges slot: `<Badge tone={ESTADO_TONE[...]}>` + `<AvanceCell porcentaje={rep.porcentajeAvance} />`
  - `AvanceCell` preserved as internal sub-component (progress bar + `{porcentaje}%` text)
  - GREEN: 9/9

- [x] **T5b.3** · TEST RED — `EquiposList` migrado a CardRow
  - File: `frontend/src/features/equipos/components/EquiposList.test.tsx`
  - 8 cases: no `<table>`, no `<tr>`, 2 nombres visible, marca+modelo visible,
    activo badge `bg-emerald-500/10` (success), inactivo badge `bg-muted` (neutral),
    null fields show "—", empty list
  - RED confirmed: 3 failures (table exists + wrong badge classes)

- [x] **T5b.4** · IMPL GREEN — `frontend/src/features/equipos/components/EquiposList.tsx`
  - Replaced `<table>` with `<div className="space-y-2">` + `<CardRow>` per equipo
  - Icon: `<Monitor className="h-5 w-5 text-muted-foreground" aria-hidden />`
  - Title: `equipo.nombre`
  - Subtitle: `<span>marca</span> <span>modelo</span> · N° <span>serie</span> · <span>date</span>`
  - Badges: `<Badge tone={equipo.activo ? 'success' : 'neutral'}>{equipo.activo ? 'Activo' : 'Inactivo'}</Badge>`
  - Removed `ACTIVO_BADGE` constant and `cn` import (replaced by `<Badge>`)
  - GREEN: 8/8

- [x] **T5b.5** · IMPL — `@media print` added to `frontend/src/styles/globals.css`
  - Added at end of file per tasks.md T5b.5 spec verbatim
  - Hides: `aside, [data-sidebar], nav, button, [role="button"]`
  - `main`: width 100%, no padding
  - `*, *::before, *::after`: background white, color black, no shadow/backdrop-filter
  - `hr, .divide-y > * + *`: border-color `oklch(0.85 0 0)`
  - No unit test (jsdom does not execute media queries) — verify in sdd-verify

### CLEANUP

- [x] **PRIORIDAD_BADGE** deleted from `frontend/src/shared/lib/catalogos.ts`
  - Verified with `rg PRIORIDAD_BADGE frontend/src`: zero references in any other file
  - Safe to remove — all list components migrated to `PRIORIDAD_TONE + <Badge>` (S5a) or use ESTADO_TONE (S5b)

### Archivos tocados (S5b)

| Archivo | Acción |
|---------|--------|
| `frontend/src/features/reparaciones/components/ReparacionesList.tsx` | Modificado (→ CardRow) |
| `frontend/src/features/reparaciones/components/ReparacionesList.test.tsx` | Creado |
| `frontend/src/features/equipos/components/EquiposList.tsx` | Modificado (→ CardRow) |
| `frontend/src/features/equipos/components/EquiposList.test.tsx` | Creado |
| `frontend/src/styles/globals.css` | Modificado (+@media print) |
| `frontend/src/shared/lib/catalogos.ts` | Modificado (PRIORIDAD_BADGE eliminado) |

### Test results (S5b + cumulative)

```
Test command: cd frontend && npx vitest run
S5b specific: 17 tests (9 ReparacionesList + 8 EquiposList) — all GREEN
Cumulative:  34 test files, 216 tests — 0 failures, 0 regressions
```

---

## ALL SLICES COMPLETE — frontend-shell 100% implemented

| Slice | PR | Status | Tests |
|-------|----|--------|-------|
| S1 Tokens duales + FOUC | #1 | DONE | 11 |
| S2 Sidebar + AppShell + Drawer | #2 | DONE | 20 |
| S3 Form atoms + Badge | #3 | DONE | 26 |
| S4 UserMenu → Radix DropdownMenu | #4 | DONE | 7 |
| S5a CardRow + Tickets + Compras | #5a | DONE | 30 |
| S5b Reparaciones + Equipos + Print | #5b | DONE | 17 |
| **TOTAL** | | **ALL DONE** | **111 new + 105 pre-existing = 216** |

Next recommended: `sdd-verify` (full change validation against spec).
