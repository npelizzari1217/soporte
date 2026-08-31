# Preventivo Edición Plan Specification

## Purpose

Definir qué campos de un plan de mantenimiento preventivo se pueden editar
desde la UI, quién puede hacerlo, qué validaciones aplican y cómo impacta la
próxima emisión de ticket.

## Requirements

### Requirement: Campos editables desde un único formulario

El sistema DEBE permitir editar, desde un mismo formulario, `titulo`,
`instrucciones`, el objetivo (`equipoId` XOR `ubicacion`), `prioridadId`,
`responsableId`, `intervaloValor`, `intervaloUnidad` y `activo`. El sistema
NO DEBE ofrecer edición de `fechaInicio` en ese formulario, ni siquiera
deshabilitada, ni DEBE exponer un endpoint separado para activar/desactivar
el plan: activar/desactivar comparte el mismo `PATCH` y los mismos roles que
editar el resto de los campos.

#### Scenario: Se edita título, objetivo y cadencia en una sola operación

- GIVEN un plan preventivo existente con ubicación como objetivo
- WHEN un usuario autorizado edita `titulo`, cambia el objetivo a un
  `equipoId` válido y cambia `intervaloValor`/`intervaloUnidad` en el mismo
  envío
- THEN el plan persiste los tres cambios juntos y la respuesta refleja el
  plan actualizado

#### Scenario: activo se edita en el mismo formulario, sin endpoint aparte

- GIVEN un plan preventivo activo
- WHEN un usuario autorizado envía el mismo `PATCH` de edición con
  `activo: false`
- THEN el plan queda desactivado sin que exista una llamada a un endpoint
  distinto al de edición

#### Scenario: fechaInicio no se ofrece en el formulario (hermano invertido)

- GIVEN el formulario de edición de un plan abierto
- WHEN se inspeccionan los campos disponibles
- THEN `fechaInicio` no aparece entre ellos, ni como campo habilitado ni
  como campo deshabilitado

### Requirement: Solo COLABORADOR y ADMINISTRADOR editan planes

El sistema DEBE autorizar la edición de un plan únicamente a usuarios con el
permiso `PREVENTIVO:MODIFICACION` (rol COLABORADOR) o con bypass de
ADMINISTRADOR. Un usuario TECNICO NO DEBE poder editar ni desactivar un plan.

#### Scenario: COLABORADOR edita un plan

- GIVEN un usuario COLABORADOR y un plan existente
- WHEN envía `PATCH /preventivo/planes/:id` con cambios válidos
- THEN la edición se aplica y persiste

#### Scenario: TECNICO no puede editar (hermano invertido)

- GIVEN un usuario TECNICO y un plan existente
- WHEN envía `PATCH /preventivo/planes/:id`
- THEN el sistema rechaza la operación por falta de `PREVENTIVO:MODIFICACION`

### Requirement: Objetivo excluyente también en la edición

El sistema DEBE rechazar una edición que deje el plan con equipo y ubicación
simultáneos, o con ninguno de los dos, con el mismo criterio XOR que aplica
al alta (`validarObjetivo`, ADR-PV1).

#### Scenario: Edición con ambos campos de objetivo es rechazada

- GIVEN un plan existente con objetivo por ubicación
- WHEN se edita enviando `equipoId` sin limpiar `ubicacion`
- THEN el sistema rechaza la edición con `ObjetivoInvalidoError` y el plan
  no cambia

#### Scenario: Edición sin ningún objetivo es rechazada

- GIVEN un plan existente con objetivo por equipo
- WHEN se edita enviando `equipoId: null` sin proveer `ubicacion`
- THEN el sistema rechaza la edición con `ObjetivoInvalidoError` y el plan
  no cambia

### Requirement: Cadencia inválida es rechazada

El sistema DEBE rechazar una edición cuya combinación de `intervaloValor` e
`intervaloUnidad` resulte inválida (valor no positivo o unidad no
reconocida), sin persistir cambio parcial alguno.

#### Scenario: intervaloValor no positivo es rechazado

- GIVEN un plan existente con cadencia válida
- WHEN se edita enviando `intervaloValor: 0`
- THEN el sistema rechaza la edición con `IntervaloInvalidoError` y ningún
  campo del plan se modifica

### Requirement: Editar la cadencia recalcula la próxima ejecución hacia adelante

Cuando la edición cambia `intervaloValor` y/o `intervaloUnidad`, el sistema
DEBE recalcular `proximaEjecucionEn` hacia adelante desde la fecha actual, y
NUNCA DEBE retroceder ese puntero a una fecha ya pasada respecto de la
edición.

#### Scenario: Cambiar la cadencia mueve la próxima ejecución hacia adelante

- GIVEN un plan cuya `proximaEjecucionEn` calculada con la cadencia vieja
  caía hace tres días
- WHEN se edita `intervaloValor`/`intervaloUnidad` hoy
- THEN `proximaEjecucionEn` se recalcula a una fecha posterior a hoy — nunca
  a una fecha pasada

#### Scenario: Editar sin tocar la cadencia no recalcula el puntero

- GIVEN un plan con `proximaEjecucionEn` fijada
- WHEN se edita `titulo` sin enviar `intervaloValor` ni `intervaloUnidad`
- THEN `proximaEjecucionEn` no cambia

### Requirement: Plan inexistente o dado de baja es rechazado

El sistema DEBE rechazar la edición de un `planId` que no existe o que ya
está dado de baja lógicamente, con `PlanNoEncontradoError`.

#### Scenario: Editar un plan inexistente

- GIVEN un `planId` que no corresponde a ningún plan del tenant
- WHEN se envía `PATCH /preventivo/planes/:id` con ese id
- THEN el sistema responde con `PlanNoEncontradoError` y no persiste nada

### Requirement: La Ayuda documenta la edición y quién administra el módulo

El sistema DEBE describir en `backend/ayuda/mantenimiento-preventivo.md`,
en el mismo commit, que un plan se puede editar (incluyendo objetivo,
cadencia y activo) desde un único formulario, quién puede hacerlo, y que
cambiar la cadencia mueve la próxima ejecución hacia adelante desde hoy.

#### Scenario: La Ayuda deja de tener la sección desactualizada

- GIVEN el commit que introduce la UI de edición
- WHEN se lee `mantenimiento-preventivo.md` después de ese commit
- THEN la sección "Quién puede ver y administrar los planes" describe a
  COLABORADOR como administrador y documenta cómo editar un plan existente
