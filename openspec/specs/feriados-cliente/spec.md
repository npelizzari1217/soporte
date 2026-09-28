# Especificación de Feriados Cliente

> **Desviación de presupuesto declarada.** La skill `sdd-spec` limita un artefacto de spec a
> 650 palabras; se estima que este documento está bastante por encima de eso (conteo manual de
> tokens, no `wc -w` — este entorno no tiene acceso a shell). La presión vino del propio prompt
> de lanzamiento: cada requerimiento confirmado por el dueño (alcance de admin, aislamiento,
> deduplicación contra lo global, ambos caminos del SLA, fail-closed ante un contexto de
> inquilino sin vincular, la vista con badges, la integridad de fechas, y el cierre del roadmap)
> necesitaba su propio escenario testeable, más la tabla completa de citación del Punto 5 del
> roadmap que el `CLAUDE.md` de este repo hace obligatoria. `openspec/specs/clientes-logo/spec.md`
> sentó el precedente (989 palabras) para el mismo trade-off: declarar el excedente en vez de
> recortar cobertura en una capacidad cuyo riesgo central es una fuga cross-tenant.

## Purpose

Definir una lista de feriados por inquilino que el ADMINISTRADOR de un cliente (o ROOT)
gestiona, aislada de todo otro cliente, rechazando fechas que ya son globales, y consumida
por el cálculo del vencimiento del SLA `HABIL` junto con la lista global.

## Decisión de producto citada

`docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas",
Punto 5 (líneas 197-206). Cada cláusula de esa viñeta, y cómo la resuelve esta capacidad:

| Clause | Disposition |
|---|---|
| "feriados nacionales AR precargados en el seed más excepciones por cliente" | **Implementada.** Esta capacidad es la mitad de "excepciones por cliente"; ver los requerimientos abajo |
| "calendario por cliente con default 9-18 lun-vie" | **Cumplida.** Ciclo `horario-laboral-por-cliente` (2026-09-29). `CalendarioLaboralDiaCliente` en la base de cada tenant, editable por ADMINISTRADOR. Ver especificación en `openspec/specs/horario-laboral-cliente/spec.md`. |
| "un ticket abierto fuera de horario arranca el reloj en la próxima ventana hábil" | **Ya entregada** (`calcular-sla-habil-vence.service.ts`, 2026-09-09). Solo referencia — esta capacidad no la toca |

## Requirements

### Requirement: El admin por cliente gestiona sus propios feriados; otros roles leen

El sistema DEBE permitir que el ADMINISTRADOR de un cliente, o ROOT actuando sobre ese
inquilino, cree, edite y elimine los feriados de ese cliente. DEBE permitir que cualquier
otro rol autenticado de ese cliente lea la lista. DEBE rechazar las escrituras de roles
no-admin.

#### Scenario: El ADMINISTRADOR del cliente A gestiona los feriados de A

- GIVEN un ADMINISTRADOR del cliente A
- WHEN crea, edita o elimina un feriado del cliente A
- THEN el sistema aplica el cambio

#### Scenario: Un rol no-admin intenta una escritura

- GIVEN un actor autenticado del cliente A sin ADMINISTRADOR ni ROOT
- WHEN intenta crear, editar o eliminar un feriado
- THEN el sistema responde 403

### Requirement: Aislamiento entre clientes por construcción

El sistema NO DEBE permitir que un cliente lea o escriba los feriados de otro cliente por
ninguna ruta. Una request vinculada al inquilino del cliente A DEBE resolver siempre y solo
contra la base de inquilino del propio cliente A.

#### Scenario: El cliente A nunca ve los feriados del cliente B

- GIVEN el cliente A y el cliente B tienen cada uno sus propios feriados
- WHEN un usuario del cliente A solicita la lista de feriados por cliente
- THEN la respuesta contiene solo las filas del cliente A, nunca las del cliente B

### Requirement: Rechazar una fecha de cliente que ya es global; exigir unicidad por inquilino

El sistema DEBE rechazar la creación de un feriado de cliente para una fecha que ya existe
en la lista global, sin crear una fila duplicada. También DEBE rechazar una fecha que ya
existe entre los propios feriados de ese mismo cliente.

#### Scenario: Una fecha de cliente colisiona con un feriado global

- GIVEN una fecha ya presente en la lista global de feriados
- WHEN un ADMINISTRADOR de cliente intenta agregar esa misma fecha como feriado de cliente
- THEN el sistema rechaza la request y no se crea ninguna fila

#### Scenario: Una fecha de cliente colisiona con un feriado propio ya existente

- GIVEN una fecha ya presente en la lista propia de feriados del cliente A
- WHEN el ADMINISTRADOR del cliente A intenta agregar esa misma fecha otra vez
- THEN el sistema rechaza la request

### Requirement: El SLA HABIL omite solo lo global y los feriados del propio cliente del ticket

El cálculo del vencimiento `HABIL` DEBE omitir las fechas de la unión entre la lista global
y los feriados del propio cliente del ticket, y NO DEBE omitir los feriados de otro cliente.
Esto DEBE cumplirse en todo camino que calcule un vencimiento: creación y repriorización del
ticket. El sweep periódico (`SlaSweepScheduler` → `MarcarVencidosUseCase`) nunca lee
feriados — solo compara el `sla_vence_at` almacenado contra el momento actual
(`prisma-sla-ticket-query.repository.ts:31-42`) — así que la unión lo alcanza a través del
vencimiento almacenado, no de un segundo cálculo. Agregar un feriado NO DEBE recalcular el
vencimiento de tickets ya abiertos; repriorizar un ticket recalcula su vencimiento con los
feriados vigentes en ese momento (comportamiento existente, sin cambios).

#### Scenario: El vencimiento omite lo global y los feriados del propio cliente

- GIVEN un ticket HABIL del cliente A, un feriado global, y un feriado del cliente A,
  ambos cayendo dentro de la ventana del SLA
- WHEN se calcula el vencimiento en la creación del ticket
- THEN ambas fechas se omiten

#### Scenario: El vencimiento nunca omite el feriado de otro cliente

- GIVEN un ticket HABIL del cliente A y un feriado que pertenece solo al cliente B
- WHEN se calcula el vencimiento
- THEN el feriado del cliente B no se omite

#### Scenario: La repriorización aplica la misma unión

- GIVEN un ticket HABIL del cliente A, un feriado global y un feriado del cliente A
  dentro de la nueva ventana del SLA, y un feriado del cliente B también dentro de ella
- WHEN el ticket es repriorizado
- THEN el vencimiento recalculado omite los feriados global y del cliente A, y no omite
  el del cliente B

#### Scenario: Los tickets ya abiertos no se recalculan

- GIVEN un ticket HABIL ya abierto con un vencimiento calculado
- WHEN se agrega un feriado nuevo a la lista global o a la del cliente de ese ticket
- THEN el vencimiento existente del ticket no cambia

### Requirement: Fail closed cuando no hay contexto de inquilino vinculado

`IFeriadosLaboralesRepository.obtener()` NO DEBE devolver en silencio solo los feriados
globales para un ticket que tiene un cliente. Si el cálculo del SLA corre sin un
`TenantContext` vinculado, el sistema DEBE fallar en lugar de completarse usando un
conjunto de feriados incompleto (solo-global). Hoy no existe ningún llamador legítimo de
este puerto sin vincular: su único consumidor es `AplicarSlaUseCase`
(`aplicar-sla.use-case.ts:193`), alcanzado desde el listener de creación/repriorización
dentro de un `TenantContext` vinculado.

Una falla de fail-closed DEBE ser observable: `AplicarSlaListener` actualmente absorbe
todo error sin loguearlo (`aplicar-sla.listener.ts:38-41`, pese a su comentario
"log-and-swallow"), lo que convertiría el error fail-closed en un ticket que queda en
silencio sin vencimiento. El listener DEBE loguear la falla (id del ticket y mensaje del
error, sin objeto de error crudo) sin por eso revertir el ticket ya commiteado.

#### Scenario: Un contexto de inquilino sin vincular falla cerrado

- GIVEN un cálculo de SLA HABIL que correría sin un TenantContext vinculado
- WHEN intenta leer los feriados
- THEN el sistema falla en vez de devolver en silencio un resultado solo-global

#### Scenario: Un cálculo de SLA que falla queda logueado, no silencioso

- GIVEN el cálculo de SLA para un ticket recién creado lanza una excepción
- WHEN `AplicarSlaListener` maneja el error
- THEN la creación del ticket queda commiteada
- AND una entrada de log registra el id del ticket y el mensaje del error

### Requirement: Vista combinada de solo lectura con badges de origen

La pantalla de feriados del cliente DEBE mostrar una lista ordenada por fecha que combine
los feriados propios del cliente y la lista global, de solo lectura para las filas
globales. Las filas propias del cliente DEBEN llevar un badge azul pálido usando un token
`info` nuevo definido para los temas claro y oscuro; las filas globales mantienen el badge
verde `--success-light`. No se requiere una grilla mensual de calendario.

#### Scenario: La lista combinada se renderiza con badges distintos

- GIVEN el cliente A tiene sus propios feriados y la lista global no está vacía
- WHEN el ADMINISTRADOR del cliente A abre la pantalla de feriados
- THEN las filas se ordenan por fecha, las filas propias muestran el badge azul pálido, y
  las filas globales muestran el badge verde y no se pueden editar ni eliminar ahí

### Requirement: Integridad de lectura de fecha para la tabla nueva

Un feriado de cliente guardado para una fecha de calendario dada DEBE leerse de vuelta
como esa misma fecha de calendario, sin ningún desplazamiento UTC-3.

#### Scenario: Ida y vuelta de una fecha de cliente guardada

- GIVEN un ADMINISTRADOR de cliente crea un feriado para una fecha de calendario específica
- WHEN la lista se lee de vuelta después
- THEN la fecha devuelta es exactamente la misma fecha de calendario que se guardó

### Requirement: La viñeta del roadmap declara el cierre

La viñeta del Punto 5 en `docs/roadmap-comercial.md` DEBE declarar **Cumplida** o
**Desviación** con su motivo una vez que esta capacidad se despliega, y
`scripts/check-roadmap-fresco.mjs` DEBE pasar.

#### Scenario: El chequeo de frescura del roadmap pasa

- GIVEN esta capacidad ya se desplegó
- WHEN corre `scripts/check-roadmap-fresco.mjs`
- THEN pasa porque el Punto 5 lleva una declaración de Cumplida/Desviación

## Nota: deuda de Ayuda

Este cambio toca lo que el cliente ve y hace (dos pantallas nuevas), lo que normalmente
requiere una actualización de `backend/ayuda/*.md` en el mismo commit. El módulo de Ayuda
está en pausa (`soporte/CLAUDE.md`, desde el 2026-09-07); según esa pausa, solo se requiere
una nota de deuda en el mensaje del commit y el cuerpo del PR — no se escribe ningún
artículo por ahora.
