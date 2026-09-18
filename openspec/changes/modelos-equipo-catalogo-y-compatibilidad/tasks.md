# Tasks: ABM del catálogo `ModeloEquipo` y su selector en equipos

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1000–1050 (refina hacia arriba la estimación de ~700–750 del proposal/design: medida archivo por archivo contra los moldes reales del repo — `unidad-medida-form-dialog.tsx` 102 líneas, `unidad-medida-list.tsx` 96, `unidades-medida-admin-view.tsx` 39, `use-unidad-medida-mutations.ts` 57 — más los diffs de los dos diálogos de equipo, que son más grandes que un `≈15 líneas` porque cada uno suma `<select>` + enclavamiento + payload + su test) |
| 400-line budget risk | High para un PR único; el corte en 3 deja 2 unidades bajo presupuesto y 1 (WU-2, la pantalla ABM) ~10% por encima |
| Chained PRs recommended | Yes |
| Suggested split | 3 PRs encadenados: WU-1 (capa de datos) → WU-2 ∥ WU-3 (pueden ir en paralelo o en cualquier orden entre sí, ver "Orden y paralelismo") |
| Delivery strategy | ask-on-risk |
| Chain strategy | Propuesta: Stacked PRs a `main`, secuencial WU-1 primero; WU-2 y WU-3 pueden ratear contra `main` una vez WU-1 mergeado, en cualquier orden. Decisión final del dueño, no de esta fase. |

Decision needed before apply: Yes — dos preguntas concretas para el dueño antes de `sdd-apply`:

1. **WU-2 (~430–460 líneas) queda ~10% arriba del presupuesto de 400.** Es una sola pantalla cohesiva (diálogo + lista + gate + nav), difícil de partir sin fragmentar artificialmente un ABM que ya converge con el molde de unidades de medida. Opciones: (a) aceptarla con `size:exception` documentado en el PR; (b) partirla en WU-2a (`modelo-equipo-form-dialog.tsx` + su test, ~205 líneas) y WU-2b (`modelo-equipo-list.tsx` + `modelos-equipo-admin-view.tsx` + su test + `page.tsx` + `admin-nav.tsx`, ~235 líneas), agregando un cuarto PR.
2. **¿El orden de PRs es Stacked (cada uno contra `main` tras mergear el anterior) o Feature Branch Chain con tracker?** Como WU-2 y WU-3 no dependen entre sí (ambos dependen solo de WU-1), Stacked alcanza sin necesidad de un tracker — pero es una decisión de flujo de trabajo del dueño, no algo que esta fase deba fijar.

Chained PRs recommended: Yes
400-line budget risk: High (PR único) / Medium (WU-2 encadenada)

### Estimación de líneas por unidad

| Unidad | Archivos | Líneas est. | ¿Bajo 400? |
|---|---|---|---|
| WU-1 — capa de datos del catálogo | `types.ts` (~45), `schemas.ts` (~75), `schemas.test.ts` (~65), `use-modelos-equipo.ts` (~30), `use-modelo-equipo-mutations.ts` (~65) | ~280 | Sí |
| WU-2 — pantalla ABM y navegación | `modelo-equipo-form-dialog.tsx` (~110), `modelo-equipo-form-dialog.test.tsx` (~95), `modelo-equipo-list.tsx` (~90), `modelos-equipo-admin-view.tsx` (~38), `modelos-equipo-admin-view.test.tsx` (~90), `page.tsx` (~12), `admin-nav.tsx` diff (~2), `admin-nav.test.tsx` diff (~4) | ~440 | No (~10% sobre presupuesto) |
| WU-3 — selector, enclavamiento y display en equipos | `equipos/types.ts` diff (~4), `equipos/schemas.ts` diff (~12), `equipo-create-dialog.tsx` diff (~45), `equipo-create-dialog.test.tsx` diff (~70), `equipo-edit-dialog.tsx` diff (~50), `equipo-edit-dialog.test.tsx` diff (~70), `equipos-list-view.tsx` diff (~20), `equipos-list-view.test.tsx` diff (~50) | ~320 | Sí |

## Convenciones

`strict_tdd: false` para esta feature (no es corrección de defecto): NO hay pasos RED/GREEN
separados. Cada tarea de código incluye su test en el mismo commit, y el test puede
escribirse antes o después de la implementación — lo único obligatorio es que viajen
juntos.

## Orden y paralelismo

**WU-1 es prerrequisito de WU-2 y de WU-3**: los dos necesitan `useModelosEquipo()` y el
tipo `ModeloEquipo`. **WU-2 y WU-3 NO dependen entre sí** — WU-2 monta la pantalla de
administración; WU-3 consume el mismo `GET /modelos-equipo` desde los diálogos de equipo
sin necesitar que la pantalla de administración exista (el selector funciona igual con el
catálogo vacío, mostrando la nota "No hay modelos de equipo cargados"). Pueden
implementarse y revisarse en paralelo, o en cualquier orden secuencial, una vez cerrado
WU-1.

No se agrega un test de integración cruzada "un modelo creado en Admin > Modelos de
equipo aparece en el selector del alta de equipo" (el gemelo del issue #156 para unidades
de medida): agregarlo acoplaría WU-2 y WU-3 con una dependencia de test que ningún
requisito de la spec exige — R2 (listar/crear) y R4 (elegir modelo persiste) ya quedan
cada uno cubierto por su propio mock de `GET /modelos-equipo` en su propia unidad. Queda
anotado como mejora posible, no como tarea de este ciclo.

---

## WU-1 — commit 1: `feat(modelos-equipo): capa de datos del catálogo (types, schemas, hooks)`

- [x] 1.1 [R2] `frontend/src/features/modelos-equipo/types.ts`: crear — espejo de
      `ModeloEquipoResponseDto` (`backend/src/insumos/interface/dtos/modelos-equipo.dto.ts:100-107`)
      con `CreateModeloEquipoDto`/`EditModeloEquipoDto` (PATCH parcial, molde de `:77-91`) y
      `CambiarEstadoActivoModeloEquipoDto` (molde de `:94-97`). Molde de estructura general:
      `frontend/src/features/insumos/types.ts:15-37`. Sin `codigo`: la identidad es el par
      `marca`+`modelo` (`backend/src/insumos/domain/entities/modelo-equipo.entity.ts:10-14`).
- [x] 1.2 [R2,R3] `frontend/src/features/modelos-equipo/schemas.ts`: crear —
      `normalizarMarca`/`normalizarModelo`, espejo de `normalizarMarcaModeloEquipo`/
      `normalizarModeloModeloEquipo` (`backend/src/insumos/domain/entities/modelo-equipo.entity.ts:46-48,67-69`);
      `modeloEquipoSchema` con `MODELO_EQUIPO_MARCA_MAX_LENGTH = 100` medido sobre el valor
      normalizado vía `.refine()` — molde exacto de `normalizarUbicacion`/`.refine()` en
      `frontend/src/features/equipos/schemas.ts:75-77,149-155` (`toUpperCase()` puede
      agrandar el string) — y `MODELO_EQUIPO_MODELO_MAX_LENGTH = 150` con `.trim().max()`
      directo (`trim()` nunca agranda). Sin `@Matches` de código (ADR-1: `marca` es texto
      libre con espacios internos).
- [x] 1.3 [R2,R3] `frontend/src/features/modelos-equipo/schemas.test.ts`: crear — molde de
      `frontend/src/features/equipos/schemas.test.ts:34-40` (`it.each` de topes) adaptado a
      `marca`/`modelo`; caso "una marca que crece al pasar a mayúscula se rechaza en el form,
      no en el 400 remoto" (mismo criterio que el caso `ubicacion` de equipos); `modelo`
      preserva su capitalización tal como se tipeó (sin `.toUpperCase()`).
- [x] 1.4 [R2] `frontend/src/features/modelos-equipo/hooks/use-modelos-equipo.ts`: crear —
      `GET /modelos-equipo`, `queryKey: ["modelos-equipo"]` (ADR-5, SIN segmento de tenant:
      la invalidación de caché al cambiar de inquilino es global, `tenant-switcher.tsx:62`),
      molde exacto de `frontend/src/features/insumos/hooks/use-unidades-medida.ts`. Sin gate
      de permiso: la lectura es abierta a cualquier autenticado — la consume también el
      selector de equipos en WU-3.
- [x] 1.5 [R2,R3] `frontend/src/features/modelos-equipo/hooks/use-modelo-equipo-mutations.ts`:
      crear — `useCrearModeloEquipo`/`useEditarModeloEquipo`/
      `useCambiarEstadoActivoModeloEquipo`, molde exacto de
      `frontend/src/features/insumos/hooks/use-unidad-medida-mutations.ts` (invalidación de
      `["modelos-equipo"]` + toasts en las tres). El 422 de par duplicado (R3) no se
      intercepta acá: llega como error genérico y lo maneja `notifyError` en el diálogo de
      WU-2.
- [x] 1.6 Cierre WU-1: `pnpm vitest run src/features/modelos-equipo/schemas.test.ts` +
      `pnpm lint` + `pnpm type-check` en verde. Commit.

---

## WU-2 — commit 2: `feat(modelos-equipo): pantalla ABM y navegación`

- [x] 2.1 [R2,R3] `frontend/src/features/modelos-equipo/components/modelo-equipo-form-dialog.tsx`:
      crear — molde exacto de
      `frontend/src/features/insumos/components/unidad-medida-form-dialog.tsx`, dos campos
      (`marca`, `modelo`, sin `codigo`), `valoresVigentes` recalculado en CADA render +
      `reset(valoresVigentes)` al abrir (`unidad-medida-form-dialog.tsx:33-35,58-61`);
      `submit()` normaliza con `normalizarMarca`/`normalizarModelo` de WU-1 antes de enviar
      (mismo criterio que `normalizarUbicacion` en `equipo-create-dialog.tsx:81`); el 422 de
      par duplicado llega como `notifyError` genérico (ADR-1: no hay campo `codigo` que
      resaltar en el mensaje, a diferencia de `FamiliaInsumoCodigoDuplicadoError`).
- [x] 2.2 [R2,R3] `frontend/src/features/modelos-equipo/components/modelo-equipo-form-dialog.test.tsx`:
      crear — molde de
      `frontend/src/features/insumos/components/unidad-medida-form-dialog.test.tsx`; alta
      normaliza `marca` a mayúscula y preserva la capitalización de `modelo`; edición
      prefilla desde la fila y el PATCH lleva el formulario completo; alta duplicada devuelve
      422 (mock `HttpResponse.json({ message: ... }, { status: 422 })`) y el formulario NO se
      cierra.
- [x] 2.3 [R2] `frontend/src/features/modelos-equipo/components/modelo-equipo-list.tsx`:
      crear — molde exacto de
      `frontend/src/features/insumos/components/unidad-medida-list.tsx`, columnas
      `Marca`/`Modelo`/`Estado`/`Acciones`, `EstadoActivoAction` tras `ConfirmDialog`
      (`unidad-medida-list.tsx:22-39`). Sin test propio: el molde tampoco lo tiene — se cubre
      integrado desde `modelos-equipo-admin-view.test.tsx` (2.5), mismo criterio que
      `unidad-medida-list.tsx` se cubre desde `unidades-medida-admin-view.test.tsx`.
- [x] 2.4 [R1] `frontend/src/features/modelos-equipo/components/modelos-equipo-admin-view.tsx`:
      crear — molde exacto de
      `frontend/src/features/insumos/components/unidades-medida-admin-view.tsx` (39 líneas):
      `AdminNav` + `SoloAdminCliente` (fallback `ErrorState`) + `PageHeader` +
      `ModeloEquipoList`.
- [x] 2.5 [R1,R2] `frontend/src/features/modelos-equipo/components/modelos-equipo-admin-view.test.tsx`:
      crear — molde del gate `it.each` de
      `frontend/src/features/insumos/components/unidades-medida-admin-view.test.tsx:37-49`
      (`ADMINISTRADOR` ve el contenido, `TECNICO` ve el `ErrorState`, sin ver el listado);
      más el flujo de listar + desactivar/activar un modelo (molde de `:51-70`).
- [x] 2.6 [R1] `frontend/src/app/(dashboard)/admin/modelos-equipo/page.tsx`: crear — Server
      Component fino, molde exacto de `frontend/src/app/(dashboard)/admin/unidades/page.tsx`.
- [x] 2.7 [R1] `frontend/src/components/shell/admin-nav.tsx`: modificar — agregar
      `{ href: "/admin/modelos-equipo", label: "Modelos de equipo" }` a `ADMIN_NAV_ITEMS`
      (`:38-53`), después de la entrada "Unidades" (`:48`), mismo gate `esAdminCliente`
      (`:56-58`), sin permiso nuevo en la matriz `MODULO:ACCION`. Actualizar
      `frontend/src/components/shell/admin-nav.test.tsx:38-53` ("ADMINISTRADOR ve las 5
      secciones" → 6, agregar el `expect(screen.getByRole("link", { name: "Modelos de
      equipo" })).toBeInTheDocument()`).
- [x] 2.8 Cierre WU-2: `pnpm vitest run src/features/modelos-equipo/components
      src/components/shell/admin-nav.test.tsx` + `pnpm lint` + `pnpm type-check` en verde.
      Commit.

---

## WU-3 — commit 3: `feat(equipos): selector de modelo de catálogo con enclavamiento y display`

- [ ] 3.1 [R4] `frontend/src/features/equipos/types.ts`: modificar — agregar
      `modeloEquipoId: string | null` a `Equipo` (`:24-44`), `modeloEquipoId?: string | null`
      a `CreateEquipoDto` (`:84-96`) y a `EditarEquipoDto` (`:98-110`); espejo de
      `EquipoResponseDto.modeloEquipoId` (`backend/src/equipos/interface/dtos/equipos.dto.ts:362`)
      y de los DTOs de request (`:109,186`).
- [ ] 3.2 [R4] `frontend/src/features/equipos/schemas.ts`: modificar — agregar
      `modeloEquipoId: z.string().uuid().optional().or(z.literal(""))` a `crearEquipoSchema`
      (molde exacto de `equipoId` en `crearTicketSoporteSchema:267`: admite vacío para que un
      equipo sin modelo de catálogo siga siendo válido, R4 "el selector DEBE admitir vacío").
- [ ] 3.3 [R4,R5] `frontend/src/features/equipos/components/equipo-create-dialog.tsx`:
      modificar — importar `useModelosEquipo` (WU-1) y `resolverLista`
      (`@/features/insumos/lib/resolucion-de-catalogo`); `<select>` de modelo con los cuatro
      estados `CARGANDO`/`NO_DISPONIBLE`/`VACIA`/`CON_ENTRADAS` (`estado === "CON_ENTRADAS"`,
      NO `!== "CARGANDO"`, ADR-6) y nota propia bajo cada uno (molde de
      `insumo-form-dialog.tsx:222-250`), agregado junto a los `<Input>` de `marca` (`:138-147`)
      y `modelo` (`:148-158`), que siguen existiendo; enclavamiento por `onChange` del
      `register("modeloEquipoId")` (ADR-4: `setValue("marca","")`/`setValue("modelo","")`
      SOLO cuando se elige un valor no vacío, nunca al quitarlo) y `disabled={conModeloDeCatalogo}`
      en los `<Input>` de `marca` (`:141`) y `modelo` (`:152`); `submit()` (`:73-95`) agrega
      `modeloEquipoId: values.modeloEquipoId || undefined` (vacío es AUSENCIA en alta, mismo
      criterio que el resto de los campos opcionales de este `submit`).
- [ ] 3.4 [R4,R5] `frontend/src/features/equipos/components/equipo-create-dialog.test.tsx`:
      modificar — el par de aserciones gemelas de ADR-4: elegir un modelo ⇒ `marca`/`modelo`
      quedan deshabilitados Y vacíos, y el POST capturado NO los trae; quitar el modelo ⇒
      vuelven habilitados y el POST trae lo tipeado; catálogo que resuelve DESPUÉS de abrir el
      diálogo ⇒ el `<select>` no cae al placeholder y reaplica el valor (molde del
      `useEffect` de `insumo-form-dialog.tsx:138-148`); `VACIA` y `NO_DISPONIBLE` muestran
      notas distintas bajo el campo.
- [ ] 3.5 [R4,R5] `frontend/src/features/equipos/components/equipo-edit-dialog.tsx`:
      modificar — mismo `<select>` + enclavamiento que 3.3, sobre los `<Input>` de `marca`
      (`:188`) y `modelo` (`:199`); `equipoAFormValues()` (`:59-74`) suma
      `modeloEquipoId: equipo.modeloEquipoId ?? ""`; `submit()` (`:128-147`) agrega
      `modeloEquipoId: values.modeloEquipoId || null` (PATCH: vacío es LIMPIAR, no AUSENCIA)
      y, cuando hay un modelo de catálogo elegido, manda `marca: null, modelo: null` — el
      PATCH limpia el texto libre que hubiera quedado guardado (ADR-4, tabla "Qué se envía en
      cada estado").
- [ ] 3.6 [R4,R5] `frontend/src/features/equipos/components/equipo-edit-dialog.test.tsx`:
      modificar — el escenario de EDICIÓN explícito de ADR-4: un equipo con `marca`/`modelo`
      de texto libre guardados al que el usuario le elige un modelo de catálogo ⇒ los campos
      se vacían A LA VISTA, antes de "Guardar" (no en silencio al enviar), y el PATCH
      capturado manda `marca: null, modelo: null, modeloEquipoId: <uuid>`; quitar el modelo
      rehabilita los campos SIN restituir el texto (quedan vacíos, hay que retipear).
- [ ] 3.7 [R4] `frontend/src/features/equipos/components/equipos-list-view.tsx`: modificar —
      celda `Marca` (`:43`, hoy `render: (row) => row.marca ?? "—"`) resuelta contra
      `useModelosEquipo()` con `resolverDeCatalogo` (`@/features/insumos/lib/resolucion-de-catalogo`)
      cuando `row.modeloEquipoId` existe (ADR-2, ADR-3): `ENCONTRADA` → `"{marca} {modelo}"`;
      `CARGANDO`/`NO_DISPONIBLE`/`FUERA_DE_CATALOGO` con las etiquetas ya exportadas por
      `frontend/src/features/insumos/lib/nombre-de-catalogo.ts:34,41,49`
      (`ETIQUETA_CATALOGO_CARGANDO`, `ETIQUETA_CATALOGO_NO_DISPONIBLE`,
      `ETIQUETA_FUERA_DE_CATALOGO`); sin `modeloEquipoId`, sigue mostrando `row.marca ?? "—"`
      (camino de hoy, sin cambios).
- [ ] 3.8 [R4] `frontend/src/features/equipos/components/equipos-list-view.test.tsx`:
      modificar — los cuatro desenlaces de la celda `Marca` para un equipo CON
      `modeloEquipoId` (encontrado/cargando/no disponible/fuera de catálogo), más el quinto
      camino: un equipo SIN `modeloEquipoId` sigue mostrando su `marca` de texto libre sin
      tocar `useModelosEquipo()`.
- [ ] 3.9 Cierre WU-3 y del ciclo: anotar la deuda de Ayuda en el mensaje del commit y en el
      cuerpo del PR (pausa vigente desde 2026-09-07 — `backend/ayuda/*.md` sin cambios, este
      ciclo agrega una pantalla de administración y altera el formulario de equipo);
      `pnpm vitest run src/features/equipos` + `pnpm lint` + `pnpm type-check` en verde;
      correr la suite `pnpm test` COMPLETA de frontend antes de `sdd-verify` (el backend no
      cambia, no es compuerta de este ciclo pero sí de la verificación final). Commit.

---

## Fuera de alcance (heredado del proposal y del design, no se re-abre)

Gestión de compatibilidad insumo↔modelo (en los dos sentidos); endpoints nuevos —
`GET /insumos/:id` incluido; ficha de detalle del modelo; exportación CSV del catálogo;
`equipo-detail-view.tsx` (ADR-2, cerrado: nunca mostró `marca`/`modelo`, sigue sin
mostrarlos); corrección de `exportar-equipos.use-case.ts:77` (exporta `Marca` vacía para un
equipo con modelo de catálogo — consecuencia registrada, es trabajo de backend); mudanza de
`resolucion-de-catalogo.ts` a `shared/` (ADR-3); test de integración cruzada Admin↔selector
(ver "Orden y paralelismo"); artículos de Ayuda (pausa vigente, la deuda se anota en
commit/PR); investigación externa.

## Trazabilidad requisito → tarea

| Requisito (spec) | Tareas |
|---|---|
| R1 El ABM se gatea por rol, no por permiso de módulo | 2.4, 2.5, 2.6, 2.7 |
| R2 El catálogo permite listar, crear, editar y activar/desactivar | 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.5 |
| R3 El par marca/modelo duplicado se rechaza (activo o inactivo) | 1.2, 1.3, 1.5, 2.1, 2.2 |
| R4 El alta y la edición de un equipo permiten elegir un modelo | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8 |
| R5 Elegir un modelo deshabilita y vacía marca/modelo de texto libre | 3.3, 3.4, 3.5, 3.6 |

Threat Matrix del design: N/A — sin filas aplicables, no se derivan tareas de amenaza.
