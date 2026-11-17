# Exportación de una compra: cabecera arriba + PDF "Solicitud de compra"

Rediseño del Excel/CSV de una compra (cabecera, fila vacía, ítems) y un PDF premium imprimible.
Rama `feat/compra-export-secciones-y-pdf`. Sigue a `odd/tasks/export-compra-individual.md` (#547).

## Specs

- **S1** — "al exportar una compra con sus items la primer fila de lo exportado traiga los datos generales de la compra, luego haya una fila vacia y luego esten los items como se ven ahora". Decisión: "Fila de títulos + fila de valores": fila 1 títulos (Número, Fecha de solicitud, Motivo, Descripción, Tipo, Estado), fila 2 valores, fila 3 vacía, después el encabezado de ítems y los ítems. Aplica a CSV y xlsx.
- **S2** — Decisión: "No, solo columnas del ítem": las filas de ítem ya no repiten los datos de la compra. Las columnas de ítem son las de hoy (descripción, cantidad, proveedor, moneda, monto, total, fecha de cotización, aprobación, fechas de orden / recepción / entrega, comprado, entregado, observaciones).
- **S3** — Una compra sin ítems vivos: cabecera, fila vacía y el encabezado de ítems sin filas (reemplaza la fila de cabecera con ítems vacíos de L4 del documento anterior, que dejó de tener sentido con la cabecera arriba).
- **S4** — "que exista la posibilidad de imprimir la compra como si fuese un presupuesto o factura (con un formato premium), y que salga en PDF". Título del documento: "Solicitud de compra". No se titula "Factura": no es un comprobante fiscal.
- **S5** — Decisión: "Todos los no eliminados, con su estado": el PDF lista todos los ítems vivos, cada uno con su estado de aprobación.
- **S6** — Formato premium: logo del cliente (o su nombre si no hay logo), número y fecha, datos de la compra (motivo, descripción, tipo, estado, solicitante), tabla de ítems con descripción completa, cantidad, proveedor, precio unitario y total, totales por moneda, observaciones de los ítems, pie con fecha de generación y "Página X de Y".
- **S7** — Ruta `GET /compras/:id/pdf`, gate `COMPRAS:LECTURA`, misma visibilidad que el detalle (404 si el actor no ve la compra).
- **S8** — Botón "Imprimir PDF" en el detalle de la compra; la Ayuda lo documenta.
- **S9** — "eso mismo quiero ver en la pantalla, tanto en el listado como al acceder a la compra para ver sus items": el nombre del solicitante (nombre y apellido, como en el PDF) se ve como columna en el listado de compras y como dato en el detalle de la compra. El backend lo expone como `solicitanteNombre` (`null` si el usuario no se encuentra), igual que tickets.

## Tasks

- [x] **T1** — S1-S3 — backend: exportación por secciones (CSV/xlsx) + tests + Ayuda. Inline. Commit: `49deef29`
- [x] **T2** — S4-S7 — backend: PDF de la compra (pdfkit, patrón de `ticket-pdf`) + ruta + tests. Inline. Commit: `1298e96e`
- [x] **T4** — S9 — backend: `ResolverNombresSolicitantes` + `solicitanteNombre` en listado y detalle (el PDF lo reutiliza) + tests. Inline. Commit: `a111b333`
- [x] **T5** — S9 — frontend: columna Solicitante en el listado y dato en el detalle + tests + Ayuda. Inline. Commit: `764988df`
- [x] **T3** — S8 — frontend: botón PDF en el detalle + test + Ayuda. Inline. Commit: `69c972c5`

## Log

- **L1** (2026-11-17): "Me gustaria que al exportar  una compra con sus items la primer fila de lo exportado traiga los datos generales de la compra, luego haya una fila vacia y luego esten los items como se ven ahora. Ademas quiero que exista la posibilidad de imprimir la compra como si fuese un presupuesto o factura (con un formato premium), y que salga en PDF"
- **L2** (2026-11-17): decisiones: cabecera "Fila de títulos + fila de valores (Recomendado)"; ítems "No, solo columnas del ítem (Recomendado)"; título PDF "Solicitud de compra (Recomendado)"; ítems del PDF "Todos los no eliminados, con su estado (Recomendado)".
- **L3** (2026-11-17): verificador independiente → FAIL en S6, 2 bloqueantes y 1 advertencia: el encabezado "Moneda" se partía en dos líneas (blanco sobre blanco); importes desde 100.000.000,00 se partían en su columna; un texto de ~3000 caracteres invadía la franja del pie. Bugfix con TDD en `pdfkit-generador-pdf-compra.spec.ts`: RED observado en los 3 tests nuevos ("expected [...] to include 'Moneda'", "to include '999.999.999,99'", "to deeply equal []" con corridas en y=79.71), luego GREEN 10/10 con columnas rebalanceadas, fuente que se achica en celdas de una línea y margen inferior que incluye el pie.
- **L4** (2026-11-17): re-verificación de S6 → PASS en los 4 casos; hallazgo nuevo: una cantidad decimal de miles (`12.345,50`) se partía en la columna Cant. TDD: RED "expected [...] to include '999.999,99'", GREEN 11/11 ensanchando Cant. (32→46) y rebalanceando Descripción, Proveedor y Estado. El test de contenido de ítems pasó a comparar sin saltos de línea, porque la descripción puede ocupar varias líneas de su celda.
- **L5** (2026-11-17): el dueño revisó la muestra: "Esta perfecto, ademas veo el nombre del solicitante y esta muy bien, eso mismo quiero ver en la pantalla, tanto en el listado como al acceder a la compra para ver sus items".
