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

## WU-3 — selector de modelo, enclavamiento y columna en equipos — DONE

**Partida en DOS ramas y dos PRs** por decisión del dueño (2026-09-18): el commit
único daba 567 líneas de código contra el presupuesto de revisión de 400.

| Rama | Commit | Qué entrega | Líneas |
|---|---|---|---:|
| `feat/modelos-equipo-columna-marca` | `9cf0316` | Tipos + la columna `Marca` resuelta (tareas 3.1, 3.7, 3.8) | 176 |
| `feat/modelos-equipo-selector-dialogos` | `f300b6b` | Schemas + selector y enclavamiento en los dos diálogos (tareas 3.2-3.6, 3.9) | 381 |

**La columna va PRIMERA a propósito.** Mientras no exista el selector, ningún
equipo tiene `modeloEquipoId`, así que la celda resuelta cae al texto libre y se
comporta igual que antes: cero cambio visible. El orden inverso habría mergeado
una ventana con la columna vacía para todo equipo con modelo de catálogo, que es
la regresión que ADR-2 existe para evitar.

**Gotcha de la partición**: la primera mitad NO compilaba sola. `types.ts` hace
`modeloEquipoId` requerido en `EquipoDetalle`, y un fixture de
`equipo-edit-dialog.test.tsx` —archivo de la segunda mitad— dejaba de tipar. Se
incluyó en la primera mitad **solo esa línea del fixture**, no la conducta del
diálogo. Se detecta corriendo `type-check` sobre cada mitad AISLADA; sobre el
commit entero pasaba en verde.

Ninguna de las dos incluye la pantalla ABM de WU-2, que vive en otra rama y no
hace falta para este work unit.

Tareas completadas (ver `tasks.md`):

- [x] 3.1 `frontend/src/features/equipos/types.ts` — `modeloEquipoId` en
      `Equipo`, `CreateEquipoDto`, `EditarEquipoDto`.
- [x] 3.2 `frontend/src/features/equipos/schemas.ts` — `modeloEquipoId:
      z.string().uuid().optional().or(z.literal(""))` en `crearEquipoSchema`.
- [x] 3.3 `frontend/src/features/equipos/components/equipo-create-dialog.tsx` —
      `<select>` de catálogo (4 estados, molde de `insumo-form-dialog.tsx`,
      ADR-6) + enclavamiento por `onChange` del `register` (ADR-4) +
      `modeloEquipoId` en el payload de alta.
- [x] 3.4 `equipo-create-dialog.test.tsx` — aserciones gemelas de
      enclavamiento, quitar el modelo, catálogo que resuelve tarde, notas de
      VACIA/NO_DISPONIBLE.
- [x] 3.5 `frontend/src/features/equipos/components/equipo-edit-dialog.tsx` —
      mismo `<select>` + enclavamiento; `equipoAFormValues` suma
      `modeloEquipoId`; `submit()` manda `marca: null, modelo: null` cuando
      hay modelo de catálogo elegido (PATCH limpia el texto libre guardado).
- [x] 3.6 `equipo-edit-dialog.test.tsx` — escenario de EDICIÓN explícito de
      ADR-4 (vaciado a la vista antes de Guardar, PATCH con `marca: null,
      modelo: null, modeloEquipoId: <uuid>`) y quitar el modelo sin restituir
      el texto.
- [x] 3.7 `frontend/src/features/equipos/components/equipos-list-view.tsx` —
      celda `Marca` resuelta contra `useModelosEquipo()` con
      `resolverDeCatalogo`/`resolverLista` (`@/features/insumos/lib/
      resolucion-de-catalogo`, ADR-3: import cruzado, sin mudanza a
      `shared/`) y las etiquetas de `nombre-de-catalogo.ts`.
- [x] 3.8 `equipos-list-view.test.tsx` — los cuatro desenlaces de la celda
      (ENCONTRADA/CARGANDO/NO_DISPONIBLE/FUERA_DE_CATALOGO) + el camino sin
      `modeloEquipoId`.
- [x] 3.9 Cierre WU-3: deuda de Ayuda anotada en el commit; suite completa de
      frontend en verde antes de `sdd-verify`.

### Archivo adicional tocado (no listado en `tasks.md`, requerido para que los
tests no rompieran con datos reales de red)

- `frontend/test/msw/handlers.ts` — agregado `GET /api/modelos-equipo` a los
  handlers base (mismo criterio que `GET /api/insumos`, ya existente):
  devuelve `[]` por default; cualquier test que necesite modelos declara los
  suyos con `server.use(...)`. Sin este handler, los tests existentes de
  `equipo-create-dialog`/`equipo-edit-dialog`/`equipos-list-view` que NO
  mockean el endpoint (la mayoría, no relacionados con este ciclo) hubieran
  disparado una request real fallida en cuanto los diálogos empezaron a
  consumir `useModelosEquipo()`.

Total: 8 archivos modificados (incluido el handler base), dentro del
presupuesto estimado de ~320 líneas para el diff de producción + tests
propios de la unidad (el handler base es una línea).

### Verificación (desde `frontend/`)

- `pnpm lint`: verde — "No ESLint warnings or errors".
- `pnpm type-check`: verde — `tsc --noEmit` sin salida.
- `pnpm vitest run src/features/equipos`: verde — 13 archivos, 139 tests.
- `pnpm test` (suite COMPLETA de frontend, exigida por 3.9 antes de
  `sdd-verify`): verde — 186 archivos de test, 1407 tests, exit code 0.

### Desviaciones del diseño

Ninguna. Se siguieron ADR-2 (`equipo-detail-view.tsx` sin cambios; la columna
`Marca` del listado es el único display que cambia), ADR-3 (import cruzado de
`resolucion-de-catalogo.ts`, sin mudanza a `shared/`), ADR-4 (enclavamiento
por `onChange`, nunca `useEffect`; asimetría `undefined`/`null` alta vs.
edición) y ADR-6 (molde exacto de `insumo-form-dialog.tsx`, sin la variante
`tipoActualFueraDeCatalogo` — `GET /modelos-equipo` siempre incluye el modelo
guardado, activo o no).

### Deuda de Ayuda (pausa vigente desde 2026-09-07)

Este work unit cambia el comportamiento del formulario de alta/edición de
equipo (nuevo selector de modelo de catálogo + enclavamiento de marca/modelo
de texto libre) y agrega una columna resuelta en el listado. Cualquier
artículo existente de `backend/ayuda/*.md` que describa "cómo cargar la marca
y el modelo de un equipo" queda desactualizado por este cambio. Sin escribir
artículos nuevos (pausa vigente) — anotado acá y en el commit para que la
tanda final de Ayuda lo cubra: el selector de modelo de catálogo, el
enclavamiento de marca/modelo de texto libre (con el caso de edición que
vacía datos guardados), y la columna `Marca` con sus cuatro estados posibles.

### Issues encontrados

Ninguno. El `<select>` de modelo reusa exactamente el molde de
`insumo-form-dialog.tsx` sin necesitar la variante `tipoActualFueraDeCatalogo`
(ADR-6 verificado: `GET /modelos-equipo` nunca excluye el modelo guardado).

## Cierre del ciclo

WU-1, WU-2 (en otra rama, fuera del alcance de este `sdd-apply`) y WU-3 son
las tres unidades de `tasks.md`. Esta rama (`feat/modelos-equipo-selector-en-
equipos`) cierra WU-3. El estado de WU-2 se registra en su propia rama y no se
reabre acá.
