# Métricas SLA del dashboard — Specification

## Purpose

Definir las tres métricas de SLA del dashboard: cumplimiento de resolución por tiempo activo, % de cumplimiento de primera respuesta y tiempo medio de primera respuesta en horas hábiles.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 6 — SLA de primera respuesta y pausa del reloj", sub-viñetas del dashboard y de cumplimiento (ver tabla de trazabilidad en `ticket-esperando-cliente`). El contrato de la respuesta crece solo de forma aditiva.

## Requirements

### Requirement: R1 Cumplimiento de resolución por tiempo activo

El dashboard DEBE calcular el cumplimiento de resolución sobre los tickets resueltos o cerrados con meta, usando el cumplimiento fijado en la última resolución (`sla-reloj-activo` R3) y, para los previos sin cumplimiento fijado, fecha de cierre contra vencimiento (`sla-reloj-activo` R8). NO DEBE usar la marca de vencido del barrido. El porcentaje es nulo si no hay datos.

#### Scenario: Resuelto tarde antes del barrido

- GIVEN un ticket resuelto con 9 h activas sobre meta de 8 h y sin marca del barrido
- WHEN se consulta el dashboard
- THEN cuenta como no cumplido

#### Scenario: Semana en espera

- GIVEN un ticket resuelto con 5 h activas y 7 días en espera sobre meta de 8 h
- WHEN se consulta el dashboard
- THEN cuenta como cumplido

#### Scenario: Cohorte previa

- GIVEN un ticket cerrado antes del cambio con fecha de cierre posterior al vencimiento y sin marca de vencido
- WHEN se consulta el dashboard
- THEN cuenta como no cumplido

#### Scenario: Sin datos

- GIVEN ningún ticket resuelto con meta
- WHEN se consulta el dashboard
- THEN el porcentaje es nulo

### Requirement: R2 Primera respuesta: porcentaje y tiempo medio hábil

El dashboard DEBE informar el **% de cumplimiento de primera respuesta** (cumplidos sobre los tickets con meta que ya respondieron o ya vencieron; cumplido si la respuesta fue en o antes del vencimiento) y el **tiempo medio de primera respuesta** en **horas hábiles** con el calendario del cliente, entre la creación y la primera respuesta, sobre todos los tickets con primera respuesta (incluidos los rellenados desde el historial). Ambos son nulos si no hay datos.

#### Scenario: Porcentaje

- GIVEN cuatro tickets con meta: dos respondidos a tiempo, uno respondido tarde, uno sin respuesta y vencido
- WHEN se consulta el dashboard
- THEN el cumplimiento es 50 %

#### Scenario: Tiempo medio en horas hábiles

- GIVEN dos tickets creados el viernes a 17:00 (cierre 18:00), respondidos el lunes a 10:00 (apertura 09:00) y el viernes a 17:30
- WHEN se consulta el dashboard
- THEN el tiempo medio es 1,25 h hábiles, no tiempo de pared

#### Scenario: Ticket rellenado y sin meta

- GIVEN un ticket previo con primera respuesta rellenada y sin meta
- WHEN se consulta el dashboard
- THEN entra en el tiempo medio pero no en el % de cumplimiento

#### Scenario: Sin datos

- GIVEN ningún ticket con meta ni con respuesta
- WHEN se consulta el dashboard
- THEN el % y el tiempo medio son nulos

### Requirement: R3 Presentación junto al cumplimiento de resolución

La pantalla del dashboard DEBE mostrar las dos métricas nuevas junto al cumplimiento de resolución, y un valor nulo se muestra como "sin datos", no como 0 %.

#### Scenario: Tarjetas

- GIVEN datos de primera respuesta y de resolución
- WHEN se abre el dashboard
- THEN se ven las tres tarjetas con sus valores, y con datos nulos se lee "sin datos"

### Requirement: R4 Preventivos excluidos

Los preventivos NO DEBEN entrar en ninguna de las tres métricas.

#### Scenario: Preventivo resuelto

- GIVEN un ticket preventivo resuelto con comentarios públicos de un técnico
- WHEN se consulta el dashboard
- THEN no altera el cumplimiento de resolución, el de primera respuesta ni el tiempo medio

### Requirement: R5 Los abiertos en espera siguen contando como abiertos

Un ticket en ESPERANDO_CLIENTE DEBE seguir contado como abierto y como carga de su agente, y no entra a las métricas de cumplimiento de resolución.

#### Scenario: Ticket en espera

- GIVEN un ticket asignado en ESPERANDO_CLIENTE
- WHEN se consulta el dashboard
- THEN cuenta en abiertos y en la carga del agente, y no en el cumplimiento de resolución
