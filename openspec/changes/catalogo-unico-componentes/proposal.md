# Proposal: catálogo único para los componentes de equipo

## Intent

Hoy conviven dos taxonomías para lo mismo: el catálogo MASTER `tipos_componente` (alta en texto libre) y las familias repuesto del tenant (alta vinculada a un insumo). El tipo se resuelve por dos caminos, con reglas y errores distintos (`openspec/specs/repuestos-autoridad-catalogo/spec.md`). El ciclo deja **un solo catálogo**: todo componente instalado referencia un repuesto del tenant y su tipo sale de `insumo.familia`.

Es el **primero de dos cambios encadenados** (partición aceptada por el dueño el 2026-09-29). El segundo, `stock-usado-componentes`, se apoya en este.

Entradas: `exploration.md` y `research.md` (revisión 3, `done`) de esta carpeta. **No es un punto de `docs/roadmap-comercial.md`**: la regla de citar la decisión de producto no aplica.

## Scope

### In Scope (decisiones del dueño, 2026-09-29)

1. `componentes_equipo.insumo_id` NOT NULL, contra un `Insumo` cuya familia tiene `esRepuesto = true`. Desaparece el alta en texto libre.
2. Se eliminan la columna `tipo_componente_codigo` y su índice; el tipo se deriva de la familia.
3. Se retira MASTER `tipos_componente`: módulo backend `tipos-componente` (5 endpoints ROOT), `GET /equipos/tipos-componente`, checker y puerto MASTER, feature frontend, ruta `/admin/tipos-componente` y su entrada de navegación.
4. **Un solo diálogo de alta**: `insumoId` obligatorio y casilla "Descontar del depósito" **marcada por defecto**. Marcada: componente + SALIDA en una transacción (issue #153), contra el saldo único de hoy. Desmarcada: alta sin SALIDA (piezas que vinieron dentro del equipo comprado). Serie y capacidad siguen siendo datos del componente.
5. Las 9 filas de texto libre de producción son de prueba y se eliminan. La migración **aborta** si queda alguna fila no conforme, incluidas las borradas lógicamente; nunca borra en silencio.
6. Sin campo de comportamiento nuevo en la familia: alcanza `esRepuesto`. Ningún código ramifica por `familia.codigo`.
7. **Reemplazo = retiro + alta nueva** (decidido). El repuesto de un componente instalado no se edita: el diálogo de edición no ofrece tipo ni insumo.
8. Corrección de `AGENTS.md:216-220`, que este cambio vuelve falso.

### Out of Scope — próximo cambio: `stock-usado-componentes` (nombre provisional)

- Retiro con dos desenlaces: devolver al stock como USADO o descartar por rotura, con registro de la rotura.
- Condición NUEVO/USADO en los movimientos del mismo ítem del catálogo, y stock por insumo y condición.
- Elección del saldo (nuevo o usado) al instalar con descuento.
- El conflicto de `ReactivarComponenteUseCase` (`PATCH .../reactivar`) con un retiro que devuelve la pieza al stock.

**Hasta que ese cambio entre, el retiro sigue siendo el soft delete actual** (`backend/src/equipos/application/use-cases/eliminar-componente.use-case.ts`), sin motivo y sin movimiento de stock.

### Out of Scope — otros

- Seguimiento por serie, lote o cantidad en la familia.
- Impedir en la base el cambio de `es_repuesto` de una familia con componentes instalados.
- Componentes en la exportación de equipos.
- **Ayuda**: escritura suspendida. Se anota la deuda en commit y PR (alta desde el catálogo, casilla de descuento, tipo derivado). Ningún artículo existente queda falso (`backend/ayuda/equipos-listado.md:13` no lo es).

## Preguntas de `rules.proposal`

| Pregunta | Respuesta |
|---|---|
| ¿Espeja otra capa? | Sí: Prisma, DTO y Zod (`frontend/src/features/equipos/schemas.ts`). Fuente única: el DTO y la entidad del backend. |
| ¿Alternativas con comportamiento distinto? | Sí, opciones A–D (exploración §3). El dueño eligió B. |
| ¿Cambia lo que ve o hace el usuario? | Sí: diálogo de alta, edición sin tipo ni insumo, pantalla ROOT retirada. |

## Capabilities

### New Capabilities

- `componentes-catalogo-unico`: alta con `insumoId` obligatorio, descuento opcional y atómico, reemplazo como retiro + alta, guard fail-closed de la migración y ausencia del catálogo MASTER.

### Modified Capabilities

- `repuestos-autoridad-catalogo`: se reescribe. REMOVED los requerimientos de texto libre, gate MASTER, colisión de código y baja global MASTER. MODIFIED autoridad del tipo, guards y display (un solo camino), y el recuento del catálogo de errores.

## Approach

- **Dominio y casos de uso**: `AgregarComponenteUseCase` con un solo camino; `EditarComponenteUseCase` sin cambio de tipo ni de insumo; `ObtenerEquipoUseCase` resuelve solo por familia; se eliminan `TipoComponenteCodigoRequeridoError` y `TipoComponenteInactivoError`.
- **Migración tenant**: guard `RAISE EXCEPTION` → `SET NOT NULL` → drop de índice y columna. FK `RESTRICT` intacta.
- **MASTER**: migración DROP nueva; las viejas no se editan.
- **Seeds**: `demo-seed.ts` pasa de `RAM`/`DISCO` libres a insumos repuesto.
- **Entrega**: auto-chain, cada PR bajo 400 líneas. Estimación: 1.200–1.800 líneas netas con tests (más unos 55 archivos de borrado puro), unos 5–7 PR. Partición preliminar en exploración §6 (WU-1 a WU-5); la cierra `sdd-tasks`.

## Affected Areas

| Área | Impacto |
|---|---|
| `backend/src/equipos/**` (entidad, mapper, casos de uso, DTOs, errores, controller) | Modified |
| `backend/src/tipos-componente/**`, checker y puerto MASTER, `listar-tipos-componente.use-case.ts` | Removed |
| `backend/prisma_tenant/**`, `backend/prisma_master/**` (schema, migración nueva, `seeds/demo-seed.ts`) | Modified |
| `backend/scripts/backfill-tipos-componente-codigo.js`, `backend/eslint.config.js` | Removed / Modified |
| `frontend/src/features/equipos/**` (diálogos, sección, schemas, types, hooks) | Modified |
| `frontend/src/features/tipos-componente/**`, `app/(dashboard)/admin/tipos-componente/**`, `shared/nav/nav-config.ts` | Removed / Modified |
| `AGENTS.md`, `openspec/specs/repuestos-autoridad-catalogo/spec.md` | Modified |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Filas borradas lógicamente o de tenants inactivos con `insumo_id NULL` bloquean el deploy | Media | Medición previa en solo lectura; el guard aborta en vez de borrar |
| Migración falla a mitad del recorrido de tenants | Baja | Dry-run previo y `predeploy-dump.ps1` |
| Alta sin descuento usada por error | Media | Casilla marcada por defecto y visible |
| Mientras no entre el segundo cambio, una pieza sana retirada no vuelve al stock | Media | Comportamiento actual, declarado; lo resuelve `stock-usado-componentes` |
| Código que deja de escribir la columna y migración en releases distintos | Baja | Mismo release; `deploy.ps1` migra con servicios detenidos |
| Nuevo spec de integración que trunca `soporte_master_test` sin lock | Baja | `usarLockMasterTest()` obligatorio |

## Rollback Plan

- Código: `git revert` de los PR de la cadena, en orden inverso.
- Datos: el DROP de `tipo_componente_codigo`, el de MASTER `tipos_componente` y el borrado de las 9 filas **solo se revierten restaurando el dump de `predeploy-dump.ps1`** tomado antes del deploy. Un revert de código sin restaurar deja código viejo contra esquema nuevo.

## Open Questions for Design (no confirmadas por el dueño)

| Pregunta | Recomendación de exploración/investigación |
|---|---|
| ¿DROP de MASTER `tipos_componente` en el mismo release o en uno posterior? | Mismo release, última unidad de trabajo |
| Mecanismo de limpieza de las 9 filas | Script único en `backend/scripts/`, dry-run por defecto y `--apply`, recorrido de tenants, informa filas borradas lógicamente; medir antes, en solo lectura, filas borradas y tenants inactivos |
| `tipoComponenteCodigo` en el request: ¿ignorar o rechazar? | Sin recomendación cerrada (exploración §7, riesgo 5) |

## Success Criteria

- [ ] Todo componente tiene `insumo_id` NOT NULL; la columna `tipo_componente_codigo` y la tabla MASTER `tipos_componente` no existen.
- [ ] La migración aborta ante una fila no conforme, incluida una borrada lógicamente.
- [ ] Con la casilla marcada, componente y SALIDA se registran juntos o ninguno; desmarcada, no hay SALIDA.
- [ ] La edición de un componente no permite cambiar su tipo ni su insumo.
- [ ] Ninguna pantalla, ruta ni endpoint de `tipos-componente` sigue disponible; ningún código ramifica por `familia.codigo`.
- [ ] `AGENTS.md` corregido y deuda de Ayuda anotada en commit y PR.
- [ ] `pnpm lint`, typecheck y `pnpm test` en verde en backend y frontend; cada PR bajo 400 líneas.
