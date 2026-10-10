# API pública — etapa 1 (punto 8 de la segunda etapa)

## Objetivo
Que un cliente integre sus propios sistemas con soporte por medio de una API autenticada con clave, empezando por tickets.

## Problema
Hoy el backend solo acepta el JWT de una persona:
- `JwtAuthGuard` lee el usuario del token;
- `TenantGuard` saca el tenant de `cliente_id`;
- toda escritura en un ticket exige un usuario de master como autor (`OperacionTicket.autorId` es NOT NULL).

No hay ninguna forma de que otro sistema se autentique. Además, el BFF reconstruye `Authorization` solo desde la cookie `at` y descarta los headers del que llama (`frontend/src/app/api/[...path]/route.ts:59`).

## Por qué
La competencia (GLPI 11, ManageEngine) ya trae API. Es el punto 8 de la segunda etapa del roadmap.

## Decisión de producto citada
`docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 8 — API pública + webhooks", **etapa 1** (decidido el 2026-10-10, commit `947d95af`). Cada viñeta es un criterio de aceptación más abajo.

**Desviaciones declaradas de antemano:** ninguna. Los webhooks (etapa 2) quedan fuera por decisión y se hacen en un documento aparte.

## Alcance
- **Backend:**
  - modelo en master: flag por cliente, usuario de integración y claves;
  - habilitación por ROOT;
  - administración de claves por el ADMINISTRADOR;
  - guard por clave;
  - endpoints `v1` de tickets;
  - límite por clave;
  - OpenAPI.
- **Frontend:**
  - ruta BFF `/api/v1/*`;
  - diálogo de ROOT para habilitar la API;
  - pantalla "Integraciones" del ADMINISTRADOR.
- **Docs:** README y runbook (notas de deploy), y la deuda de Ayuda anotada.

## Fuera de alcance
- Webhooks (etapa 2).
- Transicionar, asignar, equipos y compras por API.
- Auditoría de cada llamada.
- Cambios en IIS.

## Restricciones
- Arquitectura hexagonal: solo `infrastructure/` importa `@prisma/client`. Errores de dominio con `Result`.
- Aislamiento entre inquilinos: una clave nunca ve datos de otro cliente.
- **Nada se sube a GitHub hasta nuevo aviso del dueño** (2026-10-10): commits y ramas solo locales.
- Features sin TDD obligatorio (`~/proyectos/CLAUDE.md` §6.1), pero cada unidad va con sus tests.
- Comandos: backend `pnpm lint`, `pnpm typecheck`, `pnpm test`; frontend `pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs`.
- Todo spec que trunque `soporte_master_test` llama a `usarLockMasterTest()`.

## Criterios de aceptación
Salen de la decisión de producto, viñeta por viñeta.
- **CA1:** la API expone solo tickets: listar, ver, crear y comentar. No hay rutas de transición, asignación, equipos ni compras.
- **CA2:** cada cliente con API habilitada tiene un usuario de integración técnico, con su membresía, que figura como autor de lo que hace la API. El modelo de tickets no cambia. Ese usuario no puede entrar por login (ni contraseña ni SSO) y no aparece como persona en las listas de usuarios.
- **CA3:** las claves son por cliente y están atadas a ese usuario. Cada clave lleva un subconjunto de permisos (lectura, alta, comentario), y la API rechaza lo que la clave no permite.
- **CA4:** solo ROOT habilita o deshabilita la API de un cliente. Solo el ADMINISTRADOR (o ROOT) del cliente crea y revoca claves, desde la pantalla "Integraciones". Con la API deshabilitada, ninguna clave funciona.
- **CA5:** la API entra por `/api/v1/*` en el frontend, que reenvía la clave al backend. IIS no cambia.
- **CA6:** hay un límite de pedidos por clave, del orden de 60 por minuto, y al pasarlo se responde 429.
- **CA7:** hay documentación OpenAPI generada solo para las rutas `v1`.
- **CA8:** cada clave guarda su último uso, visible en la pantalla. No se audita cada llamada.
- **CA9:** la clave en claro se muestra una sola vez al crearla y se guarda hasheada (sha256); nunca se puede volver a ver.
- **Transversal:** una clave del cliente A nunca lee ni escribe datos del cliente B, y una clave revocada, inexistente o de un cliente inactivo recibe el mismo 401.

## Estrategia de entrega
- **Pronóstico:** unas 3.000 líneas en 10 tareas.
- **Estrategia:** `ask-on-risk`, con cadena `feature-branch-chain` (elegida por el dueño el 2026-10-10). El tracker es `feat/api-publica` y cada tarea va en `feat/api-publica-tN`, apilada sobre la anterior. Todo local mientras dure la pausa de GitHub.

## Tareas
- [x] **T1 — Modelo en master** (~350): flag `Cliente.apiHabilitada`, marca de usuario de integración en `Usuario` y tabla de claves (prefijo, hash, permisos, nombre, creador, último uso, revocada). Migración con `rollback.sql`, puerto y repositorio, y tests de integración. Ruta: delegada.
- [ ] **T2 — Habilitación por ROOT** (~350): `PATCH /clientes/:id/api`. Al habilitar, crea de forma idempotente el usuario de integración y su membresía. El login con contraseña y con SSO rechaza a ese usuario, y las listas de usuarios lo excluyen. Ruta: delegada.
- [ ] **T3 — Claves para el ADMINISTRADOR** (~300): crear (devuelve la clave en claro una sola vez), listar y revocar, con `AdminClienteGuard` y validación del subconjunto de permisos. Ruta: delegada.
- [ ] **T4 — Guard por clave y módulo `v1`** (~380): resuelve el hash de la clave a cliente activo con API habilitada y clave vigente. Abre el contexto de tenant y arma un actor sintético (el usuario de integración con los permisos de la clave). Actualiza el último uso y aplica el límite por clave. Ruta: delegada.
- [ ] **T5 — Endpoints `v1` de tickets** (~380): listar, ver, crear y comentar (comentario público), reusando los casos de uso existentes, con e2e de aislamiento entre clientes. Ruta: delegada.
- [ ] **T6 — OpenAPI** (~200): `@nestjs/swagger` solo para los controllers `v1`, con el JSON servido en una ruta `v1`. Ruta: delegada.
- [ ] **T7 — Ruta BFF `/api/v1/*`** (~200): reenvía la clave y la IP del que llama, sin cookies. Ruta: delegada.
- [ ] **T8 — Diálogo de ROOT** (~250): habilitar o deshabilitar la API por cliente. Ruta: delegada.
- [ ] **T9 — Pantalla "Integraciones"** (~380): listar, crear (con la clave mostrada una sola vez) y revocar, con último uso. Ruta: delegada.
- [ ] **T10 — Docs y cierre** (~120): README, notas de deploy en el runbook, deuda de Ayuda, verificación completa y `judgment-day`, porque es un cambio grande y de seguridad. Ruta: delegada para la verificación.

## Verificación
Por tarea: lint, typecheck y los tests del módulo. Al cierre: suites completas de backend y frontend, el ratchet de casts y `judgment-day`. RDD está apagado.

## Progreso
- 2026-10-10: decisiones cerradas (`947d95af`). Documento creado en la rama local `feat/api-publica`, que sale de `docs/roadmap-decisiones-punto-8`.
- 2026-10-10: T1 hecha y partida en dos unidades por tamaño (435 líneas en un solo commit). La costura es limpia: cada unidad lleva sus tests.
  - `feat/api-publica-t1` — `de9bc76e`, 103 líneas: schema, migración `20261011120000_api_publica` con `rollback.sql`, y los mappers de Usuario y Cliente, que omiten las columnas nuevas en el upsert.
  - `feat/api-publica-t1b` — `f9a31471`, 332 líneas: puerto, repositorio Prisma con su spec de integración y el generador de claves `sop_`.
  - Decisiones de esquema: `cliente_id` y `usuario_id` en CASCADE, `creada_por_id` en RESTRICT, `prefijo` y `hash` únicos.
  - Verificación en cada punta: typecheck y lint en 0; en `t1`, 159/159 de persistencia de clientes y auth; en `t1b`, 11/11 de `integraciones`. Antes de partir, los casts daban 617 y 726/726 en `src/integraciones`, `src/clientes` y `src/auth/infrastructure`.
  - Se amplió la superficie con el OK del dueño: 4 mappers y specs que Prisma rompía al tipar las columnas nuevas como obligatorias.

## Próximo paso
T2 (habilitación por ROOT), en `feat/api-publica-t2`, que sale de `t1b`. Su superficie de edición tiene que incluir desde el arranque `UsuarioEntity` y `ClienteEntity`, con sus mappers y specs, y sacar de los `Omit` de `toPersistence` los campos que T2 escriba.
