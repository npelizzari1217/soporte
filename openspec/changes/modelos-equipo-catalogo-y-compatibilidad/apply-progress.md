# Apply Progress: modelos-equipo-catalogo-y-compatibilidad

## WU-1 — capa de datos del catálogo — DONE

Commit: `e7a99ed` — `feat(modelos-equipo): capa de datos del catalogo (types, schemas, hooks)`
Rama: `feat/modelos-equipo-capa-de-datos`

Tareas completadas (ver `tasks.md`):

- [x] 1.1 `frontend/src/features/modelos-equipo/types.ts`
- [x] 1.2 `frontend/src/features/modelos-equipo/schemas.ts`
- [x] 1.3 `frontend/src/features/modelos-equipo/schemas.test.ts`
- [x] 1.4 `frontend/src/features/modelos-equipo/hooks/use-modelos-equipo.ts`
- [x] 1.5 `frontend/src/features/modelos-equipo/hooks/use-modelo-equipo-mutations.ts`
- [x] 1.6 Cierre WU-1: lint + type-check + tests en verde. Commit.

Total: 292 líneas (5 archivos), dentro del presupuesto estimado de ~280.

### Verificación (desde `frontend/`)

- `pnpm lint`: verde — "No ESLint warnings or errors".
- `pnpm type-check`: verde — `tsc --noEmit` sin salida.
- `pnpm test`: verde — 186 archivos de test, 1395 tests, exit code 0 (incluye
  `src/features/modelos-equipo/schemas.test.ts`, corrido dentro de la suite
  completa en vez de aislado, por ser un cierre más estricto).

### Desviaciones del diseño

Ninguna. Se siguieron ADR-1 (molde de unidades de medida con sus 4 desvíos:
sin `codigo`, normalización marca/modelo distinta, largo medido sobre el valor
normalizado, sin patrón de código) y ADR-5 (`queryKey` plana `["modelos-equipo"]`,
sin segmento de tenant).

## WU-2 — pantalla ABM y navegación — DONE

Rama: `feat/modelos-equipo-pantalla-abm` (ramificada desde
`feat/modelos-equipo-capa-de-datos`, WU-1, aún no mergeada a `main`).

Tareas completadas (ver `tasks.md`):

- [x] 2.1 `frontend/src/features/modelos-equipo/components/modelo-equipo-form-dialog.tsx`
- [x] 2.2 `frontend/src/features/modelos-equipo/components/modelo-equipo-form-dialog.test.tsx`
- [x] 2.3 `frontend/src/features/modelos-equipo/components/modelo-equipo-list.tsx`
- [x] 2.4 `frontend/src/features/modelos-equipo/components/modelos-equipo-admin-view.tsx`
- [x] 2.5 `frontend/src/features/modelos-equipo/components/modelos-equipo-admin-view.test.tsx`
- [x] 2.6 `frontend/src/app/(dashboard)/admin/modelos-equipo/page.tsx`
- [x] 2.7 `frontend/src/components/shell/admin-nav.tsx` (+ `admin-nav.test.tsx`)
- [x] 2.8 Cierre WU-2: lint + type-check + tests en verde. Commit.

Total: 476 líneas (8 archivos) — ~19% sobre el presupuesto de 400. **Excepción
aprobada por el dueño (`size:exception`)**: es una sola pantalla cohesiva
(diálogo + lista + gate + nav), y partirla habría fragmentado artificialmente
un ABM que ya converge con el molde de unidades de medida.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Test focalizado | `pnpm vitest run src/features/modelos-equipo/components src/components/shell/admin-nav.test.tsx` — 3 archivos, 10 tests, verde |
| Harness de runtime | N/A — sin routing de servidor ni proceso propio; el harness real es MSW + `renderWithProviders` sobre los componentes, ya cubierto por el test focalizado |
| Límite de rollback | Los 8 archivos de esta unidad (5 nuevos bajo `features/modelos-equipo/components/` y `app/.../admin/modelos-equipo/`, más el diff acotado de `admin-nav.tsx`/`admin-nav.test.tsx`) — revertibles sin tocar WU-1 ni WU-3 |

### Verificación (desde `frontend/`)

- `pnpm lint`: verde — "No ESLint warnings or errors".
- `pnpm type-check`: verde — `tsc --noEmit` sin salida.
- `pnpm vitest run src/features/modelos-equipo/components src/components/shell/admin-nav.test.tsx`: verde — 3 archivos, 10 tests.
- `pnpm test` (suite completa de frontend): verde — 188 archivos de test, 1403 tests, exit code 0.

### Desviaciones del diseño

Ninguna. Se siguió ADR-1 (molde exacto de `unidad-medida-form-dialog.tsx`,
`unidad-medida-list.tsx`, `unidades-medida-admin-view.tsx`), R1 (gate
`esAdminCliente`, sin permiso nuevo en `MODULO:ACCION`) y R3 (el 422 de par
duplicado llega como `notifyError` genérico dentro del hook de mutación de
WU-1; el diálogo no cierra en ese camino porque `setOpen(false)` solo corre en
`onSuccess`, igual que su molde).

`ModeloEquipoList` no lleva test propio — se cubre integrado desde
`modelos-equipo-admin-view.test.tsx`, mismo criterio que `unidad-medida-list.tsx`
se cubre desde `unidades-medida-admin-view.test.tsx` (tasks.md lo pide así
explícitamente).

### Issues Found

Ninguno.

### Deuda de Ayuda

Este WU agrega una pantalla de administración nueva (`Admin > Modelos de
equipo`). La pausa de `backend/ayuda/*.md` sigue vigente desde el 2026-09-07:
no se escribió artículo. Queda anotada como deuda para la tanda final de
Ayuda, junto con la deuda de WU-3 (selector en los diálogos de equipo).

## Pendiente — WU-3

No implementada en este work unit, fuera de alcance de esta tanda de `sdd-apply`:

- WU-3 — selector, enclavamiento y display en equipos (`features/equipos/**`).

Depende solo de WU-1 (ya cerrado) y no depende de WU-2 — puede implementarse
en cualquier orden respecto de WU-2, según `tasks.md` ("Orden y paralelismo").
