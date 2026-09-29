# Tasks: catálogo único para los componentes de equipo

> **Desviación de presupuesto declarada.** La skill `sdd-tasks` limita este artefacto a 530
> palabras; lo supera por la misma causa que `spec.md` y `design.md`: 13 work units
> (WU-1 a WU-12, con WU-10 y WU-11 partidos en dos), cada uno con sus tareas, tests, comandos de
> verificación y límite de PR, más las correcciones del validador de diseño y las tareas
> operativas de deploy. Recortar cobertura para entrar en el presupuesto sería peor que
> declarar el excedente.

> **TDD en este ciclo: deshabilitado.** Es una feature, no una corrección de defecto
> (`~/proyectos/CLAUDE.md` §6.3). Modo estándar: el test viaja en el mismo commit que el código
> que verifica, sin exigir RED verificado antes de la implementación.

> **Ayuda: escritura suspendida** (`CLAUDE.md` del repo). Ningún WU escribe `backend/ayuda/*.md`.
> Los WU que cambian lo que el usuario ve o hace (WU-4, WU-8, WU-9, WU-11a) anotan la deuda en
> el cuerpo del commit y del PR: *"Ayuda pendiente: alta de componente desde el catálogo de
> repuestos, casilla 'Descontar del depósito' marcada por defecto, tipo derivado de la familia,
> edición sin tipo ni repuesto, pantalla ROOT de tipos de componente retirada"*.

> **Specs de `openspec/specs/`: no se editan en apply.** La reescritura de
> `openspec/specs/repuestos-autoridad-catalogo/spec.md` y el alta de
> `componentes-catalogo-unico` los hace `sdd-archive` a partir de los deltas de este ciclo.

## Correcciones al diseño (validador) incorporadas

Estos puntos son huecos de `design.md`; las tareas de abajo los cubren y **prevalecen** sobre el
diseño donde difieran.

1. **`tipo_componente_codigo` sigue NOT NULL en el esquema hasta WU-6.** WU-3, WU-4 y WU-5
   **deben seguir escribiendo** en esa columna el valor derivado (`familia.codigo`) para que cada
   unidad quede en verde. La entidad y el mapper dejan de escribirla **solo en WU-6** (mismo WU
   que la migración).
2. **Dependencias explícitas** (tabla más abajo): WU-8 después de WU-4; WU-10 después de WU-3 y
   WU-5.
3. **Retiro explícito de `GET /equipos/tipos-componente` y de
   `listar-tipos-componente.use-case.ts` (+ spec)**: tarea 10a.
4. **Orden de retiro:** el frontend admin de `tipos-componente` (WU-11) se integra **antes** que
   el módulo backend (WU-10), para que ninguna unidad deje la UI llamando endpoints retirados.
5. **Runbook:** los clientes inactivos o borrados quedan fuera del recorrido de
   `migrate-tenants`; se documenta en WU-1 y WU-7.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~3.100 (+/−) con tests, más borrado puro de ~55 archivos (WU-10/11) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | WU-1 a `main`; WU-2 a WU-12 (14 PR contando 10a/10b/11a/11b) en cadena sobre el tracker |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
400-line budget risk: High

**Por qué "No" a la decisión:** el dueño ya confirmó la estrategia (auto-chain,
feature-branch-chain), que WU-1 va primero a `main`, y el borrado de las 12 filas. La pregunta
abierta del diseño sobre `size:exception` queda resuelta por la política del dueño: los PR de
borrado puro por encima de 400 líneas **se parten** en costura limpia (backend/frontend o por
carpeta); `size:exception` solo si partir separa el código de sus tests. Por eso WU-10 y WU-11
vienen ya partidos.

| WU | Estimación (líneas +/−) | Riesgo |
|---|---|---|
| 1 | ~330 | Medio |
| 2 | ~90 | Bajo |
| 3 | ~380 (reescribe un spec de 536 líneas) | Alto |
| 4 | ~350 | Medio |
| 5 | ~380 | Alto |
| 6 | ~400 | Alto |
| 7 | ~200 | Bajo |
| 8 | ~380 | Alto |
| 9 | ~300 | Medio |
| 10a | ~150 borrado puro | Bajo |
| 10b | borrado puro (módulo `tipos-componente`, ~30 archivos), ≤400 | Medio |
| 11a | ~120 (ruta, navegación, comentarios) | Bajo |
| 11b | borrado puro (feature `tipos-componente`, ~25 archivos), ≤400 | Medio |
| 12 | ~60 | Bajo |

**Unidades en riesgo** (el tamaño real suele correr 1,5-2x la estimación de diseño): WU-3, WU-5,
WU-6 y WU-8. Líneas de corte ya identificadas si una se acerca a 400 reales, sin separar código
de sus tests:

- WU-3: dividir por caso de uso (`agregar` y `instalar-desde-deposito` en un PR; el resto en otro).
- WU-5: dividir por caso de uso (`editar` / `obtener-equipo`), con la eliminación de errores al final.
- WU-6: tipar `insumoId: string` en la entidad viaja antes, en WU-5; la migración, su spec de
  integración y el retiro de `tipoComponenteCodigo` de entidad y mapper **no se separan**.
- WU-8: separar `schemas.ts`/hooks del diálogo solo si cada mitad conserva sus tests.

## Cadena de PR y dependencias

Ramas: `feat/catalogo-unico-componentes-wuNN` (`wu10a`, `wu10b`, `wu11a`, `wu11b` para los
partidos). WU-1 sale de `main` y vuelve a `main`. **Cada PR hijo apunta a la rama del PR
inmediatamente anterior** de la cadena; solo el tracker `feat/catalogo-unico-componentes` se
integra a `main`, en un único release.

Orden de la cadena (WU-11 antes que WU-10, corrección 4):

`main` ← **wu01** (independiente, deploy propio)
tracker ← wu02 ← wu03 ← wu04 ← wu05 ← wu06 ← wu07 ← wu08 ← wu09 ← wu11a ← wu11b ← wu10a ← wu10b ← wu12

| WU | Depende de | Motivo |
|---|---|---|
| 1 | — | Entrega independiente a `main`; el script debe estar en el VPS antes de la ventana |
| 2 | 1 (solo cronológico) | Sin dependencia de código; deja el seed en el camino vinculado |
| 3 | 2 | El seed debe usar el camino vinculado antes de que el camino libre se retire |
| 4 | 3 | El controller enruta a los casos de uso ya reducidos a un camino |
| 5 | 3 | Edición y lectura sin el checker; comparten guards con agregar |
| 6 | 3, 4, 5 | La columna solo puede salir cuando nadie la lee ni la valida por MASTER |
| 7 | 6 | La precondición de `deploy.ps1` protege la migración que 6 introduce |
| 8 | **4** | Nuevo contrato del POST (`insumoId`, `descontarStock`) |
| 9 | 5, 8 | Edición sin tipo (5) y `schemas`/`types` ya migrados (8) |
| 11a | 8, 9 | La UI ya no usa `useTiposComponente`; se retira ruta y navegación |
| 11b | 11a | Nadie monta la feature |
| 10a | **3, 5**, 8, 9, 11b | Consumidores backend (3, 5) y frontend (8, 9, 11) del checker, del puerto y de `GET /equipos/tipos-componente` ya migrados |
| 10b | 10a | El módulo `tipos-componente` ya no tiene consumidores |
| 12 | 10b | Los specs de integración del módulo leen la tabla MASTER; primero se borra el código |

## Recordatorios operativos

- **`usarLockMasterTest()`**: todo spec nuevo o retargeteado que trunque `soporte_master_test`
  lo llama antes de su `describe` (el e2e de `equipos-instalar-desde-deposito` ya lo hace, `:108`).
  Los specs de integración de WU-1 y WU-6 usan base tenant **efímera** y no lo necesitan.
- **Higiene de base efímera**: limpiar filas → `app.close()` → `dropDatabase`. Al revés, el DROP
  falla en silencio.
- **`deploy.ps1`** es 100 % ASCII y sin BOM (`ps1-ascii.spec.ts` lo verifica).
- **Conventional Commits, sin atribución de IA. No commitear desde este ciclo de tasks**; el
  apply commitea por WU.
- **Nunca hardcodear el nombre de la base de un tenant real**; consultar `clientes`.

---

## WU-1 — Script de limpieza y precondición documentada (a `main`, deploy propio)

**Branch**: `feat/catalogo-unico-componentes-wu01` · **Base**: `main` · **PR**: a `main`,
fuera de la cadena. Se despliega en un deploy ordinario **antes** de integrar el tracker.

- [x] 1.1 Crear `backend/scripts/limpiar-componentes-sin-insumo.mjs` (ESM, `pg` directo, sin leer `dist/`). Recorre el mismo conjunto de tenants que `migrate-tenants.js:62` con la misma derivación de URL (`tenantUrl`). Modo reporte (sin flags): lista por tenant cada fila con `insumo_id NULL` (id, equipo, `tipo_componente_codigo`, "viva" o "borrada lógicamente el …"), totales vivas/borradas y **clientes fuera del recorrido (inactivos o borrados)**; exit 0 sin filas, 2 con filas. (Req: La migración del tenant es fail-closed)
- [x] 1.2 Modo `--apply --esperadas=N`: recuenta; si el total ≠ N aborta **sin borrar nada**; si coincide, por tenant `DELETE … WHERE insumo_id IS NULL RETURNING id` en una transacción; si los ids difieren de los inventariados, `ROLLBACK` y aborta. Exit 0 ok, 1 error o desacuerdo. `--apply` sin `--esperadas` no hace nada y falla. (Req: La migración del tenant es fail-closed)
- [x] 1.3 Escribir `backend/scripts/limpiar-componentes-sin-insumo.spec.ts` (unit): parseo de flags; `--apply` sin `--esperadas` o con un número distinto no borra.
- [x] 1.4 Escribir `backend/scripts/limpiar-componentes-sin-insumo.integration.spec.ts` en base tenant **efímera** reproducida hasta `20260928150000` (molde `backfill-correo-clientes.integration.spec.ts`): fixtures de fila viva, borrada y vinculada; el reporte cuenta 2; `--apply` con número incorrecto no borra; con el correcto borra solo las 2 con `insumo_id NULL` y deja la vinculada.
- [x] 1.5 Agregar a `DEPLOY-VPS-runbook.md` la sección "Precondición: componentes sin repuesto": cómo correr el reporte, qué significa exit 2, cómo aplicar con `--esperadas`, y la **nota de que los clientes inactivos o borrados quedan fuera del recorrido de `migrate-tenants`** (el reporte los lista; la limpieza y la migración no los tocan, y hay que revisarlos a mano antes de reactivarlos).
- [x] 1.6 Quality gates (backend): `pnpm lint` · `pnpm typecheck` · `pnpm vitest run scripts/limpiar-componentes-sin-insumo.spec.ts scripts/limpiar-componentes-sin-insumo.integration.spec.ts`.

**Verificación**: `cd backend && pnpm lint && pnpm typecheck && pnpm test`
**PR boundary**: ~330 líneas, a `main`. Revert limpio: el script es aditivo y sin consumidores.
**Real**: 709 líneas (script 301, specs 334, runbook 45, artefactos 29). Se entrega con
`size:exception`: partir separaría el script de los tests que prueban su borrado
transaccional, que es el caso de excepción de la política del dueño.
Commit `feat(scripts): limpiar componentes sin insumo con reporte y apply verificado`.

## WU-2 — demo-seed con repuestos (camino vinculado de hoy)

**Branch**: `feat/catalogo-unico-componentes-wu02` · **Base**: tracker
(`feat/catalogo-unico-componentes`)

- [ ] 2.1 Modificar `backend/prisma_master/seeds/demo-seed.ts`: crear 2 insumos con `CrearInsumoUseCase` (familias `RAM` y `SSD`, unidad `UNI`) y agregarlos como componentes con `insumoId`, **sin descuento** de stock, en lugar de los componentes libres `RAM`/`DISCO`. (Req: El alta de un componente exige un insumo repuesto válido)
- [ ] 2.2 Ajustar o agregar el spec del seed para verificar que los componentes sembrados llevan `insumoId` y que el seed sigue siendo idempotente.
- [ ] 2.3 Quality gates: `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run prisma_master/seeds`.

**PR boundary**: ~90 líneas, base tracker. El seed usa hoy el camino vinculado ya existente, así
que queda en verde con el código actual.

## WU-3 — Alta de un solo camino, capa de aplicación

**Branch**: `feat/catalogo-unico-componentes-wu03` · **Base**: wu02

**Regla de compatibilidad (corrección 1):** `tipo_componente_codigo` sigue NOT NULL en el
esquema. La entidad y el mapper **siguen escribiendo** `tipoComponenteCodigo`; este WU solo cambia
de dónde sale el valor: siempre `familia.codigo`. No se toca `componente-equipo.entity.ts` ni el
mapper (eso es WU-6).

- [ ] 3.1 Reducir `agregar-componente.use-case.ts` a un camino: `insumoId` obligatorio; conservar los guards de insumo y familia con sus errores propios; derivar el tipo de `insumo.familia` y pasar `familia.codigo` a `tipoComponenteCodigo` de la entidad. Quitar la dependencia de `ITipoComponenteMasterChecker`. (Req: El alta exige un insumo repuesto válido; El tipo se deriva de la familia)
- [ ] 3.2 Cambiar `AgregarComponenteDto` de aplicación a `{ equipoId, insumoId, descripcion?, numeroSerie?, capacidad? }` (sin `tipoComponenteCodigo`). Si el tipado obliga a tocar el controller para compilar, el cambio **mínimo** viaja en este WU; el contrato HTTP completo es WU-4.
- [ ] 3.3 `instalar-componente-desde-deposito.use-case.ts`: solo JSDoc (ya no hay "chequeo MASTER"); la lógica no cambia.
- [ ] 3.4 Reescribir `agregar-componente.use-case.spec.ts`: alta sin `insumoId` falla; cada guard rechaza con su error propio; alta válida con tipo = `familia.codigo` (verificar que **la entidad recibe ese valor**); familia propia del tenant sin catálogo global se vincula; ausencia de dependencia MASTER. Ajustar el spec de `instalar-...` si el DTO cambia. (Escenarios: Alta sin insumoId; Cada guard rechaza; Alta válida; Familia propia del tenant)
- [ ] 3.5 Quality gates: `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos/application`. La suite completa `pnpm test` debe quedar verde (consumidores del checker y del DTO viejo se ajustan aquí o siguen intactos).

**PR boundary**: ~380 líneas, base wu02. Si crece, dividir por caso de uso (ver forecast).

## WU-4 — Alta, borde HTTP: `descontarStock`, retiro de la ruta, e2e

**Branch**: `feat/catalogo-unico-componentes-wu04` · **Base**: wu03

Sigue escribiendo `tipo_componente_codigo` (derivado) vía la entidad; no toca esquema.

- [ ] 4.1 `equipos.dto.ts`: `CreateComponenteHttpDto` con `@IsUUID() insumoId` y `@IsOptional() @IsBoolean() descontarStock?`, **sin** `tipoComponenteCodigo` (se descarta por `whitelist`, ADR-2). Sin conversión implícita: `"false"` en texto da 400. `ComponenteResponseDto` (POST, PATCH, reactivar) **sin** `tipoComponenteCodigo`, con `insumoId: string` (ADR-6). (Req: Un solo flujo de alta; El tipo se deriva de la familia)
- [ ] 4.2 `equipos.controller.ts`: en `POST :id/componentes` resolver `dto.descontarStock ?? true`; `true` → `InstalarComponenteDesdeDepositoUseCase` (usuario desde `@CurrentUser()`), `false` → `AgregarComponenteUseCase`. Mismo `@RequiereAcciones('EQUIPOS:ALTAS')`. **Borrar** la ruta `POST :id/componentes/instalar-desde-deposito`. Quitar del mapeo de errores los que ya no se lanzan en el alta (las clases se borran en WU-5). (ADR-1)
- [ ] 4.3 Specs de borde: `equipos.dto.spec.ts` (sin `insumoId` da 400; `"false"` da 400; `tipoComponenteCodigo` sobrante se descarta con `validate(dto, { whitelist: true })`, molde `insumos.dto.spec.ts:95`) y `equipos.controller.spec.ts` (omitido o `true` llama a Instalar; `false` llama a Agregar). (Escenarios: Descuento por defecto; Alta sin descuento; Un tipo enviado en el request no define el tipo)
- [ ] 4.4 Retargetear `equipos-instalar-desde-deposito.e2e.spec.ts` a `POST :id/componentes`: omitido → componente y SALIDA; `false` → sin movimiento; sin stock → nada queda escrito (rollback); ruta vieja `instalar-desde-deposito` → 404; `tipoComponenteCodigo` sobrante no cambia el tipo derivado. Conserva `usarLockMasterTest()`. (Escenarios: Falla la SALIDA y se revierte el alta; Alta sin descuento)
- [ ] 4.5 Quality gates: `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos/interface` y `pnpm test`.
- [ ] 4.6 Anotar la **deuda de Ayuda** en el commit y en el cuerpo del PR.

**PR boundary**: ~350 líneas, base wu03.

## WU-5 — Edición y lectura sin tipo; menos errores

**Branch**: `feat/catalogo-unico-componentes-wu05` · **Base**: wu04

Sigue escribiendo `tipo_componente_codigo` (el componente conserva el valor derivado al crearse; la
edición no lo modifica). La entidad y el mapper no se tocan (WU-6).

- [ ] 5.1 `editar-componente.use-case.ts`: solo `descripcion`, `numeroSerie`, `capacidad`; un `tipoComponenteCodigo` o un `insumoId` sobrantes no cambian nada (ADR-2). Quitar el checker y la validación de tipo. `PATCH` DTO sin esos campos. (Req: La edición no cambia el tipo ni el insumo)
- [ ] 5.2 `obtener-equipo.use-case.ts`: resolver `tipoNombre` y `tipoActivo` **solo** por `findFamiliasDeInsumos`; sin consulta a MASTER; fallback de display `"—"` (ADR-6). `ComponenteConTipoResponseDto` conserva `tipoNombre`/`tipoActivo`. (Req: El display del tipo resuelve por la familia del tenant; escenarios Familia activa/desactivada)
- [ ] 5.3 Borrar de `equipos.errors.ts` `TipoComponenteCodigoRequeridoError`, `TipoComponenteInactivoError` y `ComponenteVinculadoTipoInmutableError`: el catálogo queda en **13 clases**, y eliminar sus mapeos en el controller y sus specs. (Req: RepuestoSinTipoEnCatalogoError y los errores del camino de texto libre dejan de existir)
- [ ] 5.4 Actualizar specs: `editar-componente.use-case.spec.ts`, `obtener-equipo.use-case.spec.ts`, el spec del catálogo de errores (recuento 13) y el del controller (PATCH ignora campos sobrantes). (Escenarios: Edición de datos propios; Intento de cambiar el insumo; Reemplazo como retiro más alta; Retiro sin stock)
- [ ] 5.5 Quality gates: `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos` y `pnpm test`.
- [ ] 5.6 Los componentes `equipos.module.ts` (providers del checker) **se conservan** hasta WU-10a.

**PR boundary**: ~380 líneas, base wu04. Si crece, dividir `editar` / `obtener-equipo`.

## WU-6 — Contrato del esquema tenant (migración fail-closed)

**Branch**: `feat/catalogo-unico-componentes-wu06` · **Base**: wu05

Prerrequisitos: WU-3, WU-4 y WU-5 integrados (ningún código lee ni valida `tipo_componente_codigo`
contra MASTER). **En este WU**, y no antes, la entidad y el mapper dejan de escribir
`tipoComponenteCodigo`.

- [ ] 6.1 Crear la migración tenant `backend/prisma_tenant/migrations/<timestamp>_componentes_insumo_obligatorio/migration.sql` con la **única sentencia `DO $$`** del ADR-4: guard `count(*)` sobre **todas** las filas (sin filtrar `deleted_at`) → `RAISE EXCEPTION` con el mensaje que nombra el script; `SET NOT NULL` en `insumo_id`; `DROP INDEX "componentes_equipo_tipo_componente_codigo_idx"`; `DROP COLUMN "tipo_componente_codigo"`. FK `RESTRICT` intacta. (Req: La migración del tenant es fail-closed)
- [ ] 6.2 `backend/prisma_tenant/schema.prisma`: `insumoId String` obligatorio, sin `tipoComponenteCodigo` ni su `@@index`.
- [ ] 6.3 Entidad `componente-equipo.entity.ts`: sin `tipoComponenteCodigo`, `insumoId: string`; `create()` conserva `Result` y falla con `InsumoRepuestoInexistenteError` ante un `insumoId` vacío. Mapper y repositorio Prisma alineados; `AgregarComponenteUseCase` deja de pasar el tipo. Ajustar specs de entidad, mapper y `prisma-equipos.integration.spec.ts` / concurrencia con fixtures de insumo.
- [ ] 6.4 Escribir el spec de integración de la migración en base tenant **efímera** reproducida hasta `20260928150000` (molde `backfill-correo-clientes.integration.spec.ts`): aborta con una fila viva; aborta con una fila **solo borrada lógicamente**; pasa con la tabla vacía; al pasar deja NOT NULL, sin columna, sin índice y con la FK `RESTRICT`. (Escenarios: Fila viva con insumo_id NULL; Fila borrada lógicamente; Migración exitosa; Tenant nuevo con tabla vacía)
- [ ] 6.5 Ejecutar `pnpm prisma generate --schema prisma_tenant/schema.prisma` y verificar que ningún `import` usa el campo retirado.
- [ ] 6.6 Verificación adversarial local (no se commitea): quitar el guard de la migración debe dejar el spec en rojo.
- [ ] 6.7 Quality gates: `cd backend && pnpm lint && pnpm typecheck && pnpm test`.

**PR boundary**: ~400 líneas, base wu05 (riesgo). Migración irreversible: revertir el código
sin restaurar el dump deja código viejo contra esquema nuevo (ver "Rollback").

## WU-7 — Operación: precondición en `deploy.ps1`, runbook, borrado del backfill

**Branch**: `feat/catalogo-unico-componentes-wu07` · **Base**: wu06

- [ ] 7.1 `deploy.ps1`: un paso nuevo inmediatamente después de "Cargar backend/.env" y **antes** de `prisma generate` y de los builds, que corre `& $NodeExe scripts/limpiar-componentes-sin-insumo.mjs` en modo reporte seguido de `AssertOk`. Si quedan filas, el deploy corta con `dist/` intacto. 100 % ASCII, sin BOM. (ADR-3)
- [ ] 7.2 `scripts/deploy.ps1.spec.ts` y `ps1-ascii.spec.ts`: el paso existe, ocurre antes de `prisma generate`, va seguido de `AssertOk`, y el archivo sigue siendo ASCII sin BOM.
- [ ] 7.3 `DEPLOY-VPS-runbook.md`: documentar el paso nuevo de `deploy.ps1`, la recuperación **P3009** (limpiar ese tenant y `prisma migrate resolve --rolled-back <migración>` con `DATABASE_URL_TENANT` de ese tenant, luego re-correr `deploy.ps1`), que la precondición se retira en un cambio posterior (mismo patrón que D18, `runbook:83-91`), y **de nuevo que los clientes inactivos o borrados están fuera del recorrido de `migrate-tenants`**.
- [ ] 7.4 Borrar `backend/scripts/backfill-tipos-componente-codigo.js` (one-off cumplido) y sus referencias en `backend/eslint.config.js:287,343`.
- [ ] 7.5 Quality gates: `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run scripts/deploy.ps1.spec.ts scripts/ps1-ascii.spec.ts` y `pnpm test`.

**PR boundary**: ~200 líneas, base wu06. No agrega un `.ps1`, así que no toca la tabla §2.2 de
`~/proyectos/CLAUDE.md`; solo modifica `deploy.ps1`, que ya figura en ella.

## WU-8 — Frontend: diálogo único de alta

**Branch**: `feat/catalogo-unico-componentes-wu08` · **Base**: wu07 · **Depende de WU-4**
(nuevo contrato del POST).

- [ ] 8.1 `frontend/src/features/equipos/schemas.ts`: `agregarComponenteSchema` (`insumoId: z.string().uuid()`, `descontarStock: z.boolean()`, 3 textos) reemplaza a `instalarComponenteSchema`; `types.ts`: `Componente` sin `tipoComponenteCodigo`, con `insumoId: string`. La autoridad es el DTO del backend.
- [ ] 8.2 `componente-create-dialog.tsx`: repuesto obligatorio y `Checkbox` "Descontar del depósito" **marcado por defecto**; envía siempre `descontarStock` explícito; siempre `POST /equipos/:id/componentes`. Borrar `componente-instalar-dialog.tsx` (+ test): absorbido. (Req: Un solo flujo de alta con descuento opcional)
- [ ] 8.3 `hooks/use-equipos.ts` sin `useTiposComponente`; `hooks/use-equipo-mutations.ts` sin `useInstalarComponenteDesdeDeposito`; `useAgregarComponente` invalida además stock y movimientos.
- [ ] 8.4 `equipo-componentes-section.tsx`: un solo botón de alta.
- [ ] 8.5 Tests (MSW + `renderWithProviders`): casilla marcada por defecto; el payload lleva `descontarStock` explícito en ambos estados; sin selector de tipo libre; invalidaciones de stock y movimientos.
- [ ] 8.6 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm test`.
- [ ] 8.7 Anotar la **deuda de Ayuda** en commit y PR.

**PR boundary**: ~380 líneas, base wu07.

## WU-9 — Frontend: edición y display

**Branch**: `feat/catalogo-unico-componentes-wu09` · **Base**: wu08

- [ ] 9.1 `componente-edit-dialog.tsx`: sin selector de tipo ni de insumo; el tipo se muestra como texto de solo lectura; `editarComponenteSchema` con `descripcion`, `numeroSerie`, `capacidad`. Se elimina `tipoActualFueraDeCatalogo` y el flag que lo alimenta. (Req: La edición no cambia el tipo ni el insumo)
- [ ] 9.2 `equipo-detail-view.tsx`, `ordenar-componentes.ts`: fallback de display `"—"` cuando no hay nombre de tipo; orden sin depender de `tipoComponenteCodigo`.
- [ ] 9.3 Tests de los cuatro archivos tocados; el PATCH ya no envía `tipoComponenteCodigo` (compatibilidad del bundle viejo cubierta por ADR-2 en backend).
- [ ] 9.4 Quality gates: `cd frontend && pnpm lint && pnpm type-check && pnpm test`.
- [ ] 9.5 Anotar la **deuda de Ayuda** en commit y PR.

**PR boundary**: ~300 líneas, base wu08.

## WU-11a — Frontend: ruta y navegación de `tipos-componente` (antes de WU-10)

**Branch**: `feat/catalogo-unico-componentes-wu11a` · **Base**: wu09

- [ ] 11a.1 Borrar `frontend/src/app/(dashboard)/admin/tipos-componente/**` (incluido el `layout.tsx` que gatea la ruta).
- [ ] 11a.2 `frontend/src/shared/nav/nav-config.ts`: quitar la entrada ROOT (`:181-185`) y ajustar `nav-config.test`; actualizar comentarios de `root-access.ts`, `root-layout-gate.ts` y `feriados-globales` que mencionan la ruta retirada. (Escenario: Pantalla y navegación retiradas)
- [ ] 11a.3 Quality gates: `cd frontend && pnpm lint && pnpm type-check && pnpm test`.
- [ ] 11a.4 Anotar la **deuda de Ayuda** (pantalla ROOT retirada) en commit y PR.

**PR boundary**: ~120 líneas, base wu09. Después de este PR la UI ya no llama a ningún endpoint de
`tipos-componente`.

## WU-11b — Frontend: feature `tipos-componente`

**Branch**: `feat/catalogo-unico-componentes-wu11b` · **Base**: wu11a

- [ ] 11b.1 Borrar `frontend/src/features/tipos-componente/**` (componentes, hooks, api, schemas, tests). Verificar con `rg "tipos-componente" frontend/src` que no queda ninguna referencia.
- [ ] 11b.2 Quality gates: `cd frontend && pnpm lint && pnpm type-check && pnpm test`.

**PR boundary**: borrado puro, ≤400 líneas, base wu11a. Separa el código de la ruta que lo montaba
(costura por carpeta, no de código contra sus tests: los tests se borran junto al código).

## WU-10a — Backend: checker, puerto y `GET /equipos/tipos-componente`

**Branch**: `feat/catalogo-unico-componentes-wu10a` · **Base**: wu11b · **Depende de WU-3 y WU-5**
(consumidores del checker) y de WU-8, WU-9, WU-11 (consumidores frontend del endpoint).

- [ ] 10a.1 Borrar **`GET /equipos/tipos-componente`** del controller de equipos y su DTO de respuesta. (Req: El catálogo MASTER de tipos de componente no existe; escenario Endpoints retirados)
- [ ] 10a.2 Borrar `listar-tipos-componente.use-case.ts` y su `.spec.ts`; quitarlo de `equipos.module.ts`.
- [ ] 10a.3 Borrar el checker `ITipoComponenteMasterChecker`, su implementación y el puerto MASTER, y sus providers en `equipos.module.ts`.
- [ ] 10a.4 Actualizar specs del controller y del módulo. Agregar al e2e de equipos: `GET /equipos/tipos-componente` → 404.
- [ ] 10a.5 Quality gates: `cd backend && pnpm lint && pnpm typecheck && pnpm test`.

**PR boundary**: ~150 líneas, base wu11b.

## WU-10b — Backend: módulo `tipos-componente`

**Branch**: `feat/catalogo-unico-componentes-wu10b` · **Base**: wu10a

- [ ] 10b.1 Borrar `backend/src/tipos-componente/**` (5 endpoints ROOT con `GlobalAdminGuard`, use cases, repositorio, DTOs, specs) y quitar el import de `app.module.ts:7`.
- [ ] 10b.2 Agregar un e2e mínimo (o ampliar uno existente) que verifique 404 en los 5 endpoints retirados, con `usarLockMasterTest()` si trunca `soporte_master_test`. (Escenario: Endpoints retirados)
- [ ] 10b.3 Verificar `rg "tipos-componente|TiposComponente" backend/src` sin referencias vivas.
- [ ] 10b.4 Quality gates: `cd backend && pnpm lint && pnpm typecheck && pnpm test`.

**PR boundary**: borrado puro ≤400 líneas, base wu10a. Si supera 400, partir por carpeta
(`application/` e `infrastructure/`); `size:exception` solo si partir separa código de sus tests.

## WU-12 — DROP MASTER y `AGENTS.md`

**Branch**: `feat/catalogo-unico-componentes-wu12` · **Base**: wu10b

- [ ] 12.1 `backend/prisma_master/schema.prisma`: quitar el modelo `TipoComponente` y la migración master nueva `DROP TABLE "tipos_componente"`, **sin `rollback.sql`** (ADR-5). No editar migraciones viejas. (Escenario: Tabla MASTER eliminada)
- [ ] 12.2 Ajustar cualquier seed o spec master que aún referencie la tabla; `pnpm prisma generate --schema prisma_master/schema.prisma`.
- [ ] 12.3 `AGENTS.md:208`: dejar de citar `tipoActualFueraDeCatalogo` de `componente-edit-dialog` (desaparece); pasa a citar la prioridad del ticket (`:212`).
- [ ] 12.4 `AGENTS.md:216-220`: los 8 campos pasan a 6, aclarando que los 2 de `tipos-componente` dejaron de existir.
- [ ] 12.5 Quality gates: `cd backend && pnpm lint && pnpm typecheck && pnpm test`; `cd frontend && pnpm lint && pnpm type-check && pnpm test`. `openspec/specs/**` **no se edita** (lo hace `sdd-archive`).

**PR boundary**: ~60 líneas, base wu10b. Última unidad de la cadena; con ella el tracker queda
listo para integrarse a `main`.

---

## Tareas operativas del deploy (ejecuta el dueño; fuera de `sdd-apply`)

Runbook: `DEPLOY-VPS-runbook.md`. Estas casillas no las marca `sdd-apply`; se cierran en la
ventana de despliegue.

- [ ] OP.1 Mergear WU-1 a `main` y hacer un deploy ordinario (el script queda en disco del VPS).
- [ ] OP.2 En producción, correr `node scripts/limpiar-componentes-sin-insumo.mjs` en **modo reporte**. Confirmar 12 filas (9 vivas y 3 borradas lógicamente: Cic Lanus 8+3, Santa Cruz 1) y revisar la lista de clientes fuera del recorrido.
- [ ] OP.3 Integrar el tracker `feat/catalogo-unico-componentes` a `main` (una sola vez) tras el verify y el archive del ciclo.
- [ ] OP.4 Ventana: `predeploy-dump.ps1 -DryRun`, luego la corrida real (servicios detenidos).
- [ ] OP.5 Correr de nuevo el reporte; esperar N = 12.
- [ ] OP.6 **Tras confirmación del dueño**: `node scripts/limpiar-componentes-sin-insumo.mjs --apply --esperadas=12`.
- [ ] OP.7 Correr el reporte otra vez: exit 0.
- [ ] OP.8 Correr `deploy.ps1` (pull → precondición → build → `migrate:master` DROP → `migrate:tenants` → arranque).
- [ ] OP.9 Verificar: `\d componentes_equipo` en un tenant (NOT NULL, sin `tipo_componente_codigo`, sin índice, FK presente) y `tipos_componente` ausente en master.

## Rollback

Código: `git revert` del merge del tracker (y de WU-1 si se quiere). **Datos:** el DROP de la
columna, el de la tabla MASTER y el borrado de las 12 filas solo se revierten restaurando el dump
(runbook, "Restore de datos"). Revertir el código sin restaurar deja código viejo contra esquema
nuevo. Si la precondición corta, no cambió nada.
