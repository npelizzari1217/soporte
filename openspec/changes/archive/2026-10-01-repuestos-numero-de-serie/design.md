# Design: seguimiento de repuestos por número de serie

## Technical Approach

Modelo A+B de la exploración: un **modo de seguimiento por insumo** (`NINGUNO` | `SERIE`) y una
tabla **`unidades_insumo`**, una fila por pieza física. Un insumo `NINGUNO` no cambia en nada: el
libro (`movimientos_insumo`), `calcularSaldos()` y el advisory lock por insumo siguen siendo lo que
son. Un insumo `SERIE` suma una capa de identidad encima del libro:

- Cada movimiento de un insumo `SERIE` referencia **una** unidad con cantidad 1; una operación sobre
  N piezas son N movimientos en una transacción.
- El **saldo `SERIE`** que se muestra es el conteo de unidades `EN_DEPOSITO` por condición; lo que
  autoriza una resta ya no es un saldo sino el **estado de la unidad elegida**, leído bajo lock.
- Toda mutación de unidad pasa por **un solo servicio de aplicación**
  (`OperacionesUnidadInsumo`), con forma de lote, que toma los locks en el **orden global** de
  ADR-12, valida todo antes de escribir y deja en la misma transacción el movimiento (si lo hay), el
  cambio de estado y el evento de historial.
- El historial por serial sale de una bitácora propia append-only (`eventos_unidad_insumo`), porque
  cuatro hechos de la vida de una unidad no tienen movimiento de stock (alta sin descuento, descarte
  desde un equipo, reactivación y corrección de serial).

Specs de referencia: `specs/unidades-insumo-serie/spec.md` y los deltas
`specs/stock-insumo-condicion/spec.md` y `specs/componentes-catalogo-unico/spec.md`. El cambio
**no** implementa un punto de `docs/roadmap-comercial.md`.

Respuesta a las preguntas abiertas de la propuesta: D1 → ADR-1 y ADR-5; D2 → ADR-6; D3 → ADR-7;
D4 → ADR-9; D5 → ADR-3; D6 → ADR-4.

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué ahí |
|---|---|---|
| `SEGUIMIENTOS_INSUMO`, `ESTADOS_UNIDAD_INSUMO`, `TIPOS_EVENTO_UNIDAD`, `normalizarSerial()`, `UNIDAD_SERIAL_MAX_LENGTH` | domain (`insumos/domain/entities/unidad-insumo.entity.ts`) | Fuente única que los CHECK, los DTO y el Zod espejan; el spec de constraints compara contra la base |
| Transiciones de estado válidas, "pendiente solo sale por ajuste negativo", `unidadId ⇒ cantidad = 1` | domain (`UnidadInsumoEntity`, `MovimientoInsumoEntity`) | Reglas de una sola fila, sin repositorios |
| Regla "no se desmarca `entera` si un insumo `SERIE` la usa" | application (`EditarUnidadMedidaUseCase`) | Necesita contar insumos |
| `InsumoEntity.seguimiento` y `puedeCambiarSeguimiento()` | domain | La regla recibe los conteos ya leídos; no consulta |
| `OperacionesUnidadInsumo` (lote, lock, validar-todo-antes-de-escribir) | application (`insumos/application/services/`) | Orquesta tres repositorios en la transacción del llamador |
| Elección de rama por seguimiento en entrada, salida, ajuste y consulta | application (casos de uso de insumos) | El seguimiento se lee dentro de la transacción (ADR-5) |
| `CambiarSeguimientoInsumoUseCase` | application | Necesita el orden de locks de ADR-12 y conteos |
| Lecturas con lock de fila (`FOR SHARE`, `FOR NO KEY UPDATE`), CAS de estado, traducción de P2002 a `SerialDuplicadoError`, `exigirTransaccionActiva()` | infrastructure (repos Prisma, `shared/infrastructure/persistence/`) | Mecanismos de Postgres y del `TenantContext` |
| CHECK, índices parciales y FKs | infrastructure (una migración tenant) | Backstop; las constantes del dominio se comparan contra la base |
| `seriales`, `unidadId`, `numeroSerie` en los bodies; endpoints de unidades | interface | Enrutamiento por campos del request |
| Zod de diálogos, selector de unidad | interface del frontend | Derivados: la autoridad es el DTO del backend |

**Autorización, sus dos lugares.** Borde: `PATCH /insumos/:id/seguimiento` lleva
`AdminClienteGuard` (mismo gate que el ABM del catálogo); `GET …/unidades` y `GET …/historial`,
`INSUMOS:LECTURA`; `POST …/unidades/:unidadId/serial` (cargar pendiente), `INSUMOS:ALTAS`;
`POST …/unidades/:unidadId/correccion-serial`, `INSUMOS:AJUSTAR` (es explicar una diferencia, igual
que el ajuste); `POST …/unidades/:unidadId/devolucion-entrega`, `INSUMOS:ALTAS` (ADR-13: es una
ENTRADA de algo que vuelve físicamente, no la corrección de un conteo, así que no pide `AJUSTAR`);
`POST …/unidades/:unidadId/recuperacion`, `INSUMOS:AJUSTAR` (ADR-14: revierte una baja);
`POST`/`PATCH /unidades-medida` con `entera` conservan el gate actual del ABM de catálogos. Los
endpoints de movimientos, recepción y componentes conservan sus decoradores. Se eligen rutas
separadas y no una con permiso según el estado de la unidad, porque `@RequiereAcciones` es metadata
estática por ruta (ver la cabecera de `movimientos-insumo.controller.ts`). Inline: ningún chequeo
nuevo dentro de los métodos. Consecuencia asumida y confirmada por el dueño (F4): `EQUIPOS:ALTAS`
instala unidades y crea unidades `INSTALADA` (alta sin descuento), `EQUIPOS:BORRADO` las devuelve al
depósito o las descarta y `EQUIPOS:MODIFICACION` las reinstala al reactivar, todo sin permisos de
INSUMOS, igual que hoy con las cantidades.

---

## Architecture Decisions

### ADR-1: esquema — una migración aditiva con cinco piezas

`<ts>_unidades_insumo_serie` (WU-1):

| Pieza | Definición |
|---|---|
| `unidades_medida.entera` | `BOOLEAN NOT NULL DEFAULT false`; la migración marca `true` en `codigo IN ('UNI','PAR')` y el seeder de tenants también; editable desde el ABM de unidades (ADR-3, F3) |
| `insumos.seguimiento` | `VARCHAR(10) NOT NULL DEFAULT 'NINGUNO'`, `CHECK IN ('NINGUNO','SERIE')` |
| `unidades_insumo` | `id`, `insumo_id` FK RESTRICT, `numero_serie VARCHAR(255) NULL` (forma cargada, recortada), `numero_serie_normalizado VARCHAR(255) NULL`, `condicion`, `estado`, `equipo_id` FK RESTRICT NULL, `created_at clock_timestamp()`, `updated_at` |
| `movimientos_insumo.unidad_id` | `UUID NULL` FK RESTRICT; `CHECK (unidad_id IS NULL OR cantidad = 1)`; índice parcial `WHERE unidad_id IS NOT NULL` |
| `componentes_equipo.unidad_id` | `UUID NULL` FK RESTRICT; `CHECK (unidad_id IS NULL OR numero_serie IS NULL)`; `UNIQUE (unidad_id) WHERE unidad_id IS NOT NULL AND deleted_at IS NULL` |
| `eventos_unidad_insumo` | ver ADR-9 |

CHECK con nombre en `unidades_insumo`: condición contra `CONDICIONES_STOCK` y estado contra
`ESTADOS_UNIDAD_INSUMO` = `EN_DEPOSITO`, `INSTALADA`, `ENTREGADA`, `DESCARTADA`;
`(estado = 'INSTALADA') = (equipo_id IS NOT NULL)` (una `ENTREGADA` no refiere equipo: su destino
vive en el movimiento de la SALIDA, ADR-9); `numero_serie IS NOT NULL OR estado IN ('EN_DEPOSITO',
'DESCARTADA')` (una pendiente nunca está instalada ni entregada; F1 le permite terminar
descartada); `(numero_serie IS NULL) = (numero_serie_normalizado IS NULL)`. Unicidad: `UNIQUE
(insumo_id, numero_serie_normalizado) WHERE numero_serie_normalizado IS NOT NULL`, que abarca todos
los estados, incluido `DESCARTADA`.

**Serie pendiente = `numero_serie` NULL**, no un flag. Un solo hecho. El CHECK impide por
construcción instalar o entregar una pendiente; que una pendiente llegue a `DESCARTADA` solo por
ajuste negativo no lo expresa el CHECK sino la máquina de estados: la única transición
`EN_DEPOSITO → DESCARTADA` es el ajuste negativo, y una `INSTALADA` siempre tiene serial. Una
pendiente descartada queda sin serial para siempre: `cargarSerial` solo acepta `EN_DEPOSITO`.

**Máquina de estados** (fuente única: `UnidadInsumoEntity`):

| Desde | Hacia | Operación | Movimiento |
|---|---|---|---|
| (nueva) | `EN_DEPOSITO` | entrada, ajuste positivo, recepción, retiro legado | ENTRADA / AJUSTE_POSITIVO |
| (nueva) | `INSTALADA` | alta sin descuento (D3) | — |
| `EN_DEPOSITO` (con serial) | `INSTALADA` | instalar | SALIDA |
| `EN_DEPOSITO` (con serial) | `ENTREGADA` | SALIDA manual | SALIDA |
| `EN_DEPOSITO` (con serial o pendiente, F1) | `DESCARTADA` | ajuste negativo con motivo | AJUSTE_NEGATIVO |
| `ENTREGADA` | `EN_DEPOSITO` NUEVO o USADO (elegida) | devolución de entrega (F2, ADR-13) | ENTRADA |
| `INSTALADA` | `EN_DEPOSITO` USADO | retiro `STOCK_USADO` | ENTRADA |
| `INSTALADA` | `DESCARTADA` | retiro `DESCARTE` | — |
| `DESCARTADA` (por retiro) | `INSTALADA` | reactivar el componente que la descartó (último evento `DESCARTE` de ese componente) | — |
| `DESCARTADA` (cualquier origen) | `EN_DEPOSITO` NUEVO o USADO (elegida), con serial o pendiente | recuperar pieza descartada (G1, ADR-14) | ENTRADA |

Ningún estado es terminal: `ENTREGADA` vuelve por devolución de entrega (F2) y `DESCARTADA` por
recuperación (G1) o, si la descartó un componente, por la reactivación de ese componente.

| Alternativa | Por qué no |
|---|---|
| Flag `serie_pendiente` + serial placeholder | Dos columnas para un hecho; el placeholder ocupa la unicidad |
| Índice único funcional `upper(regexp_replace(numero_serie,'\s','','g'))` | `toUpperCase()` de JS y `upper()` de Postgres difieren fuera de ASCII (`ß`); dos normalizaciones derivan. Con la columna normalizada, la única fuente es `normalizarSerial()` y la base solo compara |
| `componentes_equipo.unidad_id` único sin parcial | Una unidad instalada en E1, devuelta y reinstalada en E2 tendría dos filas de componente; el parcial sobre activos lo admite y conserva el historial del retirado |
| FK compuesta `(unidad_id, insumo_id)` para impedir unidad de otro insumo | Prisma no modela con seguridad una relación que comparte `insumo_id` con otra; una FK solo en SQL sería eliminada por el próximo `migrate dev`. Lo garantiza `OperacionesUnidadInsumo` y lo verifica el spec del invariante |
| Una migración por work unit | Las piezas son inertes con sus defaults y el tracker se integra una sola vez; una migración es una sola migración manual de las bases de test |

### ADR-2: saldo `SERIE` — conteo de unidades para mostrar, estado de la unidad para decidir

**Choice**: `calcularStock()` y `calcularSaldos()` no cambian. Se agrega en el mismo archivo:

```ts
export type ConteoPorCondicion = Readonly<Record<CondicionStock, number>>;
export function saldosDesdeUnidades(conteo: ConteoPorCondicion): SaldosInsumo; // total = suma
```

`ConsultarStockInsumoUseCase` es el **único lector** que ramifica:
`SERIE ? saldosDesdeUnidades(unidadRepo.contarEnDepositoPorCondicion(id)) :
calcularSaldos(movimientoRepo.sumByTipo(id))`. La respuesta suma `seguimiento` y
`pendientesDeSerie`. `estadoReposicion` sigue sobre NUEVO. `INSTALADA`, `ENTREGADA` y `DESCARTADA`
no cuentan.

Salida y ajuste negativo `SERIE` no comparan saldos: autorizan si la unidad elegida está
`EN_DEPOSITO` en ese insumo, con serial (la salida) o con serial o pendiente (el ajuste negativo,
F1), y (si viene) en la condición pedida, leída con lock de fila en el orden de ADR-12. Rechazan
con `UnidadNoDisponibleError` (422), no con `StockInsuficienteError`.

**Invariante**: para todo insumo `SERIE` y condición, `conteo EN_DEPOSITO == calcularSaldos(libro)`.
Se sostiene porque cada transición que cambia `EN_DEPOSITO` escribe su movimiento en la misma
transacción, y las que no lo cambian (alta instalada, descarte desde equipo, reactivar, serial) no
escriben movimiento. Lo verifica `invariante-serie.integration.spec.ts` con el helper
`insumos/testing/invariante-serie.ts`, que compara las dos fuentes y además que el último evento de
cada unidad coincide con su estado.

| Opción | Decisión |
|---|---|
| Saldo `SERIE` desde el libro y unidades solo como identidad | Rechazada: contradice P9 (el dueño eligió "el saldo cuenta unidades") |
| Una columna de saldo materializada | Rechazada: tercera fuente |
| Conteo para mostrar, estado para decidir, libro como verificación | **Elegida**: no hay segunda fórmula por tipo; un rollback al binario viejo ve el mismo número mientras el invariante valga |

### ADR-3: activación de `SERIE` — endpoint propio, lock, unidad de medida entera

**Choice**: `CambiarSeguimientoInsumoUseCase` (`PATCH /insumos/:id/seguimiento`, body
`{ seguimiento }`). Las dos direcciones siguen el orden global de ADR-12, en `txRunner.run()`:

1. Lectura **sin lock** del `unidad_medida_id` actual del insumo (solo `NINGUNO → SERIE`).
2. **L0**: `unidadMedidaRepo.leerParaUso(unidadMedidaId)` con `FOR SHARE` sobre esa unidad, que lee
   `entera`.
3. **L1**: `insumoRepo.bloquearParaCambioDeSeguimiento(id)` con `SELECT … FOR NO KEY UPDATE`: espera
   a toda transacción de stock en vuelo, que tiene la fila `FOR SHARE`. Esa lectura devuelve el
   `seguimiento` y el `unidad_medida_id` vigentes.
4. **Re-lectura (W1)**: si el `unidad_medida_id` de la lectura con L1 difiere del del paso 1 (un
   `EditarInsumo` comiteó en el medio), se aborta con `UnidadMedidaCambiadaError` (409,
   reintentable: el cliente vuelve a pedir el cambio) y se revierte. **No** se toma L0 sobre la
   unidad nueva, porque eso sería un L0 después de L1.
5. **L2**: `movimientoRepo.bloquearStock(id)` (advisory lock; `lockAndSumByTipo` pasa a llamarlo).
6. Recién entonces lee (nueva instantánea de `READ COMMITTED`) el saldo del libro y el conteo de
   unidades `EN_DEPOSITO` o `INSTALADA`.
7. `NINGUNO → SERIE`: exige `calcularSaldos(...).total === 0` y unidad de medida `entera`.
   `SERIE → NINGUNO` (decisión del dueño): exige cero unidades `EN_DEPOSITO` y cero `INSTALADA`. Las
   `ENTREGADA` y `DESCARTADA` no lo impiden, no se tocan y conservan su historial; mientras el
   insumo sea `NINGUNO`, una `ENTREGADA` no puede volver (ADR-13) ni una `DESCARTADA` recuperarse
   (ADR-14).
   Error: `SeguimientoNoModificableError` (422) con el motivo.

El alta (`POST /insumos`) acepta `seguimiento` con la regla de la unidad entera. `CrearInsumoUseCase`
toma siempre, en este orden, L0 (`FOR SHARE` sobre la unidad de medida elegida), el advisory
`insumo-codigo:<prefijo>` que ya toma `PrismaInsumoRepository.findLastSecuenciaCodigo` (nivel LC de
ADR-12) y recién después hace el `INSERT` (saldo 0 por construcción). `EditarInsumoUseCase`, cuando
cambia `unidadMedidaId`, corre en transacción con L0 sobre la unidad destino y L1 `FOR NO KEY
UPDATE` sobre el insumo; el `seguimiento` y la unidad actual que decide son los que devuelve esa
lectura con L1, no los de la entidad leída antes. Rechaza la unidad no entera en un insumo `SERIE`
(`UnidadMedidaNoEnteraError`, 422).

**Solo este caso de uso cambia `seguimiento` (W3).** `PrismaInsumoRepository.save()` es un
`upsert` con update anidado: un `EditarInsumo` o un `CambiarEstadoActivoInsumo` que leyó la entidad
antes de una activación la reescribiría con el valor viejo. Por eso `InsumoMapper.toPersistence()`
sigue devolviendo `seguimiento` para la rama `create`, y `save()` lo **quita** de la rama `update`.
El escritor único es `IInsumoRepository.cambiarSeguimiento(id, valor)`, llamado solo desde este
caso de uso. Test de integración: se carga la entidad, se activa `SERIE` por el caso de uso, se
guarda la entidad vieja con `save()` y `seguimiento` sigue en `SERIE`.

**Endpoint propio y no un campo del `PATCH` general**: el cambio necesita el orden de locks y los
conteos, y el `PATCH` general no los toma ni debe esperar a las transacciones de stock para editar un
nombre.

**Dos llamadas desde el diálogo de edición.** Si el usuario cambia `seguimiento` junto con otros
campos, el frontend ordena las llamadas según la dirección: hacia `SERIE`, primero `PATCH
/insumos/:id` (puede traer la unidad de medida entera que la activación exige) y después `PATCH
…/seguimiento`; hacia `NINGUNO`, al revés (liberar el seguimiento antes de pasar a una unidad no
entera). No es atómico: si la segunda falla, el diálogo queda abierto con el error, informa que los
demás cambios ya se guardaron y deja reintentar solo el seguimiento.

**Unidad entera (D5, F3)**: atributo `entera` en `unidades_medida`, sembrado en `UNI` y `PAR` y
**editable** desde el ABM de unidades (casilla nueva). `CrearUnidadMedidaUseCase` y
`EditarUnidadMedidaUseCase` lo aceptan. Desmarcarlo se rechaza mientras algún insumo `SERIE` use la
unidad (`UnidadMedidaEnUsoPorSerieError`, 422): la edición toma el lock de escritura de la fila de
la unidad (L0) —`SELECT … FOR UPDATE` siempre que el DTO traiga `codigo`, porque cambiar una
columna única es un cambio de clave; `FOR NO KEY UPDATE` si no— y luego cuenta los insumos
`SERIE`; una activación en vuelo tiene la fila `FOR SHARE`, así que la edición espera y la ve. Una lista cerrada por código se rechaza porque `codigo` es
editable: renombrar `UNI` rompería un insumo `SERIE` vigente. La validación de cantidad entera en
cada operación `SERIE` no depende de la unidad de medida: la exige `OperacionesUnidadInsumo`
(`CantidadNoEnteraError`, 422).

### ADR-4: `OperacionesUnidadInsumo` — la única puerta de las unidades, con forma de lote

```ts
export interface ContextoUnidad { usuarioId: string; motivo?: string | null }
export interface ItemEnEquipo { unidadId: string; equipoId: string; componenteId: string } // componenteId: id ya generado por la entidad, aunque la fila se inserte después (ADR-9)

export class OperacionesUnidadInsumo {
  ingresar(insumoId: string, piezas: { numeroSerie: string | null }[],
    o: ContextoUnidad & { condicion: CondicionStock; tipo: 'ENTRADA' | 'AJUSTE_POSITIVO';
      itemCompraId?: string | null; equipoId?: string | null }): Promise<Result<UnidadConMovimiento[], DomainError>>;
  sacarDelDeposito(insumoId: string, unidadIds: string[],
    o: ContextoUnidad & { tipo: 'SALIDA' | 'AJUSTE_NEGATIVO'; condicion?: CondicionStock;
      equipoId?: string | null; sectorId?: string | null }): Promise<Result<UnidadConMovimiento[], DomainError>>; // SALIDA → ENTREGADA (con serial); AJUSTE_NEGATIVO → DESCARTADA (con serial o pendiente, F1)
  devolverEntregas(insumoId: string, unidadIds: string[],
    o: ContextoUnidad & { condicion: CondicionStock }): Promise<Result<UnidadConMovimiento[], DomainError>>; // ENTREGADA → EN_DEPOSITO en la condición elegida + ENTRADA (F2)
  recuperarDescartadas(insumoId: string, unidadIds: string[],
    o: ContextoUnidad & { condicion: CondicionStock }): Promise<Result<UnidadConMovimiento[], DomainError>>; // DESCARTADA → EN_DEPOSITO en la condición elegida + ENTRADA; motivo obligatorio (G1)
  instalar(items: ItemEnEquipo[], o: ContextoUnidad): Promise<Result<UnidadConMovimiento[], DomainError>>;          // EN_DEPOSITO → INSTALADA + SALIDA
  devolverAlDeposito(items: ItemEnEquipo[], o: ContextoUnidad): Promise<Result<UnidadConMovimiento[], DomainError>>; // INSTALADA → EN_DEPOSITO USADO + ENTRADA USADO
  descartarInstaladas(items: ItemEnEquipo[], o: ContextoUnidad): Promise<Result<UnidadInsumoEntity[], DomainError>>; // INSTALADA → DESCARTADA, sin movimiento
  reinstalar(items: ItemEnEquipo[], o: ContextoUnidad): Promise<Result<UnidadInsumoEntity[], DomainError>>;          // DESCARTADA → INSTALADA, sin movimiento
  altaInstalada(insumoId: string, numeroSerie: string, equipoId: string, o: ContextoUnidad & { condicion: CondicionStock; componenteId: string }): Promise<Result<UnidadInsumoEntity, DomainError>>;
  cargarSerial(unidadId: string, numeroSerie: string, o: ContextoUnidad): Promise<Result<UnidadInsumoEntity, DomainError>>;
  corregirSerial(unidadId: string, numeroSerie: string, o: ContextoUnidad): Promise<Result<UnidadInsumoEntity, DomainError>>; // motivo obligatorio
}
```

Contrato común:

- **Exige transacción activa.** El chequeo que hoy vive inline en
  `PrismaMovimientoInsumoRepository.lockAndSumByTipo` (`tenantContext.get()?.enTransaccion !== true`)
  se extrae a `exigirTransaccionActiva(tenantContext, operacion)` en
  `shared/infrastructure/persistence/exigir-transaccion-activa.ts`, y lo llaman `bloquearStock`,
  `lockAndSumByTipo` y todas las lecturas con lock de fila nuevas (insumo, unidad de medida,
  unidades). Como la primera llamada del servicio es siempre una de ellas, el servicio lanza fuera de
  una transacción sin conocer el `TenantContext`. No abre la suya: `run()` es re-entrante sin
  savepoint, y un `Result.fail` devuelto tras una escritura dejaría la mitad del lote en la
  transacción del llamador.
- **Validar todo, después escribir.** Toma los locks en el orden de ADR-12 (L1 de todos los insumos
  del lote, L2 de todos, L3 de todas las unidades, cada nivel en orden de id), valida cada unidad y
  solo entonces escribe. Un `Result.fail` nunca sigue a una escritura; el llamador lo convierte
  en excepción dentro de su `run()` (patrón `FalloSalidaDeStock`). Una violación de unicidad (P2002)
  es la única falla posterior a escribir: el repo la traduce a `SerialDuplicadoError` **lanzado**
  como `FalloOperacionDeUnidad` (exportada), y el caso de uso la desenvuelve afuera.
- La transición es un CAS (`UPDATE … WHERE id = ? AND estado = ?`); 0 filas bajo el lock de fila es
  un bug y lanza.
- `insumoId` de cada unidad debe coincidir con el del movimiento (sustituye a la FK compuesta de
  ADR-1). El insumo debe ser `SERIE`.

Esto cubre D6: la baja de equipo completo llamará `devolverAlDeposito` o `descartarInstaladas` con
todas las unidades `INSTALADA` del equipo y un `motivo` compartido; el catálogo cerrado de motivos
queda para ese ciclo. Ese ciclo no produce `ENTREGADA`: la entrega es propia de la SALIDA manual
desde el depósito (`sacarDelDeposito`). Rechazado: una operación por unidad con transacción propia (el lote no sería atómico) y
métodos en la entidad `InsumoEntity` (necesitan repositorios).

### ADR-5: movimientos `SERIE` — el seguimiento se lee dentro de la transacción

| Caso de uso | `NINGUNO` | `SERIE` |
|---|---|---|
| Entrada manual | Como hoy; rechaza `seriales` (`UnidadNoAdmitidaError`) | `seriales` obligatorio, `length === cantidad`, sin pendientes (`SerialesNoCoincidenError`) → `ingresar` |
| Ajuste positivo | Como hoy | Igual que la entrada, `tipo: 'AJUSTE_POSITIVO'`; el motivo ya lo exige la entidad |
| Salida | Como hoy; un `unidadId` se rechaza con `UnidadNoAdmitidaError` (422, S2) | `unidadId` obligatorio (`UnidadRequeridaError`), `cantidad` 1, unidad con serial → `sacarDelDeposito`; la unidad queda `ENTREGADA` (decisión del dueño) |
| Ajuste negativo | Como hoy; `unidadId` → `UnidadNoAdmitidaError` | Igual que la salida, con motivo; admite una pendiente (F1); la unidad queda `DESCARTADA` |
| Consulta de stock | `calcularSaldos` | `saldosDesdeUnidades` (ADR-2) |

**Destino de la entrega.** El DTO de la salida ya trae `sectorId`, `equipoId` (trazabilidad) y
`motivo`; no hay campo de destinatario y este ciclo no lo agrega. El destino queda en el movimiento
SALIDA y el evento `ENTREGA` lo referencia por `movimiento_id` (ADR-9); quien quiera nombrar a una
persona lo escribe en el motivo. Un `equipoId` en la salida no instala la unidad: para eso está el
alta de componente.

`condicion` en salida y ajuste negativo `SERIE`: opcional; si viene y no coincide con la unidad,
`UnidadNoDisponibleError`. El frontend no la envía.

**La carrera con el cambio de seguimiento.** Todo caso de uso que escribe stock o unidades —entrada,
recepción, devolución de componente, devolución de entrega, recuperación de pieza descartada,
salida, ajuste, instalar, retiro, reactivar, `cargarSerial`, `corregirSerial`— abre transacción y
su **primer lock** es L1: `insumoRepo.leerSeguimientoParaMovimiento(id)`
(`SELECT seguimiento … FOR SHARE`). El seguimiento que decide la rama es el de esa lectura. Recién
después toma L2 (si su operación lo pide) y L3. Los `FOR SHARE` no se bloquean entre sí, así que las
entradas `NINGUNO` siguen sin serializarse entre ellas y sin tomar el advisory lock (la decisión
vigente de no serializar recepciones se conserva); el cambio de seguimiento (L1 `FOR NO KEY UPDATE`)
espera a todas. Costo: una ida y vuelta más por movimiento. Rechazado: un trigger de Postgres
(regla de negocio fuera del dominio) y tomar el advisory lock en toda entrada.

### ADR-6: recepción de compra `SERIE` (D1, D2)

`RegistrarRecepcionDeItemDto` suma `seriales?: string[]`. Con insumo `SERIE`, dentro de la misma
transacción de hoy: el delta debe ser entero (`CantidadNoEnteraError`, 422, rechaza toda la
recepción); `seriales.length ≤ delta` (si no, `SerialesNoCoincidenError`); se llama
`registrarEntradaInsumo.execute({ …, seriales, completarConPendientes: true })`, que rellena con
unidades pendientes hasta el delta. `completarConPendientes` no es un campo del DTO HTTP de la
entrada manual: lo pasa solo la recepción, junto a `itemCompraId`, por el mismo criterio de origen
que ya documenta el caso de uso. Delta cero: no crea nada (idempotencia intacta). Una recepción
parcial crea solo las unidades de su delta. La recepción queda completa aunque haya pendientes;
los seriales se completan después desde la ficha (`cargarSerial`, evento `SERIAL_CARGADO`, sin
movimiento ni motivo).

Rechazado: recepción "abierta" que no crea unidades hasta tener seriales (el saldo no subiría con
mercadería físicamente en depósito, y el delta acumulado no sabría qué falta crear).

### ADR-7: equipos — instalar, alta sin descuento, retiro y reactivar

- **Instalar con descuento** (`InstalarComponenteDesdeDepositoUseCase`): con `unidadId`, dentro de
  la transacción y **en este orden** (ADR-12: locks antes de la primera escritura),
  `agregarComponente.preparar()` (valida y construye la entidad con `unidadId` y `numeroSerie`
  NULL, sin escribir; `AgregarComponenteUseCase` se parte en `preparar` + `execute` = preparar y
  guardar) → `operaciones.instalar([{ unidadId, equipoId, componenteId: componente.id }])` →
  `vincularInstalacion(salida.id)` → un único `save()` (L4). Sin
  `unidadId`, el camino de hoy; si el insumo es `SERIE`, la salida lo rechaza con
  `UnidadRequeridaError`. `numeroSerie` y `condicion` del body se ignoran con `unidadId`.
- **Alta sin descuento (D3)**: con insumo `SERIE`, `numeroSerie` es obligatorio;
  `operaciones.altaInstalada()` crea la unidad `INSTALADA` con la condición indicada (NUEVO por
  defecto; con `descontarStock: false` la condición no se ignora cuando el insumo es `SERIE`,
  porque es un dato de la unidad), sin movimiento, con evento
  `ALTA_INSTALADA`, y después (L4) el componente nace con `unidadId`; mismo patrón `preparar()` →
  operación de unidad con `componenteId` → `save()`. Con `NINGUNO`, como hoy.
- **Retiro `STOCK_USADO`**: `registrarDevolucionDeComponente` suma `unidadId?` y `numeroSerie?`
  y ramifica: componente con unidad → `devolverAlDeposito` (la unidad vuelve USADO con su serial);
  componente **legado** de un insumo hoy `SERIE` → `numeroSerie` obligatorio en el body del retiro
  e `ingresar` USADO con `equipoId`; **no** admite serie pendiente: sin serial,
  `SerialRequeridoError` (422) y no cambia nada (decisión del dueño). El diálogo precarga el serial
  con el `numeroSerie` de texto del componente cuando no está vacío y es válido (recortado, 1–255;
  la unicidad la decide el backend); si no, el campo queda vacío y obligatorio. Insumo `NINGUNO`,
  como hoy. Sus guards de insumo y familia (ADR-4 del ciclo anterior) no cambian.
- **Retiro `DESCARTE`**: con unidad, `descartarInstaladas` (sin movimiento).
- **Reactivar**: pasa a correr en transacción; con unidad, primero `reinstalar` (toma L1, L2 y L3,
  como toda operación de ADR-4) y después el `save()` del componente (L4). `reinstalar` exige que la
  unidad esté `DESCARTADA` **y** que su último evento sea el `DESCARTE` de este mismo componente
  (`eventos_unidad_insumo.componente_id`, ADR-9); si no —porque la pieza se recuperó (ADR-14), se
  reinstaló en otro equipo o se volvió a dar de baja por otra vía—, `UnidadDelComponenteNoDisponibleError`
  (422) y no cambia nada. Si el insumo ya no es
  `SERIE`, `SeguimientoNoModificableError`: reinstalar crearía una unidad viva en un insumo
  `NINGUNO`. Se conserva la asimetría vigente: tras `STOCK_USADO` sigue rechazado.
- **Editar componente**: con unidad, `numeroSerie` en el PATCH se rechaza con
  `SerialDeUnidadNoEditableError` (422): se corrige desde la unidad (ADR-9). Legado, como hoy.
- **Lectura**: `PrismaComponenteEquipoRepository` incluye `unidad.numeroSerie` y el mapper lo expone
  como `numeroSerie` del componente; `save()` escribe NULL en `numero_serie` cuando hay unidad. Una
  sola fuente del serial, sin tocar los lectores del frontend.

### ADR-8: contratos del borde

| Contrato | Cambio |
|---|---|
| `CreateInsumoHttpDto` / respuesta | `seguimiento?` (`@IsIn(SEGUIMIENTOS_INSUMO)`) / `seguimiento` |
| `CrearUnidadMedidaHttpDto` / `EditarUnidadMedidaHttpDto` / respuesta | `entera?: boolean` (default `false` en el alta) / `entera` (F3) |
| `RegistrarMovimientoInsumoHttpDto` (lo hereda el ajuste) | `seriales?: string[]` (`@ArrayMaxSize(100)`, cada uno recortado, 1–255), `unidadId?: uuid` |
| Recepción de compra | `seriales?: string[]` |
| `StockInsumoResponseDto` | `seguimiento`, `pendientesDeSerie` |
| `MovimientoInsumoResponseDto` | `unidadId`, `numeroSerie` (include) |
| `GET /insumos/:id/unidades?estado=&disponibles=` | `UnidadInsumoResponseDto[]` (`id`, `numeroSerie`, `condicion`, `estado`, `equipoId`, `equipoNombre`); `disponibles=true` = `EN_DEPOSITO` con serial (salida, instalar); el selector del ajuste negativo pide `estado=EN_DEPOSITO` e incluye las pendientes (F1) |
| `POST …/unidades/:unidadId/devolucion-entrega` | `{ condicion, motivo? }` → `MovimientoInsumoResponseDto` (ADR-13) |
| `POST …/unidades/:unidadId/recuperacion` | `{ condicion, motivo }` (`transformarMotivo`, 500) → `MovimientoInsumoResponseDto` (ADR-14) |
| `GET /insumos/:id/unidades/:unidadId/historial` | `EventoUnidadResponseDto[]` cronológico |
| `POST …/unidades/:unidadId/serial` | `{ numeroSerie }` |
| `POST …/unidades/:unidadId/correccion-serial` | `{ numeroSerie, motivo }` (`transformarMotivo`, 500) |
| `CreateComponenteHttpDto` | `unidadId?`; con `descontarStock=false` el controller pasa `condicion` solo para que el caso de uso la aplique a la unidad de un insumo `SERIE` (D3); con `NINGUNO` se sigue ignorando |
| `RetirarComponenteHttpDto` | `numeroSerie?` (solo retiro legado de insumo `SERIE`) |
| `ComponenteResponseDto` | `unidadId`; `numeroSerie` resuelto (ADR-7) |

Errores nuevos (insumos): `SerialDuplicadoError` (409), `UnidadNoDisponibleError`,
`UnidadRequeridaError`, `UnidadNoAdmitidaError`, `SerialesNoCoincidenError`, `SerialRequeridoError`,
`CantidadNoEnteraError`, `SeguimientoNoModificableError`, `UnidadMedidaNoEnteraError`,
`UnidadMedidaEnUsoPorSerieError`, `UnidadMedidaCambiadaError` (409, reintentable),
`MotivoRecuperacionRequeridoError`, `UnidadNoEncontradaError` (404) — 422 salvo indicación.
Equipos: `SerialDeUnidadNoEditableError`, `UnidadDelComponenteNoDisponibleError`.
Todos con mapeo explícito en su controller.

### ADR-9: historial y corrección — bitácora propia `eventos_unidad_insumo` (D4)

Tabla append-only: `id`, `unidad_id` FK, `tipo` (`CHECK` contra `TIPOS_EVENTO_UNIDAD`: `INGRESO`,
`ALTA_INSTALADA`, `SERIAL_CARGADO`, `CORRECCION_SERIAL`, `INSTALACION`, `RETIRO_A_DEPOSITO`,
`DESCARTE`, `ENTREGA`, `DEVOLUCION_DE_ENTREGA`, `BAJA_DE_DEPOSITO`, `RECUPERACION`, `REACTIVACION`),
`movimiento_id` FK `UNIQUE` NULL, `equipo_id` FK NULL, `componente_id UUID NULL` (lo llevan
`INSTALACION`, `ALTA_INSTALADA`, `RETIRO_A_DEPOSITO`, `DESCARTE` y `REACTIVACION`: es lo que permite
a reactivar saber si el último `DESCARTE` fue de ese componente, ADR-7). Va **sin FK**, como
`usuario_id`: por el orden de ADR-12 la instalación escribe el evento antes que el componente, con
el id que `BaseEntity` ya generó en memoria, y una FK fallaría; la coherencia la garantiza
`OperacionesUnidadInsumo` y la verifica el spec del invariante. `serial_anterior`, `serial_nuevo`, `motivo`, `usuario_id` (soft ref), `created_at
clock_timestamp()`; índice `(unidad_id, created_at)`. El puerto solo tiene `insert` y
`listarPorUnidad`. La corrección de serial es un evento `CORRECCION_SERIAL` con los dos seriales,
motivo y usuario: el registro auditado **es** el historial.

| Alternativa | Por qué no |
|---|---|
| Historial derivado del libro | El libro no ve alta sin descuento, descarte desde equipo, reactivar ni correcciones |
| Derivado de libro + componentes + tabla de correcciones | Tres fuentes unidas por fecha; el orden entre ellas no es confiable |
| Tabla solo de correcciones | Resuelve P8 pero no P7 |

El evento referencia el movimiento por id; no copia cantidad ni condición. `ENTREGA` (SALIDA manual,
la unidad queda `ENTREGADA`), `DEVOLUCION_DE_ENTREGA` (ENTRADA en la condición elegida, vuelve a
`EN_DEPOSITO`), `RECUPERACION` (ENTRADA en la condición elegida, con motivo, vuelve a
`EN_DEPOSITO`) y `BAJA_DE_DEPOSITO` (AJUSTE_NEGATIVO, queda `DESCARTADA`, también desde pendiente)
llevan siempre `movimiento_id`; el historial muestra el destino de la entrega leyendo `sector_id`,
`equipo_id` y `motivo` de ese movimiento, sin copiarlos al evento.

### ADR-10: una entrega, rollback por estado

El tracker se integra a `main` y se despliega una vez (los estados intermedios no son desplegables:
el backend exige `seriales` antes de que el frontend los envíe). Runbook, sección "Rollback del
tracker `repuestos-numero-de-serie`", con detector de solo lectura por tenant:

```sql
SELECT (SELECT count(*) FROM insumos WHERE seguimiento = 'SERIE') AS insumos_serie,
       (SELECT count(*) FROM unidades_insumo)                   AS unidades;
```

- **Ambos en 0**: revertir el código es gratis; la migración queda (defaults inertes).
- **> 0**: preferir corregir hacia adelante. El binario viejo suma el libro (coincide mientras valga
  el invariante) pero asienta salidas sin unidad en insumos `SERIE`, rompiendo el invariante, y su
  edición del serial de un componente con unidad choca con el CHECK (500 acotado a esas filas). La
  vía fiel es restaurar el dump de `predeploy-dump.ps1`; revertir sin restaurar exige, antes de
  volver a desplegar el ciclo, conciliar con
  `SELECT … FROM movimientos_insumo m JOIN insumos i ON i.id = m.insumo_id WHERE i.seguimiento =
  'SERIE' AND m.unidad_id IS NULL`.

### ADR-11: Ayuda

Escritura suspendida. Revisado: `equipos-listado.md:11` (serial del equipo), `compras-insumos-stock.md`
(la recepción sigue subiendo el stock por delta) y `permisos-y-roles.md:145-184` (los ajustes siguen
pidiendo `AJUSTAR` y motivo) siguen siendo verdaderos. `sdd-apply` repite la búsqueda en la WU de
cada superficie; si algo queda falso, se corrige en esa WU. Deuda anotada en commit y PR de las WU
de frontend (13 a 19).

### ADR-12: orden global de locks (invariante L)

**Invariante L.** Toda transacción que toca stock, unidades, el seguimiento de un insumo o el
atributo `entera` toma sus locks en este orden, y dentro de cada nivel en orden de id; nunca toma un
lock de un nivel menor después de uno mayor:

| Nivel | Lock | Quién lo toma |
|---|---|---|
| L0 | Fila de `unidades_medida`: `FOR SHARE` para leer `entera`; `FOR UPDATE` para editarla si el DTO trae `codigo`, `FOR NO KEY UPDATE` si no | `CrearInsumo` (siempre), activación `NINGUNO → SERIE`, `EditarInsumo` con cambio de unidad; `EditarUnidadMedida` |
| LC | Advisory `insumo-codigo:<prefijo>` (ya existe: `PrismaInsumoRepository.findLastSecuenciaCodigo`) | Solo `CrearInsumo`, entre L0 y su `INSERT` |
| L1 | Fila de `insumos`: `FOR SHARE` (`leerSeguimientoParaMovimiento`); `FOR NO KEY UPDATE` para cambiarla | Todo caso de uso de stock o unidades (lista de ADR-5); cambio de seguimiento en las dos direcciones; `EditarInsumo` con cambio de unidad |
| L2 | Advisory lock `insumo-stock:<id>` (`bloquearStock`) | Salida, ajuste, cambio de seguimiento y toda operación de `OperacionesUnidadInsumo`; la entrada `NINGUNO` no lo toma |
| L3 | Filas de `unidades_insumo`: `FOR NO KEY UPDATE` | `OperacionesUnidadInsumo` |
| L4 | Filas propias del caso de uso (`componentes_equipo`) | Instalar, retiro, reactivar, siempre después de la operación de unidad |

**Por qué no hay ciclo.** Un ciclo exige que alguien espere un nivel menor mientras tiene uno mayor, y
el orden lo prohíbe. El caso que señaló la validación —la entrada `SERIE` con L1 `FOR SHARE`
esperando L2 mientras el cambio de seguimiento tenía L2 y esperaba la fila— desaparece porque el
cambio de seguimiento toma L1 **antes** que L2: con una entrada en vuelo espera en L1 sin tener L2.
La activación lee el `unidad_medida_id` sin lock para saber qué fila de L0 tomar; si al obtener L1
la unidad cambió, aborta con `UnidadMedidaCambiadaError` en vez de tomar L0 sobre la nueva, que
sería un L0 después de L1 (ADR-3, paso 4).

**LC no crea inversión.** Solo `CrearInsumo` toma `insumo-codigo:<prefijo>`, siempre después de L0
`FOR SHARE` y antes de un `INSERT` en `insumos` cuya fila nueva nadie más ve, y no toma ningún lock
del orden después. Dos altas comparten L0 (`FOR SHARE` es compatible consigo mismo) y se ordenan en
LC. `EditarUnidadMedida` tiene L0 exclusivo pero no toma LC ni ningún otro nivel, así que a lo sumo
espera o hace esperar, sin ciclo.

**Los `FOR KEY SHARE` implícitos de las FK.** Todo `INSERT` en `movimientos_insumo`,
`unidades_insumo`, `componentes_equipo` y `eventos_unidad_insumo` toma `FOR KEY SHARE` sobre las filas
referenciadas (`insumos`, `unidades_insumo`, `equipos_informaticos`), a veces antes de L1 (la
instalación `NINGUNO` de hoy inserta el componente antes de la salida). No crea otra
inversión porque `FOR KEY SHARE` **solo** choca con `FOR UPDATE` y con cambios de columnas clave, y
ningún camino usa ninguno de los dos sobre esas tablas: el cambio de seguimiento y el CAS de unidades
usan `FOR NO KEY UPDATE` (elegido por eso, no `FOR UPDATE`), los ids no se actualizan, `insumos.codigo`
es inmutable (issue #166) y el índice único de `numero_serie_normalizado` es parcial y no puede ser
referenciado por una FK. `unidades_medida.codigo` sí es editable y su `UPDATE` es un cambio de clave:
por eso `EditarUnidadMedida` toma `FOR UPDATE` de entrada (L0) cuando el DTO trae `codigo`, en vez de
escalar de un lock menor a uno mayor en medio de la transacción, y no toma ningún otro lock del
orden. Los locks de otros agregados tomados antes
de L1 (la fila del ítem de compra en la recepción; la fila nueva del componente en la instalación
`NINGUNO`, invisible para las demás transacciones) son válidos porque ningún camino los toma después
de L1–L3.

**Tests.** `orden-de-locks.concurrencia.integration.spec.ts`, con dos clientes y pausas controladas
(`pg_sleep` dentro de la transacción o una barrera entre promesas). Cada caso entra en la WU que
trae el camino que ejercita (W2):

| # | Caso | Resultado esperado | WU |
|---|---|---|---|
| 1 | `NINGUNO → SERIE` contra `EditarInsumo` que cambia la unidad de medida en vuelo | Sin `40P01`; la activación aborta con `UnidadMedidaCambiadaError` | 6 |
| 2 | Dos cambios de seguimiento concurrentes sobre el mismo insumo | Sin `40P01`; se serializan en L1 | 6 |
| 3 | `SERIE → NINGUNO` contra una entrada `SERIE` en vuelo | Sin `40P01`; la entrada comitea y el cambio se rechaza porque ve las unidades nuevas | 7a |
| 4 | `NINGUNO → SERIE` contra una entrada `NINGUNO` en vuelo | Sin `40P01`; el cambio ve saldo distinto de cero y se rechaza | 7a |
| 5 | Orden inverso de 3 y 4: el cambio comitea primero | La entrada, al obtener L1, sigue la rama nueva y da 422 (`SerialesNoCoincidenError` o `UnidadNoAdmitidaError`) | 7a |
| 6 | Salida `NINGUNO` contra `NINGUNO → SERIE` | Sin `40P01` | 7b |
| 7 | Desmarcar `entera` contra una activación en vuelo | Sin `40P01`; la edición espera en L0 y se rechaza | 12b |

Rechazado: reintentar ante `40P01` (esconde el defecto y deja un 500 posible bajo carga) y un único
advisory lock sin lock de fila (la entrada `NINGUNO` tendría que tomarlo y se serializarían las
recepciones).

### ADR-13: devolución de entrega (F2)

`DevolverEntregaUseCase` (`POST /insumos/:insumoId/unidades/:unidadId/devolucion-entrega`,
`INSUMOS:ALTAS`, body `{ condicion, motivo? }`). La unidad `ENTREGADA` vuelve a `EN_DEPOSITO` con la
**condición que elige el usuario** (NUEVO si se entregó por las dudas y no se usó, USADO si se usó),
conservando serial e historial. En la transacción: L1 → `operaciones.devolverEntregas()` (L2, L3) →
ENTRADA de cantidad 1 con `unidadId` y esa condición → evento `DEVOLUCION_DE_ENTREGA`.

Guards: el insumo debe estar en `SERIE` (con `NINGUNO` una unidad viva no tendría dueño;
`SeguimientoNoModificableError`); la unidad debe estar `ENTREGADA` (`UnidadNoDisponibleError`);
`USADO` sigue la regla de repuestos. **Insumo deshabilitado (G2, decisión del dueño): se admite**,
con la misma exención que el retiro de un componente, porque la pieza existe físicamente:
`validarInsumoElegible` sin `exigirHabilitado` (el insumo sigue debiendo existir y estar vigente) y
`validarCondicionAdmitida(..., { admitirFamiliaNoVigente: true })` (la familia dada de baja o
deshabilitada no rechaza; `esRepuesto = false` con USADO sí). La exención vive en este caso de uso
con nombre de origen, igual que `registrarDevolucionDeComponente`; la ENTRADA y el AJUSTE manuales
no la reciben.

**Permiso `INSUMOS:ALTAS`**: es una ENTRADA de una pieza que vuelve físicamente, el trabajo diario
del depósito; `AJUSTAR` es para explicar diferencias contra un conteo, y exigirlo haría que quien
entregó la pieza no pueda registrar que volvió. Rechazado: reusar la entrada manual con un serial
existente (chocaría con la unicidad y crearía otra unidad, perdiendo la historia).

### ADR-14: recuperar pieza descartada (G1)

`RecuperarUnidadDescartadaUseCase` (`POST /insumos/:insumoId/unidades/:unidadId/recuperacion`,
body `{ condicion, motivo }`). La unidad `DESCARTADA` vuelve a `EN_DEPOSITO` con la **misma
identidad**, serial e historial, en la condición que elige el usuario (como en F2). En la
transacción, con el orden de ADR-12: L1 → `operaciones.recuperarDescartadas()` (L2, L3) → ENTRADA
de cantidad 1 con `unidadId`, esa condición y el motivo → evento `RECUPERACION`. El invariante de
ADR-2 se mantiene: `EN_DEPOSITO` y el libro suben 1 en la misma condición.

**Permiso `INSUMOS:AJUSTAR`**: revierte una baja, que es explicar una diferencia contra lo
registrado, igual que el ajuste; por eso también exige motivo (`MotivoRecuperacionRequeridoError`,
misma normalización y tope de 500). Movimiento ENTRADA y no AJUSTE_POSITIVO, por indicación del
orquestador; el dueño puede preferir AJUSTE_POSITIVO para que el libro espeje la baja, y cambiarlo
es una línea del servicio.

**Pendiente descartada (F1) → se recupera como pendiente.** La unidad vuelve `EN_DEPOSITO` sin
serial, cuenta en el saldo y queda sujeta a las reglas de siempre de una pendiente: `cargarSerial`
la completa y solo el ajuste negativo la vuelve a sacar. Se elige porque es coherente con los CHECK
sin tocarlos (`numero_serie IS NOT NULL OR estado IN ('EN_DEPOSITO','DESCARTADA')`) y no abre un
segundo camino de carga de serial. Rechazado: exigir el serial antes de recuperar, que obligaría a
`cargarSerial` a aceptar unidades `DESCARTADA` (un estado más en su guard) o a recibir el serial en
el body de la recuperación (dos operaciones en una).

**Unidad descartada por el `DESCARTE` de un componente.** La recuperación deja la unidad en el
depósito y **no** toca el componente, que sigue retirado con `bajaDestino = DESCARTE`. Reactivar ese
componente después se rechaza con `UnidadDelComponenteNoDisponibleError` (ADR-7): el último evento
de la unidad ya no es el `DESCARTE` de ese componente. Para volver a instalar la pieza se usa el
alta con descuento eligiendo la unidad.

Guards: el insumo debe estar en `SERIE` (`SeguimientoNoModificableError`); la unidad debe estar
`DESCARTADA` (`UnidadNoDisponibleError`); insumo deshabilitado y familia no vigente **admitidos**,
con la misma exención que ADR-13 (G2). La unicidad no se reevalúa: la unidad conserva su serial,
que ya ocupaba el índice.

---

## Data Flow

```
Entrada / recepción SERIE
  Diálogo o recepción ── seriales[] ──▶ RegistrarEntrada.execute
     tx ─┬ L1 leerSeguimientoParaMovimiento (FOR SHARE) = SERIE
         └ Operaciones.ingresar ─ L2 advisory ─ valida ─┬ INSERT unidad (serial normalizado | NULL)
                                                        ├ INSERT movimiento (unidadId, cantidad 1)
                                                        └ INSERT evento INGRESO
Cambio de seguimiento (las dos direcciones)
  tx ─ leer unidad_medida_id ─ L0 unidad (FOR SHARE) ─ L1 insumo (FOR NO KEY UPDATE)
     ─ ¿unidad cambió? ⇒ 409 UnidadMedidaCambiadaError ─ L2 advisory ─ conteos ─ UPDATE
Instalar
  ComponenteCreateDialog ── unidadId ──▶ Instalar ─ tx ─┬ AgregarComponente.preparar (sin escribir)
                                                       ├ Operaciones.instalar ─ L1 ─ L2 ─ L3 unidad
                                                       │   EN_DEPOSITO→INSTALADA + SALIDA + evento(componenteId)
                                                       └ vincularInstalacion(salida.id) ─ L4 save
Ficha
  GET /stock ── SERIE ? conteo EN_DEPOSITO : calcularSaldos(libro)
  GET /unidades · GET /historial ◀── eventos_unidad_insumo
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/prisma_tenant/schema.prisma` + `migrations/<ts>_unidades_insumo_serie/` | Modify/Create | ADR-1 |
| `backend/src/clientes/infrastructure/tenant-seeder.adapter.ts` (+integración) | Modify | `entera` en el piso sembrado (`UNIDADES_MEDIDA`) |
| `backend/src/insumos/domain/entities/unidad-insumo.entity.ts`, `evento-unidad-insumo.entity.ts` (+specs) | Create | Catálogos, normalización, transiciones |
| `.../entities/insumo.entity.ts`, `unidad-medida.entity.ts`, `movimiento-insumo.entity.ts`, `tipo-movimiento-insumo.ts` (+specs) | Modify | `seguimiento`, `entera`, `unidadId`, `saldosDesdeUnidades` |
| `.../ports/i-unidad-insumo.repository.ts`, `i-evento-unidad-insumo.repository.ts` | Create | Puertos |
| `.../ports/i-insumo.repository.ts`, `i-movimiento-insumo.repository.ts`, `i-unidad-medida.repository.ts` | Modify | Lecturas con lock de fila (ADR-12), `cambiarSeguimiento`, `bloquearStock` |
| `.../prisma/prisma-insumo.repository.ts` (+integración) | Modify | `save()` sin `seguimiento` en la rama `update` (W3) |
| `backend/src/shared/infrastructure/persistence/exigir-transaccion-activa.ts` (+spec) | Create | Chequeo de `enTransaccion` extraído de `lockAndSumByTipo` |
| `.../prisma/orden-de-locks.concurrencia.integration.spec.ts` | Create | ADR-12 |
| `.../use-cases/{crear,editar}-unidad-medida.use-case.ts`, `unidades-medida.dto.ts` (+specs, e2e) | Modify | `entera` (F3) |
| `.../use-cases/devolver-entrega.use-case.ts`, `recuperar-unidad-descartada.use-case.ts` (+specs) | Create | ADR-13, ADR-14 |
| `.../prisma/prisma-unidad-insumo.repository.ts`, `prisma-evento-unidad-insumo.repository.ts`, mappers (+integración) | Create | ADR-1, ADR-4 |
| `.../prisma/*-constraints.integration.spec.ts` | Modify/Create | CHECK contra catálogos |
| `.../application/services/operaciones-unidad-insumo.service.ts` (+spec, +integración de lote) | Create | ADR-4 |
| `.../use-cases/registrar-{entrada,salida,ajuste}-insumo.use-case.ts`, `consultar-stock-insumo.use-case.ts` (+specs) | Modify | ADR-2, ADR-5 |
| `.../use-cases/cambiar-seguimiento-insumo.use-case.ts`, `listar-unidades-insumo`, `consultar-historial-unidad`, `cargar-serial-unidad`, `corregir-serial-unidad` (+specs) | Create | ADR-3, ADR-8, ADR-9 |
| `.../use-cases/crear-insumo.use-case.ts`, `editar-insumo.use-case.ts` (+specs) | Modify | ADR-3 |
| `.../application/services/invariante-serie.integration.spec.ts`, `insumos/testing/invariante-serie.ts` | Create | ADR-2 |
| `.../interface/dtos/*`, `controllers/insumos.controller.ts`, `movimientos-insumo.controller.ts`, `unidades-insumo.controller.ts` (+specs, e2e) | Modify/Create | ADR-8 |
| `backend/src/compras/.../registrar-recepcion-de-item.use-case.ts`, DTO, controller (+spec, e2e) | Modify | ADR-6 |
| `backend/src/equipos/domain/entities/componente-equipo.entity.ts`, mapper, repo, `equipos.errors.ts` | Modify | `unidadId`, serial resuelto |
| `.../use-cases/{instalar-componente-desde-deposito,agregar-componente,retirar-componente,reactivar-componente,editar-componente}.use-case.ts` (+specs, integración) | Modify | ADR-7 |
| `.../interface/dtos/equipos.dto.ts`, `equipos.controller.ts` (+e2e) | Modify | ADR-8 |
| `frontend/src/features/insumos/{types,schemas}.ts`, `insumo-form-dialog.tsx`, `insumo-detail-view.tsx` | Modify | Seguimiento, sección de unidades |
| `frontend/src/features/insumos/components/{unidades-insumo-section,unidad-historial-dialog,unidad-serial-dialog,unidad-reingreso-dialog,selector-unidad,seriales-input}.tsx`, `hooks/use-unidades-insumo.ts` (+tests) | Create | ADR-8, ADR-13, ADR-14 (`unidad-reingreso-dialog` sirve a la devolución de entrega y a la recuperación: condición NUEVO/USADO y motivo, obligatorio solo en la recuperación) |
| `frontend/src/features/insumos/components/unidad-medida-form-dialog.tsx`, `unidad-medida-list.tsx` (+tests) | Modify | Casilla `entera` (F3) |
| `frontend/src/features/insumos/components/movimiento-*-dialog.tsx` (+tests) | Modify | Seriales y selector de unidad |
| `frontend/src/features/compras/components/registrar-avance-dialog.tsx`, schemas (+tests) | Modify | Seriales en la recepción |
| `frontend/src/features/equipos/components/componente-create-dialog.tsx`, `componente-retiro-dialog.tsx`, `componente-edit-dialog.tsx`, types (+tests) | Modify | Unidad, serial D3, retiro legado |
| `DEPLOY-VPS-runbook.md` | Modify | ADR-10 |

---

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit (dominio) | `normalizarSerial` (mayúsculas, espacios internos, vacío); transiciones válidas e inválidas (pendiente: solo `DESCARTADA` por ajuste negativo; `ENTREGADA → EN_DEPOSITO` en las dos condiciones); `unidadId ⇒ cantidad 1`; `saldosDesdeUnidades`; `puedeCambiarSeguimiento` | Specs puros |
| Unit (aplicación) | Ramas `NINGUNO`/`SERIE` de cada caso de uso; `unidadId` en `NINGUNO` ⇒ `UnidadNoAdmitidaError`; validar-todo-antes-de-escribir (un fallo en la unidad 2 no escribe la 1); recepción fraccional, parcial y con pendientes; ajuste negativo de una pendiente; devolución de entrega NUEVO y USADO, con insumo `NINGUNO` rechazada y con insumo deshabilitado admitida (G2); recuperación NUEVO y USADO, sin motivo rechazada, de una pendiente descartada (vuelve pendiente), con insumo deshabilitado admitida; reactivar tras recuperar ⇒ `UnidadDelComponenteNoDisponibleError`; D3; retiro legado con serial; reactivar con insumo ya `NINGUNO`; desmarcar `entera` en uso rechazado; activación con unidad de medida cambiada ⇒ `UnidadMedidaCambiadaError` | Fakes; `sumas-movimiento.ts` |
| Integración | CHECK y catálogos con `pg_get_constraintdef` (incluida la rama de pendiente descartada); índice único con serial normalizado y en `DESCARTADA`; CAS; P2002 → `SerialDuplicadoError`; lote que revierte entero; `save()` con entidad vieja no revierte `seguimiento` (W3); **invariante** paso a paso (escenario de la spec) | Base tenant efímera; `soporte_tenant_test` migrada a mano en WU-1 |
| Concurrencia | Mismo serial en dos entradas ⇒ una; misma unidad en dos instalaciones o salidas ⇒ una; los siete casos de ADR-12 sin `40P01`, cada uno en su WU | Molde de `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts` |
| E2E | Endpoints nuevos con y sin permiso (403); 409 de serial; 422 de cada error; recepción con seriales; alta de componente con unidad y D3 | Todo spec que trunque `soporte_master_test` llama `usarLockMasterTest()` |
| Frontend | Selector de unidad solo con disponibles; cantidad fija en 1; N inputs de serial; recepción con blancos; alta con unidad o serial según seguimiento; retiro legado precargado; invalidación de `["insumo", id, "unidades"]` además de stock y movimientos | MSW + `renderWithProviders` |
| Adversarial (verify) | Quitar el lock de fila de las unidades ⇒ rojo en concurrencia; invertir L1 y L2 en el cambio de seguimiento ⇒ `40P01` en el spec de orden; contar `INSTALADA` o `ENTREGADA` en el saldo ⇒ rojo en el invariante; salida que deja `DESCARTADA` ⇒ rojo; escribir `seguimiento` en la rama `update` de `save()` ⇒ rojo | `rules.verify` |

TDD no se inyecta: es una feature.

---

## Threat Matrix

N/A: no hay enrutamiento, shell, subprocesos, automatización de VCS o PR, ni clasificación de
archivos ejecutables. `deploy.ps1` no cambia; el runbook suma texto y una consulta de solo lectura.

---

## Migration / Rollout

1. `predeploy-dump.ps1 -DryRun` y la corrida real.
2. `deploy.ps1`: pull → builds → `migrate:tenants` → arranque; backend y frontend en la misma
   corrida.
3. Verificación: `\d unidades_insumo` en un tenant; el detector en 0; `unidades_medida` con `entera`
   en `UNI` y `PAR` (un tenant que renombró `UNI` debe marcarse a mano: se lista con
   `SELECT codigo, entera FROM unidades_medida`).
4. El dueño activa `SERIE` insumo por insumo, con saldo cero.

**Bases locales** (WU-1): `DATABASE_URL_TENANT=postgresql://soporte:soporte@localhost:5432/soporte_tenant_test
pnpm migrate:tenant` y `pnpm migrate:tenants` para las de desarrollo. Rollback: ADR-10.

---

## Work Units y presupuesto de revisión

Estimaciones **ya corregidas** (el real del repo es 2–3 veces la estimación ingenua; renombres,
reescrituras de spec y borrados cuentan). Feature Branch Chain sobre el tracker
`feat/repuestos-numero-de-serie`, auto-chain; cada WU queda en verde y se revierte sola.

| # | Unidad | Depende de | Estimación (+/−) |
|---|---|---|---|
| 1 | Migración (con el CHECK de pendiente relajado, F1, y `eventos_unidad_insumo.componente_id`), `schema.prisma`, catálogos de dominio, seed de `entera`, spec de constraints, migración manual de bases locales | — | ~300 |
| 2 | Dominio: `UnidadInsumoEntity` (máquina de estados completa), evento, `seguimiento`, `entera`, `unidadId` en el movimiento, mappers | 1 | ~380 |
| 3 | Persistencia: repos de unidad y evento, `exigirTransaccionActiva`, `bloquearStock`, lecturas con lock de fila (L0, L1, L3), `save()` sin `seguimiento` en `update` + test, integración y concurrencia de serial | 2 | ~400 (corte: repo de eventos aparte) |
| 4a | Operaciones de depósito I: `ingresar`, `sacarDelDeposito` (`ENTREGADA`; `DESCARTADA` también desde pendiente) | 3 | ~350 |
| 4b | Operaciones de depósito II: `devolverEntregas`, `cargarSerial`, `corregirSerial`, helper del invariante | 4a | ~300 |
| 5 | Operaciones de equipo: `instalar`, `devolverAlDeposito`, `descartarInstaladas`, `reinstalar` (guard del último `DESCARTE` por `componente_id`), `altaInstalada`, integración de lote | 4b | ~380 |
| 6 | Seguimiento en aplicación, **sin borde HTTP**: `CambiarSeguimientoInsumoUseCase` (dos direcciones, re-lectura de la unidad, ADR-3), L0 y LC en `CrearInsumoUseCase`, guard de `EditarInsumo` con L0/L1, spec `orden-de-locks` con los casos 1 y 2 | 3 | ~380 |
| 7a | Entrada con L1, ajuste positivo, `completarConPendientes` (ADR-6), rama `SERIE` de `registrarDevolucionDeComponente`; casos 3–5 de `orden-de-locks` | 4b, 6 | ~400 (corte: los casos 3–5 en su propio PR, 7a') |
| 7b | Salida y ajuste con L1, ajuste negativo (con pendiente, F1), consulta `SERIE`; spec del invariante; caso 6 de `orden-de-locks` | 7a | ~380 |
| 8a | Borde de movimientos: `seriales`/`unidadId` en DTOs, `UnidadNoAdmitidaError`, respuestas, e2e | 7b | ~300 |
| 8b | Borde de unidades: listar, historial, cargar y corregir serial, e2e | 8a | ~350 |
| 8c | Devolución de entrega: `DevolverEntregaUseCase` con la exención de G2, ruta, e2e | 8b | ~250 |
| 8d | Recuperar pieza descartada (G1): `recuperarDescartadas`, `RecuperarUnidadDescartadaUseCase`, ruta, e2e | 8c | ~350 |
| 9 | Recepción `SERIE` (compras) | 7a | ~250 |
| 10 | Equipos: entidad, mapper con serial resuelto, editar, `AgregarComponente.preparar`, instalar con unidad (orden de ADR-12), D3, borde, e2e | 5, 7b | ~400 (corte: D3 aparte) |
| 11 | Equipos: retiro con unidad y legado con serial, reactivar en transacción (`UnidadDelComponenteNoDisponibleError`, incluido el caso tras recuperar), concurrencia | 8d, 10 | ~380 |
| 12a | **Llave**: `PATCH /insumos/:id/seguimiento`, `seguimiento` en el DTO de alta y en las respuestas, e2e | 8d, 9, 11 | ~250 |
| 12b | Unidades de medida `entera` (F3): DTOs, crear y editar (L0 con `FOR UPDATE` si viene `codigo`), `UnidadMedidaEnUsoPorSerieError`, caso 7 de `orden-de-locks`, e2e | 12a | ~300 |
| 13 | Frontend: tipos, schemas, seguimiento en el ABM y orden de las dos llamadas | 12a | ~350 |
| 14 | Frontend: casilla `entera` en el ABM de unidades | 12b, 13 | ~150 |
| 15 | Frontend: sección de unidades e historial en la ficha | 8b, 13 | ~350 |
| 16a | Frontend: cargar y corregir serial | 8b, 15 | ~250 |
| 16b | Frontend: `unidad-reingreso-dialog` para la devolución de entrega y la recuperación (G1) | 8d, 16a | ~350 |
| 17 | Frontend: seriales y selector de unidad en los diálogos de movimiento (pendientes solo en el ajuste negativo) | 15 | ~400 (corte: entrada/ajuste+ y salida/ajuste−) |
| 18 | Frontend: seriales en la recepción | 9, 13 | ~250 |
| 19 | Frontend: equipos (unidad o serial en el alta, serial precargado en el retiro legado) | 11, 15 | ~350 |
| 20 | Runbook: rollback y detector | 11 | ~80 |

Orden de la cadena: 1, 2, 3, 4a, 4b, 5, 6, 7a, 7b, 8a, 8b, 8c, 8d, 9, 10, 11, 12a, 12b, 13, 14, 15,
16a, 16b, 17, 18, 19, 20 (27 PR si ningún corte planeado se activa; 31 si se activan los cuatro:
WU-3, WU-7a, WU-10 y WU-17). El forecast
formal es trabajo de `sdd-tasks`.

**Por qué cada WU queda en verde (W2).** Ningún insumo puede ser `SERIE` por HTTP hasta **WU-12a**,
la llave, que entra cuando todas las ramas `SERIE` del backend ya existen con sus tests (7a, 7b, 8a–8d,
9, 10, 11). Antes, `seguimiento` existe solo en la capa de aplicación (WU-6) y los specs lo ejercen
sin borde. `unidadId` es opcional en `MovimientoInsumoEntity.create()` desde WU-2, así que ningún
llamador cambia antes de su WU. La casilla `entera` (12b) va después de la llave: hasta entonces
solo valen los valores sembrados.

---

## Open Questions

Ninguna bloquea. Resueltas por el dueño el 2026-09-30 y ya reflejadas en las tres specs:

- [x] La SALIDA manual `SERIE` deja la unidad `ENTREGADA` (estado nuevo, fuera del depósito, con su
      destino en el historial); el AJUSTE_NEGATIVO la deja `DESCARTADA` (ADR-1, ADR-5, ADR-9).
- [x] Retirar al stock un componente legado de un insumo hoy `SERIE` exige serial, precargado desde el
      serial de texto cuando es válido, sin serie pendiente; reactivar un componente con unidad exige
      que el insumo siga `SERIE` (ADR-7).
- [x] `SERIE → NINGUNO` solo sin unidades `EN_DEPOSITO` ni `INSTALADA`; las `ENTREGADA` y
      `DESCARTADA` conservan su historial (ADR-3).

- [x] F1: una pendiente puede darse de baja por ajuste negativo con motivo, sin serial; queda
      `DESCARTADA` (ADR-1, ADR-5).
- [x] F2: una `ENTREGADA` vuelve al depósito por devolución de entrega, en la condición que elige el
      usuario (ADR-13); `ENTREGADA` deja de ser terminal.
- [x] F3: `entera` es editable en el ABM de unidades; desmarcarla se rechaza mientras un insumo
      `SERIE` la use (ADR-3).
- [x] F4: `EQUIPOS:ALTAS`, `EQUIPOS:BORRADO` y `EQUIPOS:MODIFICACION` mueven unidades sin permisos de
      INSUMOS (Autorización).

Resueltas por el dueño en la segunda ronda (2026-09-30):

- [x] G1: una `DESCARTADA` se recupera con motivo, en la condición elegida, con `INSUMOS:AJUSTAR`;
      una pendiente descartada vuelve pendiente; reactivar el componente que la descartó se rechaza
      después (ADR-14, ADR-7).
- [x] G2: la devolución de entrega y la recuperación admiten un insumo deshabilitado, con la exención
      del retiro (ADR-13, ADR-14).

Supuestos del orquestador que el dueño puede revertir sin rediseño:

- [ ] Recuperación como ENTRADA (no AJUSTE_POSITIVO) y con `INSUMOS:AJUSTAR` (ADR-14).
