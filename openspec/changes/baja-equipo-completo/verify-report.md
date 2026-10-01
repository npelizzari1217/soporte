```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:367e8d95c2ab770d8f9fe6c43bd611cbb5ed6cf7ac22eb942bee58c7530c6537
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 19/19
scenarios: 70/70
test_command: (cd backend && pnpm test) && (cd frontend && pnpm test)
test_exit_code: 0
test_output_hash: sha256:c93ffedbfce6307868d3b1aef9d542ab4a6d2a2fe449dd91f4340f8708109862
build_command: (cd backend && pnpm lint && pnpm typecheck) && (cd frontend && pnpm lint && pnpm type-check)
build_exit_code: 0
build_output_hash: sha256:ab7dc319337dcd48b98151d1a15a89df3e19e266ae9c31465d95f4c49102d431
```

## Verification Report

**Change**: baja-equipo-completo
**Version**: N/A
**Mode**: Standard (feature) + Strict TDD for the WU-3 bugfix (DELETE /equipos/:id), per orchestrator injection
**Candidate**: branch `feat/baja-equipo-completo-wu17`, HEAD `061409e3` (47 commits over `main` `4c03e8a5`; `main` is an ancestor of HEAD)
**evidence_revision**: sha256 of `git diff main...061409e3`

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 115 |
| Tasks complete | 115 |
| Tasks incomplete | 0 |

`gentle-ai sdd-status baja-equipo-completo`: `apply: all_done`, `verify: ready`, tasks 115/115.

### Build & Tests Execution

**Build**: Passed

```text
backend  pnpm lint        -> eslint . , exit 0
backend  pnpm typecheck   -> tsc --noEmit -p tsconfig.typecheck.json, exit 0
frontend pnpm lint        -> "No ESLint warnings or errors", exit 0
frontend pnpm type-check  -> tsc --noEmit, exit 0
```

**Tests**: 8674 passed / 0 failed / 0 skipped

```text
backend  pnpm test -> Test Files 551 passed (551), Tests 6903 passed (6903), 787.79 s, exit 0
         (known noise only: orden-de-arranque.spec.ts "Falta configurar" logs, CorreoDeClienteAdapter logs;
          the randomBytes(2) flake in equipos-retirar-componente.e2e did not occur)
frontend pnpm test -> Test Files 227 passed (227), Tests 1771 passed (1771), exit 0
```

**Repository checks** (repo root):

```text
node scripts/check-roadmap-fresco.mjs  -> "El roadmap esta fresco.", exit 0
node scripts/check-casts-en-specs.mjs  -> 627 casts in 116 files (base 627/116), ratchet holds, exit 0
```

**Coverage**: not run (threshold 0 in config) -> Not available

### Runtime probes (adversarial, each reverted; `git status` clean afterwards)

| Probe | Result |
|---|---|
| WU-3 RED re-run: `eliminar-equipo.use-case.ts` replaced by its `main` version, then `eliminar-equipo.integration.spec.ts` + `eliminar-equipo.e2e.spec.ts` | 4 failed / 3 passed, for behavior (`expected false to be true` on `isFail()`, `expected 204 to be 422`), matching apply-progress. File restored with `git checkout` |
| Mutation of the central 409 guard in `DarDeBajaEquipoUseCase` (`mismoConjunto` check disabled), `baja-equipo.concurrencia.integration.spec.ts -t 409` | 5 failed (4 variants of cases (b)/(c) and the deterministic 409 case). File restored |

### TDD Compliance (WU-3 bugfix only)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | `apply-progress.md`, "WU-3 > TDD Cycle Evidence" (RED -> GREEN -> REFACTOR per task 3.1-3.8) |
| RED against unmodified code | Yes | RED table states the runs were against `eliminar-equipo.use-case.ts` untouched; re-confirmed at runtime by the probe above |
| All tasks have tests | Yes | 3.1 unit (6), 3.2 integration (3), 3.3 e2e (4), 3.6 controller, 3.7 witness T5, 3.8 frontend |
| GREEN confirmed (tests pass now) | Yes | All listed files pass in the full runs |
| Triangulation adequate | Yes | Active pieces, equipo dado de baja, no pieces, nonexistent, soft-deleted, 403 |
| Safety net for modified files | Yes | Pre-existing regression cases (no pieces, nonexistent, deleted) passed in RED |

Note: commit order puts the integration and e2e RED tests (`0b0b210d`, `b0d65802`) after the fix commit (`2913eeb6`); RED was observed in the working tree before the fix, which the probe reproduces. Not a finding.

**Assertion quality**: no tautologies, ghost loops or smoke-only tests found in the change's test files. Success/rejection direction spot-checked against the spec (R3 deleted insumo succeeds, R2 disabled insumo succeeds, R5 ROTURA without text succeeds, R16 change rejected, R9/R13 rejections): all match.

### Spec Compliance Matrix

Paths: `UC` = `backend/src/equipos/application/use-cases/`, `CT` = `backend/src/equipos/interface/controllers/`, `FE` = `frontend/src/features/equipos/`.

#### equipos-baja-completa (57)

| Req | Scenario | Test | Result |
|---|---|---|---|
| R1 | Destino inválido | `CT/dar-de-baja-equipo.e2e.spec.ts > validación del cuerpo > destino REGALO -> 400 y nada cambia`; `equipos.dto.spec.ts` | COMPLIANT |
| R1 | Todas las piezas con el mismo destino | `UC/dar-de-baja-equipo.opcion-b.integration.spec.ts > tres componentes quedan todos con bajaDestino DESCARTE y ninguno con otro` | COMPLIANT |
| R2 | Insumo NINGUNO | `UC/dar-de-baja-equipo.opcion-a.integration.spec.ts > un componente NINGUNO vuelve como ENTRADA USADO con equipoId y leyenda, y queda enlazado a ella` | COMPLIANT |
| R2 | Dos componentes del mismo insumo NINGUNO | `opcion-a > dos componentes del mismo insumo NINGUNO generan dos ENTRADAs y el saldo USADO sube 2` | COMPLIANT |
| R2 | Unidad SERIE | `opcion-a > una unidad SERIE INSTALADA pasa a EN_DEPOSITO USADO sin equipo, con evento RETIRO_A_DEPOSITO y ENTRADA que la referencia` | COMPLIANT |
| R2 | Insumo deshabilitado | `opcion-a > un insumo deshabilitado no frena la baja y su saldo USADO sube 1` | COMPLIANT |
| R3 | Descartar piezas NINGUNO y SERIE | `opcion-b > NINGUNO (saldo USADO 2) + unidad S1: S1 queda DESCARTADA con evento DESCARTE y leyenda, cero movimientos y saldo en 2` | COMPLIANT |
| R3 | Sin asiento negativo | `opcion-b > con saldo NUEVO 3 y USADO 0 no hay asiento negativo ni cambia ningún saldo` | COMPLIANT |
| R3 | Insumo borrado no bloquea el descarte | `opcion-b > un insumo con baja lógica no bloquea el descarte` | COMPLIANT |
| R4 | Misma leyenda en los tres lugares | `UC/dar-de-baja-equipo.leyenda.integration.spec.ts > misma leyenda en bajaMotivo de ambos componentes, en ambas ENTRADAs y en el evento de S1` | COMPLIANT |
| R4 | Leyenda sin texto libre | `leyenda > sin texto libre la leyenda es "Baja del equipo «PC-1» — Vejez"` | COMPLIANT |
| R4 | Leyenda de exactamente 500 caracteres | `leyenda > un texto de exactamente N caracteres completa la baja y la leyenda guardada mide 500`; e2e `texto de N+1 ... con N caracteres -> 200` | COMPLIANT |
| R4 | Leyenda de 501 caracteres | `leyenda > un texto de N+1 caracteres se rechaza informando N y NO cambia nada`; e2e same case (422, `largoMaximo` N) | COMPLIANT |
| R5 | OTRA sin texto | `CT/dar-de-baja-equipo.e2e.spec.ts > OTRA sin texto / con solo espacios -> 422 MOTIVO_BAJA_EQUIPO_INVALIDO ... y nada cambia` | COMPLIANT |
| R5 | OTRA con texto | e2e `OTRA con "reciclado para repuestos" -> 200 con la leyenda compuesta` | COMPLIANT |
| R5 | Categoría ausente o inválida | e2e `categoría ausente -> 400 y nada cambia`, `categoría OTROS -> 400 y nada cambia` | COMPLIANT |
| R5 | Categoría sin texto en la opción A | `opcion-a > la categoría ROTURA sin texto completa la baja` | COMPLIANT |
| R6 | Una pieza falla y no cambia nada | `UC/dar-de-baja-equipo.atomicidad.integration.spec.ts > una pieza con el insumo borrado rechaza la baja por %s y no cambia nada` (both paths) | COMPLIANT |
| R6 | El error lista todas las piezas problemáticas | `atomicidad > dos insumos borrados y un legado SERIE sin serial: el error lista los tres componentes por %s` | COMPLIANT |
| R6 | Falla al marcar el equipo | `atomicidad > falla al marcar el equipo: revierte las ENTRADAs, la unidad, los eventos y las marcas ya escritas` | COMPLIANT |
| R7 | Legado SERIE con serial | `UC/dar-de-baja-equipo.legados.integration.spec.ts > un legado SERIE con serial "LEG-1" crea la unidad EN_DEPOSITO USADO con su ENTRADA y retira el componente` | COMPLIANT |
| R7 | Legado SERIE sin serial | `legados > un legado SERIE sin serial rechaza la baja por serial requerido y nada cambia` | COMPLIANT |
| R7 | Serial repetido dentro de la misma baja | `legados > "x1" y "X 1" para dos legados del mismo insumo rechazan ambos componentes y no crean ninguna unidad` | COMPLIANT |
| R7 | Serial ya existente en el insumo | `legados > el serial "a1" con una unidad "A1" ya existente rechaza el componente y nada cambia`; `atomicidad > un serial legado ya existente ... falla bajo L2` | COMPLIANT |
| R7 | Descartar un legado SERIE sin serial | `opcion-b > un legado SERIE sin serial se descarta sin crear unidad ni pedir serial` | COMPLIANT |
| R7 | Insumo borrado frena la devolución | `legados > un insumo borrado frena la baja con STOCK_USADO y se informa como INSUMO_BORRADO` | COMPLIANT |
| R8 | Registro de la baja | `UC/dar-de-baja-equipo.registro.integration.spec.ts > el equipo queda activo = false con destino, categoría, texto, fecha y usuario` | COMPLIANT |
| R8 | Sin reactivación | `UC/equipo-dado-de-baja.guards.integration.spec.ts > EditarEquipo con la entidad leída antes de la baja devuelve error y el equipo sigue dado de baja con sus baja_*`; `CT/equipos-incluir-bajas.e2e.spec.ts > PATCH /equipos/:id -> 422 y el equipo no cambia`; `prisma-equipos.integration.spec.ts` (save() never writes `activo`); no reactivation route exists | COMPLIANT |
| R8 | Sin unidades instaladas tras la baja | `registro > con dos unidades INSTALADA y destino %s no queda ninguna INSTALADA ni componente activo` (both destinos) | COMPLIANT |
| R9 | Equipo sin piezas activas | `registro > un equipo sin piezas solo cambia el equipo: ni movimientos ni eventos`; `... con todas las piezas ya retiradas solo cambia el equipo` | COMPLIANT |
| R9 | Equipo ya dado de baja | `registro > una segunda baja devuelve EquipoDadoDeBajaError y los datos originales no cambian`; e2e `una segunda baja -> 422 EQUIPO_DADO_DE_BAJA` | COMPLIANT |
| R9 | Equipo con borrado lógico | `registro > un equipo con borrado lógico se trata como no encontrado y no cambia`; e2e `... -> 404 en la baja y nada cambia` | COMPLIANT |
| R10 | Aviso con tickets abiertos | e2e `resumen previo a la baja > informa ticketsAbiertos (sin contar los cerrados) ...` (2 open + 1 closed -> 2); `FE/components/equipo-baja-dialog.test.tsx > el resumen muestra 4 piezas ... y 1 ticket abierto` | COMPLIANT |
| R10 | Baja con tickets abiertos | e2e `la baja con 2 tickets abiertos -> 200 y los tickets siguen abiertos referenciando al equipo` | COMPLIANT |
| R10 | Ticket nuevo sobre equipo dado de baja | e2e `un ticket nuevo sobre un equipo dado de baja -> 422 y no se crea el ticket`; `crear-ticket-soporte.use-case.spec.ts` | COMPLIANT |
| R11 | Oculto por defecto | `CT/equipos-incluir-bajas.e2e.spec.ts > GET /equipos > por defecto solo trae el equipo vigente`; `FE/components/equipos-list-view.test.tsx > por defecto muestra solo el vigente y la petición no manda incluirBajas` | COMPLIANT |
| R11 | Visible con etiqueta | `equipos-list-view.test.tsx > con ?incluirBajas=true en la URL se piden ambos y el dado de baja lleva «Baja»`; e2e `incluirBajas=true trae ambos` | COMPLIANT |
| R11 | Exportación con el filtro | e2e `GET /equipos/export > por defecto el CSV solo trae el equipo vigente`, `con incluirBajas=true trae ambos y el dado de baja dice "Baja" en Estado`; FE `el botón de exportación pide el mismo parámetro que la lista` | COMPLIANT |
| R11 | Ficha visible | e2e `la ficha de un equipo dado de baja responde con baja y componentes retirados con su movimiento`; `FE/components/equipo-detail-view.test.tsx > muestra el banner ...`, `los componentes retirados y su destino siguen visibles` | COMPLIANT |
| R11 | Editar un equipo dado de baja | `equipos-incluir-bajas.e2e > PATCH /equipos/:id -> 422 y el equipo no cambia`; guards integration (EditarEquipo) | COMPLIANT |
| R11 | Agregar un componente | `equipos-incluir-bajas.e2e > POST /equipos/:id/componentes con descuento / sin descuento -> 422, sin componente ni stock`; guards integration (3 cases) | COMPLIANT |
| R11 | Reactivar un componente de un equipo dado de baja | `guards.integration > reactivar un componente DESCARTE con la unidad "S1" DESCARTADA se rechaza: sigue retirado y "S1" DESCARTADA` | COMPLIANT |
| R12 | Sin permiso | e2e `con EQUIPOS:LECTURA y sin BORRADO -> 403 en la baja y en el resumen, y nada cambia`; controller reflection | COMPLIANT |
| R12 | Con BORRADO y sin permisos de insumos | e2e `STOCK_USADO con solo EQUIPOS:BORRADO (sin permisos de insumos) -> 200, piezas retiradas y ENTRADAs registradas` | COMPLIANT |
| R13 | Borrar con piezas activas (RED actual, GREEN esperado) | `UC/eliminar-equipo.integration.spec.ts > con un componente y su unidad INSTALADA: rechaza ...`; `CT/eliminar-equipo.e2e.spec.ts > con una pieza activa -> 422 con la cantidad ...`; unit; T5 | COMPLIANT |
| R13 | Borrar un equipo cargado por error | e2e `sin piezas -> 204 y la ficha responde 404`; integration `un equipo sin piezas activas se borra (deletedAt) ...` | COMPLIANT |
| R13 | Borrar un equipo dado de baja | integration `un equipo dado de baja se rechaza con EquipoDadoDeBajaError y sigue visible`; e2e `sobre un equipo dado de baja -> 422 y el equipo sigue visible` | COMPLIANT |
| R13 | Botón renombrado | `equipo-detail-view.test.tsx > el botón del borrado dice «Eliminar equipo (cargado por error)» y «Dar de baja» es único` | COMPLIANT |
| R14 | Resumen | `equipo-baja-dialog.test.tsx > el resumen muestra 4 piezas, el destino «devolver al stock» y 1 ticket abierto` | COMPLIANT |
| R14 | Devolver confirma con un botón | `equipo-baja-dialog.test.tsx > STOCK_USADO confirma con un solo botón y envía destino y categoría` | COMPLIANT |
| R14 | Descartar exige el nombre | `equipo-baja-dialog.test.tsx > con DESCARTE el botón sigue deshabilitado con «PC-2» y se habilita con «PC-1», también con espacios` | COMPLIANT |
| R15 | Baja contra instalación sobre los mismos insumos | `UC/baja-equipo.concurrencia.integration.spec.ts > (a) baja de E1 contra instalaciones en E2 ... en orden inverso: sin 40P01 y el depósito iguala al libro` (10 iterations); witnesses T1-T3, T6 | COMPLIANT |
| R15 | Dos bajas simultáneas del mismo equipo | `concurrencia > (d) dos bajas simultáneas del mismo equipo: exactamente una se completa ...` | COMPLIANT |
| R15 | Baja contra agregar componente | `concurrencia > $nombre vs baja del mismo equipo ...` (4 variants (b)/(c)); witness T4 | COMPLIANT |
| R16 | El cambio a NINGUNO con una unidad instalada se rechaza | `backend/src/insumos/application/use-cases/cambiar-seguimiento-insumo.integration.spec.ts > se rechaza el cambio, el insumo sigue SERIE y la baja posterior descarta la unidad` | COMPLIANT |
| R17 | Destino por pieza | e2e `DESCARTE ignora el destino por pieza: ambas piezas DESCARTE y sin movimientos` | COMPLIANT |
| R17 | Destino solo por pieza | e2e `solo destino por pieza, sin destino de la baja -> 400 y nada cambia` | COMPLIANT |

#### Delta unidades-insumo-serie (4)

`OPS` = `backend/src/insumos/application/services/operaciones-unidad-insumo.service.spec.ts`.

| Scenario | Test | Result |
|---|---|---|
| Varias unidades en una transacción | `OPS > devolverDesdeEquipo > devuelve varias unidades en una transaccion`; `registrar-devoluciones-de-equipo.integration.spec.ts` (mixed lot, two units) | COMPLIANT |
| Falla en una del lote | `OPS > una unidad que ya no esta INSTALADA rechaza el lote sin cambios` | COMPLIANT |
| Descartar varias unidades en una transacción | `OPS > descartarInstaladas > descarta un lote sin movimiento y con evento DESCARTE ...`; `registro > con dos unidades INSTALADA y destino DESCARTE ...` | COMPLIANT |
| Unidad instalada en otro equipo | `OPS > una unidad INSTALADA en otro equipo rechaza el lote sin cambios` | COMPLIANT |

#### Delta componentes-catalogo-unico (9)

`RC` = `UC/reactivar-componente.use-case.spec.ts`, `RRU` = `UC/retirar-reactivar-unidad.concurrencia.integration.spec.ts`.

| Scenario | Test | Result |
|---|---|---|
| Reactivar tras devolver al stock | `RC > rechaza con ComponenteDevueltoAlStockError si volvió al stock como USADO, y no persiste` | COMPLIANT |
| Reactivar tras descartar | `RC > reactiva un DESCARTE y limpia el registro de retiro` (use case has no stock port: saldo cannot change) | COMPLIANT |
| Reactivar un retiro legado | `RC > reactiva un retiro LEGADO (sin destino) y persiste, sin tocar ninguna unidad` | COMPLIANT |
| Interfaz de reactivar | `FE/components/equipo-componentes-section.test.tsx > regresión del delta: un componente devuelto al stock no ofrece reactivar y la fila indica el destino (equipo vigente)` | COMPLIANT |
| Reactivar un componente con unidad descartada | `RC > reinstala la unidad (L1 a L3) ANTES de guardar el componente (L4) ...`; `OPS > reinstala la unidad descartada por ese componente: INSTALADA en el equipo, sin movimiento ...` | COMPLIANT |
| Reactivar con unidad de un insumo que volvió a NINGUNO | `RRU > con el insumo vuelto a NINGUNO reactivar se rechaza (SeguimientoNoModificable) y no cambia nada` | COMPLIANT |
| Reactivar un componente cuya unidad se recuperó | `RRU > tras recuperar la pieza (ADR-14) reactivar se rechaza y no cambia nada` | COMPLIANT |
| Reactivar un componente legado sin unidad | `RC > reactiva un retiro LEGADO (sin destino) y persiste, sin tocar ninguna unidad` | COMPLIANT |
| Reactivar un componente de un equipo dado de baja | `guards.integration > reactivar un componente DESCARTE con la unidad "S1" DESCARTADA se rechaza ...`; `RC > un equipo dado de baja falla con EquipoDadoDeBajaError ...`; e2e `PATCH reactivar ... -> 422 y sigue retirado` | COMPLIANT |

**Compliance summary**: 70/70 scenarios compliant (19/19 requirements).

### Roadmap decision checklist (`docs/roadmap-comercial.md`, "Baja de equipo completo", declared **Cumplida**)

| Sub-bullet | Requirements | Verified |
|---|---|---|
| Two options, all or nothing; same legend on every piece | R1-R4 | Yes |
| Motive = category + free text; "otra" requires text | R5 | Yes |
| Definitive, not undoable | R8 | Yes |
| Open tickets: allowed with a count warning | R10 | Yes |
| Listed with "Baja", hidden by default filter; ficha/history visible; no add, no edit | R8, R11 | Yes |
| Permission `EQUIPOS:BORRADO`, same as single-piece retire | R12 | Yes (both routes use `@RequiereAcciones('EQUIPOS:BORRADO')`) |
| Discard-all leaves no negative stock entry | R3 | Yes |
| Current delete only for mistaken equipos; blocked with active pieces; button renamed | R13 | Yes |
| Return-to-stock asks serial of legacy SERIE pieces; deleted insumo stops and is reported | R6, R7 | Yes |
| Confirmation: summary; type the name to discard | R14 | Yes |

The **Cumplida** declaration is true; "Sin desviaciones" is consistent with the spec (R17 exclusions were declared up front).

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| ADR-1 additive migration, `save()` never writes `activo`/`baja_*`, `registrarBaja` CAS | Yes | |
| ADR-2 LE first lock (`FOR NO KEY UPDATE` modify / `FOR SHARE` operate pieces) | Yes | Witnesses T1-T8 pass; T1/T4/T6/T7/T8 mutation-tested during apply |
| ADR-3 single transaction, outside fast diagnosis + inside authoritative re-check, 409 on changed set, L4 by id | Yes | 409 guard mutation-tested in this verify |
| ADR-4 legend composition, validate not truncate | Yes | |
| ADR-5 guards and DELETE fix; EditarComponente CAS | Yes | Minor deviation: Reactivar/Retirar read the component outside the tx (see open item 1) |
| ADR-6 open-ticket count outside tx | Yes | |
| ADR-7 HTTP contracts and error map | Yes | DELETE 422 now an object body (open item 2) |
| ADR-8 frontend dialog, filter, read-only ficha | Yes | |
| ADR-9 Ayuda: false articles fixed, debt annotated | Yes | `equipos-listado.md`, `permisos-y-roles.md` fixed; debt in commit bodies |
| ADR-10/11 test strategy and chain partition | Yes | |

### Open items flagged during apply

1. **Reactivar/Retirar read the component outside the transaction before LE** — *Acceptable, with a follow-up.* Retirar: a stale "active" read after a concurrent baja ends in the `componenteRepo.retirar` CAS (`WHERE deleted_at IS NULL`, 0 rows -> `FalloRetiroDeComponente`, ENTRADA rolled back), or in the unit operation failing `UNIDAD_NO_DISPONIBLE` and the re-read. Reactivar: any baja is serialized by LE (`FOR SHARE` vs `FOR NO KEY UPDATE`) and the `!activo` recheck under LE rejects. Residual pre-existing gap (not introduced by this change): Reactivar persists with `save()` (upsert, no CAS), so a three-way race (stale reactivation vs. reactivate + re-retire with `STOCK_USADO` on a legacy no-unit piece) could overwrite the newer retire. Follow-up: a CAS on reactivation (`WHERE deleted_at = <read value>`).
2. **DELETE 422 body changed to `{statusCode, message, code, cantidad}`** — *Acceptable.* Nest returns the object as-is; the frontend normalizer reads `body.message` when it is a string (`frontend/src/shared/api/normalize.ts`). Covered by `eliminar-equipo.e2e.spec.ts` (`data.message` contains "1 pieza activa") and `equipo-detail-view.test.tsx > el 422 del borrado con piezas activas muestra el mensaje del backend con la cantidad` (toast).
3. **409 `EQUIPO_MODIFICADO_DURANTE_LA_BAJA` not tested over HTTP** — *Acceptable.* Layered coverage: deterministic integration case (mutation-proved in this verify), controller mapping (`equipos.controller.spec.ts > POST baja: el error del caso de uso se traduce (409)` and the error table), frontend handling (`equipo-baja-dialog.test.tsx > el 409 avisa ...`). An HTTP race would add flakiness without new coverage.
4. **Process: size:exception commits; empty WU-16 report** — *Acceptable, owner to be informed.* Seven commits exceed 400 lines (930, 634, 628, 537, 493, 451, 438); each carries a `size:exception: N lineas, <reason>` body per the repo policy. The test-only ones (634, 628, 451) arguably had a seam (split by describe block), which is a judgment call, not a defect. WU-16 code is independently verified here: its 10 dialog tests, rules, hooks and schemas tests pass in the full frontend run.

### Issues Found

**CRITICAL**: None

**WARNING**:
- W1 (process): test-only commits `6f6c76f5` (634), `ab373eba` (628), `6043f9b5` (451) took `size:exception` where splitting by describe block was possible; documented in commit bodies, report to the owner.
- W2 (pre-existing, follow-up): `ReactivarComponenteUseCase` persists a component read outside the transaction with an upsert `save()` and no CAS (open item 1).

**SUGGESTION**:
- S1: Ayuda debt remains (new article: full baja flow, renamed delete button, read-only ficha) — correctly annotated under the 2026-09-07 suspension.
- S2: Consider a lightweight HTTP check of the 409 body shape in a future e2e only if the controller mapping changes.

### Verdict

PASS WITH WARNINGS — 70/70 scenarios covered by passing runtime tests, all gates green, the bugfix RED reproduced and a central guard mutation-proved; only process and pre-existing follow-ups remain.
