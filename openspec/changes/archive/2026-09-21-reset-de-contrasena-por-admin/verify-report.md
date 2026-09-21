```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:e4278d23433a2bac961ea543383980eaa6c0845249b10ed675d2c05cd436c944
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 10/10
scenarios: 14/14
test_command: (cd backend && pnpm test) && (cd frontend && pnpm test)
test_exit_code: 0
test_output_hash: sha256:c9667c9b9793b6afb804b1ced7c104451e01beb02a0bd5aa9a476be2d8fde1e9
build_command: (cd backend && pnpm lint && pnpm typecheck) && (cd frontend && pnpm lint && pnpm type-check)
build_exit_code: 0
build_output_hash: sha256:5ef5d0f49a5c7d71c81c51150ee9a51487c1a9305104fa48e44ecd380ccf5f29
```

## Verification Report

> ⚠️ **Este informe tiene DOS rondas. El estado vigente es el de la § 11.** Todo lo que
> sigue hasta la § 10 es la ronda 1, medida el 2026-09-18 sobre el árbol `e67d787`
> (HEAD `87fdb87`); su `evidence_revision` era `sha256:aa37cd59…97c14e`. La ronda 2
> (2026-09-21, árbol `1553d0f`, HEAD `4c5b859`) cerró W1 y W2 y es la que declara el
> frontmatter de arriba. Entre ambos árboles **no cambió una sola línea de producción**
> — por eso la ronda 2 es una adenda y no una reescritura (§ 11.1).

**Change**: `reset-de-contrasena-por-admin`
**Fecha**: 2026-09-18 · Rama `feat/reset-password-frontend`, HEAD `87fdb87`, árbol
`e67d787`. Árbol de trabajo limpio al abrir y al cerrar; el único elemento de
`git status --porcelain` es este informe, declarado como untracked previsto.
**Modo**: Standard (`strict_tdd: false`). Esta unidad de trabajo es una FEATURE, no una
corrección de defecto: no se exige tabla RED→GREEN→REFACTOR (§6.3 de
`~/proyectos/CLAUDE.md`). Lo que sí se verificó es que los tests viajen en el mismo
commit que su código — se cumple en los tres commits de implementación.
**Naturaleza**: verificación completa del ciclo (las tres unidades de trabajo están
apiladas en esta rama), **adversarial por mutación**: cada guard central se rompió
sobre código de producción, se corrió el spec focalizado, y se revirtió con verificación
por `git status --porcelain`.

---

## 1. Veredicto

**PASA CON ADVERTENCIAS** — 0 CRITICAL, 3 WARNING, 5 SUGGESTION.

Los diez requisitos están implementados y los guards centrales mueren bajo mutación por
la aserción correcta: el aislamiento multi-inquilino, la guarda de disponibilidad, el
`@UseGuards(AdminClienteGuard)` de la ruta nueva, el corte de la secuencia del diálogo y
la condición de campo vacío son todos discriminantes. Nada bloquea el archivado.

Lo que las advertencias señalan son tres piezas del contrato que **no pueden fallar** si
alguien las borra: el `@MinLength(8)` del DTO backend, el `@HttpCode(NO_CONTENT)` de la
ruta, y la segunda mitad del escenario de R1 ("el usuario puede loguearse con la
contraseña nueva"), que ningún test observa en ejecución.

---

## 2. Completitud

| Métrica | Valor |
|---|---|
| Tareas totales (`tasks.md`) | 28 |
| Tareas completas | 28 |
| Tareas incompletas | 0 |

Las 28 casillas están marcadas `[x]` y cada una corresponde a código presente en el
árbol. `apply-progress.md` declara WU-1 10/10, WU-2 8/8 y WU-3 10/10: coincide.

### Honestidad de alcance (verificado contra `git`)

| Afirmación del artefacto | Verificación | Resultado |
|---|---|---|
| WU-3 no tocó ningún archivo de `backend/` | `git diff-tree` del commit `87fdb87` | ✅ solo `frontend/` y artefactos de `openspec/` |
| `backend/scripts/reset-password.ts` sin cambios | `git diff --name-only main...HEAD` | ✅ ausente del diff |
| `AdminClienteGuard` no se reescribe | idem | ✅ ausente del diff |
| `toHttpException` sin tocar | diff de `usuarios.controller.ts` | ✅ ningún hunk alcanza `:138-151` |
| `backend/ayuda/*.md` sin cambios, deuda anotada | diff + `git log -1 --format=%B 87fdb87` | ✅ sin cambios; la deuda está en el cuerpo del commit |
| Suite backend 432/5157, frontend 188/1424 | re-ejecución independiente | ✅ cifras idénticas |

El ciclo tiene un cuarto commit, `e4c8257` (`test(auth)`), que no aparece en el plan de
tres unidades de `tasks.md`: es la corrección del test de metadata del guard, descrita en
§4. No introduce código de producción.

---

## 3. Build y tests

Las cuatro compuertas de los dos paquetes, ejecutadas en WSL sobre el árbol `e67d787`
con `soporte-postgres-master` levantado.

**Build**: ✅ Pasa

```text
backend/  pnpm lint       → eslint .                                   exit 0, sin salida
backend/  pnpm typecheck  → tsc --noEmit -p tsconfig.typecheck.json    exit 0, sin salida
frontend/ pnpm lint       → next lint    → "No ESLint warnings or errors"  exit 0
frontend/ pnpm type-check → tsc --noEmit                              exit 0, sin salida
```

**Tests**: ✅ 6581 pasados / 0 fallidos / 0 omitidos

```text
backend/  pnpm test  →  Test Files  432 passed (432)
                        Tests      5157 passed (5157)
                        Duration   592.05s                              exit 0

frontend/ pnpm test  →  Test Files  188 passed (188)
                        Tests      1424 passed (1424)
                        Duration   205.86s                              exit 0
```

Las cifras coinciden exactamente con las que `apply-progress.md` declara al cierre de
WU-2 y WU-3. `orden-de-arranque.spec.ts` imprime fixtures de entorno fail-fast a mitad de
la corrida: es intencional y la suite igual sale con 0.

**Cobertura**: ➖ No medida. `coverage_threshold: 0` en `openspec/config.yaml` no la exige,
y la verificación de este ciclo se apoya en mutación dirigida, que es evidencia más
fuerte que un porcentaje agregado.

**Condición de entorno, no hallazgo**: GitHub Actions está bloqueado en esta cuenta por
agotamiento de los 2000 minutos mensuales del plan Free (documentado por el dueño en
`cb0bfdc`). CI figura en rojo sin haber corrido nunca. La verificación local es la
evidencia de registro.

---

## 4. Mutación adversarial (`rules.verify`)

`openspec/config.yaml` exige mutar al menos un guard central, confirmar rojo, revertir y
reconfirmar verde. Se ejecutaron siete mutaciones sobre código de producción. Cada una se
revirtió con `git checkout --` y se verificó el árbol con `git status --porcelain` antes
de la siguiente.

| # | Mutación | Archivo:línea | Resultado | Test que murió |
|---|---|---|---|---|
| B1 | `if (!membresia)` nunca dispara | `resetear-password-usuario-tenant.use-case.ts:82` | 🔴 1 de 13 | `use-case.spec.ts:167` — "usuario con membresía activa en el cliente B…", por `expect(usuarioRepo.findById).not.toHaveBeenCalled()` |
| B2 | `if (!usuario.activo \|\| usuario.isDeleted())` nunca dispara | `…use-case.ts:91` | 🔴 2 de 13 | `use-case.spec.ts:214` y `:232` — cuenta inactiva y soft-deleted |
| B3 | borrar `@UseGuards(AdminClienteGuard)` de `@Patch(':id/password')` | `usuarios.controller.ts:301` | 🔴 1 de 29 | `usuarios.controller.spec.ts:339` — `expected [] to include [Function AdminClienteGuard]` |
| B4 | borrar `@MinLength(8)` de `ResetearPasswordUsuarioDto` | `usuario-tenant.dto.ts:114` | 🟢 **47 archivos / 672 tests siguen en verde** | **ninguno** → WARNING W1 — ⚠️ **VENCIDO, ver § 11.3**: en ronda 2 mueren 2 de 3 |
| B5 | borrar `@HttpCode(HttpStatus.NO_CONTENT)` de la ruta | `usuarios.controller.ts:302` | 🟢 **47 archivos / 672 tests siguen en verde** | **ninguno** → WARNING W2 — ⚠️ **VENCIDO, ver § 11.4**: en ronda 2 muere 1 de 30 |
| F1 | borrar el `return;` que sigue al `catch` de identidad | `editar-usuario-dialog.tsx:85` | 🔴 1 de 37 | `editar-usuario-dialog.test.tsx:140` — `expect(passwordCalls).toBe(0)`, recibido 1 |
| F2 | forzar `quierePassword = true` | `editar-usuario-dialog.tsx:72` | 🔴 1 de 37 | `editar-usuario-dialog.test.tsx:209` — el caso de campo vacío |

Las cinco mutaciones que el orquestador reportó como discriminantes (B1, B2, B3, F1, F2)
se **reprodujeron y se confirman**, cada una matando exactamente los tests que se
anticipaban, ni más ni menos. B4 y B5 son mutaciones adicionales de esta fase y son las
que descubren W1 y W2.

**Reconfirmación en verde tras revertir**: `use-case.spec.ts` + `usuarios.controller.spec.ts`
+ `tipos-componente.controller.spec.ts` → 3 archivos / 57 tests en verde;
`frontend/src/features/usuarios` → 5 archivos / 37 tests en verde;
`git status --porcelain` vacío.

### Auditoría de `Reflect.getMetadata` + `toContain` (pedida en el lanzamiento)

El test de metadata del guard de esta ruta **no fallaba** en su primera versión, porque
`expect(undefined).toContain(x)` PASA en este Vitest; se corrigió en `e4c8257` adoptando
el modismo `(getMetadata(...) ?? [])` que el repo ya usaba. B3 confirma que la versión
corregida sí muere.

Se auditaron las 87 ocurrencias de `Reflect.getMetadata` en specs de `backend/src`. El
resultado: la enorme mayoría es segura, o porque usa `?? []`, o porque asierta con
`toEqual([...])`, que **sí** falla contra `undefined`. Sobrevive **un** caso con la forma
tóxica, y se verificó por mutación (ver SUGGESTION S1).

---

## 5. Matriz de cumplimiento del spec

`specs/usuarios-reset-password/spec.md` — **10 requisitos, 14 escenarios** (contados
sobre los encabezados `### Requirement:` y `#### Scenario:` del archivo).

| Req | Escenario | Implementación | Test | Resultado |
|---|---|---|---|---|
| R1 | ADMINISTRADOR resetea en su tenant | `resetear-password-usuario-tenant.use-case.ts:95-96`; `usuario.entity.ts:191-193`; wiring `auth.module.ts:296-319` | `use-case.spec.ts:130` y `:251` | ✅ COMPLIANT (ver W3) |
| R1 | ROOT resetea en el cliente B | `…use-case.ts:78-96` | `use-case.spec.ts:147` | ✅ COMPLIANT (ver W3) |
| R2 | Membresía en otro tenant = mismo error que inexistente | `…use-case.ts:78-84` | `use-case.spec.ts:167` (muere con B1) | ✅ COMPLIANT |
| R2 | Usuario inexistente = mismo error | `…use-case.ts:86-89` | `use-case.spec.ts:182` y `:196` | ✅ COMPLIANT |
| R3 | TECNICO sin `esAdminDeCliente` → 403 | `usuarios.controller.ts:300-302` | `usuarios.controller.spec.ts:339` (muere con B3) + `:359` (guard real) | ✅ COMPLIANT |
| R3 | SOLICITANTE sin `esAdminDeCliente` → 403 | idem | `usuarios.controller.spec.ts:339` + `:370` | ✅ COMPLIANT |
| R4 | ADMINISTRADOR resetea a otro ADMINISTRADOR | ausencia deliberada de chequeo extra en `…use-case.ts` | `use-case.spec.ts:312` | ✅ COMPLIANT |
| R4 | ADMINISTRADOR resetea su propia contraseña | idem | `use-case.spec.ts:326` | ✅ COMPLIANT (ver S3) |
| R5 | Campo vacío deja la contraseña intacta | `editar-usuario-dialog.tsx:72, 89-93` | `editar-usuario-dialog.test.tsx:184` (muere con F2) | ✅ COMPLIANT |
| R6 | Contraseña de menos de 8 se rechaza | `schemas.ts:69-73` (cliente); `usuario-tenant.dto.ts:113-115` (servidor) | `schemas.test.ts:105` y `:115` | ✅ COMPLIANT (ver W1) |
| R7 | Reset exitoso revoca las sesiones | `…use-case.ts:96-99` | `use-case.spec.ts:272` (orden `['save','revoke']`) | ✅ COMPLIANT |
| R8 | La revocación falla y la operación igual reporta éxito | `…use-case.ts:98-105` | `use-case.spec.ts:293` y `:345` | ✅ COMPLIANT |
| R9 | Cuenta global no disponible se rechaza | `…use-case.ts:91-93`; 422 vía `usuarios.controller.ts:315` | `use-case.spec.ts:214` y `:232` (mueren con B2); `usuarios.controller.spec.ts:411` | ✅ COMPLIANT |
| R10 | Ninguna superficie observable contiene el plaintext | `…use-case.ts:101-104`; `usuarios.controller.ts:302, 307` | `use-case.spec.ts:345`; `usuarios.controller.spec.ts:423` | ✅ COMPLIANT (ver W2) |

**Resumen de cumplimiento**: 14/14 escenarios COMPLIANT, 0 PARTIAL, 0 UNTESTED, 0 FAILING.
Requisitos completos: 10/10.

**Por qué R1 cuenta como COMPLIANT pese a W3.** Sus dos escenarios cierran con "AND el
usuario puede loguearse con la contraseña nueva", y ningún test hace un login. Se cuentan
igual como cumplidos porque el propio texto normativo de R1 define el mecanismo que
produce esa consecuencia — "hashear ÚNICAMENTE vía `UsuarioEntity.hashPassword()`, la
misma instancia de `IHashProvider` que el login usa para verificar" — y ese mecanismo sí
tiene test en ejecución (`use-case.spec.ts:251-268`, con `verify` como `unstubbed`), más
la verificación del wiring de §6.3. La cláusula se satisface por composición de reglas
probadas, no por observación directa. W3 registra exactamente esa diferencia de fuerza de
evidencia; no es un escenario sin cubrir.

---

## 6. Los cuatro controles nominados en el lanzamiento

### 6.1 El plaintext nunca escapa

Se recorrieron las cuatro superficies observables.

| Superficie | Evidencia |
|---|---|
| Cuerpo de la respuesta | `resetearPassword()` declara `Promise<void>` y no retorna nada (`usuarios.controller.ts:307-317`). No existe DTO de respuesta que alguien pueda ampliar (ADR-1) |
| Mensajes de error de dominio | `MembresiaNoEncontradaError` y `UsuarioNoDisponibleError` construyen cadenas fijas sin parámetros (`auth.errors.ts:160-162` y `:218-220`) |
| Mensaje de error de validación | La plantilla de `@MinLength` de class-validator es `'$property must be longer than or equal to $constraint1 characters'` — verificada en `node_modules`, **no interpola `$value`** |
| Log | El único `logger.error` del camino nuevo interpola `usuarioId` y `error.message`, nunca `input.password` (`…use-case.ts:101-104`); test explícito en `use-case.spec.ts:345-360` |
| Filtro global | `PrismaExceptionFilter` loguea `method`, `url` y la última línea del mensaje de Prisma (`prisma-exception.filter.ts:166-170`) — la contraseña viaja en el body, no en la URL |
| Frontend | `mensajeDeError()` solo lee `ApiError.messages` (`editar-usuario-dialog.tsx:45-48`); `repetirPassword` nunca sale del cliente (`types.ts:61-63`, `schemas.ts:46`) |

No se encontró ninguna ruta por la que el plaintext alcance un log, un mensaje de error o
un cuerpo de respuesta.

### 6.2 `clienteId` sale únicamente del JWT

`usuarios.controller.ts:309` — `clienteId: actor.cliente_id as string`. `ResetearPasswordUsuarioDto`
**no declara** `clienteId` (`usuario-tenant.dto.ts:112-116`) y el `ValidationPipe` global
lleva `whitelist: true` (`app.module.ts:70-72`), así que lo descartaría si llegara. El
test `usuarios.controller.spec.ts:381-397` cuela un valor por el body y verifica que el
caso de uso recibe el del token. ✅

### 6.3 El hash pasa solo por `usuario.hashPassword()`

`…use-case.ts:95` es la única escritura de credencial del camino nuevo, y delega en
`usuario.entity.ts:191-193`, que llama a `hashProvider.hash()`. **No hay ningún `import`
de `argon2`** en el código nuevo — la única aparición de esa cadena en el caso de uso es
la prohibición escrita en su JSDoc (`:61`). El provider inyecta el token `HASH_PROVIDER`
(`auth.module.ts:315`), el mismo que recibe `LoginUseCase` (`:157`), ligado una sola vez a
`Argon2HashProvider` (`:127`). El test `use-case.spec.ts:251-268` deja `verify` como
`unstubbed`: si el caso de uso llamara cualquier otro método de esa instancia, explota en
vez de pasar en silencio. ✅

### 6.4 El fallo de revocación no hace fallar la respuesta

`…use-case.ts:98-105`: `try/catch` que captura, loguea y sigue; `Result.ok` se devuelve
igual (`:107`). El orden `save()` → `revoke()` está probado sin timers
(`use-case.spec.ts:272-291`) y el fallo degradado en `:293-308`. ✅

---

## 7. Coherencia con el diseño

| ADR | ¿Se siguió? | Notas |
|---|---|---|
| ADR-1 — `PATCH /usuarios/:id/password`, 204 sin cuerpo | ✅ Sí | Ruta, guard por método y `@HttpCode` presentes. `toHttpException` se reutilizó sin tocarlo: 404 por la rama existente, 422 por el fallthrough. El `204` en sí no tiene test (W2) |
| ADR-2 — qué toma de cada precedente | ✅ Sí | Constructor con los cinco `Pick`/puertos exactos que el diseño fija; no hay `verifyPassword` ni comparación contra el hash almacenado |
| ADR-3 — dos mutaciones secuenciales con corte | ✅ Sí | `editar-usuario-dialog.tsx:70-106` implementa la secuencia, el corte, el cierre condicional y los tres desenlaces. F1 y F2 confirman que el corte y la condición de campo vacío son discriminantes |
| ADR-4 — revocación silenciosa hacia afuera, ruidosa hacia el log | ✅ Sí | `…use-case.ts:98-105` |
| ADR-5 — se rechaza sobre cuenta inactiva o soft-deleted | ✅ Sí | `…use-case.ts:91-93`, después de confirmar la membresía, como el diseño exige para no filtrar existencia |
| ADR-6 — campo con confirmación, no `.optional()` | ✅ Sí | `schemas.ts:53-81`; `password`/`repetirPassword` son `z.string()` planos y el `superRefine` corta en cadena vacía |

Las dos Open Questions que `design.md:432-440` dejó para el orquestador quedaron
resueltas: la guarda de disponibilidad de ADR-5 **sí** fue absorbida por el spec (es R9),
y el comportamiento de campo vacío **sí** está redactado como propiedad del cliente (R5),
que es como la implementación lo satisface. No hay divergencia diseño↔spec.

**Desvíos declarados en `apply-progress.md`, revisados**: la duplicación local de
`mensajeDeError()` en vez de tocar `shared/lib/toast.ts` sigue el precedente de
`use-login.ts` y evita modificar un módulo con 30+ consumidores fuera de alcance. Es
razonable y está documentada. La decisión de probar el guard por metadata en vez de por
e2e también está justificada y, tras `e4c8257`, es discriminante.

---

## 8. Hallazgos

### CRITICAL

Ninguno.

### WARNING

**W1 — El `@MinLength(8)` del DTO backend no tiene ningún test que pueda fallar.**
> ✅ **CERRADA en la ronda 2** por el commit `4c5b859`, con mutación re-corrida y medida
> el 2026-09-21. Lo que sigue es el diagnóstico de la ronda 1, que se conserva como
> registro histórico de *por qué* se abrió. Ver § 11.3 para la evidencia del cierre.

Mutación B4: se borró `@MinLength(8)` de `ResetearPasswordUsuarioDto`
(`usuario-tenant.dto.ts:114`) y los 47 archivos / 672 tests de `src/auth` siguieron en
verde. El agravante es que `rules.specs` de `openspec/config.yaml` exige declarar la
fuente única y derivar las demás de ella: este `@MinLength(8)` **es** esa fuente — así lo
dicen `design.md:34` y el JSDoc de `schemas.ts:47-49` —, y hoy la derivada (el schema Zod
del frontend) tiene tres tests mientras la autoridad no tiene ninguno. El archivo
`usuario-tenant.dto.spec.ts` ya existe y valida otros DTOs del mismo módulo con
`class-validator`: al DTO nuevo simplemente no se lo agregó. Consecuencia práctica:
cualquier cliente que no sea este diálogo puede fijar una contraseña de un carácter sin
que ningún test lo note.

**W2 — El `@HttpCode(HttpStatus.NO_CONTENT)` tampoco tiene un test que pueda fallar.**
> ✅ **CERRADA en la ronda 2** por el commit `4c5b859`, con mutación re-corrida y medida
> el 2026-09-21. Lo que sigue es el diagnóstico de la ronda 1. Ver § 11.4.

Mutación B5: se borró el decorador (`usuarios.controller.ts:302`) y los mismos 672 tests
siguieron en verde. El test se llama `[R10] la respuesta 204 no lleva cuerpo`
(`usuarios.controller.spec.ts:423-433`) pero lo único que asierta es
`expect(result).toBeUndefined()`, que es el tipo de retorno `Promise<void>`, no el código
de estado. Sin el decorador, Nest responde **200** con cuerpo vacío.

Alcance real: R10 **no se rompe**, porque la garantía de que no vuelve cuerpo la da el
`Promise<void>` y la ausencia de DTO de respuesta, no el `@HttpCode`. Lo que queda sin
verificar es el contrato HTTP que ADR-1 llama "garantía estructural" y que
`design.md:349` publica como `204 No Content`, del que dependen `apiFetch<void>`
(`use-usuarios-tenant-mutations.ts:90`) y el handler de MSW del test de desenlace 1
(`editar-usuario-dialog.test.tsx:80`). Es un nombre de test que promete más de lo que
prueba.

**W3 — "El usuario puede loguearse con la contraseña nueva" (R1) no se observa en
ejecución.** Los dos escenarios de R1 cierran con esa cláusula y ningún test del ciclo
hace un login. La prueba que existe es estructural y es sólida: mismo token
`HASH_PROVIDER` para el reset y para el login, ligado una sola vez a `Argon2HashProvider`,
y hash únicamente vía `usuario.hashPassword()`. El diseño excluyó explícitamente los tests
de integración y e2e (`design.md:383`), así que esto es una brecha **declarada**, no un
desvío.

Se deja igual como advertencia por una razón concreta: es exactamente la clase de
incidente que el proposal invoca como motivo del ciclo — `scripts/reset-password.ts:6-19`,
"éxito reportado, usuario afuera" —, y ese incidente ocurrió precisamente porque nadie
verificó el login contra el hash escrito. La propiedad que más caro costó en este repo es
la única que el ciclo prueba por composición y no por observación.

### SUGGESTION

**S1 — Deuda ajena confirmada por medición: hay un test de guard, fuera de este ciclo,
que no puede fallar.** `tipos-componente.controller.spec.ts:56-62` lee la metadata de
`GUARDS_METADATA` **sin** el `?? []` y asierta con `toContain`. Medido: se borró
`@UseGuards(GlobalAdminGuard)` de `@Post()` de `TiposComponenteController`
(`tipos-componente.controller.ts:90`) y los 15 tests del archivo siguieron en verde. Es
un endpoint ROOT-only cuyo test de autorización es decorativo. Se revirtió.

Es el único superviviente de las 87 ocurrencias de `Reflect.getMetadata` auditadas en
`backend/src`: el resto usa `?? []` o asierta con `toEqual([...])`, que sí falla contra
`undefined`. Está **fuera del alcance de este ciclo** y no lo bloquea; se registra como
seguimiento, con la corrección ya conocida (el modismo de `e4c8257`).

**S2 — El aislamiento multi-inquilino descansa en una sola aserción de un solo test.**
Bajo B1, el escenario 2 de R2 (`use-case.spec.ts:182-194`) sigue en verde, porque al
quedar sin membresía el mock de `findById` devuelve `undefined` y la rama defensiva
produce el mismo error. Quien mata la mutación es `expect(usuarioRepo.findById).not.toHaveBeenCalled()`
en `:178`. No es un defecto — ese escenario trata sobre la igualdad del error, no sobre el
aislamiento — pero conviene saber que borrar esa única línea dejaría el guard central del
producto sin cobertura efectiva.

**S3 — El escenario de auto-reset de R4 es indistinguible del anterior.** El caso de uso
nunca recibe el id del actor, así que `use-case.spec.ts:326-341` emite exactamente la
misma llamada que `:312-324`. El propio test lo admite en su comentario. Para un requisito
negativo ("no se agrega restricción") la forma es defendible, pero el segundo test no
aporta información que el primero no dé.

**S4 — El JSDoc de `UsuarioNoDisponibleError` quedó incompleto.**
`auth.errors.ts:213` sigue afirmando "→ HTTP 403 en la capa de presentación" como mapeo
único. Desde WU-2 ese mismo error también se traduce a **422** en
`PATCH /usuarios/:id/password`, por el fallthrough de `toHttpException` — decisión
deliberada y documentada en ADR-1. Sin impacto en comportamiento; es documentación que
ahora dice menos de lo que el error hace.

**S5 — El diálogo reporta éxito cuando no hizo nada.** Si el admin abre `EditarUsuarioDialog`,
no cambia `nombre` ni `apellido` y deja la contraseña vacía, `submit()` no emite ninguna
petición HTTP y aun así muestra `"Usuario actualizado."` y cierra
(`editar-usuario-dialog.tsx:71-93`). Es inocuo, pero es la misma forma — éxito reportado
sobre una operación que no ocurrió — contra la que ADR-3 construye toda su tabla de
desenlaces.

---

## 9. Qué haría falta para cerrar las advertencias

> **Estado tras la ronda 2**: W1 y W2 se cerraron ejecutando exactamente los dos
> primeros puntos de esta lista. W3 sigue abierta y se resolvió por la vía barata que el
> tercer punto propone. Ver § 11.

Ninguna bloquea el archivado. Si se quisieran cerrar, el costo es bajo y acotado:

- **W1** ✅ *hecho en `4c5b859`*: agregar un `describe` para `ResetearPasswordUsuarioDto` en el
  `usuario-tenant.dto.spec.ts` que ya existe — 7 caracteres rechaza, 8 acepta. Es el mismo
  molde que el archivo ya usa para los otros DTOs.
- **W2** ✅ *hecho en `4c5b859`*: asertar la metadata de `@HttpCode` sobre `UsuariosController.prototype.resetearPassword`,
  con el modismo `?? []` que `e4c8257` dejó establecido en el mismo archivo.
- **W3**: es la única cara: exigiría un test de integración o e2e que el diseño excluyó
  con argumento. Alternativa más barata y honesta: dejarlo registrado como propiedad
  verificada por composición, no por observación, y no pretender lo contrario en el
  nombre de ningún test.

---

## 10. Verdicto final

**PASS WITH WARNINGS** — la implementación cumple los diez requisitos del spec y los seis
ADRs del diseño; los cinco guards centrales mueren bajo mutación por la aserción correcta;
las 28 tareas están completas y coinciden con el estado del código; las cuatro compuertas
de los dos paquetes están en verde con las cifras que los artefactos declaran. Las tres
advertencias son piezas de contrato sin test que pueda fallar, ninguna de las cuales
invalida un requisito.

> **Este veredicto es el de la ronda 1.** Sigue siendo válido en su sustancia — ninguna
> advertencia invalidaba un requisito entonces y ninguna lo invalida ahora — pero el
> recuento cambió: de las tres advertencias, dos quedaron cerradas. El veredicto vigente
> es el de § 11.7.

---

## 11. RONDA 2 — cierre de W1 y W2 (2026-09-21)

```yaml
schema: gentle-ai.verify-result/v1
ronda: 2
evidence_revision: sha256:e4278d23433a2bac961ea543383980eaa6c0845249b10ed675d2c05cd436c944
revision_git: 4c5b8591444f4c645b72d7a3af25bc2aa7ea19dd
arbol_git: 1553d0f306f913838f3be7f1d63d62ad11f32a5d
rama: feat/reset-password-frontend
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
warnings_cerradas: 2
warnings_abiertas: 1
suggestions_abiertas: 5
requirements: 10/10
scenarios: 14/14
test_exit_code: 0
build_exit_code: 0
```

### 11.1 Por qué esta ronda es una adenda y no una reverificación completa

Entre el árbol que verificó la ronda 1 (`e67d787`, HEAD `87fdb87`) y el de esta ronda
(`1553d0f`, HEAD `4c5b859`) el diff es este, completo:

```
backend/src/auth/interface/controllers/usuarios.controller.spec.ts
backend/src/auth/interface/dtos/usuario-tenant.dto.spec.ts
```

**Cero archivos de producción.** Medido con `git diff --name-only 87fdb87 4c5b859`
filtrando los `*.spec.ts`: el resultado es vacío.

De ahí se sigue el alcance de esta ronda, y también su límite. Las mutaciones B1, B2, B3,
F1 y F2 midieron código que hoy es **byte-idéntico**, así que su evidencia se hereda sin
re-correrla: re-medir un árbol sin cambios no produce información, produce ceremonia. Lo
único que cambió de significado es B4 y B5 —las dos mutaciones que *no* mataban nada— y
ésas se re-corrieron enteras, en producción, midiendo el resultado. La matriz de
cumplimiento, la honestidad de alcance y la coherencia con el diseño de la ronda 1 no se
tocan por la misma razón.

El precedente del repo para una remediación es reescribir el informe entero como RONDA 2
(ver el ciclo `modelos-equipo-catalogo-y-compatibilidad`). Ahí correspondía: la
remediación tocaba producción y hubo que juzgar si el test nuevo probaba lo que su commit
afirmaba. Acá no hay producción que rejuzgar.

### 11.2 Compuertas re-ejecutadas sobre `4c5b859`

Las cuatro, completas, no incrementales:

| Compuerta | Comando | Resultado |
|---|---|---|
| Tests backend | `cd backend && pnpm test` | ✅ **432 archivos / 5161 tests**, exit 0 |
| Lint backend | `cd backend && pnpm lint` | ✅ exit 0, sin salida |
| Typecheck backend | `cd backend && pnpm typecheck` | ✅ exit 0, sin salida |
| Tests frontend | `cd frontend && pnpm test` | ✅ **188 archivos / 1424 tests**, exit 0 |

**Continuidad aritmética contra la ronda 1**: backend 5157 → **5161**, exactamente **+4
tests**, que son los cuatro que `4c5b859` agrega (tres al spec de DTOs, uno al del
controller). Ni uno de más: la cifra descarta que se haya colado trabajo no declarado.
Frontend queda en 1424, idéntico — el commit no lo toca.

**Advertencia para quien re-ejecute esto.** La salida de `pnpm test` del backend imprime
un bloque `⎯⎯ Failed Suites 1 ⎯⎯` con `FAIL orden-de-arranque.spec.ts` y trazas de
`ErrorEntornoInvalido`. **No es un fallo.** `test/entorno-corte-arranque.spec.ts` lanza un
proceso Vitest hijo con `execFileSync` sobre `test/fixtures/entorno/`, borrando a
propósito una variable de entorno requerida, para probar que el guard corta el arranque
antes de que el marcador imprima. El hijo DEBE fallar; su stdout se filtra a la terminal
del padre. La señal que manda es el conteo final —`432 passed (432)`, sin línea de
`failed`— y el exit code.

### 11.3 B4 re-corrida: W1 queda CERRADA

Mutación aplicada sobre producción: se borró `@MinLength(8)` de
`ResetearPasswordUsuarioDto` (`usuario-tenant.dto.ts:114`), dejando `@IsString()`.

```
Tests  2 failed | 9 passed (11)
```

| Test | Línea | Bajo mutación |
|---|---|---|
| `rechaza una contraseña de 7 caracteres` | `usuario-tenant.dto.spec.ts:142` | 🔴 **muere** — `expected [] to have a length of 1` |
| `rechaza una contraseña vacía` | `:149` | 🔴 **muere** — `expected [] to not have a length of +0` |
| `acepta una contraseña en el límite exacto de 8` | `:135` | 🟢 sobrevive |

**El sobreviviente no es un defecto, y conviene decir por qué** — es justo la clase de
detalle donde un informe se vuelve complaciente. `acepta el límite exacto de 8` es el caso
**positivo**: quitar una restricción no puede hacer que una entrada válida deje de
aceptarse. Ese test no existe para morir bajo B4, existe para fijar el borde por arriba y
atrapar la mutación inversa (subir el mínimo a 9). Los dos tests que sí tienen que morir
bajo B4, mueren.

Contraste con el estado de la ronda 1, que es lo que cierra la advertencia: la misma
mutación dejaba **47 archivos / 672 tests en verde, sin un solo muerto**.

### 11.4 B5 re-corrida: W2 queda CERRADA

Mutación aplicada sobre producción: se borró `@HttpCode(HttpStatus.NO_CONTENT)` de
`@Patch(':id/password')` (`usuarios.controller.ts:302`).

```
Tests  1 failed | 29 passed (30)
```

El muerto es el test nuevo, `[R10] la ruta declara 204 explícitamente, no el 200 por
defecto de Nest` (`usuarios.controller.spec.ts:436`):

```
AssertionError: expected undefined to be 204 // Object.is equality
- Expected: 204
+ Received: undefined
```

**Lo decisivo es contra qué falla**: `undefined`. Sin el decorador, `Reflect.getMetadata`
devuelve `undefined`, y `toBe` lo rechaza. Ése es exactamente el modismo que el bugfix de
`e4c8257` estableció en este repo tras descubrir que `expect(undefined).toContain(x)`
**pasa** en este Vitest — la trampa que dejó sin dientes al test del guard y que sigue
viva, fuera de este ciclo, en `tipos-componente.controller.spec.ts` (ver S1). El test
nuevo no repite la trampa.

Contraste con la ronda 1: la misma mutación dejaba los 29 tests del controller en verde y
Nest respondía 200 con cuerpo vacío.

### 11.5 Reversión y árbol limpio

Las dos mutaciones se aplicaron de a una, nunca simultáneas, y se revirtieron con
`git checkout --` sobre el archivo. Verificación de la reversión, no declaración:

- `git status --porcelain` devuelve **una sola línea**, el `??` de este informe, antes y
  después de cada mutación.
- `git stash create` devuelve **vacío** al cerrar, que es la prueba de que el árbol de
  trabajo no difiere de `HEAD` en ningún archivo rastreado.
- Inspección directa: ambos decoradores están en su lugar en `usuario-tenant.dto.ts:114`
  y `usuarios.controller.ts:302`.

**Reconfirmación en verde tras revertir**, que es lo que `rules.verify` exige para cerrar
el ciclo de mutación: `pnpm vitest run` sobre los dos specs afectados devuelve
`Test Files 2 passed (2) · Tests 41 passed (41)`. Rojo bajo el mutante, verde sin él, en
las dos mutaciones. Un test que solo se vio en verde no prueba nada.

### 11.6 W3 sigue ABIERTA, y se cierra por declaración, no por test

**W3 — "El usuario puede loguearse con la contraseña nueva" (R1) no se observa en
ejecución.** Sin cambios respecto de la ronda 1. Esta ronda ratifica el juicio y toma la
salida que § 9 proponía como la honesta:

> Queda registrada como **propiedad verificada por composición, no por observación**.

La composición que la sostiene es sólida y está medida en la ronda 1: el mismo token
`HASH_PROVIDER` para el reset y para el login, ligado una sola vez a `Argon2HashProvider`,
y hash únicamente vía `usuario.hashPassword()`. El diseño excluyó integración y e2e con
argumento (`design.md:383`), así que es una brecha **declarada**, no un desvío.

No se la disfraza y no se le pone un nombre de test que prometa más de lo que prueba. Se
deja anotada porque es la propiedad que más caro costó en este repo —el incidente que
originó el ciclo, `scripts/reset-password.ts:6-19`, "éxito reportado, usuario afuera",
ocurrió precisamente porque nadie verificó el login contra el hash escrito—. Quien
levante los tests de integración de este módulo, que empiece por acá.

Las cinco SUGGESTION (S1 a S5) siguen abiertas, sin cambios. Ninguna bloquea. **S1 es
deuda ajena a este ciclo** y merece su propio seguimiento: `tipos-componente.controller.spec.ts:56-62`
tiene un test de autorización de un endpoint ROOT-only que no puede fallar.

### 11.7 Veredicto de la ronda 2

**PASS WITH WARNINGS** — sin cambios en el veredicto, con cambio en el recuento:
**1 WARNING abierta** (W3) contra las 3 de la ronda 1, 0 CRITICAL, 0 blockers.

Las dos advertencias que se cerraron no se cerraron por declaración: se cerraron porque la
mutación que antes no mataba nada ahora mata, y se midió en los dos sentidos. W3 queda
abierta a propósito y registrada como lo que es.

**Nada bloquea el archivado.**
