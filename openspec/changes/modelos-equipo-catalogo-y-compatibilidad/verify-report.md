```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:cff4430d4e3703f265bc949c3ece1879082ca21b1749f6dd91a009d83d6948b8
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 5/5
scenarios: 9/9
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:b238f103f37812ca86fe903cb1c0cfde4e287d96133e94f88516e8deaf589a55
build_command: pnpm type-check && pnpm lint
build_exit_code: 0
build_output_hash: sha256:dd6e1e36976bd4f9cf2834e423c02eb86a1502ca8fa2aab00239c570356671c1
```

## Verification Report — RONDA 2

**Change**: modelos-equipo-catalogo-y-compatibilidad
**Fecha**: 2026-09-18 · Rama `verificacion/modelos-equipo-integracion`, HEAD `6d6e06f`
(la ronda 1 verificó `3c1cc65`), árbol de trabajo limpio al abrir y al cerrar: el único
elemento de `git status --porcelain` es este informe, declarado como untracked previsto.
**Naturaleza**: verificación COMPLETA del ciclo sobre el árbol remediado, no una revisión
del diff de la remediación. Los 5 requisitos y los 9 escenarios se re-contrastaron contra
el código. Las afirmaciones del informe de ronda 1 se trataron como hipótesis a verificar,
no como hechos heredados.
**Mode**: Standard. `strict_tdd: false` en `openspec/config.yaml` y el tipo de trabajo es
`feature`. El orquestador NO inyectó `STRICT TDD MODE IS ACTIVE`, así que no se exige tabla
de TDD Cycle Evidence y su ausencia no es hallazgo.
**Método**: inspección contra spec con cita `archivo:línea` para implementación Y test,
ejecución real de las tres compuertas de frontend, y **cuatro mutaciones adversariales**
(`rules.verify` exige al menos una), todas revertidas con el árbol reconfirmado limpio.
**RDD**: OFF por default (gentle-ai#3289, anotado en `rules.verify`). No hay receipt y no se
fabrica ninguno; la entrega queda bajo política ordinaria del repo.

---

## 1. Veredicto

**PASA CON ADVERTENCIAS** — 0 CRITICAL, 1 WARNING, 4 SUGGESTION.

**La W1 de la ronda 1 queda CERRADA**, y no por declaración sino por mutación: existe un
mutante que mata únicamente al test nuevo y deja pasar a su hermano (§ 4.2). Ese mutante es
exactamente el riesgo residual que la W1 nombraba.

La W2 persiste, sin remediar, y esta ronda juzga que persistir es **la decisión correcta**
para un ciclo declarado 100% frontend (§ 6).

Se agrega un matiz que el mensaje de commit de la remediación afirma de más, y se corrige
(§ 4.1): la inversión del ternario NO demuestra lo que el commit dice que demuestra. La
remediación es correcta y necesaria, pero la sostiene otra mutación, no esa.

---

## 2. Compuertas ejecutadas

Todas desde `frontend/`. El ciclo es 100% frontend, re-verificado en esta ronda:
`git diff --stat main...HEAD -- backend/` devuelve **vacío**.

| Compuerta | Comando | Exit | Resultado observado |
|---|---|---:|---|
| Tests | `pnpm test` | 0 | **188 archivos, 1416 tests, 0 fallos** (155,04 s) |
| Tipos | `pnpm type-check` | 0 | `tsc --noEmit` sin salida |
| Lint | `pnpm lint` | 0 | `✔ No ESLint warnings or errors` |

Los tres coinciden **exactamente** con la referencia que pasó el orquestador (188/1416,
type-check sin salida, lint sin errores). No hay discrepancia que reportar.

**Continuidad aritmética contra la ronda 1**: 1415 → **1416**, exactamente +1 test, que es
el que agrega `a331f19`. `git show a331f19 --stat` confirma que ese commit toca **un solo
archivo** (`modelos-equipo-admin-view.test.tsx`, +37 líneas) y **ningún archivo de
producción**. La remediación es puramente de cobertura: no cambió el comportamiento
verificado en la ronda 1, así que la evidencia de esa ronda sobre los otros 8 escenarios
sigue siendo aplicable al mismo código — y aun así se re-verificó línea por línea (§ 3).

**Nota sobre `build_command`**: `openspec/config.yaml` declara `pnpm typecheck && pnpm lint`
(sin guion). Ese es el nombre del script del **backend**; en `frontend/package.json` el
script se llama `type-check`. Se ejecutó el comando que existe en la capa verificada, igual
que en la ronda 1. Divergencia de nomenclatura del config, no de ejecución.

**Falla ambiental conocida, fuera de alcance**: GitHub Actions está bloqueado por un
problema de facturación de la cuenta desde ~09:57 de hoy, así que los checks de CI figuran
en rojo sin haber corrido nunca. Es condición de entorno, NO un defecto de este cambio, y no
se reporta como hallazgo. La verificación local es la evidencia de registro.

---

## 3. Matriz de cumplimiento: requisito → implementación → test

Las 5 filas y los 9 escenarios se re-verificaron contra el árbol en `6d6e06f`. Todas las
citas `archivo:línea` de la ronda 1 se comprobaron una por una y **todas resultaron
exactas**; las que siguen están re-confirmadas en esta ronda, no copiadas.

### R1 — El ABM se gatea por rol, no por permiso de módulo — **CUMPLE**

| Escenario | Estado | Implementación | Test que lo prueba |
|---|---|---|---|
| Un ADMINISTRADOR ve la sección | **CUMPLE** | `admin-nav.tsx:53` agrega `{ href: "/admin/modelos-equipo", label: "Modelos de equipo" }`; `:61` `const { esAdminCliente } = useSession()` y `:63` `const items = esAdminCliente ? ADMIN_NAV_ITEMS : []` | `admin-nav.test.tsx:38` ("ADMINISTRADOR ve las 6 secciones") + `:55`; `modelos-equipo-admin-view.test.tsx:33-45`, caso `ADMINISTRADOR` |
| Un usuario sin el rol no ve la sección | **CUMPLE** | Mismo gate `:63` (lista vacía) + `<SoloAdminCliente fallback={<ErrorState …>}>` en `modelos-equipo-admin-view.tsx:23` | `modelos-equipo-admin-view.test.tsx:42-43`, caso `TECNICO`: espera `/no tenés permiso/i` **Y** `queryByText("HP")` ausente — el hermano invertido verifica que no se filtre el listado, no solo que aparezca el error |

**Sin permiso nuevo inventado**: se cruzó `MODELO_EQUIPO|MODELOS_EQUIPO` contra
`permiso|modulo|accion|matriz|canModulo` en todo `frontend/src` y el resultado es **vacío**.
El gate es la identidad `esAdminCliente` preexistente, tal como lo documenta el comentario de
`admin-nav.tsx:49-52`, y coincide con la autoridad real del borde (`AdminClienteGuard` del
backend, que este ciclo no toca).

### R2 — Listar, crear, editar y activar/desactivar — **CUMPLE**

| Escenario | Estado | Implementación | Test que lo prueba |
|---|---|---|---|
| Alta normaliza marca y preserva la capitalización de modelo | **CUMPLE** | `modelos-equipo/schemas.ts:28` `normalizarMarca` = `trim().toUpperCase()`; `:38` `normalizarModelo` = solo `trim()`; aplicadas en el `submit()` de `modelo-equipo-form-dialog.tsx` | `modelo-equipo-form-dialog.test.tsx:27`; `modelos-equipo-admin-view.test.tsx:129-134` (tipea `"epson"`/`"L3250"`, espera `EPSON` + `L3250` en la lista); `schemas.test.ts:65` |
| Activar y desactivar un modelo desde la lista | **CUMPLE — remediado en esta ronda** | `modelo-equipo-list.tsx:23-40` `EstadoActivoAction` tras `ConfirmDialog`; `:29,32,33,34,35` etiquetas y variante ternarias sobre `modelo.activo`; `:37` `onConfirm={() => mutation.mutate({ activo: !modelo.activo })}`; Badge `:52` | **Dirección activo→inactivo** (el WHEN literal del escenario): `modelos-equipo-admin-view.test.tsx:56-82` — parte de `MODELO_HP` con `activo: true`, clickea "Dar de baja", confirma, asserta `{ activo: false }` enviado **y** `findByText("Baja")`. **Dirección inactivo→activo**: `:84-103` |

Edición y tope de longitud quedan cubiertos además por `modelo-equipo-form-dialog.test.tsx:46`
y `:96` (tope 100 medido sobre el valor normalizado, verificando que la request NO se
dispara), más `schemas.test.ts:46,57` con su par de hermanos invertidos.

El juicio detallado sobre la remediación está en § 4.

### R3 — El par duplicado se rechaza sin importar el estado del existente — **CUMPLE (con W2)**

| Escenario | Estado | Implementación | Test que lo prueba |
|---|---|---|---|
| Alta duplicada contra un modelo INACTIVO se rechaza igual que contra uno activo | **CUMPLE, cobertura repartida en dos capas — ver W2** | Rechazo: `backend/src/insumos/application/use-cases/crear-modelo-equipo.use-case.ts` — **preexistente, sin cambios en este ciclo**. Display: el 422 llega como `notifyError` genérico desde `use-modelo-equipo-mutations.ts:32,45,58`, y el diálogo no cierra porque `setOpen(false)` solo corre en `onSuccess` | **Mitad backend** (el "inactivo"): `crear-modelo-equipo.use-case.spec.ts:66` "rechaza con ModeloEquipoDuplicadoError si el par ya existe (habilitado o no)", con `activo: false` explícito en el fixture (`:70`). **Mitad frontend** (el 422 sin cerrar): `modelo-equipo-form-dialog.test.tsx:79` |

Se verificó literalmente el JSDoc que la ronda 1 citaba: existe, en
`modelo-equipo-form-dialog.test.tsx:71-78`, y dice *"el backend lo devuelve igual como 422,
así que este test no distingue el caso, solo verifica que el formulario NO se cierra"*. La
cita de la ronda 1 es fiel.

### R4 — Alta y edición de equipo permiten elegir un modelo del catálogo — **CUMPLE**

| Escenario | Estado | Implementación | Test que lo prueba |
|---|---|---|---|
| Crear un equipo con modelo de catálogo elegido | **CUMPLE** | `equipo-create-dialog.tsx:211-230` `<Select>` con las opciones del catálogo; `:117` `modeloEquipoId: values.modeloEquipoId \|\| undefined` en el payload | `equipo-create-dialog.test.tsx:316` `expect(capturado.body.modeloEquipoId).toBe(MODELO_HP.id)` |
| Un equipo sin modelo se sigue creando con texto libre | **CUMPLE — ver S1 por la letra del escenario** | Mismo `:117`: vacío es AUSENCIA en alta (ADR-4) | `equipo-create-dialog.test.tsx:341-343`: el POST trae `marca: "Genérico"`, `modelo: "Clon"` y `modeloEquipoId` **ausente** |

El selector admite vacío (`<option value="">Sin modelo de catálogo</option>`,
`equipo-create-dialog.tsx:226` y `equipo-edit-dialog.tsx:280`) y el schema lo permite con
`equipos/schemas.ts:136` `z.string().uuid().optional().or(z.literal(""))`.

**Columna `Marca`, los cuatro desenlaces** (R4 en su parte de display, ADR-2/ADR-3):
`equipos-list-view.tsx:51-68` resuelve con un `switch` **exhaustivo y sin `default`**, de modo
que sumar un estado a la unión rompe el typecheck en vez de colapsar en silencio. Los cuatro
resultados son textos distintos (`nombre-de-catalogo.ts:34,41,49`): `CARGANDO` → `"Cargando…"`,
`NO_DISPONIBLE` → `"Sin datos del catálogo"`, `FUERA_DE_CATALOGO` → `"Fuera del catálogo"`,
`ENCONTRADA` → `` `${marca} ${modelo}` ``. Los cinco caminos tienen test:
`equipos-list-view.test.tsx:111,123,144,156` y `:168`.

### R5 — Elegir un modelo deshabilita y vacía los campos de texto libre — **CUMPLE**

| Escenario | Estado | Implementación | Test que lo prueba |
|---|---|---|---|
| Elegir un modelo vacía y deshabilita los campos | **CUMPLE, probado por mutación (§ 4.4)** | `equipo-create-dialog.tsx:216-225` y `equipo-edit-dialog.tsx:268-278`: enclavamiento dentro de `register("modeloEquipoId", { onChange })`, con guarda `if (!e.target.value) return;` y luego `setValue("marca","")` + `setValue("modelo","")`. Deshabilitado por `disabled={conModeloDeCatalogo}` en `create:182,198` y `edit:234,250` | Alta: `equipo-create-dialog.test.tsx:309-312` asserta **deshabilitado Y vacío** en los dos campos, y `:317-318` que el POST no los trae. Edición: `equipo-edit-dialog.test.tsx:380-381` (el equipo llega con `"Dell"`/`"Latitude"` guardados), `:388-391` (se vacían **a la vista**, antes de tocar Guardar) y `:395-397` (el PATCH manda `marca: null, modelo: null, modeloEquipoId: <uuid>`) |
| Quitar el modelo rehabilita los campos | **CUMPLE** | La guarda `if (!e.target.value) return;` hace que deseleccionar NO borre; `conModeloDeCatalogo` vuelve a `false` y rehabilita | `equipo-create-dialog.test.tsx:333-343`; `equipo-edit-dialog.test.tsx:415-418` (rehabilitados **sin restituir** el texto: quedan vacíos, tal como ADR-4 lo declara intencional) |

**Conformidad con ADR-4, re-verificada**: el enclavamiento vive en `register(...).onChange` en
**ambos** diálogos, y el `submit()` de edición (`equipo-edit-dialog.tsx:172-180`) manda
`marca: conModeloElegido ? null : …` / `modelo: conModeloElegido ? null : …` y
`modeloEquipoId: values.modeloEquipoId || null`. No existe ningún `useEffect` que dependa de
`conModeloDeCatalogo`: los únicos que tocan `modeloEquipoId` son los de reaplicación de valor
cuando el catálogo resuelve tarde (`create:70`, `edit:121-122`), que es el defecto que ADR-6
manda evitar, no el enclavamiento.

---

## 4. Juicio de la remediación (`a331f19`) y mutaciones adversariales

`rules.verify` exige mutar al menos un guard central, confirmar rojo, revertir y reconfirmar
verde. Esta ronda corrió **cuatro** mutaciones. Todas fueron revertidas con
`git checkout --`, con `rg MUTANTE frontend/src` sin coincidencias y `git status --porcelain`
mostrando únicamente este informe.

### 4.1 M1 — invertir el ternario de etiquetas: reproduce el número, pero NO prueba lo que el commit afirma

El mensaje de `a331f19` sostiene: *"invertir el ternario `activo ? "Dar de baja" : "Activar"`
mata DOS tests, uno por cada dirección. Con un solo sentido, esa inversión pasaba
desapercibida en la mitad de los casos."*

Se reprodujo la mutación sobre `modelo-equipo-list.tsx` (el patrón aparece en `:29`, etiqueta
del trigger, y en `:34`, `confirmLabel`; la mutación alcanzó a ambos). **Resultado
observado: `Tests 2 failed | 3 passed (5)`**, y los dos muertos son exactamente
`da de baja un modelo activo desde la lista` y `lista el catálogo y reactiva un modelo dado
de baja`. El número que reporta el commit es correcto.

**Pero la inferencia no se sostiene, y hay que decirlo.** Ese mutante invierte las etiquetas
en las DOS ramas a la vez: con un modelo inactivo pasa a renderizar "Dar de baja" donde el
test hermano —el que ya existía antes de la remediación— busca `/^activar$/i`. Es decir, el
hermano solo **también** lo mata. Esa inversión NO pasaba desapercibida antes de `a331f19`;
la atrapaba el test que ya estaba. M1 demuestra que ambos tests son sensibles a las
etiquetas, no que uno solo fuera insuficiente.

La remediación es correcta y necesaria. Lo que la sostiene es M2.

### 4.2 M2 — el mutante discriminante: la W1 queda CERRADA con evidencia

La W1 nombró su propio riesgo residual: *"una regresión que rompa **solo** la rama de baja
(por ejemplo … fijar `activo: false` a `true`) pasaría verde"*. Se aplicó exactamente esa
mutación, sobre `modelo-equipo-list.tsx:37`:

```
-      onConfirm={() => mutation.mutate({ activo: !modelo.activo })}
+      onConfirm={() => mutation.mutate({ activo: true })}   // MUTANTE-L37
```

**Resultado observado: `Tests 1 failed | 4 passed (5)`.** Muere **únicamente** el test nuevo:

```
 FAIL  modelos-equipo-admin-view.test.tsx > ModelosEquipoAdminView >
       da de baja un modelo activo desde la lista
AssertionError: expected { activo: true } to deeply equal { activo: false }
```

El hermano de reactivación **pasa**, porque `{ activo: true }` es precisamente lo que él
espera. Antes de `a331f19` este mutante habría quedado en verde: era el único test del
toggle.

**Ese es el cierre de la W1**, y no es una afirmación de cobertura sino una medición: el test
nuevo aporta poder discriminante que el hermano no tenía y no podía tener.

### 4.3 M3 — la aserción de UI tiene dientes; el mock con estado no tapa nada

Pregunta abierta de esta ronda: el test nuevo hace que el `GET` refleje el cambio de estado
(`modelos-equipo-admin-view.test.tsx:62-69`, variable `activo` mutada por el handler del
PATCH y leída por el del GET). ¿Es fiel o encubre algo?

**Es fiel, y se midió.** Se removió la invalidación de caché de
`use-modelo-equipo-mutations.ts:55` (`queryClient.invalidateQueries({ queryKey:
["modelos-equipo"] })` dentro de `useCambiarEstadoActivoModeloEquipo.onSuccess`), dejando
todo lo demás intacto:

**Resultado observado: `Tests 1 failed | 4 passed (5)`**, y la muerte es exactamente en la
aserción de UI:

```
 FAIL  … > da de baja un modelo activo desde la lista
TestingLibraryElementError: Unable to find an element with the text: Baja.
```

Tres consecuencias concretas:

1. El `findByText("Baja")` **no es decorativo**: exige que el hook invalide, que la query
   refetchee y que `modelo-equipo-list.tsx:52` renderice el Badge correcto. Si cualquiera de
   los tres se rompe, el test cae. No es una aserción que no pueda fallar.
2. El stub con estado **replica el backend real**, no lo esquiva: el PATCH persiste y el GET
   posterior devuelve el valor nuevo. Sin esa fidelidad, el refetch devolvería el estado
   viejo y el test estaría afirmando algo falso sobre el sistema.
3. La técnica **ya era convención de este mismo archivo**: el test
   `crea un modelo desde la vista y lo muestra en la lista` (`:105-123`) usa un arreglo
   `modelos` mutable actualizado por el handler del POST. No es una invención de la
   remediación.

**Sobre la asimetría con el hermano**: está justificada, y en la dirección contraria a la que
sugeriría la sospecha. El test nuevo es el **más fuerte** de los dos: prueba cuerpo del PATCH
+ refetch + render. El hermano es el **más débil**: prueba solo el cuerpo del PATCH y nunca
afirma que la UI vuelva a mostrar el modelo activo. Eso deja una arista fina, registrada como
S3 — no un hueco de escenario.

### 4.4 M4 — el guard central de R5, re-medido (no heredado de la ronda 1)

Para no heredar la evidencia de la ronda 1 sobre el requisito de mayor riesgo, se repitió su
mutación: degradar el enclavamiento a "solo deshabilitar" en `equipo-create-dialog.tsx:221-222`,
reemplazando las dos llamadas de vaciado por `void 0` y dejando intacto el `disabled=`.

**Resultado observado: `Tests 1 failed | 16 passed (17)`**, muriendo en
`equipo-create-dialog.test.tsx:310` (`toHaveValue("")`), mientras que `:309` (`toBeDisabled()`)
**sigue pasando**. Reproduce exactamente lo que reportó la ronda 1: el test distingue
"deshabilitado" de "vaciado".

### 4.5 Reversión y árbol limpio

Tras cada mutación: `git checkout --` sobre el archivo, `rg MUTANTE frontend/src` → *sin
coincidencias*, `git status --porcelain` → solo este informe, `git diff HEAD --stat` → vacío.
Reconfirmación en verde de los tres módulos tocados:
`pnpm vitest run src/features/modelos-equipo src/features/equipos src/components/shell/admin-nav.test.tsx`
→ **17 archivos, 159 tests, 0 fallos**. El árbol verificado es idéntico al que se informa.

---

## 5. Recuento de escenarios: la decisión de esta ronda

**El recuento propio de esta ronda es 9/9**, y la diferencia con la ronda 1 no es el número
sino lo que lo respalda.

La ronda 1 llegó a 9/9 contando como cubierto un escenario cuyos GIVEN y WHEN corrían en
sentido inverso al texto de la spec. Ese 9/9 era generoso: el escenario pedía *GIVEN un
modelo **activo** / WHEN el administrador lo **desactiva***, y el único test partía de
`activo: false` para reactivar.

Con `a331f19` esa dirección se recorre tal como está escrita —`MODELO_HP` con `activo: true`
como GIVEN, click en "Dar de baja" como WHEN— y la cobertura es discriminante, no nominal
(§ 4.2). El 9/9 de esta ronda es honesto por medición, no por criterio.

**Lo que queda fuera del recuento, declarado**: el THEN del escenario tiene dos mitades. *"el
modelo se muestra inactivo"* está probado en la UI por el test nuevo. *"y puede reactivarse"*
está probado como "la acción de reactivar se ofrece y envía `{ activo: true }`", nunca como
"la UI vuelve a mostrarlo activo" — el hermano no afirma el render. Es una arista de nitidez
**dentro de un escenario cubierto**, no un escenario descubierto, y por eso no baja el
recuento a 8/9. Se registra como S3 para que quede a la vista y no se relea como cobertura
que no existe.

---

## 6. La W2 no fue remediada: por qué es la decisión correcta

El escenario de R3 dice que el par duplicado se rechaza *"sin importar el estado del modelo
existente"*. El caso inactivo está genuinamente cubierto, pero por
`crear-modelo-equipo.use-case.spec.ts:66`, backend, código **preexistente que este ciclo no
toca** (`git diff --stat main...HEAD -- backend/` vacío, re-verificado). El test del frontend
mockea un 422 incondicional y su propio JSDoc lo admite.

**Escalarla sería el error.** La responsabilidad genuina del frontend en R3 es mostrar el 422
sin cerrar el formulario, y eso **sí** está probado (`modelo-equipo-form-dialog.test.tsx:79`:
`toast.error` con el mensaje del backend y el campo `Marca` todavía en el documento). Pedirle
a un ciclo 100% frontend que pruebe la semántica "activo o inactivo" sería exigirle cobertura
sobre código que no escribió, no cambió y no puede romper. Un test así no protegería nada:
duplicaría en la capa equivocada una garantía que ya vive donde corresponde.

Se mantiene como **WARNING**, no como CRITICAL, por una razón acotada y distinta: si mañana
alguien agregara un índice parcial al UNIQUE y desactivar pasara a liberar el par, **el
frontend seguiría verde** y no tiene cómo detectarlo. Eso es correcto por reparto de
responsabilidades, pero significa que el escenario, tal como está redactado dentro del spec
de este ciclo, no puede descargarse por completo dentro de su alcance. La consecuencia
operativa está en la recomendación de archivado.

---

## 7. Completitud de tareas y co-viaje de tests

Las **23 tareas** de `tasks.md` están tildadas `[x]` (6 de WU-1, 8 de WU-2, 9 de WU-3), y el
estado nativo lo confirma: `taskProgress: { total: 23, completed: 23, pending: 0,
allComplete: true }`, `applyState: all_done`, `blockedReasons: []`. Sin tareas pendientes, no
hay bloqueo de verificación.

**El test viaja en el mismo commit que el código** —la exigencia que reemplaza a la tabla de
TDD en una feature— re-verificada con `git show --stat`:

| Commit | Código | Tests en el MISMO commit |
|---|---|---|
| `e7a99ed` WU-1 | `types.ts`, `schemas.ts`, los 2 hooks | `schemas.test.ts` |
| `5d1351e` WU-2 | form-dialog, list, admin-view, `page.tsx`, `admin-nav.tsx` | `modelo-equipo-form-dialog.test.tsx`, `modelos-equipo-admin-view.test.tsx`, `admin-nav.test.tsx` |
| `9cf0316` WU-3a | `equipos-list-view.tsx`, `types.ts`, `handlers.ts` | `equipos-list-view.test.tsx` |
| `f300b6b` WU-3b | los dos diálogos, `schemas.ts` | `equipo-create-dialog.test.tsx`, `equipo-edit-dialog.test.tsx` |
| `a331f19` remediación | *(ninguno — solo cobertura)* | `modelos-equipo-admin-view.test.tsx` (+37) |

Ningún commit entrega código sin su test. `a331f19` es el caso inverso y legítimo: test sin
código, porque cierra un hueco de cobertura sobre comportamiento ya entregado.

---

## 8. Honestidad de alcance y coherencia con el diseño

| Afirmación del artefacto | Verificación | Resultado |
|---|---|---|
| Backend SIN cambios | `git diff --stat main...HEAD -- backend/` | **Vacío. Confirmado.** |
| `equipo-detail-view.tsx` SIN cambios (ADR-2) | `git diff --stat main...HEAD -- .../equipo-detail-view.tsx` | **Vacío. Confirmado.** |
| Sin permiso nuevo en `MODULO:ACCION` (R1) | Búsqueda cruzada en `frontend/src` | **Vacío. Confirmado.** |
| Diff total del ciclo | `git diff --stat main...HEAD -- frontend/` | 22 archivos, 1362 inserciones, 11 supresiones |

Los 6 ADRs se re-contrastaron y **no hay desviaciones de diseño**: ADR-1 (molde de unidades de
medida con sus cuatro desvíos: sin `codigo`, normalización distinta por campo, largo medido
sobre el normalizado vía `.refine()` en `schemas.ts:65-68`, sin patrón de código); ADR-2
(ficha sin cambios, la columna es el único display que cambia); ADR-3 (import cruzado de
`@/features/insumos/lib/resolucion-de-catalogo`, cero archivos movidos); ADR-4 (§ 3/R5 y
§ 4.4); ADR-5 (`queryKey` plana `["modelos-equipo"]`, invalidada por las tres mutaciones en
`use-modelo-equipo-mutations.ts:29,42,55`); ADR-6 (`estado === "CON_ENTRADAS"`, notas
distintas para `VACIA` y `NO_DISPONIBLE`, probadas como mutuamente excluyentes en
`equipo-create-dialog.test.tsx:371,381`).

**Deuda de Ayuda**: la pausa de `backend/ayuda/*.md` sigue vigente desde el 2026-09-07. Lo que
la pausa sí exige es anotar la deuda, y está anotada en los mensajes de commit de WU-2 y
WU-3b; `a331f19` declara `"Ayuda: sin deuda (cobertura de test)"`, que es correcto.

---

## 9. Hallazgos

### CRITICAL

Ninguno. No hay requisito sin implementar, ningún test del guard central que no pueda fallar,
ninguna desviación de diseño que rompa un requisito, ninguna tarea pendiente y ninguna
afirmación de artefacto contradicha por el código.

### WARNING

**W2 (persiste desde la ronda 1) — El escenario de R3 se descarga entre dos capas y ningún
test del frontend distingue el caso inactivo.**
Detalle y justificación de por qué NO se escala en § 6. Acción al archivar: dejar anotado que
la autoridad de este escenario vive en el backend (`crear-modelo-equipo.use-case.spec.ts:66`)
y citarlo, para que un ciclo futuro no lo lea como cobertura del frontend.

**W1 — CERRADA.** Se registra el cierre, no la advertencia. Ver § 4.2: existe un mutante que
mata únicamente al test nuevo, que es exactamente el riesgo residual que la W1 describía.

### SUGGESTION

**S1 (persiste) — La letra del escenario "Un equipo sin modelo se sigue creando con texto
libre" (R4) dice `modeloEquipoId: null`, y el alta envía AUSENCIA, no `null`.**
`equipo-create-dialog.tsx:117` manda `values.modeloEquipoId || undefined`, y el test asserta
`toBeUndefined()`. No es un defecto: ADR-4 declara la asimetría *"vacío es AUSENCIA en alta,
vacío es LIMPIAR en edición"*, y el estado **persistido** resultante sí es `null`. Leído como
estado persistido, el escenario se cumple. Sugerencia para el próximo ciclo que toque este
spec: redactar el THEN como "el equipo queda persistido sin modelo de catálogo", verdadero
bajo las dos lecturas.

**S2 (persiste) — El ciclo no tiene `state.yaml`.**
Los dos ciclos archivados del repo sí lo tienen, y con `phase: verify`, lo que indica que se
materializa durante el ciclo y no al archivar. El estado nativo no lo reclama
(`blockedReasons: []`, `nextRecommended: archive`), así que no bloquea. Se anota para que
`sdd-archive` decida si lo materializa o si la lista de la §3.3 de `~/proyectos/CLAUDE.md`
está desactualizada.

**S3 (nueva) — El test hermano de reactivación es el más débil del par y podría igualarse por
~3 líneas.**
El test nuevo (`:56-82`) prueba cuerpo del PATCH + refetch + render del Badge. El hermano
(`:84-103`) prueba solo el cuerpo del PATCH: nunca asserta que la UI vuelva a mostrar
`"Activo"`. Es la mitad *"y puede reactivarse"* del THEN, cubierta como acción ofrecida pero
no como estado renderizado (§ 5). Aplicarle al hermano el mismo `mockBackend` con estado que
ya usa el test nuevo, y agregar `expect(await screen.findByText("Activo")).toBeInTheDocument()`,
cerraría la simetría. No bloquea.

**S4 (nueva) — "siete listas del repo" es impreciso, y la imprecisión quedó commiteada en un
comentario del código.**
El mensaje de `a331f19` y el JSDoc del test nuevo
(`modelos-equipo-admin-view.test.tsx:47-55`) afirman que el patrón está duplicado en *"siete
listas del repo"*. La medición: `function EstadoActivoAction` está definida en **6** archivos
(`modelo-equipo-list.tsx`, `unidad-medida-list.tsx`, `familia-insumo-list.tsx`,
`sector-list.tsx`, `prioridad-list.tsx`, `tipo-ticket-list.tsx`) y el patrón de toggle
`activo: !X.activo` tras `ConfirmDialog` aparece en **7** call sites, siendo el séptimo
`insumos/components/insumo-detail-view.tsx:170` — una **ficha de detalle**, no una lista. O
sea: 7 copias del patrón, 6 de ellas en listas. El razonamiento que sostiene la remediación
—`EstadoActivoAction` no es compartido, así que el test de unidades de medida no cubre esta
copia— es **correcto** y no depende del número. Solo el número está mal, y conviene corregir
el comentario al pasar por ese archivo.

**Sobre la duplicación como hallazgo propio**: la W1 de la ronda 1 mezclaba dos cosas. Una era
que *esta* copia estaba probada en una sola dirección — cerrada (§ 4.2). La otra es que el
patrón está duplicado en el repo. Esa segunda es **un hallazgo más amplio, preexistente, que
este ciclo no introdujo y no le corresponde resolver**: el ciclo siguió el molde que el repo
ya tenía, que es lo que ADR-1 le pidió hacer. Extraer `EstadoActivoAction` a un componente
compartido tocaría 6 archivos de 5 features ajenas a este cambio. Se deja constancia acá y no
se abre como advertencia de este ciclo.

---

## 10. Recomendación

**Apto para `sdd-archive`.** 0 CRITICAL y 0 blockers.

La W1 de la ronda 1 está cerrada con evidencia de mutación, no por declaración. La W2 queda
abierta a propósito y con fundamento: es un límite de alcance correctamente trazado, no un
defecto. Las cuatro SUGGESTION son precisiones de redacción y de nitidez de tests; ninguna
corresponde a código que esté mal.

Al archivar conviene arrastrar dos anotaciones para que no se relean como cobertura que no
existe: la autoridad backend del escenario de R3 (W2) y la mitad no renderizada del THEN de
R2 (S3).
