```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:30b6771d4635fcebe7c0ff1d6abd1ac7cc32db26902ac63a0c635e87f4b562cd
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 17/17
test_command: pnpm test (backend/ y frontend/)
test_exit_code: 0
test_output_hash: sha256:823fabffc1a298da0d49ee3e44a00e59ec988829e06b8a3b35c1d3a46db865cd
build_command: pnpm typecheck && pnpm lint (backend/), pnpm type-check && pnpm lint (frontend/)
build_exit_code: 0
build_output_hash: sha256:2c63e1dd609d4ba4927712a0c8fc15cd8403bd8e8b60ec92b8a75ee13cb53bf5
```

## Verification Report — RONDA 2

**Change**: logo-por-cliente
**Version**: specs/clientes-logo/spec.md — 8 requisitos, 17 escenarios
**Mode**: Standard (`strict_tdd: false`, tipo FEATURE; el orquestador no inyectó STRICT TDD MODE)
**Árbol verificado**: `feat/logo-por-cliente-dialogo` @ `bcee975`, tree `b24c72f`
**Supera a**: la ronda 1 sobre `fbef36d` / tree `1dc64f9` (`evidence_revision:
sha256:3137054c…`), cuyo veredicto **FAIL** queda **vencido** y no debe citarse
como estado del ciclo.

> **Por qué esto es una reescritura y no una adenda.** Entre rondas cambió el
> árbol: `git diff --stat fbef36d..HEAD` → 1 archivo, 82 inserciones. Un
> veredicto emitido sobre un árbol que ya no existe no puede sostenerse por
> anexo. Lo que sigue siendo cierto de la ronda 1 se conserva y se marca como
> tal; lo superado se nombra explícitamente.

### Resumen ejecutivo

**Los 2 CRITICAL de la ronda 1 están cerrados**, y lo están por la causa
correcta: el commit `bcee975` agrega las 5 aserciones sobre `GUARDS_METADATA`
que faltaban, sin tocar una sola línea de producción. Verifiqué el cierre por
mi cuenta con **7 mutantes aislados**, no por lectura del diff: cada una de las
cinco aserciones muere frente a la mutación que le corresponde, y ninguna se
apoya en otra.

Las cuatro compuertas se re-ejecutaron de forma independiente y reproducen las
cifras esperadas con aritmética exacta: backend 437 archivos / **5194** tests
(5189 de la ronda 1 **+ 5**, ni uno más), frontend 191 / 1435 sin cambios,
typecheck y lint en cero en los dos paquetes.

Quedan 4 WARNING y 5 SUGGESTION. Ninguno bloquea el archivado: tres de los
cuatro WARNING son de **exactitud del registro** en `apply-progress.md`, y el
cuarto es una brecha de cobertura declarada y acotada. El veredicto es **PASS
WITH WARNINGS**.

### Qué cambió desde la ronda 1

| Ítem de la ronda 1 | Estado en la ronda 2 |
|---|---|
| CRITICAL 1 — "ADMINISTRADOR intenta cargar → 403" sin test permanente | **CERRADO** |
| CRITICAL 2 — "Sin token → 401" sin test permanente | **CERRADO** |
| WARNING 1 — `apply-progress.md` cierra con 34/34 | **Sigue abierto** (el archivo no se tocó) |
| WARNING 2 — round-trip del mapper como unit, no como integración | **Sigue abierto, acotado** (ver juicio abajo) |
| WARNING 3 — round-trip autenticado end-to-end nunca ejecutado | **Sigue abierto** como brecha declarada |
| SUGGESTION 1–4 | **Siguen vigentes sin cambios** — los archivos que las originan son idénticos a los de la ronda 1 |
| Cifras de test 437/5189 y 191/1435 | **Superadas** por 437/**5194** y 191/1435 |
| `evidence_revision: sha256:3137054c…` | **Superado** por `sha256:30b6771d…` |

### Completeness

| Métrica | Valor |
|---|---|
| Tareas totales | 32 |
| Tareas completas | 32 |
| Tareas incompletas | 0 |

`gentle-ai sdd-status logo-por-cliente` reporta `taskProgress: 32/32`,
`allComplete: true`, `apply: all_done`, `verify: ready`. El conteo de casillas
de `tasks.md` coincide: 32 marcadas, 0 sin marcar.

**La tarea 2.5 pasa de nominal a sustantiva.** En la ronda 1 estaba marcada
`[x]` mientras dos de sus seis aserciones literales —"ADMINISTRADOR intenta
`POST` → 403" y "sin token → 401"— no existían en ningún archivo. El commit
`bcee975` las cubre por composición, que es la única lectura coherente de la
tarea: su propio enunciado dice "guards mockeados salvo el chequeo inline", y
con los guards mockeados el comportamiento del guard es intesteable en ese
spec. Lo que faltaba era la mitad que sí se puede fijar ahí: **el atachado**.

### Build & Tests Execution

Las cuatro compuertas se re-ejecutaron de forma independiente sobre `bcee975`.

**Build**: PASS

```text
backend/  pnpm typecheck  → exit 0   (tsc --noEmit -p tsconfig.typecheck.json)
backend/  pnpm lint       → exit 0   (eslint .)
frontend/ pnpm type-check → exit 0   (tsc --noEmit)
frontend/ pnpm lint       → exit 0   ("No ESLint warnings or errors")
```

**Tests**: PASS

```text
backend/  pnpm test → exit 0
  Test Files  437 passed (437)
       Tests  5194 passed (5194)
    Duration  518.03s

frontend/ pnpm test → exit 0
  Test Files  191 passed (191)
       Tests  1435 passed (1435)
    Duration  189.78s
```

**Aritmética contrastada.** Ronda 1: 5189. Commit `bcee975`: 5 tests nuevos.
5189 + 5 = **5194**, que es exactamente lo observado. El archivo de specs no se
movió (437 en ambas rondas) porque los 5 tests entraron en un archivo que ya
existía. El frontend no se tocó y repite 191/1435 al test.

Ejecución focalizada del archivo afectado:
`pnpm vitest run src/clientes/interface/controllers/cliente-logo.controller.spec.ts`
→ **15 tests, exit 0** (los 10 de WU2 más los 5 del backstop).

**Coverage**: no medida. `coverage_threshold: 0` en `openspec/config.yaml`.

**Derivación de los digests**, para que sean reproducibles:

```text
evidence_revision  = sha256( "$(git rev-parse HEAD^{tree})\n" )
                   = sha256( "b24c72f95c3ed32b28dc1a9d3d530a86f800fe70\n" )
test_output_hash   = sha256 de las dos líneas de resumen de test, una por paquete
build_output_hash  = sha256 de las dos líneas de resumen de build, una por paquete
```

**Fallas ambientales conocidas — descartadas como hallazgo.** El log del backend
vuelve a contener `ErrorEntornoInvalido` en `orden-de-arranque.spec.ts` y
`[e2e-forced-failure]` en `crear-cliente.e2e.spec.ts`. Ambas son intencionales y
están documentadas. La señal que manda es el resumen final: 437/437 archivos y
5194/5194 tests en verde, exit 0.

**Estado de migraciones**: `pnpm prisma migrate status --schema
prisma_master/schema.prisma` → *"29 migrations found. Database schema is up to
date!"*.

### Verificación adversarial (`rules.verify`)

**Método.** Copias mutantes aisladas del controller más una copia del spec
apuntada contra cada mutante. El control en el árbol de trabajo nunca se
debilitó; los 14 archivos temporales se borraron y `git status --porcelain`
quedó con la única entrada esperada (este mismo informe, sin trackear).

La pregunta que la ronda 2 tenía que responder es más fina que la de la ronda 1:
no alcanza con que "algo se ponga rojo". Hay que probar que **cada una** de las
cinco aserciones nuevas muerde por su cuenta, porque un backstop cuyas
aserciones se cubren entre sí da una falsa sensación de red.

| # | Mutante (copia aislada) | Mutación | Resultado |
|---|---|---|---|
| 1 | `mut-subir` | `GlobalAdminGuard` fuera del `@Post` | **ROJO** — 1 test: `subir (POST) declara…` · `expected [ JwtAuthGuard ] to deeply equal [ JwtAuthGuard, GlobalAdminGuard ]` |
| 2 | `mut-quitar` | `GlobalAdminGuard` fuera del `@Delete` | **ROJO** — 1 test: `quitar (DELETE) declara…` |
| 3 | `mut-ver` | `GlobalAdminGuard` **agregado de más** al `@Get` | **ROJO** — 1 test: `ver (GET) … NO declara GlobalAdminGuard` · `expected […] to not include GlobalAdminGuard` |
| 4 | `mut-clase` | `@UseGuards(JwtAuthGuard)` agregado a nivel de CLASE | **ROJO** — 1 test: `la clase NO declara guards…` |
| 5 | `mut-metodo` | cuarto método `huerfano()` **sin** `@UseGuards` | **ROJO** — 1 test: `ningún método … queda sin guards` |
| 6 | `mut-versin` | `@UseGuards` **eliminado por completo** del `@Get` | **ROJO** — 2 tests: `expected [] to include JwtAuthGuard` y `expected [ 'ver' ] to deeply equal []` |
| 7 | `mut-metguard` | cuarto método `huerfano()` **con** `@UseGuards` | **ROJO** — 1 test, por el ancla `toHaveLength(3)` |

**Lo que prueban los 7, leídos juntos:**

- **Separación limpia.** Los mutantes 1 a 5 matan **exactamente un** test cada
  uno, y en cada caso el que le corresponde. Ninguna aserción se está apoyando
  en otra; las cinco son independientes.
- **El `?? []` no es decorativo.** El mutante 6 es el caso que lo justifica:
  sin el decorador, `Reflect.getMetadata` devuelve `undefined`, y el comentario
  del spec advierte que `expect(undefined).toContain(x)` **pasa** en el Vitest
  de este repo. Con el `?? []`, `expect([]).toContain(JwtAuthGuard)` falla como
  debe. Las cinco aserciones llevan el `?? []`; verificado en el diff.
- **La red del quinto test es real, no solo un contador.** El mutante 6 la hace
  fallar por el filtro mismo (`expected [ 'ver' ] to deeply equal []`), no por
  el ancla de longitud.
- **El ancla `toHaveLength(3)` es además un tripwire de superficie** (mutante 7):
  agregar una cuarta ruta pone el test en rojo aunque venga con sus guards
  puestos. Es deliberado y correcto —obliga a revisar el bloque RBAC cuando el
  controller crece—, pero conviene saberlo antes de toparse con él. Queda como
  SUGGESTION 5, no como defecto.

Reconfirmación en verde tras borrar los 14 temporales: el spec real → **15
tests, exit 0**, y la suite completa del backend → 437/5194, exit 0.

Ninguna mutación fue bloqueada por el clasificador de seguridad, porque en
ningún momento existió un control debilitado en la ruta de producción.

### Cierre de los 2 CRITICAL de la ronda 1 — evidencia

La ronda 1 no marcó un defecto de comportamiento: los guards estaban puestos.
Marcó que **nada los fijaba**, y que por lo tanto dos escenarios de la spec no
tenían red. El cierre exige demostrar las dos mitades de la cadena, cada una
con un test que corrió y pasó.

| CRITICAL | Mitad 1 — el guard está enchufado a la ruta | Mitad 2 — el guard hace lo que dice | Cadena |
|---|---|---|---|
| 1 — ADMINISTRADOR → 403 | `cliente-logo.controller.spec.ts > subir (POST) declara JwtAuthGuard y GlobalAdminGuard` — `toEqual`, que además **fija el orden** | `global-admin.guard.spec.ts > is_global_admin=false (incl. rol ADMINISTRADOR — ortogonalidad) → ForbiddenException` | **Cerrada** |
| 2 — Sin token → 401 | `cliente-logo.controller.spec.ts > ver (GET) declara JwtAuthGuard` (y el par `subir`/`quitar`, que también lo declaran primero) | `jwt-auth.guard.spec.ts > sin header Authorization → UnauthorizedException` | **Cerrada** |

Tres precisiones que hacen que la composición se sostenga:

1. **El orden importa y está fijado.** `GlobalAdminGuard` lee
   `request.user.is_global_admin`, que solo existe porque `JwtAuthGuard` lo
   seteó antes. El `toEqual([JwtAuthGuard, GlobalAdminGuard])` fija la
   secuencia, no solo la presencia. Un `toContain` no habría cerrado esto.
2. **Los códigos son los correctos por diseño, no por casualidad.**
   `GlobalAdminGuard` lanza `ForbiddenException` (403) y `JwtAuthGuard` lanza
   `UnauthorizedException` (401) —nunca 403, con un ADR propio en su docstring
   porque el interceptor del frontend solo dispara el refresh ante un 401—.
   Ambos comportamientos tienen test unitario propio, ya en verde.
3. **La cobertura del `GET` es la inversa y también está fijada.** Si alguien
   agregara `GlobalAdminGuard` al `@Get`, el endpoint se volvería ROOT-only y
   ningún usuario del inquilino vería su propio logo. El `not.toContain` lo
   atrapa (mutante 3).

Lo que la composición **no** prueba, y queda anotado: que la excepción del
guard sobreviva la serialización HTTP de Nest hasta el cliente. Eso solo lo
cerraría un test de extremo a extremo, que es la brecha del WARNING 3.

### Los tres controles de seguridad del ciclo

| Control | Dónde | Veredicto ronda 2 |
|---|---|---|
| Rechazo de `image/svg+xml` | `validar-logo-cliente.ts:30` | **Sólido** (sin cambios desde la ronda 1). `Set` exacto de 3 valores, sin `startsWith`. Hermano de `validar-archivo-adjunto.ts`, no reuso |
| Aislamiento entre inquilinos | `cliente-logo.controller.ts:173` + `@UseGuards` | **Sólido y ahora fijado.** El `if` inline ya era sensible a la mutación en la ronda 1; lo que faltaba —el atachado del `JwtAuthGuard` que puebla `request.user`, del que ese `if` depende— quedó cubierto |
| Round-trip del mapper | `cliente.mapper.spec.ts` | **Sólido a nivel de mapeo.** Ver el juicio del WARNING 2 |

### Spec Compliance Matrix

| # | Requisito | Escenario | Test | Resultado |
|---|---|---|---|---|
| R1 | Aislamiento de lectura | Usuario de otro cliente pide el logo | `cliente-logo.controller.spec.ts > usuario del cliente A pide el logo del cliente B → 403` | COMPLIANT |
| R1 | Aislamiento de lectura | ROOT lee cualquier logo | `cliente-logo.controller.spec.ts > ROOT (is_global_admin) pide el logo de cualquier cliente → 200` | COMPLIANT |
| R1 | Aislamiento de lectura | Sin token → 401 | `cliente-logo.controller.spec.ts > ver (GET) declara JwtAuthGuard` + `jwt-auth.guard.spec.ts > sin header Authorization → UnauthorizedException` | COMPLIANT (compuesto) |
| R2 | Solo ROOT carga o quita | ADMINISTRADOR intenta cargar → 403 | `cliente-logo.controller.spec.ts > subir (POST) declara JwtAuthGuard y GlobalAdminGuard` + `global-admin.guard.spec.ts > is_global_admin=false → ForbiddenException` | COMPLIANT (compuesto) |
| R3 | Validación de formato y tamaño | Se rechaza un SVG | `validar-logo-cliente.spec.ts > rechaza image/svg+xml`; `cliente-logo.controller.spec.ts > rechaza un SVG ANTES de invocar el use case` | COMPLIANT |
| R3 | Validación de formato y tamaño | Archivo fuera de rango | `validar-logo-cliente.spec.ts > rechaza 0 bytes` y `> rechaza más de 512 KB` | COMPLIANT |
| R3 | Validación de formato y tamaño | Se acepta un archivo válido | `validar-logo-cliente.spec.ts > acepta image/png, image/jpeg e image/webp` | COMPLIANT |
| R4 | Servido seguro del binario | Cabeceras de una lectura exitosa | `cliente-logo.controller.spec.ts > usuario del cliente A pide el suyo → 200, con Content-Type/nosniff/inline` | PARTIAL |
| R5 | Persistencia frente a reemplazo | Reemplazo exitoso aunque falle el borrado | `configurar-logo-cliente.use-case.spec.ts > si el delete de la key anterior falla, la operación IGUAL reporta éxito` | COMPLIANT |
| R5 | Persistencia frente a edición | Editar datos comerciales conserva el logo | `cliente.mapper.spec.ts > PATCH de datos comerciales (editar()) no borra el logo tras el round-trip` | PARTIAL |
| R6 | Un logo por cliente | Cargar uno nuevo no deja segunda versión | `configurar-logo-cliente.use-case.spec.ts > borra la key anterior BEST-EFFORT tras reemplazar` | COMPLIANT |
| R6 | Borrado idempotente | Borrar el logo de un cliente que no tiene | `quitar-logo-cliente.use-case.spec.ts > es idempotente`; `cliente-logo.controller.spec.ts > quita el logo (con o sin logo previo) → 204` | COMPLIANT |
| R7 | Fallback al ícono genérico | Sin logo o falla la carga | `app-sidebar.test.tsx > sin el campo cliente_logo_v → Building2` y `> la carga del binario falla (401/404) → cae a Building2` | COMPLIANT |
| R7 | Fallback al ícono genérico | Sesión MASTER | `app-sidebar.test.tsx > sesión MASTER (cliente_id: null) → Building2` | COMPLIANT |
| R8 | Token de sesión | Token sin el campo de logo | `types.test.ts > token sin el campo → normaliza a null`; `app-sidebar.test.tsx > token pre-rollout → Building2` | COMPLIANT |
| R8 | Token de sesión | Cambiar de cliente actualiza sin recargar | `app-sidebar.test.tsx > cambiar de cliente (switch, sin recargar) actualiza el <img>` | COMPLIANT |
| R8 | Token de sesión | Quien sube el logo no lo ve de inmediato | (estructural: el `<img>` deriva solo de `cliente_logo_v`; el hook declara no tocar `SessionContext`) | PARTIAL |

**Compliance summary**: **17/17** escenarios con test permanente en verde
(ronda 1: 15/17). 0 UNTESTED. 3 de los 17 son PARTIAL, con el mismo criterio de
conteo de la ronda 1: un PARTIAL tiene test que corrió y pasó, pero cubre la
propiedad por un camino más angosto que el que describe el escenario.

**Sobre los dos COMPLIANT (compuesto).** Un escenario cubierto por dos tests
—uno que fija el atachado, otro que fija el comportamiento— es el modismo ya
establecido de este repositorio, usado en otros 23 specs. Se marca como
compuesto y no a secas para que quien lea sepa que no existe un único test
HTTP que ejercite el escenario de punta a punta; las dos mitades sí corrieron y
pasaron, y las dos son sensibles a la mutación.

### Correctness (evidencia estática + runtime)

| Requisito | Estado | Nota |
|---|---|---|
| Aislamiento de lectura | Implementado | Chequeo inline contra el `:id` de la ruta, más el `JwtAuthGuard` que lo alimenta, ahora fijado |
| Solo ROOT escribe | Implementado | `subir` y `quitar` declaran `[JwtAuthGuard, GlobalAdminGuard]` en ese orden, fijado por `toEqual` |
| Validación antes de guardar | Implementado | `validarLogoCliente(file)` en la primera línea de `subir()`, antes del use case; el test asserta que el use case no se llama |
| Servido seguro | Implementado | Los 3 headers se setean; el DTO de respuesta expone solo `logoUpdatedAt` |
| Persistencia ante edición | Implementado | Espejo completo en ambas direcciones del mapper; `save()` escribe la salida de `toPersistence` sin recortarla |
| Un logo + borrado idempotente | Implementado | Key nueva por subida; `QuitarLogo` sin logo previo reporta éxito sin tocar storage |
| Fallback del sidebar | Implementado | Contenedor `h-9 w-9` siempre presente; `key` en el `<img>` fuerza remount en el switch |
| Token de sesión | Implementado | `VERSION_PAYLOAD_JWT` sigue en 2 (D2); `cliente_logo_v` propagado desde login, switch y refresh |

### Coherence (Design)

| Decisión | ¿Cumplida? | Nota |
|---|---|---|
| D1 — controller nuevo, no `ClientesController` | Sí | `ClienteLogoController` sin `@UseGuards` de clase — ahora con test que lo fija (mutante 4) |
| D2 — no bumpear `VERSION_PAYLOAD_JWT` | Sí | `i-token.service.ts:9` sigue en `2` |
| D3 — `cliente_logo_v` como epoch ms \| null | Sí | `resolver-scope.ts:157` |
| D4 — espejo completo del mapper | Sí | Las 3 columnas en `toDomain` y en `toPersistence`; las 9 de SMTP siguen omitidas por el `Omit<>` de la firma |
| D5 — orden key nueva → upload → persistir → delete best-effort | Sí | `configurar-logo-cliente.use-case.ts:48-62` |
| D6 — `<img>` por el proxy + arreglo binario | Sí | `route.ts:93` usa `arrayBuffer()` |
| D7 — whitelist exacta + nosniff + inline | Sí | Verificado por mutación en la ronda 1 |
| D8 — storage key server-side `clientes/{id}/{uuid}` | Sí | `uuidv7()`; ningún byte del cliente entra en la ruta |
| Tabla "Autorización: los dos lugares" — decoradores del borde **y** chequeos inline | **Sí, desde `bcee975`** | En la ronda 1 solo el inline tenía test. Ahora los dos lugares |
| Estrategia de test: round-trip del mapper como **Integración** contra Postgres real | **No** | Se implementó como unit puro. Ver WARNING 2 |

### Juicio sobre el WARNING abierto: round-trip del mapper

La ronda 1 lo dejó planteado sin resolver. La consigna de la ronda 2 es
decidir: se cierra, se mantiene como brecha declarada, o escala. **Se mantiene
como brecha declarada, acotada por evidencia nueva. No escala.**

**Qué dice el diseño.** `design.md`, tabla "Estrategia de test", fila
*Integración*: "Round-trip del mapper: `PATCH /clientes/:id` de datos
comerciales **no** borra el logo — Postgres real, `usarLockMasterTest()` si
trunca master". Lo implementado es `cliente.mapper.spec.ts`, 5 tests unitarios
puros, sin Postgres. La desviación es un hecho, no una interpretación.

**Por qué no escala a CRITICAL.** Descompuse la propiedad en sus eslabones y
busqué cuál queda sin evidencia:

| Eslabón | Cómo está cubierto hoy |
|---|---|
| `toDomain` hidrata las 3 columnas al cargar la entidad | Test unitario en verde |
| `toPersistence` emite las 3 columnas al persistir | Test unitario en verde, más uno específico de "sin logo, las 3 viajan como null" |
| `save()` escribe lo que `toPersistence` devuelve, **sin recortar** | Estático: 5 líneas, sin una sola rama. `const data = ClienteMapper.toPersistence(cliente)` → `upsert({ create: data, update: updateData })`. No hay subconjunto de columnas en ningún lado |
| Los nombres de columna del mapper existen en el cliente Prisma | El tipo de retorno de `toPersistence` es un `Omit<>` sobre el input generado por Prisma: un nombre inventado **no compila**. `pnpm typecheck` → exit 0 |
| Las 3 columnas existen físicamente en `soporte_master` | Verificado: `\d clientes` las muestra (`logo_storage_key varchar(255)`, `logo_mime_type varchar(50)`, `logo_updated_at timestamptz`), las tres nullable y **sin default** |
| El `upsert` real contra Postgres conserva los valores | **Sin cubrir.** Es el único eslabón que el test unitario no toca |

El eslabón descubierto es angosto: haría falta un default de columna, un
trigger o una regla que pisara los valores en el `UPDATE`. Ninguno existe —la
salida de `\d clientes` muestra la columna `Default` vacía en las tres—. Por eso
el riesgo residual es bajo y el escenario R5 queda en **PARTIAL**, igual que en
la ronda 1, y no en UNTESTED.

**Por qué tampoco se cierra.** Dos razones, y la segunda pesa más que la
primera:

1. El eslabón sigue sin evidencia de runtime. "Bajo riesgo" no es "verificado",
   y esta fase no tiene licencia para convertir uno en el otro.
2. `apply-progress.md` afirma **"Ninguna deviation de diseño en el código"**.
   Esa frase es falsa para este ítem. Cerrar el WARNING dejaría en Git un
   artefacto de Nivel 1 que declara cero desviaciones mientras existe una, y el
   ciclo `logo-por-cliente` no es el lugar donde conviene estrenar esa
   costumbre.

**Recomendación** —como hallazgo, no como implementación; esta fase no escribe
código—: la salida barata es corregir `apply-progress.md` para que declare la
desviación con su justificación, lo que convierte una omisión en una decisión
registrada. La salida cara, y opcional, es un `*.integration.spec.ts` que cargue
un cliente con logo, le aplique `editar()` de datos comerciales, lo guarde y lo
relea contra `soporte_master_test` —con `usarLockMasterTest()` si trunca esa
base, según la regla del `CLAUDE.md` del repo—. Postgres está levantado y ambas
bases reportan schema al día, así que es factible hoy. Mi juicio es que la
primera alcanza para archivar y la segunda es una mejora, no un requisito.

### Desviaciones declaradas — juicio (sin cambios respecto de la ronda 1)

Las tres desviaciones que `apply-progress.md` documenta se verificaron contra el
árbol en la ronda 1 y **las tres se sostienen**. Los archivos que las originan
son idénticos en `bcee975`, así que el juicio se mantiene sin reverificación:

1. **`cliente_logo_v` opcional en el frontend, requerido en el backend.**
   Aceptada. El comportamiento observable es idéntico por la normalización
   `?? null` en `decodeJwtPayload`, que tiene test propio.
2. **Validación cliente-side sin Zod.** Aceptada. `validar-adjunto-cliente.ts`
   es el único precedente de espejo cliente-side de un pipe binario, y H3 pide
   reusar lo existente.
3. **Sin atributo `accept` en el `<input type="file">`.** Aceptada, y la más
   fuerte de las tres: `accept` es un filtro del selector nativo, no una
   validación, y ponerlo habría vuelto intesteable el caso adversarial de SVG
   que la spec exige cubrir.

### Issues Found

**CRITICAL**: Ninguno. Los 2 de la ronda 1 están cerrados con la evidencia de
arriba.

**WARNING**

1. **`apply-progress.md` cierra con un total equivocado (34/34).** Sus propios
   sumandos (9 + 8 + 9 + 6) dan **32**, igual que las casillas de `tasks.md` y
   que `sdd-status`. No afecta al código, pero es el número que un lector futuro
   citaría. *(Arrastrado de la ronda 1, sin cambios.)*

2. **El round-trip del mapper se implementó como unit puro, no como integración
   contra Postgres real, y `apply-progress.md` declara "Ninguna deviation de
   diseño en el código".** Ver el juicio completo arriba: se mantiene como
   brecha declarada; el eslabón sin cubrir es el `upsert` real, y es angosto.
   *(Arrastrado de la ronda 1, acotado con evidencia nueva.)*

3. **El round-trip autenticado end-to-end nunca se ejecutó, en ninguna work
   unit.** WU2, WU3 y WU4 lo reportan bloqueado por la misma causa: no hay
   credencial ROOT de prueba y la única cuenta `is_global_admin` es la real del
   dueño. La decisión de no adivinar una contraseña real fue la correcta. Queda
   anotado que ningún flujo HTTP autenticado —subir, leer, borrar— se probó
   jamás contra el servidor real. El cierre de los 2 CRITICAL **reduce** esta
   brecha pero no la elimina: ahora está probado que los guards están puestos y
   que hacen lo que dicen, no que su excepción sobreviva intacta la
   serialización HTTP de Nest. Un seed de usuario ROOT de test lo cerraría para
   siempre, si el dueño lo autoriza. *(Arrastrado de la ronda 1.)*

4. **`apply-progress.md` no registra el commit `bcee975` y sobredeclara la
   cobertura de WU2.** Su línea de harness de runtime afirma que "la
   autorización cross-tenant/ROOT/ADMINISTRADOR queda cubierta por las 13
   aserciones de `cliente-logo.controller.spec.ts` (2.5)". Dos cosas están
   desactualizadas ahí: las aserciones son 15, no 13, y **la parte
   ADMINISTRADOR no estaba entre las 13** —ese fue exactamente el CRITICAL 1 de
   la ronda 1—. Hoy la afirmación es cierta, pero solo gracias a un commit que
   el artefacto no menciona. Quien lea el ciclo archivado reconstruiría mal la
   historia. *(Nuevo en la ronda 2.)*

   Los WARNING 1, 2 y 4 comparten remedio: una sola pasada de corrección sobre
   `apply-progress.md`.

**SUGGESTION**

1. **Dos de los cinco tests del mapper están parcialmente enmascarados por el
   spread.** `round-trip completo` y `PATCH de datos comerciales` construyen la
   fila como `{ ...filaConLogo, ...persistido }`: si `toPersistence` dejara de
   emitir las columnas de logo, el spread previo las repondría. La propiedad
   queda igualmente anclada por `toPersistence() incluye las 3 columnas` y por
   `sin logo, las 3 columnas viajan como null`, que sí fallarían. *(Ronda 1.)*

2. **`alt=""` en el logo del sidebar.** Lo marca como decorativo, así que un
   lector de pantalla no anuncia en qué cliente está parado el usuario — que es,
   según `proposal.md`, la mitad del problema que el ciclo vino a resolver.
   `alt={user.cliente_nombre ?? ""}` daría la misma señal a quien no ve el logo.
   *(Ronda 1.)*

3. **Nada impide que el espejo cliente-side se desincronice del backend.** Los
   valores coinciden hoy. Al vivir en paquetes distintos no hay test posible que
   los compare, y el backend sigue siendo la capa que realmente rechaza, así que
   una deriva sería un problema de UX y no un agujero de seguridad. *(Ronda 1.)*

4. **El escenario "Cabeceras de una lectura exitosa" se verifica con un espía de
   `res`, no sobre la respuesta HTTP real.** Prueba que `setHeader` se llama, no
   que los headers sobrevivan al `@Res({ passthrough: true })` de Nest. Sigue el
   molde ya establecido por `equipos`/`tickets`, así que el riesgo es bajo.
   *(Ronda 1.)*

5. **El ancla `expect(metodos).toHaveLength(3)` convierte la red del backstop en
   un tripwire de superficie.** Verificado con el mutante 7: agregar una cuarta
   ruta al controller pone ese test en rojo **aunque venga con sus guards
   puestos**. Es el comportamiento deseado —obliga a pasar por el bloque RBAC
   cuando el controller crece—, pero quien agregue una ruta va a encontrarse con
   una falla que no describe su causa. Un mensaje explícito en el `toHaveLength`
   lo volvería autoexplicativo. *(Nuevo en la ronda 2.)*

### Lo que NO es hallazgo

Se descartaron explícitamente, por estar documentados y ser correctos:

- **Deuda de Ayuda.** La escritura de `backend/ayuda/*.md` está EN PAUSA desde
  el 2026-09-07 por decisión del dueño del repo. Lo que correspondía era
  **anotar la deuda**, y está anotada en el cuerpo del commit `fbef36d`. Tarea
  4.5 cumplida.
- `ErrorEntornoInvalido` en `orden-de-arranque.spec.ts` y
  `[e2e-forced-failure]` en `crear-cliente.e2e.spec.ts`: ambos intencionales.
- El `P3009` de `prisma migrate`: resuelto, ambas bases reportan schema al día.
- La desviación de mecanismo de la migración de WU1 (aplicada por `psql` en vez
  de `prisma migrate dev`): causada por el `P3009` preexistente, con el
  resultado especificado en el schema, y documentada.
- **Que `bcee975` no tenga una tarea propia en `tasks.md`.** Es una remediación
  de verificación, no una work unit nueva: cubre lo que la tarea 2.5 ya pedía
  literalmente. El conteo 32/32 sigue siendo el correcto. Lo que sí queda
  anotado es que el artefacto no lo registra (WARNING 4).

### Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 4 WARNING, 5 SUGGESTION.

Contraste con la ronda 1 (**FAIL** — 2 CRITICAL, 3 WARNING, 4 SUGGESTION): los
dos bloqueos están cerrados y verificados de forma independiente con 7 mutantes
aislados, cada aserción nueva muere por su cuenta, y las cuatro compuertas
reproducen la aritmética esperada al test (5189 + 5 = 5194). Los 4 WARNING no
bloquean el archivado: tres son de exactitud del registro en `apply-progress.md`
—corregibles en una sola pasada— y el cuarto es una brecha de cobertura
declarada, acotada a un eslabón sin default de columna ni trigger que la
comprometa. El ciclo está listo para `sdd-archive`.
