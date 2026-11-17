# Exportar una compra individual con sus ítems

Exportación (CSV/xlsx) del detalle de UNA compra: una fila por ítem, con la descripción completa.
Rama `feat/export-compra-individual`. Sigue a la #546 (descripción en el export del listado).

## Specs

- **S1** — Formato: "CSV y xlsx, como el listado". Reusa `armarExport` y el botón compartido `ExportarCsvButton`.
- **S2** — Una fila por ítem NO eliminado. Las primeras columnas repiten los datos de la compra: Número, Motivo, Descripción (de la compra), Tipo, Estado. Una compra sin ítems vivos exporta una fila con la cabecera y las columnas de ítem vacías (L4).
- **S3** — Columnas por ítem: "Lo de la pantalla del detalle" — descripción completa, cantidad, proveedor, monto, moneda, total, estado de aprobación, fechas de orden / recepción / entrega, comprado, entregado — más, por pedido del dueño ("sumalo"), fecha de cotización y observaciones.
- **S4** — Ruta `GET /compras/:id/export?formato=csv|xlsx`, gate `COMPRAS:LECTURA`. Una compra inexistente, eliminada o de un tipo que el actor no ve da 404 (`VisibilidadCompraGuard`).
- **S5** — Nombre de archivo con prefijo `compra-<número>` (p. ej. `compra-COM-2026-00001-2026-11-17.xlsx`).
- **S6** — Botón Exportar (Excel/CSV) en la pantalla de detalle de la compra.
- **S7** — La Ayuda del detalle de compra menciona la exportación.

## Tasks

- [x] **T1** — S1-S5 — backend: `ExportarCompraUseCase` + ruta + tests. Inline. Commit: `8bc718e2`
- [x] **T2** — S6, S7 — frontend: botón en el detalle + test + Ayuda. Inline. Commit: `0ba1fe41`

## Log

- **L1** (2026-11-16, pedido original, en el contexto del export del listado): "cuando se haga el de una compra en particular podemos colocar los items con sus descripciones para que se pueda ver completa"
- **L2** (2026-11-17): "Arrancamos". Decisiones: formato "CSV y xlsx, como el listado (Recomendado)"; contenido "Lo de la pantalla del detalle (Recomendado)".
- **L3** (2026-11-17): la tabla real de la pantalla no muestra fecha de cotización ni observaciones; el dueño: "sumalo".
- **L4** (2026-11-17): verificación: una compra sin ítems vivos exportaba solo el encabezado. El dueño: "imprimimos la cabecera y las columnas de los items vacias".
