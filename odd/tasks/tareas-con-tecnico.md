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
- [x] **T6 — Frontend: tareas en el ticket** (~400): sección "Tareas" en el detalle del ticket, con avance, alta, asignación con selector de técnicos elegibles, completar, descompletar y borrar. El diálogo de Edilicia pasa a usar lo mismo. Se corrigen `backend/ayuda/reparaciones-edilicias.md` y `reparaciones-listado.md` en la misma unidad. Ruta: delegada. Salió en 1511 líneas, commit `ac227605`.
- [x] **T7 — Frontend: indicador del dashboard** (~200): muestra la métrica de T4. Ruta: delegada. Salió en 161 líneas, commit `74ebc929`.
- [x] **T8 — Retiro** (~200): migración que borra `subtareas_edilicia` y `ticket_edilicia.personal_asignado_id` (y, por decisión del dueño del 2026-10-14, `ticket_edilicia.porcentaje_avance`), con `rollback.sql`. También se borra el código viejo que ya no se usa. Ruta: delegada. Salió en 2914 líneas (486 más y 2428 menos), commit `8f169eb1`.
- [ ] **T9 — Docs y cierre** (~150):
  - [x] runbook, con la migración con datos y el orden de despliegue de T1 y T8;
  - [x] deuda de Ayuda (ver "Deuda de Ayuda" más abajo);
  - [x] declaración Cumplida o Desviación en el roadmap;
  - [x] suites completas (backend 731 archivos y 8728 tests, frontend 273 y 2272, todo en verde sobre `ee1ebf27`);
  - [x] `judgment-day`, porque el cambio toca datos existentes y permisos. Veredicto: **APPROVED** (ronda 1 más re-judgment acotado de las correcciones T10-T12).

  Ruta: delegada para la verificación.
- [x] **T10 — JD-W1: actualizaciones perdidas en las tareas** (bugfix, TDD): `PrismaTareaTicketRepository.guardar` es un `UPDATE ... WHERE id` incondicional que reescribe técnico, completado y baja desde una entidad leída fuera de la transacción. Completar contra eliminar revive una tarea borrada (y con ella la visibilidad CA10 de su técnico), asignar contra completar borra el completado, y dos completar concurrentes devuelven 200 los dos, escriben dos filas de historial y el segundo pisa el crédito. Arreglo: escritura condicionada al estado que validó el caso de uso (concurrencia optimista); si la condición falla, el caso de uso relee y devuelve el error de dominio que corresponde (`TAREA_YA_COMPLETADA`, `TAREA_NO_COMPLETADA` o `TAREA_NO_ENCONTRADA`), y el historial solo se escribe si la escritura condicionada tuvo éxito, en la misma transacción. Fuente: ledger del `judgment-day`, ronda 1, 2026-10-14, objetivo `1058a110...9caf30dd`, diff sha256 `701f5951…`, WARNING en el que coincidieron los dos jueces; el dueño decidió corregirlo antes del merge (2026-10-14). Ruta: delegada. Salió en 571 líneas (534 más y 37 menos), commit `5d844e83`. RED y GREEN en el Progreso del 2026-10-14.
- [x] **T11 — JD-W2: la métrica del dashboard corta el día en UTC** (bugfix, TDD): `ObtenerMetricasUseCase` arma el período como `[fecha_inicio, fecha_fin + 1 día)` en la medianoche UTC, pero las fechas del ciclo son días calendario argentinos. Una tarea completada entre las 21:00 y las 23:59 ART del último día cae en el ciclo siguiente, y una completada a esa hora el día anterior al inicio cuenta en este. Arreglo: los bordes son la medianoche argentina (03:00 UTC), con un helper de `shared/domain/zona-horaria-argentina.ts`. Fuente: el mismo ledger (ronda 1, 2026-10-14, `1058a110...9caf30dd`, `701f5951…`) y la misma decisión del dueño. Ruta: delegada. Salió en 132 líneas (113 más y 19 menos), commit `b510bc90`. RED y GREEN en el Progreso del 2026-10-14.
- [x] **T12 — JD-W3: permiso para listar las tareas** (bugfix, TDD): `GET /tickets/:id/tareas` solo mira `esTicketVisiblePara`; no exige permiso de lectura ni aplica el gate del módulo, así que un usuario con `VER_TODOS` y sin `TICKETS:LECTURA` lee las tareas de cualquier ticket. Decisión del dueño (2026-10-14): listar tareas sigue el permiso de lectura del módulo del tipo. Lo puede el técnico de una tarea activa (CA10); si no, quien tiene `<MODULO>:LECTURA` (ROOT y ADMINISTRADOR pasan por `puedeEjecutar`), y en el módulo TICKETS además tiene que ver el ticket; si no, se rechaza con la convención 404/403 de `rechazar`. Consecuencia en el frontend: el respaldo de solo lectura de T6 en el diálogo de Edilicia deja de hacer falta y se retira, con la corrección de la Ayuda que lo describe. Fuente: el mismo ledger (ronda 1, 2026-10-14, `1058a110...9caf30dd`, `701f5951…`). Ruta: delegada. Salió en 455 líneas (347 más y 108 menos), commit `87c40762`. RED y GREEN en el Progreso del 2026-10-14.
- [x] **T13 — JD-S1 y JD-S2: carreras residuales al completar y descompletar** (bugfix, TDD): el re-judgment acotado del 2026-10-14 (delta `9caf30dd..d16e3c60`, diff sha256 `bcf3e5cd…`) dejó dos puntos informativos. **JD-S1** (SUGGESTION, los dos jueces): `descompletarSiCompletada` condiciona solo en `completada = true`, así que un descompletar que leyó el completado de X borra el de Y si en el medio X descompletó e Y volvió a completar, y registra un `completada_por_anterior_id` vencido. **JD-S2** (WARNING de un juez, previo a T10): completar y descompletar no condicionan en el técnico con el que `puedeCompletarTarea` autorizó al actor; si el responsable reasigna la tarea mientras el técnico anterior la completa, ese técnico se queda con el crédito. Decisión del dueño (2026-10-14): cerrar los dos. Arreglo: descompletar exige además el completado leído (`completadaPorId` y el milisegundo de `completadaEn`); si el actor tiene permiso solo por ser el técnico de la tarea, las dos escrituras exigen `tecnicoId = actor.id`. Ruta: delegada. Salió en 420 líneas (396 más y 24 menos: unas 200 de código y 220 de tests), commit `700b6ff9`. RED y GREEN en el Progreso del 2026-10-14.

## Deuda de Ayuda
La escritura de artículos está en pausa (`CLAUDE.md`). Lo nuevo de este punto que no tiene
artículo, reunido de los Progreso y de los commits de T3b, T6 y T7; la misma lista está en
"Deuda de Ayuda" de `docs/roadmap-comercial.md`:
- **La sección "Tareas" del detalle de un ticket de cualquier tipo** (T6): alta, técnico por
  tarea con el selector de elegibles, completar y descompletar, borrar con confirmación, quién
  ve cada botón y el avance. Hoy solo la describe, para Edilicia, `reparaciones-edilicias.md`.
- **Las cinco entradas nuevas del historial** (T2 y T6): "Tarea agregada", "Técnico de tarea",
  "Tarea completada", "Tarea descompletada" y "Tarea eliminada".
- **El indicador "Tareas completadas por técnico" del dashboard** (T4 y T7): se atribuye a quien
  completó, no al técnico asignado ni al responsable, y cuenta por la fecha de completado dentro
  del ciclo, aunque el ticket sea de otro ciclo.
- **La visibilidad por tarea** (T3b): el técnico de una tarea activa ve el ticket en el detalle,
  en el historial y en sus tareas, aunque no tenga `TICKETS:VER_TODOS`. El listado ya lo dice
  (ver abajo); falta el resto.
- **Quién lista las tareas** (T12): el técnico de una tarea activa, o quien tiene el permiso de
  lectura del módulo del tipo (en TICKETS, además, tiene que ver el ticket). Va en el artículo
  pendiente de la sección "Tareas".

Artículos que el punto volvió falsos, corregidos:
- `reparaciones-edilicias.md` y `reparaciones-listado.md`, en T6 (y la tabla de permisos, en
  `7299defb`).
- `tickets-listado.md`, en T9: decía que sin permiso para ver todos el listado muestra
  "únicamente los que vos creaste", y desde T3b también muestra los tickets donde el usuario es
  el técnico de una tarea activa.
- `reparaciones-edilicias.md`, en T12: decía que quien no tiene acceso al ticket ve el
  checklist sin el técnico; desde T12 el lector de Edilicia lista las tareas completas.

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
- 2026-10-14: T6 cerrada en `ac227605` (rama `feat/tareas-con-tecnico-t6`, apilada sobre T5). Salió en 1511 líneas (1156 más y 355 menos): unas 830 de código y Ayuda, y 680 de tests. Supera el presupuesto de ~400 por la matriz de actores y la reescritura de los tests de Edilicia. Ruta: delegada.
  - **Componente:** `frontend/src/features/tickets/components/ticket-tareas.tsx` (`TicketTareas`), keyed por `ticketId`. Muestra el avance (`<porcentaje>% · <completadas> de <total> completadas`, o "Sin tareas todavía."), cada tarea por `orden` con "Técnico: <nombre>" o "Sin técnico", el badge Pendiente/Completada y "Completada el <fecha> por <nombre>". Alta con `crearTareaSchema` (`schemas.ts`: `/\S/` y hasta 255 sin recortar, como `CrearTareaTicketBodyDto`), selector de técnico por fila con cambio inmediato (la opción vacía manda `null`), Completar/Descompletar y borrar con `ConfirmDialog`. Si el técnico actual ya no es elegible, se lo muestra igual como opción. El detalle lo monta en una sección "Tareas" entre las acciones y la Actividad, en cualquier tipo de ticket.
  - **Hooks** (`hooks/use-tareas-ticket.ts`): `useTareasTicket` (`["ticket", id, "tareas"]`), `useTecnicosElegiblesTarea` (clave aparte, para que invalidar las tareas no lo refetchee; solo se pide si el actor puede gestionar) y las cinco mutaciones. Cada una invalida las tareas, el historial y las `invalidarTambien` del caller.
  - **Errores:** el `message` de Nest para tareas lleva ids crudos (`La tarea "<uuid>" ya está completada.`), así que 403, 404, 409 y 422 se traducen a un toast propio por código; un 404 o un 409 también refrescan la lista. El resto sigue `notifyError`.
  - **Visibilidad de botones** (`lib/permisos-tareas.ts`, espejo de `puedeGestionarTareas` y `puedeCompletarTarea`): `esAdministrador` es `useSession().esAdminCliente` (ROOT o ADMINISTRADOR), el permiso del módulo es `can("<MODULO>:MODIFICACION")` con el `modulo` del tipo (`TipoTicket.modulo` del catálogo) y el responsable es `ticket.asignadoId`. El frontend lo puede calcular con fidelidad en el detalle. Si el catálogo de tipos no resolvió, no se esconde nada y decide el backend.
  - **Decisión — responsable desconocido en Edilicia:** `GET /reparaciones` no trae el `asignadoId`, y `GET /tickets/:id` exige `TICKETS:LECTURA`. El diálogo lo pide solo si el actor tiene ese permiso; si no, o si falla, el responsable queda `undefined` y se muestran gestionar y completar a quien tiene `EDILICIA:MODIFICACION` (podría ser el responsable). El backend corta al resto con 403, que llega como toast. Mientras carga el ticket, el responsable también es desconocido.
  - **Decisión — lector de Edilicia sin acceso al ticket:** `GET /tickets/:id/tareas` lo puede quien ve el ticket (T2/T3b), pero el listado de reparaciones lo ve cualquiera con `EDILICIA:LECTURA`. Para no dejarlo sin checklist, si el pedido falla `SubtareasDialog` muestra de solo lectura las `subtareas` embebidas en `GET /reparaciones` (que T3 ya lee de `tareas_ticket`), sin técnico. Es un parche de experiencia: si el dueño prefiere que listar tareas siga la visibilidad del módulo, es un cambio de backend.
  - **Edilicia:** el diálogo conserva el botón "Ver subtareas" y el título "Subtareas — <número>", y adentro usa la copia genérica ("Nueva tarea", "Sin tareas todavía."). El borrado ahora pide confirmación. El avance de `reparaciones-list.tsx` sigue saliendo de `porcentajeAvance`, y las mutaciones invalidan `["reparaciones"]`. Se retiraron del frontend `useCrearSubtarea`, `useCompletarSubtarea`, `useEliminarSubtarea`, `crearSubtareaSchema`, `CreateSubtareaDto` y `SUBTAREA_DESCRIPCION_MAX_LENGTH`; nada más los usaba. `SubtareaEdilicia` queda, porque el listado la sigue trayendo. Las rutas viejas del backend quedan para T8.
  - **Historial:** `TIPO_OPERACION_CONFIG` suma "Tarea agregada" (`ListPlus`), "Técnico de tarea" (`UserCog`), "Tarea completada" (`CheckCircle2`), "Tarea descompletada" (`Undo2`) y "Tarea eliminada" (`Trash2`).
  - **`useTicket`** recibe un `enabled` opcional, para el diálogo de Edilicia.
  - **Ayuda corregida en la misma unidad:** `reparaciones-edilicias.md` (las subtareas son las tareas del ticket, técnico por tarea, asignar, descompletar, confirmación al borrar, avance sobre tareas activas, quién ve los botones y el caso sin acceso al ticket; la tabla suma "Asignar o quitar el técnico" y "Completar o descompletar") y `reparaciones-listado.md` (avance sobre tareas activas).
  - **Deuda de Ayuda:** falta un artículo sobre la sección Tareas del detalle de un ticket de cualquier tipo. Quedó anotada en el commit.
  - **Tests:**
    - `ticket-tareas.test.tsx` (nuevo): avance, "Sin técnico", técnico y quién completó, vacío; alta (`POST` con el body), descripción de espacios que no llega al backend, asignar y quitar (`PATCH` con el id y con `null`), completar y descompletar, borrar con confirmación (`DELETE` recién al confirmar); toasts de 403 y 422; matriz de botones por actor: responsable, ADMINISTRADOR, técnico de la tarea, responsable sin el permiso del módulo y usuario ajeno con el permiso.
    - `permisos-tareas.test.ts` (nuevo): el responsable desconocido.
    - `schemas.test.ts` de tickets: `crearTareaSchema` (vacía, espacios, un carácter, tope y tope + 1).
    - `ticket-timeline.test.tsx`: las cinco etiquetas.
    - `ticket-detail-view.test.tsx`: la sección Tareas con su avance.
    - `subtareas-dialog.test.tsx` (reescrito): pega en `/tickets/:id/tareas` y ninguna ruta de `/reparaciones/*`; un no responsable con los permisos viejos no gestiona; sin `TICKETS:LECTURA` y con `EDILICIA:MODIFICACION` ve los controles; sin el permiso solo lee; el respaldo de solo lectura ante un 404.
    - `reparaciones-list.test.tsx`: el avance de la fila sigue al alta y a la baja, sobre las rutas genéricas.
    - `edilicia/schemas.test.ts`: se quitaron los casos de `crearSubtareaSchema`.
  - **Verificación** (desde `frontend/`):
    - `pnpm lint`: sin warnings ni errores.
    - `pnpm type-check`: 0 errores.
    - `pnpm test`: 273 archivos y 2263 tests en verde.
    - `node scripts/check-casts-en-specs.mjs` (raíz): 617 en 114, igual que la base.
  - Próximo paso: T7.
- 2026-10-14: T7 cerrada en `74ebc929` (rama `feat/tareas-con-tecnico-t7`, apilada sobre T6). Salió en 161 líneas: unas 58 de código y 103 de tests. Ruta: delegada.
  - **Tarjeta:** "Tareas completadas por técnico" en `dashboard-view.tsx`, entre "Carga por agente" y "% Cumplimiento SLA", con el mismo `HBarChart` que la carga por agente. Vacío: "Sin tareas completadas en este ciclo.". Respeta el ciclo del filtro porque sale de la misma respuesta de `useMetricas(cicloId)`; el hook no cambió.
  - **Tipo** (`types.ts`): `TareasCompletadasTecnico` y `tareasCompletadasPorTecnico?` en `MetricasDashboard`. Es opcional a propósito: un backend anterior a T4 no lo manda. El dashboard no valida la respuesta con Zod, así que no hay schema que tocar.
  - **Mapeo** (`toTareasCompletadasChartData` en `lib/metricas-map.ts`): nombre y apellido unidos, salteando la parte que sea `null` o vacía; sin ninguna, la etiqueta neutra "Usuario" (`NOMBRE_USUARIO_AUSENTE`). `undefined` se lee como `[]`. Conserva el orden del backend; no reordena. No usa el map de `GET /usuarios`, porque el nombre ya viaja en la respuesta.
  - **Decisión — vacío general del ciclo:** el `EmptyState` "Sin datos" del dashboard ahora también exige que no haya tareas completadas. T4 cuenta una tarea de un ticket de otro ciclo en el período en que se completó, así que un ciclo sin tickets puede tener tareas; antes el vacío general las habría escondido.
  - **Pendiente menor:** `HBarChart` y su tabla accesible usan la etiqueta como `key` de React. Dos filas con la misma etiqueta (dos usuarios dados de baja, o dos técnicos homónimos) dan una advertencia de clave duplicada en consola; el render sale bien. Es igual en "Carga por agente" y está en `shared/charts`, fuera del alcance de T7.
  - **Tests:**
    - `metricas-map.test.ts`: nombre completo y orden del backend, usuario ausente → "Usuario", una sola parte del nombre, campo ausente → `[]`.
    - `dashboard-view.test.tsx`: filas con su cantidad en el orden del backend, un orden no alfabético con un usuario ausente en el medio, lista vacía, campo omitido sin romper la vista, y un ciclo sin tickets con tareas que muestra el indicador en vez del vacío general.
  - **Verificación** (desde `frontend/`):
    - `pnpm lint`: sin warnings ni errores.
    - `pnpm type-check`: 0 errores.
    - `pnpm test`: 273 archivos y 2272 tests en verde.
    - `node scripts/check-casts-en-specs.mjs` (raíz): 617 en 114, igual que la base.
  - **Ayuda:** ningún artículo de `backend/ayuda/` enumera los indicadores del dashboard de forma exhaustiva, así que nada quedó falso. **Deuda de Ayuda:** el indicador de tareas completadas por técnico no tiene artículo. Quedó anotada en el commit.
  - Próximo paso: T8.
- 2026-10-14: T8 cerrada en `8f169eb1` (rama `feat/tareas-con-tecnico-t8`, apilada sobre T7). Salió en 2914 líneas: 486 más y 2428 menos. Casi todo es borrado de código muerto con sus specs; lo agregado son la migración, su rollback y su spec (unas 300). Ruta: delegada.
  - **Decisión del dueño (2026-10-14):** también se retira `ticket_edilicia.porcentaje_avance`. Desde T3 el avance se calcula al leer, y la columna ya no la actualizaba nadie.
  - **Migración** `20261014120000_retiro_subtareas_edilicia`: borra `subtareas_edilicia`, `ticket_edilicia.personal_asignado_id` (no tenía FK ni índice) y `ticket_edilicia.porcentaje_avance`; con la columna caen `ticket_edilicia_porcentaje_avance_idx` y `ticket_edilicia_porcentaje_avance_check`. Se quitaron del `schema.prisma` el modelo `SubtareaEdilicia`, los dos campos y sus relaciones, y se regeneró el cliente.
  - **`rollback.sql`** (re-ejecutable): recrea la tabla y las dos columnas con los tipos, defaults, constraints e índices de `20260805194710_init_tenant`, repuebla `subtareas_edilicia` desde `tareas_ticket` vía `ticket_edilicia.ticket_id` conservando los ids (`ON CONFLICT DO NOTHING`), y recalcula `porcentaje_avance` con las tareas activas (misma fórmula que `calcularAvanceTareas`).
    - **Probado dos veces en una transacción** (`BEGIN … ROLLBACK`) sobre la base local de Demo Soporte, resuelta desde el registro de `clientes`: migrar dejó la tabla y las dos columnas fuera; dos corridas del rollback devolvieron las 2 subtareas, con diferencia vacía en los dos sentidos contra la foto previa, el mismo avance, los constraints (`subtareas_edilicia_pkey`, `_ticket_edilicia_id_fkey`, `ticket_edilicia_porcentaje_avance_check`) y los índices. La base quedó intacta.
    - **Spec automático** `reparaciones/infrastructure/persistence/prisma/migracion-retiro-subtareas.integration.spec.ts` (base efímera migrada hasta `20261013160000`): la migración borra todo sin tocar `tareas_ticket`; el rollback corre dos veces, la diferencia contra `tareas_ticket` es vacía, excluye el ticket sin satélite, el avance da 33.33, 100.00 y 0.00 (con una tarea completada dada de baja que no cuenta), el CHECK vuelve a regir y la migración se reaplica.
  - **Código borrado:** `SubtareaEdiliciaEntity`, `ISubtareaEdiliciaRepository` y su token, `PrismaSubtareaEdiliciaRepository`, `SubtareaEdiliciaMapper`, `CrearSubtareaUseCase`, `CompletarSubtareaUseCase`, `EliminarSubtareaUseCase`, todos con sus specs. Además `AvanceCalculator` (quedó sin llamadores; `calcularAvanceTareas` tiene sus propios tests) y `SubtareaNoEncontradaError` (el catálogo de errores del controller baja de 5 a 4). `TicketEdiliciaEntity`, su mapper y `CrearTicketEdilicioUseCase` ya no tienen `personalAsignadoId` ni `porcentajeAvance`; salen también `actualizarAvance` y `asignarPersonal`. `ReparacionesModule` deja de registrar y exportar `SUBTAREA_EDILICIA_REPOSITORY`, y se corrigieron sus comentarios viejos.
  - **Rutas viejas: retiradas.** No hay ningún llamador real de `POST /reparaciones/:reparacionId/subtareas`, `POST /reparaciones/subtareas/:id/completar` ni `DELETE /reparaciones/subtareas/:id`: no aparecen en el frontend (T6 sacó los hooks), ni en la API pública, ni en `docs/`. Solo las usaban sus propios tests. Se borraron las rutas, `subtareas-sobre-tareas.use-cases.ts`, `CreateSubtareaHttpDto` y sus tests. `toHttpException` vuelve a caer en 422 por defecto, sin el mapeo de tareas.
  - **Contrato de `GET /reparaciones` y su exportación:** conservan `subtareas` y `porcentajeAvance`, calculados sobre `tareas_ticket`, de los que depende el respaldo de solo lectura de T6. Ninguno lee las columnas borradas. `personalAsignadoId` sale de la respuesta (CA9) y del tipo `TicketEdilicia` del frontend. `POST /reparaciones` devuelve `porcentajeAvance: 0`, porque una reparación recién creada no tiene tareas.
  - **Spec de T1** (`migracion-tareas-ticket.integration.spec.ts`): **se conserva sin cambios.** Ya migraba una base efímera solo hasta `20261013130000` y corría el SQL de T1 aparte, así que no depende de que `subtareas_edilicia` exista en una base migrada del todo. Pasa.
  - **Otras referencias:**
    - `demo-seed.ts` usaba `CrearSubtareaUseCase`, que **dejó de registrarse en T3**: desde entonces `app.get` habría fallado. Ahora da de alta las dos tareas con `CrearTareaTicketUseCase` y un actor ADMINISTRADOR, y `demo-seed.integration.spec.ts` cuenta las tareas del ticket edilicio.
    - El seeder de tenants lista los cinco `TAREA_*` (la migración de T2 ya los inserta antes; `skipDuplicates`), y se corrigió su comentario.
    - PDF: solo quedaban comentarios y un fixture con los campos viejos.
  - **Ayuda:** `reparaciones-edilicias.md` no dice nada falso después del retiro; no se tocó. Sin deuda nueva.
  - **Base de test:** `prisma migrate deploy` aplicó la migración a `soporte_tenant_test`. Existe `pnpm migrate:tenants`, pero **no se corrió** contra las bases locales de Demo Soporte y Rotair: necesita el build y no es una base de las suites. El código de T8 funciona igual contra una base sin migrar, porque Prisma ignora las columnas de más y las dos tienen default o admiten NULL.
  - **Verificación** (backend):
    - `pnpm lint`: 0 errores.
    - `pnpm typecheck`: 0 errores.
    - `pnpm vitest run src/reparaciones src/tickets src/ticket-pdf`: 104 archivos y 1068 tests. La primera corrida dio 1 rojo (el conteo del catálogo de errores, que no se había actualizado); corregido, el spec pasa en 36 de 36.
    - `pnpm test` completo: 731 archivos y 8728 tests, **2 en rojo**, los dos en `tenant-seeder.adapter.integration.spec.ts`: esperan 5 `tipo_operacion` y hay 10. **Es previo a T8**: la migración `20261013150000_tipos_operacion_tareas` de T2 inserta los cinco `TAREA_*` en cada `migrate deploy`. El arreglo (borrar los `TAREA_*` antes del `seed()`, como el spec ya hace con otras filas sembradas por migración, o esperar 10) está fuera de las superficies de T8.
    - Frontend: `pnpm lint` sin warnings ni errores; `pnpm type-check` 0 errores; `pnpm test` 273 archivos y 2272 tests en verde.
    - `node scripts/check-casts-en-specs.mjs`: **594 en 111** (base 617 en 114). El script sale con error porque la base quedó vencida y pide actualizar `BASE_OCURRENCIAS = 594` y `BASE_ARCHIVOS = 111` en `scripts/check-casts-en-specs.mjs`, que está fuera de las superficies de T8.
  - **Notas de deploy para el runbook de T9:**
    - **Orden:** T1 antes que T8. La migración de T8 borra lo que la de T1 copia. Las dos salen en el mismo deploy en orden de timestamp, pero si se despliegan por separado, T8 nunca va antes que T1.
    - **Precheck del CHECK de T1:** antes del deploy, contar en producción las filas de `subtareas_edilicia` que violarían `tareas_ticket_completada_check` (`completada` sin `completada_en` o sin `completada_por_id`, o no completada con alguno de los dos). Si hay alguna, la migración de T1 falla entera.
    - **Límites del rollback de T8:** solo vuelven las tareas de tickets con satélite de Edilicia; se pierde el técnico de cada tarea; `personal_asignado_id` vuelve en NULL (nunca se usó); `porcentaje_avance` se recalcula; no borra la fila de `_prisma_migrations`. Para volver al código de T7 hay que correr primero este rollback: el cliente Prisma de T7 lee las dos columnas.
  - **Cierre de los dos chequeos en rojo** (coordinador, commit `dfed21b5`): el spec de integración del seeder pasa a esperar los 10 `tipo_operacion` (los cinco de R19 más los cinco `TAREA_*`, que ahora también lista el seeder), y la base de `check-casts-en-specs.mjs` baja a 594 en 111. Verificación: `pnpm lint` (backend) en 0 errores; `pnpm vitest run src/reparaciones src/tickets src/ticket-pdf src/clientes`: 156 archivos y 1473 tests en verde; `node scripts/check-casts-en-specs.mjs`: 594 en 111, el ratchet se sostiene. La suite completa del backend se vuelve a correr en T9.
  - Próximo paso: T9.
- 2026-10-14: docs de T9 en `feat/tareas-con-tecnico-t9` (apilada sobre T8). Ruta: delegada.
  - **Runbook:** sección "Tareas con técnico (punto 12)" en `DEPLOY-VPS-runbook.md`, antes de "Cuando algo falla". Lleva:
    - las cuatro migraciones tenant en orden (`20261013140000_tareas_ticket`, `20261013150000_tipos_operacion_tareas`, `20261013160000_tareas_ticket_indice_tecnico` y `20261014120000_retiro_subtareas_edilicia`), confirmadas contra `backend/prisma_tenant/migrations/`;
    - que un solo deploy las aplica en orden base por base, así que la copia va antes del borrado, y que `migrate-tenants.js` corta en el primer inquilino que falla;
    - por qué partir T1 y T8 en dos deploys se puede pero no aporta;
    - el precheck de solo lectura por base, derivado del CHECK de la migración de T1 (violaciones más la foto de subtareas, completadas y bajas), qué hacer si alguna fila lo viola o si falta la tabla, y la repetición del precheck con los servicios detenidos después de `predeploy-dump.ps1`;
    - la verificación posterior (conteos contra la foto, `con_tecnico = 0` y las estructuras retiradas) y el smoke del detalle, Edilicia, PDF y dashboard;
    - el rollback (los `rollback.sql` en orden inverso, siendo el de T8 el único imprescindible, y después el código) con lo que no vuelve, incluidas las filas de `_prisma_migrations`.
    - Las bases salen del registro de `clientes`, sin nombres hardcodeados.
  - **Roadmap:** se siguió el precedente de webhooks (T8 de `odd/tasks/webhooks.md`). La fila del punto 12 queda "En curso", implementada en la cadena local y pendiente de `judgment-day`, merge y deploy: **no es HECHO** hasta el deploy. La decisión declara **Cumplida** en CA1 a CA10, sin desviaciones. Dos notas:
    - el corte del período de la métrica en la medianoche UTC queda para el `judgment-day`;
    - el checklist de solo lectura y sin técnico para un lector de Edilicia que no ve el ticket (T6) se declara como decisión de implementación que la decisión no cubre, no como desviación, porque conserva lo que ese lector ya veía y no le muestra nada nuevo.
  - **Deuda de Ayuda:** reunida en la sección "Deuda de Ayuda" de este documento y en la del roadmap. **Ayuda falsa:** el grep de `subtarea`, `porcentaje`, `personal asignado`, `avance`, los permisos y la visibilidad encontró una afirmación vencida en `tickets-listado.md` ("únicamente los que vos creaste", falso desde T3b), y se corrigió. `reparaciones-edilicias.md` y `reparaciones-listado.md` siguen siendo verdaderas.
  - **Verificación:**
    - `node scripts/check-roadmap-fresco.mjs`: el roadmap está fresco (ancla `1dcdcaa2`, 45 commits de distancia).
    - backend: `pnpm lint` 0 errores; `pnpm typecheck` 0 errores; `pnpm test` 731 archivos y 8728 tests en verde (unos 26 minutos).
    - frontend: `pnpm lint` sin warnings ni errores; `pnpm type-check` 0 errores; `pnpm test` 273 archivos y 2272 tests en verde.
    - `node scripts/check-casts-en-specs.mjs`: 594 en 111, igual que la base.
  - El ítem "suites completas" lo tildó el coordinador con la evidencia de esta corrida.
  - Próximo paso: `judgment-day`.
- 2026-10-14: correcciones del `judgment-day` en `fix/tareas-con-tecnico-jd` (apilada sobre T9). El `judgment-day` (ronda 1, objetivo `1058a110...9caf30dd`, diff sha256 `701f5951…`) aprobó la cadena, con tres WARNING en los que coincidieron los dos jueces; el dueño decidió corregirlos antes del merge. Son bugfixes, así que van con TDD (§6.1). Tareas agregadas en `4d44eb6f`. Ruta: delegada, las tres.
  - **T10 — JD-W1, `5d844e83`** (571 líneas: unas 170 de código y 400 de tests).
    - **Mecanismo:** escrituras condicionadas por operación, sin columna de versión ni migración. `guardar` (el `UPDATE` incondicional) sale del puerto y lo reemplazan `completarSiPendiente`, `descompletarSiCompletada`, `asignarTecnicoSiActiva` y `darDeBajaSiActiva`: un `updateMany` con el estado validado en el `WHERE` (activa, y pendiente o completada según el caso), que escribe solo los campos de su operación y devuelve `count === 1`. Asignar ya no puede borrar un completado y la baja conserva quién completó, porque ninguna de las dos los escribe.
    - **Conflicto:** si la escritura no aplica, el caso de uso no escribe historial (lo guarda después, en la misma transacción, solo si la escritura aplicó), relee la tarea con `errorDeEscrituraRechazada` y responde `TAREA_NO_ENCONTRADA` (404) si ya no está activa, o el 409 de la operación (`TAREA_YA_COMPLETADA`, `TAREA_NO_COMPLETADA`) si sigue activa. Asignar y eliminar solo exigen que siga activa, así que su conflicto siempre es 404.
    - **Decisión:** dos asignaciones a la par quedan con la última, como la asignación del responsable; el `tecnico_anterior_id` del historial de la segunda puede quedar viejo. Condicionar también el técnico obligaba a un error de dominio nuevo, que el frontend no sabe mostrar.
    - **RED** (`pnpm vitest run src/tickets/application/use-cases/tareas-ticket.concurrencia.integration.spec.ts`, spec nuevo, inquilino efímero con los repositorios Prisma reales; la carrera se simula sin paralelismo, con un repositorio que deja completar la acción ajena entre la lectura y la devolución): 7 de 7 en rojo, cada uno por la razón esperada. Completar contra eliminar devolvió ok (`expected false to be true` en `isFail()`): revivía la tarea. Asignar contra completar dejó `completada = false`. Completar contra asignar volvió a escribir `TECNICO_A` sobre `TECNICO_B`. Dos completar devolvieron ok los dos. Eliminar contra completar borró el completado. Dos descompletar y dos eliminar devolvieron ok los dos.
    - **GREEN:** 7 de 7 en verde. Se ajustaron los specs que usaban `guardar`: el unitario de casos de uso (mocks de los cuatro métodos), la integración del repositorio (un caso nuevo prueba que cada escritura condicionada devuelve `false` sin escribir) y la integración del dashboard de T4.
  - **T11 — JD-W2, `b510bc90`** (132 líneas: unas 40 de código y docs y 90 de tests).
    - **Arreglo:** `medianocheArgentina(dia)` en `shared/domain/zona-horaria-argentina.ts` devuelve las 00:00 ART (03:00 UTC) del día calendario de un `@db.Date`, leyendo solo sus componentes UTC. El período pasa a ser `[medianocheArgentina(fecha_inicio), medianocheArgentina(fecha_fin + 1 día))`.
    - **RED** (`pnpm vitest run src/shared/domain/zona-horaria-argentina.spec.ts src/dashboard`): 9 en rojo. Los cuatro del helper nuevo (`medianocheArgentina is not a function`). En el unitario del caso de uso, "23:30 ART del último día cuenta" (`expected [] to have a length of 1`) y "23:30 ART del día anterior al inicio no cuenta" (`expected [ … ] to have a length of +0 but got 1`), más los dos que fijan los bordes en 03:00 UTC. La integración de T4, con los bordes pasados a hora argentina, dio `expected [] to deeply equal [ … ]` en septiembre. "00:30 ART del primer día cuenta" y "00:30 ART del día siguiente al fin no cuenta" pasaban antes y después: son de no regresión.
    - **GREEN:** 6 archivos y 59 tests en verde.
    - **Docs:** el roadmap deja de declarar el corte UTC como abierto. El runbook no lo mencionaba.
  - **T12 — JD-W3, `87c40762`** (455 líneas: unas 130 de código y docs y 325 de tests).
    - **Contraste previo con el código:** el tipo resuelve su módulo por la columna `tipos_ticket.modulo`; `GET /tickets/:id` exige `TICKETS:LECTURA` y `esTicketVisiblePara` para cualquier tipo, sin gate de módulo; los listados por módulo (`/reparaciones`) exigen solo `<MÓDULO>:LECTURA` (`AccionesGuard` reemplazó al gate de módulo puro). La regla no contradice nada de eso. Lo que sí queda distinto, por decisión: en un ticket de Edilicia el detalle sigue la lectura de TICKETS y las tareas la de EDILICIA. Quien tiene `TICKETS:LECTURA` y `VER_TODOS` pero no `EDILICIA:LECTURA` abre el detalle de un ticket de Edilicia y la sección Tareas le muestra "No se pudieron cargar las tareas." (403).
    - **Arreglo:** `ListarTareasTicketUseCase` recibe `TIPO_TICKET_REPOSITORY` y `modulosConLectura` (`modulosConLecturaDesdeJwt` en `interface/actor-tarea.ts`, con `puedeEjecutar`; no se sumó a `ActorTarea` para no tocar los demás casos de uso). Lista el técnico de una tarea activa; si no, quien lee el módulo del tipo, y en TICKETS además tiene que ver el ticket; si no, 404 si no lo ve y 403 si lo ve.
    - **RED, unitario** (`pnpm vitest run src/tickets/application/use-cases/tareas-ticket.use-cases.spec.ts`, corrido con el constructor viejo para que fallara por conducta y no por la firma): 5 en rojo. En TICKETS: `VER_TODOS` sin `TICKETS:LECTURA`, el solicitante sin `TICKETS:LECTURA` y `EDILICIA:LECTURA` sobre un ticket de TICKETS (los tres listaban). En Edilicia: el lector con `EDILICIA:LECTURA` que no ve el ticket (daba 404) y `TICKETS:LECTURA` más `VER_TODOS` sin `EDILICIA:LECTURA` (listaba).
    - **RED, e2e** (`tareas-ticket.e2e.spec.ts`, con la implementación vieja): 3 en rojo. `VER_TODOS` sin lectura (`expected 200 to be 403`), el lector de Edilicia (`expected 404 to be 200`) y `TICKETS:LECTURA` sin `EDILICIA:LECTURA` (`expected 200 to be 403`). El caso de aislamiento (lector de Edilicia del cliente B, 404) y el lector de TICKETS con `VER_TODOS` (200) pasaban antes y pasan después.
    - **RED, frontend** (`subtareas-dialog.test.tsx`): "si el listado falla, informa el error en vez de un checklist armado con otra fuente" en rojo; el respaldo mostraba "Sin tareas todavía.".
    - **GREEN:** unitario y e2e, 5 archivos y 123 tests en verde; frontend `src/features/edilicia` y `src/features/tickets`, 26 archivos y 228 tests en verde.
    - **Frontend:** se retiraron el checklist de solo lectura de `SubtareasDialog`, su prop `subtareas` y el prop `respaldoSiFalla` de `TicketTareas`. El diálogo siempre usa el listado genérico, con el técnico. **`subtareas` de `GET /reparaciones`:** el frontend ya no lee su contenido (solo queda en el tipo y como slot de la columna "Subtareas"); se dejó en su lugar, porque retirarlo está fuera de este alcance.
    - **Ayuda:** se corrigió `reparaciones-edilicias.md`. La deuda del artículo de la sección Tareas suma quién las lista.
    - **Roadmap:** la nota del checklist de solo lectura pasa a ser la precisión del dueño sobre quién lista.
    - De paso se corrigió un comentario de estado vencido en `tickets.module.ts`: decía que completar y eliminar se exportaban para las rutas de subtareas "hasta que T8 las retire".
  - **Verificación** (sobre `87c40762`):
    - backend: `pnpm lint` 0 errores; `pnpm typecheck` 0 errores; `pnpm vitest run src/tickets src/dashboard src/reparaciones src/ticket-pdf` 110 archivos y 1152 tests en verde.
    - frontend: `pnpm lint` sin warnings ni errores; `pnpm type-check` 0 errores; `pnpm test` 273 archivos y 2273 tests en verde.
    - `node scripts/check-casts-en-specs.mjs`: 594 en 111, igual que la base.
    - `node scripts/check-roadmap-fresco.mjs`: el roadmap está fresco.
    - No se corrió la suite completa del backend (`pnpm test`).
  - El espejo de Engram no se tocó en esta tanda: lo resincroniza el coordinador.
  - Próximo paso: re-judgment acotado del `judgment-day` sobre `4d44eb6f..` (las tres correcciones).
- 2026-10-14: re-judgment acotado del `judgment-day` sobre el delta de las correcciones (`9caf30dd..d16e3c60`, diff sha256 `bcf3e5cd…`), con los dos jueces a ciegas leyendo solo el ledger congelado y el delta. **Veredicto final: APPROVED.**
  - **JD-W1, JD-W2 y JD-W3: resueltas**, según los dos jueces y con prueba en cada caso (escrituras condicionadas con `updateMany` y `count`, historial solo tras la escritura, bordes en la medianoche argentina, matriz de actores del listado y aislamiento entre clientes).
  - Ningún CRITICAL, ni original ni causado por las correcciones.
  - **Informativo, en el que coincidieron los dos (SUGGESTION):** `descompletarSiCompletada` condiciona solo en `completada = true`, no en `completadaPorId` ni en `completadaEn`. Queda una ventana ABA: si entre la lectura y la escritura alguien descompleta y otro vuelve a completar, el descompletado borra la completación nueva y el historial registra a quien completó antes. Hacen falta tres acciones dentro de la ventana de una sola request.
  - **Sospecha de un solo juez (WARNING, previa a las correcciones):** `completarSiPendiente` no condiciona en el `tecnicoId` con el que se autorizó al actor. Si el responsable reasigna la tarea mientras el técnico anterior la está completando, el técnico desasignado se queda con el crédito.
  - Los dos puntos informativos no se corrigen solos; quedan como deuda menor a decisión del dueño.
  - Las suites completas del backend no se volvieron a correr después de T10-T12; antes del merge corresponde correrlas.
  - Próximo paso: suite completa del backend, y después merge y deploy a decisión del dueño.
- 2026-10-14: T13 en `fix/tareas-con-tecnico-jd`, por decisión del dueño de cerrar los dos puntos informativos del re-judgment (JD-S1 y JD-S2). Es bugfix, así que va con TDD (§6.1). Ruta: delegada.
  - **T13 — JD-S1 y JD-S2, `700b6ff9`** (420 líneas: unas 200 de código y 220 de tests).
    - **Mecanismo:** el puerto suma una condición opcional a las dos escrituras: `completarSiPendiente(tarea, { tecnicoId? })` y `descompletarSiCompletada(tarea, { tecnicoId?, completadoLeido? })`. Es opcional para no romper los specs que llaman al repositorio sin caso de uso (el de integración del dashboard de T4 está fuera de las superficies); el único llamador de producción, el caso de uso, siempre la pasa.
    - **JD-S2, sin duplicar la regla:** `puedeCompletarTarea` pasa a apoyarse en `baseParaCompletarTarea`, que devuelve de dónde sale el permiso (`ADMINISTRADOR`, `RESPONSABLE` o `TECNICO`, en ese orden de precedencia). `condicionDeTecnico` pone `tecnicoId = actor.id` solo cuando la base es `TECNICO`; el responsable y el administrador escriben sin condición de técnico.
    - **JD-S1, `completadaEn` al milisegundo:** el `WHERE` compara `completada_en` en `[t, t + 1 ms)` y no con igualdad. Postgres guarda microsegundos y Prisma los trunca al leer, así que una fila escrita fuera de la aplicación (por ejemplo, la copia de `subtareas_edilicia` de T1) nunca se podría descompletar con una igualdad exacta. Lo prueba un caso de la integración del repositorio con `completada_en` en `.123456`.
    - **Conflicto:** `errorDeEscrituraRechazada` acepta, además del error fijo, una función que decide a partir de la tarea releída. `errorDeCompletadoRechazado` arma esa función para completar y descompletar: si la tarea ya no está activa, 404 como antes; si el actor perdió el permiso con el estado releído, `rechazar`; si no, el 409 del estado.
    - **Decisión, el 409 de JD-S1:** descompletar que encuentra la tarea completada por otro completado da `TAREA_YA_COMPLETADA`. Es el que dice el estado real (la tarea está completada); `TAREA_NO_COMPLETADA` afirmaría algo falso. El frontend traduce por estado HTTP, no por código (`use-tareas-ticket.ts`): cualquier 409 muestra "La tarea ya estaba en ese estado. Actualizamos la lista." y refresca, así que el elegido no cambia lo que ve el usuario, solo lo que dice la API. El texto del toast queda algo inexacto para este caso (la tarea no está "en ese estado": la completó otro); no se tocó porque el frontend está fuera de las superficies. Si la encuentra pendiente, sigue siendo `TAREA_NO_COMPLETADA`.
    - **Decisión, el 403 de JD-S2 pasa por `rechazar`:** el técnico que perdió la tarea recibe `TAREA_ACCION_NO_PERMITIDA` (403) si todavía ve el ticket, y `TICKET_NO_ENCONTRADO` (404) si ya no lo ve. Un técnico sin `VER_TODOS` que solo veía el ticket por esa tarea (CA10) lo deja de ver al perderla, y la convención de `rechazar` es no confirmar que existe un ticket que no se ve; es lo mismo que recibiría si reintentara. Los casos de integración usan actores con `VER_TODOS` y dan 403. El frontend refrescaba la lista ante un 404 o un 409, pero no ante un 403: el técnico veía el toast de permiso y la tarea seguía mostrándose suya. Lo cerró el coordinador con TDD: `use-tareas-ticket.ts` ahora también refresca ante un 403. RED: `expected 1 to be greater than 1` (la lista no se volvía a pedir); GREEN: `ticket-tareas.test.tsx`, 15 tests en verde; `pnpm lint` y `pnpm type-check` del frontend en cero.
    - **Orden del conflicto:** el permiso se mira antes que el estado, para no informar el estado de la tarea a quien ya no tiene permiso sobre ella.
    - **RED:**
      - `pnpm vitest run src/tickets/application/use-cases/tareas-ticket.concurrencia.integration.spec.ts`: 3 en rojo, los tres en `expect(result.isFail()).toBe(true)` (`expected false to be true`), es decir, la escritura vencida aplicaba: el ABA de descompletar (JD-S1), y completar y descompletar del técnico A contra la reasignación a B (JD-S2). "Descompletar del responsable contra reasignar" (nuevo) y "completar contra asignar" (existente, el responsable completa) pasaban antes y pasan después: son de no regresión.
      - `pnpm vitest run src/tickets/infrastructure/persistence/prisma/prisma-tarea-ticket.repository.integration.spec.ts`: el caso nuevo en rojo (`expected true to be false`): completar condicionado al técnico A sobre una tarea de B aplicaba.
      - `pnpm vitest run src/tickets/application/use-cases/tareas-ticket.use-cases.spec.ts`: 7 en rojo: los seis casos nuevos de la condición por actor (técnico, responsable y administrador, en completar y en descompletar) y el caso existente del crédito, que pasó a esperar la condición vacía; el repositorio se llamaba sin condición.
    - **GREEN:** los tres archivos, 102 tests en verde.
  - **Verificación** (sobre `700b6ff9`):
    - backend: `pnpm lint` 0 errores; `pnpm typecheck` 0 errores; `pnpm vitest run src/tickets` 86 archivos y 939 tests en verde.
    - `node scripts/check-casts-en-specs.mjs`: 594 en 111, igual que la base.
    - No se corrió la suite completa del backend (`pnpm test`).
  - Sin cambios visibles para el usuario: no suma deuda de Ayuda.
  - El espejo de Engram no se tocó: lo resincroniza el coordinador.
  - **Suite completa** (coordinador, sobre `b51ab560`): backend `pnpm test`, 733 archivos y 8776 tests en verde, con salida 0. Los tres `FAIL orden-de-arranque.spec.ts` del log son el fixture de `test/fixtures/entorno/`, que `test/entorno-corte-arranque.spec.ts` corre en un proceso hijo esperando que falte una variable; no es una falla de la suite. Frontend `pnpm test`: 273 archivos y 2274 tests en verde.
  - Próximo paso: merge y deploy, a decisión del dueño. El re-judgment del delta de T13 queda a su criterio.
