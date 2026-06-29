# Delta Spec: Auth RBAC — tickets-maquina-estados-observaciones

> **Tipo:** delta
> **Sobre:** `openspec/specs/auth-rbac/spec.md`
> **Change:** `tickets-maquina-estados-observaciones`
> **Fecha:** 2026-06-29
>
> Este delta agrega los 4 permisos granulares de transición de tickets al catálogo
> `master.permisos` y define la siembra mínima provisional a los roles actuales.
> Los behaviors de autorización por arco (403 por permiso ausente) están especificados
> en el delta de tickets-core de este mismo change.
>
> **Contrato inter-change con Change B (`tickets-rbac-4-roles`):** los 4 códigos de permiso
> definidos aquí son FIJOS. Change B MUST referenciar estos mismos códigos exactos al
> redistribuir permisos a los 4 roles nuevos. No renombrar, no reutilizar códigos distintos.

---

## Cambios en modelo de datos

### Delta: Tabla `permisos` (MASTER) — 4 nuevos permisos granulares

Los siguientes 4 permisos MUST ser agregados al catálogo de `master.permisos`.

| codigo | descripcion | UUID determinista |
|--------|-------------|-------------------|
| `ticket:aprobar` | Aprobar un ticket (transición ABIERTO → APROBADO) | b0000000-0000-4000-b000-000000000014 |
| `ticket:rechazar` | Rechazar un ticket (transición ABIERTO → RECHAZADO) | b0000000-0000-4000-b000-000000000015 |
| `ticket:transicionar` | Transicionar tickets en arcos técnicos (APROBADO, EN_PROGRESO, SUSPENDIDO) | b0000000-0000-4000-b000-000000000016 |
| `ticket:observar` | Crear observaciones técnicas sobre tickets | b0000000-0000-4000-b000-000000000017 |

El seed MUST ser idempotente: `INSERT INTO permisos ... ON CONFLICT (codigo) DO NOTHING`.

---

### Delta: Tabla `roles_permisos` (MASTER) — siembra mínima provisional

**Propósito:** Change A incluye una siembra mínima de los 4 permisos sobre los roles actuales
para que el sistema sea funcional y testeable de forma autónoma, antes de que Change B
redistribuya permisos a los 4 roles nuevos (USUARIO, COLABORADOR, TECNICO, ADMINISTRADOR).

Esta siembra es **provisional**. Change B SHOULD reemplazarla al redistribuir permisos.

| Rol (`codigo`) | Permisos asignados |
|----------------|-------------------|
| `ADMIN` | `ticket:aprobar`, `ticket:rechazar`, `ticket:transicionar`, `ticket:observar` |
| `APROBADOR_COMPRAS` | `ticket:aprobar`, `ticket:rechazar` |
| `SOPORTE_IT` | `ticket:transicionar`, `ticket:observar` |
| `MANTENIMIENTO` | `ticket:transicionar`, `ticket:observar` |

La siembra MUST ser idempotente:
`INSERT INTO roles_permisos (rol_id, permiso_id) ... ON CONFLICT (rol_id, permiso_id) DO NOTHING`.

---

## Nuevos Requirements

### Requirement: Catálogo de permisos de transición de tickets

Los 4 permisos granulares MUST existir en `master.permisos` con sus códigos y UUIDs exactos
antes de desplegar cualquier código que referencie `@RequirePermissions('ticket:aprobar')`
o cualquiera de los otros 3. La presencia y forma exacta de los códigos es contrato con Change B.

#### Scenario: Los 4 permisos granulares existen en master con códigos exactos

**Given** la DB master del sistema con el seed de Change A aplicado
**When** se consulta `SELECT codigo FROM permisos WHERE codigo IN ('ticket:aprobar','ticket:rechazar','ticket:transicionar','ticket:observar')`
**Then** MUST retornar exactamente 4 filas con esos códigos
**And** cada fila MUST tener el UUID determinista definido en este delta
**And** `activo = TRUE` y `deleted_at IS NULL` para cada una
**And** MUST NOT existir variantes de nombres distintas
  (ej. `ticket:approve`, `tickets:aprobar`, `ticket:transition`)

#### Scenario: Seed de permisos es idempotente

**Given** una DB master donde los 4 permisos ya existen
**When** el seed de master corre nuevamente (ej. re-deploy)
**Then** MUST NOT crear filas duplicadas en `permisos`
**And** MUST NOT modificar los UUIDs ni los códigos existentes

---

### Requirement: Siembra mínima provisional de roles_permisos

La siembra mínima garantiza que al desplegar Change A el sistema sea funcional sin esperar
Change B. ADMIN obtiene todos los permisos; APROBADOR_COMPRAS obtiene los de aprobación/rechazo;
SOPORTE_IT y MANTENIMIENTO obtienen los técnicos.

#### Scenario: ADMIN tiene los 4 permisos de transición

**Given** la DB master con la siembra mínima de Change A aplicada
**And** un usuario con rol `ADMIN` hace login
**Then** su JWT MUST incluir `ticket:aprobar`, `ticket:rechazar`, `ticket:transicionar`,
  `ticket:observar` en el claim `permisos`

#### Scenario: APROBADOR_COMPRAS tiene permisos de aprobación y rechazo

**Given** la DB master con la siembra mínima de Change A aplicada
**And** un usuario con rol `APROBADOR_COMPRAS` hace login
**Then** su JWT MUST incluir `ticket:aprobar` y `ticket:rechazar` en el claim `permisos`
**And** su JWT MUST NOT incluir `ticket:transicionar` ni `ticket:observar`

#### Scenario: SOPORTE_IT tiene permisos técnicos

**Given** la DB master con la siembra mínima de Change A aplicada
**And** un usuario con rol `SOPORTE_IT` hace login
**Then** su JWT MUST incluir `ticket:transicionar` y `ticket:observar` en el claim `permisos`
**And** su JWT MUST NOT incluir `ticket:aprobar` ni `ticket:rechazar`

#### Scenario: MANTENIMIENTO tiene permisos técnicos (igual que SOPORTE_IT en esta siembra)

**Given** la DB master con la siembra mínima de Change A aplicada
**And** un usuario con rol `MANTENIMIENTO` hace login
**Then** su JWT MUST incluir `ticket:transicionar` y `ticket:observar` en el claim `permisos`
**And** su JWT MUST NOT incluir `ticket:aprobar` ni `ticket:rechazar`

#### Scenario: Siembra de roles_permisos es idempotente

**Given** una DB master donde las asociaciones roles_permisos de esta siembra ya existen
**When** el seed corre nuevamente
**Then** MUST NOT crear filas duplicadas en `roles_permisos`
**And** MUST NOT producir errores de conflicto de PK

#### Scenario: Contrato de códigos — Change B referencia los mismos códigos exactos

**Given** Change B (`tickets-rbac-4-roles`) define permisos para los roles USUARIO,
  COLABORADOR, TECNICO, ADMINISTRADOR
**When** Change B asigna permisos de transición de tickets a esos roles
**Then** MUST referenciar `ticket:aprobar`, `ticket:rechazar`, `ticket:transicionar`,
  `ticket:observar` por sus códigos exactos (NO crear nuevos códigos alternativos)
**And** los UUIDs de esos permisos MUST coincidir con los definidos en Change A
  (b0...0014 a b0...0017)
