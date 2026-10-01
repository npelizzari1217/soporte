# Proposal: reporte y exportación del stock de insumos

## Intent

Hoy el stock solo se ve insumo por insumo, en la ficha. No hay una lectura que cruce el catálogo con los saldos: no se puede saber de un vistazo qué falta reponer ni llevar el stock a una planilla. El ciclo agrega una foto del stock actual de todos los insumos, en pantalla y exportable.

Entrada: `exploration.md` de esta carpeta. Research no seleccionada. **Es un pedido registrado en `docs/roadmap-comercial.md`**: la decisión de producto vive en la sección "Decisiones de producto ya cerradas", viñeta "Reporte de stock" (confirmada por el dueño el 2026-10-01). Cada sub-viñeta es un ítem del alcance y será un requerimiento de la spec.

## Scope

### In Scope (viñeta "Reporte de stock", 2026-10-01)

1. **Solo la foto del stock actual**, con fecha y hora de generación visible.
2. **Una fila por insumo**: código, nombre, familia, consumible o repuesto, unidad de medida, stock NUEVO, stock USADO, total, punto de reposición y estado de reposición.
3. **Filtros**: familia, consumible o repuesto, solo bajo mínimo. Incluye los deshabilitados con una columna de estado y los de stock cero, con la opción de ocultarlos.
4. **Sin valorizar.**
5. **Permiso**: ver y exportar con `INSUMOS:LECTURA`.
6. **Exportación CSV** como el resto de la aplicación (botón "Exportar a Excel").
7. **Pantalla "Reporte de stock"** dentro de la sección Insumos.
8. **Cantidades** con coma decimal y sin decimales en unidades enteras; un saldo negativo se exporta como número y se resalta en pantalla, nunca se esconde.
9. El saldo de cada fila coincide con el de la ficha (`ConsultarStockInsumoUseCase`) para insumos `NINGUNO` y `SERIE`.

### Out of Scope

- Valorizado o costo del insumo.
- Movimientos por período.
- Listado de unidades por serie; piezas instaladas por equipo.
- XLSX, PDF o vista imprimible.
- Acción de permiso nueva.
- **Ayuda**: escritura suspendida. Se anota la deuda (pantalla nueva y exportación) en el commit y el PR de cada work unit con UI. Ningún artículo existente queda falso: el cambio solo agrega.

## Preguntas de `rules.proposal`

| Pregunta | Respuesta |
|---|---|
| ¿Espeja otra capa? | Sí: DTO de respuesta y schema Zod del frontend. Fuente única: `EstadoReposicion` y el cálculo de saldo del dominio del backend. |
| ¿Alternativas con comportamiento distinto? | Sí, P1–P10 de la exploración §11. El dueño eligió la recomendada en todas. |
| ¿Cambia lo que ve o hace el usuario? | Sí: pantalla y exportación nuevas. Plan de Ayuda: ver Out of Scope. |

## Capabilities

### New Capabilities

- `reporte-stock-insumos`: foto del stock de todos los insumos, columnas, filtros, universo, permiso, exportación CSV, formato de cantidades y coincidencia con la ficha.

### Modified Capabilities

- None. `stock-insumo-condicion` y `unidades-insumo-serie` no cambian: el reporte las lee.

## Approach

Opción A de la exploración, CSV en el servidor.

- **Lectura agregada** sin N+1: una consulta nueva en cada puerto (saldo del libro por insumo, condición y tipo; unidades `EN_DEPOSITO` por insumo y condición, con pendientes de serie). Sin transacción ni lock.
- **Cálculo solo en el dominio**: `calcularSaldos`, `saldosDesdeUnidades` y `evaluarReposicion`, ramificando por `seguimiento` igual que `ConsultarStockInsumoUseCase`. Ninguna fórmula en SQL.
- **Red contra la divergencia**: spec de integración que compara el saldo del reporte con `ConsultarStockInsumoUseCase` para `NINGUNO` y `SERIE`.
- **Endpoints** `GET /insumos/reporte-stock` (JSON) y `GET /insumos/reporte-stock/export` (CSV), declarados antes de cualquier ruta `:id`, con `INSUMOS:LECTURA`.
- **Exportación** con `armarExportCsv` y `csv.ts`; helper nuevo `cantidadCsv` que emite negativos como número, no como texto escapado; clase de error de exportación propia del módulo, mapeada a 422.
- **Frontend**: ruta en la sección Insumos, filtros en la URL, `ExportarCsvButton` sin cambios.
- **Entrega**: auto-chain, feature-branch-chain sobre `feat/reporte-stock-insumos`, cada PR bajo 400 líneas cambiadas. Estimación: 3–4 PR (consultas agregadas y caso de uso; endpoints y CSV; pantalla). La partición la cierra `sdd-tasks`.

## Affected Areas

| Área | Impacto |
|---|---|
| `backend/src/insumos/domain/ports/i-movimiento-insumo.repository.ts`, `i-unidad-insumo.repository.ts` | Modified |
| `backend/src/insumos/infrastructure/persistence/prisma/*` | Modified |
| `backend/src/insumos/application/use-cases/` (reporte y exportación) | New |
| `backend/src/insumos/interface/controllers/`, DTOs, `domain/errors/` | New/Modified |
| `backend/src/insumos/insumos.module.ts` | Modified |
| `backend/src/shared/infrastructure/csv/csv.ts` (`cantidadCsv`) | Modified |
| `frontend/src/features/insumos/**` | New/Modified |
| `docs/roadmap-comercial.md` (Cumplida/Desviación al cerrar) | Modified |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Saldo distinto del de la ficha en `SERIE` | Media | Rama por `seguimiento`; spec de comparación |
| N+1 | Baja | Consultas agregadas en los puertos |
| Negativo exportado como texto `'-3` | Media | `cantidadCsv` con test propio |
| Foto no atómica entre libro y unidades | Baja | Fecha y hora de generación visibles |
| Ruta capturada por `:id` | Baja | Orden de declaración; test e2e |

## Rollback Plan

- Funcionalidad de solo lectura: `git revert` de los PR de la cadena, en orden inverso.
- **Sin migración esperada**: todo sale de tablas existentes; el diseño lo confirma. Si apareciera un índice nuevo, será aditivo y podrá quedar aplicado con el binario viejo.

## Dependencies

- Ninguna dependencia nueva de paquetes.

## Success Criteria

- [ ] Cada sub-viñeta de "Reporte de stock" es un requerimiento verificado.
- [ ] El saldo del reporte coincide con la ficha para `NINGUNO` y `SERIE`.
- [ ] Sin `INSUMOS:LECTURA`, la pantalla y la exportación responden 403.
- [ ] Un saldo negativo sale como número en el CSV y resaltado en pantalla.
- [ ] Deuda de Ayuda anotada; la viñeta del roadmap declara Cumplida o Desviación y `scripts/check-roadmap-fresco.mjs` pasa.
- [ ] `pnpm lint`, typecheck y `pnpm test` en verde en backend y frontend; cada PR bajo 400 líneas.
