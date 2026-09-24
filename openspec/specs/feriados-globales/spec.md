# Especificación de Feriados Globales

## Purpose

Definir quién puede crear, editar y eliminar la lista global (nacional) de feriados usada
por los cálculos del SLA `HABIL`, quién puede leerla, y la integridad de lectura de las
fechas que almacena. Hoy estas 46 filas existen solo vía migración; esta capacidad hace que
la lista sea editable desde una pantalla sin tocar cómo la consume el SLA.

## Decisión de producto citada

`docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas",
Punto 5 (líneas 197-206): "feriados nacionales AR precargados en el seed más
excepciones por cliente" — **implementado por esta capacidad**: los 46
feriados nacionales ya sembrados siguen siendo el conjunto global que esta capacidad
gestiona; la mitad de "excepciones por cliente" es `feriados-cliente`. La cláusula del
horario semanal de la misma viñeta es una desviación declarada, seguida en la spec de
`feriados-cliente` (fuera de alcance acá: `CalendarioLaboralDia` sigue siendo global).

## Requirements

### Requirement: Escrituras solo-ROOT, exigidas por el backend

El sistema DEBE rechazar las requests de creación, edición y eliminación sobre la lista
global de feriados de cualquier actor sin `is_global_admin: true`, sin importar lo que el
frontend oculte. El chequeo DEBE ocurrir en el pipeline de requests del backend, no solo en
la visibilidad de la UI.

#### Scenario: Un no-ROOT intenta una escritura

- GIVEN un actor autenticado sin `is_global_admin`
- WHEN llama a crear, editar o eliminar sobre un feriado global
- THEN el sistema responde 403 y no se crea, cambia ni elimina ninguna fila

#### Scenario: ROOT realiza una escritura

- GIVEN un actor con `is_global_admin: true`
- WHEN crea, edita o elimina un feriado global
- THEN el sistema aplica el cambio y una lectura posterior lo refleja

### Requirement: Acceso de lectura autenticado

El sistema DEBE permitir que cualquier usuario autenticado, sin importar su rol o su
membresía de cliente, lea la lista global de feriados. DEBE rechazar las requests no
autenticadas.

#### Scenario: Cualquier usuario autenticado lee la lista

- GIVEN un actor autenticado sin ningún rol especial
- WHEN solicita la lista global de feriados
- THEN el sistema responde 200 con las filas actuales

#### Scenario: Sin token

- GIVEN una request sin token
- WHEN solicita la lista global de feriados
- THEN el sistema responde 401

### Requirement: Los feriados sembrados existentes permanecen sin cambios

Desplegar esta capacidad NO DEBE alterar, eliminar ni duplicar las 46 filas ya sembradas
por migraciones previas.

#### Scenario: Las filas sembradas sobreviven al cambio

- GIVEN las 46 filas sembradas por las migraciones existentes
- WHEN esta capacidad se despliega
- THEN las 46 filas siguen existiendo con su `fecha` y `descripcion` originales

### Requirement: Integridad de lectura de fecha

Un feriado guardado para una fecha de calendario dada DEBE leerse de vuelta como esa misma
fecha de calendario, sin ningún desplazamiento UTC-3 introducido por el nuevo camino de
escritura que agrega esta capacidad.

#### Scenario: Ida y vuelta de una fecha guardada

- GIVEN ROOT crea un feriado global para una fecha de calendario específica
- WHEN la lista se lee de vuelta después
- THEN la fecha devuelta es exactamente la misma fecha de calendario que se guardó

### Requirement: Vista de lista ordenada por fecha con badge de origen

La pantalla admin DEBE renderizar la lista global de feriados ordenada por fecha
ascendente, con cada fila llevando un badge verde suave usando el token `--success-light`
existente. No se requiere una grilla mensual de calendario.

#### Scenario: La lista se renderiza ordenada con el badge verde

- GIVEN un conjunto de feriados globales con fechas distintas
- WHEN ROOT abre la pantalla de feriados globales
- THEN las filas aparecen ordenadas por fecha ascendente, cada una con el badge verde
