# Permisos por tipo de ticket

Rama: `feat/permisos-por-tipo-ticket`. Reemplaza la decisión L3 de `odd/tasks/tipos-ticket-por-modulo.md`
("por módulo, como hoy"): el tipo de ticket pasa a ser la unidad de permiso, con derechos por acción.
Se entrega en etapas reversibles: la etapa 0 cierra los huecos actuales con el modelo por módulo.

## Specs

- **S0** — Etapa 0, sin modelo nuevo. Toda operación sobre un ticket existente (detalle, timeline,
  PDF, adjuntos, editar, cambiar estado, asignar, comentar, `/soporte`) decide el acceso con el
  MISMO criterio que el listado: visibilidad de fila más módulo del tipo del ticket. Hoy el
  listado oculta un ticket de un módulo ajeno pero el detalle por id lo muestra, y las escrituras
  no tienen scope de fila (relevamiento, L5). La decisión vive en un único punto reusable.
- **S1** — "los usuarios y los tecnicos no deberían acceder a cualquiera, solo a los que se le
  asignen y con los derechos que se le asignen (lectura, altas, modificacion, impresion, etc)".
  Las acciones sobre tickets se conceden por par (tipo de ticket, acción). Acciones: Ver, Ver
  todos, Crear, Modificar, Estado, Asignar, Comentar, Comentario interno, Imprimir, Borrar.
- **S2** — Derechos distintos por tipo para el mismo usuario: "puedo tener un tecnico o un
  colaborador que puede ver mantenimiento opero no modificar y puede ver y modificar soporte y
  edilicio, o que pueda borrar ticket de soporte pero no de mantenimiento".
- **S3** — Sin excepción por asignación: un ticket de un tipo sin "Ver" no se ve, aunque el
  usuario sea su responsable o tenga una tarea en él (L7: "A tu primer pregunta es no lo ve").
  Lo que no se ve tampoco se modifica: sin Ver, el resto de la fila queda deshabilitado.
- **S4** — Un tipo nuevo nace cerrado: nadie salvo ADMINISTRADOR y ROOT lo ve hasta asignarlo.
  Al crearlo, el formulario ofrece "Copiar permisos de: [tipo existente]", que da a cada usuario
  en el tipo nuevo la misma fila que tiene en el tipo elegido; "ninguno" lo deja cerrado (L7: "la
  creacion es correcta como decis").
- **S5** — La configuración vive en Admin → Usuarios → (usuario) → Permisos: una sección "Tipos de
  ticket" con una fila por tipo y una columna por acción, más "Aplicar plantilla del rol a la fila"
  y "Copiar permisos de otro usuario". Los módulos que no son tickets (Compras, Equipos, Insumos,
  Dashboard, KB) siguen en la grilla actual. El acceso al menú de un módulo con tickets se deriva
  de tener Ver en algún tipo de ese módulo (L9: "si, asi me cierra").
- **S6** — Lo hace cumplir el backend: cada operación verifica la acción sobre el tipo de ESE
  ticket (403 si falta) y los listados y exportaciones traen solo tipos con Ver. El frontend oculta
  los botones y en "Nuevo ticket" ofrece solo los tipos con Crear; es comodidad, no control.
- **S7** — Migración sin cambio de acceso el día del deploy: en cada tipo, cada usuario recibe las
  acciones que hoy tiene en el módulo de ese tipo, según la tabla de L11. `EDILICIA:LECTURA` da
  también Ver todos (hoy Edilicia no filtra). Imprimir se da a quien tenga Ver. Borrar arranca
  vacío. ADMINISTRADOR y ROOT no cambian. La migración es aditiva: los permisos `TICKETS:*` y
  `EDILICIA:*` de tickets se retiran recién en una etapa posterior, verificado el modelo nuevo.
- **S8** — Borrar ticket no existe hoy (no hay endpoint). Es funcionalidad nueva y va en una etapa
  propia, con sus decisiones abiertas: borrado lógico o físico, y qué pasa con tareas, adjuntos y
  compras vinculadas.

## Diseño

- **D1 (validado en T0, L13)** — Los pares (usuario, tipo, acción) se guardan en la base del
  tenant, junto a `tipos_ticket`, con FK al tipo: los tipos viven en el tenant y la base master no
  puede referenciarlos. No viajan en el JWT: su tamaño crecería con cada tipo y quedarían viejos
  hasta el refresh (hoy ya pasa con las celdas, relevamiento L5). Se resuelven por request.
- **D2** — Un único punto de decisión `puedeOperarTicket(actor, ticket, accion)` y un único filtro
  de listado. La etapa 0 lo implementa por módulo del tipo; la etapa 1 cambia su fuente a tipo ×
  acción sin tocar los llamadores. Antecedente: `tareas-ticket.reglas.ts`, el único lugar que hoy
  ya razona por el módulo del tipo.
- **D3** — El punto único vive en la capa de aplicación (casos de uso), nunca en el repositorio:
  los procesos de sistema (SLA, avance por tareas, listeners, barrido preventivo) leen tickets por
  el repositorio y no tienen actor. Respuesta: 404 `TicketNoEncontradoError` si el ticket no es
  visible para el actor (fila o módulo del tipo); 403 si es visible pero la acción no está
  permitida. ROOT y ADMINISTRADOR (`modulosPermitidos = null`) no se filtran por módulo.

- **D4 (L20-L22)** — Vocabulario por tipo: se reusan los códigos del catálogo actual
  (`LECTURA`, `VER_TODOS`, `ALTAS`, `MODIFICACION`, `TRANSICIONAR`, `ASIGNAR`, `COMENTAR`,
  `OBSERVAR`, `IMPRESION`, `BORRADO`) para no inventar una segunda lengua de permisos. La traducción
  de L11 vive una sola vez en el dominio y la usan el backfill, las plantillas de rol y los tests.

- **D5 (diseño de T5)** — (a) Los permisos por tipo del actor se leen por request de la tabla del
  tenant (`listarPorUsuario`, una consulta indexada) y viajan en `AlcanceActorTicket` como
  `permisosPorTipo: Map<tipoId, Set<AccionTipoTicket>> | null` (`null` = ROOT y ADMINISTRADOR, sin
  restricción); reemplaza a `modulosPermitidos` y a `tienePermisoVerTodos`. (b) Ver un ticket:
  `LECTURA` sobre su tipo, y además `VER_TODOS` sobre su tipo o la regla de fila
  (`esTicketVisiblePara`). (c) Cada operación exige además su acción sobre el tipo de ESE ticket:
  editar `MODIFICACION`, estado `TRANSICIONAR`, asignar `ASIGNAR`, comentar `COMENTAR`, comentario
  interno `OBSERVAR`, PDF `IMPRESION`, adjuntar `ALTAS` o `MODIFICACION` (hoy pide `TICKETS:ALTAS`),
  crear `ALTAS` sobre el tipo elegido, tareas `MODIFICACION`/`LECTURA` sobre el tipo. 404 si no lo
  ve; 403 si lo ve y le falta la acción. (d) Los decoradores `@RequiereAcciones('TICKETS:*')` y
  `EDILICIA:*` de rutas de tickets dejan de decidir: desde T7 esas celdas dejan de editarse. La ruta
  exige solo autenticación y tenant; decide el caso de uso. (e) Listados y exportaciones filtran
  por tipos con `LECTURA`, y por fila salvo en los tipos con `VER_TODOS`. (f) La clave de API v1 no
  tiene filas por tipo: su alcance se arma con las celdas de la clave traducidas por L11 sobre los
  tipos del módulo TICKETS. (g) Elegibilidad del asignado (`usuario-master.checker.ts`): tener
  `LECTURA` sobre el tipo del ticket. (h) Los flujos de sistema siguen sin chequeo (D3).

## Tasks

- [x] T0 — D1, D2, D3 — explore + inline — validar el diseño: lugar de guardado, resolución por
  request, inventario completo de llamadores del punto único — (este commit)
- [x] T1 — S0 — inline + worker — etapa 0, lecturas: detalle, timeline, PDF, API v1, adjuntos y
  `GET /soporte/:id` por el punto único — `c381c6ee`, `eedfbb6c`
- [x] T2 — S0 — worker — etapa 0, escrituras: editar, estado, asignar, asignables,
  asignar-en-proceso, comentar (incl. API v1), `/soporte` solución por el punto único — `eedfbb6c`
- [x] T3 — S0 — inline — etapa 0, front: gate de ruta en `/tickets` y `/tickets/[id]`, ítem de
  menú con `TICKETS:LECTURA`, inicio según el menú (L16) — `3bdf4627`
- [x] T4a — S1, D1, D4 — worker — tabla tenant `permisos_tipo_ticket` con CHECK derivado,
  vocabulario de acciones y traducción L11 en el dominio, repositorio — (este commit)
- [x] T4b — S7, L21 — worker — script de backfill idempotente (dry-run / `--apply`) y paso en
  `deploy.ps1` — (este commit)
- [x] T4c — S7 — worker — plantillas de rol por tipo: alta de usuario, cambio de rol y aplicar
  plantilla escriben las filas por tipo — (este commit)
- [x] T5a — S1-S3, S6, D5 a-c — worker — alcance por tipo cargado por request y punto único
  (`esTicketAccesiblePara` + acción); lecturas y escrituras por id del ticket — (este commit)
- [x] T5b — S6, D5 d-e — worker — rutas sin `@RequiereAcciones` de módulo; listado, exportación,
  creación por tipo, reparaciones y dashboard — (este commit)
- [x] T5c — S6, D5 f-g — worker — API v1 y elegibilidad del asignado por tipo — (este commit)
- [x] T6 — S6 — worker — etapa 1, front: botones, alta y filtros según acciones por tipo — (este commit)
- [x] T7 — S5 — writer — etapa 2: grilla por tipo en Permisos, plantilla por fila, copiar de
  usuario — (este commit)
- [x] T8 — S4 — writer — etapa 2: tipo nuevo cerrado y "Copiar permisos de" en el alta de tipo — (este commit)
- [ ] T9 — S7 — bloqueada: retiro de `TICKETS:*` / `EDILICIA:*` de tickets, tras verificar en
  producción — (pendiente)
- [ ] T10 — S8 — bloqueada: borrar ticket, espera las decisiones de S8 — (pendiente)

## Log

- **L1** (dueño, 2026-10-21) — "Hoy tenemos varios tipos de tickets los cuales algunos son
  accedidos desde edilicia o equipos o tickets, el tema esta que se pueden acceder a nuevos tipos
  creados por el administrador. el problema esta en que los usuarios y los tecnicos no deberían
  acceder a cualquiera, solo a los que se le asignen y con los derechos que se le asignen
  (lectura, altas, modificacion, impresion, etc). Hoy no se filtra y no se le da a cada usuario el
  acceso como corresponde a cada tipo de ticket. tenemos que analizar lo que tenemos y hacia donde
  tenemos que ir para hacer los cambios correctos y definitivos. Comprendes lo que te digo?"
- **L2** (dueño) — "si arranca el relevamiento"
- **L3** (dueño) — "Puedo tener un usuario o tecnico que puede ver Mantenimiento y edilicio pero
  no debe ver soporte ni los tiquet de soporte, el tema es como resolvemos si se siguen creando
  tipos de ticket como hacemos a controlarlos. Hoy solo esta mantenimiento pero puede aparecer
  "Electricidad". Lo que se puede hacer tambien es dejar fijo los tipos de ticket y que no se
  puedan dar mas de alta pero limito el soft. que teparece?"
- **L4** (decisión) — No se congelan los tipos: el problema es que un tipo nuevo nace abierto para
  todo el módulo, no que se creen tipos.
- **L5** (evidencia, relevamiento) — La matriz es módulo × acción (`UsuarioClientePermiso`, master),
  leída al emitir el JWT (`resolver-scope.ts`); `modulos` se deriva de tener cualquier celda del
  módulo. Huecos: `obtener-ticket.use-case.ts:43` solo mira `esTicketVisiblePara`, sin módulo;
  `editar-ticket.use-case.ts` no tiene chequeo de fila; `listar-reparaciones.use-case.ts:109`
  hace `findAll()` sin scope; `/tickets` y `/tickets/[id]` sin gate de ruta en el front.
  `IMPRESION` existe en el vocabulario y ningún módulo la declara. Engram id 6432.
- **L6** (dueño) — "A tu primer pregunta es no lo ve. y la creacion es correcta como decis. Pero
  tengo un problema puedo tener un tecnico o un colaborador que puede ver mantenimiento opero no
  modificar y puede ver y modificar soporte y edilicio, o que pueda borrar ticket de soporte pero
  no de mantenimiento. como hacemos con esos casos si los derchos son iguales para todos los tipos"
- **L7** (decisión) — Granularidad A (tipo × acción); B (tipos asignados + acciones del módulo) no
  cubre L6. Sin excepción por asignación. Tipo nuevo cerrado con "Copiar permisos de".
- **L8** (dueño) — "Pero no me dices como solucionas el tema que pueda modificar algunos tickets u
  otros solo los pueda ver, como y donde hacemos esa configuracion por usuario?"
- **L9** (dueño) — "si, asi me cierra. y que pasa con la configuracion de permisos que hoy tienen
  los usuarios?"
- **L10** (evidencia) — No existe endpoint de borrado de tickets: los únicos `@Delete` cercanos son
  `tareas-ticket.controller.ts:256` y `reparaciones.controller.ts:429` (desvincular compra, que
  usa `EDILICIA:BORRADO`).
- **L11** (decisión, tabla de migración) — `TICKETS:LECTURA` → Ver; `VER_TODOS` → Ver todos;
  `ALTAS` → Crear; `MODIFICACION` → Modificar; `TRANSICIONAR`, `ASIGNAR`, `COMENTAR`, `OBSERVAR`
  → Estado, Asignar, Comentar, Comentario interno. `EDILICIA:LECTURA` → Ver y Ver todos;
  `EDILICIA:ALTAS` → Crear; `EDILICIA:MODIFICACION` → Modificar, Estado y Comentar. Imprimir a
  quien tenga Ver. Borrar vacío. Cada tipo toma las celdas del módulo de su `modulo`.
- **L12** (dueño) — "si" (arrancar el documento de la feature).
- **L13** (evidencia T0) — `TenantGuard` liga el cliente Prisma del tenant en un AsyncLocalStorage
  (`tenant.guard.ts:65-72`, `tenant-context.ts:68`), con pool por base. `usuario_id` sin FK a
  master ya es convención (`tickets.solicitante_id`, `tareas_ticket.tecnico_id`). El backfill de
  S7 necesita leer master y escribir cada tenant: patrón `PrismaTenantEnumerator` +
  `tenantContext.run` (`purga-pendientes-vencidos.scheduler.ts:65-67`). Inventario de huecos de
  S0: sin módulo — detalle, timeline, PDF, `GET /api/v1/tickets/:id`; regla propia — adjuntos
  (`adjuntar-archivo.use-case.ts:104-117`); sin fila ni módulo — `PATCH /tickets/:id`, estado,
  asignar, asignables, asignar-en-proceso, comentarios, `/soporte/:id/solucion`,
  `GET /soporte/:ticketId`. La clave de API v1 actúa con `modulos: ['TICKETS']`
  (`api-clave.guard.ts:114-125`).
- **L14** (decisión) — El listado de reparaciones sin filtro de fila no es hueco en la etapa 0:
  S7 preserva "Edilicia lectura = ver todos" y la ruta ya exige `EDILICIA:*`, así que el módulo
  del tipo siempre coincide. Su scope real llega con tipo × acción (T5). El dashboard (agregados)
  también queda para T5.
- **L15** (evidencia T1-T2) — TDD: RED por la razón correcta en cada caso de uso (un ticket de un
  tipo de otro módulo devolvía el ticket, o 422 `AsignadoNoElegible` que revelaba su existencia);
  GREEN con 1712 tests unitarios, `tsc` y ESLint en cero. (Corregido en L17: los e2e sí corren con
  el Postgres local cuando está levantado.) `TransicionarEstadoUseCase` recibe `alcance` obligatorio
  y anulable; `null` solo lo pasa el flujo de sistema `ReanudarPorComentarioListener` (D3).
  Cambios de conducta: un TECNICO o COLABORADOR sin VER_TODOS (no solicitante, no responsable, sin
  tarea) ya no edita, transiciona, asigna ni comenta un ticket por id — 404; los presets de rol
  TECNICO y COLABORADOR traen VER_TODOS, así que afecta solo a configuraciones a medida.
  `GET /soporte/:id` de un ticket inexistente pasa de 200 `{equipo: null}` a 404. Adjuntos conserva
  su regla ADR-2 (solicitante, VER_TODOS o MODIFICACION) más el módulo: queda para revisar en T5.
- **L16** (decisión T3) — El gate de módulo en `/tickets` hacía que `/` (que redirigía siempre a
  `/tickets`) entrara en ciclo para un usuario sin el módulo TICKETS. El inicio pasa a elegir el
  primer área que el menú le muestra al usuario, con la Ayuda (`/kb`) como destino siempre válido.
- **L17** (verificación independiente de la etapa 0) — PASS en las 7 partes de S0 (lecturas,
  escrituras sin efectos al rechazar, D3, punto único, front, inventario, calidad de tests), con
  dos bloqueantes: dos e2e desactualizados por el cambio de conducta (`resolver-qr-autenticado`
  esperaba 200 `{equipo: null}`; `tickets.e2e` asignaba un ticket EQUIPOS con un técnico sin ese
  módulo). Corregidos en `9ace5477`: 188 archivos y 2305 tests de
  tickets, equipos, integraciones y ticket-pdf en verde, e2e incluidos. Advertencias para T5:
  `rechazar` de tareas distingue 403/404 solo por fila; editar valida catálogos antes del acceso.

- **L18** (judgment-day sobre la etapa 0, dueño: "si") — La revisión nativa RDD no entró en el
  presupuesto del revisor (`lens_context_budget_exceeded`, 53 archivos); por `proyectos/CLAUDE.md`
  §6.2 la reemplazó judgment-day. JUDGMENT: APPROVED, sin hallazgos críticos. Tres advertencias
  corregidas por decisión del dueño ("si"), con TDD y verificación independiente PASS:
  `75015d60` la clave de API v1 con solo `TICKETS:COMENTAR` vuelve a comentar en todo el módulo
  TICKETS (la regla de fila la había roto); `32c38b4a` adjuntos decide con `esTicketAccesiblePara`
  (antes: solicitante, VER_TODOS o MODIFICACION, sin fila); `9ba5749f` las rutas de tareas responden
  404 en un ticket de un módulo ajeno (antes 403, que confirmaba su existencia). Deuda anotada, sin
  corregir: asignar y asignar-en-proceso chequean el acceso antes del lock y no después; el 404 de
  `POST /operaciones/:id/adjuntos` sobre un ticket ajeno nombra el id del ticket.
- **L19** (suite completa del backend, con Postgres) — 749 archivos: 747 en verde y 2 rotos por la
  etapa 0, fuera de `src/` y por eso fuera del typecheck (`tsconfig` incluye solo `src/**`):
  `test/integraciones-webhooks-encolado.e2e.spec.ts` y `prisma_master/seeds/demo-seed.ts` (seed de
  demo, no del deploy) llamaban a los casos de uso sin el alcance nuevo. Corregidos pasando el
  alcance sin restricción del flujo de sistema (D3); los dos pasan. Lección: un cambio de contrato
  de un caso de uso se busca también en `test/`, `prisma_master/` y `scripts/`, no solo en `src/`.
- **L20** (dueño, "si") — Entrega A: T4 a T8 salen en un solo deploy, para que la grilla vieja y
  la nueva cambien juntas y no haya una ventana con un control que no tiene efecto. Sin
  sincronización entre master y tenant durante la transición.
- **L21** (decisiones por defecto aceptadas con el "si") — `EDILICIA:BORRADO` (desvincular compra)
  sigue siendo permiso del módulo, no entra a la tabla por tipo. Los tipos con módulo COMPRAS o
  EQUIPOS, si existen, se migran con la regla de TICKETS. Las membresías desactivadas también se
  migran.
- **L22** (evidencia, exploración T4) — Plantilla de tabla: `ReglaAsignacion`
  (`prisma_tenant/schema.prisma:1568-1577`, migración `20261009120000_reglas_asignacion` con
  `rollback.sql`). CHECK derivado de `as const` con test contra `pg_get_constraintdef`:
  `tickets-sla-regla.integration.spec.ts:145-160`. Backfill con dry-run/`--apply` e idempotente:
  `scripts/backfill-tiempos-habiles.mjs` (lee `dist/` con `createRequire`); paso en deploy: 8b de
  `deploy.ps1` (`backfill-correo-clientes.mjs`), ASCII sin BOM. Escritores de la matriz master:
  `setPermisos` (`prisma-matriz-permisos.repository.ts:36-53`), llamado por asignar permisos,
  aplicar plantilla, crear usuario y cambiar rol; también `importacion-legacy/master.ts:194-207` y
  el seed de demo. Lector extra a migrar en T5: `usuario-master.checker.ts:132,167` (elegibilidad
  del asignado). La tabla vieja `usuario_tipos_ticket` se borró en `20260810120000`.
- **L23** (corrección de L21, T4a) — Un tipo de COMPRAS o EQUIPOS toma las celdas de TICKETS solo
  si el usuario tiene alguna celda de ese módulo: desde la etapa 0, sin ella el ticket no se ve, y
  la migración no puede dar acceso que hoy no existe (S7). Lo detectó el worker de T4a; tests
  RED→GREEN en `permisos-tipo-ticket.spec.ts`. Migración: `20261021120000_permisos_tipo_ticket`.
- **L24** (T4b) — `scripts/backfill-permisos-tipo-ticket.mjs` reusa la traducción compilada de
  `dist/` (D4). Incluye los tipos dados de baja: sus tickets siguen visibles hoy y un tipo
  reactivado volvería cerrado (S7). Guard por tenant: con filas ya cargadas, `--apply` lo omite
  salvo `--force`; el `INSERT` repite el chequeo con `NOT EXISTS`. Paso 8c de `deploy.ps1`.
  Deuda: un tenant que quede con la tabla vacía se volvería a llenar en el deploy siguiente; el
  paso 8c se retira apenas se verifique el primer deploy (runbook). 7 tests de integración; dos
  mutaciones del script los ponen en rojo.
- **L25** (T4c) — Los tres caminos (alta de usuario, aplicar plantilla, cambio de rol con
  reaplicar) pasan por `AplicarPresetPermisosUseCase`, que ahora escribe también las filas por tipo
  con la misma plantilla. El tenant se resuelve por `clienteId` en un adaptador de infraestructura
  con su propio `tenantContext.run` (el seed de demo llama sin contexto). Orden: master primero,
  tenant después; si el tenant falla, error explícito (`PermisosPorTipoNoAplicadosError`, 500 que
  pide reaplicar la plantilla). Con `sobrescribir: false` el tenant solo se escribe si master
  sembró la plantilla y el usuario no tenía filas: nunca da por tipo un acceso que la matriz no
  tiene. El importador legacy también siembra filas. 2537 tests en verde, e2e incluidos.
- **L26** (T5a) — `AlcanceActorTicket` pasa a `{ actorId, permisosPorTipo }` (`null` para ROOT y
  ADMINISTRADOR), cargado por request por `CargadorAlcanceTicket` (`tickets/interface/alcance-ticket.ts`).
  Ver: `LECTURA` sobre el tipo y (`VER_TODOS` sobre el tipo o regla de fila). 404 si no ve; 403
  `AccionSobreTipoNoPermitidaError` si ve y le falta la acción. Acciones por operación según
  D5 (c); el timeline muestra internas con `OBSERVAR` sobre el tipo y el PDF pide solo públicas.
  La API v1 recibe acciones fijas sobre los tipos de TICKETS, equivalentes a lo que la clave podía
  hacer (T5c lo revisa). 3959 tests en verde, e2e incluidos (S2 con filas reales). Cambios de
  conducta: los flags del JWT ya no deciden estas operaciones; un usuario sin filas no ve nada por
  id hasta que corra el backfill de T4b (por eso T4-T8 salen en un solo deploy, L20).
- **L27** (T5b; el primer worker cortó por límite de sesión y el segundo retomó su trabajo parcial) —
  Se quitaron los `@RequiereAcciones('TICKETS:*'|'EDILICIA:*')` de las rutas de tickets, adjuntos,
  soporte, PDF y reparaciones; quedan `COMPRAS:LECTURA` (vincular compra), `EDILICIA:BORRADO`
  (desvincular, L21), `DASHBOARD:LECTURA`, `EQUIPOS:*`, `PREVENTIVO:*` y los de la API v1 (T5c).
  Listados, exportación, reparaciones, tareas, dashboard y CSAT filtran en SQL con el mismo alcance
  (`alcance-listado.prisma.ts`: tipos con VER_TODOS, o tipos con LECTURA más regla de fila). Alta:
  `ALTAS` sobre el tipo, 403 antes de abrir la transacción; `alcance: null` para flujos de sistema
  (barrido preventivo, API v1, seed). El dashboard combina el alcance con el filtro de TECNICO.
  Dueño aprobó tocar CSAT y `autorizacion.e2e.spec.ts`. 346 archivos y 4114 tests en verde.
- **L28** (T5c; dueño aprobó extender a reglas de asignación) — API v1: el alcance de la clave sale
  de sus celdas traducidas con `accionesDeTipoDesdeCeldas` sobre los tipos de TICKETS
  (`integraciones/domain/alcance-clave-api.ts`); COMENTAR suma LECTURA y VER_TODOS (L18). Los
  decoradores `TICKETS:*` de la v1 quedan: las celdas de la clave son un modelo propio. Elegibilidad
  del asignado: servicio único `ElegibilidadAsignado` (ADMIN/ROOT, o TECNICO/COLABORADOR con LECTURA
  sobre el tipo); el checker de master solo da identidad, rol y membresía. Lo usan asignar,
  asignables, tareas, asignación automática y reglas de asignación, que suman `candidatosPorTipo`
  (`candidatosPorModulo` = unión, hasta T6). Suite completa del backend: 760 archivos, 9326 tests en
  verde, typecheck y lint en cero. Deuda: índice por `tipo_id` en `permisos_tipo_ticket`.
- **L29** (verificación independiente de T5c) — PASS sin bloqueantes: 328 tests unitarios, tres
  mutaciones detectadas, la clave de API v1 no concede acciones fuera de `PERMISOS_API` (tests
  agregados en el commit anterior a este).
- **L30** (T6; dueño aprobó sumar `tipoId` a `GET /reparaciones` y abrir `GET /usuarios` por tipo) —
  `GET /tickets/permisos-por-tipo` devuelve `{ sinRestriccion, porTipo, porModulo }`. El servidor
  de Next lee esos permisos con la cookie (`permisosPorTipoDelServidor`) y `tiposLayoutGate`
  protege `/tickets` y `/edilicia`: redirige solo si sabe que no hay LECTURA en ningún tipo del
  módulo; sin datos deja pasar. El inicio usa la misma regla (sin ciclos). Cada botón del detalle,
  del listado, de reparaciones (por el tipo de la fila) y de equipos usa la acción sobre el tipo.
  Reglas de asignación usan `candidatosPorTipo`. `GET /usuarios` abre con ASIGNAR o VER_TODOS en
  algún tipo (RED 5/5 → GREEN). Front: lint 0, tsc 0, 279 archivos y 2415 tests; 31 tests que
  fijaban celdas JWT reescritos con dos tipos. Back: tsc 0, 1251 + 1424 tests. Deuda: el alta de
  reparación asume EDILICIA mientras carga el catálogo (403 si no tiene ALTAS ahí).
  Ayuda (suspendida): menú, botones y filtros dependen ahora de los permisos por tipo.
- **L31** (T7; el primer worker cortó por límite de sesión y el segundo retomó su trabajo) —
  `GET/PUT usuarios/:id/permisos-por-tipo` y `POST .../copiar-de/:origenId`, solo administrador.
  El PUT rechaza con 422 una acción sin Ver (S3), una acción desconocida, BORRADO o un tipo
  inexistente; ROOT y ADMINISTRADOR devuelven `sinRestriccion` sin filas. La plantilla del rol por
  fila la calcula el backend con `accionesDeTipoDesdeCeldas` (D4). Borrar no se ofrece: no existe
  la operación (S8). La grilla de módulos deja de mostrar `TICKETS:*` y Edilicia Ver, Crear y
  Modificar; `PATCH usuarios/:id/permisos` conserva esas celdas viejas e ignora las que llegan
  (sin 422, para no romper a quien reenvía lo que leyó; se retiran en T9). El usuario ve el cambio
  en su próximo request sin refrescar el token (e2e). Back: 2639 tests; front: lint 0, tsc 0,
  2428 tests. Ayuda (suspendida): pestaña "Tipos de ticket" en Permisos.
- **L32** (T8) — `POST /catalogos/tipos-ticket` acepta `copiarPermisosDeTipoId`; sin él el tipo
  nace cerrado. Con él, alta y copia van en la misma transacción (`INSERT ... SELECT`). El tipo
  origen tiene que existir y ser del mismo módulo (422 si no). Formulario: "Copiar permisos de",
  con "Ninguno (cerrado)" por defecto, filtrado por módulo, solo en el alta. Back: 1405 tests;
  front: 2434. Ayuda (suspendida): campo "Copiar permisos de" en el alta de tipo.

- **L33** (verificación independiente de la etapa 1) — PASS en S1-S6, orden del deploy y ps1 ASCII.
  Bloqueante B1 (S7): `GET /usuarios` abría con VER_TODOS en cualquier tipo y la plantilla USUARIO
  recibe VER_TODOS en los tipos de Edilicia por L11: todo USUARIO pasaba a ver la lista de
  usuarios. Corregido con TDD (RED: e2e "plantilla USUARIO → 403" daba 200): abre con ASIGNAR en
  algún tipo o VER_TODOS en un tipo que toma celdas de TICKETS (TICKETS, COMPRAS, EQUIPOS), igual
  que `TICKETS:ASIGNAR`/`TICKETS:VER_TODOS` antes. Front espejado. Pendiente decisión del dueño:
  matrices a mano con celdas de Edilicia sin `EDILICIA:LECTURA` pierden acceso el día del deploy.
