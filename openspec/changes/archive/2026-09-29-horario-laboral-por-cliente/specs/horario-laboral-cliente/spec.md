# Especificación de Horario Laboral Cliente

> **Desviación de presupuesto declarada.** La skill `sdd-spec` limita un artefacto de spec a
> 650 palabras; este documento lo supera. La causa es el propio prompt de lanzamiento: trece
> decisiones del dueño (aislamiento, default sembrado, fail-closed, un intervalo por día, al
> menos un día abierto, reemplazo atómico, permisos, no-recálculo de SLA, zona horaria fija,
> depreciación de la tabla master, contrato de frontend, deuda de Ayuda, cierre del roadmap)
> exigen cada una su propio requerimiento y escenario testeable, más la tabla de citación del
> Punto 5 que el `CLAUDE.md` del repo hace obligatoria. `openspec/specs/feriados-cliente/spec.md`
> sentó el precedente (mismo trade-off) para una capacidad hermana cuyo riesgo central también
> es una fuga cross-tenant: declarar el excedente en vez de recortar cobertura.

## Purpose

Dar a cada cliente su propio horario laboral semanal (7 filas, una por día), editable por su
ADMINISTRADOR o por ROOT, aislado de todo otro cliente, con un default 9-18 lunes a viernes
sembrado sin cambio de comportamiento, y consumido por el cálculo de vencimiento del SLA
`HABIL` en lugar del calendario global hoy vigente en `calendario_laboral_dias` (master).

## Decisión de producto citada

`docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas", Punto 5. Cada
cláusula de esa viñeta y cómo la resuelve esta capacidad:

| Cláusula | Disposición |
|---|---|
| "calendario por cliente con default 9-18 lun-vie" | **Alcance de este ciclo.** Ver los requerimientos abajo; cierra la Desviación declarada el 2026-09-24 |
| "feriados nacionales AR precargados... más excepciones por cliente" | Ya **Cumplida** (`feriados-configurables`, `openspec/specs/feriados-cliente/spec.md`). No se toca |
| "un ticket abierto fuera de horario arranca el reloj en la próxima ventana hábil" | Ya **Cumplida** (2026-09-09, `calcular-sla-habil-vence.service.ts`). El calculador no cambia de forma; solo cambia el origen del `CalendarioLaboralSemanal` que recibe |

## Requirements

### Requirement: Aislamiento por cliente

El horario de un cliente NO DEBE ser legible ni escribible por ningún otro cliente, por
ninguna ruta. Una request vinculada al inquilino del cliente A DEBE resolver siempre y solo
contra el horario de la base de inquilino de A.

#### Scenario: El horario del cliente A nunca afecta el SLA del cliente B

- GIVEN el cliente A y el cliente B tienen cada uno su propio horario semanal, distintos entre sí
- WHEN se calcula el vencimiento de un ticket HABIL del cliente B
- THEN el cálculo usa exclusivamente el horario del cliente B, nunca el de A

### Requirement: Default sembrado sin cambio de comportamiento

El sistema DEBE sembrar 9-18 lunes a viernes (540-1080 minutos) y sábado/domingo cerrados,
como horario inicial, tanto en todo tenant existente al desplegar este cambio como en todo
tenant nuevo provisionado después. El `sla_vence_at` calculado para un ticket dado DEBE ser
idéntico antes y después del deploy, en igualdad del resto de las condiciones.

#### Scenario: El deploy no cambia ningún vencimiento

- GIVEN un tenant existente cuyo calendario global era 9-18 lun-vie antes del deploy
- WHEN se despliega este cambio y luego se crea un ticket HABIL con los mismos datos que uno de referencia previo
- THEN el `sla_vence_at` calculado es idéntico al que hubiera dado el calendario global

#### Scenario: Un tenant nuevo nace con el default

- GIVEN se provisiona un cliente nuevo
- WHEN se consulta su horario laboral inmediatamente después
- THEN existen exactamente 7 filas, lunes a viernes 540-1080 y sábado/domingo cerrados

### Requirement: Lectura falla cerrada sin contexto de inquilino

El repositorio del horario laboral NO DEBE devolver en silencio un resultado por defecto,
vacío o de otro tenant cuando el cálculo del SLA corre sin un `TenantContext` vinculado.
DEBE fallar en su lugar.

#### Scenario: Sin TenantContext, la lectura falla

- GIVEN un cálculo de SLA HABIL que correría sin un TenantContext vinculado
- WHEN intenta leer el horario laboral
- THEN el sistema falla en vez de devolver un resultado

### Requirement: Un intervalo por día, dentro de rango

Cada uno de los 7 días DEBE tener, o bien apertura y cierre ambos nulos (día cerrado), o
bien apertura y cierre numéricos con apertura estrictamente menor que cierre y ambos dentro
de `[0, 1440]` minutos desde medianoche. El sistema NO DEBE aceptar más de un intervalo por
día.

#### Scenario: Un intervalo válido se acepta

- GIVEN un día con apertura 540 y cierre 1080
- WHEN se guarda el horario
- THEN el sistema acepta ese día sin error

#### Scenario: Apertura igual o mayor que cierre se rechaza

- GIVEN un día con apertura 1080 y cierre 540
- WHEN se intenta guardar el horario
- THEN el sistema rechaza la request y no escribe ningún día

### Requirement: Al menos un día abierto

El sistema NO DEBE aceptar un horario donde los 7 días queden cerrados. DEBE rechazar el
guardado completo en ese caso, sin escribir ninguna fila.

#### Scenario: Los 7 días cerrados se rechazan

- GIVEN un payload con los 7 días marcados como cerrados (apertura y cierre nulos)
- WHEN un ADMINISTRADOR del cliente intenta guardarlo
- THEN el sistema rechaza la request y el horario previamente guardado no cambia

### Requirement: Reemplazo atómico de las 7 filas

El sistema DEBE reemplazar el horario completo como una sola operación atómica: exactamente
7 días, uno por cada día de la semana, sin días duplicados ni faltantes. Un payload parcial
o inválido NO DEBE escribir ninguna fila.

#### Scenario: Un payload con un día repetido y otro faltante se rechaza entero

- GIVEN un payload que repite lunes dos veces y omite el domingo
- WHEN se intenta guardar
- THEN el sistema rechaza la request completa y no escribe ninguna fila

#### Scenario: Un guardado válido reemplaza las 7 filas atómicamente

- GIVEN un horario existente y un payload válido con los 7 días
- WHEN se guarda
- THEN las 7 filas anteriores quedan reemplazadas por las 7 nuevas, o ninguna cambia si algo falla a mitad de camino

### Requirement: Permisos de edición y lectura

El sistema DEBE permitir editar el horario únicamente al ADMINISTRADOR del cliente o a ROOT
actuando sobre ese inquilino. DEBE rechazar la escritura de cualquier otro rol autenticado
con 403. DEBE permitir la lectura a cualquier usuario autenticado del tenant. DEBE rechazar
una request sin autenticar con 401.

#### Scenario: Un rol no-admin no puede editar

- GIVEN un actor autenticado del cliente A sin ADMINISTRADOR ni ROOT
- WHEN intenta guardar el horario
- THEN el sistema responde 403 y no escribe nada

#### Scenario: Cualquier usuario autenticado del tenant puede leer

- GIVEN un actor autenticado del cliente A, de cualquier rol
- WHEN solicita el horario laboral
- THEN el sistema devuelve el horario del cliente A

#### Scenario: Una request sin autenticar es rechazada

- GIVEN una request sin credenciales válidas
- WHEN solicita o intenta editar el horario
- THEN el sistema responde 401

### Requirement: Guardar el horario no recalcula el SLA de tickets abiertos

Guardar un horario nuevo NO DEBE recalcular el `sla_vence_at` de tickets HABIL ya abiertos.
Un ticket nuevo, creado después del guardado, DEBE usar el horario nuevo. Un ticket
repriorizado DEBE recalcular su vencimiento con el horario vigente al momento de la
repriorización, anclado a su `createdAt` original (comportamiento existente, sin cambios).

#### Scenario: Un ticket abierto conserva su vencimiento

- GIVEN un ticket HABIL ya abierto con un vencimiento calculado
- WHEN se guarda un horario nuevo para su cliente
- THEN el vencimiento existente del ticket no cambia

#### Scenario: Un ticket repriorizado usa el horario nuevo

- GIVEN un ticket HABIL abierto y un horario recién guardado para su cliente
- WHEN el ticket es repriorizado
- THEN el vencimiento recalculado usa el horario nuevo, anclado al `createdAt` original del ticket

#### Scenario: Un ticket nuevo usa el horario nuevo

- GIVEN un horario recién guardado para un cliente
- WHEN se crea un ticket HABIL nuevo para ese cliente
- THEN el vencimiento se calcula con el horario nuevo

### Requirement: Zona horaria fija Argentina

El sistema DEBE interpretar los minutos de apertura y cierre en hora local Argentina, sin
horario de verano, igual que el calculador de SLA existente. No DEBE existir un parámetro de
zona horaria por cliente.

#### Scenario: El horario se interpreta en hora Argentina

- GIVEN un día con apertura 540 (09:00 hora Argentina)
- WHEN se calcula el vencimiento de un ticket dentro de ese intervalo
- THEN el cálculo usa el offset fijo de Argentina, sin ajuste estacional

### Requirement: La tabla master queda deprecada, no dropeada

`calendario_laboral_dias` (master) DEBE dejar de tener lectores en el código de producción
una vez desplegado este cambio. NO DEBE dropearse. Todo docstring que la describa como
"global, vive en MASTER" DEBE corregirse para reflejar el horario por cliente.

#### Scenario: Ningún camino de producción lee la tabla master

- GIVEN el cambio ya desplegado
- WHEN se calcula el vencimiento de cualquier ticket HABIL, de cualquier cliente
- THEN el cálculo no consulta `calendario_laboral_dias` (master)

### Requirement: Contrato observable del frontend

La pantalla DEBE mostrar una grilla de 7 filas (una por día). El editor DEBE estar
habilitado únicamente para `esAdminCliente` (ROOT o ADMINISTRADOR del cliente); para
cualquier otro rol, la grilla DEBE ser de solo lectura. La validación del formulario DEBE
espejar las mismas reglas del backend (un intervalo por día, rango `[0,1440]`, al menos un
día abierto). Si el intento de guardado deja los 7 días cerrados, la pantalla DEBE mostrar
un mensaje explicando que debe quedar al menos un día abierto, sin enviar la request.

La forma exacta del endpoint HTTP y el nombre de la ruta quedan fijados por el diseño; este
requerimiento describe únicamente el comportamiento observable por el usuario.

#### Scenario: Un rol no-admin ve la grilla de solo lectura

- GIVEN un usuario autenticado del cliente A sin `esAdminCliente`
- WHEN abre la pantalla de horario laboral
- THEN ve las 7 filas pero no puede editar ninguna

#### Scenario: Intentar dejar los 7 días cerrados muestra un mensaje y no envía nada

- GIVEN un ADMINISTRADOR del cliente A editando la grilla
- WHEN marca los 7 días como cerrados e intenta guardar
- THEN la pantalla muestra un mensaje de que debe quedar al menos un día abierto y no envía la request

### Requirement: La viñeta del roadmap declara el cierre

La viñeta del Punto 5 en `docs/roadmap-comercial.md`, cláusula "calendario por cliente con
default 9-18 lun-vie", DEBE pasar de **Desviación** a **Cumplida** una vez que esta
capacidad se despliega, y `scripts/check-roadmap-fresco.mjs` DEBE pasar.

#### Scenario: El chequeo de frescura del roadmap pasa

- GIVEN esta capacidad ya se desplegó y la viñeta del Punto 5 declara Cumplida
- WHEN corre `scripts/check-roadmap-fresco.mjs`
- THEN pasa

## Nota: deuda de Ayuda

Este cambio agrega una pantalla nueva. La escritura de `backend/ayuda/*.md` está en pausa
(`soporte/CLAUDE.md`, desde el 2026-09-07); según esa pausa, solo se requiere anotar la
deuda en el mensaje del commit y en el cuerpo del PR. No se escribe ningún artículo ahora.

## Nota para sdd-archive (no es un requerimiento)

Al archivar este cambio, corregir la fila de citación "calendario por cliente con default
9-18 lun-vie" en `openspec/specs/feriados-cliente/spec.md` (línea 28), que hoy declara
"Desviación declarada, no implementada": pasa a referenciar esta capacidad como Cumplida,
en paralelo a la corrección de la viñeta del roadmap.
