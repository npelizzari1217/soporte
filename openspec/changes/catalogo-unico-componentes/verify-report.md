```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:69a352f0df9d031911d22ac861b0a9a99e04193304a993af28c23671a6c7a256
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 16/16
scenarios: 25/25
test_command: (cd backend && pnpm test) && (cd frontend && pnpm test)
test_exit_code: 0
test_output_hash: sha256:c5f75b096adf2845c4a2f74a9fe5a5d39f4555824cdc573f2942942b5e43c629
build_command: (cd backend && pnpm lint && pnpm typecheck) && (cd frontend && pnpm lint && pnpm type-check)
build_exit_code: 0
build_output_hash: sha256:38addeb517f4aa142b0cfe3ec4a5b98df4f474024790a5c3c2834477d9d73377
```

## Verification Report

**Change**: catalogo-unico-componentes
**Version**: N/A (specs `specs/componentes-catalogo-unico/spec.md` y delta `specs/repuestos-autoridad-catalogo/spec.md`)
**Mode**: Standard (feature, `strict_tdd: false`), salvo WU-7fix (`6c3b233`, corrección de defecto) verificado en Strict TDD por inyección del orquestador.
**Candidato**: rama `feat/catalogo-unico-componentes-wu12` = tracker, tip `f1436b4`. `git diff main..HEAD`: 24 commits, 114 archivos, +1817/−5783. `evidence_revision` es el sha256 de ese diff. WU-1 ya está en `main` (`134254a`, merge `ca6b1d5`).

### Veredicto

**PASS WITH WARNINGS.** 0 CRITICAL, 4 WARNING, 5 SUGGESTION.

Las seis compuertas pasan sobre el tip final. Las siete mutaciones adversariales quedan muertas. La evidencia TDD de WU-7fix se reprodujo: RED por la razón correcta y GREEN 23/23. Las advertencias son de cobertura (5 escenarios PARTIAL) y de documentación operativa del rollback. Ninguna rompe un requerimiento.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 74 (casillas de WU-1 a WU-12, incluidos WU-7fix, 10a, 10b, 11a y 11b) |
| Tasks complete | 74 |
| Tasks incomplete | 0 |
| Tareas operativas OP.1 a OP.9 | Secuencia del dueño, fuera de `sdd-apply` (no son casillas) |

`gentle-ai sdd-status catalogo-unico-componentes`: `apply: all_done`, `verify: ready`, `tasks: 74/74 complete`.

### Build & Tests Execution

Todas las compuertas se corrieron en WSL sobre el árbol real, en el tip `f1436b4`.

| Compuerta | Comando | Exit | Resultado |
|---|---|---|---|
| Backend lint | `cd backend && pnpm lint` | 0 | `eslint .` sin salida (0 errores) |
| Backend typecheck | `cd backend && pnpm typecheck` | 0 | 0 errores |
| Backend tests | `cd backend && pnpm test` | 0 | **484/484 archivos, 5638/5638 tests** |
| Frontend lint | `cd frontend && pnpm lint` | 0 | "No ESLint warnings or errors" |
| Frontend type-check | `cd frontend && pnpm type-check` | 0 | 0 errores |
| Frontend tests | `cd frontend && pnpm test` | 0 | **210/210 archivos, 1576/1576 tests** |

Las cifras coinciden con las que reporta apply-progress para WU-12. Las bases locales `soporte_master_test` y `soporte_tenant_test` están migradas. En `soporte_master_test`, `to_regclass('public.tipos_componente')` es NULL y `20260929130000_drop_tipos_componente` figura como aplicada. En `soporte_tenant_test`, `insumo_id` es `NOT NULL` y `tipo_componente_codigo` no existe.

**Coverage**: no se midió (`coverage_threshold: 0`).

### Verificación adversarial (mutaciones locales, todas revertidas)

| # | Mutación | Archivo | Resultado |
|---|---|---|---|
| M1 | `dto.descontarStock ?? true` → `?? false` | `equipos.controller.ts:357` | **Muerta**: 8 rojos (e2e "descontarStock omitido…", flujo feliz y atomicidad; controller "omitido → instala") |
| M2 | Guard de la migración desactivado (`IF false`) | `migration.sql` de `20260929120000` | **Muerta**: 3/3 rojos |
| M2b | El guard ignora las borradas (`AND deleted_at IS NULL`) | ídem | **Muerta**: rojo "aborta si la única fila … está borrada lógicamente" |
| M3 | La edición aplica un `insumoId` sobrante | `editar-componente.use-case.ts:54` | **Muerta**: rojo "un tipoComponenteCodigo o un insumoId sobrantes no cambian…" |
| M4 | Se quita el guard `esRepuesto` | `agregar-componente.use-case.ts:86` | **Muerta**: rojo "familia no repuesto (consumible) → InsumoNoEsRepuestoError" |
| M5 | `tipoActivo` ignora `deletedAt` | `obtener-equipo.use-case.ts:75` | **Muerta**: rojo "familia soft-deleted → … tipoActivo false" |
| M6 | La casilla arranca desmarcada | `componente-create-dialog.tsx:41` | **Muerta**: 4 rojos ("arranca marcada", payload explícito y reset al abrir) |

Después de revertir, `vitest run prisma_tenant/componentes-insumo-obligatorio.integration.spec.ts src/equipos` dio 27 archivos y 320 tests en verde, y `vitest run src/features/equipos` dio 12 archivos y 131 tests en verde. `git status` quedó limpio.

### Strict TDD: WU-7fix (`6c3b233`)

| Task | Test File | RED | GREEN | TRIANGULATE | SAFETY NET | Verificación independiente |
|---|---|---|---|---|---|---|
| F.1/F.2 | `backend/scripts/limpiar-componentes-sin-insumo.integration.spec.ts` | Written | 23/23 | 3 casos sobre base migrada (columna ausente, reporte exit 0, `--apply --esperadas=0`) | 20/20 | Se usó una copia `git archive 6c3b233` con el script de `6c3b233^`. Resultado: **2 failed / 5 passed**, `column c.tipo_componente_codigo does not exist`, que es la razón correcta. Con el script de `6c3b233`: **23/23** (unit + integración) |

La tabla de TDD Cycle Evidence existe en `apply-progress.md` (sección WU-7fix). El fix y su test de regresión viajan en el mismo commit, con el cuerpo que describe W1 a W3. **1/1 tareas con evidencia TDD completa.**

### Spec Compliance Matrix

`componentes-catalogo-unico` (8 requerimientos, 21 escenarios):

| Requerimiento | Escenario | Código | Test | Resultado |
|---|---|---|---|---|
| Alta exige insumo repuesto válido | Alta sin insumoId | `equipos.dto.ts:257` (`@IsUUID`), `agregar-componente.use-case.ts:67` | `agregar-componente.use-case.spec.ts:105`; e2e `equipos-instalar-desde-deposito.e2e.spec.ts:556` | ✅ COMPLIANT |
| | Cada guard rechaza con su error propio | `agregar-componente.use-case.ts:75,83,86,89` | `agregar-componente.use-case.spec.ts:118-176` (7 casos), M4 | ✅ COMPLIANT |
| | Alta válida | `agregar-componente.use-case.ts:96-104` | `agregar-componente.use-case.spec.ts:178`; e2e `:393` | ✅ COMPLIANT |
| Un solo flujo de alta con descuento opcional | Descuento por defecto | `equipos.controller.ts:357` | e2e `:518`; `equipos.controller.spec.ts:229`; M1 | ✅ COMPLIANT |
| | Falla la SALIDA y se revierte el alta | `InstalarComponenteDesdeDepositoUseCase` (tx, sin cambio de lógica) | e2e `:455`, `:476` | ✅ COMPLIANT |
| | Alta sin descuento | `equipos.controller.ts:363` | e2e `:499` (0 movimientos, sin stock); `equipos.controller.spec.ts:266`; frontend `componente-create-dialog.test.tsx:171,183` (serie y capacidad) | ✅ COMPLIANT |
| Tipo derivado de la familia | Familia propia del tenant sin catálogo global | `agregar-componente.use-case.ts` sin `ITipoComponenteMasterChecker` | `agregar-componente.use-case.spec.ts:199,222`; e2e `:393` (`tipoActivo: true` sin fila MASTER) | ✅ COMPLIANT |
| | Un tipo enviado en el request no define el tipo | DTO sin el campo + `whitelist` (ADR-2); sin columna de tipo | `equipos.dto.spec.ts:260,310`; e2e `:618` | ✅ COMPLIANT |
| La edición no cambia tipo ni insumo | Edición de datos propios | `editar-componente.use-case.ts:54` | `editar-componente.use-case.spec.ts:67` | ✅ COMPLIANT |
| | Intento de cambiar el insumo | ídem; `EditarComponenteHttpDto` sin el campo | `editar-componente.use-case.spec.ts:86`; `equipos.controller.spec.ts:382`; M3 | ✅ COMPLIANT |
| | Reemplazo como retiro más alta | composición de `eliminar-componente` y `agregar-componente` | `eliminar-componente.use-case.spec.ts:7` + `agregar-componente.use-case.spec.ts:178` + `obtener-equipo.use-case.spec.ts:191` (lista activos y retirados), por separado | ⚠️ PARTIAL |
| Retiro = borrado lógico sin stock | Retiro sin stock | `eliminar-componente.use-case.ts:25-36` (solo depende de `componenteRepo`) | `eliminar-componente.use-case.spec.ts:7` (soft delete); "saldo sin cambio" solo por construcción | ⚠️ PARTIAL |
| Display por la familia del tenant | Familia activa | `obtener-equipo.use-case.ts:75` | `obtener-equipo.use-case.spec.ts:56`; e2e `:393` | ✅ COMPLIANT |
| | Familia desactivada | ídem | `obtener-equipo.use-case.spec.ts:83` (deshabilitada y soft-deleted), `:191`; M5 | ✅ COMPLIANT |
| Migración fail-closed | Fila viva con insumo_id NULL | `migration.sql` (`DO $$`, guard) | `componentes-insumo-obligatorio.integration.spec.ts:96`; M2 | ✅ COMPLIANT |
| | Fila borrada lógicamente con insumo_id NULL | guard sin filtro `deleted_at` | ídem `:107`; M2b | ✅ COMPLIANT |
| | Migración exitosa | `SET NOT NULL`, `DROP INDEX`, `DROP COLUMN` | ídem `:116`: afirma NOT NULL, sin columna, sin índice y FK `r`, pero **solo con la tabla vacía** | ⚠️ PARTIAL |
| | Tenant nuevo con tabla vacía | ídem | ídem `:116` | ✅ COMPLIANT |
| Catálogo MASTER inexistente | Endpoints retirados | `backend/src/tipos-componente/**` borrado; `equipos.controller.ts:266` (id no UUID → 404) | e2e `:585` (`GET /equipos/tipos-componente`), `:596` (5 rutas, ROOT); `equipos.controller.spec.ts:135` | ✅ COMPLIANT |
| | Pantalla y navegación retiradas | `app/(dashboard)/admin/tipos-componente/` borrado; `nav-config.ts` sin entrada | `app-sidebar.test.tsx:96` (sin link); la ausencia de la ruta solo por el sistema de archivos | ⚠️ PARTIAL |
| | Tabla MASTER eliminada | `prisma_master/migrations/20260929130000_drop_tipos_componente/migration.sql`; modelo fuera de `schema.prisma` | Ningún test automatizado. Evidencia en runtime: `to_regclass` NULL en `soporte_master_test`, migración aplicada | ⚠️ PARTIAL |

Delta `repuestos-autoridad-catalogo` (4 MODIFIED con 4 escenarios, 4 REMOVED):

| Requerimiento | Escenario | Test | Resultado |
|---|---|---|---|
| La familia del tenant es la autoridad del tipo en el alta | Familia propia del inquilino se vincula sin catálogo global | `agregar-componente.use-case.spec.ts:199` | ✅ COMPLIANT |
| Los guards de insumo y familia rigen todo alta | Cada guard sigue rechazando con su error propio | `agregar-componente.use-case.spec.ts:118-176` | ✅ COMPLIANT |
| El display resuelve por el catálogo del tenant | Componente de familia solo-tenant se muestra activo | e2e `:393` (`tipoNombre` real, `tipoActivo: true`, sin fila MASTER) | ✅ COMPLIANT |
| Errores del texto libre dejan de existir | El catálogo de errores ya no incluye los retirados | `equipos.controller.spec.ts:563` (exactamente 13 clases, contadas desde el módulo); `equipos.errors.ts` exporta 13 | ✅ COMPLIANT |
| REMOVED: display de texto libre por MASTER | (sin escenario) | `rg` sin `TipoComponenteMaster` ni lectura MASTER en `backend/src` | ✅ Retirado |
| REMOVED: sin fallback cruzado bajo colisión | (sin escenario) | un solo camino (`obtener-equipo.use-case.ts:75`) | ✅ Retirado |
| REMOVED: baja global MASTER no bloquea el alta vinculada | (sin escenario) | tabla y módulo MASTER borrados | ✅ Retirado |
| REMOVED: texto libre exige código activo en MASTER | (sin escenario) | `TipoComponenteInactivoError` y `TipoComponenteCodigoRequeridoError` inexistentes (`rg` vacío) | ✅ Retirado |

**Compliance summary**: 25/25 escenarios con evidencia en verde. 20 son COMPLIANT y 5 son PARTIAL. Un PARTIAL tiene un test que corrió y pasó, pero cubre la propiedad por un camino más angosto que el del escenario. En el caso de la tabla MASTER, la evidencia es una inspección del esquema en runtime, no un test; se sigue el criterio de conteo de `archive/2026-09-21-logo-por-cliente/verify-report.md`. Hay 0 UNTESTED. Los requerimientos cuentan 16/16: 8 del spec nuevo, 4 MODIFIED y 4 REMOVED.

### Correctness (Static Evidence)

| Decisión del proposal | Estado | Evidencia |
|---|---|---|
| Catálogo único, `insumo_id` NOT NULL con familia `esRepuesto` | ✅ | `prisma_tenant/schema.prisma` (`insumoId String`), migración, guards del alta |
| Tipo derivado; columna e índice eliminados | ✅ | `migration.sql`; entidad sin `tipoComponenteCodigo` |
| MASTER retirado (módulo, 5 endpoints, `GET /equipos/tipos-componente`, checker, puerto, feature, ruta, navegación) | ✅ | `rg "tipos-componente\|TiposComponente"` solo devuelve tests de 404 y comentarios históricos |
| Un solo diálogo, casilla marcada por defecto | ✅ | `componente-create-dialog.tsx:41,69,141`; `componente-instalar-dialog` borrado |
| Reemplazo = retiro + alta; edición sin tipo ni insumo | ✅ | `componente-edit-dialog.tsx:86-91` (texto de solo lectura); `EditarComponenteDto` |
| El retiro sigue siendo soft delete | ✅ | `eliminar-componente.use-case.ts` sin cambios de lógica (el diff solo toca su spec: +2/−4) |
| Sin campo de comportamiento; nada ramifica por `familia.codigo` | ✅ | `rg "familia\??\.codigo"`: solo mensaje de error, DTO de familias y el guard de edición de familias (no relacionado) |
| Migración fail-closed, nunca borra en silencio | ✅ | Guard `RAISE EXCEPTION`; la limpieza es el script explícito con `--esperadas` |
| Fuera de alcance ausente (retiro con devolución USADO, condición NUEVO/USADO, elección de saldo) | ✅ | Sin cambios en `insumos` más allá de lo que consume el alta |
| `AGENTS.md` corregido | ✅ | `:208` cita la prioridad en `ticket-edit-form` (existe `conValorFueraDeCatalogo`); `:217-220` pasa a 6 campos |

### Coherence (Design)

| Decisión | ¿Se cumple? | Notas |
|---|---|---|
| ADR-1: un endpoint con `descontarStock`; ruta de instalación retirada | ✅ | `equipos.controller.ts:357`; e2e `:566` → 404; `"false"` en texto → 400 (e2e `:539`) |
| ADR-2: un tipo sobrante se ignora | ✅ | Sin `forbidNonWhitelisted`; tests de DTO, controller y e2e |
| ADR-3: script previo más precondición de solo lectura en `deploy.ps1` | ✅ | `deploy.ps1:206-226` (paso 5a, después de `.env` y antes de `prisma generate`); ASCII sin BOM (`rg` sin bytes > 0x7F, cabecera `# d`) |
| ADR-4: una sola sentencia `DO $$` | ✅ | Idéntica al diseño; el mensaje nombra la ruta `backend/scripts/...` |
| ADR-5: DROP MASTER en el mismo release, sin `rollback.sql` | ✅ | `20260929130000_drop_tipos_componente` (solo `migration.sql`) |
| ADR-6: forma de las respuestas | ✅ | `ComponenteResponseDto` sin tipo (`equipos.controller.spec.ts:287`); fallback `"—"` en el frontend |
| ADR-7: WU-1 a `main` y el resto en cadena sobre el tracker | ✅ | `134254a` en `main`; 24 commits en `main..HEAD` |

Las desviaciones registradas son aceptables y están documentadas en `tasks.md` y `apply-progress.md`:
- **5.3.** El catálogo quedó en 14 clases en WU-5 y llegó a 13 en WU-6.
- **`size:exception`.** WU-1 (709 líneas), WU-3 (794), WU-4 (516), WU-5b (496), WU-6 (534) y WU-8 (1053) la usan, cada uno con el motivo de que partirlo separa código de sus tests o no compila.
- **Particiones.** WU-5 se partió en 5a y 5b, WU-10a en 10a y 10a2, y WU-10b y WU-11b en commits por carpeta.
- **WU-7fix.** Es un bugfix con TDD, originado en la verificación de WU-7.
- **`GET /equipos/:id` con un id que no es UUID → 404** (antes, 500 de Postgres). Es un cambio de contrato fuera del alcance literal. Es inocuo, está justificado para que la ruta retirada no responda 500 y lo cubre `equipos.controller.spec.ts:135`.

### Reglas del proyecto

| Regla | Estado | Evidencia |
|---|---|---|
| Sin atribución de IA | ✅ | `git log main..HEAD --format=%B \| rg -i "co-authored\|claude\|anthropic"` sin resultados |
| Conventional Commits | ✅ | Los 24 commits usan `feat`, `fix`, `refactor` o `docs` |
| Deuda de Ayuda en los WU visibles | ✅ | `6980621` (WU-4), `3e008c7` (WU-8), `7f63b31` (WU-9), `704cbab` (WU-11a): "Ayuda: pendiente — …". Los cuerpos de PR no se verificaron localmente |
| Ningún artículo de Ayuda queda falso | ✅ | `backend/ayuda/` sin cambios |
| `openspec/specs/**` intacto | ✅ | `git diff main..HEAD -- openspec/specs` vacío |
| `deploy.ps1` ASCII sin BOM | ✅ | Verificado; `ps1-ascii.spec.ts` en verde |
| `usarLockMasterTest()` | ✅ | El e2e retargeteado lo conserva; los specs de WU-1, WU-6 y WU-7fix usan base efímera |

### Preparación operativa

- **Secuencia del deploy del tracker.** `DEPLOY-VPS-runbook.md` ("Deploy del tracker (proactivo, en este orden)") pide `predeploy-dump.ps1`, después el reporte, después `--apply --esperadas=N` tras la confirmación del dueño y recién entonces `deploy.ps1`. Coincide con OP.4 a OP.8 de `tasks.md`.
- **El script sirve antes y después de migrar.** `to_jsonb(c) ->> 'tipo_componente_codigo'` lo hace funcionar en tenants migrados y sin migrar, así que el paso 5a no bloquea los deploys posteriores.
- **Recuperación P3009.** El runbook la documenta con `--config prisma.tenant.config.ts`, que es obligatorio.
- **Rollback.** El proposal, el diseño y `tasks.md` ("Rollback") fijan la regla: revertir el código y restaurar el dump de `predeploy-dump.ps1`, siempre juntos. El runbook solo lo dice para el borrado de filas (`:179`). Ver W3.

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. **W1: cinco escenarios PARTIAL.** Son "Reemplazo como retiro más alta", "Retiro sin stock", "Migración exitosa", "Pantalla y navegación retiradas" y "Tabla MASTER eliminada".
   - "Reemplazo como retiro más alta" y "Retiro sin stock" no tienen test propio, aunque la tarea 5.4 los declara cubiertos. El "saldo sin cambio" solo lo garantiza la firma del caso de uso.
   - "Migración exitosa" se prueba con la tabla vacía y nunca con una fila vinculada presente.
   - Ningún test falla si desaparece `20260929130000_drop_tipos_componente`.
   - Ninguno de los cinco rompe comportamiento: el código cumple por construcción o por inspección.
2. **W2: la tarea 5.4 declara cubiertos escenarios que no tienen test** ("Reemplazo como retiro más alta", "Retiro sin stock"). La casilla marcada sobreestima la cobertura real.
3. **W3: el runbook no documenta el rollback de este release.** No dice que revertir el tracker exige restaurar el dump de master y de cada tenant: DROP de `tipo_componente_codigo`, DROP de `tipos_componente` y borrado de las 12 filas. El procedimiento genérico existe (`DEPLOY-VPS-runbook.md:683`), pero su título lo ata al backfill de fechas, y el proposal y el diseño remiten a él como si cubriera este caso.
4. **W4: el e2e de los 404 de `tipos-componente` no levanta `AppModule`.** Prueba la ausencia de rutas en el harness, no el desregistro real. apply-progress lo declara como limitación. El desregistro lo cubre el typecheck, porque el módulo ya no existe.

**SUGGESTION**:
1. Agregar un caso de integración de la migración con una fila **vinculada** presente, que verifique que pasa y conserva la fila.
2. En `componentes-insumo-obligatorio.integration.spec.ts`, mover la limpieza a `afterEach`. Con la mutación M2b, el fallo del test 2 dejó una fila y arrastró al test 3 (fallo en cascada).
3. Un test de esquema master (`to_regclass('tipos_componente') IS NULL` después de migrar) convertiría "Tabla MASTER eliminada" en COMPLIANT.
4. `backend/src/tickets/interface/controllers/catalogos.controller.ts:113` cita como criterio vigente la ruta retirada `/equipos/tipos-componente`. Conviene reescribir el comentario.
5. `state.yaml` sigue en `phase: apply` con `tasks_progress` vacío. Los commits de WU-10b se rotulan "(1/4)" y después "(2/6)" a "(6/6)". Son detalles de higiene para el archive.

### Verdict

**PASS WITH WARNINGS.** Las compuertas están en verde (backend 5638/5638, frontend 1576/1576, lint y tipos limpios), las 7 mutaciones quedan muertas y el TDD de WU-7fix se reprodujo. No hay CRITICAL. Las advertencias son de cobertura parcial y de documentación del rollback, y no bloquean el archive.
