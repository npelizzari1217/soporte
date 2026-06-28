# Delta Spec: Auth RBAC — tickets-editar-borrar

> **Tipo:** delta  
> **Sobre:** `openspec/specs/auth-rbac/spec.md`  
> **Change:** `tickets-editar-borrar`  
> **Fecha:** 2026-06-27  
>
> Este archivo describe únicamente los REQUISITOS ADICIONALES que deben ser
> verdaderos después de aplicar el change. Los requirements de la spec canónica
> siguen vigentes sin modificación. No describe implementación — solo comportamiento
> observable y verificable.

---

## Cambios en modelo de datos

### Delta: Tabla `permisos` (MASTER) — permisos adicionales

Se agregan dos permisos atómicos al catálogo `master.permisos`:

| codigo | Descripción |
|--------|-------------|
| `ticket:editar` | Editar campos de datos de un ticket (titulo, descripcion, prioridad, tipo, ciclo, fechaVencimiento) |
| `ticket:eliminar` | Dar de baja lógica (soft delete) un ticket |

Los UUIDs MUST ser deterministas con prefijo `b0000000-0000-4000-b000-` para
alinearse con el patrón de la migración `20260623010000_seed_rbac_base`:
- `ticket:editar` → `b0000000-0000-4000-b000-000000000012`
- `ticket:eliminar` → `b0000000-0000-4000-b000-000000000013`

### Delta: Tabla `roles_permisos` (MASTER) — asignación a roles

| Permiso | Roles que lo reciben |
|---------|---------------------|
| `ticket:editar` | `ADMIN`, `SOPORTE_IT` |
| `ticket:eliminar` | `ADMIN` (exclusivo) |

---

## Requirements

### Requirement: Nuevos permisos ticket:editar y ticket:eliminar en catálogo master

#### Scenario: Permisos sembrados en migración master

**Given** la migración de seeds RBAC de este change se ejecuta sobre la DB master  
**When** la migración completa  
**Then** `master.permisos` MUST contener una fila con `codigo = 'ticket:editar'`  
**And** `master.permisos` MUST contener una fila con `codigo = 'ticket:eliminar'`  
**And** ambas filas MUST tener `deleted_at IS NULL`  
**And** el seed MUST ser idempotente (`INSERT ... ON CONFLICT (codigo) DO NOTHING`)

#### Scenario: UUID determinista de permisos nuevos

**Given** la migración se ejecuta sobre cualquier instancia de la DB master  
**When** se consulta `master.permisos WHERE codigo IN ('ticket:editar', 'ticket:eliminar')`  
**Then** la fila de `ticket:editar` MUST tener `id = 'b0000000-0000-4000-b000-000000000012'`  
**And** la fila de `ticket:eliminar` MUST tener `id = 'b0000000-0000-4000-b000-000000000013'`

---

### Requirement: Asignación de permisos a roles

#### Scenario: Rol ADMIN tiene ambos permisos nuevos

**Given** la migración de este change se aplica  
**When** se consulta `master.roles_permisos` para el rol con `codigo = 'ADMIN'`  
**Then** MUST existir una fila asociando ADMIN con `ticket:editar`  
**And** MUST existir una fila asociando ADMIN con `ticket:eliminar`

#### Scenario: Rol SOPORTE_IT tiene ticket:editar pero NO ticket:eliminar

**Given** la migración de este change se aplica  
**When** se consulta `master.roles_permisos` para el rol con `codigo = 'SOPORTE_IT'`  
**Then** MUST existir una fila asociando SOPORTE_IT con `ticket:editar`  
**And** MUST NOT existir una fila asociando SOPORTE_IT con `ticket:eliminar`

#### Scenario: Otros roles no reciben los permisos nuevos por defecto

**Given** la migración de este change se aplica  
**When** se consultan los roles `MANTENIMIENTO`, `APROBADOR_COMPRAS`, `SOLICITANTE` en `master.roles_permisos`  
**Then** MUST NOT existir filas que asocien ninguno de esos roles con `ticket:editar`  
**And** MUST NOT existir filas que asocien ninguno de esos roles con `ticket:eliminar`

---

### Requirement: Permisos efectivos reflejados en el JWT

Este requirement extiende el "Requirement: Permisos efectivos como unión de roles"
de la spec canónica para los dos permisos nuevos.

#### Scenario: Usuario con rol SOPORTE_IT incluye ticket:editar en JWT

**Given** un usuario con rol `SOPORTE_IT` y sin rol `ADMIN`  
**When** el usuario hace login exitosamente  
**Then** el payload del JWT MUST contener `'ticket:editar'` en el claim `permisos`  
**And** el claim `permisos` MUST NOT contener `'ticket:eliminar'`

#### Scenario: Usuario con rol ADMIN incluye ambos permisos nuevos en JWT

**Given** un usuario con rol `ADMIN`  
**When** el usuario hace login exitosamente  
**Then** el payload del JWT MUST contener `'ticket:editar'` en el claim `permisos`  
**And** el payload del JWT MUST contener `'ticket:eliminar'` en el claim `permisos`

---

### Requirement: Enforcement en endpoints — rechazo por falta de permiso

#### Scenario: Usuario sin ticket:editar recibe 403 en PATCH /tickets/:id

**Given** un usuario autenticado cuyo JWT no contiene `'ticket:editar'` en `permisos`  
**When** envía `PATCH /tickets/{id}` con un body válido  
**Then** `PermissionsGuard` MUST rechazar la request con `HTTP 403`  
**And** MUST NOT ejecutar el caso de uso de edición  
**And** MUST NOT modificar ningún dato en la DB

#### Scenario: Usuario sin ticket:eliminar recibe 403 en DELETE /tickets/:id

**Given** un usuario autenticado cuyo JWT no contiene `'ticket:eliminar'` en `permisos`  
**When** envía `DELETE /tickets/{id}`  
**Then** `PermissionsGuard` MUST rechazar la request con `HTTP 403`  
**And** MUST NOT ejecutar el caso de uso de eliminación  
**And** MUST NOT modificar ningún dato en la DB

#### Scenario: Usuario SOPORTE_IT puede editar pero NO puede eliminar

**Given** un usuario con rol `SOPORTE_IT` y sin rol `ADMIN`  
**And** existe un ticket activo del mismo tenant  
**When** envía `PATCH /tickets/{id}` → la respuesta MUST ser `HTTP 200` (o 422/404 por reglas de dominio, nunca 403)  
**When** envía `DELETE /tickets/{id}` → la respuesta MUST ser `HTTP 403`

---

### Requirement: Seed idempotente de la migración de permisos

#### Scenario: Re-ejecución de la migración no duplica permisos ni asignaciones

**Given** la migración de seeds RBAC de este change ya fue ejecutada  
**When** la migración se ejecuta por segunda vez  
**Then** `master.permisos` MUST NOT contener filas duplicadas con `codigo = 'ticket:editar'` ni `'ticket:eliminar'`  
**And** `master.roles_permisos` MUST NOT contener filas duplicadas para las asignaciones nuevas  
**And** la migración MUST completar sin error
