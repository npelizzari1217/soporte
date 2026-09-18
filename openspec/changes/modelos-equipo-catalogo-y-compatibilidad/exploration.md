# Exploration: consumir el catálogo `ModeloEquipo` (backend completo, frontend inexistente)

> Ciclo SDD `modelos-equipo-catalogo-y-compatibilidad`.

## Current State

### 1. Superficie backend — exacta, `ModelosEquipoController` (`backend/src/insumos/interface/controllers/modelos-equipo.controller.ts`)

Guard de clase `@UseGuards(JwtAuthGuard, TenantGuard)` (:69); `AdminClienteGuard` se aplica **por método**, nunca a nivel de clase — el JSDoc del archivo (:5-7) explica por qué: un guard de clase no se puede anular por handler y rompería la lectura abierta.

| Método | Ruta | Guard extra | DTO body | Respuesta | Errores |
|---|---|---|---|---|---|
| `listar` (:86) | `GET /modelos-equipo` | ninguno | — | `ModeloEquipoResponseDto[]` | — |
| `listarInsumosCompatibles` (:108) | `GET /modelos-equipo/:id/insumos` | ninguno | — | `InsumoResponseDto[]` | 400 si `id` no es UUID (`ParseUUIDPipe`); modelo inexistente → `[]`, NUNCA 404 (decisión deliberada, JSDoc :96-104: "no encontrar compatibilidades no es un fallo") |
| `crear` (:126) | `POST /modelos-equipo` | `AdminClienteGuard` | `CreateModeloEquipoDto { marca, modelo }` | `ModeloEquipoResponseDto` (201) | 403 sin rol ADMINISTRADOR; 422 `ModeloEquipoDuplicadoError` (par marca+modelo ya existe, activo o inactivo — el UNIQUE no tiene índice parcial) |
| `editar` (:146) | `PATCH /modelos-equipo/:id` | `AdminClienteGuard` | `EditModeloEquipoDto { marca?, modelo? }` (PATCH parcial) | `ModeloEquipoResponseDto` | 403; 404 `ModeloEquipoNoEncontradoError`; 422 duplicado si alguna mitad cambia |
| `cambiarEstadoActivo` (:168) | `PATCH /modelos-equipo/:id/estado` | `AdminClienteGuard` | `CambiarEstadoActivoModeloEquipoDto { activo: boolean }` | `ModeloEquipoResponseDto` | 403; 404 |

`toHttpException` (:60-67): `ModeloEquipoNoEncontradoError` → 404; cualquier otro `DomainError` → 422 (par duplicado). Sin `@RequiereAcciones` en ningún método — el ABM del catálogo se gatea 100% por rol (`AdminClienteGuard`), no por la matriz de permisos `MODULO:ACCION` (JSDoc :17-18).

### 2. DTOs exactos (`backend/src/insumos/interface/dtos/modelos-equipo.dto.ts`)

- `CreateModeloEquipoDto`: `marca: string` (`@IsString @MinLength(1) @MaxLength(100)`), `modelo: string` (`@IsString @MinLength(1) @MaxLength(150)`). Los `@MaxLength` IMPORTAN el número de `ModeloEquipoEntity` (`MODELO_EQUIPO_MARCA_MAX_LENGTH=100`, `MODELO_EQUIPO_MODELO_MAX_LENGTH=150`), nunca lo redeclaran — el dominio es la autoridad.
- `EditModeloEquipoDto`: los mismos dos campos, ambos `@IsOptional` (PATCH parcial).
- `CambiarEstadoActivoModeloEquipoDto`: `activo: boolean`.
- `ModeloEquipoResponseDto`: `{ id, marca, modelo, activo, createdAt, updatedAt }` (ISO-8601).
- **Normalización, aplicada por `@Transform` ANTES de medir el largo** (orden crítico — un `'   '` sin recortar pasa `@MinLength(1)` con 3 caracteres): `marca` → `trim().toUpperCase()` (`normalizarMarcaModeloEquipo`, entity :46-48); `modelo` → solo `trim()`, SIN mayúscula — la designación comercial se muestra tal como la escribe el fabricante ("LaserJet Pro M404", no "LASERJET..."). **Sin `@Matches` de código** en ninguno de los dos, a diferencia de `familias-insumo.dto.ts`/`unidades-medida.dto.ts`: `marca` es texto libre ("HEWLETT PACKARD" lleva espacio interno).
- Identidad del agregado: el PAR `(marca, modelo)`, `@@unique([marca, modelo])` en el schema (:642) — no hay `codigo` como en Familia/UnidadMedida. Un modelo dado de baja NO libera su par (sin índice parcial, mismo criterio que `sectores`).

### 3. Compatibilidad — cómo viaja hoy, en los dos sentidos

- **Desde el modelo**: `GET /modelos-equipo/:id/insumos` → `ListarInsumosPorModeloEquipoUseCase` → `InsumoResponseDto[]` completos (con sus propios `codigosAlternativos`/`compatibilidad`). Trae insumos habilitados y deshabilitados por igual (JSDoc :100-104: ocultar un deshabilitado haría parecer que el modelo no tiene ninguno).
- **Desde el insumo**: cada `InsumoResponseDto` (`insumos.dto.ts:369-381`) YA incluye `compatibilidad: CompatibilidadResponseDto[]` (`{ modeloEquipoId, rol }[]`), embebido en toda respuesta de `GET /insumos`, `POST /insumos`, `PATCH /insumos/:id`. **No existe `GET /insumos/:id`** — la única forma de leer un insumo puntual es filtrar el array de `GET /insumos` o usar la respuesta de una mutación. `InsumosController` solo tiene `GET /` (lista), `POST`, `PATCH`, `PATCH /estado` (verificado, 4 rutas).
- **Escritura de compatibilidad**: el body de `POST /insumos` / `PATCH /insumos/:id` acepta `compatibilidad?: CompatibilidadInputDto[]` (`{ modeloEquipoId: uuid, rol?: string|null }`), lista COMPLETA que reemplaza — ausente no toca nada, `[]` la vacía. Techo `INSUMO_COMPATIBILIDAD_MAX` (`@ArrayMaxSize`). **Esto ya existe en el backend desde el commit `67e910d` y el frontend NUNCA lo envía** (`use-insumo-abm-mutations.ts:16-23` documenta la decisión explícita de excluirlo "para una entrega posterior").
- **Conclusión de la pregunta "¿hay necesidad inversa?"**: sí y el backend ya la resuelve por los dos lados (`GET /modelos-equipo/:id/insumos` y el campo embebido `compatibilidad` de cada insumo). No hace falta ningún endpoint nuevo. Lo que falta es 100% frontend, y en ambos sentidos por igual.

### 4. `EquipoInformatico.modeloEquipoId` — el otro lado ya cableado en HTTP, cero en UI

- `equipos.dto.ts`: `CreateEquipoHttpDto.modeloEquipoId?: string|null` (:107-109), `EditarEquipoHttpDto.modeloEquipoId?: string|null` (:184-186), ambos `@IsOptional @IsUUID`. `EquipoResponseDto.modeloEquipoId: string|null` (:362) — el shape de respuesta YA lo trae.
- `equipos.controller.ts`: mapea `modeloEquipoId` en alta (:218) y edición (:335); `ModeloEquipoInexistenteError` → 422 (comentario :124-127, mismo criterio que `tipoComponenteCodigo`: 422 porque referencia un catálogo, no 404 porque el equipo sí existe).
- **Gap real encontrado, no listado en la evidencia inicial**: `EquipoResponseDto` devuelve el **id crudo**, NO un objeto `modeloEquipo: { marca, modelo }` resuelto. El comentario del schema (`schema.prisma:572`, *"cuando hay `modeloEquipoId`, la pantalla muestra el del catálogo"*) promete una UI que necesitaría resolver `marca`/`modelo` — y el backend no se los da embebidos. Cualquier pantalla que muestre el modelo de catálogo de un equipo necesita el `id` cruzado contra `GET /modelos-equipo` (lista completa) del lado cliente, exactamente el patrón `resolverDeCatalogo`/`resolverLista` que ya existe en `features/insumos/lib/resolucion-de-catalogo.ts` para el mismo problema.
- El frontend (`Equipo`, `CreateEquipoDto`, `EditarEquipoDto` en `features/equipos/types.ts:24-110`) es un espejo **RECORTADO** del DTO real — mismo patrón deliberado que `Insumo` en `features/insumos/types.ts:15-37`. `modeloEquipoId` está fuera de ese recorte.
- `equipo-create-dialog.tsx` (:138-158) y `equipo-edit-dialog.tsx` usan `<Input>` de texto libre bindeado a `marca`/`modelo` (los campos legacy que SIGUEN existiendo en la tabla — `EquipoInformatico.marca`/`modelo`, `schema.prisma:562-563`, conviven con `modeloEquipoId` a propósito para el clon armado en casa sin marca ni modelo de catálogo).
- `equipo-detail-view.tsx` no renderiza `marca`/`modelo` ni `modeloEquipoId` en absoluto — necesita confirmarse en `sdd-design` si la ficha de detalle también entra en el alcance de esta unidad.

## Affected Areas

### Backend — NINGUNO

Confirmado: los 5 endpoints, DTOs, entidad, errores y el vínculo en `equipos` ya existen y pasan sus propios tests (commits `162cc32`, `67e910d`). Esta unidad es 100% frontend.

### Frontend — feature nueva `features/modelos-equipo/` + posibles ediciones en `features/equipos/`

- `frontend/src/features/modelos-equipo/types.ts` — nuevo. Espejo de `ModeloEquipoResponseDto` + los 3 DTOs de request.
- `frontend/src/features/modelos-equipo/schemas.ts` — nuevo. Zod mirror de `marca`/`modelo` (topes 100/150, sin `@Matches` de código — a diferencia de `familiaInsumoSchema`/`unidadMedidaSchema`).
- `frontend/src/features/modelos-equipo/hooks/use-modelos-equipo.ts` — nuevo, mismo patrón que `use-unidades-medida.ts`.
- `frontend/src/features/modelos-equipo/hooks/use-modelo-equipo-mutations.ts` — nuevo, mismo patrón que `use-unidad-medida-mutations.ts`.
- `frontend/src/features/modelos-equipo/components/modelo-equipo-form-dialog.tsx` — nuevo, molde de `unidad-medida-form-dialog.tsx`.
- `frontend/src/features/modelos-equipo/components/modelo-equipo-list.tsx` — nuevo, molde de `unidad-medida-list.tsx`.
- `frontend/src/features/modelos-equipo/components/modelos-equipo-admin-view.tsx` — nuevo, molde de `unidades-medida-admin-view.tsx`.
- `frontend/src/app/(dashboard)/admin/modelos-equipo/page.tsx` — nuevo, Server Component fino (ADR-1).
- `frontend/src/components/shell/admin-nav.tsx` — editar. Un ítem más en `ADMIN_NAV_ITEMS` (:38-53), mismo gate `esAdminCliente`, sin permiso nuevo.
- Tests co-localizados por convención del repo (MSW + `renderWithProviders`).

Si el alcance incluye el selector en equipos (Decisión 2):

- `frontend/src/features/equipos/types.ts` y `schemas.ts` — editar: agregar `modeloEquipoId`.
- `equipo-create-dialog.tsx` y `equipo-edit-dialog.tsx` — editar: `<select>` de modelo de catálogo.
- Posiblemente `equipo-detail-view.tsx` y `equipos-list-view.tsx` (usarían `resolverDeCatalogo`, reutilizable sin cambios).

## Decisiones abiertas para `sdd-propose`

### Decisión 1 — dónde vive el ABM en la navegación

**Precedente exacto en este repo (issue #156)**: `UnidadMedida` es un catálogo TRANSVERSAL y se migró de tab dentro de `Admin > Insumos` a su propia sección `Admin > Unidades`, justificado como "una unidad de medida no es una propiedad del insumo — compartir tab con familias la escondía" (JSDoc `unidades-medida-admin-view.tsx:3-11`). `ModeloEquipo` es transversal en el MISMO sentido: lo consume `equipos` (vía `modeloEquipoId`) y `insumos` (vía la compatibilidad), aunque su módulo backend sea `insumos`.

- **Opción A — sección propia `Admin > Modelos de equipo`** (recomendada). Sigue el precedente #156. Costo: un ítem más en `AdminNav`.
- **Opción B — dentro de `Admin > Insumos`**, junto a las familias. Contradice la razón por la que `UnidadMedida` se mudó: reintroduce el problema que el #156 corrigió.
- **Opción C — dentro de `features/equipos/`** sin entrada en `Admin > *`. No hay precedente de un ABM de catálogo fuera de `Admin > *` en este repo.

### Decisión 2 — qué pasa con el `<Input>` de texto libre `modelo` en equipos

El schema documenta la coexistencia deliberada (`schema.prisma:568-573`): un equipo "clon armado en casa" no tiene marca/modelo de catálogo y sigue existiendo. Esto DESCARTA la opción "reemplazar".

- **Opción A — agregar el selector de catálogo como campo adicional opcional**, conviviendo con `marca`/`modelo` de texto libre. Requiere decidir la UX de qué pasa si el usuario llena AMBOS: el backend no los excluye mutuamente.
- **Opción B — dejar `equipos` fuera de esta unidad**, limitando el alcance al ABM del catálogo. Coherente con cómo se entregó `insumos-catalogo` en dos pasos.

### Decisión 3 — dónde vive la vista de compatibilidad

- **Opción A — sección dentro de la ficha de detalle del modelo**, usando `GET /modelos-equipo/:id/insumos`. Requiere una ficha de detalle que hoy no existe: los catálogos hermanos (familias, unidades) NO tienen ficha, solo lista + diálogo.
- **Opción B — sin vista dedicada en esta unidad**; la compatibilidad se gestiona más adelante desde la ficha del INSUMO.
- **Opción C — ambas**, en una unidad de entrega separada.

Dado que los catálogos hermanos no tienen ficha de detalle, y que gestionar `compatibilidad` fue EXPLÍCITAMENTE diferido en la entrega anterior (`use-insumo-abm-mutations.ts:16-23`), lo más consistente con el patrón establecido es que esta unidad entregue SOLO el ABM del catálogo.

### Decisión 4 — ¿hace falta un endpoint nuevo?

No. `GET /modelos-equipo/:id/insumos` y el campo `compatibilidad` embebido cubren las dos direcciones de lectura. La única ausencia real es `GET /insumos/:id`, que esta unidad no necesita si Decisión 3 = Opción B.

## Scope boundaries — qué esta unidad NO debería incluir

- NO tocar la Ayuda (`backend/ayuda/*.md`) — SUSPENDIDA por decisión del dueño desde 2026-09-07. El ABM sí cambia lo que el usuario ve, así que la deuda se anota en el commit y en el PR, sin escribir el artículo.
- NO gestionar `compatibilidad` desde ningún lado en esta unidad.
- NO crear `GET /insumos/:id` ni ningún endpoint nuevo.
- Si Decisión 2 = Opción B: NO tocar `features/equipos/` en absoluto.
- NO exportación CSV — ningún catálogo hermano la tiene.

## Estimación de superficie frontend

Escenario mínimo (solo ABM, Decisión 1 = A, Decisión 2 = B, Decisión 3 = B):

| Archivo | Tipo | Líneas est. |
|---|---|---|
| `features/modelos-equipo/types.ts` | nuevo | ~55 |
| `features/modelos-equipo/schemas.ts` | nuevo | ~45 |
| `features/modelos-equipo/hooks/use-modelos-equipo.ts` | nuevo | ~25 |
| `features/modelos-equipo/hooks/use-modelo-equipo-mutations.ts` | nuevo | ~55 |
| `features/modelos-equipo/components/modelo-equipo-form-dialog.tsx` | nuevo | ~95 |
| `features/modelos-equipo/components/modelo-equipo-list.tsx` | nuevo | ~95 |
| `features/modelos-equipo/components/modelos-equipo-admin-view.tsx` | nuevo | ~30 |
| `app/(dashboard)/admin/modelos-equipo/page.tsx` | nuevo | ~10 |
| `components/shell/admin-nav.tsx` | editado | +2 |
| `modelo-equipo-list.test.tsx` | nuevo | ~90 |
| `modelo-equipo-form-dialog.test.tsx` | nuevo | ~80 |
| `modelos-equipo-admin-view.test.tsx` | nuevo | ~60 |

**Total estimado: ~640 líneas nuevas + 2 editadas, en 12 archivos.** Supera el presupuesto de revisión de 400 líneas si se entrega como un solo PR. Con Decisión 2 = A, sumar ~60-100 líneas más, empujando el total por encima de 700.

**Recomendación de entrega**: `sdd-tasks` debe correr el forecast de 400 líneas formal y decidir el encadenamiento explícitamente.

## Risks

- **El comentario del schema (`schema.prisma:572`) promete una UI que el backend no puede cumplir sin trabajo extra de resolución en el cliente** — `EquipoResponseDto` no embebe `marca`/`modelo` resueltos, solo el id crudo. Si Decisión 2 = A, hay que decidir en diseño si se resuelve en cliente (patrón `resolverDeCatalogo` ya existente) o si se pide un cambio de contrato al backend, lo que rompería el "solo frontend" de esta unidad.
- **Ambigüedad de UX sin resolver** si Decisión 2 = A y el equipo tiene AMBOS `modeloEquipoId` Y `marca`/`modelo` de texto libre: el backend no los excluye mutuamente y no hay regla de negocio que lo prohíba. Sin decidirlo en diseño, cada desarrollador improvisa una respuesta distinta.
- **Ningún catálogo hermano tiene ficha de detalle** — si Decisión 3 elige una vista de compatibilidad dentro de una ficha, es un patrón de UI NUEVO en este repo, no una copia.
- **Multi-tenant**: `ModeloEquipo` es catálogo por tenant (mismo criterio que `FamiliaInsumo`/`UnidadMedida`). Sin riesgo adicional detectado; confirmar en diseño que ningún hook cachee la queryKey sin scope de tenant.
- **Presupuesto de revisión de 400 líneas** casi con certeza superado si se entrega ABM + selector en un solo PR.
- **La Ayuda queda con deuda pendiente** (pantalla de administración nueva): anotar en commit y PR, no escribir el artículo.
- No se buscaron exhaustivamente los tests de integración/e2e del backend para `modelos-equipo`. Si el diseño decidiera tocar el backend, confirmar cobertura existente antes de asumir que no necesita tests nuevos.

## Ready for Proposal

Sí, con una condición: `sdd-propose` no arranca hasta que el dueño del producto resuelva las Decisiones 1, 2 y 3.
