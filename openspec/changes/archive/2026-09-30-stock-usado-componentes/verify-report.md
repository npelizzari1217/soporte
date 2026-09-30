```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:11742a873fb64650b11b39a654fd7f005e5cf19ee55cd564dd7a28f64ace5268
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 14/14
scenarios: 53/53
test_command: (cd backend && pnpm test) && (cd frontend && pnpm test)
test_exit_code: 0
test_output_hash: sha256:a5bde8b2b8e6c2ecc25c0efcea14705f8103853f6dd33dac10ba84ecc477e51d
build_command: (cd backend && pnpm lint && pnpm typecheck) && (cd frontend && pnpm lint && pnpm type-check)
build_exit_code: 0
build_output_hash: sha256:c776cc7fac2b7fd7af858bd4dca4dae91cf21e283c5dee22c437c49ba125a4ef
```

## Verification Report

**Change**: stock-usado-componentes
**Version**: N/A (spec nueva `specs/stock-insumo-condicion/spec.md` y delta `specs/componentes-catalogo-unico/spec.md`)
**Mode**: Standard (feature, `strict_tdd: false`; no hay corrección de defecto en el ciclo, así que no se inyectó TDD).
**Candidato**: rama `feat/stock-usado-componentes-wu13` = tracker `feat/stock-usado-componentes`, tip `4a36ef9`. `git diff main...HEAD`: 28 commits (5 de planificación y 23 de apply), 99 archivos, +8019/−420. `evidence_revision` es el sha256 de ese diff.

### Veredicto

**PASS WITH WARNINGS.** 0 CRITICAL, 4 WARNING, 4 SUGGESTION.

Las seis compuertas pasan sobre el tip final. Las 18 mutaciones adversariales (13 de backend y 5 de frontend) quedan muertas. Las decisiones del dueño (A/B/C; a1 b1 c3 d1 e3 f2 g1 h2; O1, O2, D1, D2) están implementadas y cada una tiene al menos un test que la mata. Las advertencias son de proceso (un commit sobre 400 líneas sin `size:exception`), de una frase inexacta de la Ayuda y de cobertura (3 escenarios PARTIAL). Ninguna rompe un requerimiento.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 88 (casillas de WU-1 a WU-13, incluidos 3a, 3b, 8a, 8b y 12b) |
| Tasks complete | 88 |
| Tasks incomplete | 0 |
| Secuencia operativa | Del dueño, fuera de `sdd-apply` (no son casillas) |

`gentle-ai sdd-status stock-usado-componentes`: `apply: all_done`, `verify: ready`, `tasks: 88/88 complete`.

### Build & Tests Execution

Todas las compuertas se corrieron en WSL sobre el árbol real, en el tip `4a36ef9`.

| Compuerta | Comando | Exit | Resultado |
|---|---|---|---|
| Backend lint | `cd backend && pnpm lint` | 0 | `eslint .` sin salida (0 errores) |
| Backend typecheck | `cd backend && pnpm typecheck` | 0 | 0 errores |
| Backend tests | `cd backend && pnpm test` | 0 | **488/488 archivos, 5811/5811 tests** |
| Frontend lint | `cd frontend && pnpm lint` | 0 | "No ESLint warnings or errors" |
| Frontend type-check | `cd frontend && pnpm type-check` | 0 | 0 errores |
| Frontend tests | `cd frontend && pnpm test` | 0 | **212/212 archivos, 1610/1610 tests** |

Las bases locales `soporte_master_test` y `soporte_tenant_test` ya estaban migradas (incluye `20260930120000` y `20260930130000`). Después de revertir las mutaciones, `vitest run src/insumos src/equipos src/compras prisma_tenant` dio 151 archivos y 2632 tests en verde.

**Coverage**: no se midió (`coverage_threshold: 0`).

### Verificación adversarial (mutaciones locales, todas revertidas)

| # | Mutación | Archivo | Resultado |
|---|---|---|---|
| B1 | La salida decide sobre `.NUEVO` en vez de la condición del asiento | `registrar-salida-insumo.use-case.ts:164` | **Muerta**: 3 rojos (salida USADO sin saldo, salida USADO dentro del saldo, concurrencia real de dos salidas USADO) |
| B2 | El ajuste decide sobre `.total` | `registrar-ajuste-insumo.use-case.ts:209` | **Muerta**: "rechaza un ajuste negativo USADO mayor que el saldo USADO aunque haya NUEVO" |
| B3 | USADO admitido en un insumo no repuesto (guard `esRepuesto` anulado) | `validar-insumo.service.ts:268` | **Muerta**: 7 rojos en 5 archivos (entrada, salida, ajuste, consulta, servicio) |
| B4 | Reposición calculada sobre el total | `consultar-stock-insumo.use-case.ts:124` | **Muerta**: "marca BAJO_MINIMO con NUEVO bajo el punto aunque el total lo supere por los usados" |
| B5 | La marca de retiro sin `deleted_at IS NULL` | `prisma-componente-equipo.repository.ts` (`retirar`) | **Muerta**: "8 retiros simultáneos del MISMO componente: UNA ENTRADA" |
| B6 | Reactivar permitido tras `STOCK_USADO` | `reactivar-componente.use-case.ts:50` | **Muerta**: unit y e2e "tras STOCK_USADO -> 422" |
| B7 | `DESCARTE` sin motivo aceptado | `componente-equipo.entity.ts:300` | **Muerta**: 5 rojos (entidad y caso de uso con `undefined`, `null`, `""`, `"   "`) |
| B8 | La devolución no exime a la familia no vigente (O1/D1) | `registrar-entrada-insumo.use-case.ts:216` | **Muerta**: "admite una familia dada de baja o deshabilitada" |
| B9 | La devolución exige insumo habilitado (O1) | `registrar-entrada-insumo.use-case.ts:207` | **Muerta**: 2 rojos |
| B10 | La ENTRADA manual USADO admite familia no vigente (D1 ensanchado) | `registrar-entrada-insumo.use-case.ts:171` | **Muerta**: "rechaza USADO manual cuando la familia tiene baja lógica o está deshabilitada" |
| B11 | El alta con descuento no reenvía `condicion` | `equipos.controller.ts:371` | **Muerta**: 3 rojos (controller NUEVO/USADO y e2e "condicion USADO con saldo USADO") |
| B12 | La instalación no vincula la SALIDA (e3/D2) | `instalar-componente-desde-deposito.use-case.ts:149` | **Muerta**: unit del vínculo e integración "bajaSinSalidaPrevia = false tras retirarse" |
| B13 | La ENTRADA manual sin guard de habilitado | `registrar-entrada-insumo.use-case.ts:161` | **Muerta**: 3 rojos, incluido "la entrada manual USADO sobre un insumo deshabilitado sigue rechazada" |
| F1 | El selector arranca en USADO | `use-selector-condicion.ts:44` | **Muerta**: 6 rojos en `movimiento-condicion.test.tsx`. En el alta, el `reiniciar()` al abrir también fuerza NUEVO; mutando ambos (`useState` y `reiniciar`) caen 2 tests de `componente-create-dialog.test.tsx` |
| F2 | `condicion` enviada sin `descontarStock` | `componente-create-dialog.tsx:75,82` | **Muerta**: "desmarcar la casilla tras elegir USADO oculta el selector y no envía condición" |
| F3 | Reactivar visible tras `STOCK_USADO` | `equipo-componentes-section.tsx:158` | **Muerta**: "oculta Reactivar tras devolver al stock y lo conserva para descartado y legado" |
| F4 | Descarte sin motivo aceptado en el cliente | `frontend/src/features/equipos/schemas.ts` (`retirarComponenteSchema`) | **Muerta**: "descartar sin motivo bloquea el envío y no llama al backend" |

Cada mutación se aplicó con `sd`, se corrió el spec y se revirtió con `git checkout`. `git status` quedó limpio.

### Spec Compliance Matrix

`stock-insumo-condicion` (8 requerimientos, 22 escenarios). Las rutas de test son relativas a `backend/src` salvo que se indique otra cosa.

| Requerimiento | Escenario | Código | Test | Resultado |
|---|---|---|---|---|
| Todo movimiento lleva condición | Movimiento histórico tras la migración | `20260930120000_movimientos_insumo_condicion/migration.sql` (`NOT NULL DEFAULT 'NUEVO'`) | `movimientos-insumo-constraints.integration.spec.ts:158` (INSERT sin columna queda NUEVO). Ningún test aplica la migración sobre filas previas | ⚠️ PARTIAL |
| | Movimiento sin condición explícita | `registrar-entrada-insumo.use-case.ts:170` | `registrar-entrada-insumo.use-case.spec.ts:452`; e2e `movimientos-insumo.e2e.spec.ts:1156` | ✅ COMPLIANT |
| | Valor de condición inválido | DTO `@IsIn(CONDICIONES_STOCK)` (`movimientos-insumo.dto.ts:166`); CHECK `movimientos_insumo_condicion_check` | `movimientos-insumo.dto.spec.ts:294`; e2e `:1194` (400); constraints `:140`, `:169` | ✅ COMPLIANT |
| Saldo por insumo y condición | Saldos independientes | `tipo-movimiento-insumo.ts:171` (`calcularSaldos`) | `tipo-movimiento-insumo.spec.ts:129` | ✅ COMPLIANT |
| | Insumo sin movimientos USADO | ídem | `tipo-movimiento-insumo.spec.ts:140`; `consultar-stock-insumo.use-case.spec.ts:242` | ✅ COMPLIANT |
| No negatividad por condición | Salida mayor que el saldo de su condición | `registrar-salida-insumo.use-case.ts:164` | `registrar-salida-insumo.use-case.spec.ts:479`; e2e `:1206`; B1 | ✅ COMPLIANT |
| | Ajuste negativo mayor que el saldo de su condición | `registrar-ajuste-insumo.use-case.ts:209` | `registrar-ajuste-insumo.use-case.spec.ts:627`; B2 | ✅ COMPLIANT |
| | Salida dentro del saldo de su condición | ídem salida | `registrar-salida-insumo.use-case.spec.ts:501` | ✅ COMPLIANT |
| | Operaciones concurrentes sobre la misma condición | `lockAndSumByTipo` (advisory lock sin cambios) | `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts:433`; B1 | ✅ COMPLIANT |
| ENTRADA y AJUSTE manuales pueden apuntar a USADO | Entrada manual USADO de un insumo deshabilitado sigue rechazada | `registrar-entrada-insumo.use-case.ts:161` | `registrar-entrada-insumo.use-case.spec.ts:496`; B13 | ✅ COMPLIANT |
| | Entrada manual de usados | `registrar-entrada-insumo.use-case.ts:170-177` | `registrar-entrada-insumo.use-case.spec.ts:466`; e2e `:1134` | ✅ COMPLIANT |
| | Ajuste positivo de usados | `registrar-ajuste-insumo.use-case.ts:168` | `registrar-ajuste-insumo.use-case.spec.ts:656` | ✅ COMPLIANT |
| Recepción de compra siempre NUEVO | Recepción de compra | `registrar-recepcion-de-item.use-case.ts:175` | `compras/.../registrar-recepcion-de-item.use-case.spec.ts:317` | ✅ COMPLIANT |
| | El flujo de recepción no acepta condición | DTO de recepción sin el campo + `whitelist` (ADR-7: se ignora) | `movimientos-insumo.dto.spec.ts:319`; e2e `compras.e2e.spec.ts:1132` | ✅ COMPLIANT |
| USADO solo en repuestos | USADO sobre un insumo no repuesto | `validar-insumo.service.ts:247-272`; 422 en `insumos.controller.ts` | e2e `:1169`; `registrar-entrada-insumo.use-case.spec.ts:481`; B3 | ✅ COMPLIANT |
| | USADO rechazado en salida y ajuste | ídem | e2e `:1169` (422 ×3); `registrar-salida-insumo.use-case.spec.ts:511`; `registrar-ajuste-insumo.use-case.spec.ts:673` | ✅ COMPLIANT |
| | NUEVO sobre un insumo no repuesto | `validar-insumo.service.ts` (NUEVO devuelve ok sin consultar) | `validar-condicion-admitida.spec.ts:27`; `registrar-entrada-insumo.use-case.spec.ts:452` | ✅ COMPLIANT |
| Reposición solo sobre NUEVO | Usados no ocultan la falta de nuevos | `consultar-stock-insumo.use-case.ts:124` | `consultar-stock-insumo.use-case.spec.ts:217`; e2e `:1217`; B4 | ✅ COMPLIANT |
| | Nuevos suficientes | ídem | `consultar-stock-insumo.use-case.spec.ts:230` | ✅ COMPLIANT |
| Consulta con ambos saldos y condición en el listado | Consulta de stock | `movimientos-insumo.dto.ts:233-235,279-280` | e2e `:1217`; `movimientos-insumo.dto.spec.ts:501` | ✅ COMPLIANT |
| | Listado de movimientos | `movimientos-insumo.dto.ts:216,259` | e2e `:1134`; `movimientos-insumo.dto.spec.ts:464` | ✅ COMPLIANT |
| | Ficha del insumo | `frontend/.../insumo-detail-view.tsx:381-387,429` | `frontend/.../insumo-detail-view.test.tsx:258,317` | ✅ COMPLIANT |

Delta `componentes-catalogo-unico` (1 MODIFIED con 7 escenarios, 1 REMOVED, 4 ADDED con 24 escenarios). Las rutas de e2e son `equipos/interface/controllers/`.

| Requerimiento | Escenario | Código | Test | Resultado |
|---|---|---|---|---|
| MODIFIED: alta con descuento opcional | Descuento por defecto | `equipos.controller.ts:367` | e2e `equipos-instalar-desde-deposito.e2e.spec.ts:501`, `:614` | ✅ COMPLIANT |
| | Descuento del saldo USADO | `equipos.controller.ts:371`; `instalar-componente-desde-deposito.use-case.ts` | e2e `:469`; B11 | ✅ COMPLIANT |
| | Stock insuficiente en la condición elegida | salida por condición (B1) | e2e `:487` (NUEVO 0 y USADO 5 → 422, nada escrito) | ✅ COMPLIANT |
| | Falla la SALIDA y se revierte el alta | `FalloSalidaDeStock` (sin cambio de lógica) | e2e `:551`, `:572`; `instalar-componente-desde-deposito.use-case.spec.ts:174` | ✅ COMPLIANT |
| | Alta sin descuento | `equipos.controller.ts:373` | e2e `:595`, `:517` (condición ignorada, sin vínculo) | ✅ COMPLIANT |
| | Selector de saldo en el alta | `componente-create-dialog.tsx:75,82`; `use-selector-condicion.ts` | `frontend/.../componente-create-dialog.test.tsx:332`; F1 | ✅ COMPLIANT |
| | Un solo saldo disponible | `use-selector-condicion.ts:48-50` | `componente-create-dialog.test.tsx:350`; `movimiento-condicion.test.tsx:134` | ✅ COMPLIANT |
| REMOVED: retiro como borrado lógico sin stock | (sin escenario) | `DELETE` y `EliminarComponenteUseCase` borrados | e2e `equipos-retirar-componente.e2e.spec.ts:595` (`DELETE` → 404, componente activo) | ✅ Retirado |
| ADDED: retiro con dos desenlaces | Devolver al stock como usado | `retirar-componente.use-case.ts:90-116` | e2e `equipos-retirar-componente.e2e.spec.ts:400`; `retirar-componente.integration.spec.ts:224` | ✅ COMPLIANT |
| | Retiro al stock de un repuesto deshabilitado | `registrar-entrada-insumo.use-case.ts:207` (sin `exigirHabilitado`) | `registrar-entrada-insumo.use-case.spec.ts:559` con fakes; B9. No hay test del retiro completo con insumo deshabilitado | ⚠️ PARTIAL |
| | Retiro al stock con familia dada de baja | `registrar-entrada-insumo.use-case.ts:216` | `registrar-entrada-insumo.use-case.spec.ts:571` con fakes; B8. Mismo hueco | ⚠️ PARTIAL |
| | Descartar por rotura | `retirar-componente.use-case.ts` (sin ENTRADA en `DESCARTE`) | e2e `:423`; integración `:265` | ✅ COMPLIANT |
| | Descarte sin motivo | `componente-equipo.entity.ts:300` | e2e `:440`; `retirar-componente.use-case.spec.ts:134` (4 variantes); B7 | ✅ COMPLIANT |
| | Motivo demasiado largo | `RetirarComponenteHttpDto` (`MaxLength` tras `transformarMotivo`) | e2e `:475` (501 → 400 en los dos destinos); `equipos.dto.spec.ts:435` | ✅ COMPLIANT |
| | Retiro sin destino o con destino inválido | `@IsIn(DESTINOS_RETIRO_COMPONENTE)` | e2e `:458`; `equipos.dto.spec.ts:416` | ✅ COMPLIANT |
| | Falla la ENTRADA y se revierte el retiro | `FalloRetiroDeComponente` dentro de `run()` | integración `retirar-componente.integration.spec.ts:328`, `:354`; unit `:198`, `:214` | ✅ COMPLIANT |
| | Usuario sin permiso de borrado | `@RequiereAcciones('EQUIPOS:BORRADO')` (`equipos.controller.ts:392`) | e2e `:374` (403 con permisos de insumos) | ✅ COMPLIANT |
| | Usuario con borrado y sin permisos de insumos | ídem | e2e `:400` (solo `EQUIPOS:BORRADO`, saldo USADO +1) | ✅ COMPLIANT |
| | Componente ya retirado | `retirar-componente.use-case.ts:76`; marca condicional | e2e `:494`; unit `:172`; concurrencia `:380`; B5 | ✅ COMPLIANT |
| | Diálogo de retiro | `componente-retiro-dialog.tsx`; `useRetirarComponente` | `frontend/.../componente-retiro-dialog.test.tsx:53,66,79,122`; `equipo-componentes-section.test.tsx:326` | ✅ COMPLIANT |
| ADDED: pieza que vino con el equipo | Devolver una pieza que vino con el equipo | `componente-equipo.entity.ts:227,304` | `retirar-componente.use-case.spec.ts:112` (`bajaSinSalidaPrevia = true`); `equipo-componentes-section.test.tsx:419` | ✅ COMPLIANT |
| | Devolver una pieza instalada antes de este cambio | ídem (misma condición: `instalacion_movimiento_id` nulo) | `retirar-componente.use-case.spec.ts:112,122`; `componente-equipo.mapper.spec.ts:45`; constraints `prisma_tenant/componentes-equipo-retiro.integration.spec.ts:163` | ✅ COMPLIANT |
| | Devolver una pieza que vino con el equipo sin motivo | `componente-equipo.entity.ts:304` | `retirar-componente.use-case.spec.ts:122` (sin transacción ni movimiento); entidad `:224` | ✅ COMPLIANT |
| | Pieza instalada con descuento | `instalar-componente-desde-deposito.use-case.ts:149` | integración `retirar-componente.integration.spec.ts:288`; e2e `:400` (`bajaSinSalidaPrevia: false`); B12 | ✅ COMPLIANT |
| ADDED: reactivar según el destino | Reactivar tras devolver al stock | `reactivar-componente.use-case.ts:50` | e2e `:517`; unit `:67`; B6 | ✅ COMPLIANT |
| | Reactivar tras descartar | `componente-equipo.entity.ts:351` (limpia el registro) | e2e `:542`; unit `:87` | ✅ COMPLIANT |
| | Reactivar un retiro legado | ídem | e2e `:569`; unit `:108` | ✅ COMPLIANT |
| | Interfaz de reactivar | `equipo-componentes-section.tsx:60,158,184` | `equipo-componentes-section.test.tsx:399,430`; F3 | ✅ COMPLIANT |
| ADDED: el componente conserva el registro del retiro | Registro de una devolución | `equipos.dto.ts` (`toComponenteResponseDto`) | e2e `:400` (destino, usuario, `bajaMovimientoId` = ENTRADA con `equipoId`) | ✅ COMPLIANT |
| | Registro de un descarte | ídem | e2e `:423` (motivo, sin movimiento); integración `:265` | ✅ COMPLIANT |
| | Retiro legado | mapper; CHECK coherente, rama 1 | `componente-equipo.mapper.spec.ts:36`; constraints `:147` | ✅ COMPLIANT |
| | Migración aditiva | `20260930130000_componentes_equipo_retiro/migration.sql` | constraints `:147` (legado previo intacto), `:163` (INSERT de binario viejo); `movimientos-insumo-constraints.integration.spec.ts:158` | ✅ COMPLIANT |

**Compliance summary**: 53/53 escenarios con evidencia en verde: 50 COMPLIANT y 3 PARTIAL. En los tres PARTIAL, el test corrió y pasó pero cubre la propiedad por un camino más angosto que el del escenario. Hay 0 UNTESTED y 0 FAILING. Los requerimientos cuentan 14/14: 8 de la spec nueva y 6 del delta (1 MODIFIED, 1 REMOVED y 4 ADDED).

### Decisiones del dueño

| Decisión | Estado | Evidencia |
|---|---|---|
| a1: selector NUEVO por defecto, fijo con un solo saldo | ✅ | `use-selector-condicion.ts:44-50`; F1 |
| b1: reposición solo sobre NUEVO | ✅ | `consultar-stock-insumo.use-case.ts:124`; B4 |
| c3: columna universal, UI solo en repuestos, 422 en el backend | ✅ | `admiteUsado`; `validarCondicionAdmitida`; B3 |
| d1: retiro con `EQUIPOS:BORRADO`, sin permiso nuevo | ✅ | `equipos.controller.ts:392`; e2e `:374`, `:400` |
| e3: marca derivada de `instalacion_movimiento_id` nulo | ✅ | `componente-equipo.entity.ts:227`; B12 |
| f2: reactivar bloqueado tras `STOCK_USADO` | ✅ | B6, F3 |
| g1: ENTRADA y AJUSTE manuales admiten USADO; la recepción queda en NUEVO | ✅ | Matriz, requerimientos 4 y 5 |
| h2: registro en columnas de `componentes_equipo`, sin tabla nueva | ✅ | Migración `20260930130000` |
| O1/D1: el repuesto deshabilitado y la familia no vigente vuelven como USADO solo en el retiro; la ENTRADA manual USADO sobre un insumo deshabilitado sigue rechazada | ✅ | B8, B9, B10, B13 |
| O2: rótulo "sin salida registrada del depósito" | ✅ | `equipo-componentes-section.tsx:185`; `equipos.errors.ts:258` |
| D2: un componente legado con descuento muestra la marca y exige motivo | ✅ | Misma derivación (`instalacion_movimiento_id` nulo); `retirar-componente.use-case.spec.ts:122` |
| Fuera de alcance ausente (baja de equipo completo, serie por unidad, reporte, mínimo por condición) | ✅ | `eliminar-equipo.use-case.ts` sin cambios; ninguna migración ni DTO suma esos conceptos |

### Coherence (Design)

| Decisión | ¿Se cumple? | Notas |
|---|---|---|
| ADR-1: desglose por condición y tipo; `calcularStock` sin cambio de firma | ✅ | `calcularSaldos` compone `calcularStock` y suma el total en centésimas |
| ADR-2: dos migraciones aditivas con el default conservado | ✅ | `20260930120000` y `20260930130000`, ordenadas después de `20260929120000`; CHECK con nombre |
| ADR-3: `POST …/baja` y el `DELETE` retirado | ✅ | e2e `:595` → 404 |
| ADR-4: ENTRADA primero, marca condicional después | ✅ | `retirar-componente.use-case.ts:90-114`; B5 |
| ADR-5: guard en el caso de uso y limpieza en la entidad | ✅ | `reactivar()` limpia las cuatro columnas y conserva la instalación |
| ADR-6: USADO solo en repuestos, error de insumos con 422 | ✅ | `admitirFamiliaNoVigente` es parámetro de función y no campo de DTO |
| ADR-7: contratos del borde | ✅ | `stock` = total más `saldos` y `admiteUsado`; `condicion` se ignora con `descontarStock=false` (e2e `:517`) |
| ADR-8: una entrega con rollback por estado | ✅ | Runbook `DEPLOY-VPS-runbook.md:628` con el detector de solo lectura |
| ADR-9: Ayuda | ⚠️ | Corrección hecha; queda una frase inexacta (W2) |
| ADR-10 | ➖ | El diseño define ADR-1 a ADR-9 |

Las desviaciones registradas son aceptables y están documentadas en `tasks.md` y `apply-progress.md`:
- **Particiones.** WU-3a se hizo en 3 commits, WU-5 en 3, WU-6 en 2, WU-8a en 2 y WU-12 se completó con WU-12b.
- **`size:exception`.** Lo declaran en el commit WU-2 (`3f754d7`, 457), WU-5 parte 2 (`164ca47`, 545), WU-7 (`d506ebb`, 806) y WU-8a parte 2 (`901ea5f`, 629), cada uno con su motivo.
- **Campos `baja*` opcionales en el tipo `Componente` del frontend.** Evitan tocar cada fixture, y el backend los envía siempre. Es inocuo: el rótulo cae en "Dado de baja" y Reactivar se muestra solo si el destino no es `STOCK_USADO`.
- **`refetchOnMount: false` en el observador de stock del selector.** Documentado en `use-stock-insumo.ts`. Las mutaciones siguen invalidando la clave.
- **El AJUSTE no exige insumo habilitado, como antes.** La spec lo pide así ("conserva su regla actual") y lo prueba `registrar-ajuste-insumo.use-case.spec.ts:665`.

### Reglas del proyecto

| Regla | Estado | Evidencia |
|---|---|---|
| Sin atribución de IA | ✅ | `git log main..HEAD --format=%B \| rg -i "co-authored\|claude\|anthropic"` sin resultados |
| Conventional Commits | ✅ | Los 28 commits usan `feat`, `refactor`, `docs` o `test` |
| Deuda de Ayuda en los WU visibles | ✅ | `f46ebbb` (WU-9), `a46cf45` (WU-10), `06ad8c3` (WU-11), `b8fef61` (WU-12) y `559494d` (WU-12b): "Ayuda: pendiente — …". Todavía no hay PR abiertos, así que los cuerpos de PR no se pueden verificar |
| Ayuda corregida (`permisos-y-roles.md`) | ⚠️ | Las tres excepciones son verdaderas: instalar (`EQUIPOS:ALTAS`), devolver al stock (`EQUIPOS:BORRADO`) y recibir una compra (`COMPRAS:MODIFICACION`, `compras.controller.ts:549`). Queda una frase inexacta sobre el ajuste (W2) |
| `openspec/specs/**` intacto | ✅ | `git diff main...HEAD -- openspec/specs` vacío |
| `deploy.ps1` intacto | ✅ | Ningún `.ps1` en el diff |
| `usarLockMasterTest()` | ✅ | El e2e nuevo `equipos-retirar-componente.e2e.spec.ts` y los retargeteados lo conservan. Los specs de integración nuevos usan una base efímera |
| Tamaño de PR (400 líneas) | ⚠️ | `bc938dd` (WU-5 parte 1) tiene 444 líneas según `git show --numstat` (433 según `tasks.md`) y su cuerpo no declara `size:exception` (W1) |

### Preparación operativa

- **Migraciones.** Las dos son aditivas y están ordenadas después de `20260929120000_componentes_insumo_obligatorio`. `condicion` queda `NOT NULL DEFAULT 'NUEVO'` con el default conservado. Las columnas de retiro son nullable, con UNIQUE, FK `ON DELETE RESTRICT` y los dos CHECK con nombre. Ninguna fila existente se modifica, y lo prueba `componentes-equipo-retiro.integration.spec.ts:147`.
- **Rollback.** `DEPLOY-VPS-runbook.md:628` ("Rollback del tracker `stock-usado-componentes`") trae el detector de solo lectura por tenant, que mide `movimientos_usado` y `retiros_con_destino`. Tiene una tabla de tres casos y prefiere corregir hacia adelante o restaurar el dump de `predeploy-dump.ps1`. Coincide con ADR-8.
- **Verificación post-deploy.** `DEPLOY-VPS-runbook.md:762` pide `\d` de las dos tablas, NUEVO igual al stock previo y USADO en 0, y remite al procedimiento de P3009 con `--config prisma.tenant.config.ts`.
- **Estados intermedios no desplegables.** Entre WU-8b y WU-12 el frontend todavía llama al `DELETE`, así que el tracker se integra entero. Está declarado en `tasks.md`.

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. **W1: WU-5 parte 1 supera 400 líneas sin `size:exception`.** El commit `bc938dd` (entidad, errores, controller y catálogo) tiene 444 líneas cambiadas según `git show --numstat` y 433 según `tasks.md`, y su cuerpo no trae la línea `size:exception` con su motivo, que es lo que exige la política de tamaño. Los demás commits grandes sí la declaran. Es un desvío de proceso y no afecta al código.
2. **W2: una frase de `backend/ayuda/permisos-y-roles.md:166-167` es inexacta.** Dice "Fuera de esos tres casos, cualquier otro movimiento sí necesita `ALTAS` en **Insumos**". El ajuste solo exige `INSUMOS:AJUSTAR`: lo muestran `movimientos-insumo.controller.ts:231`, `insumo-detail-view.tsx:341` y el e2e "con AJUSTAR y sin ALTAS: 201 en el ajuste". El párrafo siguiente presenta `AJUSTAR` como otra cosa, así que el daño es bajo. Aun así, la frase la introdujo este ciclo, y una Ayuda que miente es peor que una que falta. Corrección de una línea: "…cualquier otra entrada o salida sí necesita `ALTAS` en **Insumos**; el ajuste tiene su propia casilla".
3. **W3: tres escenarios PARTIAL.**
   - **"Movimiento histórico tras la migración"**: ningún test aplica la migración de `movimientos_insumo` sobre filas previas. Solo se prueba que un INSERT sin la columna queda NUEVO; que el saldo total no cambie se sostiene por construcción.
   - **"Retiro al stock de un repuesto deshabilitado"** y **"Retiro al stock con familia dada de baja"**: la exención se prueba en `registrarDevolucionDeComponente` con fakes, y el retiro solo delega en ese método. Ningún test recorre el retiro completo (caso de uso, integración o HTTP) con un insumo deshabilitado o una familia no vigente.
4. **W4: la tarea 7.3 declara cubiertos casos que no están en el spec del retiro.** La casilla marcada dice "insumo deshabilitado y familia no vigente ⇒ completa; `esRepuesto = false` ⇒ rechazo" en el spec de aplicación del retiro. En `retirar-componente.use-case.spec.ts` solo está el rechazo por `esRepuesto = false` (`:198`). Los otros dos viven en el spec de la entrada, y la casilla sobreestima la cobertura.

**SUGGESTION**:
1. Agregar un caso de integración o e2e del retiro `STOCK_USADO` con el insumo deshabilitado y otro con la familia dada de baja. Así los dos PARTIAL de W3 pasan a COMPLIANT, y W4 queda cubierto.
2. Agregar un caso de integración de la migración `20260930120000` sobre una base con movimientos previos, con el mismo molde de `componentes-equipo-retiro.integration.spec.ts:147`, y afirmar que todos quedan NUEVO y que el saldo total no cambia.
3. En `componente-create-dialog.tsx`, volver el selector a NUEVO cuando cambia el repuesto elegido. Hoy solo se reinicia al abrir el diálogo, así que una elección USADO se arrastra al cambiar de repuesto dentro de la misma apertura. El backend sigue decidiendo sobre el saldo pedido, así que no hay riesgo de datos.
4. `state.yaml` sigue en `phase: apply` con `tasks_progress` vacío. Es un detalle de higiene para el archive.

### Verdict

**PASS WITH WARNINGS.** Las compuertas están en verde (backend 5811/5811, frontend 1610/1610, lint y tipos limpios) y las 18 mutaciones quedan muertas. No hay CRITICAL. Las advertencias son de proceso (W1), de una frase de la Ayuda (W2, corrección de una línea que conviene hacer antes del merge a `main`) y de cobertura parcial (W3, W4). Ninguna bloquea el archive.
