# AGENTS.md — estándares de revisión de `soporte`

> Este archivo lo consume la revisión automática de código (GGA), que lee **solo este
> archivo**: no puede abrir el `AGENTS.md` global. Por eso las reglas universales están
> copiadas acá abajo, entre los marcadores `BEGIN:global` / `END:global`, y las mantiene
> sincronizadas `sync-agents.py`. **No edites ese bloque a mano.**
>
> Lo que va **después** del bloque es lo propio de este proyecto: amplía al global, y ante
> conflicto **gana lo local**.
>
> Señalá solo lo accionable y apoyado en el diff. Esta revisión corre en `pre-commit`, sobre
> un commit suelto, antes de que exista el PR y sin conocer el resto de la rama: no reportes
> nada sobre el PR ni sobre el tamaño de la rama, porque no los podés ver.

<!-- BEGIN:global -->
<!-- Generado por sync-agents.py desde C:\trabajos\AGENTS.md (v96efe583).
     NO EDITAR A MANO: el proximo sync pisa los cambios.
     Para cambiar una regla universal, edita el global y volve a correr el script.
     Para que este proyecto se aparte, usa la seccion [Anulaciones] de mas abajo. -->

## Lenguaje y tipos

- **Todo lo que lee una persona va en español**: comentarios, prosa, copy de UI y
  **mensajes de error**. Solo quedan en inglés los **identificadores y nombres de archivo**
  (variables, funciones, clases, tipos, claves, rutas). El corte: si lo lee una persona,
  español; si lo lee el compilador, inglés.
- **La regla NO es retroactiva.** No reportes copy, mensajes de error ni comentarios en
  inglés preexistentes: **solo los nuevos**, y solo en las líneas que el diff agrega o
  reescribe. Un archivo con copy viejo en inglés no es un hallazgo.
- **Prohibido `any`**, los casts sin chequear y los `!` usados para callar al compilador.
  Para lo desconocido: `unknown` + validación.
- Los miembros exportados llevan tipos explícitos de parámetros y retorno.
- Sin variables ni parámetros declarados y no usados.

---

## Responsabilidad y duplicación

- Una responsabilidad por función. Señalá las funciones que mezclan transporte, reglas de
  negocio y persistencia en el mismo cuerpo.
- Sin lógica duplicada entre módulos. Señalá el copy-paste que debería estar en un lugar
  compartido.
- Los controllers se mantienen finos: parsean la entrada, delegan y mapean la respuesta. Las
  reglas de negocio y la persistencia viven en los services o casos de uso.

---

## Errores y seguridad

- Todo bloque asíncrono, query a la DB o llamada a API externa lleva manejo de errores.
  **Cero `catch` vacíos o que se tragan el error.** Un `catch` que solo loguea y sigue
  esconde el fallo hasta que se manifiesta en otro lado.
- Operaciones que tocan múltiples tablas relacionadas corren dentro de una transacción con
  rollback real.
- **Sin secrets, connection strings, tokens ni credenciales en el código.** Van en variables
  de entorno. Señalá cualquier línea de log que pueda imprimir un token o una respuesta
  completa de API que lo contenga.
- La autorización se decide en el backend. Ocultar una acción en la UI no es un control de
  acceso.
- Los valores que vienen del usuario se validan antes de usarlos. Un payload que entra a la
  lógica sin pasar por un schema o DTO es un hallazgo.

---

## Commits y Git

- Commits en **Conventional Commits, en español**.
- **`work-unit-commits`:** cada commit es un comportamiento entregable con sus tests adentro,
  reversible solo. Señalá un commit que mezcle implementación de features distintas o que
  deje la suite en rojo.
- Sin atribución de IA ni `Co-Authored-By` en los mensajes.

---

## Tests y TDD

Este proyecto trabaja con **TDD obligatorio**: el test se escribe antes que la
implementación, y `work-unit-commits` exige que ambos viajen en el mismo commit.

**Qué SÍ podés verificar desde acá.** Corrés en `pre-commit`, sobre un commit suelto, y
el commit **tiene que traer sus tests adentro**. Entonces:

- Un commit que agrega o cambia conducta y **no trae ningún test** es hallazgo.
- Un test cuyos asserts **describen la implementación** en vez de la conducta esperada
  (repite la fórmula del código, mockea justo lo que debía probar, afirma sobre detalles
  internos) es la firma de un test escrito *después*. Es hallazgo.
- Un test de regresión que **no podría haber fallado antes del fix** — porque su assert
  pasa por construcción, o el fixture no contiene el caso — es hallazgo.

**Qué NO podés verificar, y por lo tanto no reportes.** No viste correr la suite ni el
orden en que se escribieron los archivos. **No afirmes que el RED no se verificó**: no
tenés cómo saberlo. Limitate a lo que el diff muestra.

- Las features no triviales y todo bugfix van con tests. Un bugfix necesita un test de
  regresión que **falle antes del fix por la razón correcta** y pase después.
- Se cubren los caminos críticos y los edge cases (errores, límites, entradas inválidas),
  no solo el happy path.
- **Borrar o comentar tests para pasar en verde es hallazgo bloqueante.**
- Un test que consagra el comportamiento actual en vez del esperado no es cobertura: es un
  candado sobre el bug.
- No exigir tests exhaustivos ni combinatorios. Los getters triviales, los CRUD de paso y la
  validación que ya hace el framework no necesitan test propio.

---

## Documentación

- Las funciones exportadas, los métodos públicos y los componentes exportados llevan JSDoc
  o docstring con propósito, parámetros y retorno.
- Comentá el *porqué* de la lógica no obvia, nunca el *qué*.
- Toda dependencia, variable de entorno o comando de ejecución nuevo se refleja en el README
  y en el `.env.example` correspondiente en el mismo commit.

---

## Ruido conocido — no reportar

No rechaces un cambio por estas razones:

- **Formato, orden de imports, estilo de comillas, largo de línea.** De eso se encargan
  Prettier, ESLint o Biome según el proyecto. Si el proyecto no tiene linter configurado,
  no hay herramienta que decida el estilo: un hallazgo de formato sin herramienta detrás es
  una opinión.
- **Problemas preexistentes en código que el diff no toca.** Mencionarlos como nota a lo
  sumo, nunca como bloqueante.
- **Reescrituras arquitectónicas** de código que funciona cuando el diff es un fix acotado.
- **La falta de tests** en cambios que son puramente de configuración, comentarios o docs.
- **Preferencias subjetivas de nombres** cuando el nombre existente ya es claro.
- **Ceremonias de equipo** que no aplican a un proyecto de una sola persona: issue-first,
  labels de PR, aprobación de maintainer externo.

<!-- END:global -->

---

---

## Stack de este proyecto

Runner: **Vitest**. Package manager: **pnpm**. No hay Jest.
`pnpm lint` sale en **cero errores** (verificado 2026-08-30). Si tira algo, es del cambio.
`pnpm typecheck` no mira los `*.spec.ts` (el tsconfig los excluye) — ~150 errores
preexistentes quedarían expuestos. Es decisión pendiente del autor, no defecto de un cambio.

---

## Arquitectura

- Hexagonal / screaming architecture: carpetas por dominio.
- **`domain/` NO importa de `infrastructure/`.** Solo `infrastructure/` puede importar
  `@prisma/client`.
- `Result<T, DomainError>` modela fallos **esperados** del dominio. Un valor primitivo
  inválido llegando a una entidad es violación de precondición del caller: va como `throw`,
  no como `Result`.
- **El dominio es la autoridad; el CHECK de la base es backstop.** Si el CHECK es más
  estricto que el dominio, el dominio deja pasar algo que la base rechaza: el usuario se
  come un 500.
- Cuando un CHECK de DB enumera valores que TypeScript también enumera, la unión se
  **deriva** de un array `as const` (única fuente de verdad) y un test de integración
  compara ese array contra la definición real del CHECK leída de `pg_get_constraintdef`.

---

## Frontend

- Los schemas Zod del front son **espejo** de las reglas del backend: ni más laxos ni más
  estrictos. Uno más laxo manda al usuario a comerse un error remoto por algo que se veía en
  pantalla; uno más estricto rechaza datos que el servidor aceptaría.
- Un control deshabilitado tiene que espejar **todas** las precondiciones de estado que el
  dominio exige, no algunas.

---

## Autorización

La autorización vive en **dos** lugares, y solo uno es visible a simple vista: los
decoradores en el borde del endpoint, y los **chequeos inline dentro del cuerpo de los
métodos**, que calculan un booleano y lo inyectan en el caso de uso, donde decide el alcance
de la consulta o qué campos se serializan.

Auditar autorización grepeando decoradores da una foto incompleta. Hay que barrer también
los helpers del dominio, las lecturas directas de tablas de permisos, y los spreads
condicionales en los mappers de DTO — sobre el **monorepo entero**, no solo `backend/`.

Estas fallas son silenciosas: un gate mal migrado devuelve 403 y se nota; un flag inline
mal migrado devuelve el conjunto de filas equivocado, o un campo de más, sin error y sin log.

---

## Testing — tres formas de verde falso encontradas en este repo

Además de las reglas globales de testing, estas tres formas de verde falso aparecieron acá:

1. **El test que consagra el estado actual en vez del comportamiento esperado.** Apareció
   tres veces: un test que verificaba que un error 422 remoto apareciera en un toast
   (tratando el síntoma como esperado), un assert que exigía que una ruta **no** declarara
   permisos (fijando un hueco de autorización), y un import de una constante ya borrada que
   dejaba el assert pasando por construcción.
2. **El assert de ausencia sobre un fixture vacío.** "No trae los comentarios internos" pasa
   en verde si el fixture no tiene ninguno. El fixture **debe** contener el elemento que no
   tiene que aparecer, y debe existir el caso hermano con la condición invertida.
3. **El test de código de estado sobre una ruta con scope.** Un 200 no prueba nada si la
   ruta devuelve 200 con el subconjunto de filas equivocado. Los asserts tienen que ser de
   contenido.

---

## Documentación — comentarios que caducan

Además de las reglas globales, en este repo la forma más común de comentario mentiroso es
el **comentario de estado**: describe una situación temporal que cambia con el código, y
nadie lo actualiza. El 2026-08-30 aparecieron cuatro en un solo commit.

Al revisar un cambio, chequeá si vuelve falso algún comentario **vecino**, no solo los del
diff. Los comentarios de mecanismo ("va sin `coerce` porque `ZodNumber._parse` coerciona
antes de mirar el tipo") sobreviven; los de estado ("compras todavía mantiene su copia")
vencen.

---

## Ayuda de usuario

El módulo KB se llama **Ayuda** y sus artículos viven como markdown en `backend/ayuda/*.md`.
Un cambio que altera lo que el usuario ve o hace no está terminado hasta que la Ayuda lo
refleja en el mismo commit.

Si el cambio toca la interfaz y ningún `backend/ayuda/*.md` aparece en el commit, verificar
si corresponde y decirlo. Una Ayuda que miente es peor que una que falta.
