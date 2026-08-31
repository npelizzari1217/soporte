# Verify Report: `preventivo-edicion-y-permisos`

Fecha: 2026-08-31 · Rama `main`, HEAD `9579583` (todo el change ya mergeado).
Método: **adversarial por mutación**, no checklist. 23 mutaciones en backend y 22 en
frontend, cada una aplicada sobre código de producción, corrida contra los specs
focalizados y revertida con verificación por `git diff`.

## 1. Veredicto

**PASA CON HALLAZGOS** — 1 CRITICAL, 3 WARNING, 4 SUGGESTION.

Las tres capacidades están implementadas y el grueso de los requisitos muere bajo
mutación por la aserción correcta. Lo que no está cubierto es un escenario del spec
(`activo` viajando en el mismo PATCH) cuyo único test **no puede fallar**, más dos
guards deliberados que se pueden borrar sin romper nada.

## 2. Requisitos del spec → mutación → test que murió

Nomenclatura: `Mn` = mutación de backend, `Fn` = mutación de frontend.

### `preventivo-permisos-rol`

| Requisito | ¿Verificado? | Mutación | Test que murió y aserción |
|---|---|---|---|
| PR-R1 Rol que administra el módulo | **Sí** (ambos hermanos) | M10: sacar `PREVENTIVO:MODIFICACION` de `PRESETS_ROL.COLABORADOR` | `presets-rol.spec.ts > [hermano invertido…] COLABORADOR incluye las cuatro celdas PREVENTIVO:*` — `expected [ 'COMPRAS:ALTAS', …(18) ] to deeply equal ArrayContaining{…}` |
| PR-R1 (hermano) | **Sí** | M11: devolver las cuatro celdas a `TECNICO` | `presets-rol.spec.ts > TECNICO coincide con las celdas del backfill histórico + CSAT:LECTURA` — `expected […(28)] to deeply equal […(24)]` |
| PR-R2 Migración idempotente | **Sí** | M13: quitar `ON CONFLICT DO NOTHING` | `swap-preventivo-permisos.integration.spec.ts > [CRITICAL] correr el swap dos veces no cambia el estado final ni duplica filas` |
| PR-R2 INSERT conservador | **Sí** | M14: `INSERT` sin `activo = true AND deleted_at IS NULL` | `COLABORADOR con membresía inactiva no recibe nada` — `expected [ 'PREVENTIVO:ALTAS', …(3) ] to deeply equal []` |
| PR-R2 DELETE total (sin filtrar `activo`) | **NO VERIFICADO** | M12: agregar `AND m.activo = true` al `DELETE` | **ningún test murió** (7/7 verdes) — ver Hallazgo W1 |
| PR-R3 Ayuda refleja el rol correcto | **Sí, por inspección** (sin mutación posible: es documentación sin test) | — | `grep "ni siquiera Colaborador" backend/ayuda/` → ausente; `permisos-y-roles.md:111-127` describe COLABORADOR como administrador y TECNICO sin acceso |

### `preventivo-objetivo-en-ticket`

| Requisito | ¿Verificado? | Mutación | Test que murió y aserción |
|---|---|---|---|
| OT-R1 línea `Ubicación: <TEXTO>` | **Sí** | M1: devolver `${texto}` sin prefijo | `describir-objetivo.service.spec.ts > UBICACION → "Ubicación: <TEXTO>"` — `expected 'SALA DE SERVIDORES' to be 'Ubicación: SALA DE SERVIDORES'` (+2 más) |
| OT-R1 línea `Equipo: <nombre>` | **Sí** | M4: devolver `${nombre}` sin prefijo | `EQUIPO_VIGENTE → "Equipo: <nombre>"` — `expected 'Notebook Dell 5420' to be 'Equipo: Notebook Dell 5420'` (+5 más) |
| OT-R1 línea en blanco entre objetivo e instrucciones | **Sí** | M3: `\n\n` → `\n` | `componerDescripcionTicket > antepone la línea de objetivo, una línea en blanco y luego las instrucciones` — `expected 'Equipo: …\nLimpiar…' to be 'Equipo: …\n\nLimpiar…'` (+7 más) |
| OT-R1 el barrido usa la descripción compuesta | **Sí** | M8: `descripcion = plan.instrucciones ?? ''` | 6 tests de `generar-preventivos.use-case.spec.ts` — `expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]` |
| OT-R1 cableado DI del repo de equipos (tarea 2.6) | **NO VERIFICADO** | M9: sacar `EQUIPO_INFORMATICO_REPOSITORY` del `inject` de `preventivo.module.ts` | **ningún test murió** (e2e + integración: 25/25 verdes) — ver Hallazgo W2 |
| OT-R2 distingue "dado de baja" de "eliminado" | **Sí** | M2: colapsar los dos textos | `EQUIPO_ELIMINADO → "…(eliminado del inventario)"` y `las siete ramas producen resultados mutuamente distintos` — `expected 6 to be 7` |
| OT-R2 `findById` que lanza no aborta la generación | **Sí** | M5: sacar el `try/catch` de `resolverObjetivo` | `[OT-R2] findById lanza (equipo no consultable) → … NO aborta la generación` — `expected "vi.fn()" to be called 1 times, but got 0 times` |
| OT-R2 equipo inactivo ≠ equipo vigente | **Sí** | M7: borrar la rama `!equipo.activo` | `[OT-R2] equipo con activo=false (dado de baja) → …` — `expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]` |
| OT-R2 un plan irresoluble no bloquea al otro | **Sí** | M1/M3/M8 (colateral) | `[OT-R2] dos planes vencidos, uno con equipo irresoluble y otro con objetivo válido` — `expected 1st "vi.fn()" call to have been called with […]` |

### `preventivo-edicion-plan`

| Requisito | ¿Verificado? | Mutación | Test que murió y aserción |
|---|---|---|---|
| EP-R1 `fechaInicio` fuera del formulario | **Sí** (con hermano invertido) | F1: agregar `fechaInicio` a `camposEdicion` | `schemas.test.ts > acepta un payload de edición completo sin fechaInicio` — `expected false to be true` (+5 más) |
| EP-R1 `activo` en el schema de edición | **Sí** | F2: sacar `activo: z.boolean()` | `schemas.test.ts > rechaza cuando activo no es booleano` — `expected true to be false` |
| EP-R1 topes espejados con centinela independiente | **Sí** | F3: `TITULO_MAX_LENGTH` 255 → 500 | `rechaza un título de 256 caracteres` y `rechaza título (TITULO_MAX_LENGTH) por encima del tope` — el centinela fija 256 literal, no derivado |
| **EP-R1 `activo` se edita en el mismo PATCH** | **NO VERIFICADO** | F14 (front): `activo: values.activo` → `activo: plan.activo`; M23 (back): `activo: dto.activo` → `activo: undefined` | **ningún test murió en ninguna de las dos capas** — ver Hallazgo C1 |
| EP-R1 sin endpoint aparte para activar/desactivar | **Sí, por inspección** | — | `PreventivoController` expone solo `POST /`, `GET /`, `GET :id/generaciones`, `PATCH :id`, `DELETE :id`; el front solo tiene `useCrearPlanPreventivo`/`useEditarPlanPreventivo`/`useDarDeBajaPlanPreventivo` |
| EP-R2 solo con `PREVENTIVO:MODIFICACION` (backend) | **Sí** (ambos hermanos) | M15: borrar `@RequiereAcciones('PREVENTIVO:MODIFICACION')` del `@Patch` | `preventivo.e2e.spec.ts > actor SIN PREVENTIVO:MODIFICACION → 403` — `expected 200 to be 403` |
| EP-R2 disparador en la UI (frontend) | **Sí** (ambos hermanos) | F17b: el `<Can>` pide `PREVENTIVO:LECTURA`; F17c: pide `PREVENTIVO:BORRADO` | `sin PREVENTIVO:MODIFICACION el disparador de edición NO se ve` (`expected document not to contain element, found <button`) y `con PREVENTIVO:MODIFICACION el disparador de edición se ve` |
| EP-R3 objetivo excluyente en la edición | **Sí** | M17: borrar `validarObjetivo` de `PlanPreventivoEntity.editar()` | `[EP-R3] edición deja equipo Y ubicación simultáneos → ObjetivoInvalidoError, ningún campo cambia` (+2 más) |
| EP-R3 `null` explícito en el lado descartado (ADR-5) | **Sí** | F5: mandar `undefined` en vez de `null` | `hermano invertido: pasar de equipo a ubicación manda equipoId: null en el cuerpo` — `expected undefined to be null` |
| EP-R3 reaplicar no pisa el objetivo elegido | **Sí** | F9: sacar el gate `objetivo === "equipo"` del `useReaplicarAlResolver` del equipo | `cambiar a ubicación mientras el catálogo de equipos carga NO revive el equipoId` — `expected undefined to be 'OFICINA 2'` |
| EP-R4 cadencia inválida rechazada | **Sí** | M18: borrar `validarIntervalo` de `editar()` | `[EP-R4] intervaloValor: 0 → IntervaloInvalidoError, ningún campo cambia` (+2 más) |
| EP-R5 recalcula hacia adelante | **Sí** | M19: nunca recalcular | `[R2] cambia la cadencia … recalcula el puntero HACIA ADELANTE desde hoy` — `expected "vi.fn()" to be called 1 times, but got 0 times` |
| EP-R5 nunca hacia atrás | **Sí** | M21: recalcular desde `plan.fechaInicio` en vez de `hoy` | mismo test — `expected 1769904000000 to be greater than 1781481600000` |
| EP-R5 hermano invertido (no toca el puntero) | **Sí** | M20: recalcular siempre | `[EP-R5] edita título sin tocar la cadencia → NO recalcula proximaEjecucionEn` — `expected "vi.fn()" to not be called at all, but actually been called 1 times` |
| EP-R5 aviso cualitativo en la UI (ADR-7) | **Sí** (ambos hermanos) | F7: `avisaCadencia = false`; F8: `= true` | `aparece al ensuciar intervaloValor` y `hermano invertido: NO aparece al tocar solo título` |
| EP-R6 plan inexistente o dado de baja | **Sí** | M16: el guard deja de mirar `plan.isDeleted()` | `[EP-R6] plan dado de baja lógicamente → Result.fail(PlanNoEncontradoError)` — `expected false to be true` |
| EP-R7 Ayuda documenta la edición | **Sí, por inspección** | — | `mantenimiento-preventivo.md:139` "Editar un plan existente" cubre campos editables, `activo` en el mismo botón, `fechaInicio` no editable y el recálculo hacia adelante sin generar ciclos intermedios |

### Requisitos de diseño verificados fuera de la tabla de spec

| Qué | Mutación | Resultado |
|---|---|---|
| `conValorFueraDeCatalogo` no infiere baja sin `resuelto` | F4: ignorar el parámetro `resuelto` | Muere: 6 tests, incl. `catálogo de prioridades caído: NUNCA se infiere una baja` |
| Prioridad fuera de catálogo (DEUDA 1 del apply) | F10: quitar el helper de `opcionesPrioridad` | Muere: `la prioridad del plan no está en el catálogo activo: opción extra 'Prioridad dada de baja', preseleccionada` |
| Responsable fuera de catálogo (DEUDA 1) | F11: quitar el helper de `opcionesResponsable` | Muere: `el responsable del plan no está entre los asignables…` |
| Aviso inline de catálogo caído (DEUDA 2) | F18/F19: borrar los `<p role="alert">` de `prioridadesQuery.isError` / `usuariosQuery.isError` | Mueren: `el catálogo de prioridades falla: aviso inline…` y `GET /usuarios responde 403 por falta de TICKETS:ASIGNAR: aviso inline que nombra el permiso` |
| `reset(valoresVigentes)` en cada apertura (ADR-4) | F6: no resetear al abrir | Muere: `abre, cierra, muta el prop plan y al reabrir el form muestra los valores VIGENTES` |
| ADR-6 rama 404 vs rama "otro error" | F15: mismo texto para las dos; F16: no deshabilitar el select | Mueren: `(c) … 404 → 'Equipo eliminado del inventario'` y `(d) … otro error → mensaje y select deshabilitado` |
| Defensa principal de `useReaplicarAlResolver` (dep booleana, no la lista) | F20: sin `ref` y sin array de deps (corre en cada render) | Muere: `pasar de ubicación a equipo manda ubicacion: null en el cuerpo`. El comentario del hook que afirma que existe ese test de regresión es **cierto** |
| Ruta e invalidación del PATCH | F21: cambiar la ruta; F22: no invalidar | Mueren: `hace PATCH /preventivo/planes/:id e invalida el listado en onSuccess` |

**Las DEUDAS 1 y 2 registradas en el apply-progress están efectivamente cerradas por
`94e63ad`, y sus arreglos están cubiertos por tests que mueren bajo mutación.**

## 3. Hallazgos por severidad

### C1 — CRITICAL · El test de "`activo` se cambia en el mismo envío" no puede fallar

**Qué está mal.** `plan-preventivo-edit-dialog.test.tsx:169` es el único test de todo el
repositorio que ata el checkbox `activo` al cuerpo del PATCH, y tiene **dos candados rotos
a la vez**:

1. La única aserción sobre el valor —`expect(body.activo).toBe(false)`, línea 175— vive
   **dentro del resolver de MSW**. Cuando falla, MSW la convierte en una respuesta de
   error; la excepción nunca llega al runner y el test no se entera.
2. El cierre —`await waitFor(() => expect(toast.success).toHaveBeenCalled())`, línea 187—
   se apoya en `vi.mock("sonner", () => ({ toast: { success: vi.fn(), … } }))` (línea 11),
   un mock de módulo que **nunca se limpia**: no hay `clearMocks` en `vitest.config.ts` ni
   un `vi.clearAllMocks()` en `beforeEach`. Los tests anteriores del mismo archivo ya
   dejaron llamadas registradas, así que la aserción pasa por construcción.

**Escenario que lo dispara.** Cualquier regresión que haga que `activo` deje de viajar en
el DTO. Medido con dos mutaciones independientes:

- **F14 (frontend)**: `activo: values.activo` → `activo: plan.activo` en el `submit` del
  diálogo. Suite focalizada **78/78 verdes**. El archivo completo, **28/28 verdes**.
- **M23 (backend)**: `activo: dto.activo` → `activo: undefined` en `PreventivoController.editar`.
  **145/145 verdes** en todo `src/preventivo` + `test/preventivo.e2e.spec.ts`.

Con cualquiera de las dos, el usuario tilda/destilda "Plan activo", guarda, ve el toast de
éxito y el plan **no cambia de estado**. Sin error, sin log.

**Prueba del mecanismo.** Con la mutación F14 puesta:
- archivo entero → **28/28 verdes**;
- archivo entero + `beforeEach(() => vi.clearAllMocks())` insertado como sonda →
  **1 fallo**: `activo se cambia en el mismo envío, sin segunda llamada`,
  `AssertionError: expected "vi.fn()" to be called at least once`.
- corriendo el test aislado con `-t "activo se cambia"` (sin tests previos que ensucien el
  mock) → **falla**. Es decir: el test *aislado* muerde, pero la suite real **nunca lo corre
  aislado**.

**Por qué no lo atrapa la revisión de diff.** Las dos piezas son idiomáticas y están
separadas por 160 líneas; ninguna es sospechosa por sí sola.

**Qué falta (no se aplicó — este verify no corrige).** Afirmar el cuerpo **fuera** del
resolver (capturarlo en una variable y asertar después del `await`), y limpiar los mocks
entre tests. Y del lado del backend, un caso e2e que mande `activo: false` en el PATCH y
verifique el plan resultante: hoy el e2e solo edita `titulo`.

### W1 — WARNING · El `DELETE` de la migración de swap puede filtrar por `activo` sin que nada se rompa

**Qué está mal.** M12 agrega `AND m.activo = true` al `DELETE` de
`20260831120000_swap_preventivo_permisos_colaborador/migration.sql` y la suite queda en
**7/7 verdes**. Ese guard es una decisión explícita del diseño: la cabecera del propio SQL
dice *"El DELETE NO filtra `activo`: revocar es total, porque una celda que sobrevive en una
membresía TECNICO inactiva devuelve el módulo el día que esa membresía se reactive"*, y la
tarea 1.4 lo escribe en negrita.

**Escenario que lo dispara.** Un usuario TECNICO con membresía **inactiva** al momento de
correr la migración. Con el filtro puesto, conserva sus cuatro celdas `PREVENTIVO:*`; el día
que se reactiva la membresía, recupera altas, modificación y borrado de planes preventivos
— justo el acceso que este change le quita.

**Por qué el test actual no lo atrapa.** El fixture (`swap-preventivo-permisos.integration.spec.ts:135-163`)
crea `TECNICO simple` con `activo: true`, `COLABORADOR activo`, `COLABORADOR inactivo`,
`ADMINISTRADOR`, `USUARIO` y un usuario mixto — pero **nunca un TECNICO con `activo: false`**.
La asimetría está cubierta solo del lado del `INSERT`. Además, el comentario de cabecera del
spec (líneas 10-11) afirma que el archivo cubre *"el DELETE no filtra `activo` (design ADR-3)"*:
esa afirmación es hoy **falsa**.

### W2 — WARNING · El cableado DI que hace posible OT-R1 no tiene ninguna cobertura

**Qué está mal.** M9 borra `EQUIPO_INFORMATICO_REPOSITORY` del array `inject` del provider de
`GenerarPreventivosUseCase` (`preventivo.module.ts:142-152`) —dejando intacto el `imports`, así
que Nest arranca sin quejarse— y **todo queda verde**: `test/preventivo.e2e.spec.ts` +
`src/preventivo/generar-preventivos.integration.spec.ts`, 25/25.

**Escenario que lo dispara.** Con `equipoRepo` en `undefined`, `resolverObjetivo` ejecuta
`this.equipoRepo.findById(...)` dentro de su `try`, cosecha un `TypeError` y degrada a
`EQUIPO_NO_CONSULTABLE`. Resultado en producción: **todo plan con `equipoId` genera su ticket
diciendo `Equipo: no se pudo consultar (id …)`**, para siempre, con un `logger.error` por
ticket y ningún fallo visible. Es exactamente el modo de falla silenciosa que ADR-2 quiso
evitar y el que OT-R1 promete cubrir.

**Por qué el test actual no lo atrapa.** Los dos únicos consumidores del use case en tests lo
**construyen a mano**: el unitario con `vi.fn()` y el de integración con un doble literal
(`generar-preventivos.integration.spec.ts:206-208`, cuyo propio comentario aclara que sus
planes usan `ubicacion` y nunca `equipoId`). Nadie resuelve `GenerarPreventivosUseCase` desde
el contenedor de Nest ejercitando un plan con equipo. El `preventivo.e2e.spec.ts` levanta el
módulo pero no corre el barrido.

### W3 — WARNING · La tarea 1.7 está marcada `[x]` con 1 de 3 citas sin actualizar, y la que quedó ahora miente

**Qué está mal.** La tarea 1.7 pide actualizar **tres** citas de ADR-PV6: `presets-rol.ts`,
`backfill-preventivo-permisos.integration.spec.ts` y *"el header de `20260825120100/migration.sql`"*.
Las dos primeras apuntan al design nuevo; la tercera **no se tocó** (último commit de ese
archivo: `bd098f9`, del ciclo anterior).

Consecuencia concreta: `20260825120100_backfill_preventivo_permisos/migration.sql:10-11` sigue
diciendo *"SOLO TECNICO — a diferencia del backfill de CSAT, COLABORADOR NO lleva este módulo
(ver ADR-PV6: 'USUARIO/COLABORADOR no llevan nada')"*. Después de este change eso es
**falso**: COLABORADOR lleva las cuatro celdas. Es el "comentario de estado que caduca" que
`AGENTS.md` señala como el defecto de documentación más común del repo.

Hay una razón legítima para no editar una migración ya aplicada (cambia el checksum de Prisma
y dispara drift), pero entonces la tarea debía anotarse como no aplicable, no marcarse hecha.
La salida limpia es un comentario nuevo en la migración del swap que corrija a la vieja, o una
nota en `tasks.md`.

### S1 — SUGGESTION · El spec delta contradice al código en la etiqueta de `deletedAt`

`specs/preventivo-objetivo-en-ticket/spec.md:45-50` describe el escenario *"Equipo dado de baja
(deletedAt no nulo)"* con el ejemplo `Equipo: <nombre> (dado de baja)`. El código —siguiendo
ADR-1, que refinó el spec a **cinco** estados— usa `(eliminado del inventario)` para
`isDeleted()` y reserva `(dado de baja)` para `activo = false`. El requisito normativo
("distinguir textualmente") se cumple; lo que quedó desalineado es el ejemplo. Como `openspec/specs/`
está vacío y este delta pasa a ser el spec completo al archivar, conviene corregirlo antes:
si no, el registro que sobrevive contradice al código.

### S2 — SUGGESTION · `useReaplicarAlResolver` es un hook compartido y exportado sin spec propio

Vive en `frontend/src/shared/hooks/`, lo consumen tres selects, y **no tiene archivo de test**
(comparar con `shared/lib/opciones-catalogo.ts`, que sí tiene el suyo). Su cobertura es
enteramente indirecta, vía el diálogo de edición.

Su defensa principal (la dependencia booleana en vez de la lista) **sí está cubierta**: F20
la mata. La secundaria no: **F13 —borrar el `ref` `yaSincronizado`— sobrevive** con la suite
entera en verde. Honestamente: hoy eso es probablemente un *mutante equivalente*, porque en los
tres call sites todas las dependencias son primitivas que no cambian después de resolver. Pero
el escenario que el propio JSDoc nombra —*"`valor`, cuando el prop del registro se actualiza con
el formulario abierto"*— no tiene test, y es alcanzable: `refetchOnWindowFocus` viene en `true`.

### S3 — SUGGESTION · Falta el "caso b" del select de equipo

F12 (volver no-op al hook) mata exactamente dos tests: `(caso b) el catálogo resuelve DESPUÉS
de que el select montó` para **prioridad** y su hermano para **responsable**. No hay el
equivalente para **equipo**, que es el único de los tres que además participa del XOR del
objetivo, o sea el de consecuencia más cara.

### S4 — SUGGESTION (preexistente, no de este change) · El `@MaxLength` del DTO mide crudo, el dominio mide normalizado

`EditarPlanPreventivoHttpDto.ubicacion` lleva `@MaxLength(UBICACION_MAX_LENGTH)` sobre el valor
**crudo**, mientras `PlanPreventivoEntity` mide después de `normalizarUbicacion` (trim +
`toUpperCase`, que puede **agrandar**: `'ß'` → `'SS'`). Una ubicación de 255 caracteres con `ß`
pasa el DTO y la rechaza el dominio: 422 en vez de 400, no un 500 — la entidad hace de
backstop. El schema del front ya normaliza antes de medir (`schemas.ts:57-61`), así que la capa
que quedó desalineada es el DTO. Viene del ciclo anterior (`CreatePlanPreventivoHttpDto` tiene
la misma forma); se anota como nota, no como defecto de este change.

### Nota de alcance (no es hallazgo de este change)

El patrón `vi.mock("sonner")` sin limpieza de mocks alcanza a **22 archivos de test del
frontend** (compras, edilicia, equipos, clientes, catálogos, auth, y los tres de preventivo).
En este change solo importa donde `expect(toast.success).toHaveBeenCalled()` es el candado
principal de una aserción, que es el caso de C1. Barrer los 22 es un change propio.

## 4. Guards que se pudieron borrar sin romper ningún test

Lista explícita, cada uno con su mutación:

1. **`AND m.activo = true` ausente en el `DELETE`** de la migración de swap (M12) —
   `20260831120000_swap_preventivo_permisos_colaborador/migration.sql`. Ver W1.
2. **`EQUIPO_INFORMATICO_REPOSITORY` en el `inject`** de `preventivo.module.ts` (M9). Ver W2.
3. **`activo: dto.activo`** en `PreventivoController.editar` — se puede mandar `undefined`
   (M23). Ver C1.
4. **`activo: values.activo`** en el `submit` de `plan-preventivo-edit-dialog.tsx` — se puede
   mandar `plan.activo` (F14). Ver C1.
5. **El `ref` `yaSincronizado`** de `useReaplicarAlResolver` (F13). Probable mutante
   equivalente con los call sites actuales; ver S2.

Un guard cuya mutación fue inválida y **no cuenta** como sobreviviente: F17 (reemplazar
`<Can …>` por `<>`) rompió el parseo del archivo en vez de fallar por aserción. Se rehizo como
F17b/F17c cambiando el permiso pedido, y ahí sí murió por aserción en las dos direcciones.

## 5. Estado de las tareas vs. estado del código

Las 37 tareas están marcadas `[x]`. Comprobadas contra el código:

- **WU-0** (0.1–0.4): los cuatro escenarios existen y mueren bajo M16/M17/M18/M19/M20/M21,
  cada uno con su hermano invertido y afirmando que ningún campo cambió. **Correcto.**
- **WU-1** (1.1–1.10): migración, spec de integración con `usarLockMasterTest()`, presets y
  Ayuda están. **Salvo la tarea 1.7, que está 2/3** (W3) y el hueco de cobertura del `DELETE`
  (W1).
- **WU-2** (2.1–2.8): las siete ramas, el test de distinción mutua, los cinco casos con doble
  de `findById` y la sección de Ayuda están. El cableado de 2.6 existe en el código pero
  **ningún test lo fija** (W2).
- **WU-3** (3.1–3.15): los cinco archivos de código son los declarados; el guard de tamaño de
  3.14 se cumple. Todos los renglones de ADR-6 y el par invertido del aviso de cadencia mueren
  bajo mutación. **Salvo 3.7**, cuya mitad de `activo` no es verificable (C1).
- **"Fuera de alcance"**: la deuda declarada —el PATCH devuelve `proximaEjecucionEn`
  desactualizada— sigue vigente y sigue mitigada por la invalidación del listado (F22 la fija).
  **Correcto como está declarada.**
- **DEUDA 3 del apply-progress** (un plan `SIN_OBJETIVO` con `instrucciones = null` persiste
  `''` donde antes persistía `NULL`): **sigue abierta**. `componerDescripcionTicket` devuelve
  siempre `string`. No es regresión de comportamiento visible y estaba decidida para después;
  se deja registrada para que no se pierda al archivar.

## 6. Estado final de las suites y del árbol

| Suite | Canario | Medido ahora | Exit |
|---|---|---|---|
| backend `pnpm test` | 350 archivos / 3757 tests | **350 / 3757** | 0 |
| frontend `pnpm test` | 163 archivos / 1092 tests | **163 / 1092** | 0 |
| backend `pnpm typecheck` | — | — | 0 |
| backend `pnpm lint` | — | — | 0 |
| frontend `pnpm type-check` | — | — | 0 |
| frontend `pnpm lint` | — | — | 0 |

Sin regresión contra el canario. Los 3 `FAIL` intencionales de `orden-de-arranque.spec.ts` y
la flakiness conocida de `auth/interface/controllers/auth.e2e.spec.ts > POST /auth/refresh` no
se manifestaron en esta corrida.

**`git status` quedó limpio.** Las 45 mutaciones se aplicaron con copia previa (`cp`) y se
revirtieron con `cp` + verificación por `git diff --quiet` archivo por archivo; ninguna usó
`git checkout`, `git restore` ni `git stash`. La sonda temporal sobre el archivo de test de C1
(un `beforeEach(() => vi.clearAllMocks())` insertado para probar el mecanismo) también se
revirtió y se verificó por `git diff`. Ningún test fue borrado ni comentado.

## 7. Recomendación

**Cerrar C1 antes de archivar** (es un arreglo chico y acotado al archivo de test, más un caso
e2e de backend). W1 y W2 son huecos de cobertura de guards deliberados: se pueden cerrar en el
mismo pasaje o levantarse como change propio, pero conviene que queden escritos en algún lado
antes de que el ciclo se archive, porque los dos son fallas silenciosas. W3 es una corrección de
`tasks.md` o un comentario en la migración del swap. S1 conviene corregirlo antes de archivar,
porque ese delta pasa a ser el spec definitivo.
