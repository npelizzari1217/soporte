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

- [ ] T1 — S1, S2, S3 — worker — horario por usuario en el tenant (tabla con `usuario_id` soft ref,
  migración + rollback), API GET/PUT por usuario (admin) y resolución "propio o del cliente" — (pendiente)
- [ ] T2 — S1 — worker — frontend: editar el horario de un técnico desde su ficha o la pantalla de
  horario laboral — (pendiente)
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
