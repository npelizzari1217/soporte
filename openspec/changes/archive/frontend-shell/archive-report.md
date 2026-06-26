# Archive Report: frontend-shell

**Archived:** 2026-06-27
**Verify verdict:** PASS WITH WARNINGS — 0 CRITICAL · 4 WARNING · 3 SUGGESTION
**Suite at close:** 217/217 tests passing (34 test files) — `next build` CLEAN, 0 TS errors in source

---

## Summary

Change `frontend-shell` entregó el shell premium del dashboard y el design system v2. Reemplazó el
top-nav horizontal (`app-nav.tsx`) por un sidebar izquierdo `w-72` (Lucide, ítem activo sutil,
drawer mobile, UserMenu con Radix DropdownMenu), migró los tokens de dark-only a modo dual
(`.dark` strategy, FOUC prevenido con script inline bloqueante), y promovió los átomos globales
de formulario (`<Input>`, `<Label>`, `<Select>`, `<Badge>`, `<CardRow>`) que servirán de contrato
para los CRUDs futuros. Los 4 listados del dominio fueron migrados de `<table>` a filas-tarjeta.

---

## Slices Delivered

| Slice | PR | Tests (nuevos) | Acumulado | Estado |
|-------|----|----------------|-----------|--------|
| S1 — Tokens duales + FOUC | #1 | 11 | 116 | DONE |
| S2 — Sidebar + AppShell + Drawer | #2 | 20 | 136 | DONE |
| S3 — Form atoms + Badge | #3 | 26 | 162 | DONE |
| S4 — UserMenu → Radix DropdownMenu | #4 | 7 | 169 | DONE |
| S5a — CardRow + Tickets + Compras | #5a | 30 | 199 | DONE |
| S5b — Reparaciones + Equipos + Print | #5b | 17 | 216 | DONE |
| Cleanup post-verify (backdrop-blur sidebar + borrado app-nav.tsx) | — | 1 | 217 | DONE |
| **TOTAL** | **6 PRs** | **111 nuevos** | **217** | **ALL DONE** |

TDD cycle confirmado: cada slice abrió con RED (module not found o clases incorrectas) antes de GREEN.

---

## Verify Findings Summary

**0 CRITICAL** — el change es shippable.

| ID | Tipo | Estado en archive |
|----|------|-------------------|
| W1 | 25 errores TS en test files (`vi.fn` generics, `React.ReactElement.props`) | Deuda registrada — ver follow-ups |
| W2 | Sidebar missing `backdrop-blur-sm` | RESUELTO en cleanup pre-archive |
| W3 | Tenant display PARCIAL — fallback "Soporte" + inicial email | Follow-up `auth-cliente-nombre` |
| W4 | `@media print` y CSS responsive no verificables en jsdom | E2E deferred — ver follow-ups |
| S3 | `app-nav.tsx` en disco como rollback | RESUELTO — borrado en cleanup pre-archive |

---

## Specs Promoted / Merged

### Nueva capability canónica

| Path | Descripción |
|------|-------------|
| `openspec/specs/frontend-shell/spec.md` | Arquitectura del shell — sidebar w-72, layout flex-row, nav 4 secciones, tenant display, UserMenu, drawer responsive, a11y |

Copiada verbatim desde `openspec/changes/archive/frontend-shell/specs/frontend-shell/spec.md`.

### Delta mergeado en canónica existente

**`openspec/specs/frontend-design-system/spec.md`** — actualización mayor:

| Cambio | Resolución del conflicto |
|--------|--------------------------|
| Req "Dark mode como tema por defecto" (dark-only) | **SUPERADO** y reemplazado por "Modo dual (claro + oscuro) via estrategia `.dark`". La línea "No hay modo light — dark es el único tema obligatorio" fue eliminada. La canónica ya no tiene contradicción. |
| Inputs/forms: `rounded-md` → `rounded-xl` | Scenario de inputs actualizado a `rounded-xl` (12px). Req 3 de variables agrega `--radius-xl: 0.75rem`. |
| Glassmorphism | Nuevo requirement agregado con escenarios dark/light. |
| Tipografía Inter | Nuevo requirement de fuente global. |
| Átomos de formulario premium (`<Input>`, `<Label>`, `<Select>`) | Nuevo requirement. Complementa (no reemplaza) los átomos del change `frontend-fundacion` (Skeleton, EmptyState, Button). |
| Badges translúcidos 5 tonos | Nuevo requirement con tabla de paleta semántica. |
| Patrón filas-tarjeta | Nuevo requirement — `<CardRow>` en `@/components/ui` (Scope Rule §2). |
| `@media print` | Nuevo requirement. |
| Átomos sin cambio (Skeleton/EmptyState/Button loading) | MANTENIDOS intactos — sin modificación. |

---

## Follow-ups (deuda conocida — no bloquean este change)

### 1. `auth-cliente-nombre` (próximo change — ALTA PRIORIDAD)

**Origen:** W3 / Req 4 PARCIAL del spec `frontend-shell`.
**Problema:** El sidebar muestra el brand "Soporte" + inicial del email como fallback de tenant.
`clienteNombre` no existe en `JwtPayload` todavía.
**Solución:** Enriquecer el login para exponer `clienteNombre` en el JWT (ya está cargado en
`login.use-case.ts:100`, sin costo adicional). El sidebar lo consume desde `useSession()`.
**Impacto:** Resuelve Req 4 / Scenario 1 del spec `frontend-shell` que quedó PARCIAL.

### 2. TypeScript test-file debt (W1)

**Problema:** 25 errores de TypeScript en 4 archivos de test bajo strict mode:
- `vi.fn<[], string>` — inferencia de generics cambió en versiones recientes de Vitest types.
  Corregir con `vi.fn(() => value)` sin generics o cast explícito.
- `React.ReactElement.props` typed as `{}` bajo strict — usar cast a interfaz explícita.
**Impacto:** cero riesgo en producción; tests pasan. Resolver antes de que la deuda acumule.

### 3. E2E Playwright (W4)

**Casos pendientes que jsdom no puede verificar:**
- FOUC de tema: `frontend/e2e/theme-fouc.spec.ts` — sin localStorage → dark al recargar; `theme=light` → sin clase `.dark`; sin flash perceptible.
- `@media print`: `frontend/e2e/print-styles.spec.ts` con `page.emulateMedia('print')`.
- Responsive layout: sidebar visible en 1280px, oculto en 375px; drawer accesible.

### 4. CRUD de negocio (changes futuros)

El backend ya tiene todos los endpoints de creación/edición/borrado para tickets, equipos, compras
y reparaciones. El design system v2 de este change es el contrato visual que consumirán. Changes
propuestos sobre esta base:
- `crud-tickets` — crear/editar/cerrar tickets
- `crud-compras` — crear/aprobar/rechazar compras
- `crud-reparaciones` — crear/actualizar avance/cerrar reparaciones
- `crud-equipos` — alta/baja/modificación de equipos

---

## Files Changed / Created (resumen)

### Nuevos archivos de código (frontend)

| Archivo | Descripción |
|---------|-------------|
| `frontend/src/shared/theme/resolve-theme.ts` | Función pura para resolución de tema (testeable) |
| `frontend/src/components/shell/sidebar.tsx` | Sidebar w-72, nav Lucide, active state, tenant fallback |
| `frontend/src/components/shell/app-shell.tsx` | Client wrapper: sidebar desktop + hamburger + drawer |
| `frontend/src/shared/lib/badge-tones.ts` | Paleta de 5 tonos semánticos tipada |
| `frontend/src/components/ui/input.tsx` | Átomo Input — `rounded-xl`, forwardRef, error variant |
| `frontend/src/components/ui/label.tsx` | Átomo Label — `text-xs tracking-wider uppercase` |
| `frontend/src/components/ui/select.tsx` | Átomo Select — Radix, trigger `rounded-xl`, panel `rounded-md` |
| `frontend/src/components/ui/badge.tsx` | Badge — `rounded-md`, 5 tonos via `cva` |
| `frontend/src/components/ui/card-row.tsx` | CardRow — glassmorphism, slots icon/title/badges |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `frontend/src/styles/globals.css` | Tokens duales + `--radius-xl` + Inter + `@media print` |
| `frontend/src/app/layout.tsx` | Script FOUC inline + `suppressHydrationWarning` |
| `frontend/src/app/(dashboard)/layout.tsx` | AppShell reemplaza AppNav |
| `frontend/src/components/shell/user-menu.tsx` | Radix DropdownMenu (click-outside + ESC) |
| `frontend/src/shared/lib/catalogos.ts` | `+ESTADO_TONE`, `+PRIORIDAD_TONE`, `-PRIORIDAD_BADGE` |
| `frontend/src/features/tickets/components/TicketsList.tsx` | Migrado a CardRow |
| `frontend/src/features/compras/components/ComprasList.tsx` | Migrado a CardRow |
| `frontend/src/features/reparaciones/components/ReparacionesList.tsx` | Migrado a CardRow |
| `frontend/src/features/equipos/components/EquiposList.tsx` | Migrado a CardRow |
| `frontend/package.json` | `+@radix-ui/react-dropdown-menu`, `+@radix-ui/react-select` |
| `frontend/vitest.setup.ts` | jsdom polyfills para Radix (hasPointerCapture, ResizeObserver, etc.) |

### Archivos eliminados

| Archivo | Razón |
|---------|-------|
| `frontend/src/components/shell/app-nav.tsx` | Reemplazado por sidebar (eliminado en cleanup post-verify) |

### Specs openspec

| Acción | Path |
|--------|------|
| CREADA (nueva capability) | `openspec/specs/frontend-shell/spec.md` |
| MERGEADA (delta → canónica) | `openspec/specs/frontend-design-system/spec.md` |

---

## Observation IDs (Engram Traceability)

| Artefacto | Topic Key | Observation ID |
|-----------|-----------|----------------|
| sdd/frontend-shell/proposal | sdd/frontend-shell/proposal | (ver engram) |
| sdd/frontend-shell/spec | sdd/frontend-shell/spec | (ver engram) |
| sdd/frontend-shell/design | sdd/frontend-shell/design | (ver engram) |
| sdd/frontend-shell/tasks | sdd/frontend-shell/tasks | (ver engram) |
| sdd/frontend-shell/apply-progress | sdd/frontend-shell/apply-progress | (ver engram) |
| sdd/frontend-shell/verify-report | sdd/frontend-shell/verify-report | (ver engram) |
| sdd/frontend-shell/archive-report | sdd/frontend-shell/archive-report | (guardado al archivar) |

---

## Change Location

Todos los artefactos del change (proposal, design, specs delta, tasks, apply-progress, verify-report,
archive-report) están en:
`openspec/changes/archive/frontend-shell/`
