import { CompraEntity } from '../entities/compra.entity';
import { ItemCompraEntity } from '../entities/item-compra.entity';
import { FiltroGrupoEstadoCompra } from '../services/estado-compra';

/**
 * ICompraRepository — puerto ÚNICO de persistencia del agregado `Compra`
 * (ADR-C2, divergencia declarada vs `equipos`).
 *
 * `equipos` separa `IEquipoInformaticoRepository`/`IComponenteEquipoRepository`
 * porque `componentes_equipo` no tiene NI UN invariante cross-entidad. Acá es
 * distinto: TODOS los invariantes de esta spec son cross-item (estado
 * derivado §2/§3, S7 no eliminar ítem aprobado, S29 no cancelar con
 * `cantidadComprada>0` en algún ítem, `totalesPorMoneda` por moneda §7.1).
 * Con un repo item-scoped esos invariantes serían inexpresables en el
 * dominio y se filtrarían al caso de uso — por eso `Compra` (raíz) e
 * `ItemCompra` (dentro del agregado) comparten un solo puerto.
 *
 * `guardar()` persiste SOLO los campos de cabecera (`CompraMapper.toPersistence`
 * excluye `items`); `guardarItem()` persiste un ítem individual. Los casos de
 * uso (PR-14..PR-18) orquestan ambos dentro de la misma transacción
 * (`ITenantTransactionRunner.run(...)`) — ninguno de los dos métodos abre
 * transacción propia.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaCompraRepository`, PR-11/PR-12) obtiene su
 * cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §4.9 (S32-S34). Ref
 * design: ADR-C2, ADR-C5 (advisory lock de `findLastSecuencia`). Tarea:
 * PR-10.
 */

/**
 * Filtros de paginación para `findPaginaConItems` (S32: máximo 3 sentencias
 * SQL para resolver una página COMPLETA — datos + `total`; ver el JSDoc de
 * `findPaginaConItems`).
 */
export interface CompraListFiltros {
  /** Cantidad máxima de compras a retornar. `undefined` = sin límite. */
  limit?: number;
  /** Cantidad de compras a saltear. `undefined` = 0. */
  offset?: number;
  /**
   * Filtro por ciclo (WU-11, sdd/compras-tres-etapas-y-sectores/spec R7).
   * `undefined` = sin restricción de ciclo.
   */
  cicloId?: string;
  /**
   * Grupo de negocio a listar (WU-25). `TODAS` (o `undefined`) no restringe;
   * los otros tres valores dejan pasar SÓLO las compras de ese grupo, tal
   * como lo deriva `derivarGrupoEstadoCompra` (`estado-compra.ts`).
   *
   * REEMPLAZA al `soloEnCurso: boolean` anterior. El default (`ACTIVAS`) lo
   * resuelve `ListarComprasUseCase`, no este puerto.
   */
  grupoEstado?: FiltroGrupoEstadoCompra;
  /** Filtro por sector de cabecera (R11). `undefined` = sin restricción. */
  sectorId?: string;
  /** Filtra por `fechaSolicitud >= fechaDesde` (R7). Fecha de CABECERA, no de etapa. */
  fechaDesde?: Date;
  /** Filtra por `fechaSolicitud <= fechaHasta` (R7). Fecha de CABECERA, no de etapa. */
  fechaHasta?: Date;
}

/**
 * Página del listado de compras: las filas pedidas MÁS el total del universo
 * filtrado completo (ignorando `limit`/`offset`). Los dos valores salen de
 * la MISMA consulta SQL — ver `findPaginaConItems`.
 */
export interface CompraPaginaConItems {
  /** Compras de la página, YA ordenadas (grupo ASC, fechaSolicitud DESC, createdAt DESC). */
  compras: CompraEntity[];
  /** Total de compras que cumplen el filtro, sin `limit`/`offset`. */
  total: number;
}

export interface ICompraRepository {
  /**
   * Busca una compra por su id, con TODOS sus ítems cargados (activos y
   * soft-deleted — `CompraEntity` exige la colección completa, ver
   * `compra.entity.ts:78-80`). Retorna `null` si no existe. Incluye compras
   * soft-deleted.
   */
  findByIdConItems(id: string): Promise<CompraEntity | null>;

  /**
   * Retorna UNA página del listado de compras del tenant activo (excluye
   * soft-deleted), con sus ítems cargados, YA ORDENADA y con el `total` del
   * universo filtrado completo.
   *
   * **Orden (WU-25)**: `grupo ASC, fechaSolicitud DESC, createdAt DESC`,
   * donde `grupo` es el ordinal de `derivarGrupoEstadoCompra`
   * (`ACTIVAS`=0, `COMPLETADAS`=1, `CANCELADAS`=2). El orden se resuelve EN
   * LA BASE, no en memoria: la paginación es server-side, así que ordenar
   * después de traer la página daría un orden correcto dentro de la página
   * y ROTO a través de las páginas.
   *
   * **Por qué `total` y `compras` salen juntos** (reemplaza al par
   * `findAllConItems`/`count` anterior): el grupo es una expresión DERIVADA
   * de `(canceladaEn, items[])`, no una columna, así que la selección de
   * ids se resuelve con SQL crudo. Devolver el total desde esa MISMA
   * sentencia elimina por construcción la desincronización que S62 vigila
   * (dos consultas con filtros distintos) en vez de vigilarla con un test.
   *
   * **Presupuesto de sentencias SQL (S32)**: 1 (ids ordenados + total) + 2
   * (hidratación `findMany` con `include` de ítems, R17) = 3 FIJAS, el
   * mismo número que el par anterior. Sigue sin haber N+1: ninguna
   * sentencia se emite POR FILA. Con la página vacía son 1 sola (la
   * hidratación se saltea).
   *
   * La objeción histórica a `COUNT(*) OVER()` (si la página no tiene filas,
   * la window function no tiene dónde llevar el total) NO aplica acá: la
   * sentencia agrega los ids en un `array_agg` y devuelve SIEMPRE
   * exactamente una fila, con `total` incluso cuando el array viene vacío.
   */
  findPaginaConItems(filtros?: CompraListFiltros): Promise<CompraPaginaConItems>;

  /**
   * Retorna la última secuencia LOCAL (tenant+año) usada en `numero`
   * (formato `COM-{anio}-{00000}`). 0 si no hay compras previas de ese año.
   * Usado por `NumeradorCompra.generarNumero` (ADR-C5). La implementación
   * concreta adquiere un advisory lock de Postgres ANTES de leer — ver
   * `PrismaCompraRepository.findLastSecuencia` (PR-11), espejo de
   * `PrismaTicketRepository.findLastSecuencia`.
   */
  findLastSecuencia(anio: number): Promise<number>;

  /**
   * Persiste SOLO los campos de cabecera de la compra (upsert por id). NO
   * itera ni persiste `items` — para eso está `guardarItem()`. Nunca pisa
   * `createdAt` en el UPDATE (mismo patrón que el resto de los repos Prisma
   * del proyecto).
   */
  guardar(compra: CompraEntity): Promise<void>;

  /**
   * Persiste un ítem individual del agregado (upsert por id). Recibe el
   * `ItemCompraEntity` suelto (no la `Compra` completa) porque el ABM de
   * ítems (§4.2) y la ejecución (§4.5-§4.7) mutan un ítem a la vez — el
   * caller (`CompraEntity`) ya validó los invariantes cross-item antes de
   * llegar acá.
   */
  guardarItem(item: ItemCompraEntity): Promise<void>;
}

/** Token de inyección de dependencias para ICompraRepository en NestJS. */
export const COMPRA_REPOSITORY = Symbol('COMPRA_REPOSITORY');
