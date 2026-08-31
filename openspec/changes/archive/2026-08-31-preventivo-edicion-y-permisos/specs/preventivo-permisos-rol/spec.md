# Preventivo Permisos Rol Specification

## Purpose

Define qué rol de usuario administra el módulo de mantenimiento preventivo:
quién ve, crea, edita y da de baja planes, y quién queda excluido.

## Requirements

### Requirement: Rol que administra el módulo Preventivo

El sistema DEBE otorgar los cuatro permisos `PREVENTIVO:LECTURA`,
`PREVENTIVO:ALTAS`, `PREVENTIVO:MODIFICACION` y `PREVENTIVO:BORRADO` al rol
COLABORADOR, y NO DEBE otorgar ninguno de los cuatro al rol TECNICO. El rol
ADMINISTRADOR NO necesita celdas propias: `resolverScope` lo bypasea (R2 del
dominio de permisos).

#### Scenario: COLABORADOR administra el módulo completo

- GIVEN un usuario con rol COLABORADOR
- WHEN pide `GET /preventivo/planes`, `POST /preventivo/planes`,
  `PATCH /preventivo/planes/:id` o da de baja un plan
- THEN cada operación se autoriza (la celda `PREVENTIVO:*` correspondiente
  está presente en su matriz de permisos)

#### Scenario: TECNICO no ve el módulo (hermano invertido)

- GIVEN un usuario con rol TECNICO
- WHEN pide cualquiera de las cuatro operaciones sobre `/preventivo/planes`
- THEN el sistema rechaza la operación por falta de permiso — ninguna de las
  cuatro celdas `PREVENTIVO:*` está presente en su matriz

#### Scenario: ADMINISTRADOR conserva acceso completo por bypass

- GIVEN un usuario con rol ADMINISTRADOR
- WHEN pide cualquiera de las cuatro operaciones sobre `/preventivo/planes`
- THEN el sistema autoriza la operación por `resolverScope`, sin depender de
  celdas propias en su matriz

### Requirement: Migración de permisos ya otorgados

El sistema DEBE mover, mediante migración idempotente, las celdas
`PREVENTIVO:*` ya otorgadas a usuarios TECNICO existentes hacia COLABORADOR,
sin dejar a ningún usuario que ya tenía el permiso sin acceso equivalente
post-migración, y sin duplicar celdas si la migración corre más de una vez.

#### Scenario: Backfill mueve las celdas existentes

- GIVEN un usuario TECNICO preexistente con las cuatro celdas `PREVENTIVO:*`
  otorgadas por el backfill `20260825120100`
- WHEN corre la migración de swap de permisos
- THEN el usuario pierde las cuatro celdas TECNICO y, si además tiene o pasa
  a tener rol COLABORADOR, las conserva bajo ese rol; ningún usuario
  COLABORADOR activo queda sin las cuatro celdas tras la migración

#### Scenario: Migración es idempotente

- GIVEN la migración de swap de permisos ya corrió una vez sobre un tenant
- WHEN se ejecuta nuevamente sobre el mismo tenant
- THEN el estado final de la matriz de permisos no cambia (ninguna fila
  duplicada, ningún usuario afectado dos veces)

### Requirement: Documentación de Ayuda refleja el rol correcto

El sistema DEBE describir en `backend/ayuda/permisos-y-roles.md` y en
`backend/ayuda/mantenimiento-preventivo.md` que COLABORADOR administra el
módulo Preventivo y que TECNICO no tiene acceso, en el mismo commit que
introduce el cambio de permisos.

#### Scenario: La Ayuda deja de afirmar que Colaborador está excluido

- GIVEN el commit que aplica el swap de permisos
- WHEN se lee `permisos-y-roles.md` después de ese commit
- THEN el documento ya no contiene la afirmación "ni siquiera Colaborador" y
  describe a COLABORADOR como el rol que administra el módulo
