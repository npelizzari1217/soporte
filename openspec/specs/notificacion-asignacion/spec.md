# Notificación de Asignación — Specification

## Purpose

Definir el aviso por mail al responsable cada vez que le asignan un ticket, ya sea por la regla del tipo o por asignación manual: cuándo se emite el evento, a quién llega, qué pasa sin correo configurado y por qué nunca bloquea la asignación.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 9 — asignación automática por tipo" y su sub-viñeta "Precisiones del 2026-10-09, al explorar". Esta spec cubre D7 y P3. Trazabilidad completa en `reglas-asignacion`.

## Definiciones

- **Evento `ticket.asignado`**: `TicketAsignadoEvent { ticketId, asignadoId, origen: 'REGLA_TIPO' | 'MANUAL', autorId | null }`. Solo IDs, sin datos personales.
- **Cuenta de correo del cliente**: la configuración SMTP del cliente activo, resuelta por el emisor de mails multi-inquilino.
- **Autoasignación**: asignación en la que el actor es el mismo usuario que el responsable.

## Requirements

### Requirement: N1 El evento se publica solo después del commit

El sistema DEBE publicar `ticket.asignado` únicamente tras confirmar la transacción que asigna, mediante el mecanismo de post-commit del ejecutor de transacciones. Si la transacción se revierte, NO DEBE publicarse el evento ni enviarse mail. Los orígenes DEBEN ser: `REGLA_TIPO` desde las tres altas cuando la regla asignó, y `MANUAL` desde `PATCH /asignar` y `PATCH /asignar-en-proceso`.

#### Scenario: Alta con regla

- GIVEN un alta que la regla asigna
- WHEN se confirma la transacción
- THEN se publica `ticket.asignado` con `origen = 'REGLA_TIPO'`

#### Scenario: Asignación manual

- GIVEN una asignación manual válida
- WHEN se confirma
- THEN se publica `ticket.asignado` con `origen = 'MANUAL'` y el `autorId` de quien asigna

#### Scenario: Asignar y poner en proceso

- GIVEN un `asignar-en-proceso` válido
- WHEN se confirma
- THEN se publica `ticket.asignado` una sola vez

#### Scenario: Reversión

- GIVEN una asignación o un alta cuya transacción se revierte
- WHEN termina la operación
- THEN no se publica `ticket.asignado` y no se envía mail

#### Scenario: Preventivo anidado

- GIVEN un preventivo asignado por la regla dentro de la transacción del plan
- WHEN la transacción del plan se confirma
- THEN el evento se publica tras ese commit, y si se revierte no se publica

### Requirement: N2 Mail al responsable en cada asignación

El sistema DEBE enviar un mail al responsable por cada evento `ticket.asignado`, tanto de origen `REGLA_TIPO` como `MANUAL`, desde la cuenta de correo del cliente. El mail DEBE incluir los datos del ticket necesarios para identificarlo (número, título, tipo, prioridad) y un enlace al ticket. La reasignación a otro responsable DEBE avisar al nuevo.

#### Scenario: Asignación por regla

- GIVEN un ticket que nace asignado por la regla
- WHEN se publica el evento
- THEN el responsable recibe un mail con los datos del ticket

#### Scenario: Asignación manual

- GIVEN una asignación manual a un técnico
- WHEN se publica el evento
- THEN el técnico recibe un mail

#### Scenario: Reasignación

- GIVEN un ticket reasignado de A a B
- WHEN se publica el evento
- THEN el mail llega a B

#### Scenario: Cuenta del cliente

- GIVEN un cliente con SMTP configurado
- WHEN se envía el mail
- THEN sale por la cuenta de correo de ese cliente

### Requirement: N3 El mail sale siempre, también en la autoasignación

El sistema NO DEBE omitir el mail cuando el actor es el propio responsable. Cada asignación DEBE avisar al asignado, sin excepción por autoasignación.

#### Scenario: Autoasignación

- GIVEN un técnico que se asigna a sí mismo un ticket
- WHEN se publica el evento
- THEN el técnico recibe el mail

### Requirement: N4 Sin correo configurado, se asigna sin mail

Si el cliente no tiene correo configurado, o la configuración no puede usarse, la asignación DEBE completarse igual y NO DEBE enviarse mail. La omisión DEBE ser silenciosa para el usuario (sin error en la respuesta) y DEBE dejar una línea de log con el motivo, sin datos personales.

#### Scenario: Cliente sin SMTP

- GIVEN un cliente sin configuración de correo
- WHEN se asigna un ticket
- THEN la asignación queda hecha, la respuesta es exitosa y no sale mail

#### Scenario: Alta con regla sin SMTP

- GIVEN un cliente sin correo y un tipo con regla válida
- WHEN se crea un ticket
- THEN nace ASIGNADO y no sale mail

#### Scenario: Registro de la omisión

- GIVEN un cliente sin correo
- WHEN se omite el mail
- THEN el log registra el motivo sin direcciones ni nombres

### Requirement: N5 Un fallo del mail nunca bloquea ni revierte la asignación

El listener DEBE aislar sus errores: si falla cargar el ticket, resolver el contacto o enviar el mail, DEBE registrarlo y terminar sin propagar la excepción. La asignación y el alta ya confirmados NO DEBEN revertirse ni informar error por una falla del correo. Un responsable sin dirección resoluble DEBE omitirse con log.

#### Scenario: Falla el envío

- GIVEN que el emisor de mails lanza una excepción
- WHEN se publica el evento
- THEN la asignación sigue confirmada y la respuesta es exitosa

#### Scenario: Falla al resolver el contacto

- GIVEN que no se puede resolver la dirección del responsable
- WHEN se procesa el evento
- THEN no se envía mail, se registra un log y no se lanza excepción

### Requirement: N6 Contexto del cliente y datos mínimos

El listener DEBE ejecutarse con el contexto del cliente activo en los tres orígenes de ejecución: petición HTTP, formulario público y barrido de preventivos. El evento NO DEBE llevar datos personales; el listener DEBE cargarlos al procesar.

#### Scenario: Formulario público

- GIVEN un ticket del formulario público asignado por la regla
- WHEN se procesa el evento
- THEN el mail sale con la cuenta del cliente correcto

#### Scenario: Barrido de preventivos

- GIVEN un preventivo generado y asignado por la regla durante el barrido
- WHEN se procesa el evento
- THEN el mail sale con la cuenta del cliente del plan

#### Scenario: Evento sin datos personales

- GIVEN un evento publicado
- WHEN se inspecciona su carga
- THEN contiene solo identificadores y el origen

### Requirement: N7 Sin deduplicación entre avisos distintos

El sistema NO DEBE deduplicar el aviso de asignación contra otros avisos. Un preventivo asignado por la regla DEBE avisar al responsable de la regla por `ticket.asignado` aunque el responsable del plan o los administradores reciban además el aviso de preventivo generado.

#### Scenario: Preventivo asignado

- GIVEN un preventivo cuyo responsable de plan coincide con el de la regla
- WHEN se genera el ticket
- THEN esa persona recibe el aviso de preventivo y el de asignación

## Declaración de lo no implementado

Ninguna viñeta cubierta por esta spec queda sin implementar.

## Trazabilidad (esta spec)

| Viñeta | Requerimiento(s) |
|---|---|
| D7 | N1, N2, N4, N5, N6 |
| P3 | N3 |
| Alcance de preventivos (D3 con D7) | N1, N7 |
