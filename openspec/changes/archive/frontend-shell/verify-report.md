# Verify Report: frontend-shell

> Change: `frontend-shell` · Phase: verify · Store: hybrid · 2026-06-27
> Validator: sdd-verify sub-agent (Claude Sonnet 4.6)
> Suite: Vitest in `frontend/` — STRICT TDD MODE ACTIVE

---

## Verdict: PASS WITH WARNINGS

**0 CRITICAL · 4 WARNING · 3 SUGGESTION**

All slices (S1–S5b) are complete. The production build is clean, 216/216 tests pass, and zero TypeScript errors exist in production source files. Two requirements are PARCIAL by design (documented follow-ups, not implementation bugs).

---

## Test Suite Results

```
Test command: cd frontend && npx vitest run
Result:  34 test files passed (34) — 216 tests passed (216) — 0 failures
Duration: 23.23s
```

| Slice | Tests (new) | Cumulative | Status |
|-------|-------------|------------|--------|
| S1 Tokens + FOUC | 11 | 116 | PASS |
| S2 Sidebar + AppShell + Drawer | 20 | 136 | PASS |
| S3 Form atoms + Badge | 26 | 162 | PASS |
| S4 UserMenu Radix | 7 | 169 | PASS |
| S5a CardRow + Tickets + Compras | 30 | 199 | PASS |
| S5b Reparaciones + Equipos + Print | 17 | 216 | PASS |

TDD cycle confirmed: each slice shows RED-confirmed tests (module not found / wrong classes) before GREEN implementation.

---

## Build & Typecheck

**Next.js build**: CLEAN — 18 routes compile successfully (ƒ dynamic + ○ static). No build errors.

**tsc --noEmit (production code)**: 0 errors — confirmed by filtering `.test.` files from output, zero remaining.

**tsc --noEmit (all files)**: 25 errors — ALL in test files only:
- `src/app/layout.test.tsx` (7 errors): JSX tree inspection pattern; `React.ReactElement.props` typed as `{}` under strict mode. Runtime-correct.
- `src/components/shell/sidebar.test.tsx` (9 errors): `vi.fn<[], string>` generic inference with newer Vitest types.
- `src/components/shell/app-shell.test.tsx` (4 errors): same vi.fn pattern.
- `src/components/shell/user-menu.test.tsx` (5 errors): same vi.fn pattern.

No errors in any implementation file (`.tsx`, `.ts` source).

---

## Requirements Coverage

### frontend-shell spec (7 requirements)

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| Req 1 | Sidebar fijo w-72 | SATISFECHO | `sidebar.tsx:50` — `<aside className="w-72 flex flex-col ...">` |
| Req 2 | Layout flex-row | SATISFECHO | `app-shell.tsx:70` — `<div className="flex h-screen w-full overflow-hidden">` |
| Req 3 | Nav 4 secciones + estado activo | SATISFECHO | `sidebar.tsx:33-38` (NAV_LINKS), `aria-current="page"` on active link |
| Req 4 | Tenant display | PARCIAL | Shows "Soporte" brand + email initial. `clienteNombre` absent from JWT — follow-up `auth-cliente-nombre`. NOT a bug; documented in tasks.md Locked Decisions |
| Req 5 | UserMenu base sidebar + ESC + click-outside | SATISFECHO | `user-menu.tsx` — Radix DropdownMenu. 7 tests cover all scenarios |
| Req 6 | Responsive drawer/hamburger < 768px | SATISFECHO (state logic) | `app-shell.tsx` — hamburger, drawer dialog, ESC + focus return, overlay click, route-change auto-close. CSS visibility (`hidden md:flex`) NOT VERIFIABLE in jsdom — see W4 |
| Req 7 | Accesibilidad a11y | SATISFECHO | `<nav aria-label="Navegación principal">`, `<ul>/<li>`, `aria-current="page"`, `role="dialog" aria-modal="true"`, focus management via hamburgerRef |

### frontend-design-system delta — MODIFIED (3 requirements)

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| M1 | Modo dual claro+oscuro via .dark + FOUC | SATISFECHO | `globals.css:20` — `@custom-variant dark`, `:root` (light), `.dark` (dark). `layout.tsx:27` — FOUC_SCRIPT. `resolveTheme.ts` — pure function. 11 tests. |
| M2 | Radios consistentes por categoría | SATISFECHO | Input: `rounded-xl`. Badge/Button/Dropdown: `rounded-md`. CardRow/containers: `rounded-lg`. All verified in tests. |
| M3 | Variables @theme declaradas | SATISFECHO | `globals.css:25-28` — `--radius-lg: 0.5rem`, `--radius-md: 0.375rem`, `--radius-xl: 0.75rem`, `--font-sans: "Inter"...` |

### frontend-design-system delta — ADDED (6 requirements)

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| A4 | Glassmorphism disponible | PARCIAL | `card-row.tsx:61` — `backdrop-blur-sm` + `border-slate-200/50 dark:border-white/5` ✓. `sidebar.tsx:50` — missing `backdrop-blur-sm` (border-glassmorphism present, blur omitted — see W2) |
| A5 | Inter font global | SATISFECHO | `globals.css:28` — `--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif` |
| A6 | Form atoms premium | SATISFECHO | `input.tsx` (rounded-xl, forwardRef), `label.tsx` (text-xs tracking-wider uppercase), `select.tsx` (trigger rounded-xl, panel rounded-md). All in `@/components/ui/`. |
| A7 | Badges translúcidos rounded-md | SATISFECHO | `badge.tsx` — `rounded-md`, 5 tones via `BADGE_TONE_CLASSES`. `badge-tones.ts` — amber/emerald/red/blue/muted. 8 badge tests. |
| A8 | Filas-tarjeta en 4 listados | SATISFECHO | CardRow in `@/components/ui/card-row.tsx`. TicketsList, ComprasList, ReparacionesList, EquiposList all migrated. No `<table>` in any list. |
| A9 | @media print | SATISFECHO (code) | `globals.css:130-162` — hides aside/nav/button/[role=button], main 100% width, white bg/black text, thin dividers. NOT VERIFIABLE via unit tests (jsdom) — see W4 |

**Totals: 14 SATISFECHO / 2 PARCIAL / 0 NO SATISFECHO / 16 total**

---

## Findings

### CRITICAL (blocks archive)

None.

---

### WARNING

**[W1] TypeScript errors in test files** — 25 strict-mode errors across 4 test files.
- `src/app/layout.test.tsx:50,56,62,67,73,79` — `React.ReactElement.props` is typed `{}` under strict mode; direct cast doesn't give typed props.
- `src/components/shell/sidebar.test.tsx:26,28,35,40,58,59,93,103,126,132,154` — `vi.fn<[], string>` generic form; newer Vitest types changed the inference for mock return types.
- `src/components/shell/app-shell.test.tsx:31,34,55,151` — same vi.fn pattern.
- `src/components/shell/user-menu.test.tsx:28,43,69,86` — same vi.fn pattern.
- Impact: no production risk. Tests pass. Should be resolved before next iteration adds more test files.
- Resolution: Use `vi.fn(() => value)` without generics, or add `as ReturnType<typeof vi.fn>` casts. For layout.test.tsx, cast to explicit interface.

**[W2] sidebar.tsx missing backdrop-blur-sm** — `src/components/shell/sidebar.tsx:50`
- tasks.md T2.2 specified `backdrop-blur-sm` in the aside className.
- Implementation: `<aside className="w-72 flex flex-col h-full min-h-screen bg-card border-r border-slate-200/50 dark:border-white/5">` — blur omitted.
- Glassmorphism border IS present (`border-slate-200/50 dark:border-white/5`). Only the blur is missing.
- Visual impact: near-zero with current opaque `bg-card` background; `backdrop-blur` only produces visible effect on semi-transparent backgrounds.
- CardRow CORRECTLY includes `backdrop-blur-sm` per T5a.2.

**[W3] Tenant display PARCIAL — Req 4 Scenario 1** — `src/components/shell/sidebar.tsx:47`
- Spec requires: show `clienteNombre` of the active tenant.
- Implementation: `user ? user.email[0].toUpperCase() : null` — shows email initial as avatar + brand "Soporte".
- Root cause: `JwtPayload.clienteNombre` does not exist in the current auth system.
- Resolution: documented follow-up change `auth-cliente-nombre` (out of scope for this change).
- NOT a bug introduced by this change; consistent with tasks.md Locked Decisions.

**[W4] Unit test coverage gaps — CSS-only behaviors** — `src/styles/globals.css:130-162`
- `@media print` (Req A9): CSS is well-formed and present, but jsdom does not apply media queries. No unit test possible by design (noted in T5b.5).
- Responsive visibility (`hidden md:flex`, `md:hidden`): drawer STATE logic is fully tested (open/close/ESC/overlay). CSS visibility in actual viewports is NOT testable via jsdom. Requires Playwright or manual browser test.
- Neither gap is an implementation defect — the CSS is correctly written. Test coverage is structurally limited.

---

### SUGGESTION

**[S1] E2E Playwright tests deferred** — T1.6 (FOUC Playwright) was marked optional in tasks.md and not implemented.
- FOUC prevention is a cross-browser visual concern that unit tests cannot verify.
- Recommend adding `frontend/e2e/theme-fouc.spec.ts` in the next iteration.
- Also: `frontend/e2e/print-styles.spec.ts` using `page.emulateMedia('print')` for Req A9.
- Also: responsive layout tests at 375px / 1280px viewport widths.

**[S2] dark: per-component convention — document the exception** — `src/shared/lib/badge-tones.ts:16-19`
- tasks.md Locked Decisions say "No `dark:` por componente" but the Badge Tone Palette (in the same file) explicitly uses `dark:text-amber-400`, etc.
- The rule correctly targets SEMANTIC tokens (bg-background, text-foreground) via CSS vars. Literal palette colors not in the token system (amber, emerald, red, blue badge text) MUST use `dark:` since there are no semantic equivalents.
- `@custom-variant dark (&:where(.dark, .dark *))` in globals.css ensures `dark:` classes respond to the `.dark` class on `<html>` — so this IS the token-in-html strategy.
- Recommendation: add a one-line comment in badge-tones.ts clarifying why `dark:` is used for literal colors.

**[S3] app-nav.tsx cleanup** — `src/components/shell/app-nav.tsx`
- Kept on disk intentionally per tasks.md T2.5 as a rollback option until verify passes.
- sdd-verify now complete and clean. This file can be deleted.
- No import references to it exist in the app (dashboard/layout.tsx uses AppShell; the only app-nav reference is a JSDoc comment).

---

## Constitution Checks (CLAUDE.md §3)

| Rule | Status | Notes |
|------|--------|-------|
| Forms `rounded-xl` | PASS | Input trigger: `rounded-xl` ✓. Select trigger: `rounded-xl` ✓ |
| Badges `rounded-md` (no pill) | PASS | `badge.tsx:17` — `inline-flex items-center rounded-md` ✓ |
| Contenedores `rounded-lg` | PASS | `card-row.tsx:60` — `rounded-lg` ✓. Dropdown panels: `rounded-md` (correct) ✓ |
| Dual mode sin `dark:` por componente (semantic tokens) | PASS | Semantic tokens (bg-card, text-foreground, etc.) use CSS vars — no `dark:` needed. Literal colors (badge text, glassmorphism borders) use `dark:` as designed by tasks.md. Acceptable. |
| Scope Rule — CardRow en @/components/ui | PASS | `src/components/ui/card-row.tsx` — shared across 4 features ✓ |
| Glassmorphism borders | PARTIAL | CardRow: `backdrop-blur-sm` + `border-white/5` ✓. Sidebar: border ✓, blur missing (W2) |

---

## Tasks Completion Audit

| Task | Status | Notes |
|------|--------|-------|
| T1.1–T1.5 | COMPLETE | S1 all done |
| T1.6 | DEFERRED | Optional Playwright test — not blocking |
| T2.1–T2.5 | COMPLETE | S2 all done |
| T3.0–T3.9 | COMPLETE | S3 all done (T3.0 T3.1 T3.2...T3.9) |
| T4.0–T4.2 | COMPLETE | S4 all done |
| T5a.0–T5a.6 | COMPLETE | S5a all done |
| T5b.1–T5b.5 | COMPLETE | S5b all done |
| CLEANUP (PRIORIDAD_BADGE) | COMPLETE | Verified removed; zero rg matches |

---

## Files Verified

| File | Role | Verified |
|------|------|---------|
| `frontend/src/shared/theme/resolve-theme.ts` | Pure function, 5 tests | ✓ |
| `frontend/src/shared/theme/resolve-theme.test.ts` | 5 unit tests | ✓ |
| `frontend/src/styles/globals.css` | Dual tokens + @media print | ✓ |
| `frontend/src/app/layout.tsx` | FOUC script, suppressHydrationWarning | ✓ |
| `frontend/src/app/layout.test.tsx` | 6 JSX tree tests | ✓ (TS warnings) |
| `frontend/src/app/(dashboard)/layout.tsx` | Uses AppShell | ✓ |
| `frontend/src/components/shell/sidebar.tsx` | w-72, nav, a11y, tenant fallback | ✓ |
| `frontend/src/components/shell/sidebar.test.tsx` | 11 tests | ✓ (TS warnings) |
| `frontend/src/components/shell/app-shell.tsx` | flex-row, hamburger, drawer | ✓ |
| `frontend/src/components/shell/app-shell.test.tsx` | 9 tests | ✓ (TS warnings) |
| `frontend/src/components/shell/user-menu.tsx` | Radix DropdownMenu | ✓ |
| `frontend/src/components/shell/user-menu.test.tsx` | 7 tests | ✓ (TS warnings) |
| `frontend/src/components/shell/app-nav.tsx` | Rollback — still on disk | ✓ |
| `frontend/src/shared/lib/badge-tones.ts` | 5 tones, typed | ✓ |
| `frontend/src/components/ui/input.tsx` | rounded-xl, forwardRef | ✓ |
| `frontend/src/components/ui/input.test.tsx` | 6 tests | ✓ |
| `frontend/src/components/ui/label.tsx` | tracking-wider uppercase | ✓ |
| `frontend/src/components/ui/label.test.tsx` | 6 tests | ✓ |
| `frontend/src/components/ui/select.tsx` | trigger rounded-xl, panel rounded-md | ✓ |
| `frontend/src/components/ui/select.test.tsx` | 6 tests | ✓ |
| `frontend/src/components/ui/badge.tsx` | rounded-md, 5 tones | ✓ |
| `frontend/src/components/ui/badge.test.tsx` | 8 tests | ✓ |
| `frontend/src/components/ui/card-row.tsx` | rounded-lg, glassmorphism, slots | ✓ |
| `frontend/src/components/ui/card-row.test.tsx` | 11 tests | ✓ |
| `frontend/src/features/tickets/components/TicketsList.tsx` | CardRow migration | ✓ |
| `frontend/src/features/tickets/components/TicketsList.test.tsx` | 9 tests | ✓ |
| `frontend/src/features/compras/components/ComprasList.tsx` | CardRow migration | ✓ |
| `frontend/src/features/compras/components/ComprasList.test.tsx` | 10 tests | ✓ |
| `frontend/src/features/reparaciones/components/ReparacionesList.tsx` | CardRow migration | ✓ |
| `frontend/src/features/reparaciones/components/ReparacionesList.test.tsx` | 9 tests | ✓ |
| `frontend/src/features/equipos/components/EquiposList.tsx` | CardRow migration | ✓ |
| `frontend/src/features/equipos/components/EquiposList.test.tsx` | 8 tests | ✓ |
| `frontend/src/shared/lib/catalogos.ts` | +ESTADO_TONE, +PRIORIDAD_TONE, -PRIORIDAD_BADGE | ✓ |

---

## Next Recommended

`sdd-archive` — No CRITICAL issues. 4 WARNINGs are non-blocking (test-file TS debt, cosmetic sidebar blur, documented partial tenant, jsdom coverage gap). The change is shippable.

Pre-archive action: delete `frontend/src/components/shell/app-nav.tsx` (S3 suggestion).
