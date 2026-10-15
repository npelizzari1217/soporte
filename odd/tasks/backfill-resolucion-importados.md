# Resolución aproximada de los tickets importados (2026-10-15)

## Objetivo
Que los tickets resueltos o cerrados sin ningún paso a RESUELTO en su historial (tickets importados)
tengan `resolucion_habil_s`, aproximada con las horas hábiles desde `created_at` hasta
`fecha_cierre`, para que el promedio de resolución del dashboard cubra el período histórico.

## Problema y porqué
- En el deploy del 2026-10-15 (`889d7e7a`), el script `backend/scripts/backfill-tiempos-habiles.mjs`
  salteó 5735 tickets en 8 tenants: su historial no tiene ningún `CAMBIO_ESTADO`, solo comentarios
  (por ejemplo, un tenant con 2552 tickets CERRADO, CORRIDO, creados entre 2024-04 y 2026-09).
- Solo 21 tickets quedaron con valor de resolución: el promedio del dashboard casi no cubre la
  historia, cuando el código anterior la contaba con `fecha_cierre - created_at` (horas corridas).

## Decisión del dueño (2026-10-15)
- Los tickets sin paso a RESUELTO toman un valor **aproximado**: horas hábiles `created_at →
  fecha_cierre`, con el calendario actual del tenant (mismo criterio que el resto del backfill).
- Es una aproximación aceptada: `fecha_cierre` es el momento del cierre (no de la resolución) y no
  descuenta pausas.

## Alcance
- Solo el script de backfill y su spec, más el runbook y este documento.
- Si el ticket tiene paso a RESUELTO, manda el último paso (sin cambios). `fecha_cierre` se usa solo
  cuando no hay ninguno. Sin `fecha_cierre` el ticket sigue salteado.
- El `UPDATE` de la aproximación exige además que el ticket siga sin ningún paso a RESUELTO al
  escribir (si apareció uno, lo toma la corrida siguiente con el criterio normal).
- Fuera de alcance: el pliegue del reloj y el dashboard (no cambian).

## Criterios de aceptación
- CA1: un ticket RESUELTO/CERRADO sin paso a RESUELTO y con `fecha_cierre` recibe las horas hábiles
  `created_at → fecha_cierre`.
- CA2: un ticket con paso a RESUELTO sigue usando el último paso, aunque tenga `fecha_cierre`.
- CA3: un ticket sin paso a RESUELTO y sin `fecha_cierre` se saltea y se cuenta.
- CA4: el resultado informa por separado cuántos se aproximaron con `fecha_cierre`.
- CA5: si entre la lectura y la escritura aparece un paso a RESUELTO en un ticket que se iba a
  aproximar, no se escribe.
- CA6: una segunda corrida con `--apply` da 0 actualizados.

## Tareas
- [x] **T1 — Aproximación por `fecha_cierre` en el script** (CA1-CA6). Ruta: delegada (escritor
  único: script, spec y runbook).
  - Script: la lectura trae `fecha_cierre`; fin = `fin ?? fecha_cierre`; las filas aproximadas van
    con `finId` NULL y se cuentan en `aproximados`. `SIGUE_RESUELTO` compara contra
    `COALESCE(<created_at de fin_id>, '-infinity')`: en una fila aproximada cualquier paso a RESUELTO
    bloquea la escritura (sin el COALESCE, la comparación contra NULL dejaba pasar el valor).
    `formatearResultado` muestra `aproximados N (con fecha_cierre, sin paso a RESUELTO)`.
  - Spec: `ticket()` acepta `fechaCierre` (nullable); `d-sin-historial` se aproxima a 12 h (CA1);
    `a-reabierto` sigue con el último RESUELTO pese a su `fecha_cierre` (CA2); `i-sin-cierre` queda
    salteado (CA3); conteos de ensayo, `--apply` y segunda corrida con `aproximados` (CA4, CA6);
    `j-aproximado-en-carrera` inserta un paso a RESUELTO antes del `UPDATE` y queda NULL (CA5).
  - Runbook: paso 3 de "Tiempos hábiles del dashboard".
  - Evidencia: `pnpm vitest run scripts/backfill-tiempos-habiles.integration.spec.ts` → 8 tests pasan;
    eslint y prettier limpios. Mutación: sin el COALESCE falla solo `j-aproximado-en-carrera`.
  - Datos de prod (solo lectura, 2026-10-15), tickets resueltos sin valor: 5735, todos con
    `fecha_cierre`; 60 con `fecha_cierre` anterior a `created_at` (`msHabilesEntre` devuelve 0: no
    viola el CHECK); el rango más largo es de 362 días (la cota del cálculo es ~10 años). La mediana
    del intervalo corrido es 0 o 24 h según el tenant: los datos importados tienen precisión de día,
    así que la aproximación es gruesa.
- [ ] **T2 — Cierre y corrida en prod**: compuertas del backend, merge (decisión del dueño), deploy
  y el script en ensayo y con `--apply`.

## Ruta y entrega
- RDD apagada. Feature: TDD no exigido, pero la tarea lleva sus tests.
- Previsión: menos de 150 líneas; `single-pr`. GitHub en pausa: commit por tarea y merge local.

## Progreso
- 2026-10-15: documento creado tras la decisión del dueño.
- 2026-10-15: T1 hecha.

## Próximo paso
T2.
