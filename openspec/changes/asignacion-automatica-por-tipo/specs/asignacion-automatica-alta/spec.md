# Asignación Automática al Alta — Specification

## Purpose

Definir cómo se aplica la regla de asignación del tipo cuando se crea un ticket: el ticket nace Asignado con su bitácora, o nace Nuevo y sin asignar si no hay regla o la regla no es válida, en los cinco canales de alta, de forma atómica y sin que un problema de configuración impida jamás crear el ticket.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 9 — asignación automática por tipo" y su sub-viñeta "Precisiones del 2026-10-09, al explorar". Esta spec cubre D3, D4, D5 (parte de creación). Trazabilidad completa en `reglas-asignacion`.

## Definiciones

- **Canales de alta**: (1) `POST /tickets`; (2) Soporte con o sin equipo; (3) Edilicia; (4) formulario público con QR; (5) preventivo recurrente. Todos convergen en `CrearTicketUseCase`, `CrearTicketSoporteUseCase` o `CrearTicketEdilicioUseCase`.
- **Autor sistema**: identificador reservado `AUTOR_SISTEMA` (UUID de versión 0, distinto del nil del formulario público y que `gen_random_uuid()` no puede generar).
- **Resolución de la regla**: evaluación, antes de la transacción de alta, de la regla del tipo y de la validez de su responsable.

## Requirements

### Requirement: A1 Con regla válida, el ticket nace Asignado

Cuando el tipo del ticket tiene una regla cuyo responsable es válido, el sistema DEBE crear el ticket en estado ASIGNADO con `asignadoId` igual al responsable de la regla. NO DEBE pasar por NUEVO ni requerir una acción posterior.

#### Scenario: Alta con regla

- GIVEN un tipo con regla a nombre de un técnico válido
- WHEN se crea un ticket de ese tipo
- THEN el ticket queda persistido en ASIGNADO asignado a ese técnico

### Requirement: A2 Sin regla, el ticket nace Nuevo y sin asignar

Cuando el tipo no tiene regla, el sistema DEBE crear el ticket en NUEVO y sin asignar, con la apertura de bitácora de hoy (`null → NUEVO`) y sin operación de asignación.

#### Scenario: Alta sin regla

- GIVEN un tipo sin regla
- WHEN se crea un ticket de ese tipo
- THEN el ticket queda en NUEVO, `asignadoId` es nulo y no hay operación ASIGNACION

### Requirement: A3 La bitácora registra la asignación del sistema por la regla del tipo

Cuando la regla asigna, el sistema DEBE registrar, en la misma transacción: (a) la operación de apertura `CAMBIO_ESTADO` con estado anterior nulo y estado nuevo ASIGNADO, con el autor habitual del canal; y (b) una operación `ASIGNACION` cuyo autor es `AUTOR_SISTEMA`, con `descripcion` en texto fijo y descriptivo que indique que el sistema asignó por la regla del tipo, y `metadata` con `origen = 'REGLA_TIPO'`, `asignadoId` y `tipoId`. Como la línea de tiempo muestra solo la descripción, el texto DEBE bastar por sí solo para entender el hecho. La bitácora NO DEBE atribuir la asignación a una persona.

#### Scenario: Operaciones al nacer

- GIVEN un tipo con regla válida
- WHEN se crea un ticket
- THEN la bitácora tiene la apertura `null → ASIGNADO` y una operación ASIGNACION de `AUTOR_SISTEMA` con `metadata.origen = 'REGLA_TIPO'`

#### Scenario: Texto visible en la línea de tiempo

- GIVEN el ticket nacido por regla
- WHEN se abre su línea de tiempo
- THEN la entrada de asignación muestra un texto que dice que lo asignó el sistema por la regla del tipo

#### Scenario: Sin autoría humana

- GIVEN el ticket nacido por regla creado por un usuario concreto
- WHEN se inspecciona la operación ASIGNACION
- THEN su autor es `AUTOR_SISTEMA` y no el usuario que creó el ticket

### Requirement: A4 Un responsable inválido degrada a Nuevo sin asignar; la creación nunca falla

Si el responsable de la regla no es válido para el tipo al crear el ticket, el sistema DEBE crear el ticket igualmente en NUEVO y sin asignar, sin operación de asignación y sin devolver error al solicitante. Es inválido el responsable que está dado de baja, que no tiene membresía activa en el cliente o que no tiene el módulo del tipo (incluido ADMINISTRADOR, que no es elegible). Un fallo de las consultas al maestro durante la resolución DEBE tratarse como regla no resoluble: el ticket nace en NUEVO y el fallo se registra en el log sin datos personales. Un problema de configuración NUNCA DEBE impedir crear el ticket.

#### Scenario: Responsable dado de baja

- GIVEN una regla cuyo responsable fue desactivado
- WHEN se crea un ticket del tipo
- THEN el ticket se crea en NUEVO, sin asignar, y la respuesta es exitosa

#### Scenario: Responsable sin membresía

- GIVEN una regla cuyo responsable ya no tiene membresía activa en el cliente
- WHEN se crea un ticket del tipo
- THEN el ticket se crea en NUEVO, sin asignar

#### Scenario: Responsable sin el módulo del tipo

- GIVEN una regla cuyo responsable perdió el módulo del tipo
- WHEN se crea un ticket del tipo
- THEN el ticket se crea en NUEVO, sin asignar

#### Scenario: Falla la consulta al maestro

- GIVEN que la consulta de elegibilidad en la base maestra lanza una excepción
- WHEN se crea un ticket de un tipo con regla
- THEN el ticket se crea en NUEVO, sin asignar, y se registra una línea de log sin datos personales

#### Scenario: Sin evento de asignación

- GIVEN un ticket que degradó a NUEVO por regla inválida
- WHEN se confirma la transacción
- THEN no se publica `ticket.asignado`

### Requirement: A5 Regla eliminada: se vuelve al comportamiento previo

Si la regla de un tipo se elimina (fila vacía en la pantalla), los tickets creados desde ese momento DEBEN nacer en NUEVO y sin asignar. Los tickets creados antes NO DEBEN modificarse.

#### Scenario: Regla eliminada

- GIVEN un tipo cuya regla se eliminó
- WHEN se crea un ticket de ese tipo
- THEN nace en NUEVO y sin asignar

#### Scenario: Tickets previos intactos

- GIVEN un ticket nacido ASIGNADO por la regla antes de eliminarla
- WHEN se elimina la regla
- THEN el ticket conserva su estado y su responsable

### Requirement: A6 La regla aplica en los cinco canales de alta

El sistema DEBE aplicar la regla del tipo en los cinco canales. Cada canal DEBE cumplir A1 a A4 con su tipo propio y su autor habitual en la apertura.

#### Scenario: Alta normal

- GIVEN un tipo con regla válida
- WHEN se crea un ticket por `POST /tickets`
- THEN nace ASIGNADO al responsable de la regla

#### Scenario: Soporte con equipo

- GIVEN el tipo SOPORTE con regla válida
- WHEN se crea un ticket de Soporte vinculado a un equipo
- THEN nace ASIGNADO al responsable de la regla y conserva el vínculo con el equipo

#### Scenario: Soporte sin equipo

- GIVEN el tipo SOPORTE con regla válida
- WHEN se crea un ticket de Soporte sin equipo
- THEN nace ASIGNADO al responsable de la regla

#### Scenario: Edilicia

- GIVEN el tipo EDILICIA con regla válida
- WHEN se crea un ticket edilicio
- THEN nace ASIGNADO al responsable de la regla y se crea su detalle edilicio

#### Scenario: Formulario público con QR

- GIVEN el tipo del pedido público con regla válida
- WHEN se confirma un pedido del formulario público o del QR
- THEN el ticket nace ASIGNADO al responsable, la apertura conserva el autor `AUTOR_FORMULARIO_PUBLICO` y la operación ASIGNACION lleva `AUTOR_SISTEMA`

#### Scenario: Preventivo recurrente

- GIVEN el tipo PREVENTIVO con regla válida y un plan vencido
- WHEN corre la generación de preventivos
- THEN el ticket generado nace ASIGNADO al responsable de la regla

#### Scenario: Canal sin regla

- GIVEN un tipo sin regla
- WHEN se crea un ticket por cualquiera de los cinco canales
- THEN nace en NUEVO y sin asignar

### Requirement: A7 La asignación es atómica con el alta

Ticket, apertura de bitácora y operación ASIGNACION DEBEN persistirse en la misma transacción. Si la transacción se revierte, NO DEBE quedar ticket, ni operación, ni evento publicado. La resolución de la regla DEBE ocurrir antes de abrir la transacción para no alargar la ventana del bloqueo de numeración. En el canal preventivo, la asignación DEBE ocurrir dentro de la transacción por plan y su reversión DEBE deshacer también la asignación; un fallo de las consultas de resolución NO DEBE abortar la transacción por plan.

#### Scenario: Reversión del alta

- GIVEN un alta con regla válida cuya transacción falla tras guardar el ticket
- WHEN se revierte
- THEN no queda ticket ni operaciones y no se publica `ticket.creado` ni `ticket.asignado`

#### Scenario: Preventivo anidado

- GIVEN la generación de un preventivo con regla válida que falla luego dentro de la transacción del plan
- WHEN se revierte la transacción del plan
- THEN no queda ticket generado ni asignación, y el plan queda como antes

#### Scenario: Fallo de resolución en preventivo

- GIVEN que la consulta maestra de elegibilidad falla durante la generación de un preventivo
- WHEN corre el plan
- THEN el ticket se genera en NUEVO, sin asignar, y la transacción del plan no se aborta

### Requirement: A8 El resto del alta no cambia

Numeración, ciclo activo, validaciones previas, evento `ticket.creado` y aplicación del SLA DEBEN comportarse igual que antes, salvo el estado inicial y el responsable. `ticket.creado` DEBE seguir publicándose una sola vez, después del commit.

#### Scenario: Evento de creación

- GIVEN un alta con regla válida
- WHEN se confirma la transacción
- THEN se publica `ticket.creado` una vez y el SLA se aplica como siempre

### Requirement: A9 La asignación al alta no altera el SLA

Nacer en ASIGNADO NO DEBE modificar el reloj del SLA ni registrar primera respuesta. NUEVO y ASIGNADO DEBEN seguir contando para el reloj. La primera respuesta DEBE seguir registrándose solo por un comentario público de alguien distinto del solicitante.

#### Scenario: Reloj en marcha

- GIVEN un ticket nacido ASIGNADO por la regla
- WHEN se consulta su SLA
- THEN el reloj corre desde la creación igual que en un ticket NUEVO

#### Scenario: Sin primera respuesta por asignar

- GIVEN un ticket nacido ASIGNADO por la regla sin comentarios
- WHEN se consulta su primera respuesta
- THEN no está registrada

#### Scenario: Primera respuesta por comentario

- GIVEN un ticket nacido ASIGNADO
- WHEN el técnico asignado publica un comentario público
- THEN se registra la primera respuesta

## Declaración de lo no implementado

Ninguna viñeta cubierta por esta spec queda sin implementar. Trazabilidad completa del cambio en `reglas-asignacion`.

## Trazabilidad (esta spec)

| Viñeta | Requerimiento(s) |
|---|---|
| D3 | A6 |
| D4 | A1, A2, A3, A6, A7, A8 |
| D5 (alta) | A4, A5 |
| X1 (SLA) | A9 |
