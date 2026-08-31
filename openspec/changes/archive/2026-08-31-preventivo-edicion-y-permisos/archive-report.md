# Archive Report — `preventivo-edicion-y-permisos`

**Cerrado**: 2026-08-31 · **Rama de archive**: `chore/archivar-preventivo-edicion-y-permisos`
(base `origin/main` en `89cd900`) · **Modo de artefactos**: híbrido (openspec + engram).

Todo el código de este change ya estaba mergeado a `main` antes de este pasaje. Este archive
es papelería: sincroniza los delta specs contra `openspec/specs/` (vacío hasta ahora — es el
**primer archive** de este repo) y mueve la carpeta del change a `openspec/changes/archive/`.
Ningún archivo de código ni ninguna migración se tocó en este pasaje.

## Veredicto de verify: PASA CON HALLAZGOS — no "cerrado sin observaciones"

El verify (`verify-report.md`, HEAD `9579583`, observación engram #2937) encontró **1 CRITICAL,
3 WARNING, 4 SUGGESTION**. Antes de archivar se cerraron 2 de los 4 hallazgos no-SUGGESTION con
evidencia real, uno queda parcialmente abierto a propósito, y las 4 SUGGESTION quedan abiertas
y declaradas. La tabla completa, con el estado verificado a esta fecha:

| Hallazgo | Severidad | Estado al archivar | Evidencia |
|---|---|---|---|
| **C1** — el test de "`activo` en el mismo envío" no podía fallar por ningún camino (assert dentro del resolver de MSW + `vi.mock("sonner")` sin limpiar entre tests; en backend, ningún caso e2e cubría el PATCH de `activo`) | CRITICAL | **CERRADO**, WU-4, commit `dd4d9d9` (PR #89, merge `75c1a58`) | **Re-verificado por este archive**, no solo por asserción del prompt de lanzamiento: se reintrodujeron a mano los dos mutantes exactos del verify original (`activo: plan.activo` en `plan-preventivo-edit-dialog.tsx:222`; `activo: undefined` en `preventivo.controller.ts:181`) sobre el árbol actual (post-WU-4/WU-5) y ambos murieron por la aserción — frontend: `expected true to be false` en `plan-preventivo-edit-dialog.test.tsx:200`; backend: `expected true to be false` en `preventivo.e2e.spec.ts:511`. Los dos archivos se restauraron y se confirmó byte-idéntico con `git diff --quiet` antes de continuar. Sin los mutantes, ambos tests vuelven a verde (28/28 frontend; e2e backend 1/1 en el caso nuevo). |
| **W1** — el `DELETE` de la migración de swap de permisos podía filtrar por `activo` sin que nada se rompiera (comentario de cabecera del spec afirmaba una cobertura que no existía) | WARNING | **CERRADO**, WU-5, commits `a170fe9`/`51782ed` (PR #90, merge `89cd900`) | Evidencia de mutación en `apply-progress` (obs. engram #2911): reintroducir `AND m.activo = true` en el `DELETE` dejó 2/8 rojo por asserción de igualdad profunda; sin el guard, 8/8 verde. Este archive corrió `swap-preventivo-permisos.integration.spec.ts` sobre el árbol actual y confirmó verde (parte de los 10 tests pasados en el spot-check de abajo). |
| **W2** — el cableado DI de `EQUIPO_INFORMATICO_REPOSITORY` en `preventivo.module.ts` (que hace posible OT-R1) no tenía ninguna cobertura desde el contenedor real de Nest | WARNING | **CERRADO**, WU-5, mismos commits que W1 | Evidencia de mutación en `apply-progress` (obs. #2911): sacar el token del `inject` dejó 1/2 rojo reproduciendo el síntoma exacto de producción (`EQUIPO_NO_CONSULTABLE`); sin la mutación, 2/2 verde. Este archive corrió `generar-preventivos-wiring.integration.spec.ts` sobre el árbol actual y confirmó verde. |
| **W3** — la tarea 1.7 quedó marcada `[x]` con 1 de 3 citas del comentario de cabecera de `20260825120100_backfill_preventivo_permisos/migration.sql` sin actualizar, y la que quedó ahora miente ("COLABORADOR NO lleva este módulo") | WARNING | **PARCIALMENTE ABIERTO, A PROPÓSITO** — decisión registrada, no pendiente por descuido | Motivo exacto: esa migración ya salió del repo (entró a `main` en el PR #84, merge `4976a15`) y Prisma valida el checksum sha256 de cada migración aplicada contra `_prisma_migrations` — editar un byte del archivo rompe `migrate deploy` si producción ya la corrió (no hay forma de confirmarlo desde este entorno, y el costo de equivocarse es asimétrico). La corrección del hecho vive en `backend/ayuda/permisos-y-roles.md` y en el ADR-3 de `design.md` (ambos ya reflejan el rol correcto); el comentario de la migración queda como registro histórico de lo que era cierto cuando corrió, no como documentación viva. Ver también observación de aprendizaje engram #2938 ("una migración sin aplicar LOCALMENTE no es editable: lo editable es lo que no salió del repo"). |
| **S1** — el delta `preventivo-objetivo-en-ticket/spec.md` (líneas ~45-50) usa `(dado de baja)` como ejemplo para el caso `deletedAt` no nulo; el código (ADR-1, cinco estados) reserva `(dado de baja)` para `activo=false` y usa `(eliminado del inventario)` para `isDeleted()` | SUGGESTION | **ABIERTO, declarado** | El verify sugería corregirlo antes de archivar. No se tocó: el mandato de este pasaje es mover contenido, no reescribirlo, y el spec se sincroniza tal cual a `openspec/specs/preventivo-objetivo-en-ticket/spec.md` — la inconsistencia terminológica queda en el spec definitivo hasta que un change la corrija explícitamente. |
| **S2** — `useReaplicarAlResolver` (hook compartido, exportado, 3 consumidores) no tiene spec propio | SUGGESTION | **ABIERTO, declarado** | Sin cambios. |
| **S3** — falta el "caso b" (catálogo que resuelve después del montaje) para el select de EQUIPO en los tests de UI | SUGGESTION | **ABIERTO, declarado** | Sin cambios. |
| **S4** (preexistente, no de este change) — `@MaxLength(UBICACION_MAX_LENGTH)` del HttpDto mide el valor crudo mientras el dominio mide el normalizado; produce 422 en vez de 400, nunca 500 | SUGGESTION | **ABIERTO, declarado, preexistente** | Sin cambios; fuera del alcance de este change. |

**Por qué esta tabla no es "ciclo cerrado sin observaciones"**: quedan 5 hallazgos abiertos al
cierre (W3 parcial + S1-S4). Se documentan explícitamente en vez de omitirse.

## Gate de revisión nativa (RDD)

`gentle-ai review mode status` devuelve `off (decided by default)` en este repo. El kill switch
está apagado: no hay `reviewGate` para este candidato — no corrió código de revisión y no hay
nada que leer ni bloquear. El archive procede bajo política ordinaria del repo (rama + PR).

## Gate de completitud de tareas

`tasks.md` archivado: **40/40** tareas de las unidades WU-0 a WU-3 en `[x]`, más **WU-4** (3
tareas, cierre de C1) y **WU-5** (3 tareas, cierre de W1/W2), también en `[x]`. Cero checkboxes
sin marcar. Fuente: lectura directa del archivo commiteado (verdad ante divergencia) y de la
observación engram `sdd/preventivo-edicion-y-permisos/tasks` (#2909).

## Unidades entregadas

| Unidad | Qué hizo | PR / commits |
|---|---|---|
| WU-0 | Cobertura backend previa a la feature | mergeado antes del corte de este ciclo |
| WU-1 | Swap de permisos del módulo Preventivo, de TECNICO a COLABORADOR (migración de datos + presets de rol) | PR #84 (merge `4976a15`) |
| WU-2 | Objetivo del plan (equipo/ubicación) antepuesto a la descripción del ticket generado, con degradación sin fallar | PR #85/#86 (merge `61ab051`/`536b8e2`), commit `e2aa951` |
| WU-3 | Pantalla de edición de planes preventivos (formulario único, `activo` incluido, guard de permisos `PREVENTIVO:MODIFICACION`) | commits `d81f7b6`, `595eb96` |
| WU-4 | Cierre de C1 (candado roto del checkbox `activo` en el PATCH, en las dos capas) | PR #89 (merge `75c1a58`), commit `dd4d9d9` |
| WU-5 | Cierre de W1 (DELETE del swap sin filtrar `activo`) y W2 (cableado DI de `EQUIPO_INFORMATICO_REPOSITORY` sin cobertura) | PR #90 (merge `89cd900`), commits `a170fe9`/`51782ed` |

## Verificación de este pasaje (papelería, no código)

```
cd backend  && pnpm typecheck && pnpm lint
cd frontend && pnpm type-check && pnpm lint
```

Backend: `tsc` y `eslint` en 0. Frontend: `tsc --noEmit` y `eslint` en 0. No se corrieron las
suites completas (no aplica: no se tocó código de producción ni de test en este pasaje), pero sí
se corrieron de forma focalizada, como parte de la re-verificación independiente de C1/W1/W2
detallada en la tabla de hallazgos arriba: `plan-preventivo-edit-dialog.test.tsx` (28/28),
`preventivo.e2e.spec.ts -t "activo:false se persiste"` (1/1), `swap-preventivo-permisos.
integration.spec.ts` + `generar-preventivos-wiring.integration.spec.ts` (10/10). Las mutaciones
usadas para la re-verificación de C1 se aplicaron y restauraron sobre el árbol de trabajo, con
`git diff --quiet` confirmando byte-identidad antes de seguir; `git status --short` quedó vacío
en cada punto de control.

Números de suite completa citados en este informe (backend 351/3761, frontend 163/1092) son los
del cierre de WU-5 (`apply-progress` obs. #2911 y `tasks.md` 5.3), la fuente de mayor rango
disponible para el estado final — no se re-corrió la suite completa en este pasaje de archive
porque no había código para invalidarlos.

### Confirmación: ningún archivo de código ni ninguna migración se tocó

`git status --short` antes de escribir este informe:

```
R  openspec/changes/preventivo-edicion-y-permisos/design.md -> .../archive/2026-08-31-preventivo-edicion-y-permisos/design.md
R  openspec/changes/preventivo-edicion-y-permisos/proposal.md -> .../proposal.md
R  openspec/changes/preventivo-edicion-y-permisos/spec.md -> .../spec.md
R  openspec/changes/preventivo-edicion-y-permisos/specs/preventivo-edicion-plan/spec.md -> .../specs/preventivo-edicion-plan/spec.md
R  openspec/changes/preventivo-edicion-y-permisos/specs/preventivo-objetivo-en-ticket/spec.md -> .../specs/preventivo-objetivo-en-ticket/spec.md
R  openspec/changes/preventivo-edicion-y-permisos/specs/preventivo-permisos-rol/spec.md -> .../specs/preventivo-permisos-rol/spec.md
R  openspec/changes/preventivo-edicion-y-permisos/tasks.md -> .../tasks.md
R  openspec/changes/preventivo-edicion-y-permisos/verify-report.md -> .../verify-report.md
?? openspec/specs/preventivo-edicion-plan/
?? openspec/specs/preventivo-objetivo-en-ticket/
?? openspec/specs/preventivo-permisos-rol/
```

Todas las entradas son movimientos/renombres detectados por git (`R`) dentro de
`openspec/changes/` y archivos nuevos (`??`) dentro de `openspec/specs/`. Ningún `.ts`, `.tsx`,
`.sql`, `AGENTS.md`, `CLAUDE.md`, `README.md` ni archivo de `backend/ayuda/` figura en el
listado. Las dos ediciones de mutación (frontend y backend, para re-verificar C1) se restauraron
byte-idénticas antes de este `git status`, así que no aparecen.

## Specs sincronizados

`openspec/specs/` estaba vacío (`.gitkeep` únicamente) — primer archive del repo. Los tres
deltas del change son specs completos, copiados mecánicamente (`cp` + `diff -r` vacío en cada
uno, ver evidencia de comandos en la sesión de archive):

| Dominio | Acción | Archivo destino |
|---|---|---|
| `preventivo-permisos-rol` | Creado (spec completo, no delta) | `openspec/specs/preventivo-permisos-rol/spec.md` |
| `preventivo-objetivo-en-ticket` | Creado (spec completo, no delta) | `openspec/specs/preventivo-objetivo-en-ticket/spec.md` |
| `preventivo-edicion-plan` | Creado (spec completo, no delta) | `openspec/specs/preventivo-edicion-plan/spec.md` |

Ningún contenido se reescribió: la S1 (inconsistencia terminológica `dado de baja` vs. `eliminado
del inventario` en `preventivo-objetivo-en-ticket/spec.md`) viaja tal cual al spec definitivo,
declarada arriba como hallazgo abierto.

## Trazabilidad de observaciones engram leídas

- `sdd/preventivo-edicion-y-permisos/proposal` — obs. #2906
- `sdd/preventivo-edicion-y-permisos/spec` — obs. #2907
- `sdd/preventivo-edicion-y-permisos/design` — obs. #2908
- `sdd/preventivo-edicion-y-permisos/tasks` — obs. #2909
- `sdd/preventivo-edicion-y-permisos/apply-progress` — obs. #2911 (evidencia de mutación W1/W2)
- `sdd/preventivo-edicion-y-permisos/verify-report` — obs. #2937
- Aprendizaje relacionado (W3): obs. #2938 — "una migración sin aplicar LOCALMENTE no es
  editable: lo editable es lo que no salió del repo"

## Qué queda abierto tras este cierre

1. **W3 (parcial)**: el comentario de `20260825120100_backfill_preventivo_permisos/migration.sql`
   sigue sin corregir, a propósito — es historia inmutable del repo. La verdad vive en la Ayuda
   y en el ADR-3.
2. **S1**: inconsistencia terminológica `(dado de baja)` vs. `(eliminado del inventario)` en el
   spec definitivo de `preventivo-objetivo-en-ticket`.
3. **S2**: `useReaplicarAlResolver` sin spec propio.
4. **S3**: falta el "caso b" (catálogo tardío) en los tests de UI del select de equipo.
5. **S4** (preexistente): `@MaxLength` del DTO mide crudo, el dominio mide normalizado.

Ninguno de los cinco bloquea el archive: los cuatro SUGGESTION son de severidad informativa por
definición, y W3 tiene una razón técnica explícita (checksum de migración) que impide su cierre
total sin arriesgar `migrate deploy` en producción.

## SDD Cycle Complete

El ciclo fue planificado, implementado, verificado (con hallazgos, dos de ellos cerrados
post-verify con evidencia de mutación) y archivado. Listo para el siguiente change.
