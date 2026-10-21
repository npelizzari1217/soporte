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
- [ ] T4b — S7, L21 — worker — script de backfill idempotente (dry-run / `--apply`) y paso en
  `deploy.ps1` — (pendiente)
- [ ] T4c — S7 — worker — plantillas de rol por tipo: alta de usuario, cambio de rol y aplicar
  plantilla escriben las filas por tipo — (pendiente)
- [ ] T5 — S1, S2, S3, S6 — writer — etapa 1: punto único y listados leen tipo × acción — (pendiente)
- [ ] T6 — S6 — writer — etapa 1, front: botones, alta y filtros según acciones por tipo — (pendiente)
- [ ] T7 — S5 — writer — etapa 2: grilla por tipo en Permisos, plantilla por fila, copiar de
  usuario — (pendiente)
- [ ] T8 — S4 — writer — etapa 2: tipo nuevo cerrado y "Copiar permisos de" en el alta de tipo — (pendiente)
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

