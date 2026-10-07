# SLA de resolución por reloj activo — Specification

## Purpose

Definir el reloj de resolución medido por **tiempo activo**: cuándo corre, cómo se deriva el vencimiento, cuándo marca vencido el barrido, cómo se fija el cumplimiento y cómo entran los tickets existentes.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 6 — SLA de primera respuesta y pausa del reloj", sub-viñetas de reloj, cumplimiento, pausa, reapertura y tickets existentes (ver tabla de trazabilidad en `ticket-esperando-cliente`).

## Definiciones

- **Reloj corriendo**: ticket en NUEVO, ASIGNADO o EN_PROCESO. **Detenido**: ESPERANDO_CLIENTE y RESUELTO. Los terminales (CERRADO, CANCELADO) no corren.
- **Acumulado activo**: horas hábiles (tiempo de pared para la cohorte `CORRIDO`) con el reloj corriendo, sumadas desde la creación.
- **Calendario**: el horario y los feriados del cliente.

## Requirements

### Requirement: R1 Qué detiene y qué reanuda el reloj

El sistema DEBE detener el reloj al entrar a ESPERANDO_CLIENTE o a RESUELTO, sumando al acumulado el tramo activo recién cerrado. DEBE reanudarlo en **toda** salida de ESPERANDO_CLIENTE (arco normal, comentario del solicitante o salto correctivo) y en toda reapertura desde RESUELTO.

#### Scenario: Entrar a la espera detiene

- GIVEN un ticket en EN_PROCESO con 3 h hábiles activas
- WHEN pasa a ESPERANDO_CLIENTE
- THEN su acumulado es 3 h y el reloj queda detenido

#### Scenario: Toda salida reanuda

- GIVEN un ticket en ESPERANDO_CLIENTE
- WHEN sale por arco a EN_PROCESO, por comentario del solicitante, o por salto correctivo a NUEVO o ASIGNADO
- THEN en los tres casos el reloj vuelve a correr desde ese instante

### Requirement: R2 Vencimiento derivado y pausa que siempre descuenta

Al reanudar, el sistema DEBE derivar el vencimiento sumando, desde el instante de reanudación, las horas hábiles que faltan (meta menos acumulado) con el calendario vigente en ese momento. El tiempo detenido NUNCA cuenta, **aunque el ticket haya entrado a la espera con el SLA ya vencido**: no existe la excepción "si ya estaba vencido no se corre".

#### Scenario: Pausa que corre el vencimiento

- GIVEN un ticket con meta de 8 h hábiles y 3 h activas, que espera 2 días hábiles
- WHEN el cliente responde y el ticket vuelve a EN_PROCESO
- THEN el vencimiento queda 5 h hábiles después de la reanudación

#### Scenario: Pausa con SLA ya vencido

- GIVEN un ticket cuyo vencimiento ya pasó y que entra a ESPERANDO_CLIENTE (marcado o no por el barrido)
- WHEN pasa una semana y vuelve a EN_PROCESO
- THEN esa semana no suma al acumulado y el vencimiento se deriva de lo que faltaba al entrar a la espera

#### Scenario: Calendario editado durante la pausa

- GIVEN un ticket en espera y un cambio de horario o feriados del cliente durante la pausa
- WHEN el ticket se reanuda
- THEN el vencimiento usa el calendario vigente al reanudar

#### Scenario: Reprioritizar conserva lo acumulado

- GIVEN un ticket con 3 h activas acumuladas
- WHEN se cambia su prioridad a una con meta de 4 h
- THEN el vencimiento se recalcula con el acumulado conservado (queda 1 h hábil por correr), sin perder las pausas anteriores

### Requirement: R3 Cumplimiento fijado en cada resolución

Al pasar a RESUELTO el sistema DEBE fijar el cumplimiento: cumplió si el acumulado activo es menor o igual a la meta del ticket. La meta es la de su prioridad, fijada al crear el ticket o al repriorizarlo; editar después las horas de una prioridad NO afecta a los tickets existentes. Para un ticket previo al cambio, la meta es el tiempo hábil entre su creación y su vencimiento. Cada resolución posterior (tras una reapertura) DEBE reescribirlo: gana la última. El cumplimiento NO depende de la marca del barrido, de la fecha de cierre ni de pasar a CERRADO.

#### Scenario: Resuelto a tiempo tras una semana de espera

- GIVEN meta de 8 h, 5 h activas y 7 días en ESPERANDO_CLIENTE
- WHEN se pasa a RESUELTO
- THEN el ticket cumplió

#### Scenario: Editar la prioridad no cambia la meta de un ticket existente

- GIVEN un ticket creado con una prioridad de meta 8 h
- WHEN un administrador cambia la meta de esa prioridad a 4 h y después el ticket se resuelve con 6 h activas
- THEN el ticket cumplió, porque su meta sigue siendo 8 h

#### Scenario: Resuelto tarde antes del barrido

- GIVEN un ticket con 9 h activas sobre una meta de 8 h, que el barrido aún no marcó
- WHEN se resuelve
- THEN el cumplimiento queda en "no cumplió" de inmediato

#### Scenario: Cierre administrativo tardío

- GIVEN un ticket que cumplió al resolverse
- WHEN pasa a CERRADO una semana después
- THEN su cumplimiento no cambia

### Requirement: R4 El barrido marca vencido solo con reloj corriendo

El barrido DEBE marcar vencido únicamente a tickets con el reloj corriendo y vencimiento anterior al instante actual. Un ticket en ESPERANDO_CLIENTE o RESUELTO NO DEBE vencer, y el barrido sigue comparando solo el vencimiento contra el ahora. Una marca de vencido ya puesta permanece frente al barrido; una repriorización que deja el vencimiento en el futuro la rearma.

#### Scenario: Ticket en espera

- GIVEN un ticket en ESPERANDO_CLIENTE cuyo vencimiento anterior ya pasó y sin marca
- WHEN corre el barrido
- THEN no se marca vencido ni se envía mail

#### Scenario: Ticket corriendo

- GIVEN un ticket en EN_PROCESO con vencimiento pasado y sin marca
- WHEN corre el barrido
- THEN se marca vencido y se notifica una sola vez

#### Scenario: Huérfano de pausa

- GIVEN un ticket que salió de la espera pero conserva el reloj sin reanudar (falló el procesamiento posterior)
- WHEN corre el barrido
- THEN el barrido reconcilia el reloj antes de evaluar el vencimiento

#### Scenario: Repriorizar rearma el aviso

- GIVEN un ticket con el reloj corriendo ya marcado vencido (mail enviado)
- WHEN se repriorizó y su vencimiento nuevo queda en el futuro
- THEN la marca se baja, y cuando el vencimiento nuevo pasa el barrido lo marca y envía un mail más

#### Scenario: Repriorizar sin salir del vencimiento

- GIVEN un ticket con el reloj corriendo ya marcado vencido (mail enviado)
- WHEN se repriorizó y su vencimiento nuevo sigue en el pasado
- THEN la marca permanece y no se envía otro mail

### Requirement: R5 Estado SLA derivado

El estado SLA mostrado de un ticket DEBE derivarse del reloj y del cumplimiento, no solo de la marca del barrido: "en pausa" si está en ESPERANDO_CLIENTE; "vencido" si venció o cumplió "no"; "al día" en otro caso.

#### Scenario: Resuelto tarde

- GIVEN un ticket resuelto con cumplimiento "no cumplió" y sin marca del barrido
- WHEN se consulta el ticket
- THEN el estado SLA es "vencido"

#### Scenario: En espera

- GIVEN un ticket en ESPERANDO_CLIENTE
- WHEN se consulta el ticket
- THEN el estado SLA es "en pausa" y no se muestra una fecha de vencimiento como vigente

### Requirement: R6 Reapertura por salto correctivo

Si un ticket RESUELTO se reabre con salto correctivo, el reloj DEBE seguir sumando desde el acumulado con el que quedó, sin tiempo extra y sin reloj nuevo. El cumplimiento se evalúa con la última resolución. (La alternativa de tiempo extra o reloj nuevo es decisión pendiente, fuera de alcance.)

#### Scenario: Reabrir y volver a resolver

- GIVEN meta de 8 h, un ticket resuelto con 7 h activas (cumplió) y reabierto a EN_PROCESO
- WHEN trabaja 2 h más y se resuelve de nuevo
- THEN el acumulado es 9 h y el cumplimiento pasa a "no cumplió"

#### Scenario: Tiempo en RESUELTO no cuenta

- GIVEN el mismo ticket resuelto durante 3 días hábiles antes de reabrirse
- WHEN se reabre
- THEN esos 3 días no suman al acumulado

### Requirement: R7 Tickets abiertos existentes se incorporan perezosamente

Un ticket abierto anterior al cambio DEBE incorporarse al reloj activo la primera vez que hace falta (al entrar a la espera, al repriorizar o al resolverse), con todo el tiempo activo desde su creación como acumulado inicial. En ese momento su vencimiento actual NO se toca, salvo en el recálculo que ya implique una repriorización. La migración NO recalcula tickets.

#### Scenario: Primera pausa de un ticket previo

- GIVEN un ticket abierto creado antes del cambio, sin acumulado, con vencimiento V
- WHEN pasa a ESPERANDO_CLIENTE
- THEN su acumulado es el tiempo activo desde su creación y V no cambia

#### Scenario: Sin recálculo masivo

- GIVEN tickets abiertos anteriores al cambio
- WHEN se aplica la migración
- THEN ningún vencimiento ni cumplimiento existente cambia

### Requirement: R8 Tickets resueltos o cerrados previos

Un ticket resuelto o cerrado antes del cambio, sin cumplimiento fijado, DEBE contar en las métricas por el criterio corregido: **fecha de cierre menor o igual al vencimiento**, y no por la marca del barrido.

#### Scenario: Cierre antes y después del vencimiento

- GIVEN dos tickets cerrados previos con vencimiento V: uno con fecha de cierre anterior a V, otro posterior pero sin marca de vencido
- WHEN se calculan las métricas
- THEN el primero cumplió y el segundo no

### Requirement: R9 Cohorte de reglas y preventivos

Un ticket de la cohorte `CORRIDO` DEBE medir su tiempo activo y sus pausas en tiempo de pared (24/7). Los preventivos (y tickets sin meta de resolución) NO DEBEN tener reloj, vencimiento, cumplimiento ni marca de vencido.

#### Scenario: Pausa en cohorte CORRIDO

- GIVEN un ticket `CORRIDO` con meta de 24 h y 10 h activas, que espera un fin de semana completo (48 h de pared)
- WHEN se reanuda
- THEN el vencimiento queda 14 h de pared después de la reanudación

#### Scenario: Preventivo

- GIVEN un ticket preventivo
- WHEN pasa por ESPERANDO_CLIENTE y RESUELTO
- THEN no se calcula vencimiento ni cumplimiento
