# Proposal: tickets-rbac-4-roles (Change B)

> Store: hybrid · Depende de Change A (`tickets-maquina-estados-observaciones`, ARCHIVED) · Schema: **MASTER**

## Intent

Reemplazar los 5 roles planos legacy (ADMIN/SOPORTE_IT/MANTENIMIENTO/APROBADOR_COMPRAS/SOLICITANTE)
por **4 roles jerárquicos acumulativos** (USUARIO ⊂ COLABORADOR ⊂ TECNICO ⊂ ADMINISTRADOR),
redistribuir los permisos sobre los códigos exactos del contrato de Change A, migrar los usuarios
existentes sin pérdida de capacidades, y habilitar un **admin root multi-tenant** vía flag
`is_global_admin`.

## Why now

Change A dejó una **siembra provisional** de los 4 permisos de transición (`ticket:observar/transicionar/aprobar/rechazar`, b0…014–017) asignados a los roles viejos, solo para ser desplegable. El modelo de roles real que el negocio pidió es el de 4 niveles. Hasta cerrarlo, la autorización granular del flujo de estados no refleja la jerarquía Usuario→Técnico. Además, no existe forma de que un administrador opere sobre todos los tenants (hoy `cliente_id` es NOT NULL y el `TenantGuard` ata a un único tenant).

## Success

- Los 4 roles existen en master con permisos acumulados por seed (sin tocar el `PermissionsGuard`).
- Todo usuario existente queda mapeado a un rol nuevo conservando sus capacidades previas.
- Un usuario con `is_global_admin = true` pasa el `TenantGuard` hacia cualquier tenant.
- La siembra provisional de Change A queda **reemplazada** por la distribución a 4 roles.
- Re-login forzado documentado (los permisos viven embebidos en el JWT).

## Scope

**IN**
- Catálogo de 4 roles nuevos + nuevo permiso `ciclo:gestionar` (b0…018).
- Redistribución `roles_permisos` (reemplaza la provisional de A) — migración idempotente.
- Migración de datos `usuarios_roles`: mapeo 5→4 roles.
- Columna `is_global_admin boolean NOT NULL DEFAULT false` en `master.usuarios` + lectura en `TenantGuard` + claim en JWT.
- Actualización del spec canónico `auth-rbac`.
- Documentar invalidación/force re-login.

**OUT**
- Máquina de estados, observaciones, guards de transición (Change A, cerrado).
- UI de gestión de roles/usuarios (frontend).
- Endpoint para crear ciclos (solo se siembra el permiso; el caso de uso es otro change).
- Rediseño del `PermissionsGuard` (la jerarquía se resuelve por acumulación en seed, no por herencia en runtime).

## Approach

**Master DB + seed acumulativo.** Cada rol superior recibe explícitamente, en la migración seed,
TODOS los permisos del inferior más los propios (vía `SELECT JOIN by codigo`, sin hardcodear UUIDs
de roles, patrón de las migraciones existentes). El guard no cambia: ya evalúa la unión de permisos
del JWT.

**Migración de usuarios:** UPDATE/INSERT en `usuarios_roles` remapeando por `codigo` de rol viejo,
idempotente y segura para correr en master. Roles viejos quedan deprecados (no se borran físicamente
si hay FKs; se desasocian).

**Global admin:** columna nueva + el `TenantGuard` detecta `is_global_admin` y, en vez de exigir el
`cliente_id` propio, resuelve el tenant objetivo solicitado (header/param) tras validar el flag.

### Matriz rol → permisos (acumulativa)

| Permiso | USUARIO | COLABORADOR | TECNICO | ADMINISTRADOR |
|---|:--:|:--:|:--:|:--:|
| ticket:crear | ✅ | ✅ | ✅ | ✅ |
| ticket:editar | ✅ | ✅ | ✅ | ✅ |
| ticket:eliminar | ✅ | ✅ | ✅ | ✅ |
| **comentar / observar (⚠ ver pregunta)** | ⚠ | ⚠ | — | — |
| ticket:ver_todos | — | ✅ | ✅ | ✅ |
| compra:gestionar | — | ✅ | ✅ | ✅ |
| ticket:aprobar (b0…016) | — | ✅ | ✅ | ✅ |
| ticket:rechazar (b0…017) | — | ✅ | ✅ | ✅ |
| compra:aprobar | — | ✅ | ✅ | ✅ |
| ticket:transicionar (b0…015) | — | — | ✅ | ✅ |
| ticket:observar (b0…014) | — | — | ✅ | ✅ |
| ticket:asignar | — | — | ✅ | ✅ |
| ticket:cerrar | — | — | ✅ | ✅ |
| equipo:gestionar | — | — | ✅ | ✅ |
| subtarea:actualizar | — | — | ✅ | ✅ |
| usuario:gestionar | — | — | — | ✅ |
| rol:asignar | — | — | — | ✅ |
| cliente:gestionar | — | — | — | ✅ |
| **ciclo:gestionar (b0…018, NUEVO)** | — | — | — | ✅ |

> `is_global_admin` NO es un permiso: es columna en `usuarios`, evaluada por `TenantGuard`. ADMINISTRADOR no implica global por defecto — el flag se asigna por usuario.

### Mapeo de migración (5 → 4)

| Rol legacy | Rol nuevo | Razón |
|---|---|---|
| ADMIN | ADMINISTRADOR | acceso total |
| SOLICITANTE | USUARIO | rol base |
| SOPORTE_IT | TECNICO | preserva equipo:gestionar, asignar, cerrar |
| MANTENIMIENTO | TECNICO | preserva subtarea:actualizar |
| APROBADOR_COMPRAS | COLABORADOR | preserva compra:aprobar/gestionar + aprobar/rechazar |

## Slicing (PRs encadenados, auto-chain, <400 líneas c/u)

- **PR1 — Roles + permisos:** migración seed (4 roles, `ciclo:gestionar`, redistribución `roles_permisos` reemplazando la provisional de A) + tests de resolución de permisos en login. 📍base.
- **PR2 — Migración de usuarios:** migración de datos `usuarios_roles` (mapeo 5→4) idempotente + tests. Depende de PR1.
- **PR3 — Global admin:** columna `is_global_admin` + `TenantGuard` cross-tenant + claim JWT + tests. Depende de PR1.

Cada PR lleva sus propios tests (work-unit). Re-login forzado se documenta en el deploy de PR1/PR2.

## Riesgos

- **Invalidación de JWT:** los permisos viven en el JWT; tras el cambio de roles TODO usuario debe re-loguear. Mitigación: revocación masiva de refresh tokens + comunicado de deploy.
- **Contrato con Change A:** los UUIDs b0…014–017 son FIJOS. PR1 debe referenciarlos por código exacto, nunca recrearlos.
- **TenantGuard cross-tenant:** abrir acceso multi-tenant es superficie de ataque sensible; el flag debe validarse server-side y auditarse. Definir cómo se indica el tenant objetivo (header vs param) es decisión de design.
- **Migración de usuarios multi-tenant:** corre en master (RBAC es global), pero debe ser idempotente y no borrar asociaciones válidas.
- **PREGUNTA ABIERTA (bloqueante para spec):** ver abajo.

## ⚠ PREGUNTA ABIERTA — observar vs comentar (requiere confirmación del usuario)

Change A hizo que crear una **OBSERVACION** (`ticket:observar`) sobre un ticket APROBADO **dispare**
la transición APROBADO → EN_PROGRESO. Pero el spec dice que el USUARIO "crea observaciones que
aclaran cosas". Si el USUARIO tuviera `ticket:observar`, **dispararía transiciones de estado** —
contradice "solo el Técnico cambia el estado".

**Disyuntiva:** ¿las "observaciones" del USUARIO son en realidad **COMENTARIOs** (tipo de operación
distinto — `COMENTARIO` f0…002 ya existe en el seed — que NO disparan transición), quedando
`ticket:observar` **exclusivo del TECNICO**?

**Recomendación:** SÍ. Separar conceptos: USUARIO/COLABORADOR comentan (aclaran, sin efecto de
estado); solo TECNICO observa (con efecto de transición). Esto mantiene la invariante "solo el
Técnico cambia el estado" sin tocar la máquina de Change A. **Necesita confirmación del usuario
antes de escribir el spec** — define si se siembra `ticket:observar` a USUARIO (NO recomendado) y si
hace falta un permiso/caso de uso `comentar` separado.
