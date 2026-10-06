# Ticket esperando al cliente — Specification

## Purpose

Definir el estado "Esperando al cliente" (`ESPERANDO_CLIENTE`): sus arcos, la guardia del salto correctivo, la reanudación automática por comentario del solicitante y el aviso por mail al solicitante.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 6 — SLA de primera respuesta y pausa del reloj" (commit `0b3ac5ec`). Las cuatro specs del ciclo (`ticket-esperando-cliente`, `sla-reloj-activo`, `sla-primera-respuesta`, `dashboard-metricas-sla`) cubren las 16 sub-viñetas de esa viñeta. Las exploraciones previas no mandan: donde difieren, gana la decisión (por ejemplo, la regla "no corrimiento si ya estaba vencido" queda rechazada).

## Trazabilidad (las cuatro specs)

| # | Sub-viñeta de la decisión (resumen) | Requerimiento(s) |
|---|---|---|
| 1 | Estado nuevo; entra desde En proceso, sale a En proceso, Resuelto o Cancelado | `ticket-esperando-cliente`: R1 |
| 2 | Reloj detenido en espera; vencimiento corrido por horas hábiles; barrido no marca vencido | `sla-reloj-activo`: R1, R2, R4 |
| 3 | El solicitante comenta y el ticket vuelve a En proceso | `ticket-esperando-cliente`: R3 |
| 4 | Primera respuesta = primer comentario público de alguien que no es el solicitante | `sla-primera-respuesta`: R1 |
| 5 | Meta opcional "Primera respuesta (h)" por prioridad, hábil, sin pausa | `sla-primera-respuesta`: R2, R3 |
| 6 | Primera respuesta vencida: badge y mail al asignado y administradores | `sla-primera-respuesta`: R4 |
| 7 | Existentes no se recalculan; se completa cuándo hubo primera respuesta, sin meta retroactiva | `sla-primera-respuesta`: R5 |
| 8 | Existentes y reloj activo: abiertos se incorporan perezosamente; resueltos/cerrados por fecha de cierre contra vencimiento | `sla-reloj-activo`: R7, R8 |
| 9 | Dashboard: % de primera respuesta y tiempo medio, junto al cumplimiento de resolución | `dashboard-metricas-sla`: R1, R2, R3 |
| 10 | Cumplimiento de resolución por tiempo activo; Cerrado no pisa; sin falso "a tiempo" | `sla-reloj-activo`: R3, R5 |
| 11 | La pausa siempre descuenta, aunque ya esté vencido | `sla-reloj-activo`: R2 |
| 12 | Reapertura por salto correctivo: reloj sigue, sin tiempo extra; última resolución | `sla-reloj-activo`: R6 |
| 13 | Tiempo medio de primera respuesta en horas hábiles | `dashboard-metricas-sla`: R2 |
| 14 | Mail al solicitante al pasar a Esperando al cliente | `ticket-esperando-cliente`: R4 |
| 15 | Salto correctivo no lleva a Esperando; toda salida reanuda el reloj | `ticket-esperando-cliente`: R2; `sla-reloj-activo`: R1 |
| 16 | Preventivos fuera del SLA | `sla-reloj-activo`: R9; `sla-primera-respuesta`: R6; `dashboard-metricas-sla`: R4 |

## Fuera de alcance y desviaciones

- **Fuera de alcance (decisión pendiente del dueño, misma viñeta):** si una reapertura suma tiempo extra a la meta o arranca un reloj nuevo. Motivo: se decide con casos reales; el modelo de tiempo activo admite cualquiera de las dos sin rehacerse. Mientras tanto rige `sla-reloj-activo` R6 (sin tiempo extra).
- **Desviaciones respecto de la decisión:** ninguna.
- **Ayuda:** su escritura está suspendida desde el 2026-09-07. Se anota la deuda en commit y PR (estado nuevo, campo de prioridad, indicadores, regla de pausa) y se corrige todo artículo existente que el cambio deje falso.

## Requirements

### Requirement: R1 Estado y arcos

El sistema DEBE ofrecer en cada cliente (existente o nuevo) el estado "Esperando al cliente" con código `ESPERANDO_CLIENTE`. El estado NO es terminal. Se entra solo desde EN_PROCESO; se sale a EN_PROCESO, RESUELTO o CANCELADO. Ningún otro arco normal entra o sale del estado.

#### Scenario: Arcos permitidos

- GIVEN un ticket en EN_PROCESO
- WHEN se transiciona a ESPERANDO_CLIENTE y luego a RESUELTO, a EN_PROCESO o a CANCELADO (un ticket distinto por cada salida)
- THEN las cuatro transiciones se aceptan

#### Scenario: Arcos no permitidos

- GIVEN un ticket en NUEVO, ASIGNADO o RESUELTO, o uno en ESPERANDO_CLIENTE
- WHEN se intenta el arco normal NUEVO/ASIGNADO/RESUELTO → ESPERANDO_CLIENTE, o ESPERANDO_CLIENTE → NUEVO/ASIGNADO/CERRADO
- THEN el sistema rechaza la transición con error de transición inválida

#### Scenario: Estado disponible en todos los clientes

- GIVEN un cliente existente con la migración aplicada y un cliente recién creado
- WHEN se consulta el catálogo de estados de ambos
- THEN ambos contienen `ESPERANDO_CLIENTE`, exactamente una vez, y reaplicar la migración no lo duplica

### Requirement: R2 Salto correctivo no entra a la espera

El salto correctivo de ROOT o ADMINISTRADOR NO DEBE poder llevar un ticket a ESPERANDO_CLIENTE, ni en backend ni como destino ofrecido en la pantalla. El salto correctivo SÍ DEBE poder sacar un ticket de ESPERANDO_CLIENTE hacia cualquier destino no terminal, y esa salida DEBE reanudar el reloj (ver `sla-reloj-activo` R1).

#### Scenario: Salto hacia la espera rechazado

- GIVEN un ticket en NUEVO, ASIGNADO o RESUELTO y un ROOT o ADMINISTRADOR
- WHEN intenta un salto correctivo a ESPERANDO_CLIENTE
- THEN el sistema lo rechaza y el estado no cambia; la pantalla no lista ese destino entre los correctivos

#### Scenario: Salto desde la espera

- GIVEN un ticket en ESPERANDO_CLIENTE y un ROOT o ADMINISTRADOR
- WHEN salta a ASIGNADO
- THEN el ticket queda en ASIGNADO y su reloj de resolución vuelve a correr

### Requirement: R3 Reanudación automática por comentario del solicitante

Si el **solicitante** del ticket publica un comentario **público** mientras el ticket está en ESPERANDO_CLIENTE, el sistema DEBE pasarlo a EN_PROCESO por el arco normal, dejando una operación de cambio de estado en el historial con el solicitante como autor. Un comentario de cualquier otra persona, o un comentario interno, NO DEBE reanudarlo.

#### Scenario: Comenta el solicitante

- GIVEN un ticket en ESPERANDO_CLIENTE y su solicitante
- WHEN el solicitante agrega un comentario público
- THEN el ticket pasa a EN_PROCESO, el historial registra el cambio con el solicitante como autor y el reloj se reanuda

#### Scenario: Comenta otra persona o es interno

- GIVEN un ticket en ESPERANDO_CLIENTE
- WHEN comenta en público un técnico o un colaborador distinto del solicitante, o el solicitante deja un comentario interno
- THEN el ticket permanece en ESPERANDO_CLIENTE y el reloj sigue detenido

#### Scenario: Ticket que no espera

- GIVEN un ticket en EN_PROCESO
- WHEN su solicitante comenta en público
- THEN no se genera ninguna transición

### Requirement: R4 Mail al solicitante al entrar a la espera

Al pasar un ticket a ESPERANDO_CLIENTE el sistema DEBE enviar un mail al solicitante, con el SMTP del cliente. Un fallo del envío NO DEBE revertir la transición. Si el solicitante es externo, el aviso va a su correo registrado; si no tiene correo, no se envía y se registra el hecho.

#### Scenario: Aviso al solicitante

- GIVEN un ticket en EN_PROCESO con solicitante con correo
- WHEN un técnico lo pasa a ESPERANDO_CLIENTE
- THEN se envía un mail al solicitante y el ticket queda en ESPERANDO_CLIENTE

#### Scenario: Falla el envío

- GIVEN el mismo ticket y un SMTP que falla
- WHEN se pasa a ESPERANDO_CLIENTE
- THEN la transición persiste y el fallo queda registrado sin propagarse

#### Scenario: Otros estados no avisan por este motivo

- GIVEN la transición EN_PROCESO → ESPERANDO_CLIENTE ya avisada
- WHEN el ticket sale de la espera hacia EN_PROCESO
- THEN no se envía el mail de espera
