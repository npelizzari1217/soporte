# AGENTS.md — estándares de revisión de `soporte`

> Este archivo lo consume la revisión automática de código. **No introduce reglas nuevas**:
> transcribe lo que ya estaba documentado en el `CLAUDE.md` del proyecto, en las reglas
> globales del autor, y las convenciones que el propio repo ya sostiene con tests.
> La procedencia de cada bloque está anotada.

## Flujo de trabajo

_(Procedencia: `CLAUDE.md` del proyecto, sección de anulaciones)_

Este proyecto lo desarrolla una sola persona. **No usa pull requests**, no hay revisor
externo, no hay issue-first ni labels ni gates de CI que bloqueen merges. Se trabaja en
ramas de integración que se mergean a `main` con `--no-ff`.

**No señales como problema**: la ausencia de PRs, que una rama supere N líneas, que no
haya issue asociado, o que falten etiquetas de tipo o tamaño.

**`work-unit-commits` SÍ está vigente.** No es ceremonia de PR: un commit representa un
comportamiento entregable, **con sus tests en el mismo commit**, y tiene que poder
revertirse solo sin arrastrar otros. Sostiene el `git bisect`.

Commits: conventional commits, en español, **sin atribución de IA ni `Co-Authored-By`**.

## Lenguaje y tipos

_(Procedencia: reglas globales del autor)_

- Comentarios de código en español. Los identificadores, nombres de archivo, mensajes de error y copy de UI siguen en inglés. No reportes comentarios en inglés preexistentes: solo los nuevos.
- TypeScript strict. **Prohibido `any`**, y prohibido `as any` para callar al compilador,
  también en tests.
- Variables, parámetros y retornos tipados explícitamente.
- SRP: funciones cortas, una responsabilidad. DRY: sin duplicación.
- Nombres descriptivos. Prosa y comentarios en español rioplatense.
- Todo bloque asíncrono o llamada a DB/API va protegido. **Cero excepciones vacías o
  silenciadas.**

## Arquitectura

_(Procedencia: `README.md` del repo y convenciones sostenidas por el código)_

- Hexagonal / screaming architecture: carpetas por dominio.
- **`domain/` NO importa de `infrastructure/`.** Solo `infrastructure/` puede importar
  `@prisma/client`.
- `Result<T, DomainError>` modela fallos **esperados** del dominio. Un valor primitivo
  inválido llegando a una entidad es violación de precondición del caller: va como `throw`,
  no como `Result`.
- **El dominio es la autoridad; el CHECK de la base es backstop.** Nunca al revés: si el
  CHECK es más estricto que el dominio, el dominio deja pasar algo que la base rechaza y el
  usuario se come un 500.
- Cuando un CHECK de DB enumera valores que TypeScript también enumera, la unión se
  **deriva** de un array `as const` (única fuente de verdad) y un test de integración
  compara ese array contra la definición REAL del CHECK leída de `pg_get_constraintdef`.

## Frontend

_(Procedencia: convención establecida en el commit `b2993ce`)_

- Los schemas zod del front son **espejo** de las reglas del backend: ni más laxos ni más
  estrictos. Uno más laxo manda al usuario a comerse un error remoto por algo que se veía en
  pantalla; uno más estricto rechaza datos que el servidor aceptaría.
- Un control deshabilitado tiene que espejar **todas** las precondiciones de estado que el
  dominio exige, no algunas.

## Testing

_(Procedencia: reglas globales del autor + lecciones registradas en este repo)_

- Runner: **Vitest**. Package manager: **pnpm**. No hay Jest.
- Todo feature o bugfix no trivial ship con tests. Un bugfix lleva test de regresión que
  **falla antes del fix** por la razón correcta y pasa después.
- No generes tests exhaustivos ni combinatorios. Cubrí lógica de negocio, reglas de dominio
  y edge cases no obvios. Preferí tests parametrizados a funciones repetidas.
- Prohibido borrar o comentar tests para pasar en verde.
- **Nunca reportes "tests pass" sin haber corrido la suite.**

### Tres formas de verde falso, las tres encontradas en este repo

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

## Autorización

_(Procedencia: lección registrada tras cuatro apariciones en el cambio `matriz-permisos-por-usuario`)_

La autorización de este sistema vive en **dos** lugares, y solo uno es visible a simple
vista: los decoradores en el borde del endpoint, y los **chequeos inline dentro del cuerpo
de los métodos**, que calculan un booleano y lo inyectan en el caso de uso, donde decide el
alcance de la consulta o qué campos se serializan.

Auditar autorización grepeando decoradores da una foto incompleta y tranquilizadora. Hay que
barrer además los helpers del dominio, las lecturas directas de tablas de permisos, y los
spreads condicionales en los mappers de DTO — sobre el **monorepo entero**, no solo
`backend/`.

Estas fallas son silenciosas: un gate mal migrado devuelve 403 y se nota; un flag inline mal
migrado devuelve el conjunto de filas equivocado, o un campo de más, sin error y sin log.

## Documentación

_(Procedencia: reglas globales del autor)_

- JSDoc en toda función, método público o componente exportado: propósito, parámetros y
  retorno.
- Comentá el **porqué** de lo no trivial, nunca el **qué**.
- Un comentario que describe la intención en vez del código es peor que no tener comentario:
  en este repo hubo uno que afirmaba medir el universo filtrado de una paginación cuando el
  código no recibía los filtros.

## Ruido conocido, no lo reportes

- `backend/src/equipos/application/use-cases/editar-componente.use-case.spec.ts` arrastra
  **5 errores de prettier preexistentes**, ajenos a cualquier cambio en curso. El criterio es
  **cero errores nuevos**, no cero errores.
- `pnpm typecheck` **no mira los `*.spec.ts`** (el `tsconfig` los excluye). Incluirlos destapa
  ~150 errores preexistentes. Es una decisión pendiente del autor, no un defecto de un cambio.
