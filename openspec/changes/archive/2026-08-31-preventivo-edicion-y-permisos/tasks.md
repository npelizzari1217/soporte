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

- [x] 1.1 RED [PR-R2] Crear `backend/prisma_master/migrations/<ts>_swap_preventivo_permisos_colaborador/migration.sql`
      **con solo su comentario de cabecera** (SQL vacío), para que el spec de 1.2 falle por la
      aserción y no por archivo ausente.
- [x] 1.2 RED [PR-R2] Crear `backend/src/auth/infrastructure/persistence/prisma/swap-preventivo-permisos.integration.spec.ts`
      (patrón de `backfill-preventivo-permisos.integration.spec.ts`, con `usarLockMasterTest()`):
      fixture con TECNICO, COLABORADOR activo, COLABORADOR con membresía inactiva, ADMINISTRADOR y
      USUARIO en dos tenants; corre `20260825120100` y después el swap. Aserciones: TECNICO con cero
      celdas `PREVENTIVO`; COLABORADOR activo con las cuatro; ADMINISTRADOR y USUARIO intactos;
      celdas de otros módulos intactas. Verlo fallar.
- [x] 1.3 RED [PR-R2] Segundo caso en el mismo spec: la segunda corrida no cambia el estado final
      ni duplica filas (idempotencia).
- [x] 1.4 GREEN [PR-R2] Escribir el SQL (ADR-3): `DELETE` de `modulo='PREVENTIVO'` para membresías
      TECNICO **sin filtrar `activo`**, y después `INSERT ... SELECT` de los cuatro pares para
      membresías COLABORADOR con `activo = true AND deleted_at IS NULL`, `ON CONFLICT DO NOTHING`.
      `JOIN` por `(usuario_id, cliente_id)`. ADMINISTRADOR no aparece en ninguna sentencia.
- [x] 1.5 RED [PR-R1] En `backend/src/auth/domain/presets-rol.spec.ts`: sacar las cuatro
      `PREVENTIVO:*` de `CELDAS_TECNICO_ESPERADAS` y agregar la aserción espejo para COLABORADOR.
      Verlo fallar.
- [x] 1.6 GREEN [PR-R1] Mover las cuatro celdas en `backend/src/auth/domain/presets-rol.ts`.
- [x] 1.7 [PR-R1] Actualizar las citas de ADR-PV6 en código para que apunten a
      `openspec/changes/preventivo-edicion-y-permisos/design.md` (ADR-3): `presets-rol.ts` y
      `backfill-preventivo-permisos.integration.spec.ts` quedaron actualizados.
      **2 de 3 — no se tocó la tercera, adrede.** El header de
      `20260825120100_backfill_preventivo_permisos/migration.sql` sigue citando ADR-PV6 y
      "SOLO TECNICO": esa migración **ya está aplicada** (`_prisma_migrations`, checksum
      `213f8985c78faa0d634435b5e4150070160cbdc88a1686984aec99f31ed772bc`, 2026-08-24) y editar
      su comentario cambia el checksum de Prisma y rompe `migrate deploy`. Ninguna migración
      aplicada se edita, ni en sus comentarios.

      **Tampoco se corrige desde la migración del swap.** Se evaluó agregar el párrafo
      aclaratorio al header de `20260831120000_swap_preventivo_permisos_colaborador`, que en
      las bases locales figura sin aplicar. Se descartó: ese archivo entró a `main` en el
      commit `4bc5d60` y viajó en el PR #84 (merge `4976a15`), así que **producción pudo
      haberla corrido ya**. Que una migración esté sin aplicar en la base de desarrollo no
      dice nada de producción, y el costo del error es asimétrico: romper `migrate deploy`
      allá contra ganar un comentario más prolijo.

      **Dónde queda la corrección, entonces:** en `backend/ayuda/permisos-y-roles.md`
      (tarea 1.9), que ya documenta la matriz vigente — Colaborador administra el módulo,
      Técnico no lo lleva — y en el ADR-3 de `design.md`. El comentario desactualizado de
      `20260825120100` queda como registro histórico de lo que era cierto cuando esa
      migración corrió.

      **Regla general que deja este hallazgo:** una migración es historia, no documentación
      viva. No se la corrige: se corrige la doc que la gente lee. Y "sin aplicar localmente"
      NO es sinónimo de "editable" — lo editable es lo que todavía no salió del repo.
- [x] 1.8 [PR-R1] **ADR-PV6 no tiene archivo que editar**: superseder la observación de Engram del
      design de `sdd/preventivo` guardando una observación nueva que declare ADR-PV6 revisado por
      ADR-3 de este change, y resolviendo el `judgment_required` con relación `supersedes`.
      No se crea ni se edita ningún `.md` por esta tarea.
      **DELEGADA AL ORQUESTADOR**: el executor de `sdd-apply` no tiene expuestas las herramientas
      MCP de Engram en esta sesión (confirmado en las cuatro fases previas del ciclo).
- [x] 1.9 [PR-R3] Ayuda, en el mismo commit: `backend/ayuda/permisos-y-roles.md` deja de afirmar
      "ni siquiera Colaborador" y describe a COLABORADOR como administrador del módulo, TECNICO sin
      acceso y ADMINISTRADOR por bypass; en `backend/ayuda/mantenimiento-preventivo.md`, la sección
      "Quién puede ver y administrar los planes", avisando que un TECNICO que hoy lo usa lo pierde.
- [x] 1.10 Cierre: correr el spec de integración nuevo + `presets-rol.spec.ts` + suite backend.
      Commit. Archivos de código al revisor: **1**.
      Ejecutado: suite completa backend 349/349 archivos, 3736/3736 tests, `pnpm typecheck` y
      `pnpm lint` en verde. Commit pendiente del orquestador (no lo hace este executor).

---

## WU-2 — Objetivo del plan en la descripción del ticket

- [x] 2.1 RED [OT-R1/OT-R2] Crear `backend/src/preventivo/domain/services/describir-objetivo.service.ts`
      con la unión `ObjetivoResuelto` y las dos funciones devolviendo valor neutro (`null` /
      `instrucciones ?? ''`), y `describir-objetivo.service.spec.ts` con un caso por cada una de las
      siete ramas más un test que afirme que los siete textos son **mutuamente distintos**. Verlo fallar.
- [x] 2.2 GREEN [OT-R1/OT-R2] Implementar `describirObjetivo` y `componerDescripcionTicket`:
      `<objetivo>\n\n<instrucciones>`; `SIN_OBJETIVO` devuelve las instrucciones solas, sin línea en
      blanco colgada; `instrucciones = null` tampoco deja línea colgada. Dominio puro: sin imports
      de `equipos/` ni de infraestructura.
- [x] 2.3 RED [OT-R2] En `generar-preventivos.use-case.spec.ts`, cinco casos con doble de `findById`:
      equipo vigente, `activo = false`, `isDeleted()`, `null` y `mockRejectedValue`. Afirmar sobre el
      `descripcion` del payload de `crearTicketUseCase.execute` y que **se llamó igual** en los cinco.
- [x] 2.4 RED [OT-R2] Caso de dos planes vencidos, uno con equipo irresoluble y otro con objetivo
      válido: los dos generan su ticket, ninguno bloquea al otro.
- [x] 2.5 GREEN [OT-R1/OT-R2] `generar-preventivos.use-case.ts`: noveno parámetro
      `Pick<IEquipoInformaticoRepository, 'findById'>`; `try/catch` que mapea entidad → `ObjetivoResuelto`,
      con `logger.error` en `EQUIPO_NO_CONSULTABLE`; `descripcion` compuesta.
- [x] 2.6 GREEN [OT-R1] `preventivo.module.ts`: `EquiposModule` en `imports` y
      `EQUIPO_INFORMATICO_REPOSITORY` en `inject`, en la posición del noveno parámetro.
- [x] 2.7 [OT-R1] Ayuda, mismo commit: sección nueva en `mantenimiento-preventivo.md` con qué dice
      el ticket generado y qué se lee cuando el equipo fue dado de baja o eliminado.
- [x] 2.8 Cierre: `pnpm vitest run` de los dos specs + `src/preventivo/generar-preventivos.integration.spec.ts`;
      suite backend. Commit. Archivos de código al revisor: **3**.
      Ejecutado: suite completa backend 350/350 archivos, 3753/3753 tests, `pnpm typecheck` y
      `pnpm lint` en verde. Commit pendiente del orquestador (no lo hace este executor).

---

## WU-3 — UI de edición de planes

- [x] 3.1 RED [EP-R1] En `frontend/src/features/preventivo/schemas.test.ts`: `editarPlanPreventivoSchema`
      sin `fechaInicio`, con `activo`, y centinela sobre `TITULO_MAX_LENGTH`, `UBICACION_MAX_LENGTH`
      e `INTERVALO_VALOR_MAXIMO`. Verlo fallar.
- [x] 3.2 GREEN [EP-R1] `types.ts`: `EditarPlanPreventivoDto` espejo del `EditarPlanPreventivoHttpDto`.
      `schemas.ts`: `editarPlanPreventivoSchema` reusando `camposComunes` menos `fechaInicio`, más `activo`.
- [x] 3.3 RED [EP-R1] Test de `useEditarPlanPreventivo`: hace `PATCH /preventivo/planes/:id` e invalida
      `["preventivo","planes"]` en `onSuccess`.
- [x] 3.4 GREEN [EP-R1] `use-planes-preventivo-mutations.ts`: `useEditarPlanPreventivo`, con comentario
      de mecanismo — la fecha autoritativa se relee del listado invalidado porque la respuesta del PATCH
      trae el puntero viejo (ADR-7 y sección "Fuera de alcance").
- [x] 3.5 RED [EP-R1] Crear el esqueleto de `components/plan-preventivo-edit-dialog.tsx` (solo trigger y
      diálogo vacío) y `plan-preventivo-edit-dialog.test.tsx`: abrir, cerrar, mutar el prop `plan`,
      reabrir → el formulario muestra los valores vigentes, no el snapshot del primer render.
- [x] 3.6 RED [EP-R3] Pasar de ubicación a equipo manda `ubicacion: null` en el cuerpo, y el inverso
      manda `equipoId: null`. Espiar el `mutate` y afirmar sobre el DTO, nunca sobre la pantalla.
- [x] 3.7 RED [EP-R1] `fechaInicio` no aparece en el formulario, ni habilitado ni deshabilitado;
      hermano invertido: `titulo` sí aparece. Y `activo` se cambia en el mismo envío, sin segunda llamada.
- [x] 3.8 RED [EP-R1, ADR-6] Los cinco renglones de ADR-6, con `useEquipo` mockeado: (a) id presente en
      la lista activa → comportamiento normal, sin opción extra; (b) ausente con `useEquipo` 200 → opción
      extra "(dado de baja)" preseleccionada; (c) ausente con `ApiError` 404 → "Equipo eliminado del
      inventario"; (d) ausente con otro error → mensaje "No se pudo verificar el equipo" y select
      deshabilitado; (e) `equiposQuery` en `isLoading`/`isError` → select deshabilitado y **nunca** se
      infiere una baja. La ausencia solo prueba algo cuando la lista ya resolvió.
- [x] 3.9 RED [EP-R5] Par invertido del aviso de cadencia: aparece al ensuciar `intervaloValor` o
      `intervaloUnidad`, y **no** aparece al tocar solo `titulo`.
- [x] 3.10 GREEN Implementar `plan-preventivo-edit-dialog.tsx`: `onOpenChange` con `reset(valoresVigentes)`
      + `setObjetivo(...)` recalculados desde el prop en cada apertura (ADR-4);
      `setValue(otroLado, "", { shouldValidate: true, shouldDirty: true })` (ADR-5); submit con el par
      completo y `null` explícito en el lado descartado; opción fuera de catálogo (ADR-6); aviso
      cualitativo de cadencia sin fecha (ADR-7).
- [x] 3.11 RED [EP-R2] En `plan-preventivo-detail-view.test.tsx`: el disparador del diálogo se ve con
      `PREVENTIVO:MODIFICACION` y no se ve sin él.
- [x] 3.12 GREEN [EP-R2] `plan-preventivo-detail-view.tsx`: entrada al diálogo bajo
      `<Can permiso="PREVENTIVO:MODIFICACION">`. Entrada **única** desde el detalle; no se agrega en la
      fila de la lista (ADR-6: evitaría un `GET /equipos/:id` por plan).
- [x] 3.13 [EP-R7] Ayuda, mismo commit: sección "Editar un plan existente" en `mantenimiento-preventivo.md`
      — campos editables, que `activo` se cambia ahí mismo, que `fechaInicio` no se edita, y que cambiar
      la cadencia mueve la próxima ejecución hacia adelante desde hoy sin generar los ciclos anteriores.
- [x] 3.14 Guard de tamaño: WU-3 cierra con exactamente **5** archivos de código (`types.ts`, `schemas.ts`,
      `use-planes-preventivo-mutations.ts`, `plan-preventivo-edit-dialog.tsx`, `plan-preventivo-detail-view.tsx`).
      Verificar con `git diff --cached --name-only | rg "\.(ts|tsx)$" | rg -v "\.test\."`. Si aparece un
      sexto, partir por este corte ya aprobado: **WU-3a** = 3.1–3.2 (contrato del formulario) ·
      **WU-3b** = 3.3–3.13 (UI), cada uno con sus tests adentro.
      Ejecutado: exactamente 5 archivos de código (`types.ts`, `schemas.ts`,
      `use-planes-preventivo-mutations.ts`, `plan-preventivo-edit-dialog.tsx`,
      `plan-preventivo-detail-view.tsx`) — sin necesidad de partir en WU-3a/WU-3b.
- [x] 3.15 Cierre: `pnpm vitest run src/features/preventivo`; suite frontend + `pnpm type-check` + `pnpm lint`.
      Commit.
      Ejecutado: focalizado 7 archivos/51 tests en verde; suite frontend completa 162/162 archivos,
      1063/1063 tests; `pnpm type-check` y `pnpm lint` en verde (exit 0). Commit pendiente del
      orquestador (no lo hace este executor).

---

## WU-5 — Cierre de hallazgos W1/W2 del verify (test-only)

Unidad agregada tras el verify de `9579583` (`verify-report.md`), fuera del alcance
original de WU-0..WU-3. Cierra los dos hallazgos WARNING que quedaron sin cobertura —
C1 y W3/S1-S4 quedan explícitamente fuera de esta unidad.

- [x] 5.1 [PR-R2, W1] `swap-preventivo-permisos.integration.spec.ts`: agregar el fixture
      que faltaba del lado del DELETE — un TECNICO con membresía `activo: false` que YA
      tiene las cuatro celdas `PREVENTIVO:*` (otorgadas cuando la membresía era activa,
      insertadas directo porque el backfill de la corrida no se las va a dar de nuevo) — y
      su aserción hermana: pierde las cuatro igual que el TECNICO activo. Corregido también
      el comentario de cabecera (líneas 10-11), que afirmaba una cobertura que no existía.
      Mutación de verificación: `AND m.activo = true` en el `DELETE` del
      `20260831120000_swap_preventivo_permisos_colaborador/migration.sql` (restaurado
      byte-idéntico después) → 2/8 rojo por la aserción
      (`expected [...4 celdas...] to deeply equal []`). Sin la mutación: 8/8 verde.
- [x] 5.2 [OT-R1, W2] Nuevo spec `generar-preventivos-wiring.integration.spec.ts`: resuelve
      `GenerarPreventivosUseCase` DESDE EL CONTENEDOR DE NEST (`SharedModule` + `AuthModule`
      + `PreventivoModule`, mismo harness que `test/preventivo.e2e.spec.ts`), con un plan
      `equipoId` real, y afirma que el ticket generado trae `Equipo: <nombre>` — nunca
      `EQUIPO_NO_CONSULTABLE`. DB tenant efímera propia (no comparte la del e2e existente,
      para no reprocesar planes vencidos ajenos). Mutación de verificación: sacar
      `EQUIPO_INFORMATICO_REPOSITORY` del `inject` de `preventivo.module.ts` (restaurado
      byte-idéntico después) → 1/2 rojo por la aserción (`expected 'Equipo: no se pudo
      consultar (id …)' to be 'Equipo: Notebook Dell 5420 (WU-5 DI)'`). Sin la mutación:
      2/2 verde.
- [x] 5.3 Cierre: suite backend completa 351/351 archivos, 3761/3761 tests (canario:
      350/3758 — sube por los 3 tests nuevos); suite frontend sin cambios, 163/163,
      1092/1092. `pnpm typecheck` y `pnpm lint` (back) en verde; `pnpm lint` del back
      necesitó un fix de formato (prettier) en el spec nuevo, ya aplicado. Sin cambios de
      producción: los dos archivos tocados son de test.

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
