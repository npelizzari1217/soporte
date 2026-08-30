# AGENTS.md — estándares de revisión de `soporte`

> Este archivo lo consume la revisión automática de código. **No introduce reglas nuevas**:
> transcribe lo que ya estaba documentado en el `CLAUDE.md` del proyecto, en las reglas
> globales del autor, y las convenciones que el propio repo ya sostiene con tests.
> La procedencia de cada bloque está anotada.

## Formularios — la superficie donde este proyecto se rompe

_(Procedencia: barrido completo del frontend del 2026-08-30 — 152 campos en 44 formularios
de los 15 módulos. Reproducible: `rg -l "useForm" frontend/src --glob '*.tsx'` da los 35
archivos de entrada.)_

Este repo es el único de su familia que usa react-hook-form: 35 archivos con `useForm`,
zod como resolver y react-query como origen del dato. **Casi todos sus defectos de usuario
viven en las junturas de ese trío**, no dentro de ninguna de las tres piezas. El barrido
encontró 18 defectos alcanzables en producción, y los 18 caen en cinco clases.

**El patrón que las une no es lógica equivocada: es cobertura PARCIAL de una condición.**
El código hace bien lo que mira; el defecto está en lo que no enumeró. Por eso se escapan a
la lectura del diff — se ven mirando el archivo entero y preguntando "¿esto vale para
TODOS los casos que entran acá?".

| Clase | Qué le pasa al usuario | Referencia sana |
|---|---|---|
| Parseo del valor tipeado | Rechaza un monto que acepta un blur después | `parsearNumeroEsAr` en `shared/lib/formato-numero` |
| Vacío que se vuelve valor | `Number("")` es `0` y sobrescribe un acumulado | helper `numeroRequerido` en `compras/schemas` |
| Sincronización del formulario | Reabrir muestra el dato del primer render | `if (next) reset(valoresVigentes)` — 16 diálogos |
| Select con valor fuera de catálogo | La pantalla dice una cosa y se guarda otra | `tipoActualFueraDeCatalogo` en `componente-edit-dialog` |
| Topes de largo sin espejar | 400 genérico del backend en vez de validación local | `shared/lib/limites-ticket` |

Las tres primeras están cerradas. **Siguen abiertas**: el select fuera de catálogo (2
instancias, en el sector de la cabecera de compras y en la prioridad del ticket) y 8 campos
sin tope espejado.

### Qué preguntar frente a un formulario

- **¿Todos los caminos de envío pasan por la misma validación?** Enter dentro de un `<form>`
  no dispara el blur, así que un control que canoniza al perder el foco entrega el texto
  crudo cuando se envía con Enter.
- **¿El guard cubre todas las formas de producir su condición?** Un `setValue` sin
  `{ shouldDirty: true }` no marca el formulario como sucio, y un guard `isDirty` deja
  desprotegido justo ese campo — con apariencia de protegerlo.
- **¿Un valor vacío significa "sin cambio" o "poné cero"?** Si el campo precarga un dato
  existente, confundirlos es pérdida de datos, no un error de validación.
- **¿El formulario se sincroniza al abrir, o solo al montar?** Un diálogo que vive en una
  fila de tabla no se desmonta al cerrarse: su snapshot inicial sobrevive toda la sesión.
- **¿El `<select>` puede recibir un valor que ya no está entre sus opciones?** Si el catálogo
  filtra por activos y el registro apunta a uno dado de baja, el DOM cae a otra opción y el
  submit guarda algo distinto de lo que se ve.

## Flujo de trabajo

_(Procedencia: `CLAUDE.md` del proyecto, sección de anulaciones)_

Este proyecto lo desarrolla una sola persona: no hay revisor externo, no hay issue-first,
ni labels, ni gates de CI que bloqueen merges.

**Pero SÍ usa pull requests**, desde el 2026-08-27. El motivo no es la revisión —no hay a
quién revisarle— sino el **aislamiento entre máquinas**: el mismo repo se trabaja desde
varias PCs, y la rama principal es el único lugar donde dos chocan de verdad. Toda tarea
arranca en su propia rama (`feat/…`, `fix/…`, `chore/…`), se pushea al abrir el PR, y entra
a `main` con `--no-ff`. Nunca commit directo a `main`, nunca `--force` sobre ella.

Hay un corte de tamaño: **400 líneas revisables por PR** (no cuentan lockfiles, generados,
snapshots ni papelería SDD), con banda de consulta entre 401 y 450.

**No señales como problema**: que no haya issue asociado, ni que falten etiquetas de tipo o
tamaño — eso sigue sin aplicar acá.

**Tampoco reportes nada sobre el PR ni sobre el tamaño de la rama.** No es que no importen:
es que no los podés ver. Esta revisión corre en `pre-commit`, sobre un commit suelto, antes
de que exista el PR y sin conocer el resto de la rama. Un comentario tuyo sobre eso sería
una conjetura, no un hallazgo.

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
- **Un comentario que describe un ESTADO caduca con ese estado, y es la forma más común de
  comentario mentiroso acá.** El 2026-08-30 aparecieron cuatro en un solo commit: dos que
  decían "todos los campos opcionales" cuando uno había dejado de serlo, uno que declaraba una
  consolidación "a medio camino" que ese mismo commit terminaba, y otro que describía un modo
  de falla ya cerrado. Los comentarios de mecanismo ("va sin `coerce` porque `ZodNumber._parse`
  coerciona antes de mirar el tipo") sobreviven; los de estado ("compras todavía mantiene su
  copia") vencen. Al revisar un cambio, chequeá si vuelve falso algún comentario **vecino**,
  no sólo los del diff.

## Ayuda de usuario

_(Procedencia: `CLAUDE.md` del proyecto, sección "La Ayuda se mantiene con el código")_

El módulo KB se llama **Ayuda** y sus artículos viven como markdown en `backend/ayuda/*.md`,
no sólo en la base. Un cambio que altera **lo que el usuario ve o hace** no está terminado
hasta que la Ayuda lo refleja, **en el mismo commit** — igual que los tests.

Aplica cuando el cambio agrega, saca o renombra una pantalla, un botón o un campo; cambia un
flujo; cambia el significado de un estado, un permiso o una etiqueta visible; o corrige un
comportamiento que la Ayuda describía de otra forma. No aplica a refactors, performance,
tests ni infraestructura que el usuario no percibe.

La pregunta para decidir es una sola: **¿alguien que leyó la Ayuda ayer haría algo mal hoy por
culpa de este cambio?** Si el cambio toca la interfaz y ningún `backend/ayuda/*.md` aparece en
el commit, verificá si corresponde y decilo. Una Ayuda que miente es peor que una que falta,
porque la primera se sigue con confianza.

## Ruido conocido, no lo reportes

- (Vacío por ahora.) Este bloque listaba 5 errores de prettier preexistentes en
  `editar-componente.use-case.spec.ts` y fijaba el criterio en "cero errores nuevos". **Ya no
  aplica**: esos errores se limpiaron, y `pnpm lint` sale en cero tanto en `backend` como en
  `frontend` (verificado el 2026-08-30, exit 0 en los dos). El criterio ahora es **cero
  errores, punto**. Si el lint tira algo, es del cambio en curso.
- `pnpm typecheck` **no mira los `*.spec.ts`** (el `tsconfig` los excluye). Incluirlos destapa
  ~150 errores preexistentes. Es una decisión pendiente del autor, no un defecto de un cambio.
