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
- [ ] **T3 — Endpoints y Edilicia sobre la tabla nueva** (~350): endpoints genéricos bajo el ticket. Los endpoints y el listado de reparaciones pasan a leer y escribir la tabla nueva, sin cambiar lo que ve el usuario de Edilicia. Incluye un e2e de permisos y de aislamiento. Ruta: delegada.
- [ ] **T4 — Métrica del dashboard** (~250): "tareas completadas por técnico" en el período, por `completadaPorId`, respetando los filtros y el alcance del TECNICO. Ruta: delegada.
- [ ] **T5 — PDF** (~150): el PDF lee la tabla nueva e imprime cada tarea con su técnico y su estado. Ruta: delegada.
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
