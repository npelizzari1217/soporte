# Roadmap comercial — seis funciones para vender el producto

Análisis del 2026-08-19. Compara el sistema contra Zendesk, Freshservice, GLPI y
Jira Service Management, y prioriza qué falta para competir.

**Estado: los seis puntos están resueltos — cinco entregados y uno diferido por
decisión.** Actualizado el 2026-10-01 contra el código de `main` (`84342b18`),
archivo por archivo. Los puntos 1, 2, 3, 4 y 5 están entregados; el 6 sigue
diferido. La Fase 0 está integrada y sus dos gates viven en `main`. Desde el
2026-09-29 la decisión de producto del punto 5 se cumple entera: el horario
semanal pasó a ser por cliente. Desde esa fecha entraron a `main` tres ciclos del
módulo de Insumos y Equipos, que no son puntos del roadmap: catálogo único de
componentes, stock usado y seguimiento por número de serie (ver "El módulo de
Insumos").

> **Este documento estuvo desactualizado tres semanas.** Daba por pendientes los
> puntos 2, 3 y 4 y por inexistente el cambio de contraseña, con las cuatro cosas
> construidas y mergeadas. También omitía por completo el módulo de Insumos, que
> es la entrega más grande del período. La corrección del 2026-09-09 repone el
> estado real y deja la evidencia (commit y fecha) en cada fila, para que la
> próxima lectura no dependa de la memoria de nadie.

El reordenamiento del 2026-08-21 sigue vigente: bajo la decisión de que **los
datos de producción son descartables** en esta etapa, es menos trabajo
destruirlos y regenerarlos que convertirlos, así que se prioriza construir el
software sólido sin cargar el peso de las migraciones. Eso agregó una **Fase 0 de
fundación**, hoy terminada — ver "Fase 0" más abajo.

## El marco

Esto **no es un sistema de tickets**: es una suite de operaciones (tickets + SLA
+ inventario de equipos + mantenimiento edilicio + compras con aprobación +
ayuda), multi-tenant y ya en producción: ocho clientes activos en el registro al
2026-09-29.

Eso cambia contra quién se compite:

| Producto | Dónde gana | Dónde le ganamos |
|---|---|---|
| Zendesk | Multicanal, portal, automatizaciones, encuestas | No hace inventario, ni edilicia, ni compras |
| Freshservice | ITSM completo, CMDB, cambios y problemas | No hace mantenimiento edilicio ni pedidos con aprobación |
| **GLPI** | **Gratis, inventario fuerte, muy instalado en la región** | Complejo de operar; sin compras ni edilicia integradas |
| Jira Service Management | Flexibilidad de flujos, integraciones | Sobredimensionado para una PyME |

**GLPI es el competidor real, no Zendesk.** El argumento no puede ser precio:
tiene que ser cubrir compras y edilicia en el mismo lugar, y usarse sin
consultor.

## Los seis puntos

| # | Qué | Dificultad | Estimado | Estado |
|---|---|---|---|---|
| 1 | Exportar a Excel/CSV | Baja | 1-2 días | **HECHO** — del 2026-08-19 (`c442af8`) al 2026-08-20 (`a9bb3fa`), en producción |
| 2 | Reparación ↔ Compra | Media | 3-4 días | **HECHO** — del 2026-08-22 (`d219b50`) al 2026-09-04 |
| 3 | Encuesta de satisfacción | Media | 4-6 días | **HECHO** — del 2026-08-22 (`24b0618`) al 2026-09-04 |
| 4 | Mantenimiento preventivo recurrente | Media | 5-8 días | **HECHO** — del 2026-08-24 (`bd098f9`) al 2026-09-05 |
| 5 | Horario laboral en el SLA | Media | 4-6 días | **HECHO** — 2026-09-09 (`a5ec64d`, PR #146), en producción |
| 6 | Ticket por email entrante | Alta | 2-3 semanas | **DIFERIDO** por decisión del 2026-08-20 |

Estimado restante sobre los seis puntos: **cero**. Lo único que sigue sin
construirse es la recepción de correo del punto 6, diferida por decisión del
2026-08-20.

El plan de dos carriles en paralelo **ya no aplica**: se describe más abajo
porque explica cómo se ejecutaron los puntos 2 a 4, no porque quede trabajo que
repartir.

> **Mantené esta columna al día.** Un roadmap sin estado obliga a reconstruir de
> memoria qué se entregó, y esa reconstrucción falla: el punto 1 estuvo en
> producción varias semanas mientras el documento seguía diciendo "pendiente".
>
> **Volvió a pasar, y mucho más rápido.** La corrección del 2026-09-09 se
> escribió a las 16:59 (`82a3a3c`) y dejó el punto 5 como "el único pendiente".
> Era cierto en ese instante: el punto 5 se mergeó a `main` a las **22:52 del
> mismo día** (PR #146). El documento envejeció **seis horas** después de
> corregirse, y siguió diciendo "pendiente" dos semanas más, hasta el
> 2026-09-23. En un repo donde se mergean varios PRs por día, un estado
> mantenido a mano miente por construcción. **Antes de arrancar cualquier punto,
> verificalo contra el código y contra `git log` — no contra esta tabla.**

## Entregado fuera de los seis puntos

Trabajo que no estaba planificado y que salió de operar el sistema. Se anota acá
para que el roadmap refleje el esfuerzo real, no solo el previsto.

| Qué | Cuándo | Por qué apareció |
|---|---|---|
| Fecha de cierre de tickets: instante real en vez de día truncado | 2026-08-20 (`5a6be20`) | Perseguir una anomalía de zona horaria que resultó falsa; destapó dos defectos reales, uno de ellos con tiempos de resolución NEGATIVOS en el dashboard |
| Configuración de correo SMTP **por cliente** | 2026-08-20 (`d2d90a4`) | Decisión de producto: cada cliente manda con su identidad, nada genérico. Reemplazó el envío global |
| Asignar tickets también a COLABORADOR | 2026-08-20 (`d2d90a4`) | Los colaboradores cumplen funciones de técnico |
| Rotación de la clave del admin, reparada y versionada | 2026-08-20 (`d2d90a4`) | La herramienta existente estaba rota y **reportaba éxito igual** |
| `deploy.ps1`: auto-actualización, orden de correo y chequeo de exit codes | 2026-08-20 (`d2d90a4`) | Cuatro incidentes de deploy en un día, todos por la misma causa |
| **Cambio de contraseña propia** | 2026-08-21 (`dcbf73a`) | Carencia detectada al rotar la clave del admin de producción — ver la sección propia más abajo |
| **Módulo de Insumos**: catálogo, kardex y recepción de compras | 2026-09-04 a 2026-09-09 (`ebd565e` a `db6da31`) | Pedido de producto posterior al análisis del 2026-08-19. **Es la entrega más grande del período** y no figuraba en este documento |
| Compuerta issue-first de CI y `gates.yml` en verde | 2026-09-08 al 09 | La compuerta de calidad existía y nunca había pasado; ver el historial de PRs #119 a #132 |
| Gates de CI partidos por ruta (`gates-backend.yml` / `gates-frontend.yml`) | 2026-09-23 (`1263213`, PR #211) | Las dos compuertas corrían en cada PR, tocara lo que tocara: de 30 jobs caros en los últimos 15 PRs, 16 corrían sobre código que el PR no podía romper. La cuenta agotó los 2.000 minutos mensuales del plan Free y el CI estuvo caído del 2026-09-18 al 2026-10-01, cuando se renovaron los minutos y volvió a correr |
| **Importación de datos legacy**: CLI en `backend/scripts/importacion-legacy/` | 2026-09-25 (`808c24c`; fix `d8d1b97`) | Traer los datos de un sistema anterior a la base de un cliente. El fix hace que un cliente no resuelto falle en voz alta en vez de importarse en silencio |
| Filtro por ciclo en la lista de tickets | 2026-09-25 (`ed8beac`) | Pedido de operación |
| **Vencimiento de SLA en tickets edilicios y de soporte** | 2026-09-25 (`7550c1c`, issue #244) | Esos dos casos de uso nunca publicaban `TicketCreadoEvent`, así que `sla_vence_at` quedaba siempre en `null`: los tickets que nacían por `POST /reparaciones` y `POST /soporte` no tenían SLA |
| **Rotación de `EMAIL_CRYPTO_KEY`** con re-cifrado de las contraseñas SMTP | 2026-09-28 (`9857e1a`) | Era deuda técnica: rotar la clave sin re-cifrar dejaba indescifrable toda contraseña SMTP guardada. La primera rotación real en producción se hizo el 2026-09-29 y destapó dos defectos del script, corregidos el mismo día: un `-DryRun` mal pasado por ssh corría la rotación real, y los archivos de recuperación salían en una sola línea |
| **Reseteo de contraseña olvidada** por mail | 2026-09-28 (`521aca3`) | Lo que la sección del cambio de contraseña dejó "para después" — ver más abajo |
| **Componentes de equipo con catálogo único, stock usado y seguimiento por número de serie** | 2026-09-29 a 2026-10-01 (ciclos `catalogo-unico-componentes`, `stock-usado-componentes` y `repuestos-numero-de-serie`, último commit `84342b18`) | Pedido de producto sobre Insumos y Equipos, posterior al análisis del 2026-08-19. Detalle en "El módulo de Insumos" |

### El módulo de Insumos

No estaba previsto en el análisis del 2026-08-19 y terminó siendo el trabajo más
voluminoso del período: **30 commits y 7 pull requests** (#100, #101, #102, #104,
#108, #109 y #119), entregados en tres entregas más el ABM.

Qué hace hoy: catálogo de insumos con códigos alternativos, familias, unidades de
medida y modelos de equipo con su compatibilidad; kardex de existencias por
movimientos de entrada, salida y ajuste, bajo sección crítica con advisory lock;
recepción de una compra que genera stock; y las pantallas de listado, ficha y
bitácora.

Desde el 2026-09-29 se sumaron tres ciclos, integrados en `main` y en producción (el último,
desplegado el 2026-10-01 en los ocho tenants):

- **Catálogo único de componentes** (`catalogo-unico-componentes`): todo
  componente de un equipo exige un insumo repuesto del cliente; el tipo se deriva
  de la familia y ya no se guarda. Existe un solo flujo de alta, con descuento de
  stock opcional (migración `20260929120000_componentes_insumo_obligatorio`).
- **Stock usado y retiro con dos desenlaces** (`stock-usado-componentes`): cada
  movimiento lleva una condición NUEVO o USADO y el saldo se lleva por condición
  (`condicion` en `backend/prisma_tenant/schema.prisma`). Retirar un componente
  (`retirar-componente.use-case.ts`) tiene dos desenlaces: devolverlo al stock
  como USADO o descartarlo con motivo obligatorio. Reactivar un componente
  depende de ese destino (`reactivar-componente.use-case.ts`).
- **Seguimiento por número de serie** (`repuestos-numero-de-serie`): un insumo
  puede llevarse por unidad (`seguimiento = SERIE`, una `UnidadInsumo` por pieza,
  con serial, condición e historial por serial). Las unidades se cargan en
  entradas, ajustes y recepción de compras; una entregada puede volver al
  depósito y una descartada puede recuperarse
  (`backend/src/insumos/application/use-cases/devolver-entrega.use-case.ts`,
  `recuperar-unidad-descartada.use-case.ts`).

No queda nada pendiente en este módulo: la baja de un equipo entero (devolver
todas sus piezas al stock o descartarlas todas con un motivo común) y el reporte
y exportación del stock ya se entregaron (ver "Baja de equipo completo" y
"Reporte de stock" en "Decisiones de producto ya cerradas").

Se anota acá, y no entre los seis puntos, porque no nació de la comparación
competitiva: nació de operar el sistema.

## Fase 0 — Fundación

Apareció el 2026-08-21 con la decisión de datos descartables. La lógica es
simple: si no vamos a migrar datos, todo el esfuerzo va a que el software quede
bien parado. Pero eso **no sale gratis** — el total no baja, se reasigna: se caen
~4 días de migración y entran ~5-6 de fundación.

| Carril | Qué | Estado |
|---|---|---|
| A | **Saneamiento de tipos del backend** — 119 errores escondidos tras la exclusión `**/*.spec.ts` | 6 work units, **INTEGRADO en `main`** — el gate vive en `backend/tsconfig.json:27`, que documenta que los specs ya no se excluyen |
| B | **Render de fechas del frontend** — 6 copias de `Intl.DateTimeFormat` sin `timeZone` | 7 work units, **INTEGRADO en `main`** — el gate es la regla `no-restricted-syntax` de `frontend/eslint.config.mjs` |
| — | **Cambio de contraseña** (ver más abajo) | **HECHO** — 2026-08-21 (`dcbf73a`) |

> **Corrección del 2026-09-09.** Esta tabla decía "hecho, pendiente merge" para
> los carriles A y B, y la tabla de deuda técnica del final los daba por
> resueltos: el documento se contradecía a sí mismo. Verificado contra el código,
> los dos están integrados y sus dos gates están instalados en `main`.

**Lo que destapó el carril A**, y que justifica el ciclo entero: el renombre del
enum `SOPORTE → TICKETS` nunca llegó a los tests; un campo retirado de una
interfaz seguía vivo en fixtures, con un comentario que afirmaba lo contrario;
una aserción que comparaba `undefined` contra ausente y por eso pasaba sin probar
nada; cinco fixtures construyendo una entidad que no puede existir.

**Lo que destapó el carril B**: un bug de huso horario ya diagnosticado y
corregido en Compras seguía intacto en Equipos, y cinco sitios usaban el
normalizador de `<input type="date">` como formateador de pantalla.

Los dos carriles dejaron **un gate instalado y probado rompiéndolo a propósito**:
`pnpm typecheck` ahora falla si un test tiene un error de tipo, y `pnpm lint`
falla si aparece una séptima copia del formateador de fechas.

### El plan de carriles — **registro histórico**

> **Ya no aplica.** Sin puntos abiertos no hay nada que repartir entre dos
> carriles. Se conserva porque explica cómo se ejecutaron la Fase 0 y los puntos
> 2 a 4, y porque la restricción de las migraciones de Prisma vuelve a morder
> apenas se abran dos frentes de nuevo.

`sdd-apply` no admite dos instancias sobre el mismo cambio, pero el ledger es
**por cambio** y `sdd-attempt handoff` contempla worktrees enlazados. Así que dos
carriles se ejecutan en paralelo, **cada uno en su propio worktree**.

Esto último no es opcional y el motivo no es de git: `acquire` congela el árbol
de referencia, y un commit hecho mientras otro carril tiene un intento abierto le
corrompe la contabilidad de líneas y le bloquea el `settle`.

**El techo son dos carriles, no cuatro** — cada uno exige verificación propia
antes de integrar, y con cuatro el orquestador se vuelve el cuello de botella.

~~Con dos carriles, los puntos 2 a 5 pasan de ~21-30 días en serie a ~12,5-19 de
wall-clock.~~ Los puntos 2 a 4 ya están entregados. Lo que **sigue vigente** es la
restricción: antes de abrir cada ola hay que **aterrizar las migraciones de
Prisma en serie**, porque `schema.prisma` es un archivo solo y dos carriles
escribiéndolo es conflicto garantizado.

### Decisiones de producto ya cerradas (2026-08-21)

Para no re-litigarlas al empezar cada punto.

> **Contrastadas contra el código el 2026-09-09, el 2026-09-23 y el
> 2026-09-29.** La del punto 2 se cumplió tal cual. La del punto 4 **se desvió
> y ya se corrigió**: se había entregado reusando `MANTENIMIENTO`, y el issue
> #135 le dio al preventivo su propio tipo `PREVENTIVO`. **La del punto 5 se
> desvió y ya se corrigió**: se entregó con un horario semanal único y global en
> la base master; el ciclo `feriados-configurables` (issue #216) sumó los
> feriados por cliente y el ciclo `horario-laboral-por-cliente` (2026-09-29)
> pasó el horario semanal a la base de cada cliente. Detalle en el punto
> siguiente.
>
> Cada viñeta de abajo declara **Cumplida** o **Desviación**. No es adorno:
> `scripts/check-roadmap-fresco.mjs` exige esa declaración para todo punto
> marcado HECHO y falla si falta. Desviación declarada, sí; desviación
> silenciosa, no — que es exactamente como se colaron las dos que hubo.

- **Punto 2** — "bloqueada" es un estado **derivado** (tiene ≥1 compra vinculada
  sin recibir), **no** frena `porcentajeAvance`, y **sí** se ve en el listado con
  chip y filtro. El tiempo bloqueado se descuenta del tiempo de reparación que se
  le muestra al cliente.
  **Cumplida**: contrastada contra el código el 2026-09-09 y de nuevo el
  2026-09-23. Se entregó tal cual se acordó, sin desviaciones.
- **Punto 4** — el preventivo genera un **ticket** con `tipoTicket` propio
  "Preventivo", **excluido de las métricas de SLA**. Solicitante: un usuario de
  sistema por tenant, sembrado por el seed.
  **Cumplida, después de una desviación corregida.** La entrega original reusaba
  el tipo `MANTENIMIENTO` de EDILICIA y la exclusión del SLA colgaba de que la
  prioridad del plan tuviera `slaActivo = false` — funcionaba por un mecanismo
  distinto del acordado, y un plan con prioridad de SLA activo entraba en las
  métricas sin que nadie lo notara. El issue #135 (`2617a2a`, cerrado el
  2026-09-09) lo corrigió: existe `TIPO_CODIGO_PREVENTIVO`
  (`backend/src/tickets/domain/tipos-ticket.constants.ts`), el seeder lo siembra
  por tenant y `AplicarSlaUseCase` excluye **por tipo**
  (`aplicar-sla.use-case.ts:166`), no por prioridad.
- **Punto 5** — calendario **por cliente** con default 9-18 lun-vie; feriados
  nacionales AR precargados en el seed más excepciones por cliente; un ticket
  abierto fuera de horario arranca el reloj en la **próxima ventana hábil**.
  Se declara por cláusula:
  - **Cumplida** — próxima ventana hábil: entregada el 2026-09-09
    (`calcular-sla-habil-vence.service.ts`).
  - **Cumplida** — feriados nacionales precargados más excepciones por cliente:
    ciclo `feriados-configurables` (issue #216, integrado el 2026-09-24 en
    `912140e`, en producción desde el deploy del 2026-09-29). Los nacionales
    siguen en `feriados` (master) y se administran desde
    `/admin/feriados-globales` (solo ROOT); cada cliente carga los suyos en
    `feriados_cliente` de su propia base desde `/feriados` (su ADMINISTRADOR).
    El SLA hábil saltea la unión de ambos y nunca los de otro cliente
    (`prisma-feriados-laborales.repository.ts`).
  - **Cumplida, después de una desviación corregida** — horario semanal por
    cliente. La entrega del 2026-09-09 tenía un solo horario global en master.
    El ciclo `horario-laboral-por-cliente` (integrado y en producción el
    2026-09-29, `64555d6`) lo movió a `CalendarioLaboralDiaCliente`, en la base
    de cada cliente, editable desde `/horario-laboral` por su ADMINISTRADOR. El
    SLA hábil lee **solo** el horario del propio cliente, sin unión con master
    (`prisma-calendario-laboral-semanal.repository.ts`), y la tabla master
    `calendario_laboral_dias` se dropeó el mismo día.
- **Reporte de stock** (pedido fuera de los seis puntos; decisiones del dueño del
  2026-10-01, ciclo `reporte-stock-insumos`, exploración en
  `openspec/changes/reporte-stock-insumos/exploration.md`):
  - Solo la **foto del stock actual**; movimientos por período y detalle por
    serie quedan para otro pedido.
  - Una fila por insumo: código, nombre, familia, consumible o repuesto, unidad
    de medida, stock NUEVO, stock USADO, total, punto de reposición y estado de
    reposición.
  - Filtros: familia, consumible o repuesto, solo bajo mínimo. Incluye los
    deshabilitados con una columna de estado y los de stock cero, con la opción
    de ocultarlos.
  - **Sin valorizar**: el insumo no tiene costo.
  - Lo ve y lo exporta quien tiene `INSUMOS:LECTURA`.
  - Exportación CSV como el resto de la aplicación ("Exportar a Excel").
  - Pantalla "Reporte de stock" dentro de la sección Insumos.
  - Cantidades con coma decimal y sin decimales en unidades enteras; un saldo
    negativo se exporta como número y se resalta en pantalla, nunca se esconde.
  **Cumplida** (2026-10-01, ciclo `reporte-stock-insumos`): `GET /insumos/reporte-stock`
  y `/export` (`backend/src/insumos/interface/controllers/reporte-stock-insumos.controller.ts`,
  `INSUMOS:LECTURA`), núcleo `consultar-reporte-stock.use-case.ts` con la misma fórmula que la
  ficha, CSV con tope de 5000 filas (`exportar-reporte-stock.use-case.ts`) y pantalla
  `/insumos/reporte-stock` (`frontend/src/features/insumos/components/reporte-stock-view.tsx`),
  enlazada desde Insumos y Repuestos. Sin desviaciones.
- **Baja de equipo completo** (pedido fuera de los seis puntos; decisiones del
  dueño del 2026-10-01, ciclo `baja-equipo-completo`, exploración en
  `openspec/changes/baja-equipo-completo/exploration.md`):
  - Dos opciones, todo o nada: **devolver todas las piezas al stock** (como
    usadas) o **descartarlas todas**. La misma leyenda queda en todas las piezas.
  - El motivo es una categoría (vejez, donación, rotura, otra) más un texto
    libre; las dos opciones lo llevan, y "otra" exige texto.
  - La baja es **definitiva**: no se deshace.
  - Si el equipo tiene tickets abiertos, la baja se permite con un aviso de
    cuántos hay.
  - El equipo dado de baja sigue en la lista con la etiqueta "Baja", oculto por
    un filtro por defecto; su ficha y su historial siguen visibles. No admite
    agregar piezas ni editarse.
  - Permiso: `EQUIPOS:BORRADO`, el mismo del retiro de una pieza.
  - Descartar todo **no** deja asiento negativo en el stock.
  - El borrado actual queda solo para equipos cargados por error: se bloquea si
    el equipo tiene piezas activas y el botón cambia de nombre.
  - Al devolver al stock, el formulario pide el serial de cada pieza legada de
    un insumo con serie; una pieza cuyo insumo fue borrado frena la baja y se
    informa.
  - Confirmación: resumen y confirmar para devolver al stock; además, escribir
    el nombre del equipo para descartar todo.
  **Cumplida** (ciclo `baja-equipo-completo`, 2026-10-01): `POST /equipos/:id/baja` y
  `GET /equipos/:id/baja/resumen`
  (`backend/src/equipos/application/use-cases/dar-de-baja-equipo.use-case.ts`),
  diálogo de baja
  (`frontend/src/features/equipos/components/equipo-baja-dialog.tsx`), filtro
  "Mostrar equipos dados de baja" en la lista y ficha de solo lectura con banner
  (`equipo-baja-banner.tsx`). Sin desviaciones: las reglas inferidas (no se
  reactivan piezas ni se borra un equipo dado de baja; la exportación sigue el
  filtro de la lista) son consecuencia de la decisión, y las exclusiones de R17
  son decisión, no desviación.

### 1 · Exportar a Excel/CSV — Baja — **ENTREGADO**

> **Entregado** entre el 2026-08-19 (`c442af8`) y el 2026-08-20 (`a9bb3fa`), en
> producción. La tabla de arriba ya lo marcaba; esta sección se quedó sin la
> etiqueta y en tiempo futuro hasta el 2026-09-23. El código vive en
> `backend/src/shared/application/armar-export-csv.ts`,
> `backend/src/shared/infrastructure/csv/csv.ts`,
> `backend/src/shared/domain/tope-filas-export.ts` y, del lado del frontend, en
> `frontend/src/shared/components/exportar-csv-button.tsx` con
> `frontend/src/shared/hooks/use-exportar-csv.ts`. Lo que sigue son las notas de
> diseño originales, que se cumplieron.

Reusar los casos de uso de listado que ya existen, con sus filtros, y volcar a
CSV.

- El permiso ya está previsto: la acción `IMPRESION` existe en `ACCIONES_PISO`
  (`backend/src/shared/domain/acciones.ts`) y está **deliberadamente sin usar**
  en los seis módulos. Es el gancho listo.
- Cuidado: BOM de UTF-8 (sin eso Excel muestra `Reparación` como `ReparaciÃ³n`).
- Cuidado: no bufferear en memoria; exportar en streaming.

### 2 · Reparación ↔ Compra — Media — **ENTREGADO**

> **Entregado** entre el 2026-08-22 (`d219b50`) y el 2026-09-04, tal como estaba
> decidido. La relación N:N vive en `model ReparacionCompra`
> (`backend/prisma_tenant/schema.prisma:503`), y "bloqueada" quedó como estado
> **derivado**: `comprasQueBloquean()` en
> `backend/src/reparaciones/domain/services/bloqueo-reparacion.ts:48` lo calcula
> a demanda en vez de persistirlo. Los casos de uso de vincular y desvincular
> están en `backend/src/reparaciones/application/use-cases/`.
>
> Lo de abajo se conserva como registro de por qué se construyó así.

Conectar una reparación con la compra que la está frenando. Responde la pregunta
que **ninguno de los cuatro competidores** puede responder, porque ninguno tiene
compras: *¿por qué esta reparación lleva tres semanas?*

- Técnicamente simple: reparaciones y compras viven en la **misma base del
  tenant**, no hay problema cruzado.
- Relación **N:N** (una reparación puede esperar varias compras; una compra
  puede destrabar varias reparaciones).
- **El trabajo real es de producto, no de modelo**: hoy una reparación no tiene
  estado, sólo `porcentajeAvance`. Decidir ANTES de codificar qué significa
  "bloqueada": ¿es un estado nuevo?, ¿frena el avance?, ¿se ve en el listado?
- Origen: el usuario pidió comentarios en reparaciones y el ejemplo que dio fue
  "falta un repuesto". Hoy eso es texto libre.

### 3 · Encuesta de satisfacción (CSAT) — Media — **ENTREGADO**

> **Entregado** entre el 2026-08-22 (`24b0618`) y el 2026-09-04, en
> `backend/src/csat/`. La superficie pública sin auth es
> `POST /publico/encuesta/:token`
> (`backend/src/csat/interface/controllers/encuesta-publica.controller.ts`), con
> el token firmado tenant + ticket, de un solo uso y con vencimiento, guardado
> hasheado en la tabla `EncuestaToken` de la base master. La métrica llegó al
> dashboard (`csatPromedio` / `csatRespuestas`, detrás del permiso
> `CSAT:LECTURA`) y la encuesta viene **apagada por cliente** con
> `csatHabilitado` en `false`.
>
> Lo de abajo se conserva como registro de por qué se construyó así.

Al cerrar el ticket, mail con enlace de calificación. Ya existen SMTP, listeners
y plantillas en `backend/src/notificaciones/`.

- **El endpoint es público, sin autenticación**: el que responde no se loguea.
  En multi-tenant eso exige un token firmado que codifique tenant + ticket, de
  un solo uso y con vencimiento. Es la única superficie sin auth del sistema.
- Sumar la métrica al dashboard.

### 4 · Mantenimiento preventivo recurrente — Media — **ENTREGADO**

> **Entregado** entre el 2026-08-24 (`bd098f9`) y el 2026-09-05, en
> `backend/src/preventivo/`. El scheduler copia el patrón de `SlaSweepScheduler`
> como estaba previsto, y la idempotencia quedó resuelta con un `INSERT ... ON
> CONFLICT DO NOTHING` sobre la tabla `PreventivoGeneracion`, como primera
> sentencia de la transacción.
>
> **Hubo una desviación, y está corregida.** La decisión de producto del
> 2026-08-21 pedía `tipoTicket` propio **"Preventivo"** con exclusión explícita
> de las métricas de SLA. La entrega original reusaba **`MANTENIMIENTO`** de
> EDILICIA y la exclusión colgaba de que la prioridad del plan tuviera
> `slaActivo = false` — funcionaba por un mecanismo distinto del acordado, y un
> plan con prioridad de SLA activo entraba en las métricas sin que nadie lo
> notara.
>
> El issue #135 la cerró el 2026-09-09 (`2617a2a`): existe
> `TIPO_CODIGO_PREVENTIVO` en
> `backend/src/tickets/domain/tipos-ticket.constants.ts`, el seeder de tenants lo
> siembra, y `AplicarSlaUseCase` excluye **por tipo**
> (`aplicar-sla.use-case.ts:166`) en vez de depender de la prioridad.
>
> **Este documento afirmó que la desviación seguía abierta hasta el 2026-09-23**,
> dos semanas después de cerrada. Tercera afirmación vencida de la misma tanda
> del 2026-09-09, y por la misma causa que las otras dos: el issue #135 se cerró
> a las 16:36 UTC y el roadmap se escribió a las 14:59 UTC del mismo día.
>
> Lo de abajo se conserva como registro de por qué se construyó así.

Generar tareas automáticas ("revisar la caldera cada 6 meses"). Sin esto, el
módulo de equipos es un inventario, no un plan de mantenimiento.

- **La infraestructura ya existe y está probada en producción**: `@nestjs/schedule`
  con `@Cron`, y `SlaSweepScheduler`
  (`backend/src/sla/infrastructure/schedulers/sla-sweep.scheduler.ts`) ya recorre
  todos los clientes activos vía `ITenantEnumerator` con aislamiento por tenant.
  Copiar ese patrón.
- **El riesgo es la idempotencia**: si el servicio reinicia o el cron corre dos
  veces, no puede duplicar la tarea. Necesita marca de última generación y un
  test que corra el generador dos veces y verifique que crea una sola.
- Decidir qué entidad se genera: ¿ticket?, ¿reparación edilicia?, ¿ambas?

### 5 · Horario laboral en el SLA — Media-alta — **ENTREGADO**

> **Entregado el 2026-09-09** (`a5ec64d`, PR #146 `feat/sla-habil-cableado`,
> ciclo `sdd/sla-habil`). En producción desde el deploy del 2026-09-21.
>
> Esta sección decía "EL ÚNICO PENDIENTE" hasta el 2026-09-23 — ver la nota de
> la tabla de los seis puntos sobre por qué.

El cálculo sobre horas hábiles vive en
`backend/src/calendario-laboral/domain/services/calcular-sla-habil-vence.service.ts`.
`AplicarSlaUseCase` elige entre ese servicio y el viejo `CalcularSlaVenceService`
(reloj 24/7) según la cohorte del ticket.

**Cómo se resolvió "el problema mayor" — con una columna de cohorte, no
recalculando.** La decisión de producto está grabada en el comentario de
`backend/prisma_tenant/migrations/20260909130000_add_sla_regla_tickets/migration.sql`:
los tickets existentes **no se recalculan**; su `sla_vence_at` queda con la regla
vieja de horas corridas.

El mecanismo es un `ALTER` en dos tiempos, sin código de aplicación:

1. `sla_regla VARCHAR(16) NOT NULL DEFAULT 'CORRIDO'` — Postgres backfillea ese
   valor en todas las filas existentes de un solo saque.
2. `ALTER COLUMN sla_regla SET DEFAULT 'HABIL'` — los tickets nuevos nacen en la
   cohorte nueva.

Más un `CHECK sla_regla IN ('CORRIDO','HABIL')` que cierra el catálogo.
`AplicarSlaUseCase` **lee** esa columna y **nunca la escribe**.

Sin esa columna había una fuga silenciosa: `alReprioritizar` recalcula desde el
`created_at` **original** cada vez que cambia la prioridad, así que un ticket
viejo se habría recalculado con la regla nueva la primera vez que alguien lo
repriorizara. Y `RESUELTO` **no** es estado terminal — solo `CERRADO` y
`CANCELADO` lo son —, de modo que hasta un ticket resuelto entraba por ese
camino. La decisión "no recalculamos" se habría filtrado de a un ticket por vez.

> **Ojo al tocar la cohorte de los tickets nuevos: son dos fuentes espejadas.**
> El `DEFAULT 'HABIL'` de la base **nunca llega a actuar** por el camino de la
> aplicación, porque Prisma resuelve el `@default("HABIL")` del schema del lado
> del cliente y lo manda dentro del `INSERT`. Mover la cohorte exige tocar las
> dos.

Lo que quedó fuera del alcance de esa entrega —el **horario semanal** era uno
solo para todos los inquilinos— se resolvió el 2026-09-29 con el ciclo
`horario-laboral-por-cliente`. Los feriados por cliente llegaron antes, con el
ciclo `feriados-configurables` (issue #216).

### 6 · Ticket por email entrante — Alta

La más valiosa y la más cara. Hoy hay envío (SMTP) pero **no recepción**. Sin
esto cada persona tiene que aprender a entrar a una app; con esto manda un mail
como siempre.

- **Ruteo de tenant**: llega un mail, ¿de qué cliente es? En un producto de un
  solo cliente este problema no existe. Se resuelve con direcciones por cliente.
- **Identidad**: el remitente puede no estar registrado. ¿Rechazar, crear,
  dejar pendiente?
- **Conversación**: una respuesta debe sumarse como comentario, no crear un
  ticket nuevo (`Message-ID`/`References`). Es donde estas integraciones fallan.
- **Bucles**: un autorespondedor de vacaciones puede generar tickets infinitos.
- **Infraestructura fuera del código**: casilla o proveedor de correo entrante.
  En un VPS Windows, un webhook de proveedor es más confiable que un poller IMAP.

## Orden acordado

> Actualizado el 2026-08-20. Lo tachado ya no aplica; se deja visible para que se
> entienda por qué el orden es el que es.

1. ~~**Arrancar en paralelo**: el punto 1 y la gestión de infraestructura de
   correo del punto 6~~ — **el punto 1 está entregado**. La infraestructura de
   correo entrante quedó **diferida**: se decidió que cada cliente configure su
   propia cuenta SMTP, lo que resuelve el ENVÍO. La RECEPCIÓN (que alguien abra
   un ticket mandando un mail) sigue sin construirse y es lo que queda del
   punto 6.
2. ~~**Punto 2 — el diferencial. Es el siguiente.**~~ — **entregado** el 2026-09-04.
3. ~~Punto 4 — reusa infraestructura probada.~~ — **entregado** el 2026-09-05.
4. ~~Punto 3.~~ — **entregado** el 2026-09-04.
5. ~~**Punto 5 — es el siguiente, y el último que queda.**~~ — **entregado** el
   2026-09-09 (PR #146), con la desviación del calendario global, corregida el
   2026-09-29.
6. Punto 6 — diferido.

**No queda ningún punto abierto.**

~~**Antes del punto 2 va la Fase 0**~~ — la Fase 0 está integrada en `main`.

> **Actualizado el 2026-09-09.** El orden se cumplió tal como estaba acordado:
> puntos 2, 4 y 3, en ese orden, y la Fase 0 antes que todos. Lo único que se
> salió del plan fue el módulo de Insumos, que entró después del punto 4 y no
> estaba en ninguna lista.

> **Corrección del 2026-08-21.** Acá decía que "el ADMINISTRADOR de Cic Lanus no
> tiene ningún permiso de módulo". **No es un bug y se baja del roadmap.**
> `PRESETS_ROL.ADMINISTRADOR: []` es deliberado y está documentado en
> `backend/src/auth/domain/presets-rol.ts:98`: `resolverScope` materializa TODOS
> los pares válidos en el payload del JWT (ADR-P6, `resolver-scope.ts:138`). Y el
> endpoint que alimenta la grilla devuelve `celdas: []` junto a
> `esAdministrador: true` a propósito, para que el frontend la pinte toda
> tildada. Lo que se reportó fue, casi seguro, alguien mirando esa grilla vacía.
>
> Lo de `TICKETS:ASIGNAR` sí era real, pero **ya está en el preset TECNICO**
> (`presets-rol.ts:71`): se resuelve regenerando el tenant, sin tocar código. Ojo
> con un matiz: la política de datos descartables se acordó para el entorno
> local. **Producción no se regenera** — sigue en el VPS con dos clientes reales,
> así que ahí hay que cargarlo a mano o decidir explícitamente regenerar.
>
> Queda anotada una hipótesis SIN VERIFICAR: el bypass del ADMINISTRADOR vive
> solo en el token, no en la tabla `usuario_cliente_permisos`. Cualquier consulta
> del tipo "quiénes tienen el permiso X" excluye administradores en silencio. Hoy
> no muerde porque las consultas que existen filtran por rol, pero es una costura.

## Carencia detectada fuera de los seis puntos — **CERRADA**

### Cambio de contraseña — Baja dificultad, prioridad alta — **ENTREGADO**

> **Entregado** el 2026-08-21 (`dcbf73a`), el día siguiente a detectarlo.
> `POST /auth/change-password` (`backend/src/auth/interface/controllers/auth.controller.ts`)
> exige la contraseña actual, rechaza repetir la vigente y **revoca todas las
> sesiones** del usuario; el frontend es `CambiarPasswordDialog.tsx`, que avisa
> de ese cierre de sesiones antes de confirmar. El alcance entregado es
> exactamente el "alcance mínimo" que pedía esta sección.
>
> **Reseteo por olvido — Entregado** el 2026-09-28 (`sdd/reseteo-contrasena-olvidada`).
> `POST /auth/forgot-password` y `POST /auth/reset-password` con anti-enumeración,
> tokens de un solo uso de 60 min, confirmación por mail, revocación de sesiones y
> rate limiting. El mail sale solo si la cuenta pertenece a un único cliente con correo
> configurado; con 0 o 2+ clientes sigue el reseteo por administrador. Ciclo SDD
> completo: 15/15 requisitos, 22/22 escenarios, 63/63 tareas, PASS WITH WARNINGS
> (resuelto). Ver `openspec/changes/archive/2026-09-28-reseteo-contrasena-olvidada/`.

~~**Hoy ningún usuario puede cambiar su propia contraseña.** No hay pantalla ni
endpoint: buscado en `backend/src` y `frontend/src` (`cambiar-password`,
`change-password`, `CambiarPassword`), cero resultados.~~

Apareció el 2026-08-20 al intentar rotar la clave del admin de producción. La
única herramienta que existía (`rotate-admin-pw.ps1`, sin versionar en el VPS)
estaba rota: dependía de un script borrado y **reportaba éxito igual**.

No es una comodidad, es un agujero de producto:

- Una credencial expuesta no se puede rotar sin acceso al servidor.
- Un usuario que sospecha que alguien vio su clave no tiene qué hacer.
- Es de las primeras cosas que va a preguntar un cliente con área de sistemas, y
  la respuesta "hay que pedírselo al proveedor" no sobrevive esa conversación.

Alcance mínimo: que un usuario autenticado cambie su propia contraseña
validando la actual. El reseteo por olvido (con email) es un problema distinto y
más grande — necesita tokens de un solo uso con vencimiento — y puede ir después.

## Deuda técnica conocida

Ninguna bloquea el roadmap. Se anota acá porque una deuda que solo vive en la
cabeza de alguien deja de existir cuando esa persona no está.

**Ordenada por lo que puede hacer más daño:**

| Qué | Por qué importa |
|---|---|
| ~~**Regeneración reproducible del entorno**~~ — **RESUELTA** el 2026-09-29. La creación del contenedor está documentada desde el 2026-09-09: `README.md:282` trae el `docker run` completo y `pnpm entorno:verificar` / `pnpm entorno:regenerar` (`55be976`). El hueco de permisos del seed era menor de lo que decía esta fila. Al regenerar desde cero, cada usuario demo ya recibía su preset en el alta, por el fix W4 de `CrearUsuarioTenantUseCase`. Lo que fallaba era **re-correr** el seed: solo el técnico volvía a su preset, y COLABORADOR y USUARIO conservaban lo que alguien hubiera tocado a mano. Desde el 2026-09-29 se re-aplica a los tres, y `demo-seed.integration.spec.ts` prueba los dos casos | Es el cimiento del que cuelga toda la política de datos descartables. Destruir y regenerar sale más barato que migrar **solo si el generador está sano y regenerar es un comando**. Falló dos veces el 2026-08-21: el seed reproduciría el hueco de permisos, y al perderse la base local el README arranca en "cuando haya una instancia de Postgres disponible" — justo después del paso que faltaba |
| **Los feriados sembrados llegan hasta 2029.** Hasta el 2026-09-29 llegaban hasta 2028; la migración `20260929120000_seed_feriados_2029` sumó 2029 con las mismas reglas (el 17/06, Güemes, cae domingo y queda afuera). El horario semanal y los feriados ya se configuran desde la pantalla: `feriados-configurables` (issue #216, `912140e`) agregó el ABM de feriados globales (`/admin/feriados-globales`, solo ROOT) y por cliente (`/feriados`), y `horario-laboral-por-cliente` agregó `/horario-laboral`. Las dos cosas están en producción desde el deploy del 2026-09-29 | Los nacionales de 2030 en adelante no existen hasta que un ROOT los cargue desde `/admin/feriados-globales` o una migración los siembre. Sin eso, a partir de 2030 el SLA hábil cuenta los feriados nacionales como días laborables |
| ~~**El horario semanal es global, no por cliente.** `CalendarioLaboralDia` (clave: solo `dia_semana`) vive en la base **master** (`backend/prisma_master/schema.prisma`), sin columna de cliente.~~ | **RESUELTA** el 2026-09-29. Ciclo `horario-laboral-por-cliente`: `CalendarioLaboralDiaCliente` en la base de cada tenant (un intervalo por día, editable por ADMINISTRADOR o ROOT). El SLA hábil lee solo el horario del propio cliente, sin unión con master; la tabla master `calendario_laboral_dias` se dropeó el mismo día (`20260929100000_drop_calendario_laboral_dias`). |
| **627 `as never`/`as any` en 116 specs**, congelados por un ratchet que **no frena ningún merge** | `scripts/check-casts-en-specs.mjs` (issue #212) se instaló el 2026-09-23 con base **693 en 123 archivos**, todos en `backend/`, y frontend en cero. Es un ratchet: falla si el número sube, y también si baja sin actualizar su línea base. **Igual subió**: el 2026-09-29 medía 759 en 136, porque no corre en ningún lado donde frene un merge. Las integraciones de la semana fueron merges locales, y el CI de GitHub Actions estaba caído desde el 2026-09-18 por falta de minutos. Ese mismo día se bajaron los 66 casts nuevos completando los mocks contra sus puertos, y volvió a 693 en 123. El CI volvió a correr el 2026-10-01, pero sobre el push a `main`: con integraciones locales detecta después de integrar, así que el ratchet se sigue corriendo a mano antes. Convertir los 627 a mocks completos sigue pendiente, pero ya no puede empeorar. El 2026-10-01 la línea base bajó de 693 en 123 a **666 en 121**, y después a **627 en 116** (`BASE_OCURRENCIAS` y `BASE_ARCHIVOS` en `scripts/check-casts-en-specs.mjs`, medido el 2026-10-03). **Corrección de método**: la versión anterior de esta fila decía "eran 301 en 83 specs, hoy 672 en 121 — se duplicó en tres semanas". Los dos números medían cosas distintas: el 301 era **solo `as never`** y el 672 era **`as never` + `as any`**. El crecimiento real del combinado fue **527 → 693 en 33 días, +31%** — real y sostenido, pero no una duplicación. Un número mantenido a mano no solo envejece: puede nacer mal |
| ~~123 errores de tipos escondidos tras la exclusión `**/*.spec.ts`~~ | **RESUELTO** el 2026-08-21 (Fase 0, carril A). El gate quedó instalado y probado: un error de tipo en un spec ahora rompe `pnpm typecheck` |
| ~~Render de fechas del frontend~~ | **RESUELTO** el 2026-08-21 (Fase 0, carril B). Un solo módulo formatea fechas, con regla de lint que impide una séptima copia |
| ~~**Rotación de `EMAIL_CRYPTO_KEY`**: no existe herramienta~~ | ~~Rotarla sin re-cifrar convierte TODA contraseña SMTP guardada en basura indescifrable. El payload lleva prefijo `v1:` justamente para permitir una migración de re-cifrado, pero esa migración no está escrita~~ **RESUELTA** el 2026-09-28. El ciclo `rotacion-email-crypto-key` entrega el script Node + `.ps1` operativo + runbook + tests end to end (referencias `openspec/changes/archive/2026-09-28-rotacion-email-crypto-key/`)|
| ~~Sin e2e dedicado para las 4 rutas de `/correo`~~ | **RESUELTA** el 2026-09-29: `correo-cliente.e2e.spec.ts`, 21 tests con los guards reales. Cubre 401/403/404 en las 4 rutas, que la contraseña nunca sale en una respuesta y queda cifrada en la base, el guardado con la contraseña omitida, "probar" con un verificador falso (nunca un SMTP real) y el borrado. Verificado mutando: sin `GlobalAdminGuard` fallan los 403, y si la respuesta filtra la contraseña fallan los de fuga |
| ~~`SmtpEmailSender.send()` loguea el `error.message` crudo de nodemailer~~ | **RESUELTA** el 2026-09-29. Algunos servidores SMTP devuelven el usuario dentro de la respuesta 535. El log ahora lleva solo el `code` de nodemailer, contra un allowlist cerrado, y el status SMTP numérico (`smtp-error.ts`), con el mismo criterio que la verificación de conexión |
| ~~Postgres de producción con `TimeZone = America/Sao_Paulo`~~ | **RESUELTA** el 2026-09-14 por el ciclo `sesion-utc-y-backfill-de-fechas`; esta fila quedó vencida hasta el 2026-09-29. Medido en producción ese día: master y los 8 tenants activos tienen `TimeZone=UTC` a nivel de base (`pg_db_role_setting`), una sesión nueva da `UTC` con origen `database`, la app además fuerza UTC por conexión (`conUtc()`), y `postgres-admin.service.ts` aplica el mismo `ALTER DATABASE` a cada tenant nuevo. Solo puede quedar en `America/Sao_Paulo` el default del servidor (`postgresql.conf`, no legible sin superusuario), que no toca ningún dato de la app: afecta conexiones manuales a bases ajenas, como `postgres`. No se cambia |
| ~~**`rotate-jwt.ps1` está bloqueado hasta reescribirlo.** Versionado el 2026-09-29 junto con `install-cert-soporte.ps1`; los dos vivían solo en el VPS~~ | **RESUELTA** el 2026-09-29. `backend/.env` pasa a ser la única fuente de `JWT_SECRET`: hasta entonces la clave vivía además en `frontend/.env.local` y en una variable de entorno MACHINE vieja, y el servicio del backend heredaba esa MACHINE, que `dotenv/config` no pisa, mientras el build del frontend usaba la de `backend/.env`. El procedimiento manual que el runbook describía (editar los `.env` y correr `deploy.ps1`) dejaba backend y frontend con claves distintas, y con eso nadie puede loguearse. `deploy.ps1` ahora carga `JWT_SECRET` de `backend/.env` al build del frontend y al NSSM del backend, y `rotate-jwt.ps1` reescribe los dos `.env`, mezcla el NSSM, borra la variable MACHINE, reconstruye el frontend y reinicia los servicios (`DEPLOY-VPS-runbook.md`, sección "`rotate-jwt.ps1`") |
| ~~Corridas de tests **interrumpidas** dejan bases huérfanas en el Postgres local~~ | **RESUELTA** el 2026-08-22 (`43267d4`), y esta fila quedó vencida hasta el 2026-09-29. La suite barre sola las bases efímeras huérfanas al arrancar: `backend/test/barrido-huerfanas.global-setup.mjs`, con tres puertas fail-closed (patrón de nombre, ausencia en el registro de `clientes` y ninguna conexión viva). Si el registro no se puede leer, no barre nada. Medido el 2026-09-29: cero huérfanas en el Postgres local |

## Nota

El multi-tenant ya está resuelto y funcionando con ocho clientes activos. Eso es lo caro
de un SaaS y ya está hecho: sumar el cliente número diez no cuesta trabajo de
infraestructura.
