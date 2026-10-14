# Tareas con técnico y crédito por tarea (punto 12 de la segunda etapa)

## Objetivo
Que un ticket pueda repartirse en tareas, cada una con su técnico, y que el crédito de cada tarea sea de quien la completó, en cualquier tipo de ticket.

## Problema
- Hoy un ticket tiene un solo `asignadoId`, y todos los indicadores de técnicos se calculan sobre él: la carga del dashboard, el CSAT, la exportación y los mails de SLA. Por eso, si un técnico hizo el 60 % del trabajo y otro el 40 %, el crédito entero se lo lleva el último.
- Solo Edilicia tiene subtareas (`SubtareaEdilicia`, colgada del satélite `TicketEdilicia`), y no llevan técnico.
- Las subtareas guardan quién las completó (`completadaPorId`), pero nada lo lee.
- `TicketEdilicia.personalAsignadoId` existe y nunca se usó.

## Por qué
Es el punto 12 del roadmap. Lo anticipó la decisión del punto 9: un problema con varios oficios o varios pasos necesita un técnico por tarea.

## Decisión de producto citada
`docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta **"Segunda etapa, punto 12 — tareas con técnico y crédito por tarea"**, decidida el 2026-10-13 (commit `8fe88835`). Cada viñeta es un criterio de aceptación más abajo.

**Desviaciones declaradas de antemano:** ninguna.

## Alcance
- **Backend:**
  - Tabla genérica de tareas en el inquilino, con la migración de los datos de `subtareas_edilicia`.
  - Casos de uso y endpoints para crear, asignar técnico, completar, descompletar y borrar.
  - Entradas en el historial.
  - El avance generalizado.
  - La métrica nueva del dashboard.
  - El PDF.
  - El retiro de la tabla vieja y de `personal_asignado_id`.
- **Frontend:**
  - Sección "Tareas" en el detalle del ticket, con el avance.
  - El diálogo de Edilicia pasa a usar las tareas genéricas.
  - El indicador nuevo en el dashboard.
- **Docs:**
  - Runbook, por la migración con datos.
  - Corrección de los artículos de Ayuda que el cambio vuelve falsos.
  - Deuda de Ayuda por lo nuevo.
  - Declaración en el roadmap.

## Fuera de alcance
Lo declara la decisión:
- mail o webhook al asignar o completar una tarea;
- asignar tareas con la regla del punto 9;
- reordenar tareas y editar su texto.

Tampoco se cambian:
- las métricas por ticket (carga, SLA, CSAT, exportación);
- la máquina de estados (no hay bloqueo por tareas pendientes).

## Restricciones
- Arquitectura hexagonal: solo `infrastructure/` importa `@prisma/client`. Los errores de dominio van en `Result`.
- Aislamiento entre inquilinos: las tareas viven en la base del inquilino, y un usuario de otro cliente nunca las ve ni las toca.
- La migración de datos no pierde ninguna subtarea existente: se conservan descripción, estado, `completadaPorId`, `completadaEn`, orden y bajas lógicas. Lleva `rollback.sql`.
- **Nada se sube a GitHub hasta nuevo aviso del dueño.** Commits y ramas quedan solo en local.
- Las features no exigen TDD (`~/proyectos/CLAUDE.md` §6.1), pero cada unidad lleva sus tests. Los bugfixes sí van con TDD.
- Ayuda en pausa: no se escriben artículos nuevos, pero **se corrige en la misma unidad todo artículo que el cambio vuelva falso**. Hoy aplica a `backend/ayuda/reparaciones-edilicias.md` (líneas 13-45) y `reparaciones-listado.md` (líneas 15-18).
- Comandos:
  - backend: `pnpm lint`, `pnpm typecheck`, `pnpm test`;
  - frontend: `pnpm lint`, `pnpm type-check`, `pnpm test`;
  - raíz: `node scripts/check-casts-en-specs.mjs`.
- Todo spec que trunque `soporte_master_test` llama a `usarLockMasterTest()`.

## Criterios de aceptación
Salen de la decisión de producto, viñeta por viñeta.
- **CA1 — Tareas en cualquier ticket:** cualquier tipo de ticket puede tener tareas, incluidos *Mantenimiento* y *Preventivo*. Las subtareas de Edilicia existentes aparecen como tareas de su ticket, con descripción, estado, quién y cuándo las completó, y la tabla vieja ya no existe.
- **CA2 — El ticket conserva su responsable:** el `asignadoId` del ticket no cambia de significado, y cada tarea tiene un técnico opcional.
- **CA3 — Quién gestiona:** solo el responsable del ticket, el ADMINISTRADOR o ROOT crean, asignan y borran tareas, con el permiso de modificación del módulo del tipo. El técnico de una tarea tiene que ser elegible según la regla del punto 9 (TÉCNICO o COLABORADOR con el módulo del tipo); si no lo es, se rechaza.
- **CA4 — Completar y descompletar:** completan su técnico, el responsable o un administrador, y queda registrado quién y cuándo. Descompletar se permite a las mismas personas y limpia ese registro. No se puede reordenar ni editar el texto.
- **CA5 — El cierre no se bloquea:** un ticket con tareas pendientes se puede resolver y cerrar igual que hoy.
- **CA6 — Métrica nueva:** el dashboard muestra "tareas completadas por técnico" en el período, atribuidas a quien las completó. Las métricas por ticket no cambian.
- **CA7 — Avance:** cualquier ticket con tareas muestra el porcentaje de tareas activas completadas.
- **CA8 — Historial y PDF:** asignar y completar (y descompletar) una tarea queda en el historial del ticket, con su autor. El PDF del ticket imprime cada tarea con su técnico.
- **CA9 — Retiro:** `TicketEdilicia.personalAsignadoId` ya no existe.
- **CA10 — El técnico de una tarea ve el ticket** (precisión aprobada por el dueño el 2026-10-13): un técnico con una tarea activa en un ticket lo ve en el detalle y en su listado de tickets, y puede listar sus tareas, aunque no sea el responsable ni tenga `TICKETS:VER_TODOS`. Al quitarlo de la tarea, o al borrarla, deja de verlo, salvo que lo vea por otro motivo.
- **Transversal:** todo queda aislado entre inquilinos, y ningún artículo de Ayuda describe un comportamiento que ya no existe.

## Estrategia de entrega
- **Pronóstico:** unas 3.500 líneas en 9 tareas. Por lo visto en webhooks, los tests pueden duplicarlo.
- **Estrategia:** `ask-on-risk` con cadena `feature-branch-chain`, la que el dueño eligió para las features anteriores.
  - El tracker es `feat/tareas-con-tecnico`, y cada tarea va en `feat/tareas-con-tecnico-tN`, apilada sobre la anterior.
  - Todo queda local mientras dure la pausa de GitHub.
- **Despliegue:** la migración de datos (T1) y el retiro de la tabla vieja (T8) van en migraciones separadas, y el retiro se despliega solo cuando ningún código lee la tabla vieja.

## Tareas
- [x] **T1 — Modelo y migración de datos** (~400): tabla `tareas_ticket` en el inquilino, colgada de `tickets`. Columnas: descripción, orden, técnico opcional, completada, completadaEn, completadaPorId, timestamps y baja lógica. La migración copia `subtareas_edilicia` a la tabla nueva vía `ticket_edilicia.ticket_id`, conservando ids y datos, y lleva `rollback.sql`. Incluye la entidad, el puerto, el repositorio y los tests de integración, con uno que compruebe que la copia es completa. La tabla vieja **todavía no se borra**. Ruta: delegada (trigger de writer). Salió en 1205 líneas, commit `1d10a92e`.
- [x] **T2 — Casos de uso** (~400): crear, asignar o quitar técnico (elegibilidad del punto 9), completar, descompletar y borrar, con las reglas de quién puede (CA3, CA4) y el permiso de modificación del módulo del tipo. Cada acción escribe su entrada en el historial (`OperacionTicket`). El cálculo de avance se generaliza a cualquier ticket. Ruta: delegada. Salió en 1644 líneas, commit `16dbd796`.
- [x] **T3 — Endpoints y Edilicia sobre la tabla nueva** (~350): endpoints genéricos bajo el ticket. Los endpoints y el listado de reparaciones pasan a leer y escribir la tabla nueva, sin cambiar lo que ve el usuario de Edilicia. Incluye un e2e de permisos y de aislamiento. Ruta: delegada. Salió en 2465 líneas, commit `36e8a572`.
- [x] **T3b — Visibilidad por tarea** (~300; agregada el 2026-10-13 por la precisión del dueño): la regla de visibilidad del ticket (`visibilidad-ticket.ts`) y el filtro del listado de tickets suman "tiene una tarea activa asignada" (CA10). Lleva un e2e que prueba que el técnico ve el ticket y sus tareas, que lo deja de ver al quitarlo de la tarea, y el aislamiento entre clientes. Se corre después de la T4. Ruta: delegada. Salió en 578 líneas, commit `7255db23`.
- [x] **T4 — Métrica del dashboard** (~250): "tareas completadas por técnico" en el período, por `completadaPorId`, respetando los filtros y el alcance del TECNICO. Ruta: delegada. Salió en 551 líneas, commit `65e304eb`.
- [x] **T5 — PDF** (~150): el PDF lee la tabla nueva e imprime cada tarea con su técnico y su estado. Ruta: delegada. Salió en 340 líneas, commit `0c642473`.
- [ ] **T6 — Frontend: tareas en el ticket** (~400): sección "Tareas" en el detalle del ticket, con avance, alta, asignación con selector de técnicos elegibles, completar, descompletar y borrar. El diálogo de Edilicia pasa a usar lo mismo. Se corrigen `backend/ayuda/reparaciones-edilicias.md` y `reparaciones-listado.md` en la misma unidad. Ruta: delegada.
- [ ] **T7 — Frontend: indicador del dashboard** (~200): muestra la métrica de T4. Ruta: delegada.
- [ ] **T8 — Retiro** (~200): migración que borra `subtareas_edilicia` y `ticket_edilicia.personal_asignado_id`, con `rollback.sql`. También se borra el código viejo que ya no se usa. Ruta: delegada.
- [ ] **T9 — Docs y cierre** (~150):
  - runbook, con la migración con datos y el orden de despliegue de T1 y T8;
  - deuda de Ayuda;
  - declaración Cumplida o Desviación en el roadmap;
  - suites completas;
  - `judgment-day`, porque el cambio toca datos existentes y permisos.

  Ruta: delegada para la verificación.

## Verificación
- **Por tarea:** lint, typecheck y los tests del módulo.
- **Al cierre:** suites completas de backend y frontend, ratchet de casts, `check-roadmap-fresco` y `judgment-day`.
- RDD está apagado.

## Progreso
- 2026-10-13: el dueño aprobó la decisión de producto; quedó en el roadmap en `8fe88835`. Se creó este documento. Próximo paso: T1.
- 2026-10-13: T1 cerrada en `1d10a92e` (rama `feat/tareas-con-tecnico-t1`). Salió en 1205 líneas: unas 520 de código y migración y 680 de tests. Supera el presupuesto de ~400 por los tests de la copia y del repositorio. Ruta: delegada.
  - **Ubicación:** en `tickets/`, no en un módulo `tareas/` nuevo. La tarea es hija del ticket, como las operaciones y los adjuntos, y T2 reusa el repositorio de tickets, el de operaciones y la elegibilidad que ya están en `TicketsModule`. `TAREA_TICKET_REPOSITORY` queda exportado, para el listado de reparaciones, el dashboard y el PDF.
  - **onDelete:** `ticket_id` con `RESTRICT`, el mismo criterio que `operaciones_ticket` y `encuestas_satisfaccion`. Los tickets se borran de forma lógica; un borrado físico no puede llevarse puesto el registro de quién hizo cada tarea.
  - **Índices:** (`ticket_id`, `deleted_at`, `orden`) para el listado, y (`completada_en`, `completada_por_id`) para la métrica de T4. El rango de fechas es el predicado común a todos los alcances, y el técnico va segundo para agrupar o filtrar sin ir a la tabla.
  - **CHECK:** `tareas_ticket_completada_check`. Antes de agregarlo se verificó que los datos de `subtareas_edilicia` lo cumplen en las tres bases de inquilino locales: Demo Soporte, Rotair y `soporte_tenant_test`, con 0 violaciones. **Producción no se verificó**: si una fila lo viola, la migración falla entera y no aplica nada. El runbook de T9 tiene que incluir esa consulta antes del deploy.
  - **Entidad:** `completar` falla si la tarea ya estaba completada, para no pisar el crédito. `descompletar` falla si estaba pendiente. Una tarea dada de baja ya no cambia. Todo eso vuelve en un `Result`.
  - **Copia por inquilino** (con `pnpm migrate:tenants`): Demo Soporte, 2 viejas y 2 nuevas; Rotair, 0 y 0. La diferencia en SQL dio vacía.
  - **Verificación:**
    - `pnpm lint`: 0 errores.
    - `pnpm typecheck`: 0 errores.
    - `pnpm vitest run` con los 3 specs nuevos y `src/reparaciones`: 23 archivos y 197 tests en verde.
    - `check-casts-en-specs`: 617, igual que la base.
  - Próximo paso: T2.
- 2026-10-13: T2 cerrada en `16dbd796` (rama `feat/tareas-con-tecnico-t2`, apilada sobre T1). Salió en 1644 líneas: unas 770 de código y migración y 876 de tests. Supera el presupuesto de ~400 por la matriz de actores de los tests. Ruta: delegada.
  - **Casos de uso** (`backend/src/tickets/application/use-cases/`): `CrearTareaTicket`, `AsignarTecnicoTarea`, `CompletarTarea`, `DescompletarTarea`, `EliminarTarea` y `ListarTareasTicket`. Las reglas compartidas están en `application/services/tareas-ticket.reglas.ts`. Todavía no están registrados en `TicketsModule`: se cablean en T3 junto con el controller.
  - **Permiso por módulo:** el código es `<MODULO>:MODIFICACION`, y los cuatro módulos de un tipo de ticket (TICKETS, COMPRAS, EDILICIA, EQUIPOS) lo declaran en `CATALOGO_MODULOS` (`shared/domain/acciones.ts`). Se chequea **en el caso de uso**, no en `AccionesGuard`, porque el módulo sale del tipo del ticket y `@RequiereAcciones` es metadata fija por ruta. El controller de T3 arma `ActorTarea`: `modulosConModificacion` con `puedeEjecutar(user, '<M>:MODIFICACION')` para cada módulo de `MODULOS`, `esAdministrador` con ROOT o ADMINISTRADOR, y `tienePermisoVerTodos`.
  - **Quién puede:** crear, asignar y borrar lo hacen el responsable, ADMINISTRADOR o ROOT, y además con el permiso del módulo. Completar y descompletar lo hacen el técnico de la tarea, el responsable, ADMINISTRADOR o ROOT, sin permiso de módulo. Listar lo puede quien ve el ticket (`esTicketVisiblePara`, extraída de `ObtenerTicketUseCase` y reusada ahí). Un actor sin permiso que no ve el ticket recibe `TICKET_NO_ENCONTRADO`, no un 403.
  - **Elegibilidad:** `evaluarResponsableRegla` (`application/services/elegibilidad-responsable-regla.ts`), que usa `listarTecnicosAsignables` de `usuario-master.checker.ts`. Es la misma regla del punto 9 y no se duplicó. ADMINISTRADOR y ROOT no son técnicos elegibles. Quitar el técnico no consulta master. Reasignar el mismo técnico no escribe historial.
  - **Historial:** son filas del catálogo `tipo_operacion`, no un enum. Se agregaron `TAREA_CREADA`, `TAREA_ASIGNADA`, `TAREA_COMPLETADA`, `TAREA_DESCOMPLETADA` y `TAREA_ELIMINADA`; alta y baja también escriben historial, como hacían las subtareas con `AVANCE_EDILICIO`. Hizo falta la migración `20261013150000_tipos_operacion_tareas` (INSERT idempotente), con un `rollback.sql` re-ejecutable que borra primero esas operaciones. Cada entrada lleva como autor al actor, la descripción de la tarea como texto y `metadata.tarea_id`; la asignación suma el técnico anterior y el nuevo, y el descompletado, quién la había completado. Los lectores existentes no se rompen: el PDF filtra `COMENTARIO` y `CAMBIO_ESTADO`, y el reloj de SLA filtra `CAMBIO_ESTADO`.
  - **Timeline para T6:** `frontend/src/features/tickets/components/ticket-timeline.tsx` (`TIPO_OPERACION_CONFIG`). Hoy muestra los tipos nuevos como "Operación", con el ícono genérico, más la descripción. T6 les agrega su etiqueta.
  - **Errores** (`domain/errors/tareas.errors.ts`), para que T3 los mapee:
    - `TAREA_NO_ENCONTRADA` → 404: la tarea no existe, está dada de baja o es de otro ticket.
    - `TAREA_YA_COMPLETADA` y `TAREA_NO_COMPLETADA` → 409.
    - `TAREA_ACCION_NO_PERMITIDA` → 403.
    - `TECNICO_TAREA_NO_ELEGIBLE` → 422.
    - `TICKET_NO_ENCONTRADO` → 404.
  - **Avance:** la fórmula se generalizó en `tickets/domain/services/avance-tareas.ts` (`calcularAvanceTareas`, que devuelve total, completadas y porcentaje). `AvanceCalculator` de reparaciones delega en ella sin cambiar a sus llamadores.
  - **Seeder pendiente:** `clientes/infrastructure/tenant-seeder.adapter.ts` no lista los tipos nuevos, porque está fuera del alcance de T2. No hace falta para que funcione, porque el alta de un cliente corre `migrate deploy`, pero su comentario quedó desactualizado.
  - **Verificación:**
    - `pnpm lint`: 0 errores.
    - `pnpm typecheck`: 0 errores.
    - `pnpm vitest run src/tickets src/reparaciones`: 102 archivos y 1030 tests en verde, incluida la integración de atomicidad.
    - `check-casts-en-specs`: 617 en 114, igual que la base.
  - Próximo paso: T3.
- 2026-10-13: T3 cerrada en `36e8a572` (rama `feat/tareas-con-tecnico-t3`, apilada sobre T2). Salió en 2465 líneas: unas 1020 de código y 1446 de tests. Supera el presupuesto de ~400 por los dos e2e (matriz de permisos con dos inquilinos, y las rutas viejas). Ruta: delegada.
  - **Rutas** (`tickets/interface/controllers/tareas-ticket.controller.ts`; T6 depende de ellas):
    - `GET /tickets/:id/tareas` → `{ items: TareaTicketResponseDto[], avance: { total, completadas, porcentaje } }`, con las tareas activas por `orden`.
    - `POST /tickets/:id/tareas`, body `{ descripcion }` (al menos un carácter visible, hasta 255) → 201 y la tarea.
    - `PATCH /tickets/:id/tareas/:tareaId/tecnico`, body `{ tecnicoId: uuid | null }` (el campo es obligatorio; `null` quita) → 200 y la tarea.
    - `POST /tickets/:id/tareas/:tareaId/completar` y `.../descompletar` → 200 y la tarea.
    - `DELETE /tickets/:id/tareas/:tareaId` → 204.
    - `GET /tickets/:id/tareas/tecnicos-elegibles` → `[{ id, nombre, apellido }]`.
  - **`TareaTicketResponseDto`** (`tickets/interface/dtos/tarea-ticket.dto.ts`): `id`, `ticketId`, `descripcion`, `orden`, `tecnicoId`, `tecnicoNombre`, `tecnicoApellido`, `completada`, `completadaEn` (ISO o `null`), `completadaPorId`, `completadaPorNombre`, `completadaPorApellido` y `createdAt`. Los nombres siguen el patrón de `asignadoNombre` y `asignadoApellido` del detalle, y se resuelven en un solo batch contra master; valen `null` si no hay usuario o no se pudo resolver.
  - **Errores:** el cuerpo es el de Nest (`{ statusCode, message, error }`), sin `code`, igual que `TicketsController`. 404 para `TAREA_NO_ENCONTRADA` y `TICKET_NO_ENCONTRADO`, 409 para `TAREA_YA_COMPLETADA` y `TAREA_NO_COMPLETADA`, 403 para `TAREA_ACCION_NO_PERMITIDA`, 422 para `TECNICO_TAREA_NO_ELEGIBLE` y 400 para un body inválido (`toHttpExceptionTareas`).
  - **Permisos por ruta:** ninguna ruta declara `@RequiereAcciones`. Quién puede depende del ticket y del módulo de su tipo, y lo decide el caso de uso. Un permiso fijo, como `TICKETS:LECTURA`, dejaría afuera al técnico de Edilicia que la decisión deja completar. `actorTareaDesdeJwt` (`tickets/interface/actor-tarea.ts`) arma el `ActorTarea` como lo documenta T2.
  - **Técnicos elegibles:** `GET /tickets/:id/tareas/tecnicos-elegibles` (`ListarTecnicosElegiblesTareaUseCase`). No se reusó `reglas-asignacion`, porque solo expone `GET /reglas-asignacion` para ADMINISTRADOR y ROOT. Tampoco se reusó `GET /tickets/:id/asignables`, porque exige `TICKETS:ASIGNAR` y dejaría sin selector al responsable de un ticket de Edilicia que no lo tenga. El endpoint nuevo pasa por `autorizarGestion` y devuelve el mismo universo que valida la asignación: `listarTecnicosAsignables` con el módulo del tipo.
  - **Rutas viejas de reparaciones** (`subtareas-sobre-tareas.use-cases.ts`, marcadas para T8 en el controller):
    - `POST /reparaciones/:reparacionId/subtareas` resuelve el `ticket_id` de la reparación y delega en `CrearTareaTicketUseCase`. El `orden` del body se ignora.
    - `POST /reparaciones/subtareas/:id/completar` y `DELETE /reparaciones/subtareas/:id` buscan la tarea por id (los ids son los de la migración) y su satélite, y delegan en `CompletarTareaUseCase` y `EliminarTareaUseCase`. Una tarea de un ticket que no es una reparación da 404.
    - La respuesta conserva el shape de `SubtareaEdiliciaResponseDto`, con `ticketEdiliciaId`.
    - Se quitaron los `@RequiereAcciones` (`EDILICIA:ALTAS`, `MODIFICACION`, `BORRADO`), porque contradicen CA3 y CA4: `ALTAS` y `BORRADO` agregaban un requisito que la decisión no pide, y `MODIFICACION` le impedía completar al técnico de la tarea. Ahora aplican la regla del punto 12: crean y borran el responsable, ADMINISTRADOR o ROOT con `EDILICIA:MODIFICACION`; completan el técnico, el responsable o un administrador. Completar dos veces da 409.
    - Los casos de uso viejos (`crear-`, `completar-` y `eliminar-subtarea`) ya no se registran en el módulo, y sus archivos quedan para T8. `SUBTAREA_EDILICIA_REPOSITORY` sigue registrado y exportado, porque el PDF lo lee.
  - **Avance de Edilicia:** `porcentaje_avance` es una columna guardada, que solo actualizaban los casos de uso viejos. Se decidió calcularlo al leer, en `ListarReparacionesUseCase`, con `calcularAvanceTareas` sobre `tareas_ticket`, y la exportación usa ese valor. Mantener la columna obligaba a que los casos de uso de tickets conocieran el satélite de Edilicia, una dependencia de `tickets/` hacia `reparaciones/`. Además, CA7 ya define el avance como un cálculo sobre las tareas de cualquier ticket. El e2e comprueba que una tarea completada por el endpoint nuevo mueve el porcentaje del listado. La columna queda sin uso: **T8 puede retirarla** con su migración, si el dueño lo aprueba.
  - **Lo que todavía lee lo viejo**, fuera del alcance de T3:
    - `ticket-pdf` lee `subtareas_edilicia` y `ticket_edilicia.porcentaje_avance`. Lo resuelve T5. Hasta entonces, el PDF de una reparación no muestra las tareas nuevas y su avance queda congelado.
    - **Ayuda que miente:** la tabla "Quién puede hacer cada cosa" de `backend/ayuda/reparaciones-edilicias.md` (líneas 120-127) atribuye agregar, completar y eliminar subtareas a `EDILICIA:ALTAS`, `MODIFICACION` y `BORRADO`. Quedó anotado en el commit; está fuera de las superficies de T3.
    - El diálogo de Edilicia (`frontend/src/features/edilicia/components/subtareas-dialog.tsx`) muestra los botones según esos permisos viejos. Un usuario puede ver un botón que ahora le da 403, o no ver uno que ahora puede usar. Lo corrige T6.
  - **Tests:**
    - `tareas-ticket.e2e.spec.ts` (nuevo, dos inquilinos efímeros) cubre el CRUD con el avance y el historial (seis operaciones con su autor), la matriz de permisos y el aislamiento entre clientes. La matriz incluye al responsable, al ADMINISTRADOR, al técnico de la tarea, a otro técnico, al responsable sin `TICKETS:MODIFICACION` y a un USUARIO o ADMINISTRADOR como técnico (422).
    - `reparaciones.e2e.spec.ts` suma las rutas viejas: escriben en `tareas_ticket` y no en `subtareas_edilicia`, devuelven el mismo shape y el avance del listado sube a 50 y a 100 %. También prueba los permisos nuevos contra los viejos.
    - Specs unitarios nuevos: el adaptador de subtareas, `actorTareaDesdeJwt`, `toHttpExceptionTareas` y la lista de elegibles.
  - **Verificación:**
    - `pnpm lint`: 0 errores.
    - `pnpm typecheck`: 0 errores.
    - `pnpm vitest run src/tickets src/reparaciones src/reglas-asignacion`: 108 archivos y 1096 tests en verde, incluidos los dos e2e.
    - `check-casts-en-specs`: 617 en 114, igual que la base.
  - Próximo paso: T4.
- 2026-10-13: T4 cerrada en `65e304eb` (rama `feat/tareas-con-tecnico-t4`, apilada sobre T3). Salió en 551 líneas: unas 115 de código y 437 de tests. Supera el presupuesto de ~250 por la integración sobre un inquilino efímero. Ruta: delegada.
  - **Respuesta** (T7 depende de ella): `GET /dashboard/metricas` suma el campo `tareasCompletadasPorTecnico: { usuarioId: string, nombre: string | null, apellido: string | null, completadas: number }[]`, en orden descendente de `completadas` (a igual cantidad, por `usuarioId`). `nombre` y `apellido` salen de master en un solo lote y valen `null` si el usuario ya no está. Sin ciclo activo ni explícito, o con un ciclo explícito inexistente, es `[]`. El campo viaja siempre, sin gateo por permiso propio: la ruta ya exige `DASHBOARD:LECTURA`.
  - **Período:** el dashboard no filtra por fechas sino por ciclo. Se toma el rango del ciclo efectivo (explícito o activo), `[fecha_inicio, fecha_fin + 1 día)` en UTC, y se evalúa sobre `completada_en`, no sobre el `ciclo_id` del ticket: una tarea completada en octubre sobre un ticket de un ciclo anterior cuenta en octubre.
  - **Filtros:** el dashboard no tiene filtros de tipo ni de módulo; los únicos son el ciclo y el alcance por rol, y los dos aplican. Siempre se excluyen las tareas dadas de baja y las de tickets dados de baja.
  - **Alcance:** TECNICO fija `completada_por_id = actorId`, el mismo criterio que `asignadoId` en las métricas por ticket, así que ve a lo sumo su fila. ADMINISTRADOR, ROOT y COLABORADOR ven a todos, como en el resto del dashboard.
  - **Puerto:** se reusó `ITareaTicketRepository.contarCompletadasPorTecnico` de T1, que ya devuelve el agrupado ordenado y pega en el índice (`completada_en`, `completada_por_id`). No se agregó un método a `IDashboardRepository`, que es el puerto de agregaciones sobre `tickets`: la consulta es sobre `tareas_ticket`, y duplicarla obligaba al dashboard a conocer esa tabla. `ObtenerMetricasUseCase` recibe además `resolverNombres` de `IUsuarioMasterChecker`; los dos tokens ya los exporta `TicketsModule`. `cicloClienteRepo` suma `findById`, para las fechas del ciclo explícito.
  - **Métricas por ticket:** no cambian. El spec unitario compara el resto del payload con el fixture previo (`toStrictEqual`), y la integración compara las métricas por ticket antes y después de completar tareas, con la carga que sigue siendo del responsable.
  - **Tests:**
    - `obtener-metricas.use-case.spec.ts`: alcance por rol (ADMINISTRADOR, ROOT, COLABORADOR y TECNICO), orden y nombres, usuario ausente de master, período vacío sin consultar master, fechas del ciclo explícito, ciclo explícito inexistente y CA6.
    - `tareas-completadas-dashboard.integration.spec.ts` (nuevo, inquilino efímero, con los repositorios Prisma reales): bordes del período sobre `completada_en`, tarea de un ticket de otro ciclo, bajas de tarea y de ticket, crédito para quien completó y no para el técnico asignado, descompletar quita el crédito, alcance de TECNICO y CA6. **No cubre el aislamiento entre inquilinos:** los specs existentes del dashboard no lo hacen, y la consulta corre sobre el cliente del inquilino de `TenantContext`, igual que el resto del dashboard.
  - **Deuda de Ayuda:** el indicador nuevo no tiene artículo; se anota para cuando T7 lo muestre.
  - **Verificación:**
    - `pnpm lint`: 0 errores.
    - `pnpm typecheck`: 0 errores.
    - `pnpm vitest run src/dashboard src/tickets/infrastructure`: 30 archivos y 261 tests en verde, incluida la integración nueva.
    - `check-casts-en-specs`: 617 en 114, igual que la base.
  - Próximo paso: T3b.
- 2026-10-13: T3b cerrada en `7255db23` (rama `feat/tareas-con-tecnico-t3b`, apilada sobre T4). Salió en 578 líneas: unas 174 de código y migración y 404 de tests. Supera el presupuesto de ~300 por el e2e y la integración del filtro. Ruta: delegada.
  - **Hallazgo:** la visibilidad sin `TICKETS:VER_TODOS` era "solicitante", no "responsable" (`solicitanteId`, no `asignadoId`). Los presets TECNICO y COLABORADOR incluyen `VER_TODOS`, así que CA10 solo cambia algo para quien tenga la matriz de permisos recortada.
  - **Brecha previa, fuera de alcance:** un responsable sin `VER_TODOS` no ve su propio ticket. No se tocó; agregarlo es una decisión de producto.
  - **Definición compartida:** `whereVisiblePara` en `PrismaTicketRepository` (solicitante, o técnico de una tarea con `deleted_at` nulo). La usan el filtro `visiblePara` del listado (antes `soloSolicitante`, en un `AND` propio para no pisar el `OR` de `busqueda`) e `ITicketRepository.esVisiblePara`. `esTicketVisiblePara` pasa a ser async: con `VER_TODOS` o siendo el solicitante resuelve sin consultar; si no, decide el repositorio.
  - **Puntos extendidos:**
    - detalle (`ObtenerTicketUseCase`), que también cubre el PDF y `GET /v1/tickets/:id`;
    - listado (`ListarTicketsUseCase`), que también cubre `/tickets/export` y `GET /v1/tickets`;
    - historial (`ListarTimelineUseCase`, que tenía su propia copia de la regla), y con él el historial del PDF;
    - listado de tareas y el 404/403 de `rechazar` en las reglas de tareas: el técnico de una tarea ahora ve el ticket, así que lo que no puede hacer le da 403 y no 404. El e2e de T3 se ajustó a eso.
  - **Puntos que no se tocaron:**
    - escrituras (adjuntos, comentarios, transición, edición): CA10 es solo visibilidad. La transición nunca dependió de la visibilidad, solo de `TICKETS:TRANSICIONAR`.
    - listados por módulo (`/reparaciones`, `/compras`, `/soporte/:ticketId`): solo exigen el permiso de lectura del módulo y no tienen restricción por usuario, así que no hay nada que extender.
    - el filtro por módulo del listado de tickets sigue aplicando. Solo un técnico con el módulo del tipo puede tener una tarea (regla del punto 9), así que en la práctica no bloquea.
  - **Índice:** migración `20261013160000_tareas_ticket_indice_tecnico`, (`tecnico_id`, `deleted_at`, `ticket_id`), con un `rollback.sql` re-ejecutable (probado dos veces dentro de una transacción). El `EXPLAIN` muestra que el `EXISTS` del listado se resuelve con un index-only scan sobre ese índice.
  - **Entorno:** a `soporte_tenant_test` le faltaban las migraciones desde `20261013130000`; se aplicaron con `prisma migrate deploy`. Se borraron los fixtures `T5_TEST_*` que dejó una corrida fallida.
  - **Tests:**
    - `visibilidad-ticket.spec.ts` (nuevo);
    - casos CA10 en los specs unitarios de tareas, detalle e historial;
    - integración del filtro y de `esVisiblePara`: tarea borrada, tarea de otro técnico y combinación con `busqueda`;
    - bloque CA10 en `tareas-ticket.e2e.spec.ts`: detalle, listado, tareas e historial; completa su tarea; 403 al crear, borrar y transicionar; deja de verlo al quitarlo y, por separado, al borrar la tarea; aislamiento con un técnico del cliente B.
    - En `generar-pdf-ticket.use-case.spec.ts` (fuera de la superficie, autorizado por el coordinador) solo se agregó `esVisiblePara` a los dos mocks.
  - **Verificación:**
    - `pnpm lint`: 0 errores.
    - `pnpm typecheck`: 0 errores.
    - `pnpm vitest run src/tickets src/reparaciones src/ticket-pdf`: 109 archivos y 1110 tests en verde.
    - `check-casts-en-specs`: 617 en 114, igual que la base.
  - Próximo paso: T5.
- 2026-10-14: T5 cerrada en `0c642473` (rama `feat/tareas-con-tecnico-t5`, apilada sobre T3b). Salió en 340 líneas: unas 150 de código y 190 de tests. Supera el presupuesto de ~150 por los casos de tareas en los dos specs. Ruta: delegada.
  - **Fuente:** `GenerarPdfTicketUseCase` lee `ITareaTicketRepository.listarPorTicket` (`TAREA_TICKET_REPOSITORY`, que ya exportaba `TicketsModule`), sobre el cliente del inquilino de `TenantContext`, como el resto del caso de uso. El avance sale de `calcularAvanceTareas`. Ya no se leen `subtareas_edilicia` ni `ticket_edilicia.porcentaje_avance`, y `TicketPdfModule` deja de inyectar `SUBTAREA_EDILICIA_REPOSITORY`.
  - **Alcance:** la sección "Tareas" se imprime en cualquier tipo de ticket con al menos una tarea activa (CA1, CA7, CA8), no solo en Edilicia. Sin tareas activas no se imprime.
  - **Vista:** `TicketPdfVista.tareas: TareasPdf | null`, con `porcentajeAvance`, `completadas`, `total` e `items` (descripción, técnico, completada, `completadaEn` y `completadaPor`). `EdiliciaPdf` queda con `ubicacion`: el avance y las subtareas se mudaron a `tareas`. Una reparación sin tareas ya no imprime "Avance 0%".
  - **Cada tarea:** `[x]` o `[ ]` y la descripción, y debajo `Técnico: <nombre>` o `Sin técnico`, más `Pendiente` o `Completada el <fecha> por <nombre>`. Los nombres se resuelven en el mismo lote contra master que el resto del PDF; un id que ya no está en master se imprime "Usuario", para no confundirlo con una tarea sin técnico.
  - **Defensa:** el caso de uso vuelve a filtrar las bajas lógicas y a ordenar por `orden`, aunque el repositorio ya lo hace.
  - **Ayuda:** ningún artículo describe el contenido del PDF, así que ninguno queda falso y no hay deuda nueva.
  - **Queda para T8:** el comentario de `ReparacionesModule` que dice que `SUBTAREA_EDILICIA_REPOSITORY` sigue exportado porque el PDF lo lee ya no es cierto; el export y su comentario se retiran con la tabla.
  - **Tests:**
    - `generar-pdf-ticket.use-case.spec.ts`: tareas por orden con técnico, sin técnico, completada (fecha y quién) y pendiente, con el avance calculado; tarea dada de baja excluida del listado y del avance; técnico ausente de master; sin tareas no hay sección; una reparación imprime la ubicación y el avance de las tareas, no el `porcentaje_avance` guardado.
    - `pdfkit-generador-pdf-ticket.spec.ts`: la sección "Tareas" en un ticket de soporte (no edilicio), con "Sin técnico", "Pendiente" y "Completada el ... por ..."; la reparación con la ubicación; sin tareas no hay sección.
    - No hay integración del PDF; la exclusión de bajas en la base la cubre la integración de `PrismaTareaTicketRepository` (T1).
  - **Verificación:**
    - `pnpm lint`: 0 errores.
    - `pnpm typecheck`: 0 errores.
    - `pnpm vitest run src/ticket-pdf`: 3 archivos y 31 tests en verde.
    - `pnpm vitest run src/tickets`: 85 archivos y 899 tests en verde. La primera corrida dio 14 archivos de integración en rojo porque Postgres todavía no aceptaba conexiones (`ECONNREFUSED 127.0.0.1:5432`); al levantar, todo verde.
    - `check-casts-en-specs`: 617 en 114, igual que la base.
  - Próximo paso: T6.
