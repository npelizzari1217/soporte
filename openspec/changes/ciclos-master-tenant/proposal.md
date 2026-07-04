# Proposal: ciclos-master-tenant

## Intent

Hoy el modelo de ciclos está roto en el eje master↔tenant. El tenant crea ciclos propios de cero en `ciclos_cliente` en vez de ELEGIR uno del catálogo global `ciclos_vigentes`, y el link a master es un placeholder (`cicloVigenteId = ciclo.id`, nunca apunta al ciclo master real). Los usuarios regulares no pueden ni leer su ciclo activo (`GET /ciclos` exige `ciclo:gestionar` → 403 silencioso), y tickets/compras/reparaciones se crean con `cicloId: null` en lugar de filtrarse por el ciclo activo del tenant.

**Éxito**: un catálogo MASTER gestionado por el admin global; cada tenant ACTIVA un ciclo real del catálogo (uno solo activo, activar desactiva el anterior); todos los roles leen el activo de su cliente; y tickets/compras/reparaciones toman ese ciclo automáticamente. Sin migración (no hay datos productivos).

## Scope (in-scope)

- CRUD del catálogo MASTER (`ciclos_vigentes`): exponer listar/editar/desactivar sobre el guard global ya deployado (#34).
- Flujo tenant "elegir + activar": reemplazar la creación libre por selección de un `cicloVigenteId` real del catálogo; corregir el link placeholder; validar existencia en master.
- Permiso de LECTURA del ciclo activo para todos los roles del tenant (hoy bloqueado).
- Cablear que tickets/compras/reparaciones tomen el ciclo activo del tenant (auto-inyección en creación + filtro en listado).
- Frontend: UI de catálogo master, UI de selección/activación en tenant (con combo cliente+ciclo para el operador global), y lectura del activo para usuarios regulares.
- Fix del bug de `TenantContext.tsx`: hoy pide `GET /ciclos` para todos → 403 silenciado deja `cicloId=null`.

## Out-of-scope

- Migración de datos del placeholder (no hay datos productivos).
- Tabla/vista de historial nueva: los `ciclos_cliente` inactivos alcanzan como historial.
- Guard del catálogo master (ya hecho y deployado, #34 — Fase 1).
- Detalle técnico de la solución (contratos, esquemas, endpoints) → eso es sdd-design.

## Approach — plan faseado

El cambio es grande y cruza seguridad, dominio, datos y UI. Se recomienda dividir en PRs por naturaleza y riesgo:

- **Fase 1 — Guard catálogo master**: HECHO y deployado (#34).
- **Fase 2 — CRUD catálogo master (backend)**: exponer listar/editar/desactivar sobre `ciclos_vigentes`. Bajo riesgo, habilita a las demás.
- **Fase 3 — Flujo elegir+activar en tenant (backend)**: link real a master + permiso de lectura del activo para todos los roles. Núcleo de la corrección; mayor riesgo de dominio.
- **Fase 4 — Ciclo en tickets/compras/reparaciones**: auto-inyección del activo + filtro por ciclo. Toca flujos existentes en producción → aislar.
- **Fase 5 — Frontend**: UI catálogo master + selección tenant + lectura del activo (incluye fix `TenantContext`).

Fases 2 y 3 son dependencia dura de la 4 y la 5.

## Risks / open questions

- **Bug `TenantContext.tsx`** (líneas 84-98): 403 silenciado para roles regulares deja `cicloId=null`. Debe corregirse junto al permiso de lectura (Fase 3/5).
- **Deuda de wiring incompleto**: el repo tiene puertos de dominio más completos que lo expuesto en use cases/controllers (patrón recurrente). Verificar que exponer lo faltante no arrastre comportamiento inesperado.
- **Fase 4 toca flujos productivos** (tickets/compras/reparaciones): riesgo de regresión al cambiar el default de `cicloId`. Requiere pruebas de no-regresión.
- **Contrato `POST /ciclos`**: cambiar de "crear" a "elegir" puede romper clientes actuales; decidir en design si es breaking o endpoint nuevo.
