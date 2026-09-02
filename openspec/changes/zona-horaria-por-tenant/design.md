# Diseño: zona horaria por tenant

> ## ENMIENDA — dos capas de reloj (D10–D15)
>
> **Qué la motiva.** Se consultó producción (solo lectura) y los **dos** tenants activos son
> argentinos: `Cic Lanus` y `Santa Cruz` (`activos=2 total=2`). España es **dónde está parado
> el equipo, no un cliente**. Con zona solo-por-tenant, la zona operativa quedaba en Buenos
> Aires para todos y la persona en Madrid seguía viendo hora argentina: el ciclo no resolvía
> nada de lo que motivó el pedido.
>
> **Qué agrega.** Una segunda capa, de **vista**, encima de la que ya está diseñada:
>
> | Capa | De quién es | Qué gobierna |
> |---|---|---|
> | **Reloj de negocio** | del **tenant** | SLA, vencimientos, validación de fechas del dominio, CSV, prefill de calendario |
> | **Vista** | del **usuario** | en qué zona LEE la pantalla |
>
> **Invariante que no se negocia.** La validación de dominio se queda en el reloj del
> **tenant**, nunca en el del usuario. Si validara contra la zona del que mira, dos usuarios
> obtendrían veredictos distintos sobre el mismo dato — un defecto peor que el que se corrige.
> **D6 no se toca**: `hoyTenant: Date` sigue entrando a la entidad tal como está especificado.
>
> **Qué NO cambia.** D1–D9 siguen vigentes sin reabrirse. Las secciones cuyo *significado* se
> ve afectado llevan una nota `> **Enmienda:**` al principio: D5, D6, D7, D9, «Cambios de
> archivo», «Estrategia de tests», «Migración / rollout» y «Preguntas abiertas».

## Enfoque técnico

La zona operativa pasa a ser un atributo del tenant que viaja por **dos canales ya
existentes y sin costo de consulta**: `TenantContextData` en el backend (el `findById` que
`TenantGuard` ya hace) y un claim del JWT en el frontend (el mismo paquete que ya lleva
`cliente_nombre`). El offset fijo muere y se reemplaza por un Value Object `ZonaHoraria`
(IANA) en `shared/domain/`, del que cuelgan las dos únicas primitivas de conversión:
formatear un instante en una zona y calcular el día calendario de una zona.

El punto estructural del cambio es que **el dominio nunca consulta la zona**: recibe el día
calendario del tenant ya resuelto como un `Date`. Con eso, ni `compras/domain/` ni
`shared/domain/` necesitan conocer `AsyncLocalStorage`, y la regla "`domain/` no importa de
`infrastructure/`" (AGENTS.md) se mantiene sin excepciones.

---

## Decisiones de arquitectura

### D1 — Dónde vive la zona en `Cliente`

| Opción | Costo | Decisión |
|---|---|---|
| Campo suelto + getter + `configurarZonaHoraria()` con su propio `touch()` | 1 columna, 1 caso de uso, 1 endpoint | **Elegida** |
| Aparato SMTP (repositorio propio, `Omit` en el mapper, 4 casos de uso) | Rechazada | — |

**Razón.** El `Omit` del mapper (`cliente.mapper.ts:39-54`) existe para que una edición
comercial no borre un secreto cifrado con invariante todo-o-nada de 9 columnas. Acá hay una
columna `NOT NULL` sin secreto y sin invariante compuesto: el precedente exacto es
`csatHabilitado`, que **sí** viaja en `toPersistence()` (`cliente.mapper.ts:62`) y tiene su
método dedicado (`cliente.entity.ts:214-217`). Se copia ese, incluida la constante: acción
**separada de `editar()`**, endpoint `PATCH /clientes/:id/zona-horaria` espejando
`PATCH /clientes/:id/csat` (`clientes.controller.ts:392`).

`ClienteProps.zonaHoraria` es **obligatoria** (no `?`, a diferencia de `csatHabilitado`): la
columna es `NOT NULL` y un `?? ZONA_POR_DEFECTO` en la entidad sería el fallback ad-hoc por
call site que la propuesta descartó. El default de producto se aplica en **un solo lugar**:
el caso de uso de alta, cuando el DTO no trae zona.

### D2 — Validación IANA: por construcción, nunca por catálogo

```ts
// Regla ÚNICA, idéntica en backend y frontend.
try { new Intl.DateTimeFormat("en-CA", { timeZone: candidata }); return true; }
catch { return false; }
```

**Razón, medida en Node v24.20.0.** `Intl.supportedValuesOf('timeZone')` devuelve 418 zonas
y es internamente incoherente: **no** incluye `America/Argentina/Buenos_Aires` — la zona que
este repositorio usa hoy — ni `Asia/Kolkata`, pero sí sus alias `America/Buenos_Aires` y
`Asia/Calcutta`. `Intl.DateTimeFormat` acepta las dos formas y resuelven al mismo instante
(verificado con `2026-01-15T12:00Z`: ambas dan `9:00:00 GMT-3`). Un validador sobre el
catálogo habría rechazado la zona por defecto del propio proyecto. Además el catálogo puede
diferir entre Node y navegador, con lo que la regla de "schema Zod espejo" sería
inverificable.

**Cómo se garantiza que las dos puntas usan la misma regla.** El código es corto y está
copiado (el monorepo no tiene paquete compartido), así que el mecanismo anti-divergencia es
un **fixture versionado** — `shared-fixtures/formato-fecha-paridad.json` — con bloques
`zonasValidas` (incluye `America/Argentina/Buenos_Aires`, `America/Buenos_Aires`,
`Asia/Calcutta`, `Asia/Kolkata`, `Europe/Madrid`) y `zonasInvalidas`. Los dos specs (VO del
backend y schema Zod del frontend) recorren el mismo archivo. Si una punta migra a validar
por catálogo, `America/Argentina/Buenos_Aires` la pone en rojo. Es el patrón que el
repositorio ya usa para `sync-ayuda.spec.ts`: guard, no import.

**Select de la UI.** `Intl.supportedValuesOf('timeZone')` se usa solo como fuente de
**sugerencias**, nunca como validador, y la lista siempre incluye el valor vigente del tenant
aunque no esté en el catálogo — misma variante de "select con valor fuera de catálogo" que
`tipoActualFueraDeCatalogo` ya cerró (AGENTS.md, tabla de formularios). El Zod es
`z.string().refine(esZonaValida)`, nunca `z.enum`: un `z.enum` sería **más estricto** que el
backend y rechazaría datos que el servidor acepta.

### D3 — Cómo llega al runtime del backend

Campo `zonaHoraria: ZonaHoraria` en `TenantContextData` (`shared/tenancy/tenant-context.ts`),
bindeado por `TenantGuard` desde el `findById` que ya ejecuta (`tenant.guard.ts:59`).
**Cero queries nuevas.** Rechazado: re-consultar por call site — paga N queries por request y
admite que dos capas del mismo request lean valores distintos si la zona cambia en el medio.

### D4 — Cómo llega al frontend

Claim `zona_horaria: string | null` en `JwtPayload`, poblado desde `ScopeResuelto` en
`resolver-scope.ts:142-148`, que ya tiene la `ClienteEntity` cargada. Los tres emisores
(`login`, `refresh-token`, `switch-tenant`) leen del mismo `resolverScope`: cero cambios de
forma en ellos. `null` cuando `cliente_id` es `null` (token master de root), igual que
`cliente_nombre`.

**`VERSION_PAYLOAD_JWT` sube de 2 a 3.** Un access token emitido antes del deploy no trae el
claim; sin el bump, un tenant de Madrid vería hasta 15 minutos de horas mal en silencio.
`JwtAuthGuard` rechaza con 401 los `v` viejos y dispara el refresh que ya existe
(`i-token.service.ts:1-9`). **No es maquinaria de invalidación de sesiones**: es el mecanismo
que el repositorio construyó exactamente para un cambio de forma del payload.

### D5 — La forma del reemplazo de `formato-fecha.ts`

> **Enmienda (D13).** La decisión de esta sección se mantiene íntegra: la zona sigue siendo el
> **primer parámetro obligatorio** de cada función de instante, sin default. Lo que cambia es
> **qué zona pasa cada call site**: la de vista para lo que se lee, la del tenant para lo que
> el servidor valida. `useFormatoFecha()` deja de resolver una sola zona y pasa a resolver
> dos, sin que ninguna función de `formato-fecha.ts` cambie de firma respecto de lo decidido
> acá. La doble lectura es **composición encima**, nunca un reemplazo de `formatearInstante`.

| Opción | Problema | Decisión |
|---|---|---|
| Zona como **primer parámetro obligatorio** de cada función de instante + hook `useFormatoFecha()` que la liga | ninguno | **Elegida** |
| Contexto leído dentro del módulo | Vuelve impuras funciones hoy testeables sin React | Rechazada |
| Zona con default | Un call site olvidado formatea en la zona equivocada sin error | Rechazada |

`formato-fecha.ts` sigue siendo funciones puras y sigue construyendo el `Intl.DateTimeFormat`
**por llamada**: con la zona entrando como argumento no queda nada que cachear al `import`.
La restricción documentada en el módulo (`formato-fecha.ts:112-121`) se preserva y se
refuerza — **la única memoización permitida en el hook es la del string de la zona, nunca un
`Intl.DateTimeFormat`**.

`useFormatoFecha()` (`frontend/src/shared/hooks/`) es la única juntura con `SessionContext` y
resuelve `user?.zona_horaria ?? ZONA_SIN_TENANT` en un solo lugar. Los 18 componentes son
`"use client"` y ya consumen contexto.

**Rutas públicas y `/login`.** El `layout.tsx` raíz monta `<Providers>` sin `initialUser`, y
el token master de root tampoco trae zona: en los dos casos el hook entrega
`ZONA_SIN_TENANT = "UTC"`, **declarada explícitamente**, nunca resuelta al navegador. Esto
sostiene el test vigente que espía que las opciones de `Intl.DateTimeFormat` sean siempre
explícitas. Hoy no hay consumidor —la encuesta pública CSAT no formatea ninguna fecha
(verificado: los 7 archivos del módulo no importan `formato-fecha`)—; la regla existe para el
próximo.

**El nuevo canario de la matriz de zonas.** El actual confirma que `process.env.TZ` cambió la
zona ambiente. Con la zona por parámetro se invierte y se vuelve más fuerte: la salida **debe**
cambiar al cambiar el argumento y **no debe** cambiar al mover `process.env.TZ`.

### D6 — `hoyArgentina()` y el dominio (el punto más delicado)

> **Enmienda (D14).** Esta sección **no se toca**: `hoyTenant: Date` sigue siendo el día del
> **tenant**, y la preferencia de vista del usuario no entra al dominio por ninguna vía. Lo
> único que se agrega es que `FechaEtapaFuturaError` pase a **nombrar el día y el reloj** del
> que habla, usando el mismo `hoyTenant: Date` que la entidad ya recibe — sin `Intl`, sin
> zona y sin ampliar la firma de `validarFechaEtapa`.

El dominio **no consulta la zona ni el reloj: recibe el día como dato.**

```
Caso de uso ──inyecta──> IRelojTenant.hoy(): Date        (shared/application/ports/)
      │                        └─ impl lee TenantContext  (shared/infrastructure/)
      └──pasa el Date──> ItemCompraEntity.registrarOrden(cantidad, hoyTenant, fecha = hoyTenant)
                                    └─ validarFechaEtapa(etapa, fecha, hoyTenant)   ← puro
```

| Opción | Veredicto |
|---|---|
| El servicio de dominio lee `TenantContext` | **Rechazada** — `domain/` importaría `AsyncLocalStorage` de `shared/tenancy`; viola AGENTS.md y vuelve la entidad no testeable sin scope |
| La entidad recibe la `ZonaHoraria` y calcula "hoy" | **Rechazada** — mete `Intl` y la noción de "ahora" en la entidad; deja el guard dependiente del reloj del proceso |
| **La entidad recibe `hoyTenant: Date`** | **Elegida** |

El default deja de ser una llamada a servicio (`fecha: Date = hoyArgentina()`,
`item-compra.entity.ts:456,493,531`) y pasa a ser el parámetro anterior. La semántica no
cambia: "si no me das fecha, uso hoy". Los cuatro casos de uso ya deciden si hay fecha
explícita (`registrar-orden-de-item.use-case.ts:70-71` y hermanos); solo cambian la rama sin
fecha por el reloj inyectado. `soloFecha()` no se toca: es truncado puro, sin zona.

`hoyArgentina()` desaparece; `fecha-argentina.ts` se renombra a `fecha-tenant.ts` y conserva
solo `soloFecha()`. El cálculo del día en una zona vive en `shared/domain/zona-horaria.ts`
como función pura `hoyEnZona(zona, ahora)` — usa `formatToParts`, nunca `format()`, para no
depender de la puntuación del locale (mismo criterio que `formato-fecha.ts:95-109`).

### D7 — El invariante "pantalla = CSV byte a byte", ahora testeado

> **Enmienda (D15) — el enunciado cambia, el test no.** El CSV lo genera el backend, que no
> conoce la preferencia de vista. El CSV sale **siempre en la zona del tenant**. Por eso el
> invariante deja de ser universal y pasa a enunciarse condicionado:
> **`pantalla EN VISTA DE TENANT` = CSV, byte a byte.**
> Los dos specs de paridad y el fixture de esta sección **no cambian**: ya alimentan
> `formatearInstante(zona, …)` con una zona explícita, y la capa de vista solo decide qué zona
> se pasa. Lo que sí hay que reescribir es la **prosa** que hoy afirma la versión universal
> (encabezado de `formato-fecha.ts:9-12`), o queda como comentario mentiroso.

Hoy es documentado y no testeado (`formato-fecha.ts:9-12`), con suites separadas. Se cierra
con el **mismo fixture de D2**, consumido por dos specs, uno por suite:

| Spec | Funciones que alimenta |
|---|---|
| `backend/src/shared/infrastructure/csv/csv.paridad.spec.ts` | `fechaHoraCsv`, `diaArgentinoCsv`, y el sufijo de `armar-export-csv.ts` |
| `frontend/src/shared/lib/formato-fecha.paridad.test.ts` | `formatearInstante`, `formatearInstanteComoDiaArgentino`, `hoyFechaCalendario` |

Cada caso del fixture es `{ instante, zona, esperadoInstante, esperadoDia, esperadoHoy }`. Un
test cruzado exigiría que una suite importe de la otra; el monorepo no tiene paquete común y
crearlo excede el alcance. El fixture es el mínimo mecanismo que impide que las dos puntas
diverjan sin poner una suite en rojo, e incluye la **segunda pareja acoplada**: el prefill de
`<input type="date">` y el "hoy" que valida el backend.

Casos obligatorios: `Europe/Madrid` a ambos lados del cambio de horario (último domingo de
marzo y de octubre de 2026), y el cruce de medianoche que ya cubre la matriz vigente.

### D8 — Migración: columna `NOT NULL` con backfill en un solo statement

```sql
-- 20260901120000_add_cliente_zona_horaria
ALTER TABLE "clientes"
  ADD COLUMN "zona_horaria" VARCHAR(64) NOT NULL
  DEFAULT 'America/Argentina/Buenos_Aires';
```

En PostgreSQL 11+ un `ADD COLUMN NOT NULL DEFAULT` no reescribe la tabla y **el backfill es
la propia cláusula**: nunca existe un NULL observable y el resultado **no depende del conteo
real de tenants de producción**, que sigue sin verificar. El `DEFAULT` se conserva como
backstop de las escrituras que no pasan por la aplicación (seeds, scripts); el dominio sigue
siendo la autoridad. Una migración ya aplicada no se edita: por eso columna y backfill van
juntos, no en dos archivos.

`VARCHAR(64)` da margen sobre el ID IANA más largo (`America/Argentina/ComodRivadavia`, 31).
Por la regla de topes espejados del AGENTS.md, `ZONA_HORARIA_MAX_LENGTH = 64` vive en el VO,
el DTO lo importa, y el frontend lo copia con **centinela** en su test —
`frontend/src/features/clientes/limites.ts` es el lugar exacto que ese patrón ya ocupa.

### D9 — Las 16 columnas `@db.Date` no se tocan: la ausencia del parámetro es el guard

> **Enmienda.** El guard se extiende sin excepciones a la capa de vista: una columna
> `@db.Date` **nunca** recibe doble lectura. No existe variante de doble lectura para
> `formatearFechaCalendario`, igual que no existe parámetro de zona. La ausencia sigue siendo
> el guard, ahora contra dos formas de romperlo en vez de una.

`fechaCsv()` y `formatearFechaCalendario()` **no reciben zona**, ni opcional ni con default.
No es un comentario: es que no existe forma de pasarles una. El `TrampaDate` de la suite del
frontend y la guardia cruzada `reportarClasificacion` se conservan intactos. La advertencia
del schema sobre `Feriado.fecha` (`prisma_master/schema.prisma:476,488`) se reescribe
nombrando el símbolo nuevo, sin cambiar su sentido.

---

## Decisiones de arquitectura — enmienda: la capa de vista (D10–D15)

### D10 — Dónde vive la preferencia de vista del usuario

| Opción | Costo real | Decisión |
|---|---|---|
| **`localStorage` del navegador**, con guards de SSR y cuota | 1 módulo + 1 hook, espejando `theme-provider.tsx` | **Elegida** |
| Columna `zonaVista` en `master.usuarios` + claim en el JWT | Migración + endpoint self-service **que no existe** + caso de uso + DTO + claim + segundo bump de payload | Rechazada |

**Razón 1 — el servidor nunca lee este valor.** Bajo el invariante de la enmienda, la
validación de dominio, el SLA, el CSV y el prefill hablan el reloj del **tenant**. La zona de
vista no cambia ni un byte de lo que el backend calcula, decide o exporta. Un dato que el
servidor jamás consulta no tiene por qué vivir en la base del servidor: sería una columna que
solo se escribe.

**Razón 2 — el costo del camino por base está subestimado, y es verificable.** Los endpoints
de `usuarios.controller.ts` son todos de administración: los cuatro de escritura
(`POST`, `PATCH :id/rol`, `PATCH :id`, `PATCH :id/permisos`) van con `AdminClienteGuard`, y no
hay ninguna ruta donde un usuario se edite a sí mismo. Persistir la preferencia en `Usuario`
obliga a **inventar la primera superficie self-service del proyecto** — con su propia decisión
de autorización, su DTO y sus tests — para un toggle de presentación. Del otro lado, el patrón
de preferencia local ya está construido, probado y con sus modos de falla resueltos:
`theme-provider.tsx:38,69-71` (lectura, escritura y degradación silenciosa cuando
`localStorage` no está disponible) e `idle-storage.ts` (guards de SSR, modo privado y cuota).

**Razón 3 — la semántica correcta ES por dispositivo.** El motivo para leer en hora de Madrid
es estar físicamente en Madrid. Eso es una propiedad del lugar y del dispositivo, no de la
identidad: la misma persona que viaja quiere la zona del aparato que tiene en la mano, no la
que eligió tres meses atrás desde otra ciudad. Reconfigurarla por dispositivo no es un peaje
del diseño: es el comportamiento que se quiere.

**Y sobrevive al login nuevo.** `localStorage` no está atado a la cookie de sesión: la
preferencia atraviesa logout/login, el 401 global del bump de payload y el refresh de 15
minutos. El camino por JWT tendría la propiedad inversa — la preferencia viajaría en el
artefacto que justamente se invalida.

**Contrato.** Clave `zona-vista`, un solo módulo de I/O (`shared/auth/`-style, mismo criterio
que `idle-storage.ts`): lectura que devuelve `null` ante ausencia, valor inválido o
`localStorage` no disponible, y escritura que degrada a no-op silencioso. **El valor leído se
valida con la misma `esZonaValida` del frontend antes de usarse** — un `localStorage`
manipulado es entrada de usuario, y una zona inválida haría explotar cada render con un
`RangeError`. Ante `null`, aplica D12.

### D11 — Cómo llega al frontend: no llega por el JWT, y el bump sigue siendo uno solo

**La preferencia de vista NO viaja en el token.** Se resuelve enteramente en el cliente.
Consecuencia directa y buscada: **`VERSION_PAYLOAD_JWT` sube 2 → 3 una sola vez**, exactamente
el bump que D4 ya justificó y que el plan de tareas ya aisló en su propio commit. **No hay un
segundo bump, ni un segundo 401 global.** Dos bumps encadenados costarían dos ventanas de
refresh forzado sobre toda la base de usuarios, para transportar un dato que el backend no
usa: es costo puro.

El claim `zona_horaria` del JWT sigue significando **la zona operativa del tenant** y nada
más. Se conserva ese nombre —renombrarlo sería churn cosmético sobre un commit ya planificado—
y la ambigüedad se cierra donde se lee: el JSDoc de `JwtPayload` declara que **la zona de
vista del usuario no viaja en el token**. Por construcción hay una sola zona en el payload, y
sale de `ScopeResuelto`, que es scope de tenant por definición.

**Cómo llegan las dos zonas al render.** `SessionContext` ya se hidrata sin fetch desde el
Server Component `(dashboard)/layout.tsx:33-46`, que decodifica la cookie `at`. De ahí sale
`zonaTenant`. `zonaVista` sale del módulo de D10 y se resuelve en un efecto de cliente —nunca
durante el render del servidor, donde `localStorage` no existe—, con `zonaTenant` como valor
de arranque para que no haya parpadeo de horas.

### D12 — El default de la vista: la zona del tenant, con el navegador como sugerencia explícita

| Opción | Qué pasa el día del deploy | Decisión |
|---|---|---|
| Default = **zona del tenant** | Nada cambia para nadie | **Elegida** |
| Default = zona del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`) | Toda persona cuyo SO no esté en la zona del tenant ve horas distintas sin haber pedido nada | Rechazada |

**Razón.** El default del navegador es una **resolución implícita de zona**, y este diseño ya
la prohibió dos veces por el mismo motivo: D5 rechaza la zona con default porque "un call site
olvidado formatea en la zona equivocada sin error", y el requisito de rutas sin tenant exige
UTC declarado en vez de la zona del navegador. Admitirla acá como default sería aplicar el
criterio opuesto en la misma pantalla. Además, el cambio silencioso de lo que la gente ve el
día del deploy es exactamente el riesgo que el bump de payload y el aviso de re-lectura
histórica se ocuparon de hacer explícito en el resto del cambio.

**Pero el navegador no se descarta: se ofrece.** Si hay preferencia guardada, gana siempre. Si
no la hay **y** la zona del navegador difiere de la del tenant **y** es una zona válida, el
indicador de zona muestra una sugerencia descartable —"Tu dispositivo está en `Europe/Madrid`.
¿Querés leer las horas así?"— y **solo un clic explícito escribe la preferencia**. Detectar sin
decidir es la misma variante que `tipoActualFueraDeCatalogo` ya cerró en este repositorio: la
ausencia de un dato no autoriza a suponer una intención. Sin esta sugerencia la función existe
y nadie en Madrid la encuentra, que es el modo de falla real de un toggle escondido.

### D13 — La forma de la doble lectura en la interfaz

Tres reglas, y ninguna admite excepción por pantalla.

**Regla 1 — un indicador global, siempre.** El encabezado del shell muestra el reloj de
negocio (`Reloj del tenant: America/Argentina/Buenos_Aires`) y, cuando la vista difiere,
también la vista (`· Ves en Europe/Madrid`). Ahí vive el control para cambiarla. Esto satisface
el requisito de la spec —"la zona usada es visible en la interfaz"— **una vez**, no una vez por
celda, y es lo que vuelve interpretable cualquier hora suelta sin repetir una etiqueta.

**Regla 2 — la doble lectura aparece SOLO si las dos zonas difieren.** Con
`zonaVista === zonaTenant` la salida es **byte a byte la de hoy**: una sola lectura, sin
sufijo, sin etiqueta, sin punto medio. Los dos tenants de producción están en ese caso, así
que el día del deploy ninguna tabla cambia de ancho. Esto no es una optimización visual: es lo
que evita que el 100% de las pantallas pague el costo de un caso que hoy afecta a una persona.

**Regla 3 — la primaria es la de vista, la secundaria es la del tenant, y la etiquetada es la
del tenant.** `18:00 · 13:00 (America/Argentina/Buenos_Aires)`. El número sin etiqueta es el
que se lee por default, y la persona configuró la vista precisamente para que ese sea el suyo;
el que necesita etiqueta es el que pertenece al reloj de otro. Y etiquetar el del tenant pone
el nombre del reloj **exacto donde vive la ambigüedad**: es ese número el que gobierna el SLA,
el CSV y la validación.

**Contrato de código — la doble lectura no vive dentro de `formato-fecha.ts`.**

```ts
// frontend/src/shared/lib/formato-fecha.ts — sigue siendo puro y de UNA lectura (D5).
export function formatearInstante(zona: string, iso: string): string;

// La composición vive aparte y devuelve PARTES, nunca una cadena armada.
export interface LecturaDoble { vista: string; tenant: string; difieren: boolean; etiquetaTenant: string; }
export function lecturaDoble(zonaVista: string, zonaTenant: string, iso: string): LecturaDoble;
```

Devolver partes y no una cadena es deliberado por dos motivos. Primero, meter el `·` y la
etiqueta adentro de `formato-fecha.ts` mezclaría presentación con formateo en el único módulo
que controla su puntuación a propósito (`partesDeFecha` existe justamente para no depender de
la puntuación del locale). Segundo, y decisivo: **el spec de paridad de D7 tiene que poder
seguir llamando a `formatearInstante` sin pasar por acá**, o la garantía byte a byte se vuelve
inverificable.

**La etiqueta se deriva, nunca se tabula.** Sale de `formatToParts` con
`timeZoneName: "short"`, igual que el resto del módulo. Una tabla de abreviaturas
(`ART`, `CET`, …) sería un catálogo, que es exactamente lo que D2 rechazó: se desactualiza,
difiere entre motores y no cubre las zonas que no tienen abreviatura consagrada. **Pregunta
abierta medible (ver abajo):** qué devuelve `timeZoneName: "short"` para
`America/Argentina/Buenos_Aires`; si resuelve a una forma tipo `GMT-3` en vez de `ART`, eso es
**aceptable** y el `ART` del pedido original queda como ilustración, no como especificación. Si
la abreviatura resultara ilegible o vacía, el fallback es el ID IANA completo, que siempre es
inequívoco.

**Riesgo de divergencia entre motores: cerrado por construcción.** La etiqueta la produce
**solo el frontend**. El CSV nunca la lleva. No hay dos implementaciones que puedan discrepar.

**Densidad.** El sufijo solo alcanza a los instantes (`@db.Timestamptz`), y en las tablas de
este proyecto la mayoría de las columnas de fecha son `@db.Date` —`fechaSolicitud`,
`fechaOrden`, `fechaCotizacion`, `fechaAdquisicion`, ciclos, preventivo—, que por D9 **no
reciben nada**. El radio real del ensanchamiento son los listados de tickets y las líneas de
tiempo de operaciones. Es acotado y se paga solo cuando las zonas difieren.

### D14 — El prefill de calendario y el mensaje de rechazo hablan el reloj del TENANT

Es el punto más filoso de la enmienda: alguien en Madrid a las 00:30 está en el día D mientras
el tenant argentino todavía está en D−1. Si el prefill hablara la vista, el servidor rechazaría
como futura una fecha que la pantalla acaba de proponer.

**Decisión 1 — el "hoy" del producto es uno solo: el del tenant.** El prefill de todo
`<input type="date">` usa el día calendario de la zona del **tenant**, con independencia de la
preferencia de vista. Vale para los tres call sites vivos de `hoyFechaCalendario()`
(`registrar-avance-dialog.tsx:63`, `equipo-create-dialog.tsx:70`, `equipo-edit-dialog.tsx:119`),
sin excepción por módulo.

**Decisión 2 — el guard es la ausencia de la alternativa, no la disciplina del call site.** El
hook expone **una sola** función de "hoy", sin parámetros y cerrada sobre la zona del tenant:

```ts
const { hoyDelTenant, zonaTenant, zonaVista, lecturaDoble } = useFormatoFecha();
// hoyDelTenant(): string  →  "2026-03-26" (YYYY-MM-DD, para <input type="date">)
// NO existe hoyDeLaVista(). Esa ausencia es el guard.
```

Exponer `zonaVista` como string y confiar en que nadie la pase a un "hoy" es el mismo error que
D5 rechazó con la zona por default. El mecanismo que este repositorio ya usa —"la ausencia del
parámetro es el guard" (D9)— se aplica igual acá: **la función equivocada no existe.**

**Decisión 3 — la fecha imposible se vuelve inalcanzable antes de ser rechazada.** El
`<input type="date">` lleva `max={hoyDelTenant()}`, que grisa los días posteriores en el
selector nativo. **Honestidad sobre su alcance:** el formulario de compras declara `noValidate`
(`registrar-avance-dialog.tsx:124`), así que `max` **no bloquea el submit** — es ayuda visual
en el selector, no un guard. El guard sigue siendo el dominio.

**Decisión 4 — la etiqueta del campo dice de qué reloj habla, y solo cuando importa.** Si las
zonas difieren, el campo lleva una nota al pie:

> Fecha en el reloj del tenant (`America/Argentina/Buenos_Aires`): ahí hoy es **26/03/2026**,
> aunque en tu zona ya sea 27/03/2026.

Si no difieren, no aparece nada. Sin esta nota, la persona en Madrid ve un prefill con el día
de ayer y no tiene forma de saber por qué: eso es un ticket de soporte sobre el propio sistema
de soporte, que es el costo que esta decisión existe para evitar.

**Decisión 5 — el mensaje de error nombra el día y el reloj, sin romper D6.**

```ts
// compras.errors.ts — recibe el MISMO hoyTenant: Date que la entidad ya tiene.
new FechaEtapaFuturaError(itemId, hoyTenant)
// → «La fecha de etapa del ítem "…" no puede ser posterior al 26/03/2026,
//    que es el día de hoy en el reloj del tenant.»
```

`hoyTenant` ya viene truncado a medianoche UTC (contrato de `hoyEnZona`, mismo criterio que
`soloFecha`), así que leer sus componentes UTC devuelve el día calendario del tenant **exacto,
sin `Intl` y sin zona**. El dominio no gana ninguna dependencia nueva y `validarFechaEtapa`
no cambia de firma. El error nombra el reloj **genéricamente** ("el reloj del tenant") en vez
del ID IANA: la entidad no tiene el ID, y meterlo ahí obligaría a pasar la zona al dominio,
que es lo que D6 rechazó. El frontend, que sí tiene el ID, lo agrega al mostrar.

**Deuda declarada, no incluida.** Hoy el schema Zod de compras **no** valida "fecha no futura"
(`features/compras/schemas.ts:195,209,220,227`: `z.string().optional()` y el helper `fecha()`,
que solo exige parseabilidad). Es la clase 2 de fallo de topes del AGENTS.md —regla en el
backend y no en el front, con el usuario comiéndose un 422 remoto por algo que se veía en
pantalla— y es **preexistente**, no la introduce este cambio. Espejarla exige que los schemas
pasen a ser factories parametrizadas por `hoyDelTenant()`, porque hoy son constantes de
módulo. Se declara y no se implementa acá: cerrarla dentro de este ciclo mezcla dos problemas
y agranda un work unit que ya está al límite.

### D15 — El CSV sale en zona del tenant, y el invariante de D7 se re-enuncia

**Decisión.** El CSV se exporta **siempre en la zona del tenant**. No se le pasa la preferencia
de vista, ni por query param ni por header. Motivos, en orden de peso:

1. **El CSV es un documento compartido.** Dos personas del mismo tenant exportando el mismo
   ciclo tienen que obtener archivos idénticos, o el archivo deja de ser comparable y de servir
   como evidencia.
2. **El nombre del archivo ya habla ese reloj.** El sufijo sale de `hoyEnZona` con la zona del
   tenant (D6/`armar-export-csv.ts`); un contenido en zona de vista con un nombre en zona de
   tenant sería incoherente dentro del mismo archivo.
3. Pasarla al backend implicaría un parámetro nuevo en los **cuatro** exportadores para un dato
   que el dominio no debe conocer.

**Re-enunciado del invariante.** Donde hoy dice "pantalla = CSV byte a byte", ahora dice:

> **`pantalla EN VISTA DE TENANT` = CSV, byte a byte.**

**Qué implica para el test de D7: nada.** Los dos specs de paridad alimentan
`formatearInstante(zona, …)` y `fechaHoraCsv(zona, …)` con **la misma zona explícita** y
comparan las salidas. Nunca pasaron por la capa de vista, que es únicamente la decisión de qué
zona se le pasa a esas funciones desde un componente. El fixture y los asserts quedan intactos.

**Qué sí hay que cambiar, o el test queda mintiendo por su prosa:** el encabezado de
`formato-fecha.ts:9-12` afirma la versión universal del invariante y hay que reescribirlo con
la condición; y el spec de paridad lleva en su encabezado la razón por la que sigue siendo
válido bajo dos capas. Un assert correcto con un comentario falso arriba es la forma de
documentación caducada que el AGENTS.md de este repositorio nombra explícitamente.

**Y una salvaguarda de producto.** Cuando `zonaVista !== zonaTenant`, la pantalla de
exportación lo dice antes de descargar: *"El archivo se exporta en el reloj del tenant
(`America/Argentina/Buenos_Aires`), no en tu zona de vista."* Sin ese aviso, la primera
reacción ante un CSV con horas "corridas" es reportarlo como defecto.

---

## Impacto en los work units ya definidos

`sdd-tasks` se vuelve a correr con esta tabla. **No se editó `tasks.md`.**

| WU | Estado | Qué cambia |
|---|---|---|
| **WU-0** — fixture de paridad | **SIN CAMBIOS** | El fixture describe la relación zona↔instante, que es independiente de quién elige la zona. Los casos de doble lectura, si hacen falta, son **aditivos** y entran por WU-8. **El apply en vuelo sigue siendo válido tal cual.** |
| **WU-1** — VO `ZonaHoraria` | **SIN CAMBIOS** | El VO es del backend y la zona de vista nunca llega al backend. Su superficie (`crear`/`desdePersistencia`/`valor`/`equals`/`hoyEnZona`/`partesEnZona`/`ZONA_HORARIA_MAX_LENGTH`) alcanza sin agregados. **El apply en vuelo sigue siendo válido tal cual.** |
| **WU-2a** — columna, entidad, mapper | Sin cambios | — |
| **WU-2b** — endpoint `PATCH /clientes/:id/zona-horaria` | Sin cambios | — |
| **WU-2c** — ABM frontend + Ayuda | **Se amplía** | `backend/ayuda/zona-horaria.md` tiene que explicar **las dos capas**: cuál es el reloj de negocio y cuál la vista personal. Una Ayuda que describa una sola capa miente desde el día uno. El resto del WU (diálogo, Zod espejo, centinela de tope) no cambia. |
| **WU-3a** — `TenantContext` | Sin cambios | — |
| **WU-3b** — claim `zona_horaria` | Sin cambios de código | Solo se agrega al JSDoc de `JwtPayload` que ese claim es la zona **del tenant** y que la de vista no viaja en el token. |
| **WU-3c** — `VERSION_PAYLOAD_JWT` 2 → 3 | **Sin cambios, y se confirma que es el ÚNICO bump** | La enmienda no agrega claims. No hay segundo bump ni segundo 401 global. |
| **WU-4** — la zona entra por parámetro | **Se acota: mantiene su alcance actual** | Sigue siendo una sola zona (la del tenant) por parámetro, los 18 call sites, `ZONA_SIN_TENANT`, el canario invertido y el test anti-caché. **La tarea 4.9 ("hacer visible la zona") se mueve a WU-8**, donde el indicador ya nace con las dos zonas en vez de nacer con una y reescribirse. Así el commit C4a conserva su tamaño estimado y no se desborda. |
| **WU-5** — CSV en zona del tenant | **Sin cambios de código** | Se agrega a 5.3 que el encabezado del spec de paridad enuncie el invariante **condicionado** (D15). El aviso de exportación es frontend: va a WU-8. |
| **WU-6** — el dominio recibe `hoyTenant` | **Se amplía en un punto** | `FechaEtapaFuturaError` pasa a recibir `hoyTenant: Date` y a nombrar el día y el reloj (D14, decisión 5), con su test de mensaje. Entra en **C6b**: es el mismo comportamiento que se está cambiando. Radio: la clase de error, su spec y los asserts de mensaje del controller. |
| **WU-7** — muerte del offset fijo | **Se amplía la lista de comentarios caducados** | Sumar: el encabezado de `formato-fecha.ts:9-12` (invariante universal → condicionado) y el JSDoc de `OFFSET_ARGENTINA_MS`. **Atención de orden:** el JSDoc de `FechaEtapaFuturaError` apunta a `domain/services/fecha-argentina.ts`, archivo que **C6a borra** — esa referencia queda colgada en cuanto C6a entra, así que se corrige en C6a, no se posterga a C7. |
| **WU-8 (NUEVO)** — la vista del usuario | **Se agrega** | Depende de WU-4, WU-5 y WU-6. Contenido: módulo de I/O de `localStorage` con guards de SSR/cuota y validación del valor leído (D10); resolución de `zonaVista` en `useFormatoFecha()` (D11); indicador global de zona con el control de cambio y la sugerencia descartable del navegador (D12, D13 regla 1); `lecturaDoble()` y su componente de presentación (D13); `hoyDelTenant()`, `max` del `<input type="date">` y la nota al pie del campo (D14, decisiones 1–4); aviso en la pantalla de exportación (D15); actualización de `backend/ayuda/zona-horaria.md`. |

**Trazabilidad nueva.** Los requisitos de la spec vigente no se invalidan: la enmienda agrega
comportamiento por encima, no lo contradice. El requisito "Visualización en pantalla en la
zona del tenant, con la zona visible" queda cubierto por WU-4 (formateo por parámetro) **más**
WU-8 (visibilidad de la zona). El requisito de paridad CSV pasa a cubrirse con su enunciado
condicionado.

---

## Cambios de archivo

| Archivo | Acción | Qué |
|---|---|---|
| `backend/prisma_master/schema.prisma` | Modificar | Columna `zonaHoraria` + doc; actualizar la advertencia de `Feriado.fecha` |
| `backend/prisma_master/migrations/20260901120000_add_cliente_zona_horaria/migration.sql` | Crear | D8 |
| `backend/src/shared/domain/zona-horaria.ts` | Crear | VO `ZonaHoraria` (`crear`/`desdePersistencia`/`valor`/`equals`), `esZonaValida`, `hoyEnZona`, `partesEnZona`, `ZONA_HORARIA_MAX_LENGTH` |
| `backend/src/shared/domain/zona-horaria-argentina.ts` | Borrar | Reemplazado por el VO |
| `backend/src/shared/application/ports/i-reloj-tenant.ts` | Crear | Puerto `IRelojTenant.hoy(): Date` + token DI |
| `backend/src/shared/infrastructure/reloj-tenant.ts` | Crear | Implementación que lee `TenantContext` |
| `backend/src/shared/tenancy/tenant-context.ts` | Modificar | Campo `zonaHoraria` en `TenantContextData` |
| `backend/src/shared/shared.module.ts` | Modificar | Provee `IRelojTenant` |
| `backend/src/shared/infrastructure/csv/csv.ts` | Modificar | `diaArgentinoCsv`/`fechaHoraCsv` reciben `ZonaHoraria`; `fechaCsv` sin cambios (D9) |
| `backend/src/shared/application/armar-export-csv.ts` | Modificar | Sufijo del archivo vía `hoyEnZona` |
| `backend/src/auth/infrastructure/guards/tenant.guard.ts` | Modificar | Bindea la zona (sin query nueva) |
| `backend/src/auth/domain/ports/i-token.service.ts` | Modificar | Claim `zona_horaria`; `VERSION_PAYLOAD_JWT` → 3 |
| `backend/src/auth/application/use-cases/resolver-scope.ts` | Modificar | `ScopeResuelto.zonaHoraria` |
| `backend/src/auth/application/use-cases/{login,refresh-token,switch-tenant}.use-case.ts` | Modificar | Propagan el claim |
| `backend/src/clientes/domain/entities/cliente.entity.ts` | Modificar | Prop + getter + `configurarZonaHoraria()` |
| `backend/src/clientes/infrastructure/persistence/prisma/cliente.mapper.ts` | Modificar | Mapea la columna (fuera del `Omit`) |
| `backend/src/clientes/application/use-cases/configurar-zona-horaria-cliente.use-case.ts` | Crear | Espeja `configurar-csat-cliente.use-case.ts` |
| `backend/src/clientes/interface/dtos/cliente.dto.ts` | Modificar | `ConfigurarZonaHorariaClienteDto`; zona opcional en `CreateClienteDto` |
| `backend/src/clientes/interface/controllers/clientes.controller.ts` | Modificar | `PATCH /clientes/:id/zona-horaria` |
| `backend/src/clientes/clientes.module.ts` | Modificar | Wiring del caso de uso |
| `backend/src/compras/domain/services/fecha-argentina.ts` | Borrar | Se renombra |
| `backend/src/compras/domain/services/fecha-tenant.ts` | Crear | Solo `soloFecha()` |
| `backend/src/compras/domain/entities/item-compra.entity.ts` | Modificar | `hoyTenant` como parámetro (D6) |
| `backend/src/compras/application/use-cases/{registrar-orden,registrar-recepcion,registrar-entrega,editar-fecha-etapa}-de-item.use-case.ts` | Modificar | Inyectan `IRelojTenant` |
| `backend/src/compras/application/use-cases/exportar-compras.use-case.ts` | Modificar | Sufijo vía zona del tenant |
| `backend/src/compras/compras.module.ts` | Modificar | Wiring del reloj |
| `frontend/src/shared/lib/formato-fecha.ts` | Modificar | Zona por parámetro; muere `OFFSET_ARGENTINA_MS` |
| `frontend/src/shared/hooks/use-formato-fecha.ts` | Crear | Liga la zona de `SessionContext` (D5) |
| `frontend/src/shared/api/types.ts` | Modificar | Claim `zona_horaria` en `JwtPayload` |
| `frontend/src/features/clientes/{schemas,limites,types}.ts` | Modificar | Zod espejo + tope con centinela |
| `frontend/src/features/clientes/components/configurar-zona-horaria-dialog.tsx` | Crear | Espeja `configurar-csat-dialog.tsx`; incluye el aviso de re-lectura histórica |
| 18 componentes de `frontend/src/features/**` | Modificar | Pasan a `useFormatoFecha()` |
| `shared-fixtures/formato-fecha-paridad.json` | Crear | D2 + D7 |
| `backend/src/shared/infrastructure/csv/csv.paridad.spec.ts` | Crear | D7 |
| `frontend/src/shared/lib/formato-fecha.paridad.test.ts` | Crear | D7 |
| `backend/ayuda/zona-horaria.md` | Crear | Zona operativa, dónde se configura, propagación ≤15 min, re-lectura histórica |

### Archivos que agrega la enmienda (capa de vista, WU-8)

Ninguna fila de la tabla de arriba se borra ni cambia de acción. Estas se **suman**:

| Archivo | Acción | Qué |
|---|---|---|
| `frontend/src/shared/auth/zona-vista-storage.ts` | Crear | I/O de `localStorage` con guards de SSR/cuota; espeja `idle-storage.ts` (D10) |
| `frontend/src/shared/hooks/use-formato-fecha.ts` | Modificar (ya se crea en WU-4) | Resuelve `zonaTenant` + `zonaVista`; expone `hoyDelTenant()` y `lecturaDoble` (D11, D14) |
| `frontend/src/shared/lib/lectura-doble.ts` | Crear | `lecturaDoble()` — devuelve partes, nunca una cadena armada (D13) |
| `frontend/src/components/shell/…` (indicador de zona) | Modificar | Indicador global con las dos zonas, control de cambio y sugerencia descartable (D12, D13) |
| `frontend/src/features/compras/components/registrar-avance-dialog.tsx` | Modificar | `hoyDelTenant()`, `max`, nota al pie del campo (D14) |
| `frontend/src/features/equipos/components/{equipo-create-dialog,equipo-edit-dialog}.tsx` | Modificar | `hoyDelTenant()` en lugar de `hoyFechaCalendario()` sin zona (D14) |
| `backend/src/compras/domain/errors/compras.errors.ts` | Modificar | `FechaEtapaFuturaError(itemId, hoyTenant)` nombra día y reloj (D14) — **entra por WU-6** |
| `backend/ayuda/zona-horaria.md` | Modificar | Las dos capas de reloj (WU-2c lo crea, WU-8 lo completa) |

---

## Contratos

```ts
// backend/src/shared/domain/zona-horaria.ts — dominio puro (solo Intl, plataforma).
export const ZONA_HORARIA_MAX_LENGTH = 64;
export function esZonaValida(candidata: string): boolean;

export class ZonaHoraria {
  static crear(raw: string): ZonaHoraria;            // valida; throw (precondición del caller)
  static desdePersistencia(raw: string): ZonaHoraria; // valida y nombra el clienteId al fallar
  get valor(): string;
  equals(otra: ZonaHoraria): boolean;
}

/** Día calendario de `zona` a las `ahora`, truncado a medianoche UTC (mismo criterio que `soloFecha`). */
export function hoyEnZona(zona: ZonaHoraria, ahora: Date): Date;
```

`desdePersistencia` **sí valida**, a diferencia del criterio de `validarLargos`
(`cliente.entity.ts:35-59`, que exime a `reconstitute`). La exención de allá existe porque
hay filas legítimas fuera de rango creadas por una puerta vieja; acá **ninguna puerta pudo
escribir una zona inválida** — la columna nace con backfill válido y todo escritor pasa por el
VO. Fallar en el guard nombrando el tenant es preferible a un `RangeError` opaco por cada
render.

```ts
// item-compra.entity.ts — el dominio recibe el día, no la zona ni el reloj.
registrarOrden(cantidadOrdenada: number, hoyTenant: Date, fecha: Date = hoyTenant): Result<void, DomainError>;
```

---

## Estrategia de tests

| Capa | Qué | Cómo |
|---|---|---|
| Unit (dominio) | VO: alias válidos, inválidos, tope de largo; `hoyEnZona` cruzando DST de `Europe/Madrid` | Recorre `shared-fixtures/`; el caso `America/Argentina/Buenos_Aires` es el centinela anti-catálogo |
| Unit (dominio) | `validarFechaEtapa` con `hoyTenant` inyectado | Sin reloj real: el test provee el día. Cubre el caso de la propuesta: 00:30 en Madrid **no** se rechaza como futura |
| Unit (frontend) | Matriz de zonas parametrizada por argumento | Canario invertido: cambia con el parámetro, **no** cambia con `process.env.TZ` |
| Paridad | Pantalla = CSV byte a byte | Fixture compartido, un spec por suite (D7) |
| Espejo | Zod del front contra el VO del backend | Ambos recorren `zonasValidas`/`zonasInvalidas` del mismo fixture |
| Integración | `TenantGuard` bindea la zona sin query adicional | Espía el repositorio: exactamente un `findById` por request |
| Integración | Migración: ninguna fila con `zona_horaria` NULL o inválida | Contra `soporte_master_test` (`usarLockMasterTest()` si trunca) |
| Mutación (verify) | Reintroducir un offset fijo debe poner en rojo el bloque `Europe/Madrid` | Si no muere, el test mide otra cosa |

> **Enmienda — cobertura de la capa de vista (WU-8).** Se suma a la tabla de arriba; nada de
> lo anterior se retira.

| Capa | Qué | Cómo |
|---|---|---|
| Unit (frontend) | `lecturaDoble` con zonas **iguales** → salida byte a byte idéntica a `formatearInstante` y `difieren === false` | Es el caso de los dos tenants reales: el día del deploy nada cambia en pantalla |
| Unit (frontend) | `lecturaDoble` con zonas **distintas** → las dos lecturas, con la del tenant etiquetada | Assert de contenido, no de presencia de un `·` |
| Unit (frontend) | Assert de ausencia **con su hermano invertido**: no existe doble lectura para `formatearFechaCalendario` (D9), y sí existe para `formatearInstante` | Sin el par, dos estados distintos renderizan igual |
| Unit (frontend) | `zona-vista-storage`: valor ausente, valor inválido, `localStorage` que lanza (cuota/privado), SSR | Espeja los casos que `idle-storage.test.ts` ya cubre |
| Unit (frontend) | Default sin preferencia = `zonaTenant`, **nunca** `Intl…resolvedOptions().timeZone` | Espiar `resolvedOptions` y afirmar que no gobierna el default (D12) |
| Unit (frontend) | `hoyDelTenant()` con reloj congelado a las 00:30 de `Europe/Madrid` devuelve el día **argentino** (D−1) | Es el caso que motivó D14; el fixture ya lo trae |
| Unit (dominio) | El mensaje de `FechaEtapaFuturaError` contiene el día del tenant y nombra el reloj | Assert sobre el texto, que es lo que ve el usuario |
| Mutación (verify) | Hacer que el prefill use `zonaVista` en lugar de `zonaTenant` debe poner en rojo el test de las 00:30 | Si no muere, el guard de D14 no está donde se cree |
| Mutación (verify) | Pasar la preferencia de vista al CSV debe poner en rojo la paridad | Confirma que el CSV sigue anclado al tenant (D15) |

---

## Threat Matrix

N/A — el cambio no toca routing, comandos de shell, subprocesos, automatización de VCS/PR,
clasificación de archivos ejecutables ni integración de procesos.

---

## Migración / rollout

1. Migración (D8): un statement, backfill incluido, sin ventana con NULL.
2. Backend: VO + `TenantContext` + claim + bump de `VERSION_PAYLOAD_JWT`. Al deployar, los
   tokens `v: 2` reciben 401 y refrescan solos.
3. Las tres capas lectoras (frontend, CSV, compras) son **commits reversibles por separado**:
   la zona ya está en la base y en el contexto, y cada capa solo elige si la lee.
4. ABM + artículo de Ayuda en el mismo work unit del módulo `clientes`.
5. Reversión total con datos: poner todos los tenants en
   `America/Argentina/Buenos_Aires` restaura el comportamiento actual sin tocar código.

**No se diseña** invalidación de sesiones (el refresh de 15 minutos alcanza y el bump del
payload cubre el deploy) ni migración de instantes históricos: se re-leen en la zona nueva y
eso es correcto — el diálogo de configuración lo advierte antes de guardar.

> **Enmienda — rollout de la capa de vista.** No agrega ningún paso de migración: no hay
> columna, no hay claim y **no hay un segundo bump de `VERSION_PAYLOAD_JWT`** (D11). El paso 2
> de arriba sigue siendo el único 401 global del cambio. La capa de vista es un commit de
> frontend puro, reversible solo, y su reversión deja el sistema exactamente en el estado que
> describen D1–D9: todo el mundo leyendo el reloj del tenant. Con los dos tenants argentinos
> de producción, el estado por defecto post-deploy es **visualmente idéntico** al de hoy hasta
> que alguien elige explícitamente otra zona de vista.

---

## Deuda declarada (no se implementa acá)

`CalendarioLaboralDia` / `Feriado` (módulo `sla-habil`, `prisma_master/schema.prisma:437-495`)
modelan **una sola configuración global** con `aperturaMinuto`/`cierreMinuto` documentados
como "minutos desde la medianoche LOCAL". No bloquea hoy: el SLA en uso
(`calcular-sla-vence.service.ts`) es reloj 24/7 y no depende de zona. Si `sla-habil` se
retoma, hereda esta ambigüedad multiplicada por tenant y necesitará su propia decisión de
alcance (config por tenant o zona de referencia única).

---

## Preguntas abiertas

- [x] ~~Conteo real de tenants de producción.~~ **CERRADA por la enmienda.** Consulta de solo
      lectura a producción: dos tenants, los dos activos y los dos argentinos — `Cic Lanus` y
      `Santa Cruz` (`activos=2 total=2`). El backfill de D8 los deja a los dos en la zona
      correcta sin intervención, y la verificación post-deploy se reduce a confirmar esas dos
      filas. Es también la evidencia que motiva toda la capa de vista: **no hay ningún cliente
      español**, así que sin esa capa el cambio no le resolvía nada a la persona en Madrid.
- [ ] Zona por defecto de un cliente nuevo: se asume `America/Argentina/Buenos_Aires` (mismo
      valor del backfill). Si el alta debe exigirla explícitamente, es una línea del DTO.
      *(El plan de tareas vigente ya la resolvió por obligatoria en `CreateClienteDto`.)*
- [ ] **Medible en `apply`, no antes:** qué devuelve `Intl.DateTimeFormat` con
      `timeZoneName: "short"` (locale `es-AR`) para `America/Argentina/Buenos_Aires` y
      `Europe/Madrid`, en Node 24 y en el navegador. **No bloquea D13** — la etiqueta se deriva
      en cualquier caso y solo la produce el frontend, así que no hay divergencia posible entre
      motores. Si sale una forma tipo `GMT-3` en vez de `ART`, es aceptable; si sale vacía o
      ilegible, el fallback es el ID IANA completo. El valor observado se fija en el fixture
      para que un cambio de ICU se vea como un test rojo y no como un cambio silencioso de
      copy.
- [ ] **Deuda declarada (D14):** espejar en el schema Zod de compras el rechazo de fecha
      futura. Es preexistente —el front hoy no lo valida— y cerrarla obliga a convertir los
      schemas en factories parametrizadas por `hoyDelTenant()`. Fuera del alcance de este
      ciclo por decisión explícita, no por olvido.
