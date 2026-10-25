# tiempo-tecnico — tiempo del técnico contra el SLA, en su propio horario

Mide si cada técnico resolvió su tramo del ticket dentro de las horas del SLA, contando solo su
horario laboral propio. Es solo medición: no limita a quién se asigna. El SLA del solicitante no cambia.

## Specs

- **S1 — Horario por usuario.** Cada técnico puede tener un horario laboral semanal propio ("un tecnico
  puede trabajar de Lunes a Viernes de 9 a 18 y otro de..." — L1). Mismo formato que el horario del
  cliente: un intervalo por día, en hora argentina, días cerrados permitidos y al menos uno abierto.
- **S2 — Sin horario propio, el del cliente.** Un técnico sin horario cargado se mide con el horario
  laboral del tenant (L4, pregunta 4: "El del cliente (tenant)").
- **S3 — No limita la asignación.** "Los ticket se pueden asignar incluso a la gente que no esta en
  horario ya que puede ser un tecnico especialista" (L2). Ninguna asignación se rechaza ni se advierte
  por el horario.
- **S4 — El objetivo es el SLA del ticket.** El tiempo estipulado son las mismas horas del SLA del
  ticket (`sla_meta_s`), sin configuración nueva (L3: "opcion A"). Un ticket sin meta (sin SLA o
  preventivo) no se evalúa.
- **S5 — Qué se mide: el ticket hasta RESUELTO.** Desde que se le asigna el ticket hasta que pasa a
  Resuelto (L4, pregunta 1).
- **S6 — Cada técnico, su tramo.** Si el ticket pasa de un técnico a otro, el reloj de cada uno corre
  solo mientras lo tuvo; el que lo resuelve se evalúa con su tramo (L4, pregunta 2: "Cada uno su
  tramo").
- **S7 — La espera al cliente pausa.** Mientras el ticket está en Esperando cliente, el reloj del
  técnico se detiene (L4, pregunta 3: "Sí, se detiene").
- **S8 — Dónde se ve.** En el detalle del ticket (tiempo de cada tramo contra la meta) y en el dashboard
  (cumplimiento por técnico), respetando el alcance actual (un TECNICO ve lo suyo).

Fuera de alcance, declarado antes de empezar:
- **Sin backfill histórico.** Las operaciones `ASIGNACION` de hoy no registran a quién se asignó, así que
  los tramos anteriores al deploy no se pueden reconstruir con certeza. Se mide desde el deploy.
- **Ayuda:** suspendida (AGENTS.md); la feature se anota para la tanda final.

## Tasks

- [x] T1 — S1, S2, S3 — worker — horario por usuario en el tenant (tabla con `usuario_id` soft ref,
  migración + rollback), API GET/PUT por usuario (admin) y resolución "propio o del cliente" — (este commit, L7)
- [x] T2 — S1 — worker — frontend: editar el horario de un técnico desde su ficha o la pantalla de
  horario laboral — (este commit, L8)
- [x] T3 — S2, S4, S5, S6, S7 — worker — tramos del técnico (tabla `tramos_tecnico_ticket`, L9): abrir
  cuando el ticket queda con un asignado o se reabre con asignado, cerrar al reasignar, desasignar o pasar
  a RESUELTO, CERRADO o CANCELADO, en la misma transacción que el ticket; medir en horas hábiles de su
  horario con pausas en Esperando cliente y fijar la meta del ticket al cerrar. La operación `ASIGNACION`
  no se modifica — (este commit, L10)
- [x] T4 — S4, S8 — worker — exponer tramos y cumplimiento en el detalle del ticket y en el dashboard — (este commit, L12)

## Log

- **L1 — Pedido del dueño (2026-10-25, texto truncado en la memoria):** "Una cosa que quiero discutir
  contigo es el horario laboral. lo tenemos en forma global pero en realidad depende de cada usuario, ya
  que un tecnico puede trabajar de Lunes a Viernes de 9 a 18 y otro de..."
- **L2 — Dueño (2026-10-25, texto truncado en la memoria):** "Los ticket se pueden asignar incluso a la
  gente que no esta en horario ya que puede ser un tecnico especialista, a mi me interesa saber si el
  tecnico logro terminar su tarea en el tiempo estipulado au..."
- **L3 — Dueño (2026-10-25):** "opcion A" — el objetivo del técnico son las horas del SLA del ticket,
  contadas en su horario y desde la asignación.
- **L4 — Dueño (2026-10-25), respuestas:** 1. "El ticket (hasta RESUELTO)"; 2. "Cada uno su tramo"; 3.
  "Sí, se detiene"; 4. "El del cliente (tenant)".
- **L5 — Mapa (explore, 2026-10-25).** `CalcularSlaHabilVenceService.msHabilesEntre(desde, hasta,
  calendario, feriados)` recibe el calendario por parámetro: reutilizable con el horario del técnico. El
  horario de hoy es por tenant (`calendario_laboral_dias_cliente`, módulo `calendario-laboral/`); los
  feriados son unión master + tenant. La meta sale de `Prioridad.slaHoras` → `tickets.sla_meta_s`.
  `tickets.asignado_id` guarda solo el actual y la operación `ASIGNACION` no registra el asignado: no hay
  "desde cuándo lo tiene" confiable hoy. Estados que pausan: ESPERANDO_CLIENTE y RESUELTO.
- **L6 — Dueño (2026-10-25):** "si" — autoriza implementar tiempo-tecnico, empezando por T1.
- **L7 — T1 hecha (2026-10-25).** Migración tenant `20261026100000_horario_laboral_usuario` (+
  `rollback.sql`): tabla `horario_laboral_usuario`, PK (`usuario_id`, `dia_semana`), mismos CHECK que
  `calendario_laboral_dias_cliente` (el spec los compara contra el catálogo). Puerto
  `IHorarioLaboralUsuarioRepository` (`obtener` → horario o `null`, `reemplazar` con 7 `upsert`
  secuenciales dentro de la transacción del caso de uso, `borrar`). S2:
  `ResolverHorarioLaboralUsuarioService.obtenerParaUsuario` devuelve `{ calendario, origen: 'USUARIO' |
  'CLIENTE' }`, exportado por `CalendarioLaboralModule` para T3. API `GET`/`PUT`/`DELETE
  /horario-laboral/usuarios/:usuarioId`: UUID con `ParseUUIDPipe` (400), usuario fuera del tenant 404
  (`existeEnTenant`), horario inválido 422 (mismo `HorarioLaboralSemanal`), escritura solo
  ADMINISTRADOR/ROOT (`AdminClienteGuard`); el `DELETE` responde el horario del cliente. Decisiones: (a) la
  lectura queda abierta a cualquier autenticado del tenant, igual que `GET /horario-laboral`: es agenda, no
  desempeño (el alcance de la medición es de S8/T4); (b) `UsuarioMasterChecker` se registra como provider
  local del módulo porque `TicketsModule` ya importa `CalendarioLaboralModule` (importarlo de vuelta es un
  ciclo). S3: la asignación no se tocó. Evidencia: `pnpm lint` 0 errores, `pnpm typecheck` 0 errores;
  vitest focal 8 archivos, 64 tests verdes (nuevos: resolver 3, casos de uso 8, controller 12, repositorio
  integración 8, migración 13; existentes tocados: mapper, guards y e2e de `horario-laboral`). La guarda
  `scripts/runbook-migraciones.spec.ts` no tiene tope superior en esta rama y pide la migración nueva en el
  checklist del 2026-10-25: el mismo commit le agrega el tope (`20261025140000`, igual que `1825c6b9`).
  Sin e2e HTTP propio: `ParseUUIDPipe` y el 403 real de `AdminClienteGuard` se cubren por metadata.
  Ajuste del orquestador: el test de rollback del repositorio dejó de mockear `$transaction` con `any`
  (AGENTS.md lo prohíbe) y usa un trigger temporal que hace fallar a Postgres en el día 3. Módulo
  `calendario-laboral` + guarda del runbook: 33 archivos, 258 tests verdes; lint y typecheck limpios.
- **L8 — T2 hecha (2026-10-25).** Sección "Horario por técnico" dentro de `/horario-laboral`
  (`HorarioLaboralTecnicoSeccion`, montada por `HorarioLaboralView`), solo para ADMINISTRADOR/ROOT
  (`esAdminCliente`): para el resto se oculta, no queda de solo lectura, porque elegir técnico necesita
  `GET /usuarios` y para un TECNICO común es un 403 seguro. Técnicos: `useUsuariosAsignables`
  (`GET /usuarios`, el mismo que usa el dashboard) filtrado a TECNICO y COLABORADOR; sin tocar archivos
  fuera de la feature. S1: reusa `HorarioLaboralForm` y su schema, con dos props opcionales nuevas
  (`etiquetaGuardar`, `prefijoId`: dos grillas en la página no repiten `id`). S2: con `origen: "CLIENTE"`
  muestra el aviso "<técnico> usa el horario laboral del cliente…" y la grilla editable con el horario del
  cliente; el botón dice "Usar horario propio" y hace el `PUT` con lo que haya en la grilla. Con
  `origen: "USUARIO"`: "Guardar" (`PUT`) y "Volver al horario del cliente" (`ConfirmDialog` → `DELETE`).
  Formularios (AGENTS.md): el form lleva `key` por técnico y cambiar de técnico limpia el error de la
  mutación; el técnico elegido se busca en la lista vigente, así que si un refetch lo saca la selección
  cae a vacía. El query key del técnico cuelga de `["horario-laboral"]`: guardar el horario del cliente
  también refresca a los técnicos que lo usan. `mensajeErrorGuardado` salió de la vista a
  `mensaje-error-guardado.ts` para compartirlo (fallback en español neutro). Evidencia: vitest focal
  `src/features/horario-laboral` 9 archivos, 50 tests verdes (nuevos: sección 10, vista 2); mutación
  manual: sin `guardarMutation.reset()` al cambiar de técnico cae el test de fuga del error, y sin `key`
  ni el `reset` del form caen el de cambio de técnico y el de `DELETE`. `pnpm lint` sin advertencias ni
  errores; `pnpm type-check` 0 errores. Ayuda: se anota para la tanda final.
- **L9 — Diseño de T3 (orquestador, 2026-10-25), aplicando S5-S7.** Fuente: tabla tenant `tramos_tecnico_ticket`
  (ticket, técnico, `inicio_at`, `fin_at`, `motivo_fin`, `habil_s`, `meta_s`, `cumplido`). Un tramo se ABRE cuando
  el ticket queda con un asignado (cualquiera de las vías de asignación, o al reabrirse un RESUELTO con asignado) y
  se CIERRA cuando cambia el asignado, se desasigna, o el ticket pasa a RESUELTO, CERRADO o CANCELADO. Al cerrar se
  mide `habil_s` en el horario del técnico (`ResolverHorarioLaboralUsuarioService`, S2) más los feriados, restando
  los intervalos en ESPERANDO_CLIENTE leídos de los CAMBIO_ESTADO del timeline (S7), y se fija `meta_s` =
  `tickets.sla_meta_s` del momento. `cumplido` (= `habil_s <= meta_s`) solo se evalúa en el tramo que cierra en
  RESUELTO (S6: "el que lo resuelve se evalúa con su tramo"); los tramos cerrados por reasignación guardan su
  tiempo sin veredicto. Sin meta (S4) → `cumplido` NULL. Tiempos fijos con el horario vigente al cerrar (mismo
  criterio que `odd/tasks/promedios-dashboard-habiles.md`). Sin backfill (fuera de alcance). La operación
  `ASIGNACION` no se modifica: el tramo ya registra quién y desde cuándo.
- **L10 — T3 hecha (2026-10-25).** Migración tenant `20261026110000_tramos_tecnico_ticket` (+ `rollback.sql`):
  tabla `tramos_tecnico_ticket` (`tecnico_id` soft ref; `ticket_id` FK ON DELETE CASCADE, dato derivado);
  CHECK `fin_at >= inicio_at`, `motivo_fin` ∈ `MOTIVOS_FIN_TRAMO` (`as const` en
  `src/tiempo-tecnico/domain/tramo-tecnico.ts`, el spec de la migración lo compara contra
  `pg_get_constraintdef`), abierto sin motivo ni medición / cerrado con motivo, `habil_s` y `meta_s >= 0`,
  y `cumplido` exactamente `habil_s <= meta_s` en un RESUELTO con meta y medición (NULL si no); índice
  único parcial `WHERE fin_at IS NULL`. Modelo Prisma `TramoTecnicoTicket` editado a mano (sin
  `prisma format`); el cliente no se regeneró, así que el repositorio usa SQL crudo para la tabla nueva.
  **Punto único:** `TicketRepositoryConTramos` (decora `PrismaTicketRepository`; `TicketsModule` lo registra
  como `TICKET_REPOSITORY`, el único registro de ese token). Su `save` corre en `txRunner.run`
  (re-entrante): lee la situación previa con `FOR NO KEY UPDATE`, guarda y llama a
  `SincronizarTramoTecnicoService` en la misma transacción. Escritores de `asignado_id`/`estado_id`
  encontrados, todos por ese repositorio: `crear-ticket` (incluye el barrido preventivo y la API v1),
  `equipos/crear-ticket-soporte` (incluye el formulario público), `reparaciones/crear-ticket-edilicio`,
  `asignar-ticket`, `asignar-y-poner-en-proceso`, `avanzar-estado-por-tareas`, `transicionar-estado`
  (incluye el listener de reanudar por comentario); `demo-seed` usa esos casos de uso. Sin escribir columnas de responsable o estado: reloj y vencidos de SLA,
  primera respuesta, recordatorio preventivo, `backfill-tiempos-habiles.mjs`,
  `post-deploy-smoke-fecha-cierre.mjs`. Excepción declarada: `scripts/importacion-legacy/tenant.ts`
  inserta históricos con responsable y no abre tramos (sin backfill). La guarda
  `escritores-asignado.spec.ts` fija las tres listas y el registro único del token. Reglas
  (`planificarTramo`): solo abre si el guardado lo produjo (alta, cambio de asignado o reapertura desde
  RESUELTO/CERRADO/CANCELADO), así que un ticket asignado antes del deploy no abre tramo con cualquier
  guardado; asignar y resolver en el mismo guardado (última tarea de un NUEVO) deja un tramo de 0 s;
  asignar a otro un RESUELTO no abre nada. Medición: `ResolverHorarioLaboralUsuarioService` +
  `FERIADOS_LABORALES_REPOSITORY` + `msHabilesEntre`, contando solo `ESTADOS_RELOJ_CORRE` según los
  `CAMBIO_ESTADO` hasta el fin (el estado al inicio es el del último cambio anterior). Decisiones: (a) si
  la medición falla fuera de la base del tenant (feriados de master, horario inconsistente) el tramo cierra
  con `habil_s` NULL y se loguea `TRAMO_TECNICO_MEDICION_FALLO`, mismo criterio que JD-W2 de
  `promedios-dashboard-habiles`; (b) un tramo a cerrar que ya no está abierto lanza (con la fila
  bloqueada es un bug). Evidencia: `pnpm lint` 0 errores (tras `prettier --write` sobre los archivos
  nuevos); `pnpm typecheck` 0 errores; vitest focal `src/tiempo-tecnico` 6 archivos, 92 tests verdes
  (dominio 36, servicio 14, decorador 3, guarda 4, migración 18, integración por vía 17); con los specs
  existentes de lo tocado (contenedor DI y módulos, e2e que montan `TicketsModule`, paridad de `tickets`,
  guardas del runbook) 27 archivos, 446 tests verdes. Los tests se escribieron después de la
  implementación (feature, §6.1); mutaciones verificadas: contar Esperando cliente como activo hace caer
  7 tests (dominio, servicio e integración); quitar la sincronización del decorador hace caer 12 de los 17
  de integración. Ayuda: sin cambios visibles (T4 los muestra).
- **L11 — Verify independiente de T3 (2026-10-25): PASS, S2 y S4-S7 cumplidas, sin bloqueantes.** Confirmó el
  re-uso de la transacción del caso de uso, el mismo modo de lock que `bloquear`, el rollback en los dos sentidos y
  el orden operación-antes-de-`ahora()` en la medición. Aplicado: la guarda de escritores detecta `UPDATE`/`INSERT`
  con esquema y en minúsculas; sondas de bordes en `domain/tramo-tecnico.probes.spec.ts`. Para T4: (A2) un ticket
  borrado conserva su tramo abierto — T4 filtra los tickets borrados; (A3) si se resuelve justo después de
  repriorizar, la meta queda la anterior (la aplica el listener post-commit), poco probable y aceptado.
  `src/tiempo-tecnico` 7 archivos / 100 tests, lint y typecheck limpios.
- **L12 — T4 hecha (2026-10-25), S4 y S8.** **Detalle:** ruta nueva `GET /tickets/:id/tramos-tecnico`
  (`TramosTecnicoTicketController`, registrado en `TicketsModule` por su repositorio y su cargador de alcance;
  `TiempoTecnicoModule` no puede importar `TicketsModule`). Se eligió una ruta aparte y no extender
  `GET /tickets/:id`, para no sumar una consulta a cada detalle ni tocar el DTO que comparten listado y detalle.
  `ListarTramosTicketUseCase` usa la misma carga que `ObtenerTicketUseCase` (`cargarTicketParaOperar` con
  `LECTURA`): ticket inexistente, borrado o no visible es 404 y no se leen sus tramos. La ruta no declara
  `@RequiereAcciones` ni tiene campos condicionados por permiso. Respuesta por tramo: `tecnicoId`,
  `tecnicoNombre`/`tecnicoApellido` (lote a master, patrón de `asignadoNombre`), `inicioAt`, `finAt`,
  `motivoFin`, `habilS`, `metaS`, `cumplido`; el abierto sale sin medición. **Dashboard:**
  `cumplimientoTecnico` en `GET /dashboard/metricas`: por técnico, `total` (tramos con `motivo_fin =
  'RESUELTO'` y `cumplido` no nulo, S4), `cumplidos`, `porcentaje` (fracción, la calcula el caso de uso) y
  `promedioHabilS`. Período: los días argentinos del ciclo sobre `fin_at` (`periodoDelCiclo`, el mismo corte de
  03:00 UTC de T11 de `tareas-con-tecnico`, ahora compartido con tareas completadas). Excluye tickets borrados
  (L11, A2). Alcance: TECNICO fija `tecnico_id = actorId` (mismo criterio que `asignadoId` y
  `completada_por_id`) y el alcance por tipo usa `sqlAlcanceListado`. Puerto de lectura propio
  (`ICumplimientoTecnicoRepository`, SQL crudo), separado del modelo de escritura de los tramos. **Frontend:**
  tarjeta "Tiempo del técnico" en el detalle (`TicketTiempoTecnico`, query key bajo `["ticket", id]`, así que
  asignar o transicionar la refresca): técnico, desde, hasta, horas hábiles y meta en `h:mm`
  (`shared/lib/duracion-habil.ts`), badge Cumplido / No cumplido / Sin veredicto (con el motivo: Reasignado,
  Desasignado, Cerrado sin resolver, Cancelado, Sin meta de SLA o Sin medición) / En curso. Sin tramos no se
  monta (los tickets anteriores al deploy no tienen); si la consulta falla, la tarjeta avisa. Dashboard: tarjeta
  "Cumplimiento del técnico (horas hábiles en su horario)" con tabla (evaluados, cumplidos, %, promedio `h:mm`);
  cuenta para el vacío general como las tareas completadas. Evidencia backend: `pnpm lint` 0 errores, `pnpm
  typecheck` 0 errores; vitest focal (nuevos y existentes de lo tocado: `src/dashboard`, `src/tiempo-tecnico`,
  `src/tickets/interface/controllers`, e2e y specs de módulos que montan `TicketsModule`) 28 archivos, 516 tests
  verdes; `src/dashboard` + los dos specs nuevos fuera de `src/tiempo-tecnico`: 6 archivos, 73 tests verdes tras
  el ajuste de formato. Nuevos: integración `tiempo-tecnico-lectura` 7 (bordes del período, solo RESUELTO con
  veredicto y ticket borrado excluido, TECNICO solo su fila con el caso hermano, alcance por tipo, detalle visible /
  no visible / borrado), controller 5, caso de uso 5 más los asserts de alcance y vacío existentes. Evidencia
  frontend: `pnpm lint` sin advertencias ni errores, `pnpm type-check` 0 errores; vitest focal 8 archivos, 121
  tests verdes (nuevos: tarjeta 4, veredicto 9, duración 6, mapa 3, dashboard 4, detalle 2). Tests escritos
  después de la implementación (feature, §6.1); mutaciones verificadas: sin el filtro de `deleted_at` o sin el de
  `cumplido IS NOT NULL` cae el test de contenido de integración; montar la tarjeta sin tramos hace caer su test de
  vacío. Ayuda: se anota para la tanda final (detalle del ticket y dashboard).
- **L13 — Dueño (2026-10-25), visibilidad del detalle:** "Lo ve cualquiera que vea el ticket". El bloque "Tiempo del
  técnico" sigue la visibilidad del ticket (solicitante incluido); el dashboard sigue acotado por técnico (S8).
- **L14 — Verify independiente de T4 (2026-10-25): PASS, S4, S8, L12 y L13 cumplidas, sin bloqueantes.** Mismo camino
  de visibilidad que `GET /tickets/:id`, SQL parametrizado con el mismo alcance que el resto del dashboard, fixtures
  con filas que no deben aparecer. Aplicado: tipo de retorno explícito en `tramosTecnicoKey`. Suites completas
  sobre T4: backend 803 archivos / 10184 tests, frontend 290 / 2677, en verde.
