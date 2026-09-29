# Apply progress: catalogo-unico-componentes

Modo: estándar (feature, `strict_tdd` false). Store: openspec.

## WU-1 — Script de limpieza y precondición documentada (rama `feat/catalogo-unico-componentes-wu01`, a `main`)

Estado: **completo** (tareas 1.1 a 1.6 marcadas en `tasks.md`).

| Tarea | Resultado |
|---|---|
| 1.1 Modo reporte | `backend/scripts/limpiar-componentes-sin-insumo.mjs`: recorrido y `tenantUrl` iguales a `migrate-tenants.js`; lista filas, totales vivas/borradas y clientes fuera del recorrido; exit 0 sin filas, 2 con filas |
| 1.2 Modo `--apply --esperadas=N` | Recuenta y aborta sin borrar si el total difiere; `DELETE ... RETURNING id` por tenant en transacción con verificación de ids y `ROLLBACK` ante diferencia; `--apply` sin `--esperadas` falla (exit 1) |
| 1.3 Spec unit | `limpiar-componentes-sin-insumo.spec.ts` (16 tests, pools fake) |
| 1.4 Spec de integración | `limpiar-componentes-sin-insumo.integration.spec.ts` (4 tests), base tenant efímera hasta `20260928150000`; sin `usarLockMasterTest()` porque no usa `soporte_master_test` para datos |
| 1.5 Runbook | `DEPLOY-VPS-runbook.md`, sección "Precondición: componentes sin repuesto", con la nota de clientes inactivos o borrados fuera del recorrido |
| 1.6 Gates | lint 0 errores; typecheck limpio; specs de WU-1 20/20; `pnpm test` 495 archivos / 5691 tests verdes |

Decisiones de implementación:
- El script exporta `ejecutarLimpieza({ tenants, fuera, apply, esperadas, log })` para que los specs inyecten pools sin pasar por master; `main()` solo arma los pools y llama a esa función.
- Un fallo en un tenant durante `--apply` no revierte los tenants ya confirmados (cada tenant es su propia base); el mensaje informa cuántas filas se borraron y el runbook lo documenta.
- Sin PowerShell nuevo: corre con node en el VPS.

Diferencias respecto del diseño: ninguna.

## WU-2 — demo-seed con repuestos (rama `feat/catalogo-unico-componentes-wu02`)

Estado: **completo** (tareas 2.1 a 2.3 marcadas en `tasks.md`).

| Tarea | Resultado |
|---|---|
| 2.1 Seed | `demo-seed.ts`: `crearEquiposDemo` crea 2 insumos con `CrearInsumoUseCase` (familias `RAM` y `SSD`, unidad `UNI`, resueltas por código desde el tenant) y los agrega con `insumoId`, sin descuento de stock, en lugar de los componentes libres `RAM`/`DISCO` |
| 2.2 Spec | `demo-seed.integration.spec.ts`: los 2 componentes llevan `insumoId`, tipos `RAM`/`SSD`, 2 insumos; tras la segunda corrida no crecen insumos ni componentes |
| 2.3 Gates | lint 0 errores; typecheck limpio; `vitest run prisma_master/seeds` 20/20 |

Notas: la idempotencia ya la garantiza el gate `ticket.count() > 0` del bloque de siembra; el spec no trunca `soporte_master_test`, por eso no usa `usarLockMasterTest()`. Sin cambios de UI, sin deuda de Ayuda.
