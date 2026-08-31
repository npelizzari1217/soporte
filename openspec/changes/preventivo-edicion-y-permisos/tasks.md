# Tasks: Edición de planes preventivos y corrección de permisos

## Convenciones de ejecución

- **RED** = escribir el test, correrlo y **verlo fallar por la aserción**. Si el fallo llega
  por módulo inexistente o `TypeError`, primero se crea el esqueleto (firmas exportadas con
  retorno neutro, componente que solo renderiza) y se vuelve a correr. Un RED por import roto
  no cuenta como RED.
- **GREEN** = implementación mínima que pone en verde ese test.
- **COB** = cobertura de conducta ya entregada. Puede nacer verde; si nace roja es un defecto
  real: se reporta, **no** se ajusta el test a la implementación.
- Antes de cerrar cada unidad, mutar el guard central de la unidad y confirmar que la suite
  se pone roja **por la aserción**; revertir la mutación y reconfirmar.
- Un commit por unidad, con sus tests y su Ayuda adentro. Máximo 5 archivos de código
  (`.ts`/`.tsx` sin tests) por commit.
- Comando focalizado: `pnpm vitest run <ruta>`. Cierre de unidad: suite completa +
  `pnpm typecheck` (back) / `pnpm type-check` (front) + `pnpm lint`.

## Orden y paralelismo

| Unidad | Entregable | Depende de | Archivos de código |
|---|---|---|---|
| WU-0 | Cobertura de la edición ya implementada en backend | — | 0 (test-only) |
| WU-1 | Swap de permisos TECNICO → COLABORADOR | — | 1 |
| WU-2 | Objetivo del plan en la descripción del ticket | — | 3 |
| WU-3 | UI de edición de planes | — | 5 |

Las cuatro son **independientes en código**, pero se ejecutan **secuencialmente**
WU-0 → WU-1 → WU-2 → WU-3: WU-1, WU-2 y WU-3 editan `backend/ayuda/mantenimiento-preventivo.md`
(secciones distintas, un solo escritor por archivo) y `sdd-apply` no admite instancias paralelas.
Dentro de cada unidad, el orden de las tareas es estricto: RED antes que su GREEN.

## Fuera de alcance (decidido, no implícito)

`PATCH /preventivo/planes/:id` devuelve `proximaEjecucionEn` **desactualizada** cuando cambia la
cadencia: `EditarPlanUseCase` persiste el puntero por el repositorio y devuelve la misma entidad
sin mutar (`editar-plan.use-case.ts:85-103`). Es un defecto real adyacente y **no se corrige en
este change**: el arreglo toca entidad + use case + mapper (tres archivos de código más, en otra
unidad), y ADR-7 ya deja la UI correcta releyendo el listado invalidado. Queda registrado como
comentario de mecanismo en la tarea 3.4 y se propone como change propio.

---

## WU-0 — Cobertura de la edición ya implementada (test-only)

- [x] 0.1 COB [EP-R3/R4/R6] Auditar `backend/src/preventivo/application/use-cases/editar-plan.use-case.spec.ts`
      contra: XOR con ambos objetivos y con ninguno → `ObjetivoInvalidoError`; `intervaloValor: 0`
      → `IntervaloInvalidoError`; plan inexistente o dado de baja → `PlanNoEncontradoError`.
      Listar qué escenario del spec no está cubierto.
- [x] 0.2 COB [EP-R3/R4/R6] Agregar los casos faltantes, cada uno con su hermano invertido
      (una edición válida equivalente que sí persiste) y afirmando que **ningún campo** cambió
      en el caso rechazado.
- [x] 0.3 COB [EP-R5] Par invertido del puntero: editar cadencia mueve `proximaEjecucionEn` a una
      fecha posterior a hoy; editar solo `titulo` **no** toca el puntero.
- [x] 0.4 Cierre: `pnpm vitest run src/preventivo/application/use-cases/editar-plan.use-case.spec.ts`
      + suite backend. Commit `test(preventivo): cubrir los requisitos de edicion ya implementados`.

---

## WU-1 — Swap de permisos a COLABORADOR

- [ ] 1.1 RED [PR-R2] Crear `backend/prisma_master/migrations/<ts>_swap_preventivo_permisos_colaborador/migration.sql`
      **con solo su comentario de cabecera** (SQL vacío), para que el spec de 1.2 falle por la
      aserción y no por archivo ausente.
- [ ] 1.2 RED [PR-R2] Crear `backend/src/auth/infrastructure/persistence/prisma/swap-preventivo-permisos.integration.spec.ts`
      (patrón de `backfill-preventivo-permisos.integration.spec.ts`, con `usarLockMasterTest()`):
      fixture con TECNICO, COLABORADOR activo, COLABORADOR con membresía inactiva, ADMINISTRADOR y
      USUARIO en dos tenants; corre `20260825120100` y después el swap. Aserciones: TECNICO con cero
      celdas `PREVENTIVO`; COLABORADOR activo con las cuatro; ADMINISTRADOR y USUARIO intactos;
      celdas de otros módulos intactas. Verlo fallar.
- [ ] 1.3 RED [PR-R2] Segundo caso en el mismo spec: la segunda corrida no cambia el estado final
      ni duplica filas (idempotencia).
- [ ] 1.4 GREEN [PR-R2] Escribir el SQL (ADR-3): `DELETE` de `modulo='PREVENTIVO'` para membresías
      TECNICO **sin filtrar `activo`**, y después `INSERT ... SELECT` de los cuatro pares para
      membresías COLABORADOR con `activo = true AND deleted_at IS NULL`, `ON CONFLICT DO NOTHING`.
      `JOIN` por `(usuario_id, cliente_id)`. ADMINISTRADOR no aparece en ninguna sentencia.
- [ ] 1.5 RED [PR-R1] En `backend/src/auth/domain/presets-rol.spec.ts`: sacar las cuatro
      `PREVENTIVO:*` de `CELDAS_TECNICO_ESPERADAS` y agregar la aserción espejo para COLABORADOR.
      Verlo fallar.
- [ ] 1.6 GREEN [PR-R1] Mover las cuatro celdas en `backend/src/auth/domain/presets-rol.ts`.
- [ ] 1.7 [PR-R1] Actualizar las tres citas de ADR-PV6 en código para que apunten a
      `openspec/changes/preventivo-edicion-y-permisos/design.md` (ADR-3): `presets-rol.ts`, el header
      de `20260825120100/migration.sql` y `backfill-preventivo-permisos.integration.spec.ts`.
- [ ] 1.8 [PR-R1] **ADR-PV6 no tiene archivo que editar**: superseder la observación de Engram del
      design de `sdd/preventivo` guardando una observación nueva que declare ADR-PV6 revisado por
      ADR-3 de este change, y resolviendo el `judgment_required` con relación `supersedes`.
      No se crea ni se edita ningún `.md` por esta tarea.
- [ ] 1.9 [PR-R3] Ayuda, en el mismo commit: `backend/ayuda/permisos-y-roles.md` deja de afirmar
      "ni siquiera Colaborador" y describe a COLABORADOR como administrador del módulo, TECNICO sin
      acceso y ADMINISTRADOR por bypass; en `backend/ayuda/mantenimiento-preventivo.md`, la sección
      "Quién puede ver y administrar los planes", avisando que un TECNICO que hoy lo usa lo pierde.
- [ ] 1.10 Cierre: correr el spec de integración nuevo + `presets-rol.spec.ts` + suite backend.
      Commit. Archivos de código al revisor: **1**.

---

## WU-2 — Objetivo del plan en la descripción del ticket

- [ ] 2.1 RED [OT-R1/OT-R2] Crear `backend/src/preventivo/domain/services/describir-objetivo.service.ts`
      con la unión `ObjetivoResuelto` y las dos funciones devolviendo valor neutro (`null` /
      `instrucciones ?? ''`), y `describir-objetivo.service.spec.ts` con un caso por cada una de las
      siete ramas más un test que afirme que los siete textos son **mutuamente distintos**. Verlo fallar.
- [ ] 2.2 GREEN [OT-R1/OT-R2] Implementar `describirObjetivo` y `componerDescripcionTicket`:
      `<objetivo>\n\n<instrucciones>`; `SIN_OBJETIVO` devuelve las instrucciones solas, sin línea en
      blanco colgada; `instrucciones = null` tampoco deja línea colgada. Dominio puro: sin imports
      de `equipos/` ni de infraestructura.
- [ ] 2.3 RED [OT-R2] En `generar-preventivos.use-case.spec.ts`, cinco casos con doble de `findById`:
      equipo vigente, `activo = false`, `isDeleted()`, `null` y `mockRejectedValue`. Afirmar sobre el
      `descripcion` del payload de `crearTicketUseCase.execute` y que **se llamó igual** en los cinco.
- [ ] 2.4 RED [OT-R2] Caso de dos planes vencidos, uno con equipo irresoluble y otro con objetivo
      válido: los dos generan su ticket, ninguno bloquea al otro.
- [ ] 2.5 GREEN [OT-R1/OT-R2] `generar-preventivos.use-case.ts`: noveno parámetro
      `Pick<IEquipoInformaticoRepository, 'findById'>`; `try/catch` que mapea entidad → `ObjetivoResuelto`,
      con `logger.error` en `EQUIPO_NO_CONSULTABLE`; `descripcion` compuesta.
- [ ] 2.6 GREEN [OT-R1] `preventivo.module.ts`: `EquiposModule` en `imports` y
      `EQUIPO_INFORMATICO_REPOSITORY` en `inject`, en la posición del noveno parámetro.
- [ ] 2.7 [OT-R1] Ayuda, mismo commit: sección nueva en `mantenimiento-preventivo.md` con qué dice
      el ticket generado y qué se lee cuando el equipo fue dado de baja o eliminado.
- [ ] 2.8 Cierre: `pnpm vitest run` de los dos specs + `src/preventivo/generar-preventivos.integration.spec.ts`;
      suite backend. Commit. Archivos de código al revisor: **3**.

---

## WU-3 — UI de edición de planes

- [ ] 3.1 RED [EP-R1] En `frontend/src/features/preventivo/schemas.test.ts`: `editarPlanPreventivoSchema`
      sin `fechaInicio`, con `activo`, y centinela sobre `TITULO_MAX_LENGTH`, `UBICACION_MAX_LENGTH`
      e `INTERVALO_VALOR_MAXIMO`. Verlo fallar.
- [ ] 3.2 GREEN [EP-R1] `types.ts`: `EditarPlanPreventivoDto` espejo del `EditarPlanPreventivoHttpDto`.
      `schemas.ts`: `editarPlanPreventivoSchema` reusando `camposComunes` menos `fechaInicio`, más `activo`.
- [ ] 3.3 RED [EP-R1] Test de `useEditarPlanPreventivo`: hace `PATCH /preventivo/planes/:id` e invalida
      `["preventivo","planes"]` en `onSuccess`.
- [ ] 3.4 GREEN [EP-R1] `use-planes-preventivo-mutations.ts`: `useEditarPlanPreventivo`, con comentario
      de mecanismo — la fecha autoritativa se relee del listado invalidado porque la respuesta del PATCH
      trae el puntero viejo (ADR-7 y sección "Fuera de alcance").
- [ ] 3.5 RED [EP-R1] Crear el esqueleto de `components/plan-preventivo-edit-dialog.tsx` (solo trigger y
      diálogo vacío) y `plan-preventivo-edit-dialog.test.tsx`: abrir, cerrar, mutar el prop `plan`,
      reabrir → el formulario muestra los valores vigentes, no el snapshot del primer render.
- [ ] 3.6 RED [EP-R3] Pasar de ubicación a equipo manda `ubicacion: null` en el cuerpo, y el inverso
      manda `equipoId: null`. Espiar el `mutate` y afirmar sobre el DTO, nunca sobre la pantalla.
- [ ] 3.7 RED [EP-R1] `fechaInicio` no aparece en el formulario, ni habilitado ni deshabilitado;
      hermano invertido: `titulo` sí aparece. Y `activo` se cambia en el mismo envío, sin segunda llamada.
- [ ] 3.8 RED [EP-R1, ADR-6] Los cinco renglones de ADR-6, con `useEquipo` mockeado: (a) id presente en
      la lista activa → comportamiento normal, sin opción extra; (b) ausente con `useEquipo` 200 → opción
      extra "(dado de baja)" preseleccionada; (c) ausente con `ApiError` 404 → "Equipo eliminado del
      inventario"; (d) ausente con otro error → mensaje "No se pudo verificar el equipo" y select
      deshabilitado; (e) `equiposQuery` en `isLoading`/`isError` → select deshabilitado y **nunca** se
      infiere una baja. La ausencia solo prueba algo cuando la lista ya resolvió.
- [ ] 3.9 RED [EP-R5] Par invertido del aviso de cadencia: aparece al ensuciar `intervaloValor` o
      `intervaloUnidad`, y **no** aparece al tocar solo `titulo`.
- [ ] 3.10 GREEN Implementar `plan-preventivo-edit-dialog.tsx`: `onOpenChange` con `reset(valoresVigentes)`
      + `setObjetivo(...)` recalculados desde el prop en cada apertura (ADR-4);
      `setValue(otroLado, "", { shouldValidate: true, shouldDirty: true })` (ADR-5); submit con el par
      completo y `null` explícito en el lado descartado; opción fuera de catálogo (ADR-6); aviso
      cualitativo de cadencia sin fecha (ADR-7).
- [ ] 3.11 RED [EP-R2] En `plan-preventivo-detail-view.test.tsx`: el disparador del diálogo se ve con
      `PREVENTIVO:MODIFICACION` y no se ve sin él.
- [ ] 3.12 GREEN [EP-R2] `plan-preventivo-detail-view.tsx`: entrada al diálogo bajo
      `<Can permiso="PREVENTIVO:MODIFICACION">`. Entrada **única** desde el detalle; no se agrega en la
      fila de la lista (ADR-6: evitaría un `GET /equipos/:id` por plan).
- [ ] 3.13 [EP-R7] Ayuda, mismo commit: sección "Editar un plan existente" en `mantenimiento-preventivo.md`
      — campos editables, que `activo` se cambia ahí mismo, que `fechaInicio` no se edita, y que cambiar
      la cadencia mueve la próxima ejecución hacia adelante desde hoy sin generar los ciclos anteriores.
- [ ] 3.14 Guard de tamaño: WU-3 cierra con exactamente **5** archivos de código (`types.ts`, `schemas.ts`,
      `use-planes-preventivo-mutations.ts`, `plan-preventivo-edit-dialog.tsx`, `plan-preventivo-detail-view.tsx`).
      Verificar con `git diff --cached --name-only | rg "\.(ts|tsx)$" | rg -v "\.test\."`. Si aparece un
      sexto, partir por este corte ya aprobado: **WU-3a** = 3.1–3.2 (contrato del formulario) ·
      **WU-3b** = 3.3–3.13 (UI), cada uno con sus tests adentro.
- [ ] 3.15 Cierre: `pnpm vitest run src/features/preventivo`; suite frontend + `pnpm type-check` + `pnpm lint`.
      Commit.

---

## Trazabilidad requisito → tarea

| Requisito | Tareas |
|---|---|
| PR-R1 Rol que administra el módulo | 1.5, 1.6, 1.7, 1.8 |
| PR-R2 Migración de permisos ya otorgados | 1.1, 1.2, 1.3, 1.4 |
| PR-R3 Ayuda refleja el rol correcto | 1.9 |
| EP-R1 Campos editables desde un único formulario | 3.1–3.8, 3.10 |
| EP-R2 Solo COLABORADOR y ADMINISTRADOR editan | 1.4, 1.6, 3.11, 3.12 |
| EP-R3 Objetivo excluyente en la edición | 0.1, 0.2, 3.6 |
| EP-R4 Cadencia inválida rechazada | 0.1, 0.2 |
| EP-R5 Cadencia recalcula hacia adelante | 0.3, 3.9 |
| EP-R6 Plan inexistente o dado de baja rechazado | 0.1, 0.2 |
| EP-R7 Ayuda documenta la edición | 3.13 |
| OT-R1 Descripción antepone el objetivo | 2.1, 2.2, 2.5, 2.6, 2.7 |
| OT-R2 Objetivo irresoluble degrada sin fallar | 2.1–2.5 |

Threat Matrix del design: `N/A` — sin filas aplicables, no se derivan tareas de amenaza.
