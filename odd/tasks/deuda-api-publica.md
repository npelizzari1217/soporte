# Deuda técnica de la API pública (JD-4 a JD-7)

## Objetivo
Saldar cuatro hallazgos del `judgment-day` de la API pública (etapa 1, 2026-10-11) que quedaron como deuda técnica en el roadmap.

## Problema
`docs/roadmap-comercial.md`, tabla de deuda técnica (filas de JD-4 a JD-7):
- **JD-5:** `ClienteMapper.toPersistence` escribe `apiHabilitada` en cada guardado. Un caso de uso de clientes que leyó la entidad antes de que ROOT deshabilitara la API y guarda después vuelve a dejarla en `true`, y las claves vuelven a funcionar.
- **JD-4:** el solicitante de los tickets creados por la API es el usuario de integración (`integracion+<id>@integraciones.invalid`). `prisma-usuario-contacto-resolver.ts` no filtra `esIntegracion`, así que cada evento intenta un envío SMTP a una dirección inexistente.
- **JD-7:** `ConfigurarApiClienteUseCase` busca y crea el usuario de integración sin transacción. Dos habilitaciones simultáneas chocan con el email único y dan un 500.
- **JD-6:** `ApiV1Module` registra un segundo `ThrottlerModule` global (`forRootAsync`), contra la convención de `recuperacion-password-throttler.guard.ts:15-21`.

## Por qué
JD-5 tiene impacto de seguridad. JD-4 ensucia el SMTP de cada cliente. JD-7 y JD-6 son robustez. El dueño eligió estos cuatro el 2026-10-11.

## Fuera de alcance (decisión del dueño, 2026-10-11)
- El throttler en memoria por proceso: su disparador es escalar a más de un proceso, y hoy hay uno solo.
- El rollback de `api_publica`, que no se puede re-correr después de una corrida completa.

## Restricciones
- Son bugfixes: TDD obligatorio (RED observado, GREEN, REFACTOR), con la evidencia registrada acá (`~/proyectos/CLAUDE.md` §6.1).
- Un commit por hallazgo en `fix/deuda-api-publica`, con tests y docs juntos, Conventional Commits, sin atribución de IA.
- Al cerrar cada hallazgo, su fila de deuda en el roadmap queda tachada y marcada RESUELTA con el sha.
- Hexagonal: Prisma solo en `infrastructure/`.
- La Ayuda está en pausa; anotar deuda solo si un cambio la vuelve falsa.

## Tareas
- [x] **T1 — JD-5:** `apiHabilitada` se escribe solo desde `ConfigurarApiClienteUseCase`; el upsert general del mapper la omite. Criterio: un guardado de cliente con la entidad leída antes de deshabilitar NO vuelve a habilitar la API (test de integración contra la base). Ruta: delegada.
  - Diseño: puerto satélite `IApiHabilitadaRepository` (`integraciones/domain/api-habilitada-repository.port.ts`) con un UPDATE dirigido, en vez de un método nuevo en `IClienteRepository`: agregarlo obligaba a tocar ~25 mocks de specs, varios fuera del módulo (csat, publico, auth). Mismo criterio que `IClienteEmailConfigRepository`. Un cliente nuevo nace con el default de la columna (`false`).
  - RED: `configurar-api-cliente.integration.spec.ts` › "JD-5: un save() con la entidad leida antes de deshabilitar no vuelve a habilitar la API" — `AssertionError: expected true to be false` en `expect(await apiHabilitada(id)).toBe(false)` después del `save()` viejo.
  - GREEN: el mismo spec pasa (1/1). `pnpm vitest run src/clientes src/integraciones`: 66 archivos, 485 tests verdes; e2e `integraciones-api-cliente` + `integraciones-claves`: 14/14. `pnpm lint` y `pnpm typecheck`: 0 errores.
  - Commit: `7f7be5ef`.
- [x] **T2 — JD-4:** el resolvedor de contactos de notificaciones excluye a los usuarios de integración. Criterio: un ticket cuyo solicitante es el usuario de integración no produce destinatario `.invalid`. Ruta: delegada.
  - Cambio: `esIntegracion: false` en `resolverContacto` y en `resolverAdministradores` (un usuario de integración nunca es ADMINISTRADOR hoy, pero el filtro cuesta lo mismo). Sin contacto, `ContactoSolicitanteResolverAdapter` devuelve `null` y el listener omite el envío.
  - RED: `prisma-usuario-contacto-resolver.integration.spec.ts` › "usuario de integracion de la API → null: no se notifica a `.invalid` (JD-4)" — `AssertionError: expected { …(2) } to be null`; › "excluye usuarios de integracion de la API (JD-4)" — `AssertionError: expected [ { …(2) } ] to deeply equal []`. 2 fallidos, 8 verdes.
  - GREEN: el mismo spec 10/10. `pnpm vitest run src/notificaciones`: 12 archivos, 128 tests verdes. `pnpm lint` y `pnpm typecheck`: 0 errores.
  - Commit: `bfbe8b86`.
- [x] **T3 — JD-7:** dos habilitaciones simultáneas no dan 500. Criterio: dos `execute` concurrentes del caso de uso terminan bien y dejan un solo usuario de integración. Ruta: delegada.
  - Diseño: puerto `IUsuarioIntegracionRepository` (`integraciones/domain/usuario-integracion-repository.port.ts`) con `crearUsuarioSiNoExiste` y `crearMembresiaSiNoExiste`; el adaptador usa `createMany({ skipDuplicates: true })`, que es `INSERT ... ON CONFLICT DO NOTHING`. Después del insert el caso de uso relee el usuario por email y recién ahí controla `esIntegracion`. La membresía también necesitaba tolerancia: tiene `@@unique([usuarioId, clienteId, rolId])`, así que el segundo insert chocaba igual. Se descartó tocar `PrismaUsuarioRepository.create` (puerto compartido de auth, fuera del alcance) y una transacción amplia.
  - RED: `configurar-api-cliente.integration.spec.ts` › "JD-7: dos habilitaciones simultaneas terminan bien y dejan un solo usuario de integracion" — `PrismaClientKnownRequestError: Unique constraint failed on the fields: (email)` en `usuario.upsert()`. Con un hash instantáneo en el test la carrera no se reproducía (las dos llamadas se serializaban); el fake de hash espera 50 ms, que modela la ventana real de argon2 entre `findByEmail` y `create`.
  - GREEN: el spec 2/2, tres corridas seguidas. `pnpm vitest run src/integraciones`: 14 archivos, 81 tests verdes; e2e `integraciones-api-cliente` + `integraciones-claves`: 14/14. `pnpm lint` y `pnpm typecheck`: 0 errores.
  - Commit: `6732f761`.
- [x] **T4 — JD-6:** `ApiV1Module` provee sus opciones y su almacenamiento localmente, sin un `ThrottlerModule` global, como `formulario-publico.module.ts`. Criterio: los e2e del límite v1 (60/min por clave, un solo cupo por clave) siguen verdes, y uno nuevo prueba que el límite de v1 no altera el de recuperación de contraseña. Ruta: delegada.
  - Cambio: `getOptionsToken()` (factory que lee `limiteApiV1()` al instanciar el módulo) y `{ provide: ThrottlerStorage, useClass: ThrottlerStorageService }` como providers locales; se exportan junto con `ApiV1ThrottlerGuard`, en lugar de `ThrottlerModule`, para que un módulo que importe `ApiV1Module` y declare su propio controller `@ApiV1()` (el `EcoController` del e2e de autenticación) use las mismas opciones y el mismo storage. `AppModule` no declara controllers, así que el export no alcanza a ningún otro guard. Orden de guards sin cambios (`@ApiV1()`: clave → límite → `AccionesGuard`).
  - Desviación del criterio (declarada): el test "el límite de v1 no altera el de recuperación de contraseña" no se escribió como RED. `RecuperacionPasswordModule` ya usa opciones locales y `@Throttle` por ruta, así que ese test pasaría antes y después del cambio: no prueba el arreglo. En su lugar, `api-v1.module.spec.ts` fija la convención sobre la metadata de `@Module` (sin `ThrottlerModule` en imports ni exports; opciones y storage locales con `limit: limiteApiV1()`, `ttl: 60000`). El comportamiento lo cubren los e2e existentes, y el e2e de recuperación de contraseña se corrió igual.
  - RED: `api-v1.module.spec.ts` › "no importa ThrottlerModule (ni forRoot ni forRootAsync): no registra opciones globales" — `AssertionError: expected true to be false`; › "provee localmente las opciones del limite v1 y su propio ThrottlerStorage" — `AssertionError: expected undefined to be defined`.
  - GREEN: el spec 2/2. `pnpm vitest run src/integraciones`: 15 archivos, 83 tests verdes. e2e con límite (`integraciones-api-v1-auth` con el 429 y el cupo compartido JD-1, `-openapi`, `-tickets`, `-catalogos`, `recuperacion-password`, `csat`, los tres de `pedido-publico`): 9 archivos, 72 tests verdes. `pnpm lint` y `pnpm typecheck`: 0 errores (prettier normalizó dos archivos antes del lint).
  - Commit: `705e546c`.

## Verificación
- Por tarea: el spec nuevo en RED antes del cambio y en GREEN después; `pnpm lint`, `pnpm typecheck` y los specs del módulo afectado.
- Al cierre: la suite completa del backend y `node scripts/check-roadmap-fresco.mjs`.

## Ruta
Delegada: un writer por tarea, que implica 2 o más archivos no triviales (código, spec y fila del roadmap).

## Progreso
- 2026-10-11: documento creado; rama `fix/deuda-api-publica` desde `main` `23b31110`.
- 2026-10-11: T1 (JD-5) cerrada.
- 2026-10-11: T2 (JD-4) cerrada.
- 2026-10-11: T3 (JD-7) cerrada.
- 2026-10-11: T4 (JD-6) cerrada. Las cuatro filas de deuda quedaron tachadas y RESUELTAS en el roadmap.

## Próximo paso
Cierre: suite completa del backend y `node scripts/check-roadmap-fresco.mjs` (lo corre el orquestador); después, push y PR a decisión del dueño.
