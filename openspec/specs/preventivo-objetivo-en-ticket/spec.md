# Preventivo Objetivo en Ticket Specification

## Purpose

Definir cómo el barrido de generación de preventivos refleja el objetivo del
plan (equipo o ubicación) en la descripción del ticket que crea, incluyendo
el caso en que el objetivo no se puede resolver.

## Requirements

### Requirement: La descripción del ticket antepone el objetivo del plan

El sistema DEBE anteponer al cuerpo de la descripción del ticket generado una
línea que identifique el objetivo del plan, seguida de una línea en blanco y
luego el contenido de `plan.instrucciones`. Si el plan apunta a un equipo
resoluble, la línea DEBE tener el formato `Equipo: <nombre>`. Si apunta a una
ubicación, la línea DEBE tener el formato `Ubicación: <TEXTO>`, usando el
valor guardado tal cual (ya normalizado a mayúscula).

#### Scenario: Plan con equipo resoluble

- GIVEN un plan preventivo con `equipoId` que resuelve a un equipo activo de
  nombre "Notebook Dell 5420" e `instrucciones` "Limpiar ventiladores"
- WHEN el barrido genera el ticket del ciclo vencido
- THEN la descripción del ticket empieza con `Equipo: Notebook Dell 5420`,
  seguida de una línea en blanco y luego "Limpiar ventiladores"

#### Scenario: Plan con ubicación

- GIVEN un plan preventivo con `ubicacion` "SALA DE SERVIDORES" (sin
  `equipoId`) e `instrucciones` "Revisar UPS"
- WHEN el barrido genera el ticket del ciclo vencido
- THEN la descripción del ticket empieza con `Ubicación: SALA DE SERVIDORES`,
  seguida de una línea en blanco y luego "Revisar UPS"

### Requirement: Objetivo irresoluble degrada el texto sin fallar la generación

Cuando `plan.equipoId` no resuelve a un equipo, el sistema DEBE generar el
ticket igual, con la línea de objetivo degradada, y NUNCA DEBE dejar de
generar el ticket por esta causa. El sistema DEBE distinguir textualmente cada
estado del equipo — eliminado del inventario, dado de baja, inexistente y no
consultable — y NUNCA DEBE usar el mismo texto degradado para dos estados
distintos: dos situaciones que se leen igual son indistinguibles para quien
recibe el ticket.

Las etiquetas son parte del contrato, no ejemplos ilustrativos. El orden de
evaluación también: `deletedAt` se evalúa ANTES que `activo`, así que un equipo
borrado e inactivo a la vez se reporta como eliminado del inventario.

#### Scenario: Equipo eliminado del inventario (deletedAt no nulo)

- GIVEN un plan cuyo `equipoId` resuelve, vía `findById`, a un equipo con
  `deletedAt` no nulo (borrado lógico)
- WHEN el barrido genera el ticket del ciclo vencido
- THEN la línea de objetivo es `Equipo: <nombre> (eliminado del inventario)` y
  el ticket se genera igual

#### Scenario: Equipo dado de baja (activo = false, deletedAt nulo)

- GIVEN un plan cuyo `equipoId` resuelve a un equipo con `activo = false` y
  `deletedAt` nulo
- WHEN el barrido genera el ticket del ciclo vencido
- THEN la línea de objetivo es `Equipo: <nombre> (dado de baja)` y el ticket se
  genera igual
- AND ese texto es distinto del que produce el equipo eliminado del inventario

#### Scenario: Equipo inexistente (findById devuelve null)

- GIVEN un plan cuyo `equipoId` no resuelve a ningún equipo (`findById`
  devuelve `null`)
- WHEN el barrido genera el ticket del ciclo vencido
- THEN la línea de objetivo es `Equipo: no encontrado (id <equipoId>)` — el id
  viaja en el texto porque no hay nombre que mostrar — y el ticket se genera
  igual

#### Scenario: Falla de resolución del equipo no aborta el barrido de otros planes

- GIVEN un tenant con dos planes vencidos, uno cuyo equipo no resuelve y otro
  con objetivo válido
- WHEN corre el barrido
- THEN ambos ciclos se procesan: el plan con objetivo irresoluble genera su
  ticket con texto degradado, y el otro plan genera su ticket con el
  objetivo normal — ninguno bloquea al otro
