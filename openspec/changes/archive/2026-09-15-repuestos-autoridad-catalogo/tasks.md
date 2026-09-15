# Tasks: Autoridad del catálogo de tipos de componente (camino vinculado)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~280–350 (verificado contra el plan de 12 archivos del design; consistente con su propia estimación de 250–350) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | PR único, 2 commits ordenados |
| Delivery strategy | ask-on-risk |
| Chain strategy | N/A — cabe en un solo PR, sin encadenar |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| WU-1 | Display resuelve el tipo vinculado por el catálogo del tenant | PR 1 (commit 1) | `pnpm vitest run src/equipos/application/use-cases/obtener-equipo.use-case.spec.ts src/insumos/infrastructure/persistence/prisma/prisma-insumo.repository.integration.spec.ts` | N/A — sin escenario e2e propio; cubierto por integración contra la base tenant real | Revertir commit 1 solo: display vuelve a `resolver()`/MASTER, sin pérdida de datos |
| WU-2 | La familia del tenant es la autoridad del alta vinculada; se retira el gate y el error muerto | PR 1 (commit 2) | `pnpm vitest run src/equipos/application/use-cases/agregar-componente.use-case.spec.ts src/equipos/interface/controllers/equipos.controller.spec.ts src/equipos/interface/controllers/equipos-instalar-desde-deposito.e2e.spec.ts` | `equipos-instalar-desde-deposito.e2e.spec.ts`: instalar un repuesto de familia sin fila en MASTER ⇒ 201, luego `GET /equipos/:id` muestra su nombre y `tipoActivo:true` | Revertir commit 2 solo (recomendado): cierra el alta nueva, el display del commit 1 sigue correcto para lo ya creado |

Nota: el plan de tareas requiere precisión a nivel de línea (5 referencias fijas, JSDoc como tarea de primer orden) exigida por el orquestador; el archivo excede el lineamiento genérico de 530 palabras por esa precisión, no por prosa evitable.

## Convenciones

TDD estricto OFF para esta feature: no hay pasos RED/GREEN separados. Cada tarea de código incluye
su test en el mismo commit.

## Orden y paralelismo

WU-1 → WU-2, secuencial, mismo PR (ADR-4). **El orden importa**: invertirlo deja un estado
intermedio entre dos commits individualmente correctos donde un vínculo ya válido se muestra
"Dado de baja" — el display tiene que estar listo ANTES de que se pueda crear lo que necesita.

---

## WU-1 — commit 1: `fix(equipos): el detalle resuelve el tipo de un componente vinculado por su repuesto`

- [x] 1.1 [R3] `backend/src/insumos/domain/ports/i-insumo.repository.ts`: agregar interfaz
      `FamiliaDeInsumo` + `findFamiliasDeInsumos(insumoIds)`; JSDoc con la excepción a la regla de
      "siempre agregado completo" (ADR-3).
- [x] 1.2 [R3] `backend/src/insumos/infrastructure/persistence/prisma/prisma-insumo.repository.ts`:
      implementar con un `findMany`+`select` sobre la relación `familia`; lista vacía no consulta.
- [x] 1.3 [R3] `backend/src/insumos/infrastructure/persistence/prisma/prisma-insumo.repository.integration.spec.ts`:
      varios ids en una llamada; id inexistente omitido del mapa; familia deshabilitada y
      soft-deleted con sus flags crudos.
- [x] 1.4 [R3,R4,R5] `backend/src/equipos/application/use-cases/obtener-equipo.use-case.ts`: cuarto
      parámetro `Pick<IInsumoRepository,'findFamiliasDeInsumos'>`; partición vinculados/texto-libre;
      degradado a `tipoNombre:null, tipoActivo:false` si el `insumoId` falta del mapa; JSDoc (ADR-2).
- [x] 1.5 [R3,R4,R5] `backend/src/equipos/application/use-cases/obtener-equipo.use-case.spec.ts`:
      arreglar la construcción rota en `:50-54` con el cuarto mock; casos ADR-2 — vinculado
      solo-tenant activo y sin badge de baja; los dos caminos en una misma lista con los argumentos
      exactos de cada llamada (anti-N+1); familia deshabilitada/soft-deleted; sin vinculados no
      consulta el tenant, sin texto-libre no consulta MASTER.
- [x] 1.6 [R3] `backend/src/equipos/equipos.module.ts`: agregar `INSUMO_REPOSITORY` al `inject` de
      `ObtenerEquipoUseCase`; actualizar el comentario de wiring.
- [x] 1.7 Cierre WU-1: comando focalizado de 1.7 + suite backend completa + `pnpm typecheck` +
      `pnpm lint`. Commit.

---

## WU-2 — commit 2: `feat(equipos): la familia del inquilino es la autoridad del tipo de un componente vinculado`

- [x] 2.1 [R1] `backend/src/equipos/application/use-cases/agregar-componente.use-case.ts`: mover
      `estaActivo(...)` para que corra SOLO en la rama de texto libre; se retira de la rama vinculada
      (ADR-1); se elimina el import y el throw de `RepuestoSinTipoEnCatalogoError`.
- [x] 2.2 [R8] mismo archivo: reescribir el bloque "LIMITACIÓN DELIBERADA" y el paso 3 de "Flujo"
      (ADR-4) — ningún comentario puede seguir afirmando la restricción retirada.
- [x] 2.3 [R1,R2,R7] `backend/src/equipos/application/use-cases/agregar-componente.use-case.spec.ts`:
      **invertir** el test fijado `~:451` (su propio título nombra a WU-5 como resolutor, no se
      borra) — familia `TORNILLO` sin fila en MASTER ⇒ `isOk()`, `save` con
      `tipoComponenteCodigo:'TORNILLO'`, más `expect(estaActivo).not.toHaveBeenCalled()`; reescribir
      su JSDoc `:441-450`; conservar sin tocar los gemelos que siguen rechazando (insumo/familia) y
      el caso de texto libre con `estaActivo` sí invocado. También corregido el test previo
      "vincular un repuesto deriva tipoComponenteCodigo de la familia del insumo" (`~:188`), que
      afirmaba `estaActivo` llamado con `'MOUSE'` — con ADR-1 ya no se llama, corrección necesaria
      para no dejar una aserción falsa sobre el comportamiento retirado.
- [x] 2.4 [R8] `backend/src/equipos/domain/errors/equipos.errors.ts`: eliminar
      `RepuestoSinTipoEnCatalogoError` (`:236-263`).
- [x] 2.5 [R8] `backend/src/equipos/interface/controllers/equipos.controller.ts`: eliminar el import
      (`:94`) y la rama 422 en `toHttpException` (`:138`).
- [x] 2.6 [R8] `backend/src/equipos/interface/controllers/equipos.controller.spec.ts`: centinela
      17→16 y su título (`:613`, deja de nombrar 5 errores de WU-3 para nombrar 4); quitar la fila
      de la `TABLA` (`:697-698`).
- [x] 2.7 [R1,R6] `backend/src/equipos/interface/controllers/equipos-instalar-desde-deposito.e2e.spec.ts`:
      `crearFamiliaRepuesto` (`:254-270`) deja de sembrar la fila gemela en MASTER; reescribir su
      JSDoc (`:247-253`); el caso `:251` instala un repuesto de familia sin fila en MASTER ⇒ 201, y
      el `GET /equipos/:id` posterior muestra el nombre de la familia con `tipoActivo:true`.
- [x] 2.8 Cierre WU-2: comando focalizado de 2.8 + suite backend completa + `pnpm typecheck` +
      `pnpm lint`. Commit.

---

## Fuera de alcance (heredado del proposal, no se re-abre)

Texto libre, colisión de `codigo` cross-DB, propagación ROOT→inquilinos, migraciones, Ayuda (deuda
anotada en commit/PR, pausa vigente).

## Trazabilidad requisito → tarea

| Requisito (spec) | Tareas |
|---|---|
| R1 Familia del tenant es autoridad en el alta vinculada | 2.1, 2.3, 2.7 |
| R2 Guards de insumo/familia siguen vigentes | 2.3 |
| R3 Display vinculado resuelve por el catálogo del tenant | 1.1–1.6 |
| R4 Display de texto libre sigue resolviendo por MASTER | 1.4, 1.5 |
| R5 Sin fallback cruzado bajo colisión de código | 1.4, 1.5 |
| R6 Baja global en MASTER no bloquea el alta vinculada | 2.7 |
| R7 Texto libre sigue exigiendo código activo en MASTER | 2.3 |
| R8 `RepuestoSinTipoEnCatalogoError` deja de existir | 2.2, 2.4, 2.5, 2.6 |

Threat Matrix del design: N/A — sin filas aplicables, no se derivan tareas de amenaza.
