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

## Pendiente — WU-2 y WU-3

No implementadas en este work unit, fuera de alcance de esta tanda de `sdd-apply`:

- WU-2 — pantalla ABM y navegación (`features/modelos-equipo/components/**`,
  `app/(dashboard)/admin/modelos-equipo/page.tsx`, `admin-nav.tsx`).
- WU-3 — selector, enclavamiento y display en equipos (`features/equipos/**`).

Ambas dependen solo de WU-1 (ya cerrado) y no dependen entre sí — pueden
implementarse en cualquier orden o en paralelo, según `tasks.md` ("Orden y
paralelismo").
