# Propuesta: Modelo de datos inicial — tres flujos

> Contexto, stack y convenciones: ver `openspec/project.md`. No se duplican aquí.

## Intent

Diseñar el modelo de datos relacional inicial (PostgreSQL) del Sistema de Gestión de Tickets con tres flujos: **Soporte/IT**, **Compras** y **Reparaciones Edilicias**. El origen es el DER legacy exportado de WinDev/WebDev (`soporte.wda`), que es un **retrato del sistema viejo, NO un esquema válido**. Necesitamos un esquema normalizado, auditable y agnóstico al cliente que sirva de base para todo el backend.

## Scope

**In:** esquema lógico de las tres áreas; entidades núcleo, de ticket, permisos y satélites por flujo; corrección de los defectos del DER legacy; auditoría + soft delete global; adjuntos vía `IFileStorage`.

**Out:** implementación de código, migración de datos legacy, frontend, y autenticación (se abordan en cambios posteriores). Este cambio es SOLO el modelo de datos / esquema.

## Approach

**Ticket unificado** con discriminador `tipos_ticket` (`codigo`: SOPORTE | COMPRAS | EDILICIA) más una **tabla satélite 1:1 por flujo**. Evita columnas nulas dispersas y mantiene la normalización.

Resumen de entidades (el detalle va a sdd-spec):
- **Núcleo:** `usuarios` (reconstruida), `clientes`, `ciclos_vigentes`, `ciclos_cliente`, `tipos_ticket`.
- **Ticket:** `tickets` (número legible, prioridad, `solicitante_id`, `asignado_id`, estado; sin `id_cliente` redundante), `operaciones_ticket` (timeline), `archivos` (polimórfica, IFileStorage).
- **Permisos:** `modulos`, `permisos_usuario_modulo`, `usuario_tipos_ticket`.
- **Satélite IT:** `equipos_informaticos`, `componentes_equipo`, `tipos_componente`, `ticket_soporte` (1:1).
- **Satélite Compras (NUEVO):** `ticket_compra` (1:1, `estado_aprobacion`/`aprobado_por`), `items_compra` (1:N), `presupuestos` (1:N, `archivo_id`).
- **Satélite Edilicias (NUEVO):** `ubicaciones`, `ticket_edilicia` (1:1, `ubicacion_id`, `personal_asignado_id`), `subtareas_edilicia` (1:N). El `porcentaje_avance` es **derivado** (completadas/total), no manual; cada cambio se registra en `operaciones_ticket`.

Defectos del legacy corregidos: `usuarios` faltaba (abortó por campo Contraseña) → se reconstruye con `password_hash` (argon2id); cero auditoría → se agrega a todo; blobs (Logo, Adjunto LONGVARBINARY) → tabla `archivos` + IFileStorage; Compras/Edilicias no existían → se diseñan; redundancia `IDCliente` + `IDCicloXCliente` → se elimina `id_cliente` (cliente derivado vía ciclo); tipos WinDev→PG y nombres con acentos/ñ → snake_case.

## Decisiones tomadas

Diseñar los 3 flujos ya; Ticket unificado + discriminador + satélites 1:1; adjuntos vía IFileStorage; auditoría + soft delete global; avance edilicio por sub-tareas con porcentaje derivado; personal de mantenimiento = usuarios internos con rol.

## Decisiones pendientes (sdd-design)

1. Estrategia de IDs: `bigint` identity vs `UUIDv7`.
2. Permisos: RBAC moderno con guards de Nest (probable, dados roles admin/soporte/mantenimiento/aprobador/solicitante) vs matriz ACL legacy.

## Risks

- Migración de datos del sistema viejo (fuera de alcance de esta propuesta).
- Volumen de adjuntos legacy a migrar a storage.
- Definición de la máquina de estados de tickets por tipo.
