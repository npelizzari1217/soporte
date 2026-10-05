# Equipos QR — Delta Specification

## Purpose

Definir la emisión, regeneración y resolución del QR por equipo con token opaco, y el comportamiento ante equipos dados de baja o de otro cliente.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Segunda etapa — brechas frente a la competencia" → "### Decisiones de producto de la segunda etapa" → "Segunda etapa, punto 1 — formulario público + QR". Cubre la viñeta D8 (un QR por equipo, token opaco regenerable, baja abre sin equipo, sin impresión en lote).

## ADDED Requirements

### Requirement: Un QR por equipo con token opaco (D8)

Cada equipo PUEDE tener un QR. El QR DEBE codificar la URL pública `/c/<slug>/pedido?e=<token>`, donde el token es opaco y de al menos 128 bits de entropía. El token NO DEBE derivarse del `id` del equipo ni contener datos del equipo. El sistema DEBE guardar el hash del token (clave de búsqueda) y, desde el issue #356 (decisión del dueño, 2026-10-05, que revierte la regla original de guardar solo el hash), también el token en claro, para mostrar siempre el QR vigente y permitir descargarlo o imprimirlo las veces que haga falta; regenerar reemplaza ambos. Los QR emitidos antes de ese cambio no tienen token guardado y hay que regenerarlos una vez para verlos. Emitir el QR requiere sesión y permiso sobre equipos; el primer QR emitido congela el slug del cliente (ver `formulario-publico-cliente`).

#### Scenario: Emisión del QR

- GIVEN un equipo activo sin QR y un usuario autorizado de su cliente
- WHEN emite el QR
- THEN el sistema devuelve la URL con un token opaco y guarda solo su hash

#### Scenario: Sin sesión o sin permiso

- GIVEN un visitante sin sesión, o un usuario sin permiso sobre equipos
- WHEN intenta emitir el QR
- THEN el sistema responde 401 o 403 y no emite nada

#### Scenario: Emisión sin slug

- GIVEN un cliente sin slug
- WHEN se intenta emitir un QR
- THEN el sistema rechaza la operación, porque no hay URL pública que codificar

### Requirement: Regeneración invalida el token anterior (D8)

Regenerar el QR de un equipo DEBE invalidar el token anterior de inmediato y emitir uno nuevo, sin cambiar el `id` del equipo. El token viejo DEBE resolver igual que uno inexistente.

#### Scenario: Regenerar tras extravío

- GIVEN un equipo con QR emitido
- WHEN un usuario autorizado regenera el QR
- THEN el token nuevo resuelve al equipo y el token viejo se comporta como un token inexistente: el formulario abre sin equipo, con la misma respuesta que sin token

### Requirement: Resolución del token solo dentro del cliente del slug (D8)

Resolver un token DEBE buscarlo únicamente en la base del cliente que determina el slug de la URL. El token de un equipo de otro cliente NUNCA DEBE resolver, y su respuesta DEBE ser indistinguible de la de un token inexistente. Un token inválido en un cliente válido NO DEBE impedir que el formulario abra: la respuesta pública sigue la regla de 404 uniforme definida en `pedido-publico`.

#### Scenario: Token de otro cliente

- GIVEN el cliente A y el cliente B, y un QR emitido para un equipo de B
- WHEN se usa ese token en `/c/<slug-de-A>/pedido`
- THEN la respuesta es la misma que con un token inexistente y no se revela dato alguno del equipo de B

#### Scenario: Token válido del propio cliente

- GIVEN un QR vigente de un equipo activo del cliente A
- WHEN se abre `/c/<slug-de-A>/pedido?e=<token>`
- THEN el contexto devuelve solo el nombre del equipo y del cliente, sin número de serie, ubicación completa ni valoración

### Requirement: Equipo dado de baja abre el formulario sin equipo (D8)

Si el token resuelve a un equipo dado de baja (`activo = false` o borrado), el formulario DEBE abrir igualmente, sin equipo cargado y sin revelar que el equipo existió ni su baja. El pedido resultante DEBE crearse sin equipo.

#### Scenario: Escaneo de un equipo dado de baja

- GIVEN un equipo dado de baja con QR emitido antes de la baja
- WHEN se abre su URL
- THEN el formulario abre con el campo de equipo vacío y sin mensaje que delate la baja

#### Scenario: Equipo dado de baja entre la apertura y la confirmación

- GIVEN un formulario abierto con un equipo que se da de baja antes de confirmar
- WHEN se confirma el pedido
- THEN el ticket se crea sin equipo, sin error para quien pide, y sin vincular el equipo dado de baja

## No implementado (declarado)

- **Impresión de QR en lote** (D8): excluida de esta primera entrega por decisión del dueño; se emite y descarga un QR por equipo desde su ficha.
