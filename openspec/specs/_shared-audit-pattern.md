# Patrón compartido: Campos de auditoría y soft delete

> Referenciado por todos los spec files de `modelo-datos-tres-flujos`.
> Toda entidad del sistema DEBE incluir estos campos sin excepción.

## Campos de auditoría (aplican a TODAS las tablas)

| Columna | Tipo Postgres | Nullability | Valor por defecto | Descripción |
|---------|--------------|-------------|-------------------|-------------|
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | Timestamp de creación (con zona horaria UTC) |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | Timestamp de última modificación; la app lo actualiza en cada UPDATE |
| `deleted_at` | `TIMESTAMPTZ` | NULL | — | NULL = registro activo; NOT NULL = soft-deleted |

## Requirement: Auditoría universal

### Scenario: Creación de cualquier entidad registra timestamps
**Given** un caso de uso crea una fila en cualquier tabla del sistema  
**When** la inserción se confirma en la DB  
**Then** `created_at` y `updated_at` MUST ser `now()` al momento de la inserción  
**And** `deleted_at` MUST ser `NULL`

### Scenario: Actualización registra updated_at
**Given** un caso de uso modifica una fila existente  
**When** el UPDATE se confirma en la DB  
**Then** `updated_at` MUST reflejar el timestamp de la modificación  
**And** `created_at` MUST permanecer sin cambios

## Requirement: Soft delete global

### Scenario: Baja lógica setea deleted_at
**Given** un caso de uso solicita eliminar una entidad  
**When** la operación se ejecuta  
**Then** la fila MUST permanecer físicamente en la DB  
**And** `deleted_at` MUST ser seteado al `now()` del momento de la operación  
**And** los casos de uso de lectura MUST excluir filas con `deleted_at IS NOT NULL` en queries de negocio

### Scenario: No existe borrado físico
**Given** cualquier entidad del sistema  
**When** se solicita su eliminación por cualquier medio (API, script de migración)  
**Then** la DB MUST NOT ejecutar `DELETE` sobre la fila  
**And** el borrado MUST ser modelado exclusivamente como `UPDATE deleted_at = now()`

## Patrón de IDs (aplica a todas las PKs y FKs)

- Tipo Postgres: `uuid` nativo (NUNCA `varchar(36)`)
- Algoritmo: **UUIDv7** (timestamp-prefixed, monotónicamente creciente)
- Generación: **en el backend** (librería `uuidv7`), antes del INSERT
- El default de DB (`gen_random_uuid()`) es SOLO red de seguridad, no la fuente primaria
- Toda FK referencia el `uuid` PK de la tabla destino

### Scenario: PK generado en backend antes del insert
**Given** cualquier caso de uso que crea una entidad  
**When** prepara el objeto a persistir  
**Then** el ID MUST ser generado como UUIDv7 en la capa de aplicación/infraestructura  
**And** el tipo en Postgres MUST ser `uuid` nativo, nunca `varchar`

### Scenario: ID no es secuencial/enumerable
**Given** el sistema crea múltiples tickets u otras entidades en secuencia  
**When** un cliente de la API observa los IDs en respuestas consecutivas  
**Then** los IDs MUST NOT permitir inferir el volumen de datos ni predecir el siguiente ID  
**And** los IDs MUST mantener ordenabilidad temporal (UUIDv7 timestamp prefix)
