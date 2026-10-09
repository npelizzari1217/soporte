# Asignación Manual de Tickets — Specification

## Purpose

Definir la asignación manual de un ticket: se puede reasignar hasta que se cierra, un ticket cerrado no se reasigna, asignar un ticket Nuevo lo pasa a Asignado y la interfaz ofrece reasignar en todos los estados abiertos.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 9 — asignación automática por tipo" y su sub-viñeta "Precisiones del 2026-10-09, al explorar". Esta spec cubre D6, P2, P4. Trazabilidad completa en `reglas-asignacion`.

## Definiciones

- **Estados finales**: CERRADO y CANCELADO (`ESTADOS_TERMINALES`). RESUELTO no es final.
- **Asignación manual**: `PATCH /tickets/:id/asignar` y `PATCH /tickets/:id/asignar-en-proceso`.
- **Elegibilidad manual**: la que ya existe (usuario activo en el cliente y con el módulo del tipo); este cambio no la modifica.

## Requirements

### Requirement: M1 Un ticket cerrado no se reasigna

El sistema DEBE rechazar con 422 y un error de dominio propio (`TicketCerradoNoReasignableError`) toda asignación manual de un ticket en CERRADO o CANCELADO, en ambos endpoints. El rechazo NO DEBE modificar el ticket, NO DEBE crear operaciones y NO DEBE publicar `ticket.asignado`.

#### Scenario: Ticket cerrado

- GIVEN un ticket en CERRADO
- WHEN se invoca `PATCH /tickets/:id/asignar`
- THEN responde 422 y el responsable no cambia

#### Scenario: Ticket cancelado

- GIVEN un ticket en CANCELADO
- WHEN se invoca `PATCH /tickets/:id/asignar`
- THEN responde 422 y el responsable no cambia

#### Scenario: Asignar y poner en proceso un ticket cerrado

- GIVEN un ticket en CERRADO o CANCELADO
- WHEN se invoca `PATCH /tickets/:id/asignar-en-proceso`
- THEN responde 422 y no se crea ninguna operación

#### Scenario: Rechazo sin efectos

- GIVEN un ticket cerrado
- WHEN se rechaza la asignación
- THEN no hay operación nueva en la bitácora ni evento publicado

### Requirement: M2 Hasta el cierre, el responsable se puede reasignar

El sistema DEBE permitir la asignación manual en NUEVO, ASIGNADO, EN_PROCESO, ESPERANDO_CLIENTE y RESUELTO. RESUELTO NO DEBE considerarse cerrado a este efecto. Cada reasignación DEBE registrar una operación ASIGNACION y conservar la elegibilidad vigente.

#### Scenario: Ticket en proceso

- GIVEN un ticket en EN_PROCESO asignado a A
- WHEN se reasigna a un técnico elegible B
- THEN el responsable pasa a B, el estado sigue en EN_PROCESO y se registra una operación ASIGNACION

#### Scenario: Ticket en espera del cliente

- GIVEN un ticket en ESPERANDO_CLIENTE
- WHEN se reasigna a un técnico elegible
- THEN se acepta y el estado no cambia

#### Scenario: Ticket resuelto

- GIVEN un ticket en RESUELTO
- WHEN se reasigna a un técnico elegible
- THEN se acepta y el estado sigue en RESUELTO

#### Scenario: Destinatario no elegible

- GIVEN un usuario sin el módulo del tipo
- WHEN se intenta asignarle un ticket abierto
- THEN se rechaza como hoy y el ticket no cambia

### Requirement: M3 Asignar a mano un ticket Nuevo lo pasa a Asignado

Cuando una asignación manual recae sobre un ticket en NUEVO, el sistema DEBE moverlo a ASIGNADO en la misma transacción y DEBE registrar la operación ASIGNACION y la operación `CAMBIO_ESTADO NUEVO → ASIGNADO`. Este comportamiento DEBE valer en `PATCH /asignar`; en `PATCH /asignar-en-proceso` DEBE conservarse el recorrido actual `NUEVO → ASIGNADO → EN_PROCESO`. Asignar un ticket que ya no está en NUEVO NO DEBE cambiar su estado en `PATCH /asignar`. El cambio NUEVO → ASIGNADO NO DEBE modificar el reloj del SLA.

#### Scenario: Asignar un ticket Nuevo

- GIVEN un ticket en NUEVO
- WHEN se invoca `PATCH /tickets/:id/asignar`
- THEN el ticket queda en ASIGNADO con el responsable elegido y la bitácora tiene la ASIGNACION y el CAMBIO_ESTADO

#### Scenario: Asignar y poner en proceso un ticket Nuevo

- GIVEN un ticket en NUEVO
- WHEN se invoca `PATCH /tickets/:id/asignar-en-proceso`
- THEN el ticket queda en EN_PROCESO tras pasar por ASIGNADO, como hoy

#### Scenario: Reasignar un ticket Asignado

- GIVEN un ticket en ASIGNADO
- WHEN se invoca `PATCH /tickets/:id/asignar`
- THEN el estado sigue en ASIGNADO

#### Scenario: Reloj del SLA

- GIVEN un ticket en NUEVO con el reloj en marcha
- WHEN se asigna a mano y pasa a ASIGNADO
- THEN el reloj sigue en marcha sin pausa ni reinicio

### Requirement: M4 La interfaz permite reasignar hasta el cierre

La vista de detalle del ticket DEBE ofrecer un control de reasignación en EN_PROCESO, ESPERANDO_CLIENTE y RESUELTO, que use `PATCH /tickets/:id/asignar` y la lista de asignables existente (`GET /tickets/:id/asignables`). En NUEVO y ASIGNADO DEBE seguir el control unificado de asignar y poner en proceso. En CERRADO y CANCELADO NO DEBE mostrarse ningún control de asignación.

#### Scenario: En proceso

- GIVEN un ticket en EN_PROCESO y un usuario con permiso de asignar
- WHEN abre el detalle
- THEN ve el control de reasignación

#### Scenario: Esperando cliente

- GIVEN un ticket en ESPERANDO_CLIENTE
- WHEN un usuario con permiso abre el detalle
- THEN ve el control de reasignación

#### Scenario: Resuelto

- GIVEN un ticket en RESUELTO
- WHEN un usuario con permiso abre el detalle
- THEN ve el control de reasignación

#### Scenario: Cerrado o cancelado

- GIVEN un ticket en CERRADO o CANCELADO
- WHEN se abre el detalle
- THEN no hay control de asignación

#### Scenario: Nuevo o asignado

- GIVEN un ticket en NUEVO o ASIGNADO
- WHEN se abre el detalle
- THEN se muestra el control unificado y no el de reasignación simple

#### Scenario: Usuario sin permiso

- GIVEN un usuario sin permiso de asignar
- WHEN abre el detalle de un ticket abierto
- THEN no ve ningún control de asignación

### Requirement: M5 Un ticket nacido por regla se reasigna como cualquier otro

El responsable puesto por la regla del tipo DEBE poder reasignarse a mano mientras el ticket no esté en un estado final. La reasignación DEBE registrar la operación ASIGNACION de quien reasigna y NO DEBE alterar la operación original del sistema.

#### Scenario: Reasignación del ticket automático

- GIVEN un ticket nacido ASIGNADO por la regla
- WHEN un técnico con permiso lo reasigna a otro elegible
- THEN el responsable cambia, la bitácora conserva la ASIGNACION de `AUTOR_SISTEMA` y suma la del usuario

### Requirement: M6 Los comentarios sobre "el sistema nunca auto-asigna" se corrigen

El código DEBE dejar de afirmar que el sistema nunca auto-asigna. Los comentarios de invariante en `tickets.controller.ts` y en `asignar-ticket.use-case.ts` DEBEN reflejar que el sistema asigna por la regla del tipo al crear y que la asignación manual exige un ticket no final.

#### Scenario: Comentarios vigentes

- GIVEN el código entregado
- WHEN se busca la afirmación de que el sistema nunca auto-asigna
- THEN no aparece en los archivos señalados

## Declaración de lo no implementado

Ninguna viñeta cubierta por esta spec queda sin implementar.

## Trazabilidad (esta spec)

| Viñeta | Requerimiento(s) |
|---|---|
| D6 | M1, M2, M4, M5 |
| P2 | M1, M2, M4 |
| P4 | M3 |
| X1 (SLA) | M3 |
| X2 (comentarios) | M6 |
