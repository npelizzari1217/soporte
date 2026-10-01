# Tasks: seguimiento de repuestos por número de serie

> **Desviación de presupuesto declarada.** La skill `sdd-tasks` limita este artefacto a 530
> palabras; lo supera por la misma causa que los ciclos anteriores: 27 work units de diseño
> (31 con los cuatro cortes pre-planificados), cada uno con sus tareas, comandos de
> verificación, escenarios de spec y límite de PR. Recortar cobertura para entrar en el
> presupuesto sería peor que declarar el excedente.

> **TDD en este ciclo: deshabilitado.** Es una feature, no una corrección de defecto
> (`~/proyectos/CLAUDE.md` §6.3). Modo estándar: el test viaja en el mismo commit que el código
> que verifica, sin exigir RED verificado antes de la implementación.

> **Ayuda: escritura suspendida** (`CLAUDE.md` del repo). Ningún WU crea ni actualiza artículos
> de `backend/ayuda/*.md`, salvo que un WU vuelva **falso** un artículo existente: en ese caso
> se corrige en el mismo commit. ADR-11 ya revisó `equipos-listado.md:11`,
> `compras-insumos-stock.md` y `permisos-y-roles.md:145-184` y siguen siendo verdaderos; cada WU
> que cambia un comportamiento descrito ahí **repite la búsqueda** (`rg -n "<término>"
> backend/ayuda/`) y lo deja anotado en su PR. Los WU con UI visible (13 a 19, más los de borde
> que el usuario percibe indirectamente solo a través de esos) anotan la deuda en el cuerpo del
> commit y del PR: *"Ayuda pendiente: modo de seguimiento por serie en el ABM del insumo, casilla
> 'unidad entera' en unidades de medida, ficha con unidades (serial, condición, estado) e
> historial por serial, carga y corrección de serial, devolución de una pieza entregada y
> recuperación de una pieza descartada, seriales y selector de unidad en entrada, salida y
> ajuste, seriales en la recepción de compra, alta de componente eligiendo unidad o con serial,
> retiro de un componente legado con serial"*.

> **Specs de `openspec/specs/`: no se editan en apply.** El alta de `unidades-insumo-serie` y los
> deltas de `stock-insumo-condicion` y `componentes-catalogo-unico` los hace `sdd-archive`. Este
> cambio no implementa un punto de `docs/roadmap-comercial.md`: no aplica citar una decisión de
> producto del roadmap.

## Decisiones de planificación que prevalecen sobre el diseño donde difieran

1. **Cortes pre-planificados** (lección de los ciclos anteriores: el tamaño real fue 2 a 3 veces
   la estimación). Se parten **desde el inicio** los cuatro WU que el diseño marca con corte:
   WU-3 → 3a (persistencia de unidades y locks) / 3b (repositorio de eventos); WU-7a → 7a (entrada,
   ajuste positivo, completarConPendientes, retiro legado) / 7a2 (casos 3 a 5 de `orden-de-locks`);
   WU-10 → 10a (entidad, mapper, editar, `preparar`, instalar con unidad) / 10b (D3, alta sin
   descuento); WU-17 → 17a (entrada y ajuste positivo) / 17b (salida y ajuste negativo). Cada mitad
   lleva su código con sus tests.
2. **Migración única y bases locales.** WU-1 es la **única** migración tenant del ciclo. No hay
   migración MASTER. Las bases locales se migran **a mano**: `cd backend &&
   DATABASE_URL_TENANT=postgresql://soporte:soporte@localhost:5432/soporte_tenant_test pnpm
   migrate:tenant` y `pnpm migrate:tenants` para las de desarrollo. Nada más agrega migraciones; si
   un WU descubre que necesita una, se detiene y se declara.
3. **`usarLockMasterTest()`.** Todo spec e2e nuevo o retargeteado que trunque `soporte_master_test`
   lo llama antes de su `describe`. Los specs de integración con base tenant **efímera** no lo
   necesitan.
4. **Compilación entre WU.** `unidadId` es opcional en `MovimientoInsumoEntity.create()` desde
   WU-2 y `seguimiento` existe solo en aplicación hasta WU-12a: ningún insumo puede ser `SERIE` por
   HTTP antes de la llave, así que cada WU queda en verde sin cambiar llamadores ajenos.
5. **Orden global de locks (ADR-12, invariante L: L0, LC, L1, L2, L3, L4).** Todo WU que agrega un
   camino de escritura declara en su spec qué niveles toma y en qué orden. Donde el diseño lista un
   caso de `orden-de-locks.concurrencia.integration.spec.ts` (casos 1 a 7), el caso entra en **ese**
   WU, con una **mutación adversarial local** (invertir el orden o quitar el lock, ver el spec
   ponerse rojo, revertir la mutación y dejarlo verde). La mutación **no se commitea**; el PR
   declara el resultado observado.
6. **Estados intermedios no desplegables.** El backend exige `seriales` y `unidadId` para un insumo
   `SERIE` antes de que el frontend los envíe. La llave (WU-12a) entra cuando todas las ramas
   `SERIE` del backend existen. El tracker se integra a `main` una sola vez.
7. **Tamaño real.** Estimar 2 a 3 veces la cifra del diseño. Política del dueño: partir en costura
   limpia con código y tests juntos; `size:exception` solo si partir separa el código de sus
   tests, y entonces **cada commit de más de 400 líneas** lleva en su propio cuerpo
   `size:exception: N lineas, <por qué>`.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~9.600 (+/−) nominal; real esperable 2 a 3x en los WU de riesgo (hasta ~20.000 si no se parte) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Tracker con 31 PR hijos en cadena lineal (27 del diseño; 3a/3b, 7a/7a2, 10a/10b y 17a/17b pre-partidos) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
400-line budget risk: High

**Por qué "No" a la decisión:** el dueño ya confirmó la estrategia (auto-chain,
feature-branch-chain, un solo release del tracker), la política de tamaño y las decisiones de
producto E1-E3, F1-F4 y G1-G2. El único supuesto abierto del diseño (recuperación como ENTRADA y
con `AJUSTAR`, ADR-14) es una línea del servicio y no bloquea: si el dueño lo revierte, se
corrige en WU-8d sin rediseño. Los cortes conocidos están pre-planificados; lo que exceda en apply
se resuelve con la política de tamaño, sin consulta previa. Candidatos a `size:exception` desde
ya: WU-2 (máquina de estados completa y mappers: el tipo de la entidad rompe la compilación de los
mappers si se separa) y WU-5 si `integración de lote` no se separa de las operaciones.

| WU | Estimación diseño | Esperable real | Riesgo | Corte previsto si se pasa |
|---|---|---|---|---|
| 1 | ~300 | ~450 | Medio | Sin costura: migración, schema y constraint spec viajan juntos (`size:exception` probable) |
| 2 | ~380 | ~600 | Alto | Dominio de unidad/evento vs. `seguimiento`/`entera`/`unidadId` en entidades existentes |
| 3a | ~300 | ~500 | Alto | Repo de unidad vs. `exigirTransaccionActiva` + lecturas con lock |
| 3b | ~100 | ~200 | Bajo | — |
| 4a | ~350 | ~600 | Alto | `ingresar` vs. `sacarDelDeposito` |
| 4b | ~300 | ~500 | Alto | `devolverEntregas` vs. `cargarSerial`/`corregirSerial` |
| 5 | ~380 | ~650 | Alto | Instalar/devolver vs. descartar/reinstalar/altaInstalada |
| 6 | ~380 | ~600 | Alto | Caso de uso de cambio vs. L0/LC en Crear/Editar |
| 7a | ~250 | ~450 | Alto | — |
| 7a2 | ~150 | ~250 | Medio | — |
| 7b | ~380 | ~600 | Alto | Salida/ajuste vs. consulta + invariante |
| 8a | ~300 | ~500 | Medio | DTOs vs. controller y e2e |
| 8b | ~350 | ~600 | Medio | Lecturas (listar, historial) vs. escrituras (cargar, corregir) |
| 8c | ~250 | ~400 | Medio | — |
| 8d | ~350 | ~550 | Alto | `recuperarDescartadas` vs. caso de uso y ruta |
| 9 | ~250 | ~400 | Medio | — |
| 10a | ~300 | ~500 | Alto | Entidad/mapper/editar vs. instalar |
| 10b | ~150 | ~250 | Medio | — |
| 11 | ~380 | ~600 | Alto | Retiro vs. reactivar |
| 12a | ~250 | ~400 | Medio | — |
| 12b | ~300 | ~500 | Alto | DTOs/crear vs. editar con L0 |
| 13 | ~350 | ~550 | Medio | Tipos/schemas vs. diálogo |
| 14 | ~150 | ~250 | Bajo | — |
| 15 | ~350 | ~550 | Medio | Sección de unidades vs. historial |
| 16a | ~250 | ~400 | Medio | — |
| 16b | ~350 | ~550 | Medio | — |
| 17a | ~200 | ~350 | Medio | — |
| 17b | ~200 | ~350 | Medio | — |
| 18 | ~250 | ~400 | Medio | — |
| 19 | ~350 | ~550 | Medio | Alta vs. retiro legado |
| 20 | ~80 | ~100 | Bajo | — |

## Cadena de PR y dependencias

Ramas: `feat/repuestos-numero-de-serie-wuNN` (`wu03a`, `wu03b`, `wu07a`, `wu07a2`, `wu10a`,
`wu10b`, `wu17a`, `wu17b` y el resto con su número; `wu04a`, `wu04b`, `wu08a` a `wu08d`, `wu12a`,
`wu12b`, `wu16a`, `wu16b`). El tracker `feat/repuestos-numero-de-serie` ya contiene los commits de
planificación. **Cada PR hijo apunta a la rama del PR inmediatamente anterior**; solo el tracker
se integra a `main`, en un único release, y solo es desplegable entero.

`main` ← tracker ← wu01 ← wu02 ← wu03a ← wu03b ← wu04a ← wu04b ← wu05 ← wu06 ← wu07a ← wu07a2 ←
wu07b ← wu08a ← wu08b ← wu08c ← wu08d ← wu09 ← wu10a ← wu10b ← wu11 ← wu12a ← wu12b ← wu13 ← wu14
← wu15 ← wu16a ← wu16b ← wu17a ← wu17b ← wu18 ← wu19 ← wu20

| WU | Depende de | Motivo |
|---|---|---|
| 1 | — | Esquema, catálogos y seed de `entera` |
| 2 | 1 | Dominio sobre las columnas nuevas |
| 3a | 2 | Repos de unidad y lecturas con lock sobre las entidades |
| 3b | 3a | Repo de eventos; las operaciones lo consumen |
| 4a | 3b | `ingresar` y `sacarDelDeposito` usan repos de unidad y evento |
| 4b | 4a | Extiende el servicio y crea el helper del invariante |
| 5 | 4b | Operaciones de equipo sobre el mismo servicio |
| 6 | 3a | Cambio de seguimiento usa L0/L1/L2 y conteos |
| 7a | 4b, 6 | Entrada `SERIE` y la rama de retiro legado |
| 7a2 | 7a, 6 | Casos 3 a 5 necesitan la entrada con L1 y el cambio de seguimiento |
| 7b | 7a2 | Salida, ajuste y consulta con L1; invariante |
| 8a | 7b | El borde expone lo que la aplicación ya decide |
| 8b | 8a | Endpoints de unidades |
| 8c | 8b | Devolución de entrega sobre el controller de unidades |
| 8d | 8c | Recuperación sobre el mismo controller |
| 9 | 7a | Recepción llama a la entrada con `completarConPendientes` |
| 10a | 5, 7b | Instalar usa `instalar` y la salida con unidad |
| 10b | 10a | D3 usa `altaInstalada` y `preparar` |
| 11 | 8d, 10b | Retiro y reactivar; incluye el caso posterior a recuperar |
| 12a | 8d, 9, 11 | La llave entra con todas las ramas `SERIE` del backend |
| 12b | 12a | `entera` editable, caso 7 de `orden-de-locks` |
| 13 | 12a | Frontend consume `seguimiento` |
| 14 | 12b, 13 | Casilla `entera` |
| 15 | 8b, 13 | Sección de unidades e historial |
| 16a | 8b, 15 | Cargar y corregir serial |
| 16b | 8d, 16a | Diálogo de reingreso (F2, G1) |
| 17a | 15 | Selector y seriales en entrada y ajuste positivo |
| 17b | 17a | Selector en salida y ajuste negativo |
| 18 | 9, 13 | Seriales en la recepción |
| 19 | 11, 15 | Equipos |
| 20 | 11 | Runbook del tracker completo |

## Recordatorios operativos

- **`usarLockMasterTest()`**: ver decisión 3.
- **Higiene de base efímera**: limpiar filas → `app.close()` → `dropDatabase`. Al revés, el DROP
  falla en silencio. Los specs de concurrencia de `orden-de-locks` usan dos clientes y pausas
  (`pg_sleep` o barrera entre promesas) sobre base efímera.
- **Suite completa del backend**: `pnpm test` tarda ~10 a 15 min. Correrla en cada WU de backend
  como puerta final; durante el desarrollo, solo los archivos afectados con `pnpm vitest run`.
- **Si la suite tira `PrismaClientKnownRequestError` masivo** en los `*.integration.spec.ts`, es
  la base caída (`P1001`) o la migración de WU-1 sin aplicar a `soporte_tenant_test`, no el código.
- **Después de tocar `schema.prisma`**: `pnpm prisma generate --schema prisma_tenant/schema.prisma`.
- **Gates de frontend**: `cd frontend && pnpm lint && pnpm type-check && pnpm test`.
- **Gates de backend**: `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run <ruta> &&
  pnpm test`.
- **Conventional Commits, sin atribución de IA. No commitear desde esta fase de tasks**; apply
  commitea por WU.
- **Nunca hardcodear el nombre de la base de un tenant real**; consultar `clientes`.
- Ningún test toca un tenant real: usan bases efímeras o `soporte_tenant_test`.

---

## WU-1 — Migración única, schema, catálogos de dominio, seed de `entera`, spec de constraints

**Branch**: `feat/repuestos-numero-de-serie-wu01` · **Base**: tracker
(`feat/repuestos-numero-de-serie`)

- [x] 1.1 Migración tenant `backend/prisma_tenant/migrations/<timestamp>_unidades_insumo_serie/migration.sql` con las cinco piezas de ADR-1: `unidades_medida.entera BOOLEAN NOT NULL DEFAULT false` (y `UPDATE … SET entera = true WHERE codigo IN ('UNI','PAR')`); `insumos.seguimiento VARCHAR(10) NOT NULL DEFAULT 'NINGUNO'` con CHECK; tabla `unidades_insumo` con sus CHECK con nombre (condición, estado, `(estado = 'INSTALADA') = (equipo_id IS NOT NULL)`, `numero_serie IS NOT NULL OR estado IN ('EN_DEPOSITO','DESCARTADA')` —F1—, `(numero_serie IS NULL) = (numero_serie_normalizado IS NULL)`) y `UNIQUE (insumo_id, numero_serie_normalizado) WHERE numero_serie_normalizado IS NOT NULL`; `movimientos_insumo.unidad_id` con FK RESTRICT, `CHECK (unidad_id IS NULL OR cantidad = 1)` e índice parcial; `componentes_equipo.unidad_id` con FK, `CHECK (unidad_id IS NULL OR numero_serie IS NULL)` y `UNIQUE (unidad_id) WHERE unidad_id IS NOT NULL AND deleted_at IS NULL`; tabla `eventos_unidad_insumo` (ADR-9: `movimiento_id` UNIQUE NULL, `equipo_id` FK NULL, `componente_id` UUID NULL **sin FK**, `usuario_id` sin FK, `clock_timestamp()`, índice `(unidad_id, created_at)`, CHECK contra `TIPOS_EVENTO_UNIDAD`). Timestamp posterior a la última migración tenant. (Req: modo de seguimiento; unidad con serial, condición y estado; legado sin unidad)
- [x] 1.2 `schema.prisma`: modelos `UnidadInsumo` y `EventoUnidadInsumo`, campos `seguimiento`, `entera`, `unidadId` en movimientos y componentes, relaciones con nombre. Regenerar el cliente.
- [x] 1.3 Catálogos de dominio (fuente única que los CHECK espejan): `SEGUIMIENTOS_INSUMO`, `ESTADOS_UNIDAD_INSUMO`, `TIPOS_EVENTO_UNIDAD`, `UNIDAD_SERIAL_MAX_LENGTH`, `normalizarSerial()` en `insumos/domain/entities/unidad-insumo.entity.ts` (solo constantes y función; la entidad completa es WU-2). Spec de `normalizarSerial`: mayúsculas, espacios internos, vacío, `ß`.
- [x] 1.4 Seeder de tenants (`clientes/infrastructure/tenant-seeder.adapter.ts`): `entera: true` en `UNI` y `PAR` del piso sembrado; ajustar su integración.
- [x] 1.5 `unidades-insumo-constraints.integration.spec.ts` (base tenant **efímera**): cada CHECK real (`pg_get_constraintdef`) contra los catálogos, incluida la rama de pendiente descartada; INSERT fuera de catálogo falla; unicidad con serial normalizado y en `DESCARTADA`; mismo serial en otro insumo permitido; `unidad_id` con `cantidad <> 1` falla; `componentes_equipo` con unidad y serial de texto falla; insumo existente queda `NINGUNO` y `unidades_medida` `UNI`/`PAR` quedan `entera`. (Escenarios abajo)
- [x] 1.6 **Migrar las bases locales a mano**: `cd backend && DATABASE_URL_TENANT=postgresql://soporte:soporte@localhost:5432/soporte_tenant_test pnpm migrate:tenant` y `pnpm migrate:tenants` (desarrollo). Verificar con `\d unidades_insumo`, `\d eventos_unidad_insumo` y `\d movimientos_insumo`.
- [x] 1.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/domain src/insumos/infrastructure/prisma/unidades-insumo-constraints.integration.spec.ts src/clientes` y `pnpm test`.

**Escenarios**: Insumo existente tras la migración; Valor de seguimiento inválido (base); Estado
inválido (base); Unidad instalada refiere su equipo (CHECK); Unidad entregada no refiere equipo;
Serial duplicado con otra capitalización, de una unidad descartada y mismo serial en otro insumo
(índice); Migración con componentes previos.
**PR boundary**: ~450 líneas reales, base tracker. Sin costura limpia (migración, schema y su
constraint spec no se separan): probable `size:exception: N lineas, migracion, schema y spec de
constraints no se separan`. Revert limpio: todo es aditivo con defaults.
**Real**: ~900 líneas (migración 112, schema 135, spec de constraints 510, dominio 100, mappers y seeder ~40, artefactos ~40), `size:exception`: sin costura limpia.
**Ayuda**: sin deuda (sin cambio visible).
Commit sugerido: `feat(insumos): esquema de unidades por numero de serie`.

## WU-2 — Dominio: unidad, evento, `seguimiento`, `entera`, `unidadId`, mappers

**Branch**: `feat/repuestos-numero-de-serie-wu02` · **Base**: wu01

- [x] 2.1 `UnidadInsumoEntity` con la máquina de estados completa de ADR-1 (tabla de transiciones; pendiente solo sale por ajuste negativo; una `INSTALADA` siempre tiene serial; `ENTREGADA → EN_DEPOSITO` en NUEVO o USADO; `DESCARTADA → EN_DEPOSITO` con serial o pendiente). Specs de transiciones válidas e inválidas y de `cargarSerial` solo sobre `EN_DEPOSITO`. (Req: estado de la unidad; serie pendiente)
- [x] 2.2 `EventoUnidadInsumoEntity` (append-only, `componenteId` opcional) y specs.
- [x] 2.3 `InsumoEntity.seguimiento` y `puedeCambiarSeguimiento()` (recibe los conteos ya leídos); `UnidadMedidaEntity.entera`; `MovimientoInsumoEntity.unidadId` **opcional** con la regla `unidadId ⇒ cantidad = 1`; `saldosDesdeUnidades(conteo)` en `tipo-movimiento-insumo.ts` sin tocar `calcularStock()` ni `calcularSaldos()`. Specs.
- [x] 2.4 Mappers (insumo, unidad de medida, movimiento, unidad, evento). `InsumoMapper.toPersistence()` devuelve `seguimiento` para la rama `create`; la exclusión de la rama `update` es WU-3a. Specs de mapper.
- [x] 2.5 Errores de dominio de insumos de ADR-8 (`SerialDuplicadoError`, `UnidadNoDisponibleError`, `UnidadRequeridaError`, `UnidadNoAdmitidaError`, `SerialesNoCoincidenError`, `SerialRequeridoError`, `CantidadNoEnteraError`, `SeguimientoNoModificableError`, `UnidadMedidaNoEnteraError`, `UnidadMedidaEnUsoPorSerieError`, `UnidadMedidaCambiadaError`, `MotivoRecuperacionRequeridoError`, `UnidadNoEncontradaError`) y de equipos (`SerialDeUnidadNoEditableError`, `UnidadDelComponenteNoDisponibleError`) en sus `*.errors.ts`. Sin mapeo HTTP todavía.
- [x] 2.6 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/domain src/insumos/infrastructure src/equipos/domain` y `pnpm test`.

**Escenarios**: Insumo NINGUNO sin cambios (entidad); Movimiento sin unidad / Insumo NINGUNO con
unidad (regla de entidad); Saldo de un insumo SERIE (`saldosDesdeUnidades`); Estado inválido
(entidad).
**PR boundary**: ~600 líneas reales, base wu01. Si supera 400: corte entre (2.1, 2.2, 2.5) y
(2.3, 2.4); si se separa el tipo de la entidad de sus mappers, `size:exception` con ese motivo.
**Real**: ~2.300 líneas en dos commits con la costura de este work unit (parte 1 con 2.1, 2.2 y 2.5: ~1.400, la entidad con su spec por tabla de transiciones pesa ~760; parte 2 con 2.3 y 2.4: ~880, specs de las entidades y de los cinco mappers). Las dos partes llevan `size:exception`: ninguna baja de 400 sin separar el código de sus tests.
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): dominio de unidad de insumo con maquina de estados`.

## WU-3a — Persistencia de unidades, `exigirTransaccionActiva`, lecturas con lock, `save()` sin `seguimiento`

**Branch**: `feat/repuestos-numero-de-serie-wu03a` · **Base**: wu02

- [x] 3a.1 `shared/infrastructure/persistence/exigir-transaccion-activa.ts` (+spec) extrayendo el chequeo `tenantContext.get()?.enTransaccion !== true` de `lockAndSumByTipo`; `lockAndSumByTipo` lo llama.
- [x] 3a.2 Puerto `i-unidad-insumo.repository.ts` y `prisma-unidad-insumo.repository.ts`: lecturas `FOR NO KEY UPDATE` (L3) en orden de id, CAS de estado (`UPDATE … WHERE id = ? AND estado = ?`; 0 filas lanza), `contarEnDepositoPorCondicion`, listados, y traducción de P2002 a `SerialDuplicadoError` lanzado como `FalloOperacionDeUnidad` (exportada). Mapper. Todas las lecturas con lock llaman `exigirTransaccionActiva`.
- [x] 3a.3 Lecturas con lock de fila (ADR-12): `insumoRepo.leerSeguimientoParaMovimiento(id)` (L1 `FOR SHARE`), `insumoRepo.bloquearParaCambioDeSeguimiento(id)` (L1 `FOR NO KEY UPDATE`, devuelve `seguimiento` y `unidad_medida_id`), `unidadMedidaRepo.leerParaUso(id)` (L0 `FOR SHARE`, lee `entera`) y la variante de escritura (L0 `FOR UPDATE`/`FOR NO KEY UPDATE`, se usa en WU-12b), `movimientoRepo.bloquearStock(id)` (L2; `lockAndSumByTipo` pasa a llamarla).
- [x] 3a.4 W3: `PrismaInsumoRepository.save()` **no escribe** `seguimiento` en la rama `update`; nuevo `IInsumoRepository.cambiarSeguimiento(id, valor)` como único escritor. Integración: cargar la entidad, cambiar `seguimiento` por `cambiarSeguimiento`, guardar la entidad vieja con `save()` y verificar que sigue `SERIE`. **Mutación adversarial local**: escribir `seguimiento` en la rama `update` ⇒ el test debe ponerse rojo; revertir.
- [x] 3a.5 Integración del repo de unidades (base efímera): CAS, P2002 → `SerialDuplicadoError`, índice con serial normalizado. Concurrencia (molde `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts`): mismo serial en dos inserciones ⇒ una; misma unidad en dos CAS ⇒ una. **Mutación adversarial local**: quitar el `FOR NO KEY UPDATE` de la lectura de unidades ⇒ la concurrencia debe ponerse roja; revertir.
- [x] 3a.6 Registrar los repos nuevos en `insumos.module.ts` (tokens).
- [x] 3a.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/shared/infrastructure src/insumos/infrastructure` y `pnpm test`.

**Escenarios**: Concurrencia con el mismo serial; Concurrencia sobre la misma unidad (capa repo);
Serial duplicado (P2002); Insumo NINGUNO sin cambios (`save()` no pisa `seguimiento`).
**PR boundary**: ~500 líneas, base wu02. Corte si se pasa: (3a.1, 3a.3) vs. (3a.2, 3a.4, 3a.5).
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): repositorio de unidades y lecturas con lock de fila`.

## WU-3b — Repositorio de la bitácora de eventos

**Branch**: `feat/repuestos-numero-de-serie-wu03b` · **Base**: wu03a

- [x] 3b.1 Puerto `i-evento-unidad-insumo.repository.ts` con solo `insert` y `listarPorUnidad`; `prisma-evento-unidad-insumo.repository.ts` y mapper; orden cronológico por `(created_at, id)`. Token en `insumos.module.ts`.
- [x] 3b.2 Integración (base efímera): insertar eventos de cada tipo, listar en orden, `movimiento_id` UNIQUE rechaza un segundo evento sobre el mismo movimiento, `componente_id` se guarda sin FK. (Req: historial consultable)
- [x] 3b.3 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/infrastructure` y `pnpm test`.

**Escenarios**: Unidad sin historia anterior (lista vacía); Vida completa de una unidad (base del
orden).
**PR boundary**: ~200 líneas, base wu03a.
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): repositorio de eventos de unidad de insumo`.

## WU-4a — `OperacionesUnidadInsumo` I: `ingresar` y `sacarDelDeposito`

**Branch**: `feat/repuestos-numero-de-serie-wu04a` · **Base**: wu03b

- [x] 4a.1 `insumos/application/services/operaciones-unidad-insumo.service.ts` con el contrato común de ADR-4: exige transacción activa (vía la primera lectura con lock, sin abrir la suya), toma locks en el orden de ADR-12 (L1 de todos los insumos del lote, L2 de todos, L3 de todas las unidades, cada nivel en orden de id), **valida todo antes de escribir**, CAS de transición, `insumoId` de la unidad = el del movimiento, insumo `SERIE`, cantidad entera (`CantidadNoEnteraError`).
- [x] 4a.2 `ingresar(insumoId, piezas, o)`: INSERT unidad (serial normalizado o NULL) + movimiento (`unidadId`, cantidad 1, condición) + evento `INGRESO`; `tipo` ENTRADA o AJUSTE_POSITIVO; `itemCompraId` y `equipoId` opcionales; devuelve `UnidadConMovimiento[]`. Serial repetido dentro del mismo lote rechazado antes de escribir.
- [x] 4a.3 `sacarDelDeposito(insumoId, unidadIds, o)`: SALIDA ⇒ unidad `ENTREGADA` (solo con serial) + evento `ENTREGA` con `movimiento_id`; AJUSTE_NEGATIVO ⇒ `DESCARTADA` (con serial o pendiente, F1) + evento `BAJA_DE_DEPOSITO`; `condicion` opcional que, si viene y no coincide, da `UnidadNoDisponibleError`. Destino (`equipoId`, `sectorId`, `motivo`) queda en el movimiento.
- [x] 4a.4 Specs unitarios con fakes: lote de N; un fallo en la unidad 2 no escribe la 1 (validar-todo-antes-de-escribir); unidad de otro insumo; pendiente en SALIDA rechazada; pendiente en AJUSTE_NEGATIVO admitida; `Result.fail` nunca sigue a una escritura.
- [x] 4a.5 Integración de lote (base efímera): entrada de 3 piezas en una transacción; P2002 en la tercera revierte las tres; `sacarDelDeposito` concurrente sobre la misma unidad ⇒ una sola. **Mutación adversarial local**: escribir antes de validar ⇒ rojo; revertir.
- [x] 4a.6 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/application/services` y `pnpm test`.

**Escenarios**: Entrada de varias piezas; Varias unidades en una transacción; Falla en una del
lote; Falla parcial; Concurrencia sobre la misma unidad; Salida de una unidad elegida por serial
(servicio); Baja de una unidad pendiente por ajuste negativo (servicio); Entrada manual SERIE
(servicio).
**PR boundary**: ~600 líneas, base wu03b. Corte si se pasa: `ingresar` / `sacarDelDeposito`.
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): operaciones de unidad para ingresar y sacar del deposito`.

## WU-4b — `OperacionesUnidadInsumo` II: devolver entregas, cargar y corregir serial, helper del invariante

**Branch**: `feat/repuestos-numero-de-serie-wu04b` · **Base**: wu04a

- [x] 4b.1 `devolverEntregas(insumoId, unidadIds, { condicion })`: `ENTREGADA → EN_DEPOSITO` en NUEVO o USADO + ENTRADA de 1 + evento `DEVOLUCION_DE_ENTREGA`; rechaza unidad no `ENTREGADA` con `UnidadNoDisponibleError`; insumo `NINGUNO` con `SeguimientoNoModificableError`. (Req: Una unidad entregada puede volver al depósito)
- [x] 4b.2 `cargarSerial(unidadId, numeroSerie)`: solo `EN_DEPOSITO` pendiente; normaliza, P2002 ⇒ `SerialDuplicadoError`; evento `SERIAL_CARGADO` sin movimiento ni motivo. `corregirSerial(unidadId, numeroSerie, motivo)`: motivo obligatorio normalizado (tope 500); evento `CORRECCION_SERIAL` con `serial_anterior`, `serial_nuevo`, motivo y usuario; rechaza una unidad `INSTALADA`. (Req: corrección auditada)
- [x] 4b.3 Helper `insumos/testing/invariante-serie.ts`: compara `conteo EN_DEPOSITO` contra `calcularSaldos(libro)` por condición y verifica que el último evento de cada unidad coincide con su estado. Spec del helper. El spec de integración del invariante completo entra en WU-7b.
- [x] 4b.4 Specs unitarios (fakes) y de integración de lote para `devolverEntregas`, `cargarSerial` (completar pendiente; serial repetido), `corregirSerial` (válida, sin motivo, a un serial existente, sobre `INSTALADA`).
- [x] 4b.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/application/services src/insumos/testing` y `pnpm test`.

**Escenarios**: Devolución de una pieza sin uso / usada; Devolución de una unidad que no está
entregada; Devolución con el insumo ya en NINGUNO; Completar un serial pendiente; Completar con un
serial repetido; Corrección válida; Corrección sin motivo; Corrección a un serial existente;
Corregir una unidad instalada.
**PR boundary**: ~500 líneas, base wu04a. Corte si se pasa: `devolverEntregas` / serial.
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): operaciones de unidad para devolver entregas y serial`.

## WU-5 — Operaciones de equipo: instalar, devolver al depósito, descartar, reinstalar, alta instalada

**Branch**: `feat/repuestos-numero-de-serie-wu05` · **Base**: wu04b

- [x] 5.1 `instalar(items, o)`: `EN_DEPOSITO → INSTALADA` + SALIDA + evento `INSTALACION` con `equipoId` y `componenteId` (id ya generado por la entidad, sin FK); rechaza pendiente (`UnidadNoDisponibleError`).
- [x] 5.2 `devolverAlDeposito(items, o)`: `INSTALADA → EN_DEPOSITO` USADO + ENTRADA USADO + evento `RETIRO_A_DEPOSITO`. `descartarInstaladas(items, o)`: `INSTALADA → DESCARTADA` sin movimiento + evento `DESCARTE` con `componenteId`.
- [x] 5.3 `reinstalar(items, o)`: toma L1, L2 y L3; exige `DESCARTADA` **y** que el último evento sea el `DESCARTE` de ese mismo `componenteId`; si no, `UnidadDelComponenteNoDisponibleError`; si el insumo ya no es `SERIE`, `SeguimientoNoModificableError`; evento `REACTIVACION`.
- [x] 5.4 `altaInstalada(insumoId, numeroSerie, equipoId, o)`: unidad `INSTALADA` con la condición indicada, sin movimiento, evento `ALTA_INSTALADA` con `componenteId`; P2002 ⇒ `SerialDuplicadoError`.
- [x] 5.5 Specs unitarios (fakes) y de integración de lote: la baja de equipo completo las reutiliza en lote (N unidades, un motivo compartido); fallo en una del lote revierte todo; reinstalar tras una recuperación (evento posterior) rechaza. **Mutación adversarial local**: invertir L2 y L3 en el servicio ⇒ el spec de lote con dos clientes debe detectarlo (espera o `40P01`); revertir.
- [x] 5.6 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/application/services` y `pnpm test`.

**Escenarios**: Varias unidades en una transacción; Falla en una del lote; Instalar una unidad
pendiente; Alta sin descuento con serial / con serial repetido (servicio); Reactivar un componente
con unidad descartada / de un insumo que volvió a NINGUNO / cuya unidad se recuperó (guard del
servicio).
**PR boundary**: ~650 líneas, base wu04b. Corte si se pasa: (instalar, devolver, descartar) /
(reinstalar, altaInstalada). `size:exception` solo si la integración de lote no puede separarse.
**Ayuda**: sin deuda.
**Real**: partido en tres ramas por la política de tamaño: `wu05` (instalar, ~330 líneas), `wu05-2` (devolver y descartar, ~295), `wu05-3` (reinstalar, altaInstalada, error duplicado y spec de orden de locks, ~440, `size:exception`).
Commit sugerido: `feat(insumos): operaciones de unidad para instalar, retirar y reinstalar`.

## WU-6 — Cambio de seguimiento en aplicación (sin borde HTTP), L0 y LC en crear, guard en editar

**Branch**: `feat/repuestos-numero-de-serie-wu06` · **Base**: wu05

- [x] 6.1 `CambiarSeguimientoInsumoUseCase` (ADR-3) en `txRunner.run()`: lectura sin lock del `unidad_medida_id` → L0 `leerParaUso` → L1 `bloquearParaCambioDeSeguimiento` → **re-lectura (W1)**: si la unidad cambió, `UnidadMedidaCambiadaError` (409, reintentable) y no se toma L0 sobre la nueva → L2 `bloquearStock` → conteos sobre la nueva instantánea. `NINGUNO → SERIE`: saldo total 0 y unidad `entera`; `SERIE → NINGUNO`: cero unidades `EN_DEPOSITO` y cero `INSTALADA` (`ENTREGADA` y `DESCARTADA` no lo impiden). Escribe con `cambiarSeguimiento`. `SeguimientoNoModificableError` con el motivo. (Req: SERIE solo con saldo cero y unidad entera)
- [x] 6.2 `CrearInsumoUseCase`: acepta `seguimiento`; toma siempre L0 (`FOR SHARE` de la unidad elegida) y después el advisory `insumo-codigo:<prefijo>` (LC, el que ya toma `findLastSecuenciaCodigo`) antes del INSERT; rechaza `SERIE` con unidad no entera (`UnidadMedidaNoEnteraError`). `EditarInsumoUseCase`: cuando cambia `unidadMedidaId`, corre en transacción con L0 sobre la unidad destino y L1 `FOR NO KEY UPDATE`; decide con el `seguimiento` de esa lectura; rechaza la unidad no entera en un insumo `SERIE`.
- [x] 6.3 Specs unitarios (fakes): activar con saldo 0 / con saldo distinto de cero / con unidad no entera; volver a `NINGUNO` con unidades vivas y con solo entregadas o descartadas; activación con unidad cambiada ⇒ `UnidadMedidaCambiadaError`.
- [x] 6.4 `orden-de-locks.concurrencia.integration.spec.ts` **casos 1 y 2** (base efímera, dos clientes y pausas): (1) activación contra `EditarInsumo` que cambia la unidad en vuelo ⇒ sin `40P01`, la activación aborta con `UnidadMedidaCambiadaError`; (2) dos cambios de seguimiento concurrentes ⇒ sin `40P01`, se serializan en L1. **Mutación adversarial local**: invertir L1 y L2 en el cambio de seguimiento ⇒ el spec debe ponerse rojo (`40P01` o timeout); revertir y dejar verde.
- [x] 6.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos` y `pnpm test`.

**Escenarios**: Activar con saldo cero; Activar con saldo distinto de cero; Activar con unidad de
medida no entera; Cambio de seguimiento concurrente con un movimiento (parte: dos cambios);
Activación mientras se cambia la unidad de medida; Volver a NINGUNO con unidades vivas; Volver a
NINGUNO con unidades entregadas o descartadas; Insumo NINGUNO sin cambios.
**PR boundary**: ~600 líneas, base wu05. Corte si se pasa: caso de uso de cambio / L0 y LC en
Crear y Editar.
**Ayuda**: sin deuda (no hay borde; `seguimiento` no es visible todavía).
Commit sugerido: `feat(insumos): cambio de seguimiento con orden global de locks`.

## WU-7a — Entrada con L1, ajuste positivo, `completarConPendientes`, retiro legado

**Branch**: `feat/repuestos-numero-de-serie-wu07a` · **Base**: wu06

- [x] 7a.1 `registrar-entrada-insumo.use-case.ts`: el primer lock es `leerSeguimientoParaMovimiento` (L1 `FOR SHARE`), el `seguimiento` que decide la rama es el de esa lectura. `NINGUNO`: como hoy; `seriales` ⇒ `UnidadNoAdmitidaError`. `SERIE`: `seriales` obligatorio, `length === cantidad`, sin pendientes (`SerialesNoCoincidenError`), cantidad entera → `ingresar`. Opción interna `completarConPendientes` (no es campo del DTO HTTP) que rellena con unidades pendientes hasta la cantidad (ADR-6). La entrada `NINGUNO` no toma L2.
- [x] 7a.2 `registrar-ajuste-insumo.use-case.ts`, rama positiva: igual que la entrada con `tipo: 'AJUSTE_POSITIVO'`; el motivo ya lo exige la entidad.
- [x] 7a.3 `registrarDevolucionDeComponente`: suma `unidadId?` y `numeroSerie?`; componente con unidad → `devolverAlDeposito`; componente **legado** de un insumo hoy `SERIE` → `numeroSerie` obligatorio e `ingresar` USADO con `equipoId`; **sin serial** ⇒ `SerialRequeridoError` (422) sin cambiar nada (no admite serie pendiente). Conserva los guards de insumo y familia del ciclo anterior.
- [x] 7a.4 Specs unitarios (fakes): ramas `NINGUNO`/`SERIE`; entrada SERIE con seriales / sin serial o repetido; ajuste positivo SERIE con y sin motivo; `unidadId` en `NINGUNO` ⇒ `UnidadNoAdmitidaError`; retiro legado con serial y sin serial.
- [x] 7a.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/application` y `pnpm test`.

**Escenarios**: Entrada manual SERIE con seriales; Entrada manual SERIE sin serial o repetido;
Ajuste positivo SERIE; Ajuste positivo SERIE sin motivo; Insumo NINGUNO con unidad; Entrada manual
USADO de un insumo deshabilitado sigue rechazada; Entrada manual de usados; Ajuste positivo de
usados; Retiro al stock de un componente legado de un insumo SERIE / de un legado sin serial
informado (a nivel caso de uso); Las unidades sin serial entran como serie pendiente (caso de uso).
**PR boundary**: ~450 líneas reales, base wu06. Si pasa de 400, dividir (7a.1, 7a.2) / 7a.3.
**Real**: partido en tres ramas encadenadas: wu07a (7a.1, entrada con `seriales` y `completarConPendientes`, ~620 líneas, `size:exception`: el caso de uso, su cableado y sus specs no se separan), wu07a-2 (7a.2, ajuste positivo) y wu07a-3 (7a.3 a 7a.5, devolución de componente).
**Ayuda**: repetir `rg -n "entrada|ajuste" backend/ayuda/compras-insumos-stock.md backend/ayuda/permisos-y-roles.md`; no cambia nada visible (sin borde). Sin deuda.
Commit sugerido: `feat(insumos): entrada y ajuste positivo por serie con lectura de seguimiento bajo lock`.

## WU-7a2 — Casos 3 a 5 de `orden-de-locks`

**Branch**: `feat/repuestos-numero-de-serie-wu07a2` · **Base**: wu07a

- [x] 7a2.1 Casos en `orden-de-locks.concurrencia.integration.spec.ts` (base efímera, dos clientes): (3) `SERIE → NINGUNO` contra una entrada `SERIE` en vuelo ⇒ sin `40P01`, la entrada comitea y el cambio se rechaza porque ve las unidades nuevas; (4) `NINGUNO → SERIE` contra una entrada `NINGUNO` en vuelo ⇒ sin `40P01`, el cambio ve saldo distinto de cero y se rechaza; (5) orden inverso de 3 y 4 (el cambio comitea primero) ⇒ la entrada, al obtener L1, sigue la rama nueva y da 422 (`SerialesNoCoincidenError` o `UnidadNoAdmitidaError`). (Req: Cambio de seguimiento concurrente con un movimiento)
- [x] 7a2.2 **Mutación adversarial local**: que la entrada tome L2 antes de L1 (o que el cambio tome L2 antes que L1) ⇒ casos 3 a 5 deben detectarlo (`40P01`); revertir y dejar verde. Declarar el resultado en el PR.
- [x] 7a2.3 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/infrastructure/prisma/orden-de-locks.concurrencia.integration.spec.ts` y `pnpm test`.

**Escenarios**: Cambio de seguimiento concurrente con un movimiento (las tres variantes).
**PR boundary**: ~250 líneas, base wu07a. Solo specs (más helpers de barrera); revert limpio.
**Ayuda**: sin deuda.
Commit sugerido: `test(insumos): orden de locks entre entrada y cambio de seguimiento`.

## WU-7b — Salida y ajuste negativo con L1, consulta `SERIE`, invariante, caso 6

**Branch**: `feat/repuestos-numero-de-serie-wu07b` · **Base**: wu07a2

- [x] 7b.1 `registrar-salida-insumo.use-case.ts` y rama negativa de `registrar-ajuste-insumo.use-case.ts`: primer lock L1 `FOR SHARE`; `NINGUNO`: como hoy, un `unidadId` ⇒ `UnidadNoAdmitidaError`; `SERIE`: `unidadId` obligatorio (`UnidadRequeridaError`), cantidad 1, salida con serial → `sacarDelDeposito` (queda `ENTREGADA`); ajuste con motivo, admite pendiente (F1), queda `DESCARTADA`; `UnidadNoDisponibleError` (no `StockInsuficienteError`) si la unidad no está `EN_DEPOSITO` o no coincide la condición pedida.
- [x] 7b.2 `ConsultarStockInsumoUseCase`: único lector que ramifica: `SERIE ? saldosDesdeUnidades(contarEnDepositoPorCondicion) : calcularSaldos(sumByTipo)`; la respuesta suma `seguimiento` y `pendientesDeSerie`; `estadoReposicion` sobre NUEVO.
- [x] 7b.3 `invariante-serie.integration.spec.ts` (base efímera) con el helper de WU-4b: secuencia entrada → salida → instalar → retirar USADO → descartar → devolución de entrega → recuperación (la recuperación se habilita en WU-8d; aquí se deja el paso con las operaciones de servicio de WU-4b y se completa ahí si falta) verificando el invariante tras cada paso.
- [x] 7b.4 `orden-de-locks` **caso 6**: salida `NINGUNO` contra `NINGUNO → SERIE` ⇒ sin `40P01`.
- [x] 7b.5 **Mutaciones adversariales locales** (cada una debe poner un spec en rojo; revertir): (a) contar `INSTALADA` o `ENTREGADA` en el saldo ⇒ rojo en el invariante; (b) salida que deja `DESCARTADA` en vez de `ENTREGADA` ⇒ rojo; (c) quitar el lock de fila de las unidades ⇒ rojo en concurrencia de salida (misma unidad en dos salidas ⇒ una).
- [x] 7b.6 Specs unitarios: salida sin unidad, con unidad no disponible, con unidad pendiente; ajuste negativo con unidad y motivo, de una pendiente, sin motivo; saldo de un insumo SERIE por condición; reposición sobre NUEVO.
- [x] 7b.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos` y `pnpm test`.

**Escenarios**: Salida de una unidad elegida por serial; Salida sin elegir unidad o con unidad no
disponible; Ajuste negativo con unidad y motivo; Ajuste negativo de una unidad en serie pendiente;
Ajuste negativo SERIE sin motivo; Saldo de un insumo SERIE; Saldo por condición; Reposición sobre
NUEVO; Invariante tras una secuencia de operaciones; Concurrencia sobre la misma unidad;
Unidad entregada no refiere equipo ni cuenta en el saldo; Insumo NINGUNO con unidad.
**PR boundary**: ~600 líneas reales, base wu07a2. Corte si se pasa: (7b.1, 7b.4, 7b.6) / (7b.2, 7b.3).
**Real**: ~1190 lineas, entregadas en 4 ramas encadenadas: wu07b (salida, 343), wu07b-2 (ajuste negativo y caso 6, 311), wu07b-3 (consulta de stock, 153), wu07b-4 (invariante de integracion y artefactos, 386).
**Ayuda**: repetir `rg -n "salida|ajuste|saldo" backend/ayuda/`; los ajustes siguen pidiendo `AJUSTAR` y motivo (ADR-11). Sin deuda si sigue verdadero.
Commit sugerido: `feat(insumos): salida, ajuste negativo y consulta de stock por unidad`.

## WU-8a — Borde de movimientos: `seriales`, `unidadId`, respuestas, e2e

**Branch**: `feat/repuestos-numero-de-serie-wu08a` · **Base**: wu07b

- [x] 8a.1 `RegistrarMovimientoInsumoHttpDto` (lo hereda el ajuste): `seriales?: string[]` (`@ArrayMaxSize(100)`, cada uno recortado, 1 a 255), `unidadId?: uuid`. `MovimientoInsumoResponseDto`: `unidadId`, `numeroSerie` (include). `StockInsumoResponseDto`: `seguimiento`, `pendientesDeSerie`.
- [x] 8a.2 Mapeo HTTP explícito en `movimientos-insumo.controller.ts` de los errores de ADR-8 (`UnidadNoAdmitidaError`, `UnidadRequeridaError`, `UnidadNoDisponibleError`, `SerialesNoCoincidenError`, `SerialDuplicadoError` 409, `CantidadNoEnteraError`). Decoradores de permiso sin cambio.
- [x] 8a.3 e2e (`usarLockMasterTest()`): como ningún insumo es `SERIE` por HTTP hasta WU-12a, el e2e prepara el insumo `SERIE` **por SQL directo** en el tenant efímero; casos: entrada con seriales, salida con `unidadId`, ajuste negativo; 403 sin permiso; 409 de serial duplicado; 422 de cada error; `NINGUNO` rechaza `seriales` y `unidadId` con 422.
- [x] 8a.4 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/interface` y `pnpm test`.

**Escenarios**: Entrada de varias piezas; Movimiento sin unidad; Insumo NINGUNO con unidad;
Entrada manual SERIE con seriales / sin serial o repetido; Salida sin elegir unidad o con unidad no
disponible; Ajuste negativo SERIE sin motivo.
**PR boundary**: ~500 líneas, base wu07b. Corte si se pasa: DTOs y respuestas / controller y e2e.
**Ayuda**: repetir `rg -n "permiso|AJUSTAR|ALTAS" backend/ayuda/permisos-y-roles.md` (líneas 145-184): los permisos no cambian. Sin deuda (la UI llega en WU-17).
Commit sugerido: `feat(insumos): seriales y unidad en el borde de movimientos`.

## WU-8b — Borde de unidades: listar, historial, cargar y corregir serial

**Branch**: `feat/repuestos-numero-de-serie-wu08b` · **Base**: wu08a

- [x] 8b.1 Casos de uso `ListarUnidadesInsumoUseCase` (`estado`, `disponibles=true` = `EN_DEPOSITO` con serial; el ajuste negativo pide `estado=EN_DEPOSITO` e incluye pendientes), `ConsultarHistorialUnidadUseCase` (cronológico; lee `sector_id`, `equipo_id` y `motivo` del movimiento referenciado sin copiarlos), `CargarSerialUnidadUseCase`, `CorregirSerialUnidadUseCase` (transacción, L1 primero, delega en el servicio).
- [x] 8b.2 `unidades-insumo.controller.ts`: `GET /insumos/:id/unidades` y `GET …/unidades/:unidadId/historial` con `INSUMOS:LECTURA`; `POST …/unidades/:unidadId/serial` con `INSUMOS:ALTAS`; `POST …/unidades/:unidadId/correccion-serial` con `INSUMOS:AJUSTAR` (`{ numeroSerie, motivo }`, `transformarMotivo`, 500). DTOs (`UnidadInsumoResponseDto`, `EventoUnidadResponseDto`). `UnidadNoEncontradaError` 404. Mapeo explícito de errores. Sin chequeos de permiso dentro de los métodos.
- [x] 8b.3 e2e (`usarLockMasterTest()`): listar y filtrar; historial de una vida completa, de una descartada, de una entregada (destino visible) y de una sin historia; cargar serial válido / repetido; corrección válida / sin motivo / a un serial existente / sobre instalada; 403 por cada ruta sin su permiso.
- [x] 8b.4 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos` y `pnpm test`.

**Escenarios**: Completar un serial pendiente; Completar con un serial repetido; Corrección válida;
Corrección sin motivo; Corrección a un serial existente; Corregir una unidad instalada; Vida
completa de una unidad; Historial de una unidad descartada; Historial de una unidad entregada;
Unidad sin historia anterior; Selector sin pendientes (filtro `disponibles`).
**PR boundary**: ~600 líneas, base wu08a. Corte si se pasa: lecturas / escrituras.
**Real**: partido en `wu08b` (lecturas, 1156 líneas, size:exception por el arnés e2e) y `wu08b-2` (escrituras).
**Ayuda**: sin deuda (UI en WU-15/16a).
Commit sugerido: `feat(insumos): endpoints de unidades, historial y correccion de serial`.

## WU-8c — Devolución de entrega (F2, ADR-13)

**Branch**: `feat/repuestos-numero-de-serie-wu08c` · **Base**: wu08b

- [x] 8c.1 `DevolverEntregaUseCase` (`POST /insumos/:insumoId/unidades/:unidadId/devolucion-entrega`, `INSUMOS:ALTAS`, body `{ condicion, motivo? }`): transacción, L1 → `operaciones.devolverEntregas()` (L2, L3) → ENTRADA de 1 con `unidadId` y la condición elegida → evento `DEVOLUCION_DE_ENTREGA`. Guards: insumo `SERIE`; unidad `ENTREGADA`; `USADO` sigue la regla de repuestos. **Exención G2**: `validarInsumoElegible` sin `exigirHabilitado` (sigue debiendo existir y estar vigente) y `validarCondicionAdmitida(..., { admitirFamiliaNoVigente: true })`; la exención vive solo en este caso de uso; la entrada y el ajuste manuales no la reciben.
- [x] 8c.2 Specs unitarios: devolución NUEVO y USADO, unidad no entregada, insumo `NINGUNO`, insumo deshabilitado admitido, familia no vigente admitida pero `esRepuesto = false` con USADO rechazada.
- [x] 8c.3 e2e (`usarLockMasterTest()`): ruta, 403 sin `ALTAS`, 422 de cada guard, respuesta `MovimientoInsumoResponseDto`; el historial muestra `DEVOLUCION_DE_ENTREGA`.
- [x] 8c.4 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos` y `pnpm test`.

**Escenarios**: Devolución de una pieza sin uso; Devolución de una pieza usada; Devolución de una
unidad que no está entregada; Devolución con el insumo ya en NINGUNO; Devolución de una pieza de
un insumo deshabilitado.
**PR boundary**: ~400 líneas, base wu08b.
**Ayuda**: sin deuda (UI en WU-16b).
Commit sugerido: `feat(insumos): devolucion de una pieza entregada al deposito`.

## WU-8d — Recuperar pieza descartada (G1, ADR-14)

**Branch**: `feat/repuestos-numero-de-serie-wu08d` · **Base**: wu08c

- [x] 8d.1 `recuperarDescartadas(insumoId, unidadIds, { condicion })` en el servicio: `DESCARTADA → EN_DEPOSITO` con serial o pendiente (una pendiente vuelve pendiente), ENTRADA de 1 con la condición elegida y el motivo, evento `RECUPERACION`; no reevalúa unicidad. Specs del servicio e integración de lote; el invariante sube 1 en la misma condición.
- [x] 8d.2 `RecuperarUnidadDescartadaUseCase` (`POST …/unidades/:unidadId/recuperacion`, `INSUMOS:AJUSTAR`, body `{ condicion, motivo }` con `transformarMotivo`, 500): motivo obligatorio (`MotivoRecuperacionRequeridoError`); guards de `SERIE` (`SeguimientoNoModificableError`) y `DESCARTADA` (`UnidadNoDisponibleError`); insumo deshabilitado y familia no vigente **admitidos** con la exención de G2. Movimiento ENTRADA (supuesto del orquestador: cambiarlo a AJUSTE_POSITIVO es una línea del servicio).
- [x] 8d.3 Completar el paso de recuperación en `invariante-serie.integration.spec.ts` si WU-7b lo dejó pendiente. **Mutación adversarial local**: que la recuperación no escriba la ENTRADA ⇒ rojo en el invariante; revertir.
- [x] 8d.4 Specs unitarios y e2e (`usarLockMasterTest()`): recuperar NUEVO y USADO, una pendiente descartada (vuelve pendiente), sin motivo, unidad no descartada, insumo deshabilitado; 403 sin `AJUSTAR`; reactivar el componente tras recuperar queda cubierto en WU-11.
- [x] 8d.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos` y `pnpm test`.

**Escenarios**: Recuperar una pieza dada de baja por error; Recuperar como usada una pieza
descartada desde un equipo; Recuperar una pendiente descartada; Recuperar sin motivo; Recuperar una
unidad que no está descartada; Recuperar con el insumo deshabilitado; Invariante tras una
secuencia de operaciones.
**PR boundary**: ~550 líneas reales, base wu08c. Corte si se pasa: servicio (8d.1) / caso de uso y ruta.
**Ayuda**: repetir la búsqueda en `permisos-y-roles.md:145-184`: `AJUSTAR` ahora también cubre la recuperación; si el artículo enumera qué cubre `AJUSTAR` de forma cerrada, **corregirlo en este WU**. Deuda de UI en WU-16b.
Commit sugerido: `feat(insumos): recuperacion de una pieza descartada`.

## WU-9 — Recepción de compra `SERIE` (compras)

**Branch**: `feat/repuestos-numero-de-serie-wu09` · **Base**: wu08d

- [x] 9.1 `RegistrarRecepcionDeItemDto`: `seriales?: string[]` (`@ArrayMaxSize`, cada uno 1 a 255). `registrar-recepcion-de-item.use-case.ts`: con insumo `SERIE`, dentro de la misma transacción de hoy: delta entero (`CantidadNoEnteraError`, rechaza toda la recepción), `seriales.length ≤ delta` (`SerialesNoCoincidenError`), llama `registrarEntradaInsumo.execute({ …, seriales, completarConPendientes: true, itemCompraId })`; delta cero no crea nada (idempotencia); recepción parcial crea solo las de su delta. La recepción queda completa aunque haya pendientes. `NINGUNO` sin cambios.
- [x] 9.2 Controller de compras: mapeo de los errores; decoradores sin cambio. El flujo de recepción no acepta `condicion` (sigue fijo en NUEVO).
- [x] 9.3 Specs unitarios y e2e (`usarLockMasterTest()`): recepción con todos los seriales, parciales (pendientes), con serial repetido, fraccional, parcial acumulada, delta cero idempotente; el insumo `SERIE` se prepara por SQL directo.
- [x] 9.4 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/compras src/insumos/application` y `pnpm test`.

**Escenarios**: Recepción de compra; El flujo de recepción no acepta condición; Recepción SERIE con
todos los seriales; Recepción SERIE con seriales parciales; Recepción SERIE con serial repetido;
Recepción SERIE fraccional; Recepción sin seriales (serie pendiente).
**PR boundary**: ~400 líneas reales, base wu08d.
**Ayuda**: repetir `rg -n "recepci" backend/ayuda/compras-insumos-stock.md`; la recepción sigue subiendo el stock por delta (ADR-11), verdadero; si deja de serlo, corregir aquí. Deuda de UI en WU-18.
Commit sugerido: `feat(compras): recepcion de items con seriales y pendientes`.

## WU-10a — Equipos: entidad, mapper con serial resuelto, editar, `preparar`, instalar con unidad

**Branch**: `feat/repuestos-numero-de-serie-wu10a` · **Base**: wu09

- [x] 10a.1 `ComponenteEquipoEntity.unidadId`; `PrismaComponenteEquipoRepository` incluye `unidad.numeroSerie` y el mapper lo expone como `numeroSerie`; `save()` escribe NULL en `numero_serie` cuando hay unidad. `ComponenteResponseDto`: `unidadId` y `numeroSerie` resuelto.
- [x] 10a.2 `AgregarComponenteUseCase` se parte en `preparar()` (valida y construye la entidad con `unidadId` y `numeroSerie` NULL, sin escribir) + `execute()` (preparar y guardar). Sin cambio de conducta para `NINGUNO`.
- [x] 10a.3 `InstalarComponenteDesdeDepositoUseCase` con `unidadId` y en este orden (ADR-12: locks antes de la primera escritura): `preparar()` → `operaciones.instalar([{ unidadId, equipoId, componenteId }])` (L1, L2, L3) → `vincularInstalacion(salida.id)` → un único `save()` (L4). Sin `unidadId`, el camino de hoy; insumo `SERIE` sin `unidadId` ⇒ `UnidadRequeridaError`. `numeroSerie` y `condicion` del body se ignoran con `unidadId`. Unidad pendiente o de otro insumo ⇒ `UnidadNoDisponibleError`.
- [x] 10a.4 `EditarComponenteUseCase`: con unidad, `numeroSerie` en el PATCH ⇒ `SerialDeUnidadNoEditableError` (422); legado como hoy.
- [x] 10a.5 Borde: `CreateComponenteHttpDto.unidadId?`; mapeo de errores en `equipos.controller.ts`; e2e (`usarLockMasterTest()`): instalar una unidad elegida por serial, alta SERIE sin unidad o con pendiente, unidad tomada por otra operación (dos altas concurrentes ⇒ una), editar serial de unidad y de legado, rollback de todo si falla la SALIDA, `EQUIPOS:ALTAS` sin permisos de INSUMOS instala. **Mutación adversarial local**: escribir el componente (L4) antes de `operaciones.instalar` ⇒ el spec de orden debe detectarlo; revertir.
- [x] 10a.6 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos src/insumos/application` y `pnpm test`.

**Escenarios**: Instalar una unidad SERIE elegida por serial; Alta SERIE sin unidad o con unidad
pendiente; Unidad tomada por otra operación; Editar el serial de un componente con unidad / de un
componente legado; Edición de datos propios; Intento de cambiar el insumo; Instalar una unidad sin
permisos de insumos; Descuento por defecto; Descuento del saldo USADO; Stock insuficiente en la
condición elegida; Falla la SALIDA y se revierte el alta; Migración con componentes previos;
Editar el serial de un componente legado (insumos).
**PR boundary**: ~500 líneas, base wu09. Corte si se pasa: (10a.1, 10a.2, 10a.4) / (10a.3, 10a.5).
**Ayuda**: repetir `rg -n "serial" backend/ayuda/equipos-listado.md` (línea 11 habla del serial del equipo, verdadero) y buscar si algún artículo describe el serial del componente. Deuda de UI en WU-19.
Commit sugerido: `feat(equipos): instalar un componente eligiendo la unidad por serial`.

## WU-10b — Alta sin descuento con unidad (D3)

**Branch**: `feat/repuestos-numero-de-serie-wu10b` · **Base**: wu10a

- [x] 10b.1 Alta con `descontarStock: false` de un insumo `SERIE`: `numeroSerie` obligatorio (`SerialRequeridoError`); patrón `preparar()` → `operaciones.altaInstalada({ …, componenteId })` → `save()` (L4); la condición indicada (NUEVO por defecto) se aplica a la unidad: el controller la pasa solo cuando el insumo es `SERIE` y con `NINGUNO` sigue ignorándose. Serial repetido ⇒ `SerialDuplicadoError` (409) y rollback del alta.
- [x] 10b.2 Specs unitarios y e2e (`usarLockMasterTest()`): alta sin descuento con serial / sin serial / con serial repetido; el historial muestra `ALTA_INSTALADA`; alta con `NINGUNO` sin cambios; el saldo no cambia.
- [x] 10b.3 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos` y `pnpm test`.

**Escenarios**: Alta sin descuento con serial; Alta sin descuento sin serial; Alta sin descuento
con serial repetido; Alta sin descuento; Insumo NINGUNO sin cambios.
**PR boundary**: ~250 líneas, base wu10a.
**Ayuda**: sin deuda de backend (UI en WU-19).
Commit sugerido: `feat(equipos): alta sin descuento crea una unidad ya instalada`.

## WU-11 — Equipos: retiro con unidad y legado con serial, reactivar en transacción

**Branch**: `feat/repuestos-numero-de-serie-wu11` · **Base**: wu10b

- [ ] 11.1 `RetirarComponenteUseCase` con unidad: `STOCK_USADO` → `devolverAlDeposito` (la unidad vuelve USADO con su serial); `DESCARTE` → `descartarInstaladas` (sin movimiento). Componente **legado** de un insumo hoy `SERIE`: `numeroSerie` obligatorio en `RetirarComponenteHttpDto` e `ingresar` USADO con `equipoId`; sin serial ⇒ `SerialRequeridoError` (422) sin cambiar nada. Insumo `NINGUNO`, como hoy. Guards de insumo y familia sin cambio. Motivo obligatorio del retiro intacto.
- [ ] 11.2 `ReactivarComponenteUseCase` pasa a correr en transacción: con unidad, `reinstalar` (L1, L2, L3) y después `save()` del componente (L4); tras `STOCK_USADO` sigue rechazado (asimetría vigente); unidad descartada por otro evento o recuperada ⇒ `UnidadDelComponenteNoDisponibleError`; insumo ya `NINGUNO` ⇒ `SeguimientoNoModificableError`; legado sin unidad, como hoy.
- [ ] 11.3 Concurrencia (base efímera): dos retiros del mismo componente ⇒ uno; retiro concurrente con reactivar ⇒ sin `40P01`. **Mutación adversarial local**: en reactivar, `save()` antes de `reinstalar` ⇒ el spec debe detectarlo; revertir.
- [ ] 11.4 Specs unitarios y e2e (`usarLockMasterTest()`): devolver una unidad al depósito (vuelve USADO con serial), descartar, retiro legado con serial / sin serial, retiro sin permisos de insumos con `EQUIPOS:BORRADO`, reactivar tras descartar, reactivar con unidad descartada, con insumo vuelto a `NINGUNO`, **tras recuperar** (ADR-14), legado, y reactivar con `EQUIPOS:MODIFICACION` sin INSUMOS.
- [ ] 11.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos src/insumos` y `pnpm test`.

**Escenarios**: Devolver una unidad al depósito; Descartar una unidad; Retiro al stock de un
componente legado de un insumo SERIE; Retiro al stock de un legado sin serial informado; Retiro
al stock de una unidad de origen sin salida; Retiro al stock sin motivo; Devolver al stock como
usado; Descartar por rotura; Descarte sin motivo; Falla la ENTRADA y se revierte el retiro;
Usuario sin permiso de borrado; Usuario con borrado y sin permisos de insumos; Componente ya
retirado; Devolver una unidad al retirar sin permisos de insumos; Reactivar tras devolver al stock
/ tras descartar / un retiro legado; Reactivar un componente con unidad descartada / de un insumo
que volvió a NINGUNO / cuya unidad se recuperó / legado sin unidad.
**PR boundary**: ~600 líneas reales, base wu10b. Corte si se pasa: retiro (11.1) / reactivar (11.2).
**Ayuda**: repetir `rg -n "retir|reactiv" backend/ayuda/`; si un artículo describe el retiro o reactivar de forma que ahora es falsa, **corregirlo en este WU**. Deuda de UI en WU-19.
Commit sugerido: `feat(equipos): retiro y reactivar de componentes con unidad`.

## WU-12a — La llave: `PATCH /insumos/:id/seguimiento`, `seguimiento` en alta y respuestas

**Branch**: `feat/repuestos-numero-de-serie-wu12a` · **Base**: wu11

- [ ] 12a.1 `PATCH /insumos/:id/seguimiento` (body `{ seguimiento }`, `@IsIn(SEGUIMIENTOS_INSUMO)`) con `AdminClienteGuard` (mismo gate que el ABM del catálogo), delegando en `CambiarSeguimientoInsumoUseCase`; mapeo de `SeguimientoNoModificableError` (422) y `UnidadMedidaCambiadaError` (409).
- [ ] 12a.2 `CreateInsumoHttpDto.seguimiento?` (`@IsIn`) y `seguimiento` en la respuesta del insumo y del listado; `UnidadMedidaNoEnteraError` (422) mapeado en el alta y en el `PATCH` general.
- [ ] 12a.3 e2e (`usarLockMasterTest()`): activar con saldo cero / distinto de cero / con unidad no entera; volver a `NINGUNO` con unidades vivas y con solo entregadas o descartadas; 403 sin admin de cliente; alta con `seguimiento`; un `EditarInsumo` con entidad vieja no revierte `seguimiento` (W3 por HTTP); **flujo completo por HTTP** (activar, entrada con seriales, instalar, retirar, descartar, recuperar) que cierra la cadena de backend.
- [ ] 12a.4 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos && pnpm test`. Con este WU el backend `SERIE` es alcanzable: correr además la suite de `src/equipos` y `src/compras`.

**Escenarios**: Activar con saldo cero; Activar con saldo distinto de cero; Activar con unidad de
medida no entera; Volver a NINGUNO con unidades vivas; Volver a NINGUNO con unidades entregadas o
descartadas; Valor de seguimiento inválido; Insumo NINGUNO sin cambios; Cambio de seguimiento
concurrente con un movimiento (por HTTP).
**PR boundary**: ~400 líneas reales, base wu11. Este PR es el primero desplegable hacia `SERIE`:
declararlo en el cuerpo.
**Ayuda**: deuda anotada (modo de seguimiento); sin artículo falso.
Commit sugerido: `feat(insumos): endpoint de seguimiento por serie del insumo`.

## WU-12b — Unidades de medida `entera` (F3), caso 7 de `orden-de-locks`

**Branch**: `feat/repuestos-numero-de-serie-wu12b` · **Base**: wu12a

- [ ] 12b.1 `CrearUnidadMedidaHttpDto` y `EditarUnidadMedidaHttpDto`: `entera?: boolean` (default `false` en el alta); respuesta con `entera`. `CrearUnidadMedidaUseCase` la acepta.
- [ ] 12b.2 `EditarUnidadMedidaUseCase`: toma L0 de escritura —`FOR UPDATE` siempre que el DTO traiga `codigo`, `FOR NO KEY UPDATE` si no— y luego cuenta insumos `SERIE`; desmarcar con alguno en uso ⇒ `UnidadMedidaEnUsoPorSerieError` (422). No toma ningún otro lock del orden.
- [ ] 12b.3 `orden-de-locks` **caso 7**: desmarcar `entera` contra una activación en vuelo ⇒ sin `40P01`; la edición espera en L0 y se rechaza. **Mutación adversarial local**: tomar `FOR NO KEY UPDATE` aunque venga `codigo`, o contar antes de bloquear ⇒ el spec debe ponerse rojo; revertir.
- [ ] 12b.4 Specs unitarios y e2e (`usarLockMasterTest()`): marcar `entera` una unidad propia; desmarcar una usada por un insumo `SERIE`; renombrar `codigo` de `UNI` con un insumo `SERIE` vigente (la entera no se toca, el insumo sigue válido); gate actual del ABM de catálogos conservado.
- [ ] 12b.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos && pnpm test`.

**Escenarios**: Marcar entera una unidad de medida propia; Desmarcar entera una unidad usada por un
insumo SERIE; Activación mientras se cambia la unidad de medida; Activar con unidad de medida no
entera.
**PR boundary**: ~500 líneas reales, base wu12a. Corte si se pasa: (12b.1) / (12b.2, 12b.3).
**Ayuda**: repetir `rg -n "unidad de medida|unidades de medida" backend/ayuda/`; deuda de UI en WU-14.
Commit sugerido: `feat(insumos): unidad de medida entera editable`.

## WU-13 — Frontend: tipos, schemas, seguimiento en el ABM y orden de las dos llamadas

**Branch**: `feat/repuestos-numero-de-serie-wu13` · **Base**: wu12b

- [ ] 13.1 `features/insumos/types.ts` y `schemas.ts` (Zod espejo del backend): `seguimiento`, `entera`, `UnidadInsumo`, `EventoUnidad`, `seriales`, `unidadId`, `pendientesDeSerie`; cota de serial 1 a 255 y `seriales` máximo 100.
- [ ] 13.2 `insumo-form-dialog.tsx`: selector de seguimiento; al editar con cambio de `seguimiento` más otros campos, el orden de llamadas según la dirección (hacia `SERIE`: primero `PATCH /insumos/:id` y luego `…/seguimiento`; hacia `NINGUNO`, al revés). Si la segunda falla, el diálogo queda abierto con el error, informa que los demás cambios ya se guardaron y deja reintentar solo el seguimiento. Manejo del 409 `UnidadMedidaCambiadaError` (reintentar). Mostrar el motivo de `SeguimientoNoModificableError`.
- [ ] 13.3 Tests (MSW + `renderWithProviders`): alta con seguimiento; edición en las dos direcciones con el orden verificado; fallo de la segunda llamada; error de saldo distinto de cero.
- [ ] 13.4 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/insumos && pnpm test`.

**Escenarios**: Activar con saldo cero / distinto de cero / con unidad no entera (UI); Volver a
NINGUNO con unidades vivas (UI); Insumo NINGUNO sin cambios.
**PR boundary**: ~550 líneas reales, base wu12b. Corte si se pasa: tipos/schemas / diálogo.
**Ayuda**: deuda en commit y PR (texto de la nota de cabecera).
Commit sugerido: `feat(insumos): seguimiento por serie en el ABM del insumo`.

## WU-14 — Frontend: casilla `entera` en el ABM de unidades de medida

**Branch**: `feat/repuestos-numero-de-serie-wu14` · **Base**: wu13

- [ ] 14.1 `unidad-medida-form-dialog.tsx` y `unidad-medida-list.tsx`: casilla `entera` (columna en el listado); mostrar el error `UnidadMedidaEnUsoPorSerieError`. Schema Zod espejo.
- [ ] 14.2 Tests (MSW): alta y edición con `entera`; desmarcar una usada por un insumo `SERIE` muestra el motivo.
- [ ] 14.3 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/insumos && pnpm test`.

**Escenarios**: Marcar entera una unidad de medida propia; Desmarcar entera una unidad usada por un
insumo SERIE (UI).
**PR boundary**: ~250 líneas, base wu13.
**Ayuda**: deuda en commit y PR.
Commit sugerido: `feat(insumos): casilla de unidad entera en el ABM de unidades de medida`.

## WU-15 — Frontend: sección de unidades e historial en la ficha

**Branch**: `feat/repuestos-numero-de-serie-wu15` · **Base**: wu14

- [ ] 15.1 `hooks/use-unidades-insumo.ts` (TanStack Query, clave `["insumo", id, "unidades"]`) y `unidades-insumo-section.tsx` en `insumo-detail-view.tsx`: unidades con serial (o "serie pendiente"), condición, estado y equipo; filtro por estado; contador de pendientes; la sección solo aparece con `seguimiento = SERIE`.
- [ ] 15.2 `unidad-historial-dialog.tsx`: eventos cronológicos, destino de la entrega leído del movimiento, serial anterior y nuevo con motivo en las correcciones.
- [ ] 15.3 Tests (MSW): insumo `NINGUNO` sin sección; `SERIE` con unidades de todos los estados; historial de una vida completa, de una descartada, de una entregada.
- [ ] 15.4 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/insumos && pnpm test`.

**Escenarios**: Vida completa de una unidad; Historial de una unidad descartada; Historial de una
unidad entregada; Unidad sin historia anterior; Saldo por condición (ficha).
**PR boundary**: ~550 líneas reales, base wu14. Corte si se pasa: sección / historial.
**Ayuda**: deuda en commit y PR.
Commit sugerido: `feat(insumos): ficha con unidades e historial por serial`.

## WU-16a — Frontend: cargar y corregir serial

**Branch**: `feat/repuestos-numero-de-serie-wu16a` · **Base**: wu15

- [ ] 16a.1 `unidad-serial-dialog.tsx`: modo "cargar" (unidad pendiente, sin motivo, permiso `ALTAS`) y modo "corregir" (motivo obligatorio, máx. 500, permiso `AJUSTAR`); acciones visibles según permisos del usuario; `SerialDuplicadoError` mostrado en el campo. Invalida `["insumo", id, "unidades"]`, stock y movimientos.
- [ ] 16a.2 Tests (MSW): completar pendiente, serial repetido, corrección válida, sin motivo, acción oculta sin permiso.
- [ ] 16a.3 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/insumos && pnpm test`.

**Escenarios**: Completar un serial pendiente; Completar con un serial repetido; Corrección válida;
Corrección sin motivo; Corrección a un serial existente (UI).
**PR boundary**: ~400 líneas reales, base wu15.
**Ayuda**: deuda en commit y PR.
Commit sugerido: `feat(insumos): cargar y corregir el serial de una unidad`.

## WU-16b — Frontend: `unidad-reingreso-dialog` (devolución de entrega y recuperación)

**Branch**: `feat/repuestos-numero-de-serie-wu16b` · **Base**: wu16a

- [ ] 16b.1 `unidad-reingreso-dialog.tsx` para dos acciones: devolución de una `ENTREGADA` (condición NUEVO/USADO, motivo opcional, `ALTAS`) y recuperación de una `DESCARTADA` (condición NUEVO/USADO, motivo **obligatorio**, `AJUSTAR`); USADO solo si la familia admite usados; una pendiente descartada se recupera sin serial y el diálogo lo aclara; acciones en la sección de unidades según estado y permiso.
- [ ] 16b.2 Tests (MSW): devolución NUEVO y USADO, recuperación con y sin motivo, pendiente, acción oculta sin permiso, error de insumo `NINGUNO`.
- [ ] 16b.3 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/insumos && pnpm test`.

**Escenarios**: Devolución de una pieza sin uso / usada; Recuperar una pieza dada de baja por
error; Recuperar como usada; Recuperar una pendiente descartada; Recuperar sin motivo (UI).
**PR boundary**: ~550 líneas reales, base wu16a. Corte si se pasa: devolución / recuperación.
**Ayuda**: deuda en commit y PR.
Commit sugerido: `feat(insumos): reingresar al deposito piezas entregadas o descartadas`.

## WU-17a — Frontend: seriales y selector en entrada y ajuste positivo

**Branch**: `feat/repuestos-numero-de-serie-wu17a` · **Base**: wu16b

- [ ] 17a.1 `seriales-input.tsx` (N inputs según la cantidad, cantidad entera, máx. 100, sin blancos, detección de repetidos locales); `movimiento-entrada-dialog.tsx` y la rama positiva del ajuste: con insumo `SERIE`, seriales obligatorios y cantidad entera; errores 409 y 422 en pantalla; invalida `["insumo", id, "unidades"]`, stock y movimientos. Con `NINGUNO`, sin cambios.
- [ ] 17a.2 Tests (MSW): entrada `SERIE` con seriales, repetido local, repetido del backend, ajuste positivo sin motivo; `NINGUNO` sin campo de seriales.
- [ ] 17a.3 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/insumos && pnpm test`.

**Escenarios**: Entrada manual SERIE con seriales; Entrada manual SERIE sin serial o repetido;
Ajuste positivo SERIE; Ajuste positivo SERIE sin motivo; Insumo NINGUNO sin cambios (UI).
**PR boundary**: ~350 líneas reales, base wu16b.
**Ayuda**: deuda en commit y PR.
Commit sugerido: `feat(insumos): seriales en entrada y ajuste positivo`.

## WU-17b — Frontend: selector de unidad en salida y ajuste negativo

**Branch**: `feat/repuestos-numero-de-serie-wu17b` · **Base**: wu17a

- [ ] 17b.1 `selector-unidad.tsx` (unidad por serial; cantidad fija en 1); `movimiento-salida-dialog.tsx`: lista `disponibles=true` (sin pendientes); rama negativa del ajuste: lista `estado=EN_DEPOSITO` **con** pendientes (F1) y motivo obligatorio; el frontend no envía `condicion`. Muestra que la salida deja la unidad como entregada.
- [ ] 17b.2 Tests (MSW): selector sin pendientes en la salida, con pendientes en el ajuste, cantidad fija, unidad tomada por otra operación (422) refresca la lista.
- [ ] 17b.3 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/insumos && pnpm test`.

**Escenarios**: Salida de una unidad elegida por serial; Salida sin elegir unidad o con unidad no
disponible; Ajuste negativo con unidad y motivo; Ajuste negativo de una unidad en serie pendiente;
Selector sin pendientes.
**PR boundary**: ~350 líneas reales, base wu17a.
**Ayuda**: deuda en commit y PR.
Commit sugerido: `feat(insumos): selector de unidad en salida y ajuste negativo`.

## WU-18 — Frontend: seriales en la recepción de compra

**Branch**: `feat/repuestos-numero-de-serie-wu18` · **Base**: wu17b

- [ ] 18.1 `features/compras/components/registrar-avance-dialog.tsx` y schemas: con insumo `SERIE`, `seriales-input` de hasta el delta; los blancos quedan como pendientes (con aviso); delta fraccional rechazado en pantalla; invalida también `["insumo", id, "unidades"]`.
- [ ] 18.2 Tests (MSW): recepción completa, parcial con pendientes, serial repetido, fraccional; `NINGUNO` sin cambios.
- [ ] 18.3 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/compras && pnpm test`.

**Escenarios**: Recepción SERIE con todos los seriales / parciales / con serial repetido /
fraccional; Recepción sin seriales (pendiente).
**PR boundary**: ~400 líneas reales, base wu17b.
**Ayuda**: deuda en commit y PR.
Commit sugerido: `feat(compras): seriales en la recepcion de items`.

## WU-19 — Frontend: equipos (unidad o serial en el alta, serial precargado en el retiro legado)

**Branch**: `feat/repuestos-numero-de-serie-wu19` · **Base**: wu18

- [ ] 19.1 `componente-create-dialog.tsx`: con insumo `SERIE` y descuento, `selector-unidad` (sin pendientes) y sin selector de saldo; con `descontarStock = false`, serial obligatorio y selector de condición (D3); `NINGUNO`, como hoy. Types con `unidadId`.
- [ ] 19.2 `componente-retiro-dialog.tsx`: con unidad, sin campos nuevos; componente legado de un insumo `SERIE` y destino `STOCK_USADO`: campo serial **obligatorio**, precargado con el `numeroSerie` de texto cuando no está vacío y es válido (recortado, 1 a 255; la unicidad la decide el backend). `componente-edit-dialog.tsx`: serial deshabilitado cuando hay unidad. Mensaje de `UnidadDelComponenteNoDisponibleError` al reactivar.
- [ ] 19.3 Tests (MSW): alta con unidad, alta sin descuento con serial, retiro legado precargado y vacío, edición con unidad, reactivar con unidad recuperada.
- [ ] 19.4 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/equipos && pnpm test`.

**Escenarios**: Selector de unidad en el alta; Alta sin descuento con serial / sin serial; Serial
precargado en el retiro de un legado; Retiro al stock de un legado sin serial informado; Editar el
serial de un componente con unidad; Reactivar un componente cuya unidad se recuperó (mensaje).
**PR boundary**: ~550 líneas reales, base wu18. Corte si se pasa: alta / retiro y edición.
**Ayuda**: deuda en commit y PR.
Commit sugerido: `feat(equipos): unidad o serial en el alta y retiro de componentes`.

## WU-20 — Runbook: rollback y detector del tracker

**Branch**: `feat/repuestos-numero-de-serie-wu20` · **Base**: wu19

- [ ] 20.1 `DEPLOY-VPS-runbook.md`: sección "Rollback del tracker `repuestos-numero-de-serie`" con el detector de solo lectura por tenant (ADR-10: `insumos_serie` y `unidades`; agregar el conteo de movimientos que referencian unidades), la regla (ambos en 0: revertir código es gratis y la migración queda; mayores que 0: preferir corregir hacia adelante, vía fiel = restaurar el dump de `predeploy-dump.ps1`, y la consulta de conciliación de `movimientos_insumo` con `unidad_id IS NULL` en insumos `SERIE` antes de volver a desplegar), y el paso de verificación post-deploy (`\d unidades_insumo`, detector en 0, `SELECT codigo, entera FROM unidades_medida` con `UNI` y `PAR` en `true`; un tenant que renombró `UNI` se marca a mano).
- [ ] 20.2 Sin cambios a `deploy.ps1` ni a ningún `.ps1` (ASCII, sin BOM; no se agrega script). Verificar el texto con `rg -n "Rollback del tracker" DEPLOY-VPS-runbook.md`.
- [ ] 20.3 Quality gates: documentación solamente; `git diff --stat` confirma que solo cambia el runbook.

**Escenarios**: Migración aditiva y rollback (criterio de éxito de la propuesta).
**PR boundary**: ~100 líneas, base wu19.
**Ayuda**: sin deuda.
Commit sugerido: `docs(runbook): rollback y deteccion del tracker de repuestos por serie`.

---

## Secuencia operativa (deploy del tracker)

Pasos manuales del dueño o del operador en el VPS Windows, **después** de integrar el tracker a
`main`. No son tareas de implementación ni llevan casilla: no bloquean `sdd-verify`.

1. **Precondición**: el tracker integrado a `main` con la cadena completa (WU-1 a WU-20) y la suite
   de backend y frontend en verde. Los estados intermedios no son desplegables.
2. **Dump previo**: `soporte/predeploy-dump.ps1 -DryRun` y después la corrida real (dump verificado
   de master y de cada tenant; deja los servicios detenidos).
3. **Deploy**: `soporte/deploy.ps1` (pull de `main`, builds, `migrate:tenants`, arranque). Backend y
   frontend en la misma corrida.
4. **Verificación post-deploy, solo lectura**, por tenant (la base se toma de
   `SELECT nombre, db_name, activo FROM clientes;` en master, nunca hardcodeada):
   - `\d unidades_insumo` existe con sus CHECK e índice único parcial.
   - Detector de ADR-10: `SELECT (SELECT count(*) FROM insumos WHERE seguimiento = 'SERIE') AS
     insumos_serie, (SELECT count(*) FROM unidades_insumo) AS unidades;` debe dar 0 y 0 tras el
     deploy. Agregar el conteo de movimientos que referencian unidades:
     `SELECT count(*) FROM movimientos_insumo WHERE unidad_id IS NOT NULL;` (0 esperado).
   - `SELECT codigo, entera FROM unidades_medida;` con `UNI` y `PAR` en `true`; un tenant que
     renombró `UNI` se marca a mano.
5. **Activación**: el dueño activa `SERIE` insumo por insumo, con saldo cero, desde el ABM.
6. **Rollback (ADR-10)**: con el detector en 0 y 0, revertir el código es gratis (la migración
   queda, sus defaults son inertes). Con valores mayores que 0, preferir corregir hacia adelante;
   la vía fiel es restaurar el dump de `predeploy-dump.ps1`. Revertir sin restaurar exige, antes de
   volver a desplegar, conciliar con `SELECT … FROM movimientos_insumo m JOIN insumos i ON i.id =
   m.insumo_id WHERE i.seguimiento = 'SERIE' AND m.unidad_id IS NULL`.
