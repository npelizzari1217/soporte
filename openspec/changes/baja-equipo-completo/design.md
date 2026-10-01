# Design: baja de equipo completo

## Technical Approach

Un caso de uso nuevo, `DarDeBajaEquipoUseCase`, da de baja un equipo entero en **una sola
transacción, todo o nada**. Marca el equipo `activo = false` con columnas de baja propias y
retira todas sus piezas activas con un único destino y una única leyenda. El trabajo de stock
se delega al módulo `insumos` en **una llamada por destino**, que toma los locks por lote en el
orden global de ADR-12 del ciclo `repuestos-numero-de-serie` (invariante L). Este diseño agrega
a ese orden un nivel **LE** (la fila del equipo), que serializa la baja contra toda operación
que agrega, quita o reactiva piezas del mismo equipo.

El borrado actual (`DELETE /equipos/:id`) se corrige con TDD estricto. Se bloquea con piezas
activas y con equipo dado de baja, y el chequeo corre bajo LE.

Specs de referencia: `specs/equipos-baja-completa/spec.md` (R1–R17) y los deltas
`specs/unidades-insumo-serie/spec.md` y `specs/componentes-catalogo-unico/spec.md`. Decisión de
producto: `docs/roadmap-comercial.md`, "Decisiones de producto ya cerradas", viñeta "Baja de
equipo completo".

### Hechos de código verificados

Cada hecho se verificó el 2026-10-01 sobre HEAD `40f7298a`.

| Hecho | Evidencia | Consecuencia |
|---|---|---|
| La entrada `NINGUNO` no toma el advisory (L2), **pero sí toma L1** (`FOR SHARE` sobre `insumos`) | `registrar-entrada-insumo.use-case.ts:89-104`, `:224` | La baja toma L1 de **todos** los insumos, también los `NINGUNO`, en la primera pasada. Si no, una ENTRADA `NINGUNO` después de L3 tomaría L1 fuera de orden (ADR-3) |
| `ingresar` (legado `SERIE`) toma L1 y L2 de su insumo y no toma L3 (inserta filas nuevas) | `operaciones-unidad-insumo.service.ts:112-157` | Llamarlo después de `devolverAlDeposito` tomaría L2 después de L3. Se fusiona en una sola pasada (ADR-3) |
| `devolverAlDeposito` no valida que el insumo esté vigente; el retiro individual sí lo hace antes (`validarInsumoElegible`) | `:376-406`; `registrar-entrada-insumo.use-case.ts:349-363` | Las validaciones por insumo viven en `RegistrarEntradaInsumoUseCase`, no en el servicio |
| `leerSeguimientoParaMovimiento` devuelve el seguimiento de un insumo con baja lógica (no filtra `deleted_at`) | `prisma-insumo.repository.ts:355-366` | El descarte (B) de una pieza de insumo borrado pasa, como pide R3 |
| `save()` del equipo es un upsert que reescribe `activo` | `prisma-equipo-informatico.repository.ts:49-57` | Una edición con una entidad leída antes de la baja reactivaría el equipo. `save()` deja de escribir `activo` y `baja_*` (ADR-1) |
| Los INSERT con FK a `equipos_informaticos` (componente, movimiento, evento, unidad) toman `FOR KEY SHARE` sobre el equipo, a veces después de L1–L3 | schema, ADR-12 previo | LE de la baja es `FOR NO KEY UPDATE`, que no choca con `FOR KEY SHARE`. Un `FOR UPDATE` sí chocaría y causaría un deadlock contra el retiro y la instalación |
| `preparar()` de `AgregarComponenteUseCase` corre siempre dentro de una transacción (instalar y alta sin descuento) | `instalar-componente-desde-deposito.use-case.ts:137-142,208`; `agregar-componente-sin-descuento.use-case.ts:61,74` | El LE `FOR SHARE` va en `preparar()` y cubre los tres caminos de alta |
| `EditarComponente` lee fuera de una transacción y guarda con `save()` (upsert). `toPersistence` escribe `deletedAt` y `baja_*` | `editar-componente.use-case.ts:48-68`; `componente-equipo.mapper.ts:69-73` | Una edición con una entidad leída antes de un retiro o de una baja resucita el componente. Se resuelve con un CAS (ADR-5) |
| El `ValidationPipe` global usa `whitelist: true` sin `forbidNonWhitelisted` | `app.module.ts:71` | Las claves que el DTO no declara (por ejemplo, un destino por pieza) se descartan sin error (ADR-7, R17) |
| `CrearTicketSoporte` valida el equipo fuera de la transacción. Adentro toma el advisory de numeración y después inserta el satélite con FK al equipo | `crear-ticket-soporte.use-case.ts:113-118,143-148` | Toma LE `FOR SHARE` al comienzo de su transacción (ADR-2) |
| "Abierto" = estado no terminal; `ESTADOS_TERMINALES = {CERRADO, CANCELADO}` | `tickets/domain/state-machine/estados.constants.ts:25` | `RESUELTO` cuenta como abierto (R10) |
| `ApiError.raw` conserva el cuerpo del error | `frontend/src/shared/api/types.ts:83-92` | El frontend lee `piezas` del 422 sin tocar `apiFetch` |

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué ahí |
|---|---|---|
| `CATEGORIAS_BAJA_EQUIPO`, `ETIQUETAS_CATEGORIA_BAJA`, `DESTINOS_BAJA_EQUIPO` (= `DESTINOS_RETIRO_COMPONENTE`), `componerLeyendaBaja()`, `largoMaximoTextoBaja()`, `EquipoInformaticoEntity.darDeBaja()` | domain (`equipos/domain/entities/equipo-informatico.entity.ts`) | Fuente única que espejan el CHECK, el DTO y el Zod. Reglas de una sola fila |
| `CAUSAS_PIEZA_NO_DEVOLVIBLE` y `clasificarPiezaDevuelta()` (función pura) | domain/application de insumos (`insumos/application/services/clasificar-pieza-devuelta.ts`) | Una sola regla para el resumen (sin locks) y para la baja (bajo L1). Equipos la importa, como ya importa de insumos |
| `OperacionesUnidadInsumo.devolverDesdeEquipo()` | application de insumos | Única puerta de las unidades (ADR-4 previo) |
| `RegistrarEntradaInsumoUseCase.registrarDevolucionesDeEquipo()` / `diagnosticarDevolucionesDeEquipo()` | application de insumos | Guards de insumo y familia del retiro (G2), por lote |
| `DarDeBajaEquipoUseCase`, `ResumenBajaEquipoUseCase`, guards de equipo no vigente | application de equipos | Orquestan repositorios en una transacción |
| Lecturas con lock LE, CAS de la baja, conteo de tickets abiertos, `serialesExistentes` | infrastructure (repos Prisma) | Mecanismos de Postgres |
| CHECK de coherencia y de catálogo | infrastructure (migración tenant) | Backstop; el spec de constraints compara las constantes del dominio contra la base |
| Rutas, DTOs, mapeo de errores | interface | Borde HTTP |
| Diálogo, filtro, Zod | interface del frontend | Derivados: la autoridad es el DTO del backend |

**Autorización, sus dos lugares.**

- **Borde**: `POST /equipos/:id/baja` y `GET /equipos/:id/baja/resumen` llevan
  `@RequiereAcciones('EQUIPOS:BORRADO')`. El resumen solo sirve para preparar la baja.
  `GET /equipos?incluirBajas=` y `GET /equipos/export?incluirBajas=` conservan
  `EQUIPOS:LECTURA`. `DELETE`, `PATCH` y las rutas de componentes conservan sus decoradores.
- **Inline**: ningún chequeo de permiso nuevo dentro de los métodos.
- **Consecuencia asumida (R12)**: `EQUIPOS:BORRADO` mueve stock sin permisos de INSUMOS, igual
  que el retiro de una pieza.

---

## Architecture Decisions

### ADR-1: modelo de datos — columnas de baja en el equipo, migración aditiva

Migración tenant `20261001120000_equipos_informaticos_baja`, aditiva y sin backfill:

| Columna | Definición |
|---|---|
| `baja_destino` | `VARCHAR(20) NULL`, `CHECK IN ('STOCK_USADO','DESCARTE')` |
| `baja_categoria` | `VARCHAR(20) NULL`, `CHECK IN ('VEJEZ','DONACION','ROTURA','OTRA')` |
| `baja_motivo` | `TEXT NULL`. Guarda **solo el texto libre**, recortado; la leyenda compuesta va en las piezas |
| `baja_fecha` | `TIMESTAMPTZ NULL` |
| `baja_usuario_id` | `UUID NULL`, referencia blanda a master, **sin FK** (mismo criterio que `componentes_equipo.baja_usuario_id`) |

`equipos_informaticos_baja_coherente_check`:

```sql
(activo AND baja_destino IS NULL AND baja_categoria IS NULL AND baja_motivo IS NULL
   AND baja_fecha IS NULL AND baja_usuario_id IS NULL)
OR (NOT activo AND (
     (baja_destino IS NULL AND baja_categoria IS NULL AND baja_motivo IS NULL
        AND baja_fecha IS NULL AND baja_usuario_id IS NULL)
  OR (baja_destino IS NOT NULL AND baja_categoria IS NOT NULL AND baja_fecha IS NOT NULL
        AND baja_usuario_id IS NOT NULL AND (baja_categoria <> 'OTRA' OR baja_motivo IS NOT NULL))))
```

**Un equipo `activo = false` sin datos de baja se admite.** Producción tiene 0 filas así (medición
del 2026-10-01). La rama cuesta una línea y evita que la migración aborte en un tenant o en una
base de test donde alguien marcó `activo = false` por SQL. Un equipo vigente nunca lleva datos de
baja. Rechazado: el "si y solo si" estricto, que convierte una fila histórica improbable en un
deploy abortado.

**Escritor único (mismo criterio que W3 del ciclo previo).**

- `PrismaEquipoInformaticoRepository.save()` quita `activo` y `baja_*` de la rama `update`; la rama
  `create` los conserva.
- El único escritor es `registrarBaja(equipo): Promise<boolean>`: un `updateMany` con
  `WHERE id = ? AND activo = true AND deleted_at IS NULL`. Devuelve `false` si tocó 0 filas.
- Se eliminan `deactivate()` y `activate()`, que no tienen callers de producción. `activate()`
  contradice R8 y `deactivate()` sin datos de baja contradice R1. Los reemplaza
  `darDeBaja({ destino, categoria, motivo, usuarioId, fecha })`.

**Rollback (binario viejo con la migración aplicada).** El cliente Prisma viejo no conoce las
columnas, no las selecciona y no las escribe. El binario viejo no tiene ningún camino que ponga
`activo = false`, así que no puede violar el CHECK. Una edición vieja de un equipo dado de baja
reescribe `activo = false`, que sigue coherente con sus columnas. La migración puede quedar
aplicada.

### ADR-2: nivel LE — la fila del equipo, primer lock de toda operación sobre sus piezas

| Operación | Lock LE (primero de su transacción) | Recheck bajo LE |
|---|---|---|
| `DarDeBajaEquipo`, `EliminarEquipo`, `EditarEquipo` | `bloquearParaModificar(id)`: `SELECT … FOR NO KEY UPDATE`, devuelve la entidad vigente | Existe, no borrado, `activo` |
| `AgregarComponente.preparar()` (cubre instalar, con y sin unidad, y alta sin descuento), `ReactivarComponente`, `RetirarComponente` | `bloquearParaOperarPiezas(id)`: `SELECT … FOR SHARE` | `activo` (el retiro solo toma el lock: sus piezas ya están retiradas en un equipo dado de baja) |
| `CrearTicketSoporte` (si trae `equipoId`) | `bloquearParaOperarPiezas(id)` al comienzo de su `run()`, **antes** del advisory de numeración | `activo` y no borrado; si no, `EquipoInvalidoError`, como hoy |

**Implementación (los dos métodos).**

1. Llaman a `exigirTransaccionActiva`.
2. Corren `$queryRaw SELECT id FROM equipos_informaticos WHERE id = $1::uuid FOR NO KEY UPDATE`
   (o `FOR SHARE`).
3. Devuelven `findUnique` a través del mapper: la fila ya está bloqueada, así que la lectura es la
   vigente. Es el mismo patrón que `bloquearPorIds` de unidades.
4. Devuelven `null` si la fila no existe. El caller trata `null` o `deletedAt` como
   `EquipoNoEncontradoError` (o `EquipoInvalidoError` en el ticket).

`EditarEquipo` y `EliminarEquipo` pasan a correr enteros en `txRunner.run()`. `ReactivarComponente`
mueve su chequeo dentro de la transacción.

**Orden extendido**: LE → L0 → LC → L1 → L2 → L3 → L4. Ningún camino toma LE junto con L0 o LC.
El advisory de numeración de tickets queda después de LE y la baja nunca lo toma, así que no hay
ciclo.

**Por qué no hay ciclo.**

- El LE explícito se toma siempre primero.
- Hay caminos que nunca toman LE y que sí escriben filas con FK al equipo después de tomar L1 o
  L2: la salida y el ajuste de insumos con `equipoId`. Esos INSERT toman `FOR KEY SHARE` sobre la
  fila del equipo, que no choca ni con `FOR SHARE` ni con `FOR NO KEY UPDATE`.
- Por eso se rechaza `FOR UPDATE` para la baja. La baja tendría LE `FOR UPDATE` y esperaría L2 de
  un insumo X. Una salida manual concurrente con `equipoId` tendría L2(X) y esperaría el
  `FOR KEY SHARE` del equipo al insertar su movimiento. El resultado sería `40P01`.
- El testigo T6 fija esta elección (ADR-10).

**Por qué `FOR SHARE` en las altas.** Dos instalaciones sobre el mismo equipo no se serializan
entre sí. Sí esperan a una baja o a un borrado en vuelo, y al obtener el lock ven `activo = false`
y rechazan con `EquipoDadoDeBajaError`.

Rechazado: confiar en los CAS (deja ganar a un alta posterior a la lectura de piezas de la baja, y
el componente queda activo sobre un equipo dado de baja, lo que viola R8 y R15).

**Ticket contra baja (R10).** Con el LE `FOR SHARE`, un ticket en vuelo hace esperar a la baja. Un
ticket que llega después de la baja ve `activo = false` y se rechaza. Ya no hay ventana.

### ADR-3: `DarDeBajaEquipoUseCase` — una transacción, una llamada por destino

**Fuera de la transacción** (camino rápido, sin locks):

1. El equipo existe y no está borrado (si no, `EquipoNoEncontradoError`). Si `!activo`,
   `EquipoDadoDeBajaError`.
2. `categoria` es válida. Con `OTRA`, el texto recortado es obligatorio. La leyenda cabe
   (ADR-4). Si algo falla, `MotivoBajaEquipoInvalidoError`.
3. Se leen los componentes activos. Con `STOCK_USADO`, se corre
   `registrarEntrada.diagnosticarDevolucionesDeEquipo(piezas)`:
   - Corre sin transacción y sin locks.
   - Lee el insumo con `findById`, y su `seguimiento` sale de la entidad.
     `leerSeguimientoParaMovimiento` no sirve acá porque exige una transacción activa.
   - Lee la familia con `findById`.
   - Llama a `unidadRepo.serialesExistentes` sin lock.
   - Corre `clasificarPiezaDevuelta`.

   Si hay alguna pieza con problema, `BajaEquipoConPiezasProblematicasError` con **todas**,
   incluida `SERIAL_DUPLICADO`.

**Dentro de `txRunner.run()`**, en este orden:

| Paso | Lock | Acción |
|---|---|---|
| 1 | LE `FOR NO KEY UPDATE` | Recheck `activo` y no borrado |
| 2 | — | Se releen los componentes activos. Si su conjunto de ids difiere del paso 3 de afuera: `EquipoModificadoDuranteLaBajaError` (409, reintentable). Bajo LE el conjunto ya no puede cambiar |
| 3A `STOCK_USADO` | L1 de todos → L2 de los `SERIE` → L3 | `registrarEntrada.registrarDevolucionesDeEquipo({ equipoId, usuarioId, motivo: leyenda, piezas })` → `Map<componenteId, movimientoId>` |
| 3B `DESCARTE` | L1 → L2 → L3 de los insumos con unidad | `operaciones.descartarInstaladas(itemsConUnidad ordenados por unidadId, { usuarioId, motivo: leyenda })`. Los `NINGUNO` y los legados no tocan stock |
| 4 | L4 | Componentes **ordenados por id**: `componente.retirar({ destino, motivo: leyenda, usuarioId, bajaMovimientoId })` y `componenteRepo.retirar()` (CAS). 0 filas → excepción |
| 5 | (LE ya tomado) | `equipo.darDeBaja(...)` y `equipoRepo.registrarBaja()`. `false` → excepción |

**`registrarDevolucionesDeEquipo`** (insumos, dentro de la transacción del llamador):

1. **L1** `leerSeguimientoParaMovimiento` de **todos** los insumos distintos, ordenados por id.
2. `clasificarPiezaDevuelta` de cada pieza bajo L1. Aplica `validarInsumoElegible` sin
   `exigirHabilitado` y `validarCondicionAdmitida(USADO, { admitirFamiliaNoVigente: true })`, y
   detecta el legado `SERIE` sin serial, con serial inválido o repetido en el lote.
   - Junta **todas** las causas como `causasPrevias`, sin cortar.
   - Si no hay piezas `SERIE` sin causa y `causasPrevias` no está vacía, devuelve `Result.fail`.
3. `operaciones.devolverDesdeEquipo(conUnidad, legados, o, causasPrevias)`: un **método nuevo del
   servicio**. Recibe solo las piezas `SERIE` sin causa previa. `devolverAlDeposito` pasa a delegar
   en él con `legados = []` y sin causas previas. Hace:
   - Fotos sin lock de las unidades.
   - `bloquearInsumos` de la unión de insumos con unidad e insumos legados, ordenados: L1 se repite
     sin esperar (`FOR SHARE` ya tomado por la misma transacción) y después L2 de todos.
   - Bajo L2, `unidadRepo.serialesExistentes(insumoId, normalizados)`, un puerto nuevo. Bajo L2 la
     consulta es autoritativa, porque otra alta del mismo insumo necesita ese L2. Un serial que ya
     existe es la causa `SERIAL_DUPLICADO` con su `componenteId`, no un P2002.
   - **Une** esas causas con `causasPrevias`. Si la unión no está vacía, devuelve
     `DevolucionConPiezasProblematicasError` con todas, antes de L3 y sin escribir. Así R6 lista
     juntas, por ejemplo, `INSUMO_BORRADO` y `SERIAL_DUPLICADO`.
   - L3 de las unidades por id. Valida las transiciones y arma las escrituras.
   - Escribe: `RETIRO_A_DEPOSITO` para las unidades e `INGRESO` con `equipoId` para los legados.
4. ENTRADA `USADO` de cantidad 1 por cada pieza `NINGUNO` (`asentar`). **No toma L2**, como dice
   `:89`, y **no toma ningún lock nuevo**: su L1 ya está tomado desde el paso 1. Los INSERT solo
   agregan `FOR KEY SHARE` sobre `insumos` y `equipos_informaticos`, que no chocan con ningún lock
   del orden. No hay ciclo.

**Atomicidad.** Toda la orquestación pasa por una clase interna `FalloBajaDeEquipo extends Error {
errorDeDominio }`, con el mismo patrón que `FalloRetiroDeComponente`. Cualquier `Result.fail` dentro
de `run()` se **lanza** como esa excepción y se desenvuelve afuera como `Result.fail`. Lo mismo vale
para `FalloOperacionDeUnidad` (el P2002 residual, que se traduce a la causa `SERIAL_DUPLICADO`
cuando el serial identifica la pieza). Ninguna rama devuelve `Result.fail` dentro de `run()` después
de una escritura.

**Cero piezas activas**: los pasos 3 y 4 no hacen nada; el equipo se marca igual (R9).

**Insumo `SERIE` → `NINGUNO` con unidad instalada**: es imposible por el guard vigente de
`CambiarSeguimiento` (R16). Si apareciera por SQL, `bloquearInsumos` rechaza con
`UnidadNoAdmitidaError` y la baja falla entera sin escribir nada.

| Alternativa | Por qué no |
|---|---|
| Bucle sobre `RetirarComponenteUseCase` | L1–L3 en el orden de los componentes, no por id: deadlock con instalaciones (exploración 2.4) |
| `devolverAlDeposito` y después `ingresar` de los legados | L2 del legado después de L3; además, un `Result.fail` del segundo llegaría después de escribir el primero |
| Tomar L2 desde `RegistrarEntrada` (sumar `bloquearStock` a su `Pick`) | Rompe la garantía de tipo que documenta la clase (`:109-111`); el L2 es del servicio |
| Validar solo dentro de la transacción | Correcto, pero toma locks para fallar. Se valida afuera (rápido) y adentro (autoritativo) con la misma función |

### ADR-4: leyenda compuesta y regla de los 500 caracteres

Formato (R4), en `componerLeyendaBaja(nombre, categoria, texto)`:

- `Baja del equipo «<nombre>» — <Etiqueta>`, más `: <texto>` si hay texto.
- Etiquetas de `ETIQUETAS_CATEGORIA_BAJA`: `Vejez`, `Donación`, `Rotura`, `Otra`.
- El texto se recorta antes; vacío equivale a ausente.

`largoMaximoTextoBaja(nombre, categoria) = 500 − (nombre.length + 23 + etiqueta.length)`, medido en
`.length` como el resto del sistema. Con el nombre en su tope de 255 y la etiqueta más larga
(`Donación`), el espacio para el texto es de 214 caracteres. Siempre es positivo, así que la
leyenda sin texto nunca excede el tope.

**Se valida, no se trunca.** Si el texto excede el espacio disponible,
`MotivoBajaEquipoInvalidoError` (422) con `largoMaximo`, y no cambia nada. Truncar escondería
parte del motivo sin aviso.

El resumen devuelve `largoMaximoTexto` por categoría, así que el contador del formulario usa el
mismo número que el backend. El DTO aplica además `@MaxLength(500)` al texto crudo y responde 400.

**La misma cadena va a los tres lugares**: `componentes_equipo.baja_motivo`,
`movimientos_insumo.motivo` y `eventos_unidad_insumo.motivo`. `normalizarMotivoMovimiento` solo
recorta (`movimiento-insumo.entity.ts:126-130`), y la leyenda ya llega recortada, así que no
diverge. El equipo guarda la categoría y el texto estructurados, no la leyenda.

### ADR-5: guards de equipo no vigente y corrección del borrado

| Camino | Guard nuevo | Error |
|---|---|---|
| `EditarEquipo` | Bajo LE: `!activo` | `EquipoDadoDeBajaError` (422) |
| `AgregarComponente.preparar()` (instalar y alta sin descuento) | Bajo LE `FOR SHARE`: `!activo` | `EquipoDadoDeBajaError` |
| `ReactivarComponente` | Bajo LE `FOR SHARE`: `!activo` (delta de `componentes-catalogo-unico`) | `EquipoDadoDeBajaError` |
| `EditarComponente` | `save()` (upsert) se reemplaza por `componenteRepo.editar(componente)`: un CAS `updateMany WHERE id = ? AND deleted_at IS NULL` que escribe **solo** `descripcion`, `numero_serie`, `capacidad` y `updated_at`. 0 filas → `ComponenteDadoDeBajaError` | `ComponenteDadoDeBajaError` (422) |
| Doble baja | Afuera y bajo LE; el CAS de `registrarBaja` es el backstop | `EquipoDadoDeBajaError` |
| `CrearTicketSoporte` | Ya vigente (`crear-ticket-soporte.use-case.ts:115`); se cubre con un test | — |
| `EliminarEquipo` (**corrección de defecto**) | Bajo LE `FOR NO KEY UPDATE`: si `!activo`, `EquipoDadoDeBajaError`; si `findActiveByEquipoId(id).length > 0`, `EquipoConComponentesActivosError(cantidad)` (422) | |

**`EditarComponente`: CAS y no LE.**

- LE `FOR SHARE` no la protege contra el retiro individual: el retiro también toma `FOR SHARE`, y
  dos `FOR SHARE` no se excluyen.
- Hacerla correcta con locks exigiría además un lock de fila del componente.
- El CAS cubre la baja y el retiro con una sola sentencia, no toma ningún lock del orden y no
  escribe columnas de estado.
- No hace falta mirar el equipo: un equipo dado de baja no tiene componentes activos, así que el
  CAS falla igual.
- Rechazado: LE `FOR SHARE` con relectura, que deja abierta la carrera contra el retiro.

**Strict TDD en el borrado.** Primero se escriben los tests de regresión y se corren en RED contra
el código actual, que hoy borra:

- Unit: el `EliminarEquipoUseCase` con un componente activo devuelve `fail`.
- Integración: el equipo con la unidad `INSTALADA` sigue sin borrado lógico y la unidad sigue
  `INSTALADA`.
- Integración: borrar un equipo dado de baja se rechaza.

Después viene el fix (GREEN). La tabla RED → GREEN → REFACTOR va en `apply-progress.md`.

### ADR-6: conteo de tickets abiertos — puerto de solo lectura, fuera de la transacción

- `ITicketSoporteRepository.contarAbiertosPorEquipo(equipoId, estadosTerminales: readonly string[])`.
- Prisma: `ticketSoporte.count({ where: { equipoId, deletedAt: null, ticket: { deletedAt: null,
  estado: { codigo: { notIn: [...] } } } } })`.
- El caso de uso le pasa `[...ESTADOS_TERMINALES]`, la fuente única del módulo tickets. Equipos ya
  importa de tickets (`crear-ticket-soporte.use-case.ts:8`).
- Lo usa solo el resumen. Es informativo y no bloquea: R10 permite la baja, y una carrera con un
  ticket nuevo no cambia la decisión.

### ADR-7: contratos HTTP y mapeo de errores

| Ruta | Contrato |
|---|---|
| `GET /equipos/:id/baja/resumen` | `{ equipoId, nombre, ticketsAbiertos, largoMaximoTexto: Record<Categoria, number>, piezas: [{ componenteId, descripcion, insumoId, insumoNombre, unidadId, numeroSerie, seguimiento, requiereSerial, serialSugerido, causaQueImpideDevolver }] }`. `serialSugerido` = el `numeroSerie` de texto del componente si es válido (recortado, 1–255); si no, `null`. Fuera de la transacción, sin locks |
| `POST /equipos/:id/baja` | Body `DarDeBajaEquipoHttpDto { destino, categoria, motivo?, seriales?: { componenteId: uuid, numeroSerie: string }[] }` (`@IsIn` sobre las constantes del dominio, `@ArrayMaxSize(200)`, `@MaxLength(500)`). Un `componenteId` repetido en `seriales` da 400. Un serial para una pieza que no es legado se ignora, igual que en el retiro individual. Responde `200` con `EquipoDetalleResponseDto` |
| `GET /equipos?incluirBajas=true` | Por defecto, `false`: los selectores de otras pantallas (tickets, preventivo, movimientos) siguen recibiendo solo equipos vigentes |
| `GET /equipos/export?incluirBajas=true` | Sigue al filtro de la lista (R11) |
| `EquipoResponseDto` / detalle | Se suma `baja: { destino, categoria, motivo, fecha, usuarioId } \| null` |

Errores (equipos):

| Error | Código HTTP | Detalle |
|---|---|---|
| `EquipoDadoDeBajaError` | 422 | |
| `EquipoConComponentesActivosError` | 422 | Lleva `cantidad` |
| `MotivoBajaEquipoInvalidoError` | 422 | Lleva `largoMaximo` si aplica |
| `BajaEquipoConPiezasProblematicasError` | 422 | Cuerpo `{ statusCode, message, code: 'BAJA_EQUIPO_PIEZAS_PROBLEMATICAS', piezas: [{ componenteId, insumoId, causa }] }` |
| `EquipoModificadoDuranteLaBajaError` | 409 | Reintentable, como `UnidadMedidaCambiadaError` |

Las causas (`INSUMO_BORRADO`, `FAMILIA_NO_REPUESTO`, `SERIAL_REQUERIDO`, `SERIAL_INVALIDO`,
`SERIAL_REPETIDO`, `SERIAL_DUPLICADO`) salen de `CAUSAS_PIEZA_NO_DEVOLVIBLE`. Todos los errores
tienen mapeo explícito en `toHttpException`, y el de piezas pasa un objeto a
`UnprocessableEntityException`.

**Destino por pieza (R17).** El DTO no declara un destino por pieza, y el `ValidationPipe` global
(`whitelist: true`, sin `forbidNonWhitelisted`, `app.module.ts:71`) descarta sin error cualquier
clave no declarada, también dentro de los elementos de `seriales`.

- **Decisión: se ignora.** El único `destino` de primer nivel se aplica a todas las piezas, y una
  clave `destino` por pieza no tiene efecto.
- Un pedido sin `destino` de primer nivel da 400.
- Rechazado: `forbidNonWhitelisted` solo en esta ruta. El pipe global corre primero y ya habría
  descartado la clave, y cambiarlo a nivel global queda fuera de alcance.
- Se ajustó el escenario de R17 en la spec.

**La exportación cambia de contrato.** El ciclo de 2026-08 (`exportar-listados-csv`, solo en
engram) declaraba "sin parámetros". R11 lo reemplaza; se actualizan el JSDoc de
`ExportarEquiposUseCase` y el comentario de `equipos-list-view.tsx:98-102`.

### ADR-8: frontend

| Pieza | Diseño |
|---|---|
| `equipo-baja-dialog.tsx` (container) + `equipo-baja-form.tsx` (presentational) | Radios de destino ("Devolver todas las piezas al stock (como usadas)" / "Descartar todas las piezas"); select de categoría; textarea con contador `largoMaximoTexto[categoria]`, obligatoria con "Otra"; inputs de serial solo para `requiereSerial` y destino `STOCK_USADO`, precargados con `serialSugerido` |
| Resumen en el diálogo | Cantidad de piezas y destino de cada una; aviso "El equipo tiene N tickets abiertos; van a seguir abiertos y apuntando a este equipo."; las piezas con `causaQueImpideDevolver` se muestran y deshabilitan el confirmar en `STOCK_USADO` |
| Confirmación por nombre | Con `DESCARTE`: "Escribí el nombre del equipo para confirmar". Habilita el botón cuando `valor.trim() === nombre` (R14). Solo en la interfaz |
| Errores | 422 de piezas: se parsea `ApiError.raw.piezas` con Zod y se listan. 409: aviso y refetch del resumen |
| `equipo-detail-view.tsx` | "Dar de baja" abre el diálogo nuevo. El borrado pasa a "Eliminar equipo (cargado por error)" (R13), con la descripción "Solo para equipos cargados por error. Si tiene piezas instaladas, dalo de baja." Con `activo = false`: un banner con fecha, categoría, motivo y destino, y se ocultan agregar, editar, dar de baja y eliminar |
| `equipo-componentes-section.tsx` | Prop `equipoActivo`; con `false` se ocultan retirar y reactivar |
| `equipos-list-view.tsx` + `use-equipos.ts` | Casilla "Mostrar equipos dados de baja", apagada por defecto. `useEquipos(enabled, { incluirBajas })` con clave `["equipos", { incluirBajas }]`; la invalidación por `["equipos"]` sigue cubriéndola. `ExportarCsvButton` recibe el mismo parámetro |
| `schemas.ts` / `types.ts` | `CATEGORIAS_BAJA_EQUIPO` como espejo; schemas del body, del resumen y del error de piezas |

### ADR-9: Ayuda (escritura suspendida; se corrige lo que queda falso)

| Archivo | Por qué queda falso | Work unit |
|---|---|---|
| `backend/ayuda/equipos-listado.md` | La sección "Sin filtros" afirma que el listado "no tiene filtros" y que muestra "activos y dados de baja por igual"; la exportación dice "Como el listado no tiene filtros…". Se reescriben las dos secciones: filtro "Mostrar equipos dados de baja" y exportación que sigue el filtro | La del filtro de la lista |
| `backend/ayuda/permisos-y-roles.md:156-168` | Dice "Hay tres trabajos que mueven el stock" y "Fuera de esos tres casos". Pasan a cuatro: la baja completa con `BORRADO` de **Equipos** devuelve o descarta todas las piezas | La del diálogo de baja |
| `mantenimiento-preventivo.md:50,165-169` | Revisado: sigue siendo verdadero (el selector usa la lista por defecto) | — |

Deuda anotada en commit y PR: un artículo nuevo sobre el flujo de baja, el botón renombrado y la
ficha de un equipo dado de baja.

### ADR-10: estrategia de pruebas

| Área | Capa | Qué |
|---|---|---|
| Validación del request | Unit (`equipos/interface/dtos/equipos.dto.spec.ts`) + e2e | 400 si `destino` falta o es inválido, si `categoria` falta o es inválida, si `motivo` tiene más de 500 caracteres crudos o si `seriales` repite un `componenteId`. `OTRA` sin texto o con solo espacios da 422 (dominio). Un `destino` por pieza se ignora y se aplica el de primer nivel (R17) |
| Ediciones viejas | Integración | (a) `EditarEquipo` con una entidad leída antes de la baja no reactiva el equipo, y `save()` de una entidad vieja deja `activo` y `baja_*` intactos (ADR-1). (b) `EditarComponente` con una entidad leída antes de una baja o de un retiro devuelve `ComponenteDadoDeBajaError` y el componente sigue retirado con sus `baja_*` (ADR-5) |
| Entidad, leyenda, categorías | Unit | `componerLeyendaBaja` (con y sin texto); borde de 500 exactos y 501; `darDeBaja` sobre un equipo no vigente lanza |
| `clasificarPiezaDevuelta` | Unit | Cada causa; legado con serial; el insumo deshabilitado y la familia no vigente se admiten |
| `DarDeBajaEquipoUseCase` | Unit (fakes) | Orden de llamadas (LE → stock → L4 por id → equipo); `Result.fail` interno → excepción → `fail` afuera; conjunto cambiado → 409; cero piezas |
| Borrado (TDD estricto) | Unit + integración + e2e | Primero RED (ADR-5) |
| Baja A/B, atomicidad | Integración (Postgres real, `usarLockMasterTest()` si trunca master) | Una pieza con insumo borrado → nada cambia (conteos de movimientos y eventos, unidad `INSTALADA`, componentes y equipo intactos). Fallo **después** de escribir: un serial legado que ya existe y saltea el diagnóstico (repo espía) → revierte la devolución de unidades. `registrarBaja` devuelve `false` (repo envuelto) → revierte todo (R6, "Falla al marcar el equipo") |
| Leyenda en tres lugares | Integración | `baja_motivo` = `movimientos.motivo` = `eventos.motivo` = la cadena esperada |
| Invariante `SERIE` | Integración | El helper `insumos/testing/invariante-serie.ts` después de cada baja |
| Testigos de orden de locks | Integración, `baja-equipo.orden-de-locks.integration.spec.ts` | Ver abajo |
| Causas juntas (R6) | Integración | Un componente con insumo borrado y un legado con serial ya existente en el insumo: el 422 lista los dos (`INSUMO_BORRADO` y `SERIAL_DUPLICADO`), tanto por el diagnóstico de afuera como por el camino transaccional (diagnóstico salteado con un repo espía) |
| Resultado concurrente | Integración `*.concurrencia` | Cada caso con 10 iteraciones, sin `40P01` y con el invariante `SERIE` en verde. (a) Baja `STOCK_USADO` de E1 contra `InstalarComponenteDesdeDeposito` en E2 de unidades de los mismos insumos en orden inverso (R15). (b) Baja de E1 contra `InstalarComponenteDesdeDeposito` **en E1**, una vez con unidad y otra con insumo `NINGUNO`: o la instalación comitea antes y la baja da 409 o retira la pieza, o la instalación da `EquipoDadoDeBajaError`. Nunca queda un componente activo ni una unidad `INSTALADA` en el equipo dado de baja. (c) Baja contra alta sin descuento sobre el mismo equipo. (d) Dos bajas del mismo equipo: una sola completa. (e) Baja contra `CrearTicketSoporte` del mismo equipo: o el ticket existe y la baja lo cuenta como abierto, o el ticket se rechaza (R10) |
| HTTP | e2e | 403 sin `BORRADO`; `BORRADO` sin ningún permiso de INSUMOS completa `STOCK_USADO` y registra las ENTRADAs (R12, segundo escenario); 422 con `piezas`; resumen; `incluirBajas` en la lista y la exportación; `PATCH` y `POST …/componentes` sobre un equipo dado de baja |
| Frontend | Vitest + Testing Library + MSW | Habilitación del botón por nombre; serial precargado; piezas del 422 listadas; filtro y etiqueta en la lista; botón renombrado; ficha de solo lectura |

**Testigos deterministas** (patrón de `retirar-reactivar-unidad.concurrencia.integration.spec.ts:200-245`):

- Un cliente externo retiene un lock de nivel menor.
- `pg_blocking_pids` se consulta con espera acotada hasta ver la baja bloqueada.
- Se sondea lo que la baja **ya tiene** en `pg_locks` (por `relation` y `locktype = 'advisory'`).
- Se suma una sonda `SELECT … FROM componentes_equipo WHERE id = ANY($1) FOR UPDATE NOWAIT` desde un
  testigo en su propia transacción, revertida enseguida.
- No se usan `transactionid` ni carreras de dos clientes.

| # | Retiene el externo | La baja ya tiene | La baja todavía no tiene |
|---|---|---|---|
| T1 | LE `FOR SHARE` (alta en vuelo) | — | `RowShareLock` en `insumos`; ningún advisory |
| T2 | Advisory `insumo-stock:<X>` | `RowShareLock` en `equipos_informaticos` (LE) y en `insumos` (L1) | `RowExclusiveLock` en `componentes_equipo`, `movimientos_insumo` y `unidades_insumo`; NOWAIT sobre los componentes tiene éxito |
| T3 | `FOR NO KEY UPDATE` de una unidad | Advisory de sus insumos | `RowExclusiveLock` en `movimientos_insumo` (ninguna ENTRADA `NINGUNO` antes de L3) y en `componentes_equipo` |
| T4 | LE `FOR NO KEY UPDATE` | — (la instalación con unidad y la reactivación esperan) | `RowShareLock` en `insumos`; ningún advisory |
| T5 | LE `FOR SHARE` + INSERT de un componente, sin commit | — | El `DELETE` espera; tras el COMMIT del externo responde `EquipoConComponentesActivosError` |
| T6 | (inverso) La baja queda retenida en L2 con LE tomado (externo con el advisory de un insumo) | — | Un segundo cliente hace `INSERT INTO movimientos_insumo (… equipo_id …)` del mismo equipo con `lock_timeout` corto y **no** se bloquea. Fija `FOR NO KEY UPDATE` frente a `FOR UPDATE` |
| T7 | LE `FOR NO KEY UPDATE` | — (`RetirarComponente` espera) | `RowShareLock` en `insumos`; ningún advisory. Igual que T4, pero para el retiro |
| T8 | LE `FOR NO KEY UPDATE` | — (`CrearTicketSoporte` espera) | Advisory de numeración de tickets; ningún `RowExclusiveLock` en `tickets` |

T4 cubre la instalación con unidad y la reactivación. T7 y T8 agregan el retiro y el ticket, que
ahora también toman LE.

**Home de los tests del delta `unidades-insumo-serie`**:
`insumos/application/services/operaciones-unidad-insumo.service.spec.ts`. Los bloques de
`devolverAlDeposito` y `descartarInstaladas` (`:786-855`) suman `devolverDesdeEquipo`: lote mixto,
unidad instalada en otro equipo, unidad ya no instalada y causas unidas sin escribir. `:893` es el
caso de unidad que ya no está en el estado esperado.

**`stock-insumo-condicion` no necesita delta.** La devolución en lote asienta ENTRADAs `USADO` por
el mismo camino (`asentar` y las escrituras del servicio) y con los mismos guards de condición que
el retiro individual. No cambia ninguna regla de condición ni de saldo.

### ADR-11: rollback y partición

**Rollback.** Revertir la cadena en orden inverso.

- La migración es aditiva y puede quedar aplicada (ADR-1).
- Con bajas ya hechas, el binario viejo oculta esos equipos (`findAllActive`) con su historial
  intacto; sus piezas quedaron en stock o descartadas de forma coherente.
- El binario viejo vuelve a dejar borrar un equipo con piezas: el defecto reaparece.
- Una migración fallida se resuelve restaurando el dump de `predeploy-dump.ps1`.

**Partición sugerida** (feature-branch-chain sobre `feat/baja-equipo-completo`, 400 líneas por PR;
el tracker se integra a `main` una sola vez; la partición final la cierra `sdd-tasks`):

| PR | Contenido |
|---|---|
| 1 | Borrado: tests RED, fix con LE `FOR NO KEY UPDATE`, `EquipoConComponentesActivosError`, botón renombrado, T5 |
| 2 | Migración, entidad, mapper, `save()` sin `activo`, `registrarBaja`, `bloquearPara*` |
| 3 | Guards con LE en editar, `preparar`, reactivar, retirar y ticket; CAS de `EditarComponente`; tests de ediciones viejas; T4, T7, T8 |
| 4 | Insumos: `clasificarPiezaDevuelta`, `serialesExistentes`, `devolverDesdeEquipo`, `registrarDevolucionesDeEquipo` y `diagnosticar…` |
| 5 | `DarDeBajaEquipoUseCase` con atomicidad, leyenda, causas juntas y T1–T3, T6 |
| 6 | HTTP: baja, resumen, tickets abiertos, errores, `equipos.dto.spec.ts`, e2e (incluidos R12 y R17) y pruebas de concurrencia de resultado (a)–(e) |
| 7 | Lista: `incluirBajas` en la lista y la exportación, filtro y `equipos-listado.md` |
| 8 | Diálogo, ficha de solo lectura, `permisos-y-roles.md` y Cumplida/Desviación en el roadmap |

---

## Data Flow

```
POST /equipos/:id/baja ─→ DarDeBajaEquipoUseCase
  afuera: equipo vigente · motivo/leyenda · diagnosticar (sin locks) ──→ 422 piezas
  run():
    LE  equipos FOR NO KEY UPDATE ── recheck · piezas iguales? ──→ 409
    A:  RegistrarEntrada.registrarDevolucionesDeEquipo
          L1 todos los insumos (ordenados) → causas de insumo/familia/serial
          └→ Operaciones.devolverDesdeEquipo: L2 SERIE → seriales existentes
             → unir causas (fail si hay) → L3 unidades → escribir
          └→ ENTRADAs NINGUNO (sin lock nuevo)
    B:  Operaciones.descartarInstaladas: L1 → L2 → L3 → escribir
    L4  componentes por id (CAS) ── equipo registrarBaja (CAS)
  Fallo* ──throw──→ rollback ──→ Result.fail afuera
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/prisma_tenant/schema.prisma` | Modify | Columnas `baja_*` del equipo |
| `backend/prisma_tenant/migrations/20261001120000_equipos_informaticos_baja/migration.sql` | Create | Columnas y tres CHECK |
| `backend/src/equipos/domain/entities/equipo-informatico.entity.ts` | Modify | Constantes, leyenda, `darDeBaja`; se quitan `deactivate`/`activate` |
| `backend/src/equipos/domain/errors/equipos.errors.ts` | Modify | Cinco errores |
| `backend/src/equipos/domain/ports/i-equipo-informatico.repository.ts` | Modify | `bloquearParaModificar`, `bloquearParaOperarPiezas`, `registrarBaja`, `findAllIncluyendoDadosDeBaja` |
| `backend/src/equipos/domain/ports/i-ticket-soporte.repository.ts` | Modify | `contarAbiertosPorEquipo` |
| `backend/src/equipos/infrastructure/persistence/prisma/{prisma-equipo-informatico.repository,equipo-informatico.mapper,prisma-ticket-soporte.repository}.ts` | Modify | Implementaciones; `save()` sin `activo`/`baja_*` |
| `backend/src/equipos/application/use-cases/dar-de-baja-equipo.use-case.ts` | Create | ADR-3 |
| `backend/src/equipos/application/use-cases/resumen-baja-equipo.use-case.ts` | Create | ADR-7 |
| `backend/src/equipos/application/use-cases/{eliminar-equipo,editar-equipo,agregar-componente,reactivar-componente,retirar-componente,crear-ticket-soporte,listar-equipos,exportar-equipos}.use-case.ts` | Modify | LE, guards, `incluirDadosDeBaja` |
| `backend/src/equipos/application/use-cases/editar-componente.use-case.ts`, `domain/ports/i-componente-equipo.repository.ts`, `prisma-componente-equipo.repository.ts` | Modify | `editar()` con CAS en lugar de `save()` (ADR-5) |
| `backend/src/preventivo/application/use-cases/generar-preventivos.use-case.spec.ts:46`, `backend/src/equipos/application/use-cases/crear-ticket-soporte.use-case.spec.ts:169`, `backend/src/equipos/application/use-cases/exportar-equipos.use-case.spec.ts:58` | Modify | Usan `deactivate()`: pasan a `darDeBaja(...)` o a reconstituir el equipo con datos de baja. `crear-ticket-soporte` además falsea `bloquearParaOperarPiezas` |
| `backend/src/equipos/infrastructure/persistence/prisma/prisma-equipos.integration.spec.ts:271-273` | Modify | Se reescribe: `save()` deja `activo` y `baja_*` intactos y `registrarBaja` es el único escritor (CAS, segunda llamada → `false`) |
| `backend/src/equipos/application/use-cases/{agregar-componente,editar-componente,editar-equipo,eliminar-equipo,reactivar-componente,retirar-componente}.use-case.spec.ts` | Modify | Fakes: `findById` → `bloquearParaOperarPiezas` / `bloquearParaModificar`; `save` → `editar`; `txRunner` donde antes no había |
| `backend/src/equipos/interface/dtos/equipos.dto.spec.ts` | Modify | Validación de `DarDeBajaEquipoHttpDto` (ADR-10) |
| `backend/src/insumos/application/services/clasificar-pieza-devuelta.ts` | Create | Clasificador puro y causas |
| `backend/src/insumos/application/services/operaciones-unidad-insumo.service.ts` | Modify | `devolverDesdeEquipo`; `devolverAlDeposito` delega |
| `backend/src/insumos/domain/ports/i-unidad-insumo.repository.ts` + Prisma | Modify | `serialesExistentes` |
| `backend/src/insumos/application/use-cases/registrar-entrada-insumo.use-case.ts` | Modify | `registrarDevolucionesDeEquipo`, `diagnosticarDevolucionesDeEquipo` |
| `backend/src/equipos/interface/{controllers/equipos.controller.ts,dtos/equipos.dto.ts}`, `equipos.module.ts` | Modify | Rutas, DTOs, mapeo, wiring |
| `frontend/src/features/equipos/components/{equipo-baja-dialog,equipo-baja-form}.tsx` | Create | ADR-8 |
| `frontend/src/features/equipos/{components/equipo-detail-view,components/equipo-componentes-section,components/equipos-list-view,hooks/use-equipos,hooks/use-equipo-mutations,schemas,types}.ts(x)` | Modify | ADR-8 |
| `backend/ayuda/equipos-listado.md`, `backend/ayuda/permisos-y-roles.md` | Modify | ADR-9 |
| `docs/roadmap-comercial.md` | Modify | Cumplida o Desviación al cerrar |

## Interfaces / Contracts

```ts
// insumos
export interface LegadoEnEquipo { componenteId: string; insumoId: string; equipoId: string; numeroSerie: string }
devolverDesdeEquipo(conUnidad: readonly ItemEnEquipo[], legados: readonly LegadoEnEquipo[], o: ContextoUnidad, causasPrevias?: readonly CausaPieza[])
  : Promise<Result<Map<string /*componenteId*/, UnidadConMovimiento>, DomainError>>;
export interface PiezaADevolver { componenteId: string; insumoId: string; unidadId: string | null; numeroSerie: string | null }
registrarDevolucionesDeEquipo(dto: { equipoId: string; usuarioId: string; motivo: string; piezas: readonly PiezaADevolver[] })
  : Promise<Result<Map<string, string /*movimientoId*/>, DomainError>>; // fail: DevolucionConPiezasProblematicasError { piezas: { componenteId; insumoId; causa }[] }
// equipos
bloquearParaModificar(id: string): Promise<EquipoInformaticoEntity | null>;     // raw SELECT id … FOR NO KEY UPDATE + findUnique vía mapper
bloquearParaOperarPiezas(id: string): Promise<EquipoInformaticoEntity | null>;  // raw SELECT id … FOR SHARE + findUnique vía mapper; caller: null o deletedAt → no encontrado
// equipos, componentes
editar(componente: ComponenteEquipoEntity): Promise<boolean>; // CAS WHERE deleted_at IS NULL; solo descripcion, numero_serie, capacidad
// insumos
devolverDesdeEquipo(..., causasPrevias: readonly CausaPieza[]) // une causas antes de L3 y de escribir
serialesExistentes(insumoId: string, normalizados: readonly string[]): Promise<Set<string>>;
registrarBaja(equipo: EquipoInformaticoEntity): Promise<boolean>;               // CAS activo = true
```

## Threat Matrix

N/A: el cambio no toca enrutamiento, comandos de shell, subprocesos, automatización de VCS o PR,
clasificación de archivos ejecutables ni integración de procesos.

## Migration / Rollout

- Una migración tenant aditiva (ADR-1). Se despliega con `predeploy-dump.ps1` y `deploy.ps1` en los
  8 tenants.
- No requiere backfill: la medición del 2026-10-01 dio 0 equipos inactivos y 0 borrados.
- Las bases de test reciben la migración por el camino habitual.

## Open Questions

- [ ] Ninguna bloquea el diseño. A confirmar en la spec o con el dueño: el texto exacto del banner
  de la ficha y si el 409 `EquipoModificadoDuranteLaBajaError` debe reintentarse solo en el
  frontend (hoy: aviso y refetch).
