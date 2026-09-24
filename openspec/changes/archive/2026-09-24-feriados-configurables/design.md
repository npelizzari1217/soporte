# Diseño: Feriados configurables (global + por cliente)

> Insumos: [`proposal.md`](./proposal.md), [`specs/`](./specs/), [`exploration.md`](./exploration.md).
> **Desviación de presupuesto declarada**: la skill limita este artefacto a 800 palabras. Se excede
> porque el prompt de lanzamiento exige siete ADRs con alternativas rechazadas, más un mapa de
> capas y la división de PRs. Todo lo demás se mantiene en tablas.

## Enfoque técnico

Este es el enfoque 1 de la exploración. El `Feriado` de master no se toca. Se agrega una
nueva tabla de inquilino `FeriadoCliente`. Ambos ABMs van en el módulo existente
`calendario-laboral`. La unión de SLA se construye dentro de
`PrismaFeriadosLaboralesRepository.obtener()`, así que el puerto, `AplicarSlaUseCase`,
`CalcularSlaHabilVenceService` y `sla.module.ts` conservan sus firmas.

## Hallazgos que corrigen los insumos

| # | Prior claim | Verified against the tree |
|---|---|---|
| H1 | El sweep "corre el mismo cambio de repositorio" (exploración §1) | **Premisa FALSA; spec enmendada.** El sweep corre `MarcarVencidosUseCase` (`sla.module.ts:145-176`), que solo compara el `sla_vence_at` almacenado (`prisma-sla-ticket-query.repository.ts:31-42`). Nunca lee feriados. Los dos caminos que calculan un vencimiento son crear y repriorizar. La spec ahora testea la unión en ambos ("La repriorización aplica la misma unión"). **Este diseño no depende del sweep para nada** |
| H2 | El camino de creación lleva `TenantContext` | **VERDADERO.** `ticket.creado` se publica desde `alCommitear()` (`crear-ticket.use-case.ts:206-213`). Los callbacks corren después de que `$transaction` resuelve, en el scope externo cuyo contexto es el cliente de inquilino no transaccional (`tenant-transaction-runner.ts:104-127`). `ticket.reprioritizado` se publica desde `editar-ticket.use-case.ts:112` (HTTP, `TenantGuard`) |
| H3 | Solo dos comentarios desactualizados | **Cuatro.** El comentario de clase del repositorio (`prisma-feriados-laborales.repository.ts:1-5`), el docstring del puerto (`i-feriados-laborales.repository.ts:4-5`, "vive en MASTER"), el docstring de `AplicarSlaUseCase` (`aplicar-sla.use-case.ts:59-70`), y `calendario-laboral.module.ts:6-7` ("no se importa desde ningún otro", ya falso porque `sla.module.ts:101` lo importa) |
| H4 | Un spec existente no se ve afectado | **FALSO.** `calendario-laboral.repositorios.integration.spec.ts:31-32` construye el repositorio sin `TenantContext` y llama a `obtener()` sin vincular. Bajo fail-closed, lanza una excepción. WU-5 debe vincular un contexto en ese spec |
| H5 | El badge `success` es el verde suave | **FALSO.** En `badge.tsx:19` `success` es un `bg-success` sólido. `--success-light` no tiene variante |

## Mapa de capas (`rules.design`)

| Pieza | Capa | Por qué ahí |
|---|---|---|
| VO `FechaCalendario` (`YYYY-MM-DD`, fecha de calendario real), `FeriadoEntity`, `feriados.errors.ts` | `calendario-laboral/domain` | Invariantes de negocio, cero dependencias de framework |
| `IFeriadoGlobalRepository`, `IFeriadoClienteRepository`, `IFeriadosGlobalesChecker` | `domain/ports` | Contratos. El puerto de lectura del SLA `IFeriadosLaboralesRepository` queda separado (ISP) |
| 8 casos de uso (Listar/Crear/Editar/Eliminar × global/cliente) | `application/use-cases` | Orquestación + `Result<T, DomainError>` |
| Repositorios Prisma, checker de master, mapper, unión | `infrastructure/persistence/prisma` | Único lugar habilitado para tocar Prisma (regla fitness de ESLint) |
| `FeriadosController`, `FeriadosClienteController`, DTOs | `interface` | Traducción HTTP y guards |
| Logging de `AplicarSlaListener` (modifica `sla/infrastructure/listeners/aplicar-sla.listener.ts` + su factory en `sla.module.ts:154-159`) | `sla/infrastructure` | Este es el adaptador que absorbe el error, así que el error debe loguearse donde se absorbe. Recibe el puerto `ILogger`, nunca el `Logger` de `@nestjs/common` |

## Decisiones de arquitectura

| # | Decisión | Elección | Rechazado | Justificación |
|---|---|---|---|---|
| D1 | Tabla de inquilino | `model FeriadoCliente` → `feriados_cliente`: `id uuid gen_random_uuid()`, `fecha DateTime @unique @db.Date`, `descripcion VarChar(200)`, `created_at`/`updated_at timestamptz`. Sin `clienteId` y sin soft-delete. Migración `prisma_tenant/migrations/20260925120000_feriados_cliente/`. Copiar la advertencia de `@db.Date` de `prisma_master/schema.prisma:492-498` | (a) Modelo llamado `Feriado` en el schema del inquilino. (b) `deleted_at` | (a) Dos tipos `Feriado` generados (`.prisma/master` y `.prisma/tenant`) harían ambiguos los imports del mapper. (b) El `Feriado` de master tiene hard delete, y una fila con soft-delete igual retendría el `fecha` único |
| D2 | Trampa de `@db.Date` | **Una sola** implementación: promover `claveDiaUtcDe` (`prisma-calendario-laboral.mapper.ts:79-84`) a un static público. Ambos mappers lo usan. Las escrituras pasan por `FechaCalendario.aDateUtc()` = `new Date(\`${iso}T00:00:00.000Z\`)` | Aceptar `@IsDateString` más `new Date(str)` (precedente de ciclos) | `@IsDateString` acepta `2026-10-12T02:00-03:00`, que cae en otro día UTC. El DTO usa una regex de solo-fecha, y el VO rechaza `2026-02-30` |
| D3 | Resolución de inquilino + fail-closed | `PrismaFeriadosLaboralesRepository(prismaService, tenantContext)`. Si `tenantContext.get()` es `undefined` → **lanza** `FeriadosSinTenantContextError extends Error` (infraestructura). Si no, `Promise.all([master.feriado.findMany, ctx.prismaClient.feriadoCliente.findMany])` → unión de `Set` | (a) Retorno `Result`. (b) Degradar a solo-global. (c) El throw genérico de `getClient()` | (a) Cambia el puerto y rompe la decisión 3 de la propuesta. Un contexto sin vincular es un bug de wiring, no una falla de dominio esperada, así que se lanza como cualquier otro invariante de infraestructura (`result.ts:4-6`). (b) Prohibido por la spec. (c) No se puede verificar específicamente. `AplicarSlaUseCase` ya propaga sin fallback (`aplicar-sla.use-case.ts:60-63`) |
| D4 | Deduplicación contra lo global | Puerto de solo lectura `IFeriadosGlobalesChecker.esGlobal(fecha): Promise<boolean>`, implementado por `FeriadosGlobalesMasterChecker` (solo master, precedente `UsuarioMasterChecker`). Se verifica en **creación y edición**. El duplicado dentro de la misma lista se pre-verifica, **más** el `P2002` se captura en el caso de uso y se mapea a `FeriadoFechaDuplicadaError` (`crear-equipo.use-case.ts:11-19`). `PrismaExceptionFilter` → 409 sigue siendo el respaldo (`prisma-exception.filter.ts:100`) | Reutilizar `IFeriadoGlobalRepository` dentro del caso de uso de inquilino | Un puerto de master con capacidad de escritura dentro de un caso de uso de inquilino es el riesgo que señala la propuesta. La **carrera cross-DB** (ROOT agrega una fecha global mientras un cliente agrega la misma fecha) no se puede restringir. Se acepta: el `Set` deduplica, así que el SLA es correcto y el único efecto es una fila de cliente redundante |
| D5 | Ubicación del ABM global + guards | Extender `CalendarioLaboralModule` (+ `imports: [AuthModule]`). `@Controller('feriados') @UseGuards(JwtAuthGuard)` a nivel de clase. Las escrituras usan `@UseGuards(GlobalAdminGuard)` por método (`ciclos-vigentes.controller.ts:103-121`). `@Controller('feriados-cliente') @UseGuards(JwtAuthGuard, TenantGuard)` a nivel de clase. Las escrituras usan `@UseGuards(AdminClienteGuard)` por método (`catalogos.controller.ts:94,160-161`) | Módulo `feriados` nuevo | Su repositorio de unión de SLA y su mapper viven en `calendario-laboral`. Un segundo módulo los importaría de vuelta o los duplicaría |
| D6 | Autorización, dos lugares | **Decoradores de borde:** ver D5. **Chequeos inline: ninguno, deliberadamente.** Ninguna ruta lleva un `clienteId`. `TenantGuard` vincula el inquilino desde el JWT (`tenant.guard.ts:72`). Un `:id` del cliente B resuelve dentro de la base de A y devuelve **404**, nunca la fila de B | Chequeo inline de `clienteId` | No hay nada que comparar: el aislamiento es estructural |
| D7 | Mapeo HTTP | Regex/longitud del DTO → 400. `FechaCalendarioInvalidaError`, `FeriadoFechaDuplicadaError`, `FeriadoFechaEsGlobalError` → **422**. `FeriadoNoEncontradoError` → 404. `DELETE` → 204 | 409 para duplicados | Precedente del repositorio: los duplicados son 422 (`equipos.controller.spec.ts:620`). El 409 sigue siendo el respaldo sin mapeo |
| D8 | Frontend | Una feature, `features/feriados/`. Rutas: `/admin/feriados-globales` (en `ROOT_SECTION_ITEMS`, `nav-config.ts:134-161`, protegida por `isGlobalAdmin`) y `/admin/feriados` (`AdminNav`, protegida por `esAdminCliente`). La lista combinada mezcla `GET /feriados` + `GET /feriados-cliente` **del lado del cliente** con una función pura `combinarFeriados()`, ordenada por string ISO. El mapper de dominio `OrigenFeriadoBadge` sigue a `status-badge.tsx`. Variantes de badge `info` **y** `success-light` nuevas (`bg-*-light text-*`). `--info` `#0369a1`/`#ffffff`/`#e0f2fe` claro y `#38bdf8`/`#082f49`/`#082f49` oscuro, más `@theme inline` `--color-info*` (`globals.css:49-54`) | (a) Un endpoint de backend combinado. (b) Overrides de `className` en el callsite | (a) Hace que un caso de uso de inquilino lea la lista de master y difumina la respuesta de aislamiento que la spec afirma. (b) Evita el contrato de variantes. H5 igual fuerza la variante verde |
| D10 | Observabilidad fail-closed | Inyectar `ILogger` (token `LOGGER`, `i-logger.port.ts:16-35`) en `AplicarSlaListener`, el mismo puerto y wiring que el sweep (`sla.module.ts:161-176`). Ambos bloques `catch` llaman a `logger.error(\`SLA_APLICAR_ERROR \| evento=ticket.creado\|ticket.reprioritizado \| ticket=${id} \| error=${mensaje}\`)`, con `mensaje` derivado como lo hace el sweep (`sla-sweep.scheduler.ts:55-56`: `error instanceof Error ? error.message : 'error desconocido'`). El error igual no se vuelve a lanzar | (a) `new Logger()` de `@nestjs/common` dentro del listener. (b) `logger.log`. (c) Relanzar | (a) El repo enruta el logging a través del puerto `ILogger`, y el precedente del sweep lo usa. (b) `error` es el nivel documentado del puerto para la degradación silenciosa (`i-logger.port.ts:24-31`). (c) El ticket ya está commiteado, y el ADR-6 prohíbe propagar hacia el emisor. No se loguea ningún objeto de error crudo, porque puede llevar datos de conexión |
| D9 | Fuente a reflejar | `FERIADO_DESCRIPCION_MAX_LENGTH = 200` y `FECHA_CALENDARIO_REGEX` viven en el dominio. Los DTOs los importan. El frontend `features/feriados/limites.ts` los copia con un test centinela (precedente `ciclos-master/limites.ts`) | Un paquete compartido | No hay precedente, y está fuera de alcance |

## Flujo de datos

    ROOT ──/feriados (GlobalAdminGuard)──→ Crear/Editar/EliminarFeriadoGlobal ──→ master.feriados
    ADMIN A ─/feriados-cliente (TenantGuard+AdminClienteGuard)─→ Crear/EditarFeriadoCliente
                     ├─→ IFeriadosGlobalesChecker (master, solo lectura) ── 422 si es global
                     └─→ IFeriadoClienteRepository (TenantContext → base del inquilino A)

    ticket.creado / ticket.reprioritizado (TenantContext A) → AplicarSlaListener → AplicarSlaUseCase
         └→ PrismaFeriadosLaboralesRepository.obtener(): master ∪ inquilino A  (sin vincular → lanza excepción)
                 ├→ ok: sla_vence_at persistido
                 └→ lanza: listener logger.error(id del ticket + mensaje), el ticket queda commiteado (D10)

## Interfaces / Contratos

```ts
// domain/value-objects/fecha-calendario.ts
static crear(iso: string): Result<FechaCalendario, FechaCalendarioInvalidaError>;
aClave(): string;      // 'YYYY-MM-DD'
aDateUtc(): Date;      // UTC midnight, for @db.Date writes only
// domain/ports/i-feriados-globales.checker.ts
esGlobal(fecha: FechaCalendario): Promise<boolean>;
// HTTP response, both controllers
{ id: string; fecha: 'YYYY-MM-DD'; descripcion: string }  // sorted by fecha asc
```

## Estrategia de testing

| Layer | What | How |
|---|---|---|
| Unitario | VO (`2026-02-30` rechazada, `2028-02-29` aceptada). Trampa del mapper (`…T00:00:00.000Z` → mismo día). Casos de uso: colisión global en **creación y edición**, duplicado dentro de la misma lista, `P2002` → error 422, no encontrado. Unión: deduplicación, **sin vincular → `FeriadosSinTenantContextError`**. Tabla de error del controller → HTTP. Listener (`aplicar-sla.listener.spec.ts`): cuando el caso de uso rechaza en **cada** handler, `logger.error` se llama una vez con el id del ticket y el mensaje, el handler resuelve (sin relanzar), y el mensaje no contiene ningún objeto de error serializado | Puertos mockeados + spy de `ILogger` |
| Integración | Repositorio global contra `soporte_master_test` con `usarLockMasterTest()`. **Nunca truncar `feriados`**: usar fechas de 2099 y eliminar las filas propias. Las 46 filas sembradas se mantienen presentes. Repositorio de inquilino + checker + unión sobre una base de inquilino efímera. Orden de higiene: **limpiar filas → `app.close()` → `dropDatabase`**. Corregir el spec de H4 | Postgres real |
| E2E | Matriz de guards para ambos controllers: 401/403/2xx. Aislamiento con dos inquilinos efímeros: A nunca lista las filas de B y recibe 404 con el id de B. El ticket HABIL omite lo global + el feriado de A y no el de B, **tanto en la creación como en la repriorización**. Agregar un feriado deja el `sla_vence_at` de un ticket abierto sin cambios | Plantillas `insumos-catalogos.e2e.spec.ts` / `tickets.e2e.spec.ts` |
| Frontend | Gates, filas ordenadas por fecha, variante de badge por origen, filas globales sin acciones, `combinarFeriados`, schemas Zod, centinela de `limites`, `nav-config` | Vitest + Testing Library |
| Adversarial (verify) | Quitar el chequeo fail-closed, quitar la llamada a `esGlobal` en la edición, y borrar la llamada a `logger.error` de cualquiera de los dos handlers: cada uno debe fallar (ir a rojo) | `rules.verify` |

## Matriz de amenazas

N/A: sin shell, subprocess, automatización de VCS/PR, clasificación de archivos ejecutables, ni
límite de integración de procesos. Los controles de seguridad (aislamiento, puerto de master de
solo lectura, fail-closed) están cubiertos en D3, D4 y D6, cada uno con un test adversarial.

## Migración / despliegue

La migración de inquilino es aditiva, sin backfill. `deploy.ps1:212-214` corre `migrate:tenants`
antes del restart, y los inquilinos nuevos la reciben vía `TenantMigrationRunner`. **El orden
importa**: el código de WU-5 contra un inquilino al que le falta `feriados_cliente` lanza `P2021`
dentro del camino del SLA, y el ticket no obtiene `sla_vence_at`. Con D10 esto ahora aparece como
`SLA_APLICAR_ERROR` en el log en vez de pasar en silencio, pero desplegar WU-5 sin que el fan-out
haya tenido éxito sigue siendo incorrecto. No hay migraciones de master: las 46 filas no se tocan
por construcción.

## División de la entrega (`sdd-tasks` refina)

**PRs encadenados: Sí** (Feature Branch Chain sobre `feat/feriados-configurables`). Orden lineal:

| WU | Contenido | Líneas est. | Depende de |
|---|---|---|---|
| 1 | VO, entity, errores, puerto/repositorio global, promoción del mapper + tests | ~330 | ninguna |
| 2 | Casos de uso globales, `FeriadosController`, DTOs, wiring, unitarios + e2e | ~400 | 1 |
| 3 | Schema/migración de inquilino, repositorio de cliente, checker de master + integración | ~330 | 1 |
| 4 | Casos de uso de cliente, `FeriadosClienteController`, e2e incl. aislamiento A/B | ~400 | 3 |
| 5 | Unión + fail-closed, logging del listener (D10) + su spec + wiring del factory, 4 correcciones de comentarios (H3), corrección del spec de H4, e2e de SLA (crear + repriorizar) | ~300 | 3 |
| 6 | Tokens `--info`, 2 variantes de badge, `OrigenFeriadoBadge`, scaffolding de la feature, pantalla ROOT, nav | ~420 | 2 |
| 7 | Pantalla de cliente, lista combinada, `AdminNav`, declaración del Punto 5 del roadmap, nota de deuda de Ayuda | ~380 | 4, 6 |

WU-2, WU-4 y WU-6 están al límite del presupuesto. `sdd-tasks` puede separar sus specs e2e. D10 va
en WU-5 porque el logging solo importa una vez que la unión puede lanzar una excepción. Entregar el
throw sin el log abriría exactamente la ventana silenciosa que la spec prohíbe. El cambio del
listener son unas 25 líneas de código más unas 50 líneas de spec, lo que mantiene a WU-5 cerca de
300.

## Preguntas abiertas

Ninguna. Las tres preguntas planteadas antes se resolvieron con la enmienda de la spec:
- El escenario del sweep se reemplazó por "La repriorización aplica la misma unión" (H1).
- Que la repriorización recalcula con los feriados vigentes ahora está indicado en la spec.
- El logging del listener ahora está en alcance como D10.
