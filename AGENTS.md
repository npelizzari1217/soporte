# AGENTS.md — estándares de revisión de `soporte`

> Este archivo lo consume la revisión automática de código (GGA), que lee **solo este
> archivo**. Por eso las reglas universales están copiadas acá abajo, entre los marcadores
> `BEGIN:global` / `END:global`, y se mantienen a mano: no hay sincronización automática.
>
> Lo que va **después** del bloque es lo propio de este proyecto: amplía a las universales.
>
> Señalá solo lo accionable y apoyado en el diff. Esta revisión corre en `pre-commit`, sobre
> un commit suelto, antes de que exista el PR y sin conocer el resto de la rama: no reportes
> nada sobre el PR ni sobre el tamaño de la rama, porque no los podés ver.

<!-- BEGIN:global -->
<!-- Reglas universales. Los marcadores delimitan el bloque que la revision
     automatica necesita leer entero; se mantiene a mano, editando aca. -->

## Lenguaje y tipos

- **Todo lo que lee una persona va en español neutro**: comentarios, prosa, copy de UI y
  **mensajes de error**. Solo quedan en inglés los **identificadores y nombres de archivo**
  (variables, funciones, clases, tipos, claves, rutas). El corte: si lo lee una persona,
  español; si lo lee el compilador, inglés.
- **Neutro, no rioplatense.** El voseo y el modismo regional van en la conversación, no en
  un artefacto. Un `// fijate que acá se rompe` es hallazgo; `// verificar el límite acá`
  no. No es retroactivo: rige para las líneas que el diff agrega o reescribe.
- **Las descripciones de test (`describe`/`it`) son la EXCEPCIÓN: no tienen idioma fijo.**
  Se sigue el idioma de los `it()` **del archivo que se toca**, no el de la regla de arriba.
  **Un `it()` nuevo en inglés NO es un hallazgo** si sus vecinos del archivo están en
  inglés, y viceversa. Si el repo tiene un censo medido, vive en su sección propia, no acá.
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

## Tests

Este proyecto **no exige TDD como regla general**: para una feature, el test no tiene que
escribirse antes que la implementación. Lo que `work-unit-commits` sí exige siempre es que
el test y la conducta que verifica **viajen en el mismo commit**.

**La excepción son los bugfixes, y ahí TDD sigue siendo obligatorio.** Un bugfix va con un
test de regresión escrito ANTES del fix, que **falle por la razón correcta** y pase después.
No es ceremonia: un test escrito después del fix no prueba que el bug existía, y nadie puede
saber si habría fallado. En un bugfix, el orden **es** la evidencia.

**Qué SÍ podés verificar desde acá.** Corrés en `pre-commit`, sobre un commit suelto, y
el commit **tiene que traer sus tests adentro**. Entonces:

- Un commit que agrega o cambia conducta y **no trae ningún test** es hallazgo.
- Un test cuyos asserts **describen la implementación** en vez de la conducta esperada
  (repite la fórmula del código, mockea justo lo que debía probar, afirma sobre detalles
  internos) es hallazgo: no prueba nada que un refactor no rompa de casualidad.
- Un test de regresión que **no podría haber fallado antes del fix** — porque su assert
  pasa por construcción, o el fixture no contiene el caso — es hallazgo.

**Qué NO podés verificar, y por lo tanto no reportes.** No viste correr la suite ni el
orden en que se escribieron los archivos. **No afirmes que el RED no se verificó**: no
tenés cómo saberlo. Limitate a lo que el diff muestra.

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

<!-- END:global -->

---

---

## Stack de este proyecto

Runner: **Vitest**. Package manager: **pnpm**. No hay Jest.
`pnpm lint` sale en **cero errores** (verificado 2026-08-30). Si tira algo, es del cambio.
`pnpm typecheck` **SÍ mira los `*.spec.ts`** (corregido 2026-09-01). `backend/tsconfig.json`
los incluye a propósito: `include: ["src/**/*"]` y `exclude` solo `node_modules` y `dist`. Su
propio comentario explica por qué son el gate central del ciclo `saneamiento-tipos-backend`
(WU6): la exclusión anterior había escondido **119 errores de tipos**, entre ellos un renombre
de enum que nunca llegó a los tests y mocks que no cumplían la interfaz que decían implementar.

Consecuencias prácticas:

- Un campo obligatorio nuevo en una entidad de dominio **rompe el typecheck en cada fixture de
  spec que la construya**, guarde o no en base. Presupuestá ese fixup.
- Correr la suite **no** reemplaza al typecheck, ni al revés: `pnpm test` transpila sin chequear
  tipos. Corré los dos.
- `tsconfig.build.json` re-declara su propio `exclude` y sí saca los specs, pero eso aplica solo
  al build de producción, no a `tsc --noEmit`.

> **Por qué estaba mal.** Hasta el 2026-09-01 este párrafo afirmaba lo contrario ("el tsconfig
> los excluye", "~150 errores preexistentes", "decisión pendiente del autor"). Describía el
> estado **anterior a WU6** y nunca se actualizó cuando ese ciclo entró. Costó un lanzamiento
> completo de `sdd-apply` en el ciclo `zona-horaria-por-tenant`, que planificó sin contar el
> fixup de ~24 fixtures. Verificalo vos mismo antes de confiar: `bat backend/tsconfig.json`.

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
| Select con valor fuera de catálogo | La pantalla dice una cosa y se guarda otra | la prioridad en `ticket-edit-form` |
| Topes de largo sin espejar | 500 crudo de Postgres, o 400 remoto por algo que se veía en pantalla | la constante en la entidad, importada por el DTO |

Las cuatro primeras están cerradas. El select fuera de catálogo cerró sus 2 instancias
—el sector de la cabecera de compras y la prioridad del ticket— con la variante que distingue
"catálogo todavía no resuelto" de "valor dado de baja": detectar la baja por AUSENCIA en la
lista traída solo vale cuando esa lista YA resolvió, porque con el catálogo cargando o caído
la ausencia no prueba nada.

**Las cinco clases están cerradas.** Los 6 campos sin tope espejado se cerraron en las tres
capas —edilicia (ubicación, descripción de subtarea), usuarios (nombre, apellido), ciclos-master
(nombre) y kb (título)—; los 2 de tipos-componente (código, nombre) dejaron de existir con el
módulo retirado, más los campos de admin de
`CreateClienteDto`, que escriben las mismas columnas que el ABM de usuarios.

El mecanismo que las mantiene cerradas: **el número vive en la entidad de dominio y el DTO lo
importa**, así que borde y dominio no pueden divergir. El front lo copia a mano, con un
centinela en su test que fija el valor — eso atrapa una edición accidental, NO un cambio de
la columna: si una columna se ensancha, al front hay que venir a mano.

**Las dos escrituras que no pasan por la entidad quedaron cubiertas**, cada una como podía:

- `prisma_master/seeds/root-bootstrap.seed.ts` es TypeScript, así que **importa** las
  constantes del dominio y valida los `ROOT_ADMIN_*` antes de insertar. Antes, un nombre de
  150 caracteres moría con un 22001 del driver que no nombraba la variable culpable, justo en
  medio de un deploy.
- `backend/scripts/sync-ayuda.js` es CommonJS y corre con `node` pelado, así que NO puede
  importar de TypeScript: sus topes siguen siendo literales. Lo que impide que diverjan es un
  test —`sync-ayuda.spec.ts` compara los topes que el script exporta contra los del dominio—.
  Es un guard, no un import: si la columna cambia, el test se pone rojo y avisa, pero el
  número hay que moverlo a mano.

### Las tres formas en que un tope falla

Vale para el próximo campo que se agregue, que es el motivo de dejarlas escritas:

1. **Sin tope en ninguna capa.** La columna es lo único que valida: el valor llega a Postgres
   y muere ahí, 22001 → **500 crudo**, sin nombrar el campo. Era el caso de los 8.
2. **Con tope en el backend pero no en el front.** El servidor rechaza bien, pero el usuario
   se come un **400 remoto** por algo que se veía en pantalla, y pierde lo tipeado. Era el
   caso de `clientes`.
3. **Tope en las dos capas que NO coincide con la columna.** La más silenciosa. `cuit`
   declaraba `@MaxLength(20)` contra un `VARCHAR(13)`: 14 a 20 caracteres pasaban las dos
   validaciones y reventaban igual al persistir.

### Dos trampas que costaron encontrar

- **El validador del front y el del backend no acotan igual.** `@IsEmail()` corta en 254
  caracteres; `z.string().email()` es solo un regex y acepta 309 (medido). Copiar del backend
  el argumento "ese validador ya acota" dejó el front más laxo que el servidor. Cada capa se
  verifica en su propia capa.
- **Si el borde normaliza, el tope se mide sobre el normalizado.** `toUpperCase()` puede
  AGRANDAR el string (`'ß'` → `'SS'`), así que 50 caracteres tipeados pueden ser 100 al
  guardarse. `tipos-componente` exporta su función de normalización y las tres capas la
  aplican antes de medir. Y vale para el PISO igual que para el techo: si el `@Transform`
  corre antes que `@IsNotEmpty`, entonces `"   "` es vacío para el backend y el front tiene
  que medirlo igual.

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

## Ayuda de usuario — SUSPENDIDA desde el 2026-09-07

> **No reportes la ausencia de un artículo de Ayuda como hallazgo.** La regla de abajo
> está en pausa por decisión del dueño del repo, no por descuido de quien escribe el
> commit.
>
> **Por qué.** Los artículos se estaban reescribiendo entrega tras entrega: cada tanda
> tocaba lo que la siguiente volvía a tocar. Se escriben todos juntos al final del
> proyecto, una sola vez, sobre la superficie ya estabilizada.
>
> **Qué SÍ sigue vigente.** Cuando un cambio deje la Ayuda desactualizada o pida un
> artículo nuevo, eso se anota en el mensaje del commit y en el cuerpo del PR. La
> suspensión es de la escritura, no del registro: sin esa anotación, la tanda final no
> sabe qué cubrir.
>
> **Qué NO cambia.** Un artículo que ya existe y que un cambio vuelve FALSO sí se corrige.
> Una Ayuda que miente es peor que una que falta, y eso no depende de si se están
> escribiendo artículos nuevos.
>
> **Cómo se levanta.** Solo con un aviso explícito del dueño del repo. Al levantarla, se
> borra este bloque y la regla de abajo vuelve a regir tal cual — por eso queda entera y
> no se reescribió.

El módulo KB se llama **Ayuda** y sus artículos viven como markdown en `backend/ayuda/*.md`.
Un cambio que altera lo que el usuario ve o hace no está terminado hasta que la Ayuda lo
refleja en el mismo commit.

Si el cambio toca la interfaz y ningún `backend/ayuda/*.md` aparece en el commit, verificar
si corresponde y decirlo. Una Ayuda que miente es peor que una que falta.
