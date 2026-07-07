# SDD Explore — tickets-flujo-estados-rbac

**Fecha**: 2026-06-29 · **Status**: done · **Engram**: `sdd/tickets-flujo-estados-rbac/explore`

## 🚨 Hallazgo crítico de seguridad
`PATCH /tickets/:id/estado` (`tickets.controller.ts:338`) NO tiene `@RequirePermissions`. Cualquier usuario autenticado en el tenant puede transicionar cualquier ticket a cualquier estado. Bug activo — se corrige en Change A.

## 1. Máquina de estados actual
`base-ticket-state-machine.ts:20–25`:
```
ABIERTO → EN_PROGRESO, CANCELADO
EN_PROGRESO → RESUELTO, CANCELADO
RESUELTO → CERRADO, EN_PROGRESO (reapertura)
CERRADO, CANCELADO → terminal
```
TERMINAL_STATES (`ticket.entity.ts:8`) = {CERRADO, CANCELADO}. Factory Strategy por tipo; SOPORTE/COMPRAS/EDILICIA caen al fallback Base. `puedeTransicionar()` es función pura. Flujo: `PATCH /tickets/:id/estado` → `TransicionarEstadoUseCase` → `ticket.canTransitionTo()` → `factory.resolve().puedeTransicionar()` → `ticket.updateEstado()` + crea `OperacionTicket(CAMBIO_ESTADO)` en transacción.

## 2. Catálogo de estados (tenant-seed.ts:66–76) — actual vs requerido
- Ya existen: ABIERTO (c0..001), APROBADO (c0..003), RECHAZADO (c0..004), EN_PROGRESO≈"En proceso" (c0..005), RESUELTO (c0..006).
- **Faltan**: SUSPENDIDO (c0..009) y SIN_SOLUCION (c0..010) → agregar al seed.
- Dead data: PENDIENTE_APROBACION (c0..002), CERRADO (c0..007), CANCELADO (c0..008) — quedan sin transiciones.
- APROBADO/RECHAZADO ya están en catálogo pero NO en la máquina base → agregar a las transiciones.

## 3. Observaciones / Operaciones
Tipos existentes (f0..): CAMBIO_ESTADO, COMENTARIO, ASIGNACION, ADJUNTO, AVANCE_EDILICIO, UBICACION_ELIMINADA, EDICION, ELIMINACION. NO existe `CrearObservacionUseCase` ni tipo OBSERVACION. `GET /tickets/:id/operaciones` solo lista el timeline.
**Gap**: agregar tipo_operacion OBSERVACION (f0..009) + `CrearObservacionUseCase` que, en la misma transacción, crea la OBSERVACION y —si `ticket.estadoCodigo === 'APROBADO'`— transiciona a EN_PROGRESO. Nuevo `POST /tickets/:id/observaciones`. "Primera observación" = ticket en APROBADO (condición suficiente, no hay que contar).

## 4. Bloqueo edición/borrado por estado
- `canEdit()` (`ticket.entity.ts:217`): hoy permite editar salvo terminal. `eliminar-ticket.use-case.ts`: NO chequea estado (borra en cualquier estado).
- Requerido: editable/borrable SOLO en ABIERTO.
- Cambios: TERMINAL_STATES → {RESUELTO, SIN_SOLUCION, RECHAZADO}; `canEdit()` → `=== 'ABIERTO'`; agregar `canDelete()`; `EliminarTicketUseCase` carga estado y valida. Supera la decisión previa "delete state-agnostic". Tests de editar/eliminar en otros estados van a RED (esperado).

## 5. RBAC actual vs 4 roles
Roles master: ADMIN, SOPORTE_IT, MANTENIMIENTO, APROBADOR_COMPRAS, SOLICITANTE. Permisos (b0..): ticket:crear/asignar/cerrar/ver_todos/editar/eliminar, compra:aprobar/gestionar, subtarea:actualizar, equipo:gestionar, usuario:gestionar, rol:asignar, cliente:gestionar.
Mapping propuesto: Administrador←ADMIN; Técnico←SOPORTE_IT+MANTENIMIENTO; Colaborador←APROBADOR_COMPRAS; Usuario←SOLICITANTE.
Permisos nuevos: `ticket:aprobar`, `ticket:rechazar`, `ticket:transicionar`, `ticket:observar`, `ciclo:gestionar`.
RBAC es plano hoy → jerarquía vía **permisos acumulados en seed** (recomendado, sin tocar PermissionsGuard).
**Multi-tenant admin** (hoy todos con cliente_id NOT NULL, TenantGuard sin cross-tenant). Opciones: A) admin = de su tenant; B) cliente_id nullable; C) flag `is_global_admin` (recomendado, menos disruptivo); D) tabla separada.

## 6. fechaResolucion
Hoy set al pasar a RESUELTO, null en reapertura. Con RESUELTO terminal, el branch de reapertura es dead code. SIN_SOLUCION/RECHAZADO no tienen fecha de cierre. Opciones: (1) dejar solo RESUELTO; (2) renombrar a `fechaCierre` aplicada a los 3 terminales (recomendado); (3) reusar el nombre para los 3.

## 7. Corte recomendado (2 changes)
- **Change A — `tickets-maquina-estados-observaciones`**: máquina nueva + catálogo (SUSPENDIDO/SIN_SOLUCION) + tipo OBSERVACION + CrearObservacionUseCase (auto-transición) + bloqueo por estado + **fix de seguridad del PATCH estado** + (opcional) fechaResolucion→fechaCierre. Solo DB tenant. ~4-5 días.
- **Change B — `tickets-rbac-4-roles`**: 4 roles + permisos nuevos + asignación acumulada + migración de usuarios + multi-tenant admin. Solo master DB + auth. ~3-4 días.
- Orden: A (define permisos en decoradores) → B (los siembra). Independientes en código; B da el switch-on en prod.

## 8. Preguntas abiertas (decisión antes de propose)
1. Multi-tenant admin: A / C / otra.
2. CERRADO/CANCELADO legacy: congelar o migrar datos a RESUELTO/RECHAZADO.
3. fechaResolucion→fechaCierre (3 terminales) o solo RESUELTO.
4. Autorización por transición: único `ticket:transicionar`+rol en use case, vs permisos granulares por arco.
5. Observación = tipo OBSERVACION nuevo (recomendado) vs reusar COMENTARIO.
6. Jerarquía por permisos acumulados en seed (recomendado).
7. Códigos de rol: USUARIO/COLABORADOR/TECNICO/ADMINISTRADOR (uppercase).
