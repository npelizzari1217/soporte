# Proposal — `root-tenant-admin`

> SDD phase: **PROPOSAL**. Este documento define intención, alcance, dirección y decisiones.
> NO escribe código ni el contrato fino (eso es spec/design).
> Proyecto: `soporte` — backend NestJS + Prisma + PostgreSQL (Clean/Screaming, database-per-tenant), frontend Next.js.
> Fecha: 2026-07-31.

---

## 1. Intent (qué problema, por qué ahora, qué es éxito)

Hoy la plataforma tiene una figura de "superusuario de plataforma" — el usuario capaz de operar sobre tenants ajenos vía `X-Tenant-Id` — pero esa figura es **implícita, frágil y a medio construir**:

- **No tiene nombre propio.** Se llama `is_global_admin` (columna booleana en `master.usuarios`), un identificador técnico que se confunde constantemente con el rol RBAC `ADMINISTRADOR`. Los docblocks del código gritan la confusión ("is_global_admin=true NO implica rol ADMINISTRADOR y viceversa" — `global-admin.guard.ts:11-12`, `prisma_master/schema.prisma:94-95`). Esa aclaración defensiva repetida ES el síntoma: el modelo mental no está formalizado.
- **No se puede crear otro.** El único camino para elevar el flag es un `UPDATE` SQL manual hardcodeado a un email concreto (`prisma_master/migrations/20260630000000_set_global_admin_nestor/migration.sql`), que además **asume que la fila del usuario ya existe** (ningún seed la crea). Bootstrap frágil: si esa fila no preexiste, la migración no hace nada y la plataforma queda sin superusuario. En `crear-usuario.use-case.ts:69` el flag está **hardcodeado en `false`** — por diseño, no hay camino de aplicación para nacer un superusuario.
- **El "salto entre tenants" está roto en las vistas de negocio.** El superusuario puede elegir un cliente en el selector, pero las vistas operativas (tickets, compras, equipos, reparaciones) NO propagan `X-Tenant-Id` (`use-tickets.ts:53` llama `apiFetch('tickets')` sin headers; `apiFetch` no inyecta el header globalmente). Resultado: el backend resuelve `resolveOwnTenant()` y el superusuario ve SU tenant, no el elegido. El feature central de la figura no funciona en el uso real.
- **Hay un agujero de aislamiento cross-tenant.** `asignar-rol.use-case.ts` (confirmado, líneas 35-61) NO recibe ni valida `clienteId` del usuario objetivo — a diferencia de `baja-usuario.use-case.ts:69-71` que sí lo hace. Un `ADMINISTRADOR` de un tenant podría asignar roles a un usuario de OTRO tenant.

**Por qué ahora:** la figura ya existe en producción (hay un superusuario vía UPDATE), la operación multi-tenant ya está en uso, y cada uno de estos puntos es una deuda de seguridad activa. Formalizar la figura, cerrar el bootstrap frágil, tapar el agujero de aislamiento y arreglar el salto de tenant son interdependientes: tocan el mismo dominio (identidad de plataforma vs. authz de tenant) y conviene resolverlos como un cuerpo coherente.

**Cómo se ve el éxito:**
1. La figura tiene nombre propio ("root") en código de negocio y UI, **manteniéndose ortogonal al RBAC** (root = capacidad de plataforma; roles = authz dentro del tenant).
2. Existe un camino de aplicación auditado y con authz férrea para que **un root cree otro root** (y solo un root puede hacerlo).
3. El primer root nace de un mecanismo **seguro, idempotente y reproducible** (no de un UPDATE atado a un email).
4. `asignar-rol` valida el tenant del usuario objetivo — cerrado el gap de aislamiento.
5. Un root con un cliente seleccionado ve realmente los datos de ESE cliente en TODAS las vistas operativas (el `X-Tenant-Id` se propaga de forma centralizada, no parche por parche).
6. La UI expone la creación de root **solo para roots**, y el flujo del selector queda consistente.
7. Todo con strict TDD (RED→GREEN), tipado estricto, sin regresión de seguridad.

---

## 2. Scope

### 2.1 In-scope

**Backend**
- **D1/D2 (ver §4).** Formalizar la figura "root" con nombre propio (código + UI). La decisión de RENOMBRAR la columna `is_global_admin` vs. tratar "root" como terminología sobre la columna existente queda ABIERTA para el design (§5, O1).
- Endpoint **"root crea root"**: un root puede crear un usuario con `root=true`. `is_global_admin` deja de estar hardcodeado en `false` SOLO por este camino nuevo, gateado con authz férrea (dirección propuesta: `GlobalAdminGuard`; el design afina — §5, O3). El path existente `POST /usuarios` (gateado por `usuario:gestionar`) sigue creando SIEMPRE con `root=false`.
- **Bootstrap seguro del primer root**: reemplazar el `UPDATE` frágil por un mecanismo idempotente y reproducible (seed desde env o comando CLI — decisión del design, §5, O2).
- **Fix de aislamiento en `asignar-rol`**: recibir y validar el `clienteId`/tenant del usuario objetivo, alineado con el patrón de `baja-usuario.use-case.ts:69-71`. Test de regresión que FALLA antes del fix (RED) demostrando la fuga cross-tenant.

**Frontend**
- UI de **creación de root**, visible SOLO para roots (no para `ADMINISTRADOR`), incluyendo el campo/flag correspondiente.
- **Fix del tenant-switching en vistas operativas**: propagar `X-Tenant-Id` cuando un root tiene un cliente seleccionado, **centralizado** en `apiFetch`/provider (no parcheando hook por hook). Cubre tickets, compras, equipos, reparaciones. Enfoque exacto → design (§5, O4).
- Consistencia del flujo del selector de tenant para roots.

**Transversal**
- Terminología "root" consistente en dominio, DTOs, guards, UI y mensajes.
- Tests atómicos por criterio (strict TDD), incluyendo los caminos de seguridad (un `ADMINISTRADOR` NO puede crear root ni setear el flag; un root de tenant ajeno no puede filtrar datos, etc.).

### 2.2 Out-of-scope (explícito)

- **Restringir que un `ADMINISTRADOR` cree otro `ADMINISTRADOR`.** El hallazgo lo detecta (`ROLES_VALIDOS` incluye `ADMINISTRADOR` y no hay guard que lo impida), pero es una decisión de política RBAC **independiente** de la figura root. Cambiarla ahora ampliaría el blast radius sin necesidad. → Fase 2 (§7).
- **Quitar/revocar roles.** No existe endpoint para quitar roles (solo asignar). Es una carencia real pero ortogonal a root. → Fase 2 (§7).
- **Convertir root en un rol RBAC.** Decisión ya CERRADA por el usuario: root se MANTIENE como flag ortogonal, NO se modela como rol. (D1)
- **Rediseñar el modelo RBAC** (4 roles jerárquicos, matriz de permisos). Se mantiene intacto.
- **Eliminar/reemplazar el feature flag `NEXT_PUBLIC_ADMIN_PANEL`.** Es un gate de rollout del panel admin, no parte de la figura root. Se respeta como está. → Fase 2 si se quiere consolidar (§7).
- **Migración de arquitectura multi-tenant** (database-per-tenant). Intacta.
- **Refactor del selector cross-tenant a nivel de rutas/backend** más allá de lo necesario para el fix. El `TenantGuard` y su `resolveCrossTenant()`/`resolveOwnTenant()` se mantienen; solo se corrige la propagación del header desde el frontend.
- **Rotación/gestión avanzada de sesiones de root** (más allá de la revocación de tokens ya existente que dispara un cambio de flag). → Fase 2.

---

## 3. Approach (dirección arquitectónica)

Respetando Clean Arch (`clean-arch`, `auth-access`, `nestjs-modules`) y la ortogonalidad flag↔RBAC:

### 3.1 Principio rector: root es una CAPACIDAD DE PLATAFORMA, no un rol de tenant
La figura root vive en el eje "identidad de plataforma" (columna `master.usuarios`, guard `GlobalAdminGuard`, propagación de `X-Tenant-Id`). El RBAC (`roles`, `usuarios_roles`, `permisos`, `@RequirePermissions`) vive en el eje "qué puede hacer dentro de un tenant". **Estos dos ejes NO se cruzan** y esta propuesta los mantiene separados. Renombrar/formalizar la figura es un ejercicio de nombrar bien un concepto que ya existe, no de fusionarlo con el RBAC.

### 3.2 Backend — dónde cae cada pieza (Clean Arch)
- **Dominio**: la noción "root" es un atributo de la identidad del usuario. La entidad `UsuarioEntity` ya modela `isGlobalAdmin` — la formalización (rename o VO/terminología) se ancla acá. Cualquier invariante ("solo un root puede nacer root") se expresa como regla de dominio/aplicación, retornando `Result<T, DomainError>` (nunca `throw` en dominio/aplicación — `error-handling`).
- **Aplicación**: 
  - Nuevo use case (p.ej. `CrearRootUseCase`) o extensión explícita del flujo de creación que — a diferencia de `CrearUsuarioUseCase` que fuerza `isGlobalAdmin:false` — permite `root=true`, pero SOLO tras validar que el actor es root. La autorización se chequea en la capa de aplicación además del guard de presentación (`auth-access`: "authorization checks happen in application, not just infrastructure").
  - `AsignarRolUseCase` recibe el `clienteId` del contexto y valida `usuario.clienteId === clienteId` antes de operar (patrón de `baja-usuario`). Retorna un error de aplicación mapeable a 403/404 si el objetivo es de otro tenant.
- **Infraestructura**: repos Prisma (`prisma-usuario.repository.ts`) mapean el atributo; el mecanismo de bootstrap (seed idempotente o comando CLI) vive acá (`repository-pattern`, `nestjs-modules`). Sin tipos ORM filtrando a dominio.
- **Presentación**: controller `usuarios.controller.ts` expone el endpoint root-crea-root con `GlobalAdminGuard` (dirección; design afina la authz exacta), DTO con validación de transporte (`api-design`), status codes correctos (201 create, 403 authz, 409 conflict). El `clienteId` del target en asignar-rol se resuelve server-side desde `TenantContext`, NUNCA del body (mismo principio que `crear-usuario`).

### 3.3 Frontend — propagación centralizada de `X-Tenant-Id`
El bug central es que solo `tenant-context.tsx:87` y hooks de `features/admin/*` mandan el header. La dirección es **centralizar la inyección** en la capa de transporte (`apiFetch` en `shared/api/client.ts`) o en un provider que la envuelva, leyendo el cliente seleccionado del `tenant-context`, de modo que TODA request operativa herede el header cuando un root tiene un cliente activo — sin tocar hook por hook. El design decide el punto exacto de inyección (§5, O4). La UI de creación de root se gatea por `isGlobalAdmin`/`isRoot`, igual que el `ClienteSelector` ya se gatea (`if (!isGlobalAdmin) return null`).

### 3.4 Compatibilidad y JWT
El flag viaja en el JWT (`i-token.service.ts:17-26`) y los guards lo evalúan O(1) sin DB. Cambiar el flag de un usuario NO surte efecto hasta re-login (precedente: `add_is_global_admin` revocó refresh tokens masivamente). Si el design opta por RENOMBRAR la columna, DEBE considerar el impacto en el contrato del JWT y en la revocación de tokens (§5, O1/O5). Retrocompatibilidad: salvo que el design elija una migración total explícita, el contrato JWT existente se preserva.

---

## 4. Decisiones resueltas (D)

- **D1 — Modelo root = FLAG renombrado, ortogonal al RBAC.** *(cerrada por el usuario, 2026-07-31)* Root ES el flag `is_global_admin`, con nombre propio "root" en código y UI. Se MANTIENE ortogonal al RBAC. NO se convierte root en rol. Root = capacidad de plataforma; roles = authz dentro del tenant.
- **D2 — Alcance COMPLETO.** *(cerrada por el usuario, 2026-07-31)* Incluye backend + UI + fix del salto de tenants: formalizar la figura, endpoint root-crea-root, bootstrap seguro del primer root, fix de aislamiento en asignar-rol, UI para roots y arreglo del tenant-switching en vistas operativas.
- **D3 — `ADMINISTRADOR` NO puede crear roots ni setear el flag.** El path `POST /usuarios` existente sigue creando siempre con `root=false`; el flag solo se eleva por el camino nuevo gateado para roots. (Deriva de D1/D2 y del principio de menor privilegio del CLAUDE.md.)
- **D4 — El fix de aislamiento en `asignar-rol` entra en este change.** Alinear con el patrón de `baja-usuario` (validar tenant del objetivo). Con test de regresión RED→GREEN.
- **D5 — La propagación de `X-Tenant-Id` se centraliza**, no se parchea hook por hook (el punto exacto lo define el design).
- **D6 — Ortogonalidad flag↔RBAC se preserva** en todas las capas; ningún guard deriva root del rol ni viceversa.
- **D7 — El `clienteId` del target NUNCA viene del body HTTP** en ninguna mutación de usuarios/roles; se resuelve server-side desde `TenantContext` (invariante ya vigente en `crear-usuario`/`baja-usuario`).

---

## 5. Decisiones ABIERTAS para el design (O) — con tradeoffs

- **O1 — ¿Renombrar la columna `is_global_admin`→`is_root` o mantener terminología "root" sobre la columna existente?**
  - *Rename real de columna*: código autoexplicativo, elimina la confusión de raíz. PERO: migración en TODAS las tenant/master DBs, cambio en el contrato JWT (payload), en guards, repos, seeds, tests, y frontend; requiere migración idempotente (`RENAME COLUMN`, no drop+add) y probablemente revocación masiva de tokens. Blast radius alto.
  - *"root" como terminología de negocio/UI sobre `is_global_admin`*: cero migración, cero cambio de contrato JWT, retrocompatible. PERO: persiste la disonancia nombre-técnico vs. nombre-negocio; hay que documentar el mapeo y mantener disciplina.
  - Decisión del design pesando esfuerzo/riesgo vs. claridad. (Ver también O5.)
- **O2 — Mecanismo de bootstrap del primer root.**
  - *Seed idempotente desde env* (p.ej. `ROOT_ADMIN_EMAIL`/credenciales): reproducible en cada entorno, sin email hardcodeado. Debe CREAR la fila si no existe (no solo UPDATE) y ser idempotente (`ON CONFLICT`/guard). Secretos vía `.env` (CLAUDE.md §7).
  - *Comando CLI de administración*: explícito, auditable, corrido a demanda; no acoplado al ciclo de migraciones. PERO requiere acceso operativo al entorno.
  - Tradeoff: automatización (seed) vs. control explícito (CLI). El design elige y define idempotencia.
- **O3 — Authz exacta del endpoint root-crea-root.**
  - Dirección propuesta: `GlobalAdminGuard` (presentación) + verificación en aplicación (defensa en profundidad, `auth-access`). Abierto: ¿RESTful `POST /usuarios` con flag validado por rol del actor, o endpoint dedicado (p.ej. `POST /roots` / `POST /usuarios/root`)? ¿Se acepta el flag en el body SOLO si el actor es root, o ruta separada? El design fija el contrato (naming, status codes, envelope — `api-design`).
- **O4 — Estrategia de propagación de `X-Tenant-Id` en el frontend.**
  - *Inyección en `apiFetch`* (`shared/api/client.ts`): un solo punto, cubre todo el transporte; riesgo de mandar el header donde no corresponde (hay que respetar `isGlobalAdmin && clienteId`).
  - *Provider/wrapper que decora `apiFetch`*: más explícito sobre el contexto de tenant; algo más de plumbing.
  - Design decide dónde inyectar y cómo evitar filtrar el header en requests que no deben llevarlo.
- **O5 — ¿El evento/JWT necesita cambios?** Si O1 opta por rename, el design debe decidir: ¿cambia el claim del payload? ¿se dispara revocación masiva de tokens (precedente `add_is_global_admin`)? ¿hay ventana de compatibilidad de doble claim? Si O1 opta por terminología, probablemente el JWT NO cambia. Decisión acoplada a O1.
- **O6 — Deduplicación de `ROLES_VALIDOS`.** Está duplicado en backend (`auth.dto.ts:38`) y frontend (`UsuariosPage.tsx:47-52`). ¿Se centraliza en este change o se difiere? Bajo impacto; el design decide si entra como limpieza oportunista o Fase 2.

---

## 6. Riesgos

- **R1 (CRÍTICO) — Escalada de privilegios cross-tenant al exponer el flag por API.** Abrir un camino para setear `root=true` es el riesgo #1: un bug de authz convertiría a cualquier usuario en superusuario de plataforma con acceso a TODOS los tenants. Mitigación: defensa en profundidad (guard de presentación + chequeo en aplicación), el flag NUNCA se acepta en el path `POST /usuarios` normal, tests de seguridad que prueban que `ADMINISTRADOR` recibe 403, y validación de que el actor es root en la capa de aplicación (no solo el guard). Menor privilegio (CLAUDE.md §7).
- **R2 (CRÍTICO) — Aislamiento del salto de tenant.** (a) El gap de `asignar-rol` permite operar sobre usuarios de otro tenant HOY; el fix debe cerrar exactamente ese vector, con test de regresión RED. (b) Al centralizar `X-Tenant-Id`, un error de propagación podría mandar el header en requests que no deben llevarlo, o hacer que un usuario NO-root lo envíe — filtrando/confundiendo tenants. Mitigación: la inyección DEBE condicionarse estrictamente a `isGlobalAdmin && clienteId`, y el backend ya rechaza con 403 si un no-root manda el header (`tenant.guard.ts:73-77`) — no relajar esa defensa.
- **R3 — Bootstrap inseguro o no idempotente.** Un seed que hardcodee credenciales o que no sea idempotente reintroduce la fragilidad. Mitigación: secretos vía `.env`, idempotencia obligatoria (guards `IF EXISTS`/`ON CONFLICT`), migración segura para TODAS las tenant DBs (CLAUDE.md §9).
- **R4 — Rename de columna con blast radius subestimado.** Si O1 elige rename, tocar JWT + guards + repos + seeds + frontend a la vez es propenso a regresiones y a romper tokens vivos. Mitigación: migración `RENAME COLUMN` idempotente (no drop+add), plan de revocación de tokens, y evaluar si el beneficio justifica el riesgo vs. terminología (O1).
- **R5 — Desfase JWT (cambios de flag no surten efecto hasta re-login).** Un root recién creado o degradado sigue con el flag viejo hasta re-login. Mitigación: reusar el mecanismo de revocación existente (precedente `add_is_global_admin`) donde aplique; documentar la semántica.
- **R6 — Confusión persistente flag↔rol.** Si la terminología no queda impecable, el equipo seguirá mezclando root con `ADMINISTRADOR`. Mitigación: naming consistente en todas las capas + docs; O6 (dedupe de `ROLES_VALIDOS`) ayuda a reducir superficie de confusión.
- **R7 — Regresión en vistas operativas.** Centralizar el header podría romper requests que hoy funcionan por `resolveOwnTenant`. Mitigación: tests que verifiquen que un usuario NO-root sigue viendo su tenant y que un root con cliente ve el cliente elegido.

---

## 7. Fase 2 / diferido

- **Política RBAC**: restringir que un `ADMINISTRADOR` cree otro `ADMINISTRADOR` (requiere decisión de negocio sobre jerarquía de creación).
- **Quitar/revocar roles**: endpoint `DELETE /usuarios/:id/roles/:codigo` (no existe hoy).
- **Consolidación del feature flag `NEXT_PUBLIC_ADMIN_PANEL`**: revisar si sigue siendo necesario una vez formalizada la figura root.
- **Gestión avanzada de sesiones de root**: rotación, expiración diferenciada, auditoría enriquecida de acciones cross-tenant.
- **Dedupe de `ROLES_VALIDOS`** (si el design no lo mete oportunistamente en O6).
- **Auditoría UI**: panel para ver quién es root y el historial de accesos cross-tenant (hoy solo se audita server-side en `resolveCrossTenant`).

---

## 8. Trazabilidad (evidencia de exploración)

| Afirmación | Evidencia |
|---|---|
| Flag ortogonal, nunca del rol | `prisma_master/schema.prisma:94-96`, `global-admin.guard.ts:11-12,20-30` |
| Flag hardcodeado false | `crear-usuario.use-case.ts:69` (confirmado) |
| Bootstrap frágil por UPDATE | `prisma_master/migrations/20260630000000_set_global_admin_nestor/migration.sql` |
| Gap de aislamiento en asignar-rol | `asignar-rol.use-case.ts:35-61` (confirmado, sin clienteId) vs `baja-usuario.use-case.ts:69-71` |
| Tenant-switching roto en operativas | `use-tickets.ts:53`, `shared/api/client.ts`, `tenant-context.tsx:87` |
| Cross-tenant sólo para global admin | `tenant.guard.ts:72-102` (403 en `:73-77`) |
| JWT payload con flag | `i-token.service.ts:17-26`, `login.use-case.ts:111-119` |
| Selector gateado por isGlobalAdmin | `ClienteSelector.tsx:34`, `use-clientes.ts`, `middleware.ts:54-67` |
