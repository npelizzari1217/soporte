# Pedido Público — Delta Specification

## Purpose

Definir el alta pública de un pedido: la verificación por link de un solo uso, el ticket resultante (NUEVO, SOPORTE, MEDIA), los límites anti-abuso, el aislamiento del tenant y la respuesta 404 uniforme.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Segunda etapa — brechas frente a la competencia" → "### Decisiones de producto de la segunda etapa" → "Segunda etapa, punto 1 — formulario público + QR". Cubre D1, D3 (rama con sesión), D4, D6, D9 y D10, más los requerimientos transversales de seguridad. Las viñetas D2, D5 y D11 están en `solicitante-externo`; D7 y D12 en `formulario-publico-cliente`; D8 en `equipos-qr`.

## ADDED Requirements

### Requirement: El ticket se crea al confirmar un link de un solo uso (D1)

Cualquiera PUEDE pedir cuando el correo del cliente está en estado `LISTO`. El pedido NO DEBE crear ticket al enviarse: DEBE guardar un token de verificación en master (solo su hash sha256, con vencimiento, `usedAt`, `revokedAt`) y enviar un link por mail por el SMTP del cliente. El ticket se crea únicamente cuando el link se confirma, una sola vez. Un token usado, vencido o revocado DEBE responder 404 uniforme y NO DEBE crear ticket. La confirmación repetida o concurrente DEBE crear a lo sumo un ticket.

#### Scenario: Envío del pedido

- GIVEN un cliente habilitado con correo `LISTO`
- WHEN un visitante envía el formulario con nombre, email y descripción válidos
- THEN no se crea ticket, se guarda el token de verificación (solo hash) y se envía el mail con el link

#### Scenario: Confirmación del link

- GIVEN un link de verificación vigente
- WHEN el visitante lo confirma
- THEN se crea exactamente un ticket y el token queda usado

#### Scenario: Link reutilizado, vencido o revocado

- GIVEN un link ya usado, vencido o revocado
- WHEN se confirma
- THEN responde 404 uniforme y no se crea ticket

#### Scenario: Doble confirmación concurrente

- GIVEN un link vigente confirmado dos veces a la vez
- WHEN ambas solicitudes se procesan
- THEN existe un solo ticket

#### Scenario: Token en claro

- GIVEN un pedido enviado
- WHEN se inspecciona la base master
- THEN no existe el token en claro, solo su hash

### Requirement: Pedido autenticado cuando el cliente no tiene correo (D3)

Si el correo del cliente no está en estado `LISTO`, el endpoint público de pedido anónimo DEBE rechazar toda solicitud sin crear ticket. El alta DEBE hacerse por la vía autenticada de ticket de soporte, con sesión de un usuario registrado del cliente (`TicketsAltas`/guards vigentes) y con el equipo precargado desde el QR cuando corresponda. Ver el comportamiento de redirección al login en `formulario-publico-cliente`.

#### Scenario: Usuario con sesión crea el ticket con el equipo precargado

- GIVEN un cliente habilitado sin correo y un usuario autenticado de ese cliente que llegó por el QR de un equipo activo
- WHEN confirma el alta
- THEN el ticket se crea a su nombre, con el equipo del QR, por la vía autenticada

#### Scenario: Sesión de otro cliente

- GIVEN un usuario autenticado en el cliente B que escanea un QR del cliente A, sin membresía en A
- WHEN intenta el alta
- THEN el sistema rechaza el alta y no escribe en la base de A

### Requirement: El ticket nace en NUEVO sin moderación (D4)

Todo ticket creado por el formulario público (externo verificado) DEBE nacer en el estado `NUEVO`, sin estado intermedio de aprobación, y entrar al ciclo, la numeración y el SLA como cualquier otro ticket. El alta DEBE pasar por `CrearTicketSoporteUseCase`, para heredar ciclo activo, numeración, lock de baja del equipo y evento de SLA.

#### Scenario: Estado inicial

- GIVEN un pedido externo confirmado
- WHEN se crea el ticket
- THEN su estado es `NUEVO` y se publica el evento de creación para el SLA

#### Scenario: Sin ciclo activo

- GIVEN un cliente sin ciclo activo
- WHEN se confirma el pedido
- THEN se aplica el mismo rechazo (409) que en el alta autenticada y no queda ticket parcial

### Requirement: Tipo SOPORTE y prioridad MEDIA fijos (D6)

El ticket público DEBE tener tipo `SOPORTE` y prioridad `MEDIA`. El formulario NO DEBE ofrecer esos campos y el backend DEBE ignorar o rechazar `tipoId`, `prioridadId`, `estadoId` o `solicitanteId` enviados por el cliente.

#### Scenario: Defaults

- GIVEN un pedido externo confirmado
- WHEN se crea el ticket
- THEN su tipo es `SOPORTE` y su prioridad es `MEDIA`

#### Scenario: El visitante intenta elegir prioridad

- GIVEN un pedido que incluye `prioridadId` de CRITICA
- WHEN se procesa
- THEN el ticket queda con prioridad `MEDIA` o el pedido se rechaza por campo no permitido

### Requirement: Límites anti-abuso (D10)

El sistema DEBE limitar a 3 pedidos por email cada 15 minutos y a 30 pedidos por cliente por hora. El límite por email NO DEBE usar `X-Forwarded-For` como clave. Al excederlo DEBE responder con un mensaje genérico de "intente más tarde" que no revele cuál límite se superó ni si el email o el cliente existen. Cada pedido contado DEBE incluir los que no llegan a verificarse.

#### Scenario: Cuarto pedido del mismo email

- GIVEN 3 pedidos del mismo email en el mismo cliente dentro de 15 minutos
- WHEN llega un cuarto
- THEN responde con el mensaje genérico y no envía mail

#### Scenario: Cambiar el header de IP no elude el límite

- GIVEN el límite por email agotado
- WHEN se repite el pedido variando `X-Forwarded-For`
- THEN sigue rechazado

#### Scenario: Pedido 31 al cliente

- GIVEN 30 pedidos de distintos emails al mismo cliente en una hora
- WHEN llega el pedido 31
- THEN responde con el mismo mensaje genérico

#### Scenario: Otro cliente no se ve afectado

- GIVEN el límite por cliente agotado en A
- WHEN llega un pedido a B
- THEN se procesa normalmente

### Requirement: 404 uniforme ante cualquier rechazo (anti-enumeración)

Todo rechazo público por slug inexistente, formulario deshabilitado, cliente inactivo o borrado, token de equipo inválido de otro cliente, o token de verificación inválido DEBE devolver el mismo código, cuerpo y forma de respuesta, sin diferencias distinguibles por contenido. Un token de equipo inválido o de baja NO DEBE producir este 404 cuando el slug es válido (ver `equipos-qr`: el formulario abre sin equipo).

#### Scenario: Slug inexistente

- GIVEN un slug que no existe
- WHEN se abre `/c/<slug>/pedido`
- THEN responde 404 con el cuerpo uniforme

#### Scenario: Cliente deshabilitado e inactivo indistinguibles

- GIVEN un cliente con el formulario deshabilitado y otro con `activo = false`
- WHEN se piden sus URLs públicas
- THEN las respuestas son idénticas entre sí y a la de un slug inexistente

### Requirement: El tenant sale siempre de la fila master del slug

El cliente DEBE resolverse desde la fila master por `slug` y recién después enlazar `TenantContext`. Ningún dato del cuerpo, query, header o cookie del pedido (`clienteId`, `dbName`, `X-Tenant-Id`) PUEDE determinar el tenant. Ningún pedido DEBE escribir fuera de la base del cliente del slug.

#### Scenario: Cliente inyectado en el cuerpo

- GIVEN un pedido a `/c/<slug-de-A>/pedido` con `clienteId` de B en el cuerpo
- WHEN se procesa
- THEN todo se escribe en la base de A y nada en la de B

#### Scenario: Dos tenants con guards reales

- GIVEN dos clientes habilitados A y B
- WHEN se confirma un pedido a `/c/<slug-de-A>/pedido` usando un token de equipo de B
- THEN el ticket, si se crea, queda en A sin equipo, y B no recibe escritura alguna

#### Scenario: Cliente inactivo

- GIVEN un cliente inactivo con slug y formulario habilitados
- WHEN se confirma un link de verificación emitido antes de la inactivación
- THEN responde 404 uniforme y no se crea ticket

### Requirement: Validación de contenido

El backend DEBE validar nombre, email, título y descripción con longitudes máximas y rechazar cuerpos inválidos con un error de validación que no revele datos del cliente. El texto DEBE renderizarse escapado en las pantallas de técnicos.

#### Scenario: Descripción excesiva

- GIVEN una descripción que supera el máximo permitido
- WHEN se envía el formulario
- THEN se rechaza con error de validación y no se envía mail

## No implementado (declarado)

- **Adjuntos en el formulario público** (D9): excluidos de la primera entrega por decisión del dueño. El endpoint público NO acepta multipart. Habilitarlos exigiría límite de tamaño previo a la carga, lista de tipos sin SVG y topes por solicitud.
- **Página de seguimiento** (D5): no existe; ver `solicitante-externo`.
- **Impresión de QR en lote** (D8): ver `equipos-qr`.
- **Política de borrado de datos de externos** (D11): ver `solicitante-externo`.
- **Throttler distribuido**: el almacenamiento es en memoria de un único proceso, igual que CSAT y reseteo de contraseña; no escala horizontalmente. Se documenta como limitación conocida.
