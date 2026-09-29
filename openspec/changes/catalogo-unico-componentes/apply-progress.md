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

## WU-3 — Alta de un solo camino, capa de aplicación (rama `feat/catalogo-unico-componentes-wu03`)

Estado: **completo, sin commitear** (excede el presupuesto de 400 líneas; decide el orquestador). Tareas 3.1 a 3.5 marcadas en `tasks.md`.

| Tarea | Resultado |
|---|---|
| 3.1 Use case | `agregar-componente.use-case.ts` con un solo camino: `insumoId` obligatorio (vacío o ausente → `InsumoRepuestoInexistenteError`), guards de insumo y familia intactos, `tipoComponenteCodigo = familia.codigo`; sin `ITipoComponenteMasterChecker` (constructor de 4 colaboradores) |
| 3.2 DTO | `AgregarComponenteDto = { equipoId, insumoId, descripcion?, numeroSerie?, capacidad? }`. Cambio mínimo de compilación: `equipos.module.ts` (sin el checker en el factory) y el controller (`insumoId: dto.insumoId ?? ''`, sin `tipoComponenteCodigo`); el contrato HTTP completo es WU-4 |
| 3.3 Instalar | Solo JSDoc (sin "chequeo MASTER"); el spec de concurrencia pierde el fake del checker |
| 3.4 Spec | `agregar-componente.use-case.spec.ts` reescrito (16 tests): sin insumoId, cada guard con su error, alta válida verificando lo que recibe la entidad, familia propia TORNILLO, N del mismo tipo, sin dependencia MASTER. Un test del controller se ajustó al `''` |
| 3.5 Gates | lint 0 errores; typecheck limpio; `vitest run src/equipos` 28 archivos / 321 tests; `pnpm test` 495 archivos / 5690 tests verdes |

Entidad y mapper intactos (siguen escribiendo `tipoComponenteCodigo`, WU-6). Sin cambios de UI visibles por sí mismos; el 422 sin `insumoId` en HTTP se documenta en WU-4.

## WU-4 — Alta, borde HTTP (rama `feat/catalogo-unico-componentes-wu04`)

Estado: **completo** (tareas 4.1 a 4.6 marcadas en `tasks.md`).

| Tarea | Resultado |
|---|---|
| 4.1 DTO | `CreateComponenteHttpDto` con `@IsUUID() insumoId` obligatorio y `@IsOptional() @IsBoolean() descontarStock?`; sin `tipoComponenteCodigo` ni `@ValidateIf`. Se borra `InstalarComponenteDesdeDepositoHttpDto`. `ComponenteResponseDto` sin `tipoComponenteCodigo` y con `insumoId: string` (la entidad sigue nullable hasta WU-6, por eso un cast comentado en el mapper) |
| 4.2 Controller | `POST :id/componentes` resuelve `dto.descontarStock ?? true`: Instalar (usuario desde `@CurrentUser()`) o Agregar. Ruta `instalar-desde-deposito` borrada. Mapeo de errores sin cambios: los errores de tipo que quedan los siguen lanzando la entidad y la edición hasta WU-5 |
| 4.3 Specs de borde | `equipos.dto.spec.ts` (sin insumoId, `"false"`, whitelist descarta el tipo) y `equipos.controller.spec.ts` (omitido/true a Instalar, false a Agregar, usuario del JWT, sin `tipoComponenteCodigo` en la respuesta, ruta vieja inexistente) |
| 4.4 e2e | `equipos-instalar-desde-deposito.e2e.spec.ts` retargeteado a `POST :id/componentes`: omitido con SALIDA, `false` sin movimiento, sin stock con rollback, ruta vieja 404, `"false"` en texto 400, sin insumoId 400, tipo sobrante ignorado. Conserva `usarLockMasterTest()` |
| 4.5 Gates | lint 0 errores; typecheck limpio; `vitest run src/equipos` 28 archivos / 334 tests; `pnpm test` 212 archivos / 1592 tests |
| 4.6 Ayuda | Deuda anotada en el cuerpo del commit |

Diferencias respecto del diseño: ninguna. El frontend sigue llamando a la ruta retirada hasta WU-8 (estado intermedio no desplegable, ADR-7).

## WU-5 — Edición y lectura sin tipo; menos errores (rama `feat/catalogo-unico-componentes-wu05`)

Estado: **completo, sin commitear** (excede el presupuesto de 400 líneas; decide el orquestador). Tareas 5.1 a 5.6 marcadas en `tasks.md`.

| Tarea | Resultado |
|---|---|
| 5.1 Editar | `EditarComponenteUseCase(componenteRepo)`: solo `descripcion`, `numeroSerie`, `capacidad`; sin checker ni validación de tipo. `EditarComponenteHttpDto` sin `tipoComponenteCodigo` (el `whitelist` lo descarta); el controller ya no lo reenvía |
| 5.2 Obtener | `ObtenerEquipoUseCase(equipoRepo, componenteRepo, insumoRepo)`: `tipoNombre`/`tipoActivo` solo por `findFamiliasDeInsumos` (una consulta, omitida sin componentes); sin MASTER. Sin match → `null`/`false` (el display `"—"` es del frontend, WU-9) |
| 5.3 Errores | Borradas `TipoComponenteInactivoError` y `ComponenteVinculadoTipoInmutableError` y sus mapeos. **Desviación:** `TipoComponenteCodigoRequeridoError` se conserva (la entidad la emite en `create()`, WU-6): catálogo en **14** clases, no 13; llega a 13 en WU-6 |
| 5.4 Specs | Reescritos `editar-componente` y `obtener-equipo`; catálogo del controller a 14; test de que el controller no reenvía `tipoComponenteCodigo`/`insumoId` en el PATCH; test del DTO de edición con `whitelist` |
| 5.6 Módulo | Providers del checker conservados (`ListarTiposComponenteUseCase` aún lo inyecta, WU-10a); `Editar` y `Obtener` ya no lo inyectan |

Entidad y mapper intactos (`actualizar()` conserva su parámetro opcional `tipoComponenteCodigo`, que nadie pasa; se retira en WU-6). Sin cambio de UI propio de este WU: la Ayuda de edición se anota en WU-9.

## WU-6 — Contrato del esquema tenant (rama `feat/catalogo-unico-componentes-wu06`, base wu05b)

Estado: **completo** (tareas 6.1 a 6.7 marcadas en `tasks.md`).

| Tarea | Resultado |
|---|---|
| 6.1 Migración | `prisma_tenant/migrations/20260929120000_componentes_insumo_obligatorio/migration.sql`: una sola sentencia `DO $$` (guard sobre todas las filas con `insumo_id NULL`, `RAISE EXCEPTION` con la ruta del script; `SET NOT NULL`; `DROP INDEX`; `DROP COLUMN`). FK `RESTRICT` intacta |
| 6.2 Schema | `insumoId String` obligatorio, `insumo Insumo` no opcional, sin `tipoComponenteCodigo` ni su `@@index` |
| 6.3 Entidad y mapper | Entidad sin `tipoComponenteCodigo`, `insumoId: string`; `create()` falla con `InsumoRepuestoInexistenteError` ante un `insumoId` vacío; `actualizar()` sin el parámetro de tipo. Mapper y `AgregarComponenteUseCase` alineados. Se borra `TipoComponenteCodigoRequeridoError` (arrastre de WU-5) con su mapeo en el controller; el catálogo de errores del controller queda en **13**. Se retiran los casts `as string` de `equipos.dto.ts` y de `obtener-equipo.use-case.ts` |
| 6.4 Spec de migración | `prisma_tenant/componentes-insumo-obligatorio.integration.spec.ts` (base efímera hasta `20260928150000`): aborta con fila viva, aborta con fila solo borrada, pasa con tabla vacía (NOT NULL, sin columna, sin índice, FK `r`) |
| 6.5 Generate | `prisma generate` limpio; typecheck sin usos del campo retirado |
| 6.6 Adversarial | Sin el guard, los 3 tests del spec quedan en rojo; guard restaurado (no se commitea la mutación) |
| 6.7 Gates | lint 0 errores; typecheck limpio; `vitest run src/equipos prisma_tenant` 36 archivos / 403 tests; `pnpm test` 212 archivos / 1592 tests |

Entorno local: `soporte_tenant_test` estaba 3 migraciones atrás; se le aplicó `migrate deploy` (con el schema nuevo). Las bases tenant de dev NO se migraron: el script `limpiar-componentes-sin-insumo.mjs` (modo reporte) informa 2 filas vivas con `insumo_id NULL` (RAM y DISCO del "Notebook Dell Latitude 5420", demo libre) en un tenant, así que la migración abortaría ahí hasta correr el script con `--apply`.

## WU-7 — Operación: precondición en `deploy.ps1`, runbook, borrado del backfill (rama `feat/catalogo-unico-componentes-wu07`, base wu06)

Estado: **completo** (tareas 7.1 a 7.5 marcadas en `tasks.md`).

| Tarea | Resultado |
|---|---|
| 7.1 `deploy.ps1` | Paso 5a entre "Cargar backend/.env" y `prisma generate`: `Set-Location $BackendDir`, `& $NodeExe scripts/limpiar-componentes-sin-insumo.mjs` (sin argumentos, el script lee `DATABASE_URL_MASTER` del entorno ya cargado), exit 2 corta con mensaje que remite al runbook, cualquier otro exit falla por `AssertOk`; vuelve a `$RepoRoot`. ASCII sin BOM; se conserva CRLF (`eol=crlf` del `.gitattributes`) |
| 7.2 Specs | `deploy.ps1.spec.ts`: 3 tests estructurales (comando sin flags, orden respecto de `.env`/generate/builds/detener servicios, chequeo de exit 2 + `AssertOk`). `ps1-ascii.spec.ts` ya recorre todo `*.ps1` de la raíz: cubre el ASCII/BOM sin cambios |
| 7.3 Runbook | Sección "Precondición: componentes sin repuesto" reescrita (la mide el deploy, retiro posterior, recuperación P3009 con `migrate resolve --rolled-back 20260929120000_componentes_insumo_obligatorio`, recordatorio de clientes fuera del recorrido) y el paso 6 de "Qué hace, en orden" |
| 7.4 Backfill | Borrado `scripts/backfill-tipos-componente-codigo.js` y sus dos menciones en `eslint.config.js`. Quedan referencias en comentarios de dos migraciones históricas, que no se editan (checksums) |
| 7.5 Gates | lint 0 errores; typecheck limpio; `vitest run scripts` y `pnpm test`: ver reporte del orquestador |

## WU-8 — Frontend: diálogo único de alta (rama `feat/catalogo-unico-componentes-wu08`, base wu07)

Estado: **completo, sin commitear** (tareas 8.1 a 8.7 marcadas; el WU supera 400 líneas por el borrado de `componente-instalar-dialog` y sus tests, la decisión de corte es del orquestador).

| Tarea | Resultado |
|---|---|
| 8.1 | `agregarComponenteSchema` (`insumoId` uuid, `descontarStock` boolean, 3 textos) reemplaza a `instalarComponenteSchema`. `Componente` sin `tipoComponenteCodigo` y con `insumoId: string`; `CreateComponenteDto` espeja el DTO del backend. `componenteSchema` se conserva para el diálogo de edición (WU-9) |
| 8.2 | `componente-create-dialog.tsx` con repuesto obligatorio, casilla "Descontar del depósito" marcada por defecto, `descontarStock` siempre explícito; se borra `componente-instalar-dialog` (+ test) y su botón en `equipo-detail-view.tsx` |
| 8.3 | `useInstalarComponenteDesdeDeposito` borrado; `useAgregarComponente` invalida además stock, movimientos e insumos. `useTiposComponente` NO se borra: lo sigue importando `componente-edit-dialog.tsx` (WU-9) |
| 8.4 | Un solo botón de alta (la barra vive en `equipo-detail-view.tsx`, no en la sección) |
| 8.5 | Tests del diálogo y del hook reescritos; el de detalle afirma un solo botón |
| 8.6 | lint 0 errores; type-check limpio; `pnpm test` 212 archivos / 1592 tests |
| 8.7 | Deuda de Ayuda para el commit |

Transitorio para WU-9: `ComponenteConTipo` conserva `tipoComponenteCodigo: string` (edición y detalle aún lo leen) y el fixture de `componente-edit-dialog.test.tsx` fuerza `insumoId: null as unknown as string`.

## WU-7fix — El inventario no depende de la columna retirada (rama `feat/catalogo-unico-componentes-wu07fix`, base wu08)

Estado: **completo** (F.1 a F.4 marcadas en `tasks.md`).

| Tarea | Resultado |
|---|---|
| F.1 RED | `limpiar-componentes-sin-insumo.integration.spec.ts`: segundo `describe` sobre tenant efímero migrado hasta `20260929120000` inclusive (`reproducirSchemaPrevio` recibe el corte). 3 casos: la columna no existe, reporte exit 0 con total 0, `--apply --esperadas=0` exit 0. Falló contra el script anterior con `column c.tipo_componente_codigo does not exist` |
| F.2 GREEN | `inventariarTenant` lee el tipo con `to_jsonb(c) ->> 'tipo_componente_codigo'`: la muestra si la columna existe y da NULL (`(sin tipo)`) si no, sin nombrarla. Una sola consulta; `--apply --esperadas` sin cambios |
| F.3 Runbook | `migrate resolve` con `--config prisma.tenant.config.ts` y su motivo; lista proactiva del deploy del tracker (dump, reporte, `--apply --esperadas=N` tras confirmación del dueño, `deploy.ps1`); referencia al re-exec corregida a paso 3b |
| F.4 Gates | lint 0 errores; typecheck limpio; `vitest run scripts` 30 archivos / 377 tests; `pnpm test` 496 archivos / 5702 tests |

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| F.1/F.2 | `backend/scripts/limpiar-componentes-sin-insumo.integration.spec.ts` | Integration (tenant efímero) | 20/20 (unit + integration previos) | Written; falló: column does not exist (2 de 3 casos; el de precondición pasa) | 23/23 | Reporte y apply, sobre base migrada; la base pre-migración (tenant previo) se mantiene | Ninguno necesario |

Ayuda: sin cambios.

## WU-9 — Frontend: edición y display (rama `feat/catalogo-unico-componentes-wu09`, base wu07fix)

Estado: **completo** (tareas 9.1 a 9.5 marcadas en `tasks.md`).

| Tarea | Resultado |
|---|---|
| 9.1 | `componente-edit-dialog.tsx` sin selector ni `useTiposComponente`; el tipo es texto de solo lectura (`tipoNombre`, `"—"` si es null) con la nota de inmutabilidad. `componenteSchema` pasa a `editarComponenteSchema` (`descripcion`, `numeroSerie`, `capacidad`). Se elimina `tipoActualFueraDeCatalogo`. El PATCH no envía `tipoComponenteCodigo` ni `insumoId` (`EditarComponenteDto` sin el campo) |
| 9.2 | `equipo-componentes-section.tsx` (la vista de detalle solo monta la sección): fallback `"—"` sin nombre de tipo; el aviso "Dado de baja" solo aparece si hay nombre de tipo. `ordenar-componentes.ts`: clave `tipoNombre ?? ""` (los sin tipo van primero), luego descripcion y capacidad |
| 9.3 | Tests: edición (tipo de solo lectura, PATCH sin tipo ni insumo, fallback "—", familia dada de baja), orden (sin tipo), sección (fallback "—"), schema. Fixture transitorio `insumoId: null as unknown` reemplazado |
| 9.4 | lint 0 errores; type-check limpio; `pnpm test` 212 archivos / 1592 tests |
| 9.5 | Deuda de Ayuda para el commit |
Retirados de `equipos`: `useTiposComponente` (hook) y el tipo `TipoComponente`; `ComponenteConTipo.tipoComponenteCodigo`. La feature `tipos-componente` usa su propio hook `useTiposComponenteAdmin`, no importa nada de `equipos`. AGENTS.md:208 (`tipoActualFueraDeCatalogo`) queda para WU-12.
