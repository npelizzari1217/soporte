# Design: Frontend Shell Premium + Design System v2

> Change: `frontend-shell` · Phase: design · Store: hybrid · 2026-06-26
> Reads: proposal.md, explore.md, CLAUDE.md §2/§3/§5/§7

## Technical Approach

Cambio de **composición**, no de lógica de negocio (Opción B). El shell pasa de top-nav a sidebar `w-72` fijo; los tokens se vuelven duales con la estrategia canónica de Tailwind v4 + Shadcn (`@theme inline` + `:root`/`.dark`); el FOUC se elimina con un script bloqueante en el root layout. Se promueven átomos de UI globales (Scope Rule §2: 2+ features) que son el contrato del CRUD futuro. Todo se entrega en slices stacked < 400 líneas, cada uno abierto por un test RED (Test-First §4/§5).

---

## Architecture Decisions

### D1 — Mecanismo de tokens duales (Tailwind v4 CSS-first)

| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| Valores estáticos en `@theme` por modo | `@theme` emite valores fijos en `:root` — NO se pueden flipear en runtime | Rechazado |
| `dark:` variant en cada componente | Duplica clases en todo el árbol; rompe componentes que ya usan utilidades semánticas (`bg-card`) | Rechazado |
| **`@theme inline` + `:root`(light)/`.dark`(dark)** | Indirección: la utilidad referencia una var que flipea por selector → cambio en runtime, cero cambios en componentes existentes | **Elegido** |

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme {                /* tokens estáticos: radios, fuente */
  --radius-lg: 0.75rem; --radius-xl: 0.75rem;   /* forms 12px */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}
@theme inline {         /* mapea utilidades → vars indirectas */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card); /* …resto de tokens semánticos */
}
:root {  /* LIGHT (alto contraste WCAG AA) */
  --background: oklch(0.99 0 0); --foreground: oklch(0.20 0 0);
  --card: oklch(1 0 0); /* … */
}
.dark {  /* DARK = slate-950 cinematográfico */
  --background: oklch(0.16 0 0); --foreground: oklch(0.97 0 0);
  --card: oklch(0.19 0 0); /* … (migra los valores actuales) */
}
```

**Rationale**: es el patrón oficial de Shadcn v4 → los componentes (`Button`, `Skeleton`, etc.) consumen `bg-card`/`text-foreground` SIN cambios; solo flipea la clase `.dark`. Glassmorphism se expresa con `border-white/5` (dark) y `border-slate-200/50` (light) en las cards, no como token.

### D2 — Default de tema y `prefers-color-scheme`

Constitución §3 = "oscura por defecto". `:root` aloja LIGHT; el script aplica `.dark` salvo preferencia explícita `light`. Sin JS (o sin preferencia), el SSR ya emite `dark` → primer paint cinematográfico garantizado.

### D3 — Sidebar como Client Component

`usePathname` exige client boundary. El layout `(dashboard)` sigue siendo Server Component (lee cookie `at`, hidrata `initialUser`); la interactividad (active state, drawer) baja a `app-shell.tsx` (client). El tenant se lee de `useSession()` (ya hidratado), sin prop-drilling.

### D4 — Drawer mobile: mismo componente, dos presentaciones

Un solo `Sidebar`; en `< md` (768px) se oculta y un `app-shell.tsx` client renderiza hamburger + drawer con overlay. Estado `useState(open)` vive en `AppShell` (no en el layout server).

### D5 — UserMenu → `@radix-ui/react-dropdown-menu`

| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| Custom + `onClickOutside` manual | Reimplementa ESC, focus trap, portal, a11y; frágil | Rechazado |
| **Radix DropdownMenu** | +1 dep; resuelve click-outside, ESC, roving focus, `aria-*`, portal | **Elegido** |

### D6 — Form atoms y CardRow son globales (Scope Rule §2)

Input/Label/Select/Badge/CardRow los usarán 4+ features → viven en `@/components/ui`, no en una feature. `Select` se construye sobre `@radix-ui/react-select` (listbox accesible, coherente con D5). Input/Label envuelven elementos nativos con `forwardRef` + `cva` + `cn`, igual que `Button`.

### D7 — Seguridad por diseño (§7)

El header del sidebar muestra SOLO el `cliente_id` del JWT del propio usuario (`useSession()`); nunca consulta ni lista otros tenants. Sin switcher. Ver Open Questions sobre nombre amigable.

---

## FOUC Script — Contrato (root `layout.tsx`, NO el de dashboard)

Inline bloqueante en `<head>` vía `dangerouslySetInnerHTML`. `<html lang="es" suppressHydrationWarning>` (la clase se muta antes de hidratar → sin esto, warning de mismatch).

```js
(function () {
  try {
    var p = localStorage.getItem('theme');                 // 'light'|'dark'|null
    var sysLight = matchMedia('(prefers-color-scheme: light)').matches;
    var t = p || (sysLight ? 'light' : 'dark');             // default §3: dark
    document.documentElement.classList.toggle('dark', t !== 'light');
    document.documentElement.dataset.theme = t;
  } catch (e) { document.documentElement.classList.add('dark'); }
})();
```

**Contrato**: clave `theme` ∈ {`light`,`dark`}; orden de resolución localStorage → `prefers-color-scheme` → default `dark`; corre síncrono antes del paint del body; setea `.dark` (variant Tailwind) y `data-theme` (debug). La lógica pura se extrae a `resolveTheme(pref, systemPrefersLight): 'light'|'dark'` para test RED unitario. Toggle UI = follow-up (solo escribe `localStorage.theme` + togglea la clase).

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/styles/globals.css` | Modify | `@theme inline` + `:root`/`.dark` duales, `--radius-xl`, `--font-sans` Inter |
| `frontend/src/app/layout.tsx` | Modify | script FOUC + `suppressHydrationWarning`; quita `className="dark"` hardcode |
| `frontend/src/shared/theme/resolve-theme.ts` | Create | helper puro `resolveTheme()` (testeable) |
| `frontend/src/components/shell/sidebar.tsx` | Create | nav lateral (header tenant + Lucide + active + footer UserMenu) |
| `frontend/src/components/shell/app-shell.tsx` | Create | client wrapper: desktop sidebar + hamburger + drawer/overlay |
| `frontend/src/app/(dashboard)/layout.tsx` | Modify | flex-col → flex-row; `<AppShell>{children}</AppShell>` |
| `frontend/src/components/shell/app-nav.tsx` | Delete | reemplazado (mantener hasta verify) |
| `frontend/src/components/shell/user-menu.tsx` | Modify | migrar a Radix DropdownMenu |
| `frontend/src/components/ui/{input,label,select,badge,card-row}.tsx` | Create | átomos premium globales |
| `frontend/src/features/{tickets,compras,reparaciones,equipos}/components/*List.tsx` | Modify | tabla → `<CardRow>` + `<Badge>` translúcidos |
| `package.json` | Modify | `@radix-ui/react-dropdown-menu`, `@radix-ui/react-select` |

---

## Interfaces / Contracts

```ts
// @/components/ui/input.tsx — rounded-xl, focus ring, estado error
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { error?: boolean }
// @/components/ui/label.tsx — uppercase text-xs tracking-wider text-muted-foreground
interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}
// @/components/ui/select.tsx — sobre @radix-ui/react-select, rounded-xl
interface SelectProps {
  value?: string; onValueChange?: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean;
}
// @/components/ui/badge.tsx — cva tones translúcidos, rounded-md (no pill)
type BadgeTone = 'neutral' | 'warning' | 'success' | 'danger'; // amber/emerald/red /10
// @/components/ui/card-row.tsx — fila-tarjeta reutilizable (4 listados)
interface CardRowProps {
  icon?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode;
  badges?: React.ReactNode; onClick?: () => void;
}
```

---

## Testing Strategy (Test-First, atómico §5)

| Pieza | Layer | RED test (abre el slice) | Mock / no-mock |
|-------|-------|--------------------------|----------------|
| `resolveTheme()` | Unit | `(null,true)→'light'`, `('dark',true)→'dark'`, `(null,false)→'dark'` | puro, sin mocks |
| FOUC script | Unit/render | el script está en `<head>` (string contiene `classList.toggle`) | render root, sin DOM mutado |
| Sidebar | Unit RTL | links + active state para `pathname` actual | mock `usePathname`, `useSession` |
| Drawer | Unit RTL | abre con hamburger; cierra con ESC, overlay y cambio de ruta | `user-event`, mock `usePathname` |
| Input/Label/Select | Unit RTL | Input tiene `rounded-xl`; Label `uppercase`; Select emite `onValueChange` | sin over-mock; Radix real |
| Badge/CardRow | Unit RTL | tono translúcido correcto; CardRow renderiza icon/title/badges | render directo, props puras |
| UserMenu | Unit RTL | **click fuera cierra el menú** (FALLA hoy) → GREEN con Radix | mock `useSession`, spy `fetch` (sin MSW) |
| FOUC + drawer real | E2E (opt.) | sin flash al recargar; drawer accesible | Playwright, capa fina §5.3 |

MSW solo si un test toca un fetch real de datos; logout se cubre con spy de `fetch` (atómico). No e2e obligatorio salvo el FOUC, candidato de alto valor.

---

## Slice Plan (stacked < 400 líneas, auto-chain)

```
S1 (tokens+FOUC) ──┬──► S2 (sidebar+shell+drawer) ──► S4 (UserMenu Radix)
                   └──► S3 (form atoms+Badge) ─────► S5 (CardRow + 4 listados)
```

| # | Slice | RED primero | Dep | ~Líneas |
|---|-------|-------------|-----|---------|
| S1 | Tokens duales + FOUC | `resolveTheme()` unit + script-en-head | — | ~150 |
| S2 | Sidebar + AppShell + drawer + layout flex-row | active state + drawer ESC/overlay | S1 | ~300 |
| S3 | Input/Label/Select + Badge | rounded-xl / uppercase / onValueChange / tone | S1 | ~280 |
| S4 | UserMenu → Radix | click-outside cierra | S2 | ~120 |
| S5 | CardRow + migración 4 listados | CardRow render + cada lista usa CardRow | S3 | ~350 (split 5a/5b si >400) |

Orden stacked lineal: S1 → S2 → S3 → S4 → S5. S5 se parte en 5a (CardRow+Badge+2 listas) y 5b (2 listas) si excede el presupuesto.

---

## Migration / Rollout

Cada slice es un PR stacked aislado y revertible. `app-nav.tsx` se mantiene hasta verify (rollback del sidebar restaura top-nav). Tokens viven en `globals.css`; revertir el bloque restaura dark-only. La migración de listados es por-archivo. No requiere migración de datos.

## Open Questions

- [ ] Nombre amigable del tenant: el JWT solo trae `cliente_id`. ¿Se muestra el id, o se agrega un query use case para el nombre del cliente? (default: mostrar `cliente_id`, resolver en follow-up del CRUD).
- [ ] ¿Se incluye un toggle de tema visible en este change, o se posterga? (proposal lo deja fuera; el script ya soporta la preferencia).
- [ ] Confirmar paleta light exacta (valores oklch) para cumplir WCAG AA — se afina en S1.
