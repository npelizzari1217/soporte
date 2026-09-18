# Proposal: ABM del catálogo `ModeloEquipo` y su selector en equipos

## Intent

El catálogo `ModeloEquipo` está entero en el backend —5 endpoints, entidad, errores y tests propios (`backend/src/insumos/interface/controllers/modelos-equipo.controller.ts`)— y **no tiene una sola pantalla**. Nadie puede crear, editar ni dar de baja un modelo, y `EquipoInformatico.modeloEquipoId` (`backend/prisma_tenant/schema.prisma:575`) viaja en los DTOs de alta y edición sin que ninguna UI lo llene. Un catálogo que no se puede administrar es capacidad muerta: su valor aparece recién cuando el usuario lo carga y lo usa.

Este ciclo entrega la administración del catálogo y su primer consumidor. Termina con un ADMINISTRADOR capaz de dar de alta "HP / LaserJet Pro M404" y de asignárselo a un equipo desde el formulario que ya usa.

## Scope

### In Scope

- **Sección propia `Admin > Modelos de equipo`** (Decisión 1): un ítem más en `ADMIN_NAV_ITEMS` (`frontend/src/components/shell/admin-nav.tsx:38-53`), gateado por el `esAdminCliente` existente, **sin permiso nuevo**. Sigue el precedente del #156, que sacó `UnidadMedida` de la tab de insumos porque un catálogo transversal escondido dentro de un módulo no se encuentra.
- **ABM completo**: listar, crear, editar y activar/desactivar, feature nueva `frontend/src/features/modelos-equipo/` con el molde de `unidades-medida-admin-view.tsx`.
- **Selector de catálogo en equipos** (Decisión 2, opción ancha elegida por el dueño contra la recomendación de la exploración): se AGREGA a los diálogos de alta y edición (`equipo-create-dialog.tsx`, `equipo-edit-dialog.tsx`) **junto a** los `<Input>` de texto libre `marca`/`modelo` (`equipo-create-dialog.tsx:141,152`), que siguen funcionando. Un clon armado en casa no tiene modelo de catálogo y tiene que seguir siendo creable (`schema.prisma:568-573`).
- **Enclavamiento entre selector y texto libre** (Decisión 5, resuelta, no es pregunta abierta): con un modelo de catálogo seleccionado, `marca` y `modelo` de texto libre quedan **deshabilitados y vaciados**; al quitar el modelo, vuelven a habilitarse. El usuario nunca ve dos verdades compitiendo por lo mismo y la ficha siempre muestra una sola. Es lo que el schema ya describe en `:572`.
- **Resolución de nombre del lado cliente**: ver Approach.

### Out of Scope

- **Gestión de compatibilidad, en los dos sentidos** (Decisión 3): ni desde el modelo ni desde el insumo. Se difiere explícitamente, con el mismo criterio con que la entrega anterior la dejó afuera (`use-insumo-abm-mutations.ts:16-23`).
- **Ningún endpoint nuevo** (Decisión 4). Tampoco `GET /insumos/:id`.
- Ficha de detalle del modelo: ningún catálogo hermano tiene una.
- Exportación CSV: ningún catálogo hermano la tiene.
- **Ayuda** (`backend/ayuda/*.md`): SUSPENDIDA por decisión del dueño desde el 2026-09-07. Este cambio agrega una pantalla de administración y altera el formulario del equipo, así que **genera deuda de Ayuda**: se anota en el mensaje del commit y en el cuerpo del PR, y no se escribe ningún artículo mientras dure la pausa.
- **Investigación externa** (Decisión 6): no se hace; el precedente está todo dentro del repo.

## Capabilities

### New Capabilities

- `modelos-equipo-catalogo`: quién administra el catálogo de modelos de equipo, cómo se elige un modelo al dar de alta o editar un equipo, y qué pasa con los campos de texto libre `marca`/`modelo` cuando hay un modelo de catálogo elegido.

### Modified Capabilities

- Ninguna. `openspec/specs/` hoy solo tiene `preventivo-*`, `repuestos-autoridad-catalogo` y `fechas-sesion-utc`; ninguna describe equipos ni catálogos de insumos.

## Approach

| Pieza | Enfoque |
|---|---|
| Backend | **Sin cambios.** Los 5 endpoints, DTOs, entidad y errores ya existen y tienen tests. Este ciclo es 100% frontend. |
| Feature nueva | `features/modelos-equipo/` con `types.ts`, `schemas.ts` (Zod espejo: `marca` ≤100 con `trim().toUpperCase()`, `modelo` ≤150 con solo `trim()`, sin `@Matches` de código), hooks de query y de mutación, lista y diálogo de formulario, más un Server Component fino en `app/(dashboard)/admin/modelos-equipo/page.tsx`. |
| Selector en equipos | `modeloEquipoId` entra al espejo recortado de `features/equipos/types.ts` y `schemas.ts`; `<select>` con placeholder, alimentado por `GET /modelos-equipo`. |
| Enclavamiento | Regla de formulario, no de dominio: el backend no los excluye mutuamente y este ciclo no le pide que lo haga. |

**Resolución de nombre — el punto que mantiene el cambio en el frontend.** `EquipoResponseDto` devuelve `modeloEquipoId` crudo (`backend/src/equipos/interface/dtos/equipos.dto.ts:362`), **sin** un objeto `{marca, modelo}` resuelto. Toda pantalla que muestre el modelo de catálogo de un equipo lo resuelve del lado cliente contra `GET /modelos-equipo`, con los helpers genéricos `resolverDeCatalogo`/`resolverLista` que ya existen en `frontend/src/features/insumos/lib/resolucion-de-catalogo.ts` y distinguen "cargando", "no disponible" y "fuera de catálogo" —tres estados que un `?? []` colapsaría en uno—. Esto es lo que preserva la propiedad "solo frontend": embeber el objeto resuelto en la respuesta sería un cambio de contrato del backend, y **no se propone**.

## Comportamientos verificables para `sdd-spec`

1. **ABM del catálogo**: alta, edición y cambio de estado desde `Admin > Modelos de equipo`, gateado por rol, con el par `(marca, modelo)` duplicado rechazado con 422.
2. **Selector en equipos**: elegir un modelo de catálogo al crear o editar un equipo, y que el equipo quede guardado con ese `modeloEquipoId`.
3. **Enclavamiento**: seleccionar modelo deshabilita y vacía `marca`/`modelo`; quitarlo los rehabilita.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `frontend/src/features/modelos-equipo/**` | New | Types, schemas Zod, hooks, lista, diálogo, vista de admin y sus tests |
| `frontend/src/app/(dashboard)/admin/modelos-equipo/page.tsx` | New | Server Component fino |
| `frontend/src/components/shell/admin-nav.tsx` | Modified | Un ítem más en `ADMIN_NAV_ITEMS` |
| `frontend/src/features/equipos/types.ts` · `schemas.ts` | Modified | `modeloEquipoId` entra al espejo recortado |
| `frontend/src/features/equipos/components/equipo-create-dialog.tsx` · `equipo-edit-dialog.tsx` | Modified | Selector + enclavamiento, con sus tests |
| `frontend/src/features/equipos/components/equipos-list-view.tsx` | Modified | Columna `Marca` (:43): hoy es el único lugar donde el usuario ve la marca, y el enclavamiento la vacía. Resuelve el modelo de catálogo del lado cliente |
| `frontend/src/features/equipos/components/equipo-detail-view.tsx` | **Sin cambios** (cerrado por ADR-2) | Hoy no renderiza `marca`, `modelo` ni `modeloEquipoId`: no mostrar el modelo ahí es un hueco preexistente, no una regresión de este ciclo |
| Backend | Ninguno | — |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| **Presupuesto de revisión de 400 líneas superado**: ~700-750 líneas en ~15 archivos (≈640/12 del ABM más el selector en equipos) | Alta | La estrategia de entrega es `ask-on-risk`. `sdd-tasks` DEBE producir el Review Workload Forecast formal con sus tres líneas guarda y recomendar el encadenamiento; **esta propuesta no lo decide** |
| El id crudo obliga a resolver en cliente y alguien "arregla" el contrato del backend | Media | Queda escrito acá: resolver en cliente es la decisión, no un parche. Un cambio de contrato saca el ciclo del alcance frontend |
| El enclavamiento vacía texto libre que el usuario había cargado a mano | Media | Es el comportamiento elegido y va a la spec como escenario, no como defecto. El vaciado ocurre al seleccionar, a la vista del usuario, no en silencio al guardar |
| Caché de la query del catálogo sin scope de tenant | Baja | Confirmar en diseño que la `queryKey` sigue el patrón de `use-unidades-medida.ts` |
| La Ayuda queda describiendo un formulario de equipo que cambió | Media | Anotar la deuda en commit y PR. Si algún artículo existente queda FALSO, corregirlo: esa excepción sigue vigente durante la pausa |

## Addendum del diseño (2026-09-18)

El diseño cerró la casilla abierta de `equipo-detail-view.tsx` **invirtiendo** lo que esta propuesta suponía, y la tabla de arriba ya refleja el resultado. El criterio de ADR-2: **se paga la regresión que uno introduce; el hueco viejo queda como seguimiento.** La ficha nunca mostró `marca`/`modelo`, así que seguir sin mostrarlos no es deuda de este ciclo; la columna `Marca` del listado sí, porque el enclavamiento la vacía.

**Consecuencia registrada, sin cerrar**: `backend/src/equipos/application/use-cases/exportar-equipos.use-case.ts:77` exporta la columna `Marca` desde el campo crudo. Tras este ciclo, un equipo con modelo de catálogo la exporta **vacía**. Corregirlo es trabajo de backend y sacaría al ciclo de su propiedad "solo frontend", así que queda como seguimiento explícito y no como defecto silencioso.

## Rollback Plan

`git revert` de los commits del ciclo. No hay migración ni cambio de forma de datos: los `ModeloEquipo` creados mientras tanto quedan persistidos y los endpoints siguen sirviéndolos, solo desaparece la pantalla que los administra. Los equipos que hayan quedado con `modeloEquipoId` lo conservan en la base; el formulario vuelve a mostrar solo `marca`/`modelo` de texto libre, que en esos equipos están vacíos por el enclavamiento. Si se revierte solo el selector y se conserva el ABM, el catálogo queda administrable y sin consumidor —el estado previo a este ciclo, más las pantallas.

## Dependencies

- Ninguna externa. Se apoya en los commits `162cc32` y `67e910d`, ya entregados.

## Success Criteria

- [ ] Un ADMINISTRADOR ve `Admin > Modelos de equipo`; un usuario sin ese rol, no.
- [ ] Alta, edición y activar/desactivar un modelo funcionan desde esa pantalla, y el par duplicado se rechaza con mensaje.
- [ ] Un equipo se crea y se edita eligiendo un modelo de catálogo, y queda guardado con su `modeloEquipoId`.
- [ ] Con un modelo seleccionado, `marca` y `modelo` de texto libre están deshabilitados y vacíos; al quitarlo, vuelven a editarse.
- [ ] Un equipo sin modelo de catálogo se sigue creando solo con `marca`/`modelo` de texto libre.
- [ ] La pantalla que muestra el modelo de un equipo distingue "cargando" de "fuera de catálogo".
- [ ] `pnpm lint`, `pnpm type-check` y `pnpm test` en verde en frontend; backend sin cambios.
- [ ] La deuda de Ayuda queda anotada en el commit y en el cuerpo del PR.
