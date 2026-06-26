# Proposal: Frontend Shell Premium + Design System v2

## Intent

El shell del dashboard (top-nav `app-nav.tsx`) se construyó sin spec y no refleja la dirección "Super Premium" de la constitución (§3). La nav horizontal no escala ni se alinea con Stripe/Linear (sidebar). El spec `frontend-design-system` impone dark-only y `rounded-md` en forms, contradiciendo la constitución actualizada (modo dual, forms `rounded-xl`). Esta brecha bloquea todo CRUD futuro: sin un design system v2 y un shell premium, cada feature de mutación reinventaría estilo. Resolverlo ahora establece el contrato visual que las features consumirán.

## Scope

### In Scope
- Reemplazar top-nav por **sidebar izquierdo `w-72`** (Lucide, item activo sutil); `(dashboard)/layout.tsx` flex-col → flex-row.
- **Design system v2**: spec dual mode (`.dark`, oscuro `slate-950`), glassmorphism, forms `rounded-xl`, labels uppercase `text-xs tracking-wider`.
- Definir **átomos de formulario** (Input, Label, Select/combobox) premium — contrato para el CRUD futuro, aunque el shell casi no use forms.
- **Migrar los 4 listados** (Tickets/Compras/Reparaciones/Equipos) a filas-tarjeta, dual mode, badges translúcidos.
- Resolver bug `UserMenu` click-outside (evaluar Radix DropdownMenu).

### Out of Scope
- **CRUD de negocio** (crear/editar/borrar tickets, equipos, compras, reparaciones). Backend ya tiene endpoints; el frontend de mutaciones es un change separado que se construye ENCIMA de este design system.
- Tenant switcher / multi-tenant switching logic (solo display, ver pendientes).
- Sidebar colapsable como iteración posterior (Opción C de la exploración).

## Capabilities

### New Capabilities
- `frontend-shell`: arquitectura de información del dashboard — sidebar `w-72`, layout flex-row, item activo, responsive < 768px, display de tenant activo, posición del UserMenu.

### Modified Capabilities
- `frontend-design-system`: dual mode reemplaza dark-only (supera línea 13); forms migran a `rounded-xl`; se añaden glassmorphism, labels uppercase, átomos de formulario (Input/Label/Select).

## Approach

Cambio de composición, no de lógica de negocio (Opción B de la exploración). Sidebar como componente nuevo en `components/shell/`. Tokens duales vía `.dark` + fix FOUC con script inline en root `layout.tsx`. Átomos en `@/components/ui` (Scope Rule §2). Migración de listados consume átomos + glass. Implementable en slices stacked < 400 líneas (auto-chain): (1) tokens duales + FOUC, (2) sidebar + layout, (3) átomos de form, (4) UserMenu Radix, (5) migración listados.

## Decisiones pendientes (para spec/design)

| Pendiente | Opciones |
|-----------|----------|
| Responsive < 768px | drawer/hamburger vs bottom nav vs no-mobile |
| Tenant en sidebar | mostrar cliente activo sí/no; ¿switcher? |
| Sidebar inicial | fijo vs colapsable (colapsable = iteración posterior) |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/app/(dashboard)/layout.tsx` | Modified | flex-col → flex-row |
| `frontend/src/components/shell/app-nav.tsx` | Removed | reemplazado por sidebar |
| `frontend/src/components/shell/sidebar.tsx` | New | nav lateral premium |
| `frontend/src/components/shell/user-menu.tsx` | Modified | fix click-outside (Radix) |
| `frontend/src/components/ui/{input,label,select}.tsx` | New | átomos de form premium |
| `frontend/src/features/*/components/*List.tsx` | Modified | filas-tarjeta dual mode |
| `frontend/src/styles/globals.css` | Modified | tokens duales + radius `xl` |
| `openspec/specs/frontend-design-system/spec.md` | Modified | dual mode + forms `rounded-xl` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| FOUC de tema en SSR (App Router) | High | Script inline bloqueante en root `<head>`; test de hidratación |
| Conflicto con spec dark-only existente | Med | Delta spec explícito que supera línea 13, documentado |
| Migración de listados infla PR > 400 líneas | Med | Slice dedicado por listado o stacked PRs (auto-chain) |
| Radix DropdownMenu cambia API del UserMenu | Low | Test RED del cierre click-outside antes de migrar |

## Rollback Plan

Cada slice es un PR stacked aislado y revertible. Revertir el commit del sidebar restaura `app-nav.tsx` (mantener hasta verificación final). Tokens duales viven en `globals.css`; revertir el bloque restaura dark-only. La migración de listados es por-archivo: revertir el archivo afectado sin tocar el resto.

## Dependencies

- Constitución `CLAUDE.md` §3 actualizada (modo dual, sidebar, premium) — confirmada.
- Backend CRUD endpoints existen (verificados) — habilitan el follow-up, no este change.

## Success Criteria

- [ ] Sidebar `w-72` reemplaza top-nav; layout en flex-row; item activo visible.
- [ ] App renderiza correctamente en modo claro y oscuro sin FOUC.
- [ ] Spec `frontend-design-system` actualizado a dual mode + forms `rounded-xl`.
- [ ] Átomos Input/Label/Select disponibles en `@/components/ui` con estilo premium.
- [ ] Los 4 listados migrados a filas-tarjeta con badges translúcidos en ambos modos.
- [ ] UserMenu cierra al click-fuera (test RED→GREEN).
