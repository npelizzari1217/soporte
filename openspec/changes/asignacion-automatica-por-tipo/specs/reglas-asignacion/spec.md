# Reglas de Asignación — Specification

## Purpose

Definir las reglas de asignación por tipo de ticket: qué se guarda (un responsable fijo por tipo), quién puede ser responsable, cómo se configura (API y pantalla de administración), quién puede verla y cómo se detecta una regla rota.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 9 — asignación automática por tipo" y su sub-viñeta "Precisiones del 2026-10-09, al explorar". Esta spec cubre las viñetas D1, D2, D5 (parte de configuración), D8, P1. La tabla de trazabilidad completa del cambio está al final de este archivo; las otras tres specs del cambio la referencian.
>
> Capacidades hermanas: se aplica la regla al crear (`asignacion-automatica-alta`), regula la reasignación (`ticket-asignacion-manual`) y avisa por mail (`notificacion-asignacion`).

## Definiciones

- **Regla**: par (tipo de ticket, responsable). Existe a lo sumo una por tipo. La ausencia de fila significa "ese tipo no tiene regla".
- **Responsable válido para un tipo**: usuario activo, con membresía activa en el cliente, con rol TECNICO o COLABORADOR y con el módulo del tipo (módulo vigente del tipo al momento de evaluar).
- **Regla rota**: regla cuyo responsable ya no es válido para su tipo.
- **Administrador de cliente**: rol ADMINISTRADOR del cliente activo, o ROOT.

## Requirements

### Requirement: R1 Una regla por tipo, con un único responsable fijo

El sistema DEBE guardar, por cada tipo de ticket, como máximo una regla con un único responsable. El tipo DEBE ser la única clave de la regla: NO DEBE existir orden, prioridad, grupos, reparto por turnos ni por carga, ni condición por ubicación u otro atributo del ticket. Fijar un responsable para un tipo que ya tiene regla DEBE reemplazarla.

#### Scenario: Alta de la regla de un tipo

- GIVEN un tipo sin regla y un TECNICO válido para ese tipo
- WHEN un administrador fija a ese técnico como responsable del tipo
- THEN existe exactamente una regla para el tipo con ese responsable

#### Scenario: Reemplazo

- GIVEN un tipo con regla a nombre de un técnico A
- WHEN un administrador fija a un colaborador B válido
- THEN el tipo sigue teniendo una sola regla y su responsable es B

#### Scenario: Sin prioridad ni grupos

- GIVEN el contrato de la API de reglas
- WHEN se inspeccionan el modelo y los DTOs
- THEN no hay campos de orden, prioridad, grupo, ubicación ni lista de responsables

### Requirement: R2 Universo de responsables: TECNICO o COLABORADOR con el módulo del tipo

El sistema DEBE aceptar como responsable de una regla solo a un usuario activo, con membresía activa en el cliente, de rol TECNICO o COLABORADOR y con el módulo del tipo. Un ADMINISTRADOR (o ROOT) NO DEBE poder ser responsable de una regla ni ofrecerse como candidato, aunque la asignación manual de tickets lo acepte.

#### Scenario: Técnico con el módulo

- GIVEN un TECNICO activo con el módulo del tipo
- WHEN se lo propone como responsable
- THEN se acepta

#### Scenario: Colaborador con el módulo

- GIVEN un COLABORADOR activo con el módulo del tipo
- WHEN se lo propone como responsable
- THEN se acepta

#### Scenario: Administrador

- GIVEN un ADMINISTRADOR activo con el módulo del tipo
- WHEN se lo propone como responsable
- THEN se rechaza con 422 y no se ofrece entre los candidatos

### Requirement: R3 La configuración revalida en el servidor

`PUT /reglas-asignacion/:tipoId` con `{ responsableId: uuid | null }` DEBE revalidar la elegibilidad del responsable contra el tipo en el servidor, con independencia de lo que haya mostrado la pantalla. Un responsable no válido DEBE rechazarse con 422 sin modificar la regla existente. `responsableId: null` DEBE eliminar la regla del tipo. Un `tipoId` inexistente DEBE rechazarse con 404.

#### Scenario: Responsable inactivo

- GIVEN un usuario dado de baja
- WHEN se envía su id en el PUT
- THEN responde 422 y la regla del tipo queda como estaba

#### Scenario: Sin membresía en el cliente

- GIVEN un usuario activo sin membresía activa en el cliente
- WHEN se envía su id en el PUT
- THEN responde 422

#### Scenario: Sin el módulo del tipo

- GIVEN un técnico sin el módulo del tipo
- WHEN se envía su id en el PUT
- THEN responde 422

#### Scenario: Vaciar la regla

- GIVEN un tipo con regla
- WHEN el PUT envía `responsableId: null`
- THEN la regla del tipo deja de existir y el tipo queda sin regla

#### Scenario: Tipo inexistente

- GIVEN un `tipoId` que no existe
- WHEN se invoca el PUT
- THEN responde 404

### Requirement: R4 Estado de la regla calculado al leer

`GET /reglas-asignacion` DEBE devolver, por cada tipo activo, `tipoId`, `codigo`, `nombre`, `modulo`, el responsable (id y nombre) si hay regla y un `estado` con valores `SIN_REGLA`, `VALIDA` o `ROTA`. El estado DEBE calcularse en cada lectura con el mismo criterio de elegibilidad que se usa al crear tickets, sin guardar un indicador. Una regla DEBE figurar `ROTA` si su responsable fue dado de baja, perdió la membresía en el cliente o perdió el módulo, incluido el caso en que se edita el módulo del tipo. El GET DEBE devolver además los candidatos válidos agrupados por módulo.

#### Scenario: Regla vigente

- GIVEN un tipo con un responsable válido
- WHEN un administrador lee las reglas
- THEN el estado del tipo es `VALIDA`

#### Scenario: Sin regla

- GIVEN un tipo sin fila de regla
- WHEN se lee
- THEN el estado es `SIN_REGLA` y no hay responsable

#### Scenario: Responsable dado de baja

- GIVEN una regla cuyo responsable fue desactivado
- WHEN se lee
- THEN el estado es `ROTA`

#### Scenario: Responsable sin membresía

- GIVEN una regla cuyo responsable perdió la membresía en el cliente
- WHEN se lee
- THEN el estado es `ROTA`

#### Scenario: Responsable sin el módulo

- GIVEN una regla cuyo responsable perdió el módulo del tipo
- WHEN se lee
- THEN el estado es `ROTA`

#### Scenario: Se edita el módulo del tipo

- GIVEN una regla válida y un tipo cuyo módulo se cambia a uno que el responsable no tiene
- WHEN se lee
- THEN el estado pasa a `ROTA` sin haber tocado la regla

#### Scenario: Los candidatos son solo válidos

- GIVEN usuarios de varios roles y módulos
- WHEN se lee
- THEN los candidatos de cada módulo son solo TECNICO o COLABORADOR activos con ese módulo

### Requirement: R5 Solo el administrador del cliente lee y edita las reglas

Todos los endpoints de reglas DEBEN exigir `AdminClienteGuard` (ADMINISTRADOR del cliente o ROOT). Cualquier otro rol, incluidos TECNICO, COLABORADOR y CLIENTE, DEBE recibir 403 tanto en lectura como en escritura. El acceso DEBE depender de un guard por método y NO DEBE agregar un permiso nuevo a la matriz de permisos.

#### Scenario: Administrador

- GIVEN un ADMINISTRADOR del cliente
- WHEN lee y modifica reglas
- THEN la API responde con éxito

#### Scenario: ROOT

- GIVEN un ROOT
- WHEN lee y modifica reglas
- THEN la API responde con éxito

#### Scenario: Técnico

- GIVEN un TECNICO
- WHEN invoca el GET o el PUT
- THEN responde 403

#### Scenario: Sin sesión

- GIVEN una petición sin sesión válida
- WHEN invoca el GET
- THEN responde 401

### Requirement: R6 Pantalla de administración: una fila por tipo, vacía = sin regla

El sistema DEBE ofrecer la pantalla `/admin/reglas-asignacion`, enlazada desde el menú de administración como "Asignación automática" y visible solo para el administrador del cliente. DEBE mostrar una fila por cada tipo de ticket activo con un selector del responsable. La opción vacía DEBE significar que el tipo no tiene regla. El selector DEBE ofrecer solo candidatos válidos para el tipo de la fila. Una fila con regla rota DEBE marcarse con una señal visible distinta de la de una fila válida o vacía. Si el servidor rechaza un cambio, la pantalla DEBE informarlo sin perder la regla anterior.

#### Scenario: Una fila por tipo activo

- GIVEN cinco tipos activos y uno inactivo
- WHEN el administrador abre la pantalla
- THEN ve cinco filas, una por tipo activo

#### Scenario: Fila vacía

- GIVEN un tipo sin regla
- WHEN se muestra su fila
- THEN el selector está en la opción vacía

#### Scenario: Regla rota visible

- GIVEN un tipo con regla `ROTA`
- WHEN se muestra la pantalla
- THEN la fila lleva la marca de regla rota y un texto que indica que el responsable ya no es válido

#### Scenario: Solo candidatos válidos

- GIVEN el selector de un tipo
- WHEN se despliega
- THEN no aparecen ADMINISTRADOR, usuarios inactivos ni usuarios sin el módulo del tipo

#### Scenario: Cambio rechazado

- GIVEN que el servidor responde 422 al guardar
- WHEN el administrador elige un responsable
- THEN la pantalla muestra el error y conserva la regla anterior

#### Scenario: Acceso de un no administrador

- GIVEN un usuario que no es administrador del cliente
- WHEN entra a la ruta
- THEN no ve la pantalla ni el ítem de menú

### Requirement: R7 Persistencia aditiva y reversible

La regla DEBE persistirse en la base del inquilino, con una fila por tipo (clave única por `tipo_id`) y el responsable como referencia blanda al usuario maestro. La migración DEBE ser aditiva y DEBE incluir su `rollback.sql`. Vaciar la tabla DEBE devolver la creación de tickets al comportamiento previo al cambio.

#### Scenario: Unicidad por tipo

- GIVEN una regla existente para un tipo
- WHEN se intenta insertar una segunda fila para el mismo tipo
- THEN la base la rechaza

#### Scenario: Reversión

- GIVEN la migración aplicada
- WHEN se ejecuta `rollback.sql`
- THEN la tabla desaparece sin afectar tablas previas

## Declaración de lo no implementado

Ninguna viñeta de la decisión queda sin implementar. Quedan fuera por decisión explícita, y no son desvíos: reglas por ubicación, grupos y reparto (la propia decisión los excluye), el trabajo compartido entre técnicos (punto 12), `TicketEdilicia.personalAsignadoId` y las alertas proactivas de regla rota.

## Trazabilidad (todas las specs del cambio)

D = viñetas principales de la decisión; P = "Precisiones del 2026-10-09, al explorar", ambas en el orden de la decisión.

| # | Viñeta de la decisión (resumen) | Requerimiento(s) |
|---|---|---|
| D1 | Regla solo por tipo de ticket; sin ubicación | `reglas-asignacion`: R1 |
| D2 | Un responsable fijo por tipo; sin orden, prioridad, grupos ni reparto | `reglas-asignacion`: R1, R7 |
| D3 | Todos los canales: alta normal, Soporte con equipo, Edilicia, formulario público con QR, preventivos | `asignacion-automatica-alta`: A6 |
| D4 | Con regla nace Asignado; sin regla, Nuevo sin asignar; la bitácora registra al sistema por la regla del tipo | `asignacion-automatica-alta`: A1, A2, A3, A6, A7, A8 |
| D5 | Responsable inválido: se crea igual, Nuevo sin asignar; la pantalla marca la regla rota; solo se elige a alguien válido | `reglas-asignacion`: R3, R4, R6; `asignacion-automatica-alta`: A4, A5 |
| D6 | Reasignable hasta el cierre; un ticket cerrado no se reasigna | `ticket-asignacion-manual`: M1, M2, M4, M5 |
| D7 | Mail en cada asignación, por regla o manual, con la cuenta del cliente; sin correo configurado, asigna sin mail | `notificacion-asignacion`: N1, N2, N4, N5, N6 |
| D8 | Configura el ADMINISTRADOR (y ROOT) en pantalla nueva: una fila por tipo, fila vacía = sin regla | `reglas-asignacion`: R3, R5, R6 |
| P1 | Responsable TECNICO o COLABORADOR con el módulo del tipo; no ADMINISTRADOR | `reglas-asignacion`: R2, R4 |
| P2 | "Cerrado" = Cerrado y Cancelado; Resuelto se reasigna | `ticket-asignacion-manual`: M1, M2, M4 |
| P3 | El mail sale siempre, también en la autoasignación | `notificacion-asignacion`: N3 |
| P4 | Asignar a mano un ticket en Nuevo lo pasa a Asignado | `ticket-asignacion-manual`: M3 |
| X1 | Mejora derivada: SLA de primera respuesta no se altera | `asignacion-automatica-alta`: A9; `ticket-asignacion-manual`: M3 |
| X2 | Mejora derivada: revisar los comentarios "el sistema nunca auto-asigna" | `ticket-asignacion-manual`: M6 |
