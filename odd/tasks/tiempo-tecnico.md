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
- [ ] T3 — S5, S6, S7 — worker — tramos del técnico: abrir al asignar, cerrar al reasignar o resolver,
  medir en horas hábiles de su horario con pausas en Esperando cliente; registrar el asignado en la
  operación `ASIGNACION` en las cuatro vías — (pendiente)
- [ ] T4 — S4, S8 — worker — exponer tramos y cumplimiento en el detalle del ticket y en el dashboard — (pendiente)

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
