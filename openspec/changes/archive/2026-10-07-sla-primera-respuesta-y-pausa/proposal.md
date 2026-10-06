# Propuesta: SLA de primera respuesta y pausa del reloj

## Intención

Hoy el SLA de resolución corre aunque el ticket dependa del cliente, el cumplimiento depende de la marca del barrido (falso "a tiempo" entre vencimiento y barrido) y un cierre administrativo tardío lo penaliza. Tampoco existe una meta de primera respuesta.

Decisión de producto: `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa" → "Segunda etapa, punto 6 — SLA de primera respuesta y pausa del reloj" (confirmada y precisada el 2026-10-06). Cada viñeta se convierte en requerimiento con escenario en la spec. Esta decisión reemplaza las recomendaciones de la exploración donde difieren.

## Alcance

### Incluido
- Estado `ESPERANDO_CLIENTE`: entra desde EN_PROCESO; sale a EN_PROCESO, RESUELTO o CANCELADO. Un salto correctivo no puede llevar a él; toda salida (arco o salto) reanuda el reloj.
- Reloj de resolución por **tiempo activo**: corre en NUEVO/ASIGNADO/EN_PROCESO, se detiene en ESPERANDO_CLIENTE y en RESUELTO. Cumple si las horas hábiles activas hasta la última resolución no superan la meta. La pausa siempre descuenta.
- Reapertura por salto correctivo: el reloj sigue desde donde quedó, sin tiempo extra.
- Reanudación automática cuando el solicitante comenta un ticket en espera.
- Mail al solicitante al entrar a "Esperando al cliente".
- Primera respuesta: primer comentario público de alguien distinto del solicitante; meta opcional por prioridad "Primera respuesta (h)", hábil, sin pausa; vencida → badge + mail al asignado y a los administradores.
- Relleno de `primera_respuesta_at` desde el historial, sin meta retroactiva.
- Dashboard: % de cumplimiento de primera respuesta y tiempo medio de primera respuesta en horas hábiles; cumplimiento de resolución por tiempo activo.
- Preventivos excluidos.

### Excluido
- **Decisión pendiente**: tiempo extra o reloj nuevo al reabrir (roadmap, misma viñeta).
- Recalcular metas de tickets existentes.
- Escritura de Ayuda (suspendida desde el 2026-09-07): solo se anota la deuda en commit y PR (estado nuevo, campo de prioridad, indicadores, regla de pausa); se corrige todo artículo que quede falso.

## Capacidades

### Nuevas
- `ticket-esperando-cliente`: estado, arcos, guardia correctiva, reanudación por comentario, mail al solicitante.
- `sla-reloj-activo`: acumulado activo, vencimiento derivado, barrido, cumplimiento en la resolución, reapertura.
- `sla-primera-respuesta`: meta por prioridad, registro, vencimiento, notificación, relleno.
- `dashboard-metricas-sla`: las tres métricas de SLA.

### Modificadas
- Ninguna. `feriados-cliente` ("el barrido solo compara `sla_vence_at` contra ahora") y `horario-laboral-cliente` (no recálculo al guardar) siguen siendo verdaderas.

## Enfoque

Cambios frente a la exploración (modelo "corrimiento + acumulado"):
- **Acumulado activo** en vez de acumulado de pausa: el ticket guarda segundos hábiles activos y el instante desde el que corre el reloj (nulo si está detenido). Al detenerse se suma el tramo; al reanudar, `slaVenceAt` = sumar hábil (meta − acumulado) desde la reanudación. Repriorizar usa el mismo cálculo, sin perder pausas.
- **Barrido**: marca vencido solo tickets con reloj corriendo y `slaVenceAt < ahora`; un ticket detenido nunca vence. Como el acumulado activo es monótono, `vencido` sticky es correcto y la regla "si ya estaba vencido no se corre" desaparece.
- **Cumplimiento**: se fija al pasar a RESUELTO (acumulado ≤ meta) y se reescribe en cada resolución posterior. El dashboard lo lee; deja de usar `vencido` y `fechaCierre`.
- Se mantiene: enganche híbrido (marcador en la transacción de la transición, cálculo en `sla/`, reconciliación en el barrido), servicio de dominio de tiempo hábil entre instantes y suma de tiempo hábil, columnas SLA fuera de `toPersistence`, registro de primera respuesta en `CrearComentarioUseCase` con `WHERE primera_respuesta_at IS NULL`, relleno SQL en la migración tenant, estado SLA derivado en el DTO.

Preguntas de `config.yaml`: espeja otra capa (grafo de estados y Zod de prioridad en frontend; el backend es la fuente); hubo alternativas (pausa por corrimiento, descartada por la decisión); cambia lo que ve el usuario (deuda de Ayuda).

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/prisma_tenant/` | Modificado | migración: estado, columnas, CHECK, índices, relleno |
| `backend/src/calendario-laboral/domain/services/` | Modificado | tiempo hábil entre instantes y suma |
| `backend/src/sla/` | Modificado | reloj activo, barrido, primera respuesta |
| `backend/src/tickets/` | Modificado | máquina de estados, salto correctivo, comentarios, reanudación |
| `backend/src/notificaciones/`, `dashboard/`, `catalogos` | Modificado | mails, métricas, meta de prioridad |
| `frontend/src/features/{tickets,catalogos,dashboard}` | Modificado | estado, badges, campo, tarjetas |

## Entrega

`auto-chain`, ~2.600-3.400 líneas, PR por WU bajo 400: WU-1 estado y máquina; WU-2 tiempo hábil; WU-3a/3b reloj activo y barrido; WU-4 reanudación y mail al solicitante; WU-5 meta de prioridad; WU-6 registro de primera respuesta y relleno; WU-7 vencimiento de primera respuesta; WU-8 dashboard backend; WU-9 frontend.

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Tickets abiertos y cerrados previos sin acumulado activo: cómo entran al reloj y al cumplimiento sin recalcular | Alta | la spec declara el criterio de cohorte antes de apply; consultar al dueño si cambia una métrica visible |
| Listener post-commit falla y el reloj queda inconsistente | Media | marcador transaccional + reconciliación en el barrido + log |
| Carrera del upsert de la entidad | Media | columnas SLA por repos acotados |
| Costo del relleno en tenants grandes | Baja | EXPLAIN previo en un tenant de prueba |
| Calendario editado durante la pausa | Baja | se usa el vigente al reanudar (coherente con no recálculo) |

## Rollback

Migraciones aditivas por tenant (INSERT idempotente del estado, columnas nulas o con default); el revert de código las deja inertes. Antes de revertir el estado, mover los tickets en ESPERANDO_CLIENTE a EN_PROCESO. Cada WU se revierte con `git revert`.

## Dependencias

- Calendario laboral y feriados por cliente (ya entregados).
- SMTP por cliente para el mail al solicitante.

## Criterios de éxito

- [ ] Cada viñeta del punto 6 con requerimiento, escenario y test.
- [ ] Un ticket resuelto tarde nunca cuenta "a tiempo"; una semana en espera no cuenta.
- [ ] Gates backend y frontend en verde; `check-roadmap-fresco.mjs` pasa con la viñeta declarada Cumplida o Desviación.
