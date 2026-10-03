# Formulario Público por Cliente — Delta Specification

## Purpose

Definir la configuración por cliente del formulario público: el slug que lo identifica en la URL, su habilitación (apagado por defecto, solo ROOT) y la regla para clientes sin correo configurado.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, sección "Segunda etapa — brechas frente a la competencia" → "### Decisiones de producto de la segunda etapa" → viñeta "Segunda etapa, punto 1 — formulario público + QR". Esta capacidad cubre las viñetas D3, D7 y D12. El resto está en `equipos-qr`, `solicitante-externo` y `pedido-publico`.
>
> **Superseded.** La exploración proponía un enum de tres modos (`APAGADO` | `SOLO_MIEMBROS` | `EXTERNOS_VERIFICADOS`). No se implementa: lo reemplazan D12 (un booleano de habilitación) y D3 (la regla de correo se deduce del estado del correo del cliente, no de un modo configurable).

## ADDED Requirements

### Requirement: Slug del cliente cargado por ROOT (D7)

El cliente DEBE tener un `slug` único, normalizado a `[a-z0-9-]`, que lo identifica en la URL pública. Solo ROOT PUEDE cargarlo o editarlo. Cualquier actor sin `is_global_admin: true`, incluido un ADMINISTRADOR del propio cliente, DEBE recibir 403. Un slug repetido DEBE rechazarse con conflicto. El slug NUNCA PUEDE ser el `id` ni el `dbName` del cliente.

#### Scenario: ROOT carga el slug

- GIVEN un actor ROOT y un cliente sin slug
- WHEN carga el slug `colegio-norte`
- THEN el cliente queda con ese slug

#### Scenario: ADMINISTRADOR intenta cargar el slug

- GIVEN un ADMINISTRADOR del cliente
- WHEN intenta cargar o editar el slug de su cliente
- THEN el sistema responde 403 y el slug no cambia

#### Scenario: Slug duplicado o con formato inválido

- GIVEN un cliente A con slug `colegio-norte`
- WHEN ROOT carga `colegio-norte` en el cliente B, o un valor con mayúsculas, espacios o caracteres fuera de `[a-z0-9-]`
- THEN el sistema rechaza la operación y B no cambia

### Requirement: El slug es inmutable tras emitir el primer QR (D7)

Una vez emitido el primer QR de cualquier equipo del cliente, el sistema DEBE rechazar todo cambio del slug, incluso de ROOT, porque un cambio rompería los QR impresos. Antes del primer QR, ROOT PUEDE corregirlo.

#### Scenario: Cambio de slug con QR emitido

- GIVEN un cliente con slug `colegio-norte` y al menos un QR emitido
- WHEN ROOT intenta cambiar el slug
- THEN el sistema rechaza el cambio y el slug sigue siendo `colegio-norte`

#### Scenario: Cambio de slug sin QR emitido

- GIVEN un cliente con slug y ningún QR emitido
- WHEN ROOT cambia el slug
- THEN el cambio se aplica

### Requirement: Formulario apagado por defecto, habilitado solo por ROOT (D12)

Todo cliente, nuevo o existente, DEBE tener el formulario público deshabilitado por defecto. Solo ROOT PUEDE habilitarlo o deshabilitarlo, con el mismo criterio que `csatHabilitado`. Cualquier otro actor DEBE recibir 403. Un cliente con el formulario deshabilitado DEBE comportarse, hacia el público, como un cliente inexistente (404 uniforme, ver `pedido-publico`).

#### Scenario: Cliente nuevo

- GIVEN un cliente recién creado
- WHEN se consulta su configuración
- THEN el formulario público figura deshabilitado

#### Scenario: Cliente existente tras la migración

- GIVEN clientes existentes antes del cambio
- WHEN se aplica la migración
- THEN todos quedan con el formulario deshabilitado

#### Scenario: ADMINISTRADOR intenta habilitar

- GIVEN un ADMINISTRADOR del cliente
- WHEN intenta habilitar el formulario
- THEN el sistema responde 403 y el estado no cambia

#### Scenario: ROOT habilita

- GIVEN un cliente con slug cargado y el formulario deshabilitado
- WHEN ROOT lo habilita
- THEN el formulario pasa a estar habilitado

#### Scenario: No se puede habilitar sin slug

- GIVEN un cliente sin slug
- WHEN ROOT intenta habilitar el formulario
- THEN el sistema rechaza la operación, porque no existiría una URL pública

### Requirement: Cliente sin correo configurado solo acepta usuarios con sesión (D3)

El modo de aceptación NO ES configurable: lo determina `ICorreoDeCliente.estado()`. Si el estado es `LISTO`, el formulario acepta pedidos de externos verificados por mail (ver `pedido-publico`). Si el estado es `SIN_CORREO` o `CLIENTE_NO_DISPONIBLE`, el formulario DEBE aceptar únicamente pedidos de usuarios registrados con sesión iniciada en ese cliente. En ese caso el formulario y el QR DEBEN llevar al login y, tras iniciar sesión, al alta de ticket autenticada con el equipo del QR precargado. El sistema NO DEBE permitir que un anónimo, o alguien que solo tipee un email, cree un ticket en ese cliente.

#### Scenario: Anónimo en cliente sin correo

- GIVEN un cliente habilitado cuyo correo está en estado `SIN_CORREO`
- WHEN un visitante sin sesión abre el formulario o escanea el QR de un equipo
- THEN se lo lleva al login y no se le ofrece enviar un pedido anónimo

#### Scenario: Usuario registrado con sesión llega por QR

- GIVEN un cliente habilitado sin correo y un usuario con membresía en ese cliente
- WHEN inicia sesión tras escanear el QR de un equipo
- THEN llega al alta de ticket autenticada con ese equipo precargado

#### Scenario: Intento de pedido anónimo por la API

- GIVEN un cliente habilitado sin correo
- WHEN se envía directamente un pedido público con un email tipeado y sin sesión
- THEN el sistema lo rechaza con la respuesta uniforme y no crea ticket ni solicitante externo

#### Scenario: Cliente con correo listo

- GIVEN un cliente habilitado cuyo correo está en estado `LISTO`
- WHEN un visitante sin sesión abre el formulario
- THEN se le ofrece el pedido con verificación por mail

#### Scenario: El correo se pierde después de habilitar

- GIVEN un cliente habilitado cuyo correo pasa a `SIN_CORREO`
- WHEN un visitante sin sesión abre el formulario
- THEN se aplica la regla de sesión obligatoria, sin intervención de ROOT

## No implementado (declarado)

- **Enum de tres modos de la exploración**: reemplazado por D12 + D3; evita una configuración redundante que podría contradecir el estado real del correo.
