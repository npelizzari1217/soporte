# Roadmap comercial — seis funciones para vender el producto

Análisis del 2026-08-19. Compara el sistema contra Zendesk, Freshservice, GLPI y
Jira Service Management, y prioriza qué falta para competir.

**Estado: los seis puntos están resueltos — cinco entregados y uno diferido por
decisión.** Actualizado el 2026-10-16 contra el código de `main` (`23fbf939`),
archivo por archivo. Los puntos 1, 2, 3, 4 y 5 están entregados; el 6 sigue
diferido. La Fase 0 está integrada y sus dos gates viven en `main`. Desde el
2026-09-29 la decisión de producto del punto 5 se cumple entera: el horario
semanal pasó a ser por cliente. Desde esa fecha entraron a `main` cinco ciclos del
módulo de Insumos y Equipos, que no son puntos del roadmap: catálogo único de
componentes, stock usado, seguimiento por número de serie, reporte de stock y baja
de equipo completo (ver "El módulo de Insumos"). De la segunda etapa están
entregados los puntos 0 a 9 y el 12 (ver "Segunda etapa — brechas frente a la
competencia").

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

> **Actualizado el 2026-10-03.** Esta tabla es del 2026-08-19 y quedó corta en tres
> cosas. GLPI 11 (octubre 2025) ya trae portal de autoservicio, 2FA, webhooks, API
> v2, un plugin oficial de IA y, por el plugin oficial Order, pedidos con aprobación;
> lo que sigue sin integrar es la cadena compra → recepción → stock → componente de
> equipo. **ManageEngine ServiceDesk Plus** no figuraba y es el competidor más
> parecido en alcance: activos, órdenes de compra con aprobación, contratos y
> preventivo, desde unos USD 33 por técnico al mes en su edición Professional.
> **Odoo** tampoco figuraba: Helpdesk, Mantenimiento, Compras e Inventario, con
> factura electrónica ARCA. Lo que se agrega para cerrar esas brechas está en
> "Segunda etapa — brechas frente a la competencia".

## Los seis puntos

| # | Qué | Dificultad | Estimado | Estado |
|---|---|---|---|---|
| 1 | Exportar a Excel/CSV | Baja | 1-2 días | **HECHO** — del 2026-08-19 (`c442af8`) al 2026-08-20 (`a9bb3fa`), en producción |
| 2 | Reparación ↔ Compra | Media | 3-4 días | **HECHO** — del 2026-08-22 (`d219b50`) al 2026-09-04 |
| 3 | Encuesta de satisfacción | Media | 4-6 días | **HECHO** — del 2026-08-22 (`24b0618`) al 2026-09-04 |
| 4 | Mantenimiento preventivo recurrente | Media | 5-8 días | **HECHO** — del 2026-08-24 (`bd098f9`) al 2026-09-05 |
| 5 | Horario laboral en el SLA | Media | 4-6 días | **HECHO** — 2026-09-09 (`a5ec64d`, PR #146), en producción |
| 6 | Ticket por email entrante | Alta | 2-3 semanas | **DESCARTADO POR AHORA** el 2026-10-08 (antes: diferido el 2026-08-20, postergado el 2026-10-03) |

Estimado restante sobre los seis puntos: **cero**. La recepción de correo del
punto 6 quedó **descartada por ahora** el 2026-10-08: no está claro que los
usuarios la quieran (ver el punto 6).

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
| **Reporte de stock de Insumos** y **baja de equipo completo** | 2026-10-01 (ciclos `reporte-stock-insumos` y `baja-equipo-completo`, último commit `9113c287`) | Pedido de producto sobre Insumos y Equipos, con decisiones del dueño del 2026-10-01. Detalle en "Decisiones de producto ya cerradas" |

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
desplegado el 2026-10-01 en los ocho tenants). El reporte de stock y la baja de equipo
completo entraron a `main` el 2026-10-01, después de ese deploy, y se detallan en
"Decisiones de producto ya cerradas":

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

> **Contrastadas contra el código el 2026-09-09, el 2026-09-23, el 2026-09-29
> y el 2026-10-03.** La del punto 2 se cumplió tal cual. La del punto 4 **se desvió
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
  (`aplicar-sla.use-case.ts:102`), no por prioridad.
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
  `openspec/changes/archive/2026-10-01-reporte-stock-insumos/exploration.md`):
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
  `openspec/changes/archive/2026-10-01-baja-equipo-completo/exploration.md`):
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
> (`backend/prisma_tenant/schema.prisma:618`), y "bloqueada" quedó como estado
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
> (`aplicar-sla.use-case.ts:102`) en vez de depender de la prioridad.
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

### 6 · Ticket por email entrante — Alta — **DESCARTADO POR AHORA**

> **Descartado por ahora el 2026-10-08 por decisión del dueño**: no está claro
> que los usuarios lo quieran. No se construye ni se ofrece como siguiente paso.
> El análisis de abajo se conserva por si se retoma con pedidos concretos de
> clientes.

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

> **Postergado el 2026-10-03 por decisión del dueño**, a una versión posterior.
> Antes de construirlo se consulta a los clientes si les sirve. El motivo es la
> experiencia de quien trabaja en varios clientes.
>
> **El problema.** `Usuario` es global: `email` es `@unique` en la base master
> (`backend/prisma_master/schema.prisma`, modelo `Usuario`) y la relación con
> cada cliente va por `Membresia`. Un técnico que está en ocho clientes manda el
> mail desde Outlook con una sola dirección, y ese mail no dice para qué cliente
> es ni de qué tipo es el pedido. El ticket exige las dos cosas: el tenant, y
> `tipoId` y `prioridadId`, que son obligatorios en `prisma_tenant/schema.prisma`.
>
> **Lo que se descartó y por qué:**
>
> - **Una dirección por cliente.** Resuelve el ruteo, pero obliga a cada persona
>   a acordarse de una dirección por cliente: ocho, en el caso del técnico.
> - **Una sola dirección, con pregunta por mail.** Si el remitente está en un solo
>   cliente, el ticket va directo. Si está en varios, el sistema contesta con un
>   link firmado de un solo uso por cliente, y la persona elige. Funciona, pero
>   el ida y vuelta no convenció.
>
> **Notas de diseño para cuando se retome:**
>
> - El tenant **nunca se adivina** (por ejemplo, "el último cliente que usó"): un
>   ticket cargado en el tenant equivocado expone datos de un cliente a otro.
> - Una respuesta a un ticket existente no es ambigua: el hilo
>   (`Message-ID`/`References`) apunta a un ticket que ya tiene su tenant.
> - Una etiqueta opcional en el asunto (`[Cliente] ...`) evita la pregunta a quien
>   la use.
> - El tipo no viene en el mail: lo razonable es un tipo por defecto ("Sin
>   clasificar") que una persona corrige en el triage. Clasificar con IA queda
>   afuera de una primera versión: si clasifica mal, el SLA se calcula mal.

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
6. ~~Punto 6 — diferido; postergado el 2026-10-03 hasta consultar a los clientes.~~
   — **descartado por ahora** el 2026-10-08: no está claro que los usuarios lo
   quieran.

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

## Segunda etapa — brechas frente a la competencia

> Acordada el 2026-10-03, a partir de una comparación nueva contra GLPI 11,
> ServiceDesk Plus, Freshservice, Jira Service Management, Zendesk, Freshdesk,
> Zoho Desk, los CMMS (Fracttal, MaintainX, UpKeep, Limble) y Odoo. La conclusión:
> la competencia gana en **cómo entra el pedido** (canales, autoservicio,
> movilidad), no en lo que se hace con él. Lo que no tiene ninguno integrado es la
> cadena compra → recepción → stock → componente de equipo: ese diferencial se
> protege, no se diluye.

Ordenada de más a menos importante. La dificultad es una estimación sin explorar
el código; en este repo las estimaciones suelen quedarse cortas a la mitad.

| Orden | Qué agregar | Por qué | Dificultad | Estado |
|---|---|---|---|---|
| 0 | **Reseteo de contraseña para usuarios en varios clientes** | Es un defecto en producción: `solicitar-reset-password.use-case.ts` corta sin mandar mail si el usuario tiene más de una membresía activa, y la pantalla responde igual que si lo hubiera mandado. Un técnico que está en varios clientes no puede recuperar su clave | Baja · 1-2 días | **Entregado** — 2026-10-03 (PR #296, `48f06f8b`) |
| 1 | **Formulario público por cliente + QR en los equipos** | El cliente viene en la URL, así que no tiene la ambigüedad que postergó el punto 6. El QR pegado en el equipo abre el formulario con el equipo cargado. Lo difícil: frenar el spam y decidir qué pasa con quien pide sin usuario | Media · 5-8 días | **Entregado** — en `main` por el #300 (`f39cf601`), desplegado el 2026-10-05; habilitado en Cic Lanus y probado de punta a punta en producción |
| 2 | **App instalable (PWA), con conexión** | El técnico la abre desde el celular como una app, sin tienda. El modo sin conexión es Alta y queda afuera | Baja · 1-2 días | **Entregado** — en `main` por el #365 (`9a80346b`), desplegado el 2026-10-05 |
| 3 | **Exportar a Excel y PDF** | Hoy solo hay CSV. El PDF de un ticket u orden de trabajo es un pedido habitual | Baja-Media · 2-4 días | **Entregado** — en `main` por los PRs #379-#387 (`34af7504`), desplegado el 2026-10-06 |
| 4 | **Respuestas predefinidas** | El técnico no reescribe la misma respuesta cada vez | Baja · 1-2 días | **Entregado** — en `main` por los PRs #369-#375 (`ba083775`), desplegado el 2026-10-06 |
| 5 | **Verificación en dos pasos (2FA)** | La exigen instituciones medianas; GLPI 11 ya la tiene | Media · 3-5 días | **Entregado** — en `main` por el #472 (`20b320a4`), desplegado el 2026-10-07 |
| 6 | **SLA de primera respuesta y pausa del reloj** | Hoy "esperando al cliente" cuenta como tiempo de SLA. Toca el motor de horas hábiles y el dashboard | Media-Alta · 5-8 días | **Entregado** — en `main` por los PRs #391-#422 (`56341154`), desplegado el 2026-10-06 |
| 7 | **Login con Google o Microsoft (SSO)** | Menos contraseñas, sobre todo en colegios con Google Workspace. Tiene que respetar el usuario global con varios clientes | Media · 4-6 días | **Entregado** — en `main` por el #510 (`c5e1ec0a`), desplegado el 2026-10-10. Google habilitado en producción con la pantalla de consentimiento en modo prueba y verificado con cuentas reales el 2026-10-11 (V.1); Microsoft sigue sin configurar ni probar |
| 8 | **API pública + webhooks** | Integración con otros sistemas del cliente: claves por cliente, permisos y documentación | Media-Alta · 6-10 días | **Entregado** — decisiones cerradas el 2026-10-10: primero la API (solo tickets), después los webhooks. **Etapa 1 (API)**: en `main` por el merge local `068f53f1` de la cadena `feat/api-publica` (más el arreglo del rollback, `11bffe7a`), desplegada el 2026-10-11 por bundle, sin pasar por GitHub. **Etapa 2 (webhooks)**: en `main` por el merge local `c207e8a3` de la cadena `feat/webhooks` (documento `odd/tasks/webhooks.md`), desplegada el 2026-10-13 por bundle. Ningún cliente tiene todavía la API habilitada ni un destino de webhooks configurado |
| 9 | **Asignación automática por tipo o ubicación** | Primer paso de automatización. Un motor de reglas completo es Alta (2-3 semanas) y queda afuera | Media · 4-6 días | **Entregado** — en `main` por el #490 (`776c6d69`), desplegado el 2026-10-09. Un responsable fijo por tipo |
| 10 | **WhatsApp** | El canal dominante en Argentina. Pide un proveedor de la API de Meta, costo por conversación y la misma ambigüedad de cliente que el email. Estaba atado al punto 6, descartado por ahora el 2026-10-08: si se retoma, necesita su propia forma de resolver el cliente (por ejemplo, el teléfono registrado del usuario o un número o enlace por cliente, como el QR) | Alta · 2-4 semanas | **DESCARTADO** el 2026-10-15 por decisión del dueño: complica la operatoria y no suma utilidad suficiente al sistema. No se construye ni se ofrece como siguiente paso (antes: sin base desde el 2026-10-08) |
| 11 | **IA (resumir, clasificar)** | Es lo que vende la competencia en 2026, pero tiene costo variable y exige garantizar que los datos de un cliente no lleguen a otro | Media | Al final |
| 12 | **Tareas con técnico y crédito por tarea** | Sumado el 2026-10-08, al decidir el punto 9. Un ticket puede necesitar varios técnicos: uno empieza y otro termina, o hay varios oficios o pasos. Cada tarea del ticket lleva su técnico y el crédito va a quien la completó, no a quien cerró el ticket. Generaliza a todos los tipos las subtareas que hoy solo tiene Edilicia (`SubtareaEdilicia`, que guarda quién la completó pero no tiene responsable). *Nota del 2026-10-14: es la descripción de cuando se sumó el punto; con la entrega, `SubtareaEdilicia` ya no existe y sus filas viven en `tareas_ticket`.* | Media-Alta · 5-8 días (a refinar) | **Entregado** — decisiones cerradas el 2026-10-13 (ver "Decisiones de producto de la segunda etapa"). En `main` por el merge local `32037bdf` de la cadena `feat/tareas-con-tecnico` (documento `odd/tasks/tareas-con-tecnico.md`), con `judgment-day` aprobado, desplegada el 2026-10-14 por bundle, sin pasar por GitHub. La copia de las subtareas de Edilicia coincidió con la foto previa en los 8 inquilinos (108 en Colegio Guadalupe y 3 en IIConcepcion) |

**Lo que no se hace:** ITIL (cambios, problemas), CMDB con descubrimiento de red y
licencias. Es el terreno de las herramientas de TI pura, no el del segmento.

### Decisiones de producto de la segunda etapa

> Mismo criterio que "Decisiones de producto ya cerradas": cada viñeta entra a la
> spec del ciclo como requerimiento con escenario, y al cerrar el punto declara
> **Cumplida** o **Desviación** con su motivo. Desde el 2026-10-10 el flujo es ODD y
> ya no hay spec de ciclo: cada viñeta entra como criterio de aceptación al documento
> de la feature (`odd/tasks/<feature>.md`), como en el punto 8.

- **Segunda etapa, punto 1 — formulario público + QR** (decidido el 2026-10-03,
  ciclo `formulario-publico-qr`, exploración en
  `openspec/changes/archive/2026-10-04-formulario-publico-qr/exploration.md`):
  - Puede pedir **cualquiera**, pero el ticket se crea recién cuando confirma un
    link de un solo uso que le llega por mail.
  - Quien pide sin cuenta es un **solicitante externo** guardado en la base del
    cliente. No se le crea `Usuario` ni `Membresia`.
  - Un cliente **sin correo configurado** solo acepta pedidos de sus usuarios
    registrados, y **con sesión iniciada**: el formulario y el QR llevan al login y
    después al alta del ticket con el equipo cargado. Sin mail no hay forma de
    comprobar un email tipeado (precisado el 2026-10-03, al proponer).
  - El ticket entra **directo como NUEVO**, sin estado de moderación.
  - Quien pidió recibe el **número del ticket, los cambios de estado, los
    comentarios públicos y la encuesta CSAT** por mail. No hay página de
    seguimiento. Los comentarios públicos se sumaron el 2026-10-03, al diseñar.
  - El link de confirmación vence a las **24 horas** (decidido el 2026-10-03, al
    diseñar).
  - Tipo **SOPORTE** y prioridad **MEDIA**, fijos: quien pide no los elige.
  - El identificador del cliente en la URL lo carga el **ROOT** y **no cambia**
    después de emitido el primer QR.
  - **Un QR por equipo**, con un token opaco regenerable. Un equipo dado de baja
    abre el formulario sin equipo cargado. La impresión en lote queda afuera.
  - **Sin adjuntos** en esta primera entrega.
  - Límites: **3 pedidos por mail cada 15 minutos**, contados por cliente, y **30 por
    cliente por hora**.
    Al pasarse, un mensaje genérico de "intentá más tarde".
  - Los datos del solicitante externo se guardan **mientras exista el ticket**.
    La retención queda anotada para revisarla.
  - Fuera del formulario, un cliente lo tiene **apagado por defecto** y lo
    habilita el ROOT, igual que la encuesta CSAT.
  - **Cumplida** (2026-10-04, ciclo `formulario-publico-qr`, 19 work units): las 13
    viñetas están implementadas y probadas contra el código, sin desviación. El
    ticket nace con tipo SOPORTE, prioridad MEDIA y estado NUEVO; el solicitante
    externo vive en el tenant; la confirmación es de un solo uso y vence a las 24 h;
    los límites son 3 por mail y cliente cada 15 minutos y 30 por cliente por hora; el
    cliente sin correo `LISTO` pasa por login con el equipo cargado. Dos precisiones
    que no son desviaciones: el enum de tres modos de la exploración se reemplazó
    antes de implementar por un booleano de habilitación y la regla de correo
    deducida (decisiones D12 y D3 del diseño), y los cupos del throttler vivían en la
    memoria de un solo proceso, así que un reinicio los ponía en cero. Desde el
    2026-10-15 viven en la base master (`throttler_contadores`): sobreviven a un
    reinicio y los comparten todos los procesos (`odd/tasks/throttler-postgres.md`).
  - **Cambios posteriores al cierre** (2026-10-05, decisiones del dueño; no alteran
    ninguna viñeta):
    - El token del QR se guarda en claro, junto a su hash, para que la ficha del
      equipo muestre siempre el QR vigente y se pueda descargar cuantas veces haga
      falta (#356, PRs #357-#359). Revierte la decisión de diseño D8, que guardaba
      solo el hash. El QR sigue siendo uno por equipo, opaco y regenerable.
    - Los usuarios del cliente ven y copian el link genérico del formulario desde
      el encabezado (#360, PR #361).
    - La purga horaria de pedidos pendientes vencidos alcanza también a los
      clientes dados de baja (#352, PR #353). Sigue abierta la revisión de D11: no
      hay política de retención para la base de un cliente dado de baja.
- **Segunda etapa, punto 2 — app instalable (PWA)** (decidido el 2026-10-05):
  - Nombre instalado **"Soporte Sesitec"**, nombre corto **"Soporte"**.
  - Abre en `/tickets`, el mismo destino que después de iniciar sesión, y en modo
    `standalone` (sin barra del navegador).
  - **Un solo ícono para todos los clientes**: el manifest es por origen, no por
    cliente.
  - **Sin soporte offline y sin service worker**: la app instalada solo funciona con
    conexión, porque el roadmap deja lo offline afuera.
  - Se instala desde el menú del navegador; no hay botón de instalación propio.
  - El ícono es un dibujo propio (llave y destornillador cruzados, blanco sobre
    `#2563eb`). Se reemplaza por el logo de un diseñador cambiando los archivos de
    `frontend/public/icons/`.
  - **Cumplida** (2026-10-06, PR #365, desplegado el 2026-10-05): las 6 viñetas
    están implementadas y verificadas contra producción. `/manifest.webmanifest`
    responde con "Soporte Sesitec" / "Soporte", `start_url` `/tickets`, `display`
    `standalone` y `theme_color` `#2563eb`. Los cuatro íconos PNG, el favicon y el de
    Apple se sirven sin sesión, y son los mismos para todos los clientes. El
    frontend no registra ningún service worker ni ofrece un botón de instalación
    propio. Sin desviación.
- **Segunda etapa, punto 4 — respuestas predefinidas** (decidido el 2026-10-06,
  issue #368):
  - Las respuestas son **compartidas por cliente**: una tabla en la base de cada
    cliente. No hay respuestas personales.
  - Las gestiona el **ADMINISTRADOR del cliente y ROOT** desde `/admin/catalogos`,
    igual que los sectores: `AdminClienteGuard` en las escrituras y ningún permiso
    `MODULO:ACCION` nuevo.
  - Las usa **cualquiera con `TICKETS:COMENTAR`**: un selector "Insertar respuesta" en
    el formulario de comentario de un ticket de soporte, que **inserta el texto en el
    cuadro para editarlo y nunca envía por sí solo**. Si el cuadro ya tiene texto, la
    respuesta se agrega en una línea nueva sin borrar lo escrito. Solo se ofrecen las
    respuestas **activas**.
  - **Solo tickets de soporte**: las reparaciones de edilicia quedan afuera.
  - Cada respuesta tiene **título** (obligatorio, de 1 a 100 caracteres, único por
    cliente sin distinguir mayúsculas) y **texto** (obligatorio, de 1 a 4000
    caracteres).
  - **Se desactiva, no se borra**: un flag de activa y un endpoint de cambio de estado,
    como los sectores.
  - Lo público o interno sigue siendo la casilla que ya existe: la respuesta no lo
    lleva.
  - **Sin variables** en esta versión: el texto se inserta tal cual.
  - **Cumplida** (2026-10-06, PRs #369-#375, desplegado el mismo día): las 8 viñetas
    están implementadas y probadas. La tabla `respuestas_predefinidas` vive en la
    base de cada cliente, con un índice único sobre `lower(titulo)` y los límites de
    largo como CHECK. `GET /respuestas-predefinidas` queda abierto a los usuarios del
    cliente, y las tres escrituras llevan `AdminClienteGuard`, sin permisos nuevos.
    El selector ofrece solo las activas (`?activas=true`), agrega el texto en una
    línea nueva y no envía el comentario. Ni edilicia ni las reparaciones lo usan.
    Una precisión que no es desviación: el ABM lista también las desactivadas, para
    poder reactivarlas, a diferencia del listado de sectores, que solo muestra las
    activas.
- **Segunda etapa, punto 3 — exportar a Excel y PDF** (decidido el 2026-10-06,
  issue #378):
  - Las **5 exportaciones CSV que ya existen** (tickets, compras, equipos,
    reparaciones y reporte de stock de insumos) pasan a poder bajarse también como
    **Excel real (`.xlsx`)**, con las mismas columnas, los mismos filtros, los mismos
    permisos y el mismo tope de 5000 filas (el mismo 422 al pasarse). El CSV se
    mantiene.
  - Las celdas son **tipadas**: los números como números, las fechas y fechas con hora
    como fechas reales de Excel (con la hora de Argentina que ya muestra el CSV) y el
    texto como texto. El encabezado va en **negrita**, **congelado** y con
    **autofiltro**, y las columnas tienen un ancho razonable. Las celdas son siempre
    valores, nunca fórmulas.
  - El formato se elige con `?formato=xlsx` en las mismas rutas `/export`; sin el
    parámetro sigue siendo CSV, así que quien ya usa la ruta no se rompe.
  - En la pantalla, el botón de exportar pasa a ser un menú **"Exportar"** con
    **Excel** (primera opción, la predeterminada) y **CSV**, y los dos mandan los
    mismos filtros.
  - El **PDF de un ticket** sale de `GET /tickets/:id/pdf`, con el mismo permiso y las
    mismas reglas de acceso que el detalle (un solicitante solo obtiene el suyo). Sirve
    tanto para tickets de soporte como para reparaciones.
  - El PDF lleva el **logo del cliente** (si es png o jpeg; con webp o sin logo, el
    nombre del cliente en texto), el número, título, estado, prioridad, tipo,
    solicitante, asignado, fechas de creación y cierre y vencimiento de SLA, la
    descripción y lo propio de cada flujo (equipo, problema y solución en soporte;
    ubicación, avance y subtareas en edilicia). Cierra con el **historial de
    comentarios públicos y cambios de estado**.
    *Nota del 2026-10-14: desde el punto 12 de la segunda etapa, el avance y las
    subtareas de edilicia salen de las tareas genéricas del ticket (`tareas_ticket`),
    y la sección "Tareas" se imprime en cualquier tipo de ticket que tenga tareas.*
  - **Los comentarios internos nunca van en el PDF**, ni siquiera para quien tiene
    `TICKETS:OBSERVAR`: es un documento que se descarga y se reenvía.
  - A4, con "Página X de Y" y la fecha de generación al pie. Se genera con una
    librería de JavaScript puro, **sin navegador headless** (el VPS es Windows y no
    tiene Chrome).
  - **Cumplida, con una desviación declarada** (2026-10-06, PRs #379-#387, desplegado
    el mismo día y probado por el dueño en producción con un ticket real y un export a
    Excel). Las 5 exportaciones bajan `.xlsx` con celdas tipadas, encabezado en negrita
    y congelado y autofiltro, y el CSV sigue disponible. El PDF sale con las reglas de
    acceso del detalle, el logo o el nombre del cliente y solo los comentarios
    públicos: el caso de uso pide el historial sin permiso de observar y además vuelve
    a filtrar los internos. **Desviación**: el endpoint genera el PDF de una
    reparación, pero las reparaciones no tienen pantalla de detalle, así que el botón
    "Descargar PDF" solo está en el detalle de un ticket de soporte y no hay forma de
    bajar el PDF de una reparación desde la pantalla. Sumar ese acceso queda como
    decisión aparte.
  - En el detalle del ticket hay un botón **"Descargar PDF"**, visible para cualquiera
    que pueda ver el ticket.

- **Segunda etapa, punto 5 — verificación en dos pasos (2FA)** (decidido el
  2026-10-07, ciclo `verificacion-dos-pasos`):
  - **Cumplida** (2026-10-07, cadena de PRs #437-#473 integrada por el #472,
    `20b320a4`, desplegada el mismo día con una migración master sin relleno).
    Todas las viñetas de abajo y las precisiones están implementadas, cada una como
    requerimiento con escenario en `openspec/changes/archive/2026-10-08-verificacion-dos-pasos/specs/`;
    la verificación cerró en PASS WITH WARNINGS (61/61 requerimientos, 124/124
    escenarios). Probado en producción: el ROOT configuró su 2FA en el primer login y
    el límite de intentos registra la IP real del navegador. **Precisiones**: el
    reseteo de un ROOT por otro ROOT existe por API y por el script de operador, sin
    botón en la pantalla; y para el reseteo por un ADMINISTRADOR también cuentan las
    membresías borradas, algo más estricto que "todas las membresías" de la decisión.
  - El segundo paso es una **app autenticadora** (TOTP: Google Authenticator,
    Microsoft Authenticator, Authy). Al activarlo se entregan **10 códigos de
    recuperación** de un solo uso, que se muestran una sola vez. No hay código por
    mail: el correo sale por el SMTP de cada cliente, y ROOT o un cliente sin correo
    configurado no lo recibirían.
  - El 2FA es **por usuario**, no por cliente: el usuario es global y puede estar en
    varios clientes.
  - Cada usuario puede activarlo por su cuenta. El **ADMINISTRADOR** de un cliente
    puede **exigirlo para su cliente**. Si un usuario está en varios clientes y alguno
    lo exige, se le pide al entrar a cualquiera. Si le toca y no lo tiene configurado,
    después de la contraseña se lo obliga a configurarlo antes de seguir.
  - Para **ROOT** es obligatorio.
  - Se pide **una sola vez por login**, después de la contraseña y antes del selector
    de cliente. Cambiar de cliente o renovar la sesión no lo vuelve a pedir.
  - **Dispositivo de confianza automático, ventana de 30 días** (cambiado el
    2026-10-08 por decisión del dueño; antes era una casilla "Recordar este
    dispositivo"). Todo segundo paso exitoso (código de la app o de recuperación) de
    un usuario que no es ROOT deja a ese navegador como de confianza, sin casilla.
    Cada login que se saltea el código gracias a ese dispositivo renueva 30 días más;
    30 días sin usarlo y el código se vuelve a pedir. Se invalida al cambiar la
    contraseña, al resetear el 2FA, al desactivarlo y al **cerrar todas las
    sesiones**. El cierre de sesión normal no lo invalida.
  - Si el usuario pierde el celular y los códigos, **ROOT le resetea el 2FA**. El
    ADMINISTRADOR de un cliente también puede, pero solo si el usuario pertenece
    únicamente a su cliente: un admin no le baja la seguridad a alguien que también
    está en otro cliente.
  - El **reseteo de contraseña por mail no desactiva el 2FA**: el siguiente login
    igual pide el código.
  - **Límite de intentos** en el login y en la verificación del código (del orden de
    5 cada 15 minutos por usuario). Hoy el login no tiene ninguno.
  - Fuera de alcance: llaves físicas o passkeys (WebAuthn), SMS y un registro de
    auditoría de logins.
  - Precisiones del 2026-10-07, al explorar:
    - Un usuario **no obligado** puede **desactivar** su 2FA; uno obligado, no.
      Cualquiera puede **regenerar los códigos** y **cambiar de celular**. Las tres
      cosas piden un código válido.
    - **ROOT sin celular ni códigos** se recupera con un **script de operador** en el
      VPS. Un ROOT puede resetear el 2FA de otro ROOT; un ADMINISTRADOR **nunca**
      resetea a un ROOT.
    - Para el reseteo por ADMINISTRADOR, "pertenece únicamente a su cliente" cuenta
      **todas** las membresías del usuario, también las inactivas y las de clientes
      suspendidos.
    - **ROOT no tiene dispositivo de confianza: el código se le pide siempre**
      (vigente tras el cambio del 2026-10-08). Para los demás se invalida al cambiar
      la contraseña por cualquier vía: el propio usuario, el reseteo por mail y el
      reseteo por un administrador.
    - Si un administrador empieza a exigir el 2FA, las **sesiones abiertas siguen**
      hasta que venzan y el 2FA se pide en el próximo login.
    - El límite de intentos de la **contraseña** es por usuario **e IP**: el BFF le
      pasa al backend la IP real del navegador, para que un tercero no pueda
      bloquear a un usuario. El del **código** es por usuario, porque para llegar a
      ese paso ya hace falta la contraseña.
    - En la configuración obligatoria, el login termina **recién cuando el usuario
      confirma que guardó los 10 códigos**.
    - **No hay forma de relajar el 2FA fuera de producción.** Los tests usan un
      secreto conocido y generan el código.
    - El aviso por mail al activar o resetear el 2FA queda fuera de alcance.
- **Segunda etapa, punto 6 — SLA de primera respuesta y pausa del reloj**
  (decidido el 2026-10-06, ciclo `sla-primera-respuesta-y-pausa`):
  - **Cumplida** (2026-10-06, PRs #391-#422, merge `56341154`, desplegado el mismo
    día con 4 migraciones de tenant que no recalculan vencimientos ni cumplimientos).
    Todas las viñetas de abajo están implementadas, cada una como requerimiento con
    escenario en `openspec/changes/archive/2026-10-07-sla-primera-respuesta-y-pausa/specs/`, y la
    verificación cerró sin bloqueantes. **Precisión**: los tickets de la cohorte
    anterior al SLA hábil (`CORRIDO`, todos previos a este cambio) miden su tiempo
    activo y sus pausas en tiempo de pared, no en horas hábiles, igual que ya medían
    su vencimiento; tampoco reciben meta de primera respuesta, coherente con "sin meta
    retroactiva". Todo ticket nuevo es hábil. La reapertura quedó decidida el
    2026-10-27: el tiempo vuelve a correr desde donde quedó, como tras una pausa.
  - Se agrega el estado **"Esperando al cliente"**. Se entra desde *En proceso* y se
    sale a *En proceso*, *Resuelto* o *Cancelado*.
  - Mientras el ticket espera al cliente, **el reloj de resolución se detiene**. Al
    volver, el vencimiento se corre por las **horas hábiles** que estuvo en pausa, y
    el barrido no marca vencido un ticket que está esperando.
  - Si el **solicitante comenta** mientras el ticket espera, el ticket vuelve solo a
    *En proceso*.
  - La **primera respuesta** es el primer comentario público de alguien que no sea el
    solicitante.
  - Cada prioridad suma una meta opcional, **"Primera respuesta (h)"** (vacía = sin
    meta), medida en horas hábiles con el mismo calendario del cliente. La primera
    respuesta **no se pausa**.
  - Si la primera respuesta vence, el ticket lo muestra con un badge y se manda un
    mail al asignado y a los administradores, igual que el vencimiento de resolución.
  - Los **tickets existentes no se recalculan**, con el mismo criterio que el SLA
    hábil. Sí se completa desde el historial **cuándo** tuvieron su primera
    respuesta, para las métricas, pero sin meta retroactiva.
  - **Tickets existentes y reloj activo** (precisado el 2026-10-06, al proponer):
    antes del cambio no existía el estado de espera, así que todo su tiempo sin
    resolver fue activo. Los **abiertos** se incorporan al reloj la primera vez que
    hace falta (al pasar a esperar o al repriorizar), con todo el tiempo desde su
    creación como acumulado activo, y su vencimiento actual no se toca. Los **ya
    resueltos o cerrados** cuentan en el cumplimiento con el criterio anterior
    corregido: **fecha de cierre contra vencimiento**, en vez de la marca del barrido.
  - El dashboard suma el **% de cumplimiento de primera respuesta** y el **tiempo
    medio de primera respuesta**, junto al cumplimiento de resolución.
  - El cumplimiento de resolución se mide por **tiempo activo** (precisado el
    2026-10-06, al explorar; reemplaza la versión anterior de esta viñeta, que
    comparaba la fecha de cierre con el vencimiento). El reloj solo corre mientras el
    ticket está en *Nuevo*, *Asignado* o *En proceso*; se detiene en *Esperando al
    cliente* y al pasar a *Resuelto*. **Cumplió si las horas hábiles activas
    acumuladas hasta la resolución no superan la meta de la prioridad.** Una semana
    esperando al cliente no cuenta, y un cierre administrativo tardío tampoco: deja de
    importar que *Cerrado* pise la fecha de cierre. Ya no depende de la marca que deja
    el barrido, así que desaparece el falso "a tiempo" de un ticket resuelto tarde
    antes de que el barrido corra.
  - La pausa **siempre descuenta**, aunque el ticket haya entrado a *Esperando al
    cliente* con el SLA ya vencido (precisado el 2026-10-06).
  - Si un ticket resuelto se **reabre con un salto correctivo**, el reloj sigue
    sumando desde donde quedó, sin tiempo extra, y el cumplimiento se evalúa con la
    última resolución (precisado el 2026-10-06). **Decidido el 2026-10-27**: una
    reapertura no suma tiempo extra ni arranca un reloj nuevo. Es como si el ticket
    hubiera estado en pausa: el tiempo vuelve a correr desde donde quedó. Es lo que el
    código ya hace; no requiere cambios.
  - El **tiempo medio de primera respuesta** se mide en **horas hábiles** (precisado
    el 2026-10-06).
  - Al pasar a *Esperando al cliente* se **avisa por mail al solicitante**: el estado
    existe para pedirle algo (precisado el 2026-10-06).
  - El salto correctivo de ROOT o ADMINISTRADOR **no puede llevar a *Esperando al
    cliente***: solo se entra desde *En proceso*. Cualquier salida del estado, también
    por salto, reanuda el reloj (precisado el 2026-10-06).
  - Los **preventivos** siguen fuera del SLA, como hoy.
- **Segunda etapa, punto 9 — asignación automática por tipo** (decidido el
  2026-10-08):
  - **Cumplida** (2026-10-09, cadena de PRs #489-#504 integrada por el #490,
    `776c6d69`, desplegada el mismo día con una migración tenant aditiva y sin
    relleno). Todas las viñetas de abajo y las precisiones están implementadas, cada
    una como requerimiento con escenario en
    `openspec/changes/archive/2026-10-09-asignacion-automatica-por-tipo/specs/`; la verificación cerró en
    PASS WITH WARNINGS (29/29 requerimientos, 95 escenarios: 86 cubiertos del todo y 9
    en parte). Probado en producción: una regla de prueba hizo nacer el ticket
    *Asignado* y el responsable recibió el mail. **Desviaciones acordadas**: la
    reasignación simple se ofrece también en *Nuevo* y *Asignado*, no solo después;
    y en los preventivos recurrentes, la tolerancia a fallas al resolver la regla
    cubre las consultas a la base de control: un error de una consulta a la base del
    cliente dentro de la transacción del plan la aborta igual y se propaga, como hoy.
  - La regla es **solo por tipo de ticket**. La ubicación queda afuera: hoy es texto
    libre y ni siquiera vive en el ticket (sale del equipo o del campo de Edilicia),
    así que una regla por ubicación fallaría en silencio por una diferencia de
    escritura. Se puede sumar cuando exista un catálogo de ubicaciones.
  - **Un responsable fijo por tipo**: una regla por tipo, sin orden ni prioridad
    entre reglas, sin grupos y sin reparto por turnos ni por carga. Eso es el motor
    de reglas que esta fila deja afuera.
  - Aplica en **todos los canales** de alta: el alta normal, Soporte con equipo,
    Edilicia, el formulario público con QR y los preventivos recurrentes.
  - Si la regla le pone responsable, el ticket **nace en *Asignado***; si no hay
    regla para el tipo, nace en *Nuevo* y sin asignar, como hoy. La bitácora
    registra que lo asignó el sistema por la regla del tipo.
  - Si el responsable de la regla **no es válido** (dado de baja, sin membresía en
    el cliente o sin el módulo del tipo), el ticket se crea igual, **sin asignar y en
    *Nuevo***: un problema de configuración nunca impide pedir ayuda. La pantalla de
    reglas marca la regla rota. Al configurar, solo se puede elegir a alguien válido
    para ese tipo.
  - El responsable **se puede reasignar en cualquier momento hasta que el ticket se
    cierra**. Un ticket cerrado no se reasigna (hoy la asignación no mira el estado).
  - **Mail al responsable cada vez que le asignan un ticket**, por la regla o por una
    reasignación manual, con la cuenta de correo del cliente. Si el cliente no tiene
    correo configurado, la asignación se hace igual y no sale mail.
  - Las reglas las configura el **ADMINISTRADOR del cliente** (y ROOT), en una
    pantalla nueva del menú de administración: una fila por tipo de ticket con un
    selector del responsable. Fila vacía = ese tipo no tiene regla.
  - **Precisiones del 2026-10-09, al explorar** (ciclo `asignacion-automatica-por-tipo`):
    - El responsable fijo puede ser un **TECNICO o un COLABORADOR** con el módulo del
      tipo, el mismo universo que ofrece hoy el selector de asignación manual. Un
      ADMINISTRADOR no se ofrece como responsable de una regla.
    - "Cerrado", para bloquear la reasignación, son los estados finales: **Cerrado y
      Cancelado**. Un ticket *Resuelto* todavía se puede reasignar.
    - El mail de asignación sale **siempre**, también cuando alguien se asigna un
      ticket a sí mismo.
    - Asignar a mano un ticket que está en *Nuevo* lo pasa a ***Asignado***, igual que
      la regla: un ticket con responsable no queda en *Nuevo*.
  - **Precisión (2026-10-14, en `main` el 2026-10-15):** el responsable ve su ticket
    aunque no tenga permiso para ver todos. Sin esto, un responsable sin `TICKETS:VER_TODOS`
    recibía el mail de asignación de un ticket que no podía abrir. La regla única vive en
    `esTicketVisiblePara` (`backend/src/tickets/application/services/visibilidad-ticket.ts`):
    sin ese permiso se ve lo que uno solicitó, lo que tiene asignado y aquello donde es
    técnico de una tarea activa. La Ayuda del listado ya lo dice.
  - **El trabajo compartido entre técnicos va en otro ciclo** (punto 12). Un
    responsable por ticket no reparte el crédito: si un técnico hizo el 60 % y otro
    el 40 %, los indicadores por asignado se lo dan al último, y un problema con
    varios oficios (electricista, sistemas, constructor) o varios pasos (formatear
    una PC, instalar aplicaciones e impresoras) necesita un técnico por tarea.
- **Segunda etapa, punto 7 — login con Google o Microsoft (SSO)** (decidido el
  2026-10-09, ciclo en #507):
  - **Cumplida** (2026-10-10, cadena de PRs #511-#533 integrada por el #510,
    `c5e1ec0a`, desplegada el mismo día con la migración master
    `20261010120000_login_sso`). Las 12 viñetas (las 10 de la decisión y las 2
    precisiones) son requerimientos con escenario en
    `openspec/changes/archive/2026-10-10-login-sso/specs/`; la verificación cerró en
    PASS WITH WARNINGS (33 requerimientos, 120 escenarios, cero sin test o fallando).
    Lo que queda afuera (alta automática, "solo SSO", auditoría) está declarado arriba.
    **V.1 del verify (prueba con cuentas reales) hecha para Google el 2026-10-11,
    en producción** (no hay staging), con la pantalla de consentimiento en modo
    prueba. Pasaron: primer ingreso que crea el vínculo y entra directo con un solo
    cliente; segundo ingreso reconocido por el vínculo, sin duplicarlo; usuario con
    dos clientes que ve el selector después del SSO; ROOT rechazado; email que no
    existe en Soporte rechazado sin crear vínculo; y "Resetear vínculo SSO", que
    borra el vínculo y revoca los refresh tokens en el acto (el navegador abierto
    sigue hasta que vence su access token, hasta 15 minutos, y el siguiente ingreso
    por SSO revincula por email). La prueba encontró un bloqueante de
    infraestructura, el reescrito de `Location` de IIS/ARR, corregido en el VPS y
    documentado en `DEPLOY-VPS-runbook.md`. **No se verificó en producción**:
    Microsoft (sin configurar: falta probar una cuenta de trabajo y una personal; si
    las personales no emiten los claims necesarios, quedan rechazadas por diseño y
    esta viñeta pasa a declarar esa desviación); el 2FA propio después del SSO
    (ningún cliente lo exige hoy; la regla sigue vigente); y el mensaje genérico en
    pantalla cuando el email no existe (el rechazo se vio en el log, pero una sesión
    vieja con contraseña en el navegador interfirió). **Pendiente antes de abrir
    Google a todos los clientes**: publicar la pantalla de consentimiento; mientras
    siga en modo prueba solo entran los usuarios de prueba y la cuenta dueña del
    proyecto.
  - Solo entran **usuarios que ya existen**, creados por un administrador como hoy.
    Se los reconoce por el **email verificado** que devuelve el proveedor; si ese
    email no está en el sistema, no entra. No hay alta automática.
  - El SSO **convive con la contraseña**: el usuario puede entrar de las dos formas,
    y el olvido de contraseña sigue igual. No hay política "solo SSO" por cliente.
    La baja de un usuario sigue siendo desactivar su membresía.
  - Después del SSO se pide **el 2FA propio con las reglas de hoy** (ROOT siempre;
    cualquier usuario con un cliente que lo exige), con el dispositivo de confianza
    de 30 días. Entrar por SSO no cuenta como segundo paso: no se puede comprobar
    que el proveedor lo haya pedido.
  - **Una sola app por proveedor para toda la plataforma**, configurada en el
    servidor. Los clientes no configuran nada: el cliente se elige después de
    entrar, así que una configuración por cliente no encaja con el login global.
  - Se acepta **cualquier cuenta de Google o de Microsoft**, personal o de
    organización, siempre que el **proveedor garantice que el email está
    verificado**. Un email sin verificar nunca identifica a nadie. En Microsoft esto
    cierra la vulnerabilidad conocida como nOAuth (un email escrito a mano en otra
    organización de Entra).
  - **ROOT no entra por SSO**: solo con contraseña y app autenticadora, como hoy.
  - En el primer ingreso, el usuario queda **vinculado a esa cuenta puntual del
    proveedor** (por su identificador inmutable, no por el email). Otra cuenta con
    el mismo email no entra: el caso típico es una dirección del colegio que pasa a
    otra persona. El vínculo lo **resetea un administrador**, con el criterio del
    reseteo de 2FA: ROOT a cualquiera; un ADMINISTRADOR solo a quien pertenece
    únicamente a su cliente.
  - El **selector de cliente no cambia**: quien tiene varios elige después del SSO y
    del 2FA, como hoy.
  - Los botones están **solo en la pantalla de login**. En esta entrega el usuario no
    ve ni desvincula su propia cuenta; eso lo hace el administrador.
  - Queda afuera, como en el punto 5: la **auditoría de logins**, el **alta
    automática** y la política **"solo SSO"**. Se pueden sumar después.
  - **Precisiones del 2026-10-09, al explorar** (ciclo `login-sso`):
    - "Resetear vínculo SSO" es **un solo botón** que borra los vínculos del usuario
      con **todos** los proveedores y además **cierra sus sesiones abiertas**, igual
      que el reseteo de 2FA.
    - Cuando el SSO no deja entrar, el usuario ve **un único mensaje genérico**, sea
      cual sea el motivo (email inexistente o sin verificar, otra cuenta con el mismo
      email, ROOT, usuario inactivo o sin membresías). El motivo real queda solo en
      los logs del servidor, como hoy en el login con contraseña.
- **Segunda etapa, punto 8 — API pública + webhooks** (decidido el 2026-10-10):
  - **Se entrega en dos etapas: primero la API, después los webhooks.** Cada etapa se
    cierra por separado.
  - **Etapa 1, API:**
    - Expone **solo tickets**: listar, ver, crear y comentar. Transicionar, asignar,
      equipos y compras quedan para más adelante.
    - Cada cliente tiene un **usuario de integración técnico**, con su membresía, que
      figura como autor de lo que hace la API. No se cambia el modelo de tickets.
    - Las claves son **por cliente** y están atadas a ese usuario. Cada clave lleva
      permisos elegidos de un subconjunto: lectura, alta y comentario.
    - **ROOT habilita la API por cliente**, como el formulario público. El
      **ADMINISTRADOR** crea y revoca las claves desde una pantalla nueva,
      "Integraciones", en el área de administración.
    - La API entra por una **ruta propia del frontend, `/api/v1/*`**, que reenvía la
      clave al backend. No se toca la configuración de IIS.
    - Hay un **límite de pedidos por clave** (del orden de 60 por minuto).
    - La documentación es **OpenAPI**, generada solo para las rutas de la API.
    - Cada clave guarda su **último uso**, visible en la pantalla. No hay auditoría de
      cada llamada en esta etapa.
    - La clave se muestra **una sola vez** al crearla y se guarda hasheada.
    - **Cumplida, con cinco desviaciones aprobadas por el dueño** (2026-10-10, cadena
      local `feat/api-publica` integrada a `main` en `068f53f1` y desplegada el
      2026-10-11, documento `odd/tasks/api-publica.md`): las nueve
      viñetas están implementadas y probadas. Usuario de integración que no entra por
      login ni SSO; claves con permisos de lectura, alta y comentario; habilitación por
      ROOT y pantalla "Integraciones" para el ADMINISTRADOR; ruta `/api/v1/*` sin cambio
      de IIS; 60 pedidos por minuto por clave (`API_V1_RATE_LIMIT`); OpenAPI solo de las
      rutas v1; último uso visible; clave mostrada una vez y guardada como sha256. Las
      desviaciones, todas decididas el 2026-10-10:
      - **`GET /api/v1/catalogos`** (tipos, prioridades y estados, solo lectura). Amplía
        el "solo tickets": sin él, el integrador no puede descubrir los ids que exige el
        alta.
      - **Un comentario por API no cuenta como primera respuesta de SLA.** El usuario de
        integración habla por el cliente, no por soporte.
      - **El alta v1 responde 422 si el tipo no es un tipo activo del módulo TICKETS**,
        el mismo conjunto que publica el catálogo. Sin eso se creaban tickets que la
        misma clave no podía listar.
      - **El JSON de OpenAPI es público, sin clave**, en todos los entornos: describe el
        contrato y no expone datos.
      - **El ADMINISTRADOR no ve si la API está habilitada antes de crear una clave.** El
        JWT no trae la marca y `/clientes/*` es solo de ROOT; la pantalla lo explica en
        una nota y el alta responde 422 con el motivo. Queda así en la etapa 1, sin
        cambio de backend.
  - **Etapa 2, webhooks:**
    - Eventos: ticket **creado**, **cambio de estado**, **asignado** y **comentado**
      (solo comentarios públicos). Los vencimientos de SLA quedan para más adelante.
    - Entrega **al menos una vez**, con reintentos: los avisos se encolan en la base
      del cliente y un proceso periódico los reenvía hasta que el destino responde.
    - Cada aviso lleva un **resumen corto** del ticket (identificador, número, estado,
      tipo y fechas). El detalle se pide por la API.
    - Se ve un **registro de entregas** en la pantalla de Integraciones.
    - Los secretos de firma se guardan **cifrados**, con la misma clave y el mismo
      procedimiento de rotación que las contraseñas de correo.
    - **Cumplida, con una desviación declarada de antemano** (2026-10-13, cadena local
      `feat/webhooks` integrada a `main` en `c207e8a3` y desplegada el mismo día, documento
      `odd/tasks/webhooks.md`). Cada viñeta es un criterio de aceptación de ese
      documento:
      - Eventos (CA1): **Cumplida**. Solo creado, cambio de estado, asignado y
        comentado público; un comentario interno no genera aviso y no hay eventos de
        SLA.
      - Entrega al menos una vez (CA2): **Desviación** (D1). Los reintentos se acotan
        a unas 24 horas (10 intentos) y después la entrega queda FALLIDA, en vez de
        seguir "hasta que el destino responde": reintentar para siempre a un destino
        muerto llena la cola y no lo arregla. Nota D2: el aviso se encola después del
        commit, así que si el proceso se cae entre el commit y el encolado ese aviso se
        pierde; se acepta la ventana porque es muy chica y la API permite reconciliar.
      - Resumen corto (CA3): **Cumplida**. Identificador, número, estado, tipo y
        fechas, sin título, descripción ni comentarios.
      - Registro de entregas en Integraciones (CA4): **Cumplida**.
      - Secretos cifrados con `EMAIL_CRYPTO_KEY` y re-cifrados por
        `rotar-email-crypto-key.mjs` (CA5): **Cumplida**.
- **Segunda etapa, punto 12 — tareas con técnico y crédito por tarea** (decidido el
  2026-10-13):
  - **Las tareas son de cualquier ticket.** Hay una tabla genérica de tareas colgada
    del ticket, para todos los tipos, incluidos *Mantenimiento* y *Preventivo*. Las
    subtareas de Edilicia se migran a esa tabla con sus datos (descripción, estado,
    quién y cuándo la completó) y la tabla vieja se retira.
  - **El ticket conserva su responsable.** El asignado del ticket sigue siendo el
    responsable: coordina y cierra. Cada tarea puede tener su propio técnico, y ese
    técnico es opcional.
  - **Quién gestiona las tareas.** Crean, asignan y borran tareas el responsable del
    ticket, el ADMINISTRADOR y ROOT, con el permiso de modificación del módulo del
    tipo. El técnico de una tarea tiene que ser elegible con la misma regla del
    punto 9: TÉCNICO o COLABORADOR con el módulo del tipo.
  - **El crédito es de quien completa.** Completan una tarea su técnico, el
    responsable o un administrador, y queda registrado quién la completó. Descompletar
    se permite, a las mismas personas, para corregir un error. Reordenar y editar el
    texto quedan afuera.
  - **El cierre no se bloquea.** Un ticket se puede resolver con tareas pendientes,
    igual que hoy.
  - **Métricas.** El dashboard suma una métrica nueva, "tareas completadas por
    técnico". Las métricas por ticket (carga, SLA, CSAT, exportación) siguen con el
    responsable.
  - **El avance se muestra en cualquier ticket con tareas**: el porcentaje de tareas
    completadas.
  - **Historial y PDF.** Asignar y completar una tarea queda en el historial del
    ticket. El PDF imprime cada tarea con su técnico.
  - **Afuera:**
    - el mail o webhook al asignar o completar una tarea;
    - asignar tareas con la regla del punto 9.

    `TicketEdilicia.personalAsignadoId`, que nunca se usó, se borra.
  - **Precisión (2026-10-13):** el técnico de una tarea activa ve el ticket, en el
    detalle y en su listado de tickets, aunque no sea el responsable ni tenga permiso
    para ver todos. Sin esto, un técnico sin ese permiso no llega a su tarea.
  - **Cumplida** (2026-10-14, cadena local `feat/tareas-con-tecnico` integrada a
    `main` en `32037bdf` con el `judgment-day` aprobado y desplegada el mismo día, documento
    `odd/tasks/tareas-con-tecnico.md`). Cada viñeta es un criterio de aceptación de ese
    documento, y no hubo desviaciones declaradas de antemano:
    - Tareas de cualquier ticket (CA1): **Cumplida**. Tabla `tareas_ticket` para todos
      los tipos, con la sección "Tareas" en el detalle de cualquier ticket. La migración
      copia las subtareas de Edilicia con id, descripción, estado, quién y cuándo, orden
      y bajas lógicas, y una migración posterior borra `subtareas_edilicia`.
    - El ticket conserva su responsable (CA2): **Cumplida**. `asignadoId` no cambia y
      cada tarea tiene un técnico opcional.
    - Quién gestiona (CA3): **Cumplida**. Crean, asignan y borran el responsable, el
      ADMINISTRADOR o ROOT con `<MÓDULO>:MODIFICACION` del tipo; un técnico que no es
      elegible por la regla del punto 9 se rechaza con 422.
    - El crédito es de quien completa (CA4): **Cumplida**. Completan y descompletan el
      técnico, el responsable o un administrador; queda registrado quién y cuándo, y
      descompletar lo limpia. No se puede reordenar ni editar el texto.
    - El cierre no se bloquea (CA5): **Cumplida**. La máquina de estados no cambió.
      *Ampliada el 2026-10-16* (ver "El estado del ticket sigue a sus tareas", más abajo):
      resolver con tareas pendientes sigue permitido, pero ahora completar tareas también
      mueve el estado solo.
    - Métricas (CA6): **Cumplida**. El dashboard suma "Tareas completadas por técnico",
      atribuidas por `completada_por_id`, y las métricas por ticket no cambian (un test
      compara el resto del payload antes y después). El período son los días argentinos
      del ciclo, de las 00:00 ART de `fecha_inicio` a las 00:00 ART del día siguiente a
      `fecha_fin` (03:00 UTC, porque Argentina es UTC-3 fijo), evaluado sobre
      `completada_en`. El corte en la medianoche UTC original lo marcó el `judgment-day`
      del 2026-10-14 (JD-W2) y se corrigió antes del merge.
    - Avance (CA7): **Cumplida**. Porcentaje de tareas activas completadas, en cualquier
      ticket con tareas, en Edilicia y en el PDF.
    - Historial y PDF (CA8): **Cumplida**. Asignar, completar y descompletar quedan en el
      historial con su autor (también el alta y la baja de una tarea), y el PDF imprime
      cada tarea con su técnico y su estado.
    - Afuera: **Cumplida**. No hay mail ni webhook por tareas, ni asignación automática
      de tareas. `TicketEdilicia.personalAsignadoId` se borró (CA9) y, por decisión del
      dueño del 2026-10-14, también la columna sin uso `porcentaje_avance`.
    - Precisión, el técnico de una tarea ve el ticket (CA10): **Cumplida**. Lo ve en el
      detalle, en el listado, en el historial y en sus tareas, y deja de verlo al
      quitarlo de la tarea o al borrarla.
    - **Quién lista las tareas, una precisión que la decisión no cubría** (decidida por
      el dueño el 2026-10-14, a partir del hallazgo JD-W3 del `judgment-day`): listar
      tareas sigue el permiso de lectura del módulo del tipo. Las lista el técnico de una
      tarea activa (CA10) o quien tiene `<MÓDULO>:LECTURA`; en el módulo TICKETS, además,
      tiene que ver el ticket, como en `/tickets`. Así, quien ve el listado de reparaciones
      con `EDILICIA:LECTURA` ve el checklist completo con el técnico de cada tarea, y el
      checklist de solo lectura sin técnico que armaba el frontend se retiró.
- **El estado del ticket sigue a sus tareas** (pedido fuera de los puntos; decisiones del dueño
  del 2026-10-16, feature `estado-por-tareas`, documento `odd/tasks/estado-por-tareas.md`).
  Revierte de forma acordada el ADR-2 del flujo de Edilicia ("completar la última tarea NO
  resuelve el ticket"), que el punto 12 había conservado en CA5:
  - **Aplica a todos los tipos de ticket con tareas**, no solo a Edilicia: las tareas son
    genéricas desde el punto 12.
  - **Completar una tarea pone el ticket En proceso.** Si estaba Nuevo recorre Asignado y En
    proceso; si estaba Asignado, pasa a En proceso. Si estaba Nuevo **sin responsable, quien
    completa pasa a ser el responsable**, con su entrada de asignación en el historial.
  - **Completar la última tarea pendiente pone el ticket Resuelto**, desde Nuevo, Asignado, En
    proceso o Esperando cliente, con lo mismo que la resolución manual: fecha de cierre, historial
    por cada paso, reloj de SLA y la notificación de resuelto.
  - **Descompletar una tarea de un ticket Resuelto lo devuelve a En proceso**, haya sido resuelto
    por tareas o a mano (no se guarda de dónde vino la resolución).
  - Las transiciones automáticas no piden los permisos de transicionar ni de asignar: alcanza con
    poder completar la tarea. Van en la misma transacción que la tarea, y dos completados a la
    vez de las últimas tareas resuelven el ticket una sola vez.
  - **Cumplida** (2026-10-16, rama `feat/estado-por-tareas`). Cada viñeta es un criterio de
    aceptación del documento, sin desviaciones declaradas.
- **Detalle del ticket legible y edición de reparaciones** (pedido fuera de los puntos; decisiones
  del dueño del 2026-10-17, feature `detalle-ticket-legible`, documento
  `odd/tasks/detalle-ticket-legible.md`):
  - **Tareas y Actividad son tarjetas** con título, como Acciones, y en modo claro cada tarjeta
    tiene un fondo pastel distinto (azul, verde, ámbar); en modo oscuro no se tiñen.
  - **La Actividad entera se muestra de lo más nuevo a lo más viejo**, y el formulario de
    comentario y el adjunto viven arriba de la línea de tiempo, dentro de Actividad. La sección
    "Nuevo comentario" desaparece.
  - **Edilicia permite editar una reparación que no se empezó a trabajar**: estado Nuevo o
    Asignado y sin tareas completadas. Fuera de eso, solo ROOT. Una reparación **bloqueada** por
    una compra en curso no la edita nadie, ROOT incluido. Se editan título, descripción, la
    ubicación propia de Edilicia (que hasta ahora no se editaba desde ningún lado), prioridad y
    sector. Endpoint nuevo `PATCH /reparaciones/:id` con `EDILICIA:MODIFICACION`.
  - **Cumplida** (2026-10-17, rama `feat/detalle-ticket-legible`). Cada viñeta es un criterio de
    aceptación del documento, sin desviaciones declaradas.
- **Ticket cerrado, cancelado o bloqueado: tareas y comentarios de solo lectura** (pedido fuera
  de los puntos; decisiones del dueño del 2026-10-17, feature `ticket-cerrado-solo-lectura`,
  documento `odd/tasks/ticket-cerrado-solo-lectura.md`):
  - **Las tareas de cualquier ticket** (Soporte y Edilicia) dejan de modificarse cuando el ticket
    está **Cerrado** o **Cancelado**: ni crear, ni completar, ni descompletar, ni eliminar, ni
    asignar técnico, para nadie (ROOT incluido). **Resuelto no bloquea**: descompletar una tarea
    de un ticket resuelto lo devuelve a En proceso, y eso tiene que seguir pudiéndose.
  - En Edilicia, una reparación **bloqueada** por una compra en curso tampoco acepta cambios en
    sus tareas, y **los comentarios de la reparación** siguen la misma regla (cerrado, cancelado o
    bloqueada). Ver siempre se puede: listas y conteos siguen igual.
  - El backend rechaza con 422 y el motivo; la pantalla oculta los controles y muestra el motivo
    en el diálogo de subtareas, en el de comentarios y en el detalle del ticket.
  - **Cumplida** (2026-10-17, rama `feat/ticket-cerrado-solo-lectura`). Cada viñeta es un criterio
    de aceptación del documento, sin desviaciones declaradas. Deuda de Ayuda:
    `reparaciones-edilicias.md` no menciona que en esos estados no se agregan subtareas ni
    comentarios (queda incompleto, no falso).
- **Ubicación y sector en el ticket** (pedido fuera de los puntos; decisiones del dueño del
  2026-10-15, feature `ubicacion-sector-ticket`, documento
  `odd/tasks/ubicacion-sector-ticket.md`):
  - Todo ticket suma dos campos **opcionales**: **Ubicación**, texto libre, y **Sector**,
    elegido de un desplegable con los sectores cargados en el cliente.
  - Edilicia **conserva su propia ubicación** (`ticket_edilicia.ubicacion`): la Ubicación
    general es un campo aparte y en los tickets de Edilicia **se oculta**; ahí se ve solo
    la de Edilicia. El Sector se ve también en Edilicia.
  - Se cargan **solo desde la aplicación**: el formulario público y la API v1 no los
    aceptan por ahora.
  - Los listados de tickets y de Edilicia los muestran como ayuda al lector, **sin
    filtros** nuevos.
  - En Edilicia, el botón de las tareas (ex subtareas) muestra **cuántas hay**, igual
    que el de comentarios.
  **Cumplida** (2026-10-16, feature `ubicacion-sector-ticket`, `judgment-day` aprobado tras
  corregir JD-W1): migración tenant `20261015200000_ubicacion_sector_tickets` (`tickets.ubicacion`
  y `tickets.sector_id`), alta y edición por `POST`/`PATCH /tickets` y alta de Edilicia con solo
  el sector; un sector inexistente da 422 y uno desactivado se conserva con su nombre. La
  ubicación general se oculta en Edilicia (detalle y edición; un tipo desactivado de otro módulo
  la sigue mostrando). La API v1 y el formulario público no aceptan los campos (tests). Los
  listados muestran Ubicación y Sector (Edilicia, Sector y su propia ubicación) sin filtros, y el
  botón "Ver subtareas" lleva la cantidad. Precisiones sin cambio de producto en el documento:
  editar los campos no deja historial, como el resto de los datos; el diálogo de soporte desde
  un equipo no los suma; el `PATCH` no rechaza `ubicacion` en Edilicia (lo evita la interfaz).

**Calidad de la evidencia.** Lo de GLPI y los precios oficiales de Freshworks,
Zendesk, Zoho y ManageEngine salen de fuente primaria. Los precios de los CMMS, de
Odoo y de los proveedores regionales salen de agregadores y son indicativos. No se
verificó presencia local ni facturación en pesos de ningún proveedor extranjero.

## Deuda técnica conocida

Ninguna bloquea el roadmap. Se anota acá porque una deuda que solo vive en la
cabeza de alguien deja de existir cuando esa persona no está.

**Ordenada por lo que puede hacer más daño:**

| Qué | Por qué importa |
|---|---|
| ~~**Regeneración reproducible del entorno**~~ — **RESUELTA** el 2026-09-29. La creación del contenedor está documentada desde el 2026-09-09: `README.md:381` trae el `docker run` completo y `pnpm entorno:verificar` / `pnpm entorno:regenerar` (`55be976`). El hueco de permisos del seed era menor de lo que decía esta fila. Al regenerar desde cero, cada usuario demo ya recibía su preset en el alta, por el fix W4 de `CrearUsuarioTenantUseCase`. Lo que fallaba era **re-correr** el seed: solo el técnico volvía a su preset, y COLABORADOR y USUARIO conservaban lo que alguien hubiera tocado a mano. Desde el 2026-09-29 se re-aplica a los tres, y `demo-seed.integration.spec.ts` prueba los dos casos | Es el cimiento del que cuelga toda la política de datos descartables. Destruir y regenerar sale más barato que migrar **solo si el generador está sano y regenerar es un comando**. Falló dos veces el 2026-08-21: el seed reproduciría el hueco de permisos, y al perderse la base local el README arranca en "cuando haya una instancia de Postgres disponible" — justo después del paso que faltaba |
| **Los feriados sembrados llegan hasta 2029.** Hasta el 2026-09-29 llegaban hasta 2028; la migración `20260929120000_seed_feriados_2029` sumó 2029 con las mismas reglas (el 17/06, Güemes, cae domingo y queda afuera). El horario semanal y los feriados ya se configuran desde la pantalla: `feriados-configurables` (issue #216, `912140e`) agregó el ABM de feriados globales (`/admin/feriados-globales`, solo ROOT) y por cliente (`/feriados`), y `horario-laboral-por-cliente` agregó `/horario-laboral`. Las dos cosas están en producción desde el deploy del 2026-09-29 | Los nacionales de 2030 en adelante no existen hasta que un ROOT los cargue desde `/admin/feriados-globales` o una migración los siembre. Sin eso, a partir de 2030 el SLA hábil cuenta los feriados nacionales como días laborables |
| ~~**Los tiempos medios del dashboard recorren todo el historial en cada consulta.** `tiempoPromedioResolucionHoras` y `tiempoPromedioPrimeraRespuestaHoras` traían todos los tickets cerrados o respondidos del cliente y promediaban en memoria~~ — **RESUELTA** el 2026-10-15 (ver `odd/tasks/promedios-dashboard-habiles.md`). Esta fila decía que las dos métricas medían horas hábiles, y no era así: la de resolución promediaba **horas corridas** `fecha_cierre - created_at`, sin calendario, sin descontar las esperas del cliente y con los preventivos adentro; solo la de primera respuesta era hábil, recalculada con el calendario actual. Por decisión del dueño, cada ticket guarda dos valores en segundos hábiles, fijos con el calendario vigente al guardarse: `resolucion_habil_s` (el acumulado del reloj de SLA al llegar a RESUELTO, sin pausas; se borra al reabrir) y `primera_respuesta_habil_s` (al registrarse la primera respuesta). El dashboard los promedia con `AVG` en SQL, sin preventivos en ninguno de los dos, y la tarjeta dice "horas hábiles, sin pausas". El historial se completó con la migración `20261015140000_tiempos_habiles_tickets` y `scripts/backfill-tiempos-habiles.mjs`. Los 5735 tickets importados sin ningún paso a RESUELTO en su historial (8 tenants) quedaron con una resolución **aproximada**, horas hábiles de `created_at` a `fecha_cierre`, con precisión de día (`odd/tasks/backfill-resolucion-importados.md`, 2026-10-15) | Medido el 2026-10-07: 30.000 tickets con tramos de hasta 30 días tardaban ~900 ms por métrica y por carga, y cambiar el horario o los feriados recalculaba todo el historial. Al desplegarlo, el promedio de resolución baja: deja de contar noches, fines de semana y esperas del cliente |
| ~~**Al reabrir un ticket desde CERRADO, `sla_cumplido` conserva el valor del cierre anterior hasta el próximo RESUELTO.** El pliegue del reloj solo limpia el cumplimiento cuando la reapertura sale de RESUELTO (`backend/src/sla/domain/entities/reloj-sla.ts:137-138`); el salto correctivo desde CERRADO deja el `true` o `false` viejo con el reloj corriendo. Hallazgo de la exploración de `promedios-dashboard-habiles` (2026-10-15)~~ — **RESUELTA** el 2026-10-16 (rama `fix/sla-cumplido-reapertura-desde-cerrado`): el pliegue limpia `cumplido` en toda reapertura que vuelve a correr el reloj desde RESUELTO o CERRADO (`ESTADOS_RESOLUCION`), con test de regresión en `reloj-sla.cumplimiento.spec.ts` que falló antes del fix (`expected false to be null`) | Hoy no se ve: la reapertura limpia `fecha_cierre`, así que el % de cumplimiento del dashboard no cuenta el ticket, el estado SLA derivado mira el vencimiento mientras el reloj corre, y el próximo RESUELTO recalcula el cumplimiento. Pero la columna miente mientras tanto, y un lector nuevo de `sla_cumplido` sobre un ticket abierto vería el cierre viejo. `resolucion_habil_s` no tiene el problema: se borra en cualquier reapertura. El arreglo es limpiar `cumplido` en toda transición que vuelve a correr el reloj desde RESUELTO o CERRADO |
| ~~**El horario semanal es global, no por cliente.** `CalendarioLaboralDia` (clave: solo `dia_semana`) vive en la base **master** (`backend/prisma_master/schema.prisma`), sin columna de cliente.~~ | **RESUELTA** el 2026-09-29. Ciclo `horario-laboral-por-cliente`: `CalendarioLaboralDiaCliente` en la base de cada tenant (un intervalo por día, editable por ADMINISTRADOR o ROOT). El SLA hábil lee solo el horario del propio cliente, sin unión con master; la tabla master `calendario_laboral_dias` se dropeó el mismo día (`20260929100000_drop_calendario_laboral_dias`). |
| **0 casts en 0 specs** (`as never`/`as any` en 0, eran 594 en 111; `as unknown as` en 0, eran 166 en 60, hasta el 2026-10-16), congelados por un ratchet que **no frena ningún merge** | `scripts/check-casts-en-specs.mjs` (issue #212) se instaló el 2026-09-23 con base **693 en 123 archivos**, todos en `backend/`, y frontend en cero. Es un ratchet: falla si el número sube, y también si baja sin actualizar su línea base. **Igual subió**: el 2026-09-29 medía 759 en 136, porque no corre en ningún lado donde frene un merge. Las integraciones de la semana fueron merges locales, y el CI de GitHub Actions estaba caído desde el 2026-09-18 por falta de minutos. Ese mismo día se bajaron los 66 casts nuevos completando los mocks contra sus puertos, y volvió a 693 en 123. El CI volvió a correr el 2026-10-01, pero sobre el push a `main`: con integraciones locales detecta después de integrar, así que el ratchet se sigue corriendo a mano antes. Desde el 2026-10-16 el ratchet cuenta también los `as unknown as`, la misma deuda con otra forma: eran 166 en 60 specs y quedaron 9 en 7 (más uno en `backend/scripts/`, fuera del alcance del ratchet), cada uno con su motivo en un comentario: probaban a propósito una entrada inválida o la ausencia de una propiedad (`odd/tasks/unknown-casts-en-specs.md`). Ese mismo día, en la rama `refactor/ultimos-casts-en-specs`, esos 10 se reescribieron sin cast: `@ts-expect-error` sobre la línea inválida y `not.toHaveProperty` para la propiedad ausente, y la base quedó en **0 en 0**. El 2026-10-01 la línea base bajó de 693 en 123 a **666 en 121**, después a **627 en 116** (medido el 2026-10-03) y el 2026-10-06 a **617 en 114** (`dc45c63b`), el 2026-10-14 a **594 en 111** (`dfed21b5`) y el 2026-10-16 a **116 en 31** (rama `refactor/casts-en-specs`, `odd/tasks/casts-en-specs.md`: equipos, tickets, auth, clientes, compras, reparaciones y preventivo quedaron en cero, con dobles tipados contra sus puertos; `BASE_OCURRENCIAS` y `BASE_ARCHIVOS` en `scripts/check-casts-en-specs.mjs`, medido de nuevo el 2026-10-16) y ese mismo día a **0 en 0** (rama `refactor/casts-en-specs-2`, `odd/tasks/casts-en-specs-2.md`: insumos, kb, sectores, dashboard, csat, notificaciones, shared y sla). **Corrección de método**: la versión anterior de esta fila decía "eran 301 en 83 specs, hoy 672 en 121 — se duplicó en tres semanas". Los dos números medían cosas distintas: el 301 era **solo `as never`** y el 672 era **`as never` + `as any`**. El crecimiento real del combinado fue **527 → 693 en 33 días, +31%** — real y sostenido, pero no una duplicación. Un número mantenido a mano no solo envejece: puede nacer mal |
| ~~**El alta interna de tickets acepta tipos dados de baja.** `CrearTicketUseCase` busca el tipo con `findById`, que no mira `activo`. Hallazgo de la tarea T5e de la API pública (2026-10-10): la API v1 lo corrige con su propia validación (`TiposTicketV1Query`), pero el alta de la app quedó igual, fuera del alcance de esa tarea~~ — **RESUELTA** el 2026-10-15 (ver `odd/tasks/deuda-tecnica-2026-10-15.md`, T1 y T2). `CrearTicketUseCase` rechaza un tipo desactivado con el mismo error que uno inexistente. Por decisión del dueño, los tres tipos fijos del sistema (`PREVENTIVO`, `SOPORTE`, `EDILICIA`) no se pueden desactivar ni cambiar de código, ni siquiera ROOT: el preventivo, el QR, los equipos y Edilicia dependen de ellos | Un tipo dado de baja todavía puede recibir tickets nuevos por la API interna. El arreglo natural es validar `activo` en el caso de uso, que comparten todos los canales de alta: hay que revisar cada uno antes de cambiarlo |
| ~~**`x-forwarded-for` pasa sin validar por el BFF.** La ruta `/api/v1/*` lo reenvía tal como llega, igual que `publico/` (T7 de la API pública)~~ — **RESUELTA** el 2026-10-16 (rama `fix/xff-bff-ip-derecha`): los dos proxies (`/api/v1/*` y `publico/` en el genérico) reenvían solo la entrada que agrega IIS/ARR, validada como IP por `ipDelNavegador`, el mismo helper que ya usaba el BFF de sesión; una lista con IP del cliente a la izquierda o un valor inventado ya no llegan al backend (tests en los dos `route.test.ts`, en rojo antes del fix) | Un cliente puede falsearlo. Hoy no afecta, porque el límite de la API es por clave y no por IP. Si algún día se audita o se limita por IP, IIS tiene que fijar el header |
| ~~**`TicketsModule` no exporta los casos de uso que usa la API v1.** `ListarTicketsUseCase`, `CrearComentarioUseCase` y los tres listados de catálogos se arman con `useFactory` dentro de `ApiV1Module` (T5 y T5c de la API pública)~~ — **RESUELTA** el 2026-10-15 (ver `odd/tasks/deuda-tecnica-2026-10-15.md`, T3). `TicketsModule` los exporta y `ApiV1Module` ya no tiene copias; `api-v1.module.spec.ts` lo fija | Es cableado duplicado: un cambio en las dependencias de esos casos de uso hay que repetirlo en `ApiV1Module`. Lo prolijo es exportarlos desde `tickets.module.ts` |
| ~~**El límite de pedidos de la API v1 se cuenta en la memoria del proceso.** `api-v1-throttler.guard.ts` guarda los contadores por clave en memoria, igual que el límite de CSAT (T4 de la API pública)~~ — **RESUELTA** el 2026-10-15 (ver `odd/tasks/throttler-postgres.md`). Por decisión del dueño, los cuatro limitadores (API v1, CSAT, recuperación de contraseña y formulario público) cuentan en la tabla master `throttler_contadores`, con la misma semántica que el almacenamiento en memoria de `@nestjs/throttler`, y si la base no responde dejan pasar el pedido y lo registran en el log | Hoy el backend corre en un solo servicio NSSM, así que el límite vale tal cual. Si el backend escala a más de un proceso, cada uno cuenta por su lado y el límite real se multiplica por la cantidad de procesos. El arreglo es un almacenamiento compartido (por ejemplo, la base o Redis) |
| ~~**Las notificaciones de los tickets creados por la API van a una dirección inexistente.** El solicitante de esos tickets es el usuario de integración (`integracion+<id>@integraciones.invalid`), y el resolvedor de contactos de notificaciones no filtra `esIntegracion` (`prisma-usuario-contacto-resolver.ts`). Hallazgo JD-4 del `judgment-day` de la API pública (2026-10-11), confirmado por los dos jueces como sugerencia~~ — **RESUELTA** el 2026-10-11 (ver `odd/tasks/deuda-api-publica.md`, T2). El resolvedor excluye `es_integracion = true` como contacto y como administrador, así que el listener omite el envío | Cada evento de esos tickets (alta, comentario, cierre, CSAT) intenta un envío por el SMTP del cliente que falla o rebota. El arreglo es no notificar al usuario de integración |
| ~~**Un guardado viejo de cliente puede volver a habilitar la API.** `ClienteMapper.toPersistence` escribe `apiHabilitada` en cada guardado; si otro caso de uso de clientes leyó la entidad antes de que ROOT deshabilitara la API y guarda después, la vuelve a dejar en `true`. Hallazgo JD-5 del `judgment-day` (2026-10-11), visto por un solo juez~~ — **RESUELTA** el 2026-10-11 (ver `odd/tasks/deuda-api-publica.md`, T1). El mapper ya no escribe `api_habilitada`; la escribe solo `IApiHabilitadaRepository` desde `ConfigurarApiClienteUseCase`, y `configurar-api-cliente.integration.spec.ts` prueba el guardado viejo contra la base | Es la misma carrera que el mapper ya evita con `slugCongeladoAt`. Si pasa, las claves vuelven a funcionar sin que ROOT lo sepa. El arreglo es omitir `apiHabilitada` del upsert general y escribirla solo desde `ConfigurarApiClienteUseCase` |
| ~~**`ApiV1Module` registra un segundo `ThrottlerModule` global** (`forRootAsync`), contra la convención del repo (`recuperacion-password-throttler.guard.ts:15-21`). Hallazgo JD-6 del `judgment-day` (2026-10-11), visto por un solo juez~~ — **RESUELTA** el 2026-10-11 (ver `odd/tasks/deuda-api-publica.md`, T4). `ApiV1Module` provee localmente el token de opciones y su `ThrottlerStorage`, como `FormularioPublicoModule`; `api-v1.module.spec.ts` lo fija y los e2e del límite v1 siguen verdes | Con dos registros globales, qué opciones y qué almacenamiento recibe cada guard depende del orden de import. Hoy cada guard resuelve el suyo, pero es frágil. El arreglo es proveer las opciones y el almacenamiento localmente, como `formulario-publico.module.ts` |
| ~~**Habilitar la API dos veces a la vez puede dar un 500.** `ConfigurarApiClienteUseCase` busca y crea el usuario de integración sin transacción; la segunda llamada choca con el email único. Hallazgo JD-7 del `judgment-day` (2026-10-11), visto por un solo juez~~ — **RESUELTA** el 2026-10-11 (ver `odd/tasks/deuda-api-publica.md`, T3). El usuario y la membresía se insertan con `ON CONFLICT DO NOTHING` (`IUsuarioIntegracionRepository`) y el caso de uso relee el usuario que quedó; `configurar-api-cliente.integration.spec.ts` corre dos habilitaciones con `Promise.all` | Solo da un 500 espurio: el flag se guarda al final y reintentar lo resuelve |
| ~~123 errores de tipos escondidos tras la exclusión `**/*.spec.ts`~~ | **RESUELTO** el 2026-08-21 (Fase 0, carril A). El gate quedó instalado y probado: un error de tipo en un spec ahora rompe `pnpm typecheck` |
| ~~Render de fechas del frontend~~ | **RESUELTO** el 2026-08-21 (Fase 0, carril B). Un solo módulo formatea fechas, con regla de lint que impide una séptima copia |
| ~~**Rotación de `EMAIL_CRYPTO_KEY`**: no existe herramienta~~ | ~~Rotarla sin re-cifrar convierte TODA contraseña SMTP guardada en basura indescifrable. El payload lleva prefijo `v1:` justamente para permitir una migración de re-cifrado, pero esa migración no está escrita~~ **RESUELTA** el 2026-09-28. El ciclo `rotacion-email-crypto-key` entrega el script Node + `.ps1` operativo + runbook + tests end to end (referencias `openspec/changes/archive/2026-09-28-rotacion-email-crypto-key/`)|
| ~~Sin e2e dedicado para las 4 rutas de `/correo`~~ | **RESUELTA** el 2026-09-29: `correo-cliente.e2e.spec.ts`, 21 tests con los guards reales. Cubre 401/403/404 en las 4 rutas, que la contraseña nunca sale en una respuesta y queda cifrada en la base, el guardado con la contraseña omitida, "probar" con un verificador falso (nunca un SMTP real) y el borrado. Verificado mutando: sin `GlobalAdminGuard` fallan los 403, y si la respuesta filtra la contraseña fallan los de fuga |
| ~~`SmtpEmailSender.send()` loguea el `error.message` crudo de nodemailer~~ | **RESUELTA** el 2026-09-29. Algunos servidores SMTP devuelven el usuario dentro de la respuesta 535. El log ahora lleva solo el `code` de nodemailer, contra un allowlist cerrado, y el status SMTP numérico (`smtp-error.ts`), con el mismo criterio que la verificación de conexión |
| ~~Postgres de producción con `TimeZone = America/Sao_Paulo`~~ | **RESUELTA** el 2026-09-14 por el ciclo `sesion-utc-y-backfill-de-fechas`; esta fila quedó vencida hasta el 2026-09-29. Medido en producción ese día: master y los 8 tenants activos tienen `TimeZone=UTC` a nivel de base (`pg_db_role_setting`), una sesión nueva da `UTC` con origen `database`, la app además fuerza UTC por conexión (`conUtc()`), y `postgres-admin.service.ts` aplica el mismo `ALTER DATABASE` a cada tenant nuevo. Solo puede quedar en `America/Sao_Paulo` el default del servidor (`postgresql.conf`, no legible sin superusuario), que no toca ningún dato de la app: afecta conexiones manuales a bases ajenas, como `postgres`. No se cambia |
| ~~**`rotate-jwt.ps1` está bloqueado hasta reescribirlo.** Versionado el 2026-09-29 junto con `install-cert-soporte.ps1`; los dos vivían solo en el VPS~~ | **RESUELTA** el 2026-09-29. `backend/.env` pasa a ser la única fuente de `JWT_SECRET`: hasta entonces la clave vivía además en `frontend/.env.local` y en una variable de entorno MACHINE vieja, y el servicio del backend heredaba esa MACHINE, que `dotenv/config` no pisa, mientras el build del frontend usaba la de `backend/.env`. El procedimiento manual que el runbook describía (editar los `.env` y correr `deploy.ps1`) dejaba backend y frontend con claves distintas, y con eso nadie puede loguearse. `deploy.ps1` ahora carga `JWT_SECRET` de `backend/.env` al build del frontend y al NSSM del backend, y `rotate-jwt.ps1` reescribe los dos `.env`, mezcla el NSSM, borra la variable MACHINE, reconstruye el frontend y reinicia los servicios (`DEPLOY-VPS-runbook.md`, sección "`rotate-jwt.ps1`") |
| ~~Corridas de tests **interrumpidas** dejan bases huérfanas en el Postgres local~~ | **RESUELTA** el 2026-08-22 (`43267d4`), y esta fila quedó vencida hasta el 2026-09-29. La suite barre sola las bases efímeras huérfanas al arrancar: `backend/test/barrido-huerfanas.global-setup.mjs`, con tres puertas fail-closed (patrón de nombre, ausencia en el registro de `clientes` y ninguna conexión viva). Si el registro no se puede leer, no barre nada. Medido el 2026-09-29: cero huérfanas en el Postgres local |

### Deuda de Ayuda

La escritura de artículos de `backend/ayuda/*.md` está en pausa desde el 2026-09-07
(ver `CLAUDE.md`). Esta lista arranca con el punto 7 de la segunda etapa; la deuda
de las entregas anteriores está anotada solo en los mensajes de sus commits
("Deuda de Ayuda"). Lo que queda por cubrir cuando se retome:

- **Login con Google o Microsoft (SSO)** (2026-10-10, anotada en los commits de la
  cadena `feat/login-sso`):
  - los botones de los proveedores en la pantalla de login y el mensaje genérico
    cuando el SSO no deja entrar;
  - el botón "Resetear vínculo SSO" de la administración de usuarios.
- **API pública, etapa 1** (2026-10-10, anotada en los commits de T8 y T9):
  - ningún artículo cubre la acción "API" de la pantalla Clientes (ROOT): no hay
    artículo de esa pantalla;
  - falta un artículo nuevo para la pantalla "Integraciones" del ADMINISTRADOR.
- **Webhooks, etapa 2 de la API pública** (2026-10-13, anotada en los commits de T7 y
  T8 de la cadena `feat/webhooks`):
  - la sección "Webhooks" de la pantalla "Integraciones": destino, eventos, secreto
    mostrado una sola vez, regenerar secreto y registro de entregas;
  - qué es un webhook, cuándo se envía, los reintentos y qué hace el integrador con el
    secreto.
- **Tareas con técnico, punto 12 de la segunda etapa** (2026-10-14, anotada en los
  commits de T3b, T6 y T7 de la cadena `feat/tareas-con-tecnico` y en
  `odd/tasks/tareas-con-tecnico.md`):
  - la sección "Tareas" del detalle de un ticket de cualquier tipo: alta, técnico por
    tarea, completar y descompletar, borrar, quién puede cada cosa y el avance;
  - las cinco entradas nuevas del historial del ticket ("Tarea agregada", "Técnico de
    tarea", "Tarea completada", "Tarea descompletada" y "Tarea eliminada");
  - el indicador "Tareas completadas por técnico" del dashboard: a quién se atribuye y
    cómo cuenta el ciclo;
  - que el técnico de una tarea ve el ticket aunque no tenga permiso para ver todos
    (el listado ya lo dice; falta el detalle y las tareas).
- **Ubicación y sector en el ticket** (2026-10-16, anotada en los commits de la rama
  `feat/ubicacion-sector-ticket` y en `odd/tasks/ubicacion-sector-ticket.md`; los listados ya
  se corrigieron en `58c3c53b`):
  - los campos Ubicación y Sector en el alta y la edición del ticket, y el Sector en el alta de
    Edilicia (en Edilicia la ubicación general no aparece);
  - la cantidad en el botón "Ver subtareas" del listado de Edilicia.
- **Detalle del ticket legible y edición de reparaciones** (2026-10-17, anotada en los commits de
  la rama `feat/detalle-ticket-legible` y en `odd/tasks/detalle-ticket-legible.md`):
  - el detalle del ticket: Tareas y Actividad como tarjetas, la Actividad de lo más nuevo a lo más
    viejo, y el comentario y el adjunto arriba de la línea de tiempo (ya no existe la sección
    "Nuevo comentario");
  - la columna "Editar" del listado de reparaciones (`reparaciones-listado.md` enumera las
    columnas sin ella): qué campos edita, cuándo se habilita (Nuevo o Asignado, sin tareas
    completadas), que ROOT puede igual y que una reparación bloqueada no se edita.
- **El estado del ticket sigue a sus tareas** (2026-10-16, anotada en los commits de la rama
  `feat/estado-por-tareas` y en `odd/tasks/estado-por-tareas.md`):
  - que completar una tarea pone el ticket En proceso (y lo asigna a quien completa si estaba
    Nuevo sin responsable), que completar la última lo pone Resuelto, y que descompletar en
    Resuelto lo devuelve a En proceso; el aviso al pie de la sección "Tareas" lo adelanta.

## Nota

El multi-tenant ya está resuelto y funcionando con ocho clientes activos. Eso es lo caro
de un SaaS y ya está hecho: sumar el cliente número diez no cuesta trabajo de
infraestructura.
