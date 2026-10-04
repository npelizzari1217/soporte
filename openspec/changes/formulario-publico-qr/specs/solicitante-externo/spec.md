# Solicitante Externo — Delta Specification

## Purpose

Definir la identidad local al tenant de quien pide sin cuenta, su vínculo con el ticket, sus notificaciones por mail (número, estados, CSAT) y la retención de sus datos.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Segunda etapa — brechas frente a la competencia" → "### Decisiones de producto de la segunda etapa" → "Segunda etapa, punto 1 — formulario público + QR". Cubre las viñetas D2, D5 y D11.

## ADDED Requirements

### Requirement: El externo vive solo en la base del cliente (D2)

El solicitante externo DEBE guardarse en una tabla de la base del tenant (nombre, email verificado, teléfono opcional). El sistema NO DEBE crear `Usuario` ni `Membresia` para él, ni escribir nada suyo en master. El mismo email en dos clientes DEBE producir dos solicitantes externos independientes, sin vínculo entre sí.

#### Scenario: Alta de un externo

- GIVEN un pedido público verificado de un email sin cuenta
- WHEN se crea el ticket
- THEN existe un solicitante externo en la base del cliente y no existe `Usuario` ni `Membresia` nuevos

#### Scenario: Mismo email en dos clientes

- GIVEN el mismo email que pide en el cliente A y en el cliente B
- WHEN ambos pedidos se verifican
- THEN cada base de tenant tiene su propio solicitante externo y ninguno referencia al otro

### Requirement: El ticket referencia exactamente un solicitante (D2)

Todo ticket DEBE tener exactamente uno de `solicitante_id` (usuario registrado) o `solicitante_externo_id` (externo), garantizado por una restricción de base de datos. Los tickets existentes DEBEN conservar su `solicitante_id` sin cambios.

#### Scenario: Ticket con ambos o ninguno

- GIVEN un intento de insertar un ticket con ambos campos, o con ninguno
- WHEN se ejecuta la inserción
- THEN la base la rechaza

#### Scenario: Ticket existente

- GIVEN un ticket creado antes del cambio
- WHEN se aplica la migración
- THEN conserva su `solicitante_id` y `solicitante_externo_id` es nulo

### Requirement: Los lectores toleran `solicitante_id` nulo (D2)

Listados, detalle, exportes, resolución de nombres, notificaciones y CSAT DEBEN funcionar con tickets de solicitante externo, mostrando el nombre del externo y sin fallar ni mostrar un identificador vacío. Un lector que no sepa resolver un externo NO DEBE tirar un error 500.

#### Scenario: Listado con ticket externo

- GIVEN un cliente con un ticket de solicitante externo
- WHEN un técnico abre el listado y el detalle
- THEN ambos responden 200 y muestran el nombre del externo

#### Scenario: Detalle de un ticket externo sin teléfono

- GIVEN un externo sin teléfono cargado
- WHEN se abre el detalle
- THEN el teléfono simplemente no aparece

### Requirement: Notificaciones al externo por mail (D5)

El externo DEBE recibir por mail, en la dirección verificada: (a) el número del ticket al crearse, (b) cada cambio de estado, (c) cada comentario público del ticket (decisión del dueño del 2026-10-03, que extiende D5; los comentarios internos nunca se envían), y (d) la encuesta CSAT, con las mismas reglas de habilitación y de token que para un usuario registrado (`csatHabilitado`, un solo uso). La resolución del contacto DEBE leer del solicitante externo cuando `solicitante_id` es nulo. No DEBE enviarse ningún mail a un externo cuyo cliente tenga el correo no operativo; en ese caso, por D3, el externo no existe.

#### Scenario: Número del ticket

- GIVEN un pedido externo confirmado
- WHEN se crea el ticket
- THEN el externo recibe un mail con el número del ticket

#### Scenario: Cambio de estado

- GIVEN un ticket de solicitante externo
- WHEN un técnico cambia su estado
- THEN el externo recibe el mail de cambio de estado en su email verificado

#### Scenario: Comentario público e interno

- GIVEN un ticket de solicitante externo
- WHEN un técnico agrega un comentario público, y después uno interno
- THEN el externo recibe un mail por el comentario público en su email verificado, y ninguno por el interno

#### Scenario: Encuesta CSAT

- GIVEN un ticket externo que se cierra en un cliente con CSAT habilitado
- WHEN corresponde enviar la encuesta
- THEN el externo la recibe por mail con token de un solo uso

#### Scenario: CSAT deshabilitado

- GIVEN un cliente con CSAT deshabilitado
- WHEN se cierra un ticket externo
- THEN no se envía la encuesta

### Requirement: Retención de los datos del externo (D11)

Los datos del externo DEBEN conservarse mientras exista el ticket que los referencia. Esta primera entrega NO implementa borrado ni anonimización. La retención DEBE quedar anotada, en el cuerpo del PR y en la documentación del cambio, como punto a revisar.

#### Scenario: Datos mientras exista el ticket

- GIVEN un ticket externo existente
- WHEN pasa el tiempo o se cierra el ticket
- THEN el solicitante externo sigue guardado y el ticket sigue mostrando su nombre

#### Scenario: Retención anotada

- GIVEN el PR de la unidad de trabajo del solicitante externo
- WHEN se revisa su descripción
- THEN incluye la nota de revisión pendiente de retención de datos personales

## No implementado (declarado)

- **Página de seguimiento** (D5): el dueño decidió que no existe; el externo solo recibe mails. Evita una segunda superficie pública con token propio.
- **Política de borrado o anonimización de datos del externo** (D11): queda para una revisión posterior; solo se anota la retención.
