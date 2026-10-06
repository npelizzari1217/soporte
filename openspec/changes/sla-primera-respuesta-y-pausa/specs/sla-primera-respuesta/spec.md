# SLA de primera respuesta — Specification

## Purpose

Definir qué es la primera respuesta, su meta opcional por prioridad, su registro, su vencimiento con aviso y el relleno de la fecha para tickets existentes.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 6 — SLA de primera respuesta y pausa del reloj", sub-viñetas de primera respuesta y de tickets existentes (ver tabla de trazabilidad en `ticket-esperando-cliente`).

## Requirements

### Requirement: R1 Definición y registro de la primera respuesta

La primera respuesta DEBE ser el primer comentario **público** de alguien distinto del solicitante. Para un ticket de solicitante externo (sin usuario solicitante), cuenta el primer comentario público de cualquier autor interno. NO cuentan: comentarios internos, comentarios borrados, comentarios del propio solicitante, asignaciones, cambios de estado ni adjuntos. El sistema DEBE registrar solo la primera, una única vez, aun con comentarios concurrentes.

#### Scenario: Primera respuesta válida

- GIVEN un ticket sin primera respuesta
- WHEN un técnico agrega un comentario público
- THEN la fecha de primera respuesta es la de ese comentario

#### Scenario: Eventos que no cuentan

- GIVEN un ticket sin primera respuesta
- WHEN ocurren un comentario interno de un técnico, un comentario público del solicitante, una asignación y un cambio de estado
- THEN el ticket sigue sin primera respuesta

#### Scenario: Solicitante externo

- GIVEN un ticket con solicitante externo
- WHEN un usuario interno agrega un comentario público
- THEN se registra la primera respuesta

#### Scenario: Segundo comentario o concurrencia

- GIVEN un ticket con primera respuesta registrada, o dos comentarios públicos simultáneos
- WHEN se agrega otro comentario público
- THEN la fecha registrada no cambia y es la del primero

### Requirement: R2 Meta opcional por prioridad

Cada prioridad DEBE admitir una meta opcional "Primera respuesta (h)", en horas hábiles. Vacía significa sin meta. Si se informa, DEBE ser un número mayor que cero. El valor NO se recalcula en tickets existentes, y las prioridades existentes quedan sin meta.

#### Scenario: Meta válida y vacía

- GIVEN el formulario de una prioridad
- WHEN se guarda "Primera respuesta (h)" con 4, y luego vacío
- THEN el primero guarda 4 h y el segundo guarda sin meta

#### Scenario: Meta inválida

- GIVEN el formulario de una prioridad
- WHEN se intenta guardar 0 o un valor negativo
- THEN el sistema lo rechaza, tanto en la API como en la base

#### Scenario: Prioridades existentes

- GIVEN prioridades anteriores al cambio
- WHEN se aplica la migración
- THEN todas quedan sin meta de primera respuesta

### Requirement: R3 Vencimiento hábil sin pausa

Al crear un ticket cuya prioridad tiene meta, el sistema DEBE fijar el vencimiento de primera respuesta sumando esas horas hábiles, con el calendario del cliente, desde la creación. El vencimiento NO se pausa: ESPERANDO_CLIENTE no lo detiene. Al repriorizar, DEBE recalcularse solo mientras el ticket aún no tiene primera respuesta; con respuesta registrada queda histórico.

#### Scenario: Cálculo hábil

- GIVEN meta de 2 h hábiles y un ticket creado el viernes a 17:30 con cierre a 18:00
- WHEN se crea el ticket
- THEN el vencimiento cae el siguiente día hábil 1 h 30 min después de la apertura

#### Scenario: Sin pausa

- GIVEN un ticket sin primera respuesta que entra a ESPERANDO_CLIENTE
- WHEN transcurre el tiempo de la meta
- THEN el vencimiento de primera respuesta no se corre

#### Scenario: Repriorización

- GIVEN un ticket sin respuesta, y otro ya respondido
- WHEN se repriorizan a una prioridad con otra meta
- THEN el vencimiento del primero se recalcula y el del segundo queda igual

### Requirement: R4 Vencimiento con badge y mail deduplicado

Si un ticket sin primera respuesta supera su vencimiento, el sistema DEBE mostrarlo con un badge de "primera respuesta vencida" y enviar un mail al asignado y a los administradores, una sola vez por ticket, con el mismo criterio que el vencimiento de resolución. También cuenta como vencida una respuesta posterior al vencimiento. El barrido NO DEBE excluir tickets en ESPERANDO_CLIENTE.

#### Scenario: Vence sin respuesta

- GIVEN un ticket asignado con vencimiento pasado y sin primera respuesta
- WHEN corre el barrido dos veces
- THEN se envía un solo mail al asignado y a cada administrador (sin repetir si un administrador es el asignado) y el ticket muestra el badge

#### Scenario: En espera igual vence

- GIVEN un ticket en ESPERANDO_CLIENTE sin primera respuesta y con vencimiento pasado
- WHEN corre el barrido
- THEN se notifica y se marca

#### Scenario: Aislamiento de fallos

- GIVEN un destinatario cuyo envío falla
- WHEN se notifica
- THEN los demás destinatarios igual reciben el mail

#### Scenario: Ya respondido o cerrado

- GIVEN un ticket con primera respuesta registrada, o en RESUELTO, CERRADO o CANCELADO
- WHEN corre el barrido
- THEN no se marca ni se notifica

### Requirement: R5 Tickets existentes: relleno de la fecha, sin meta retroactiva

La migración DEBE completar la fecha de primera respuesta de los tickets existentes desde su historial, tomando el primer comentario público no borrado de alguien distinto del solicitante (cualquier autor interno si es externo). NO DEBE asignar meta ni vencimiento retroactivos, ni recalcular los existentes. Debe ser idempotente.

#### Scenario: Relleno desde el historial

- GIVEN un ticket previo con un comentario interno, uno público borrado y luego uno público de un técnico
- WHEN se aplica la migración
- THEN su fecha de primera respuesta es la del comentario público del técnico

#### Scenario: Sin meta retroactiva

- GIVEN un ticket previo con prioridad que ahora tiene meta
- WHEN se aplica la migración
- THEN no tiene vencimiento de primera respuesta y no entra en el cumplimiento

#### Scenario: Idempotencia

- GIVEN la migración ya aplicada y un ticket con fecha registrada
- WHEN se reaplica el relleno
- THEN ninguna fecha cambia

### Requirement: R6 Preventivos y estados sin meta

Los preventivos y los tickets de prioridad sin meta NO DEBEN tener vencimiento de primera respuesta, badge ni mail.

#### Scenario: Preventivo

- GIVEN un ticket preventivo con una prioridad que tiene meta
- WHEN se crea
- THEN no tiene vencimiento de primera respuesta
