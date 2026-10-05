import { EquipoInformaticoEntity } from '../entities/equipo-informatico.entity';

/**
 * IEquipoInformaticoRepository — puerto de persistencia para el inventario
 * de equipos IT (F3-Q1).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaEquipoInformaticoRepository`, PR11)
 * obtiene su cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Ref design: "Firmas TS
 * clave" (ports/*). Tarea: T10.6.
 */
export interface IEquipoInformaticoRepository {
  /** Busca el equipo por su identificador técnico (UUIDv7). Incluye soft-deleted. */
  findById(id: string): Promise<EquipoInformaticoEntity | null>;

  /**
   * Busca el equipo por `numeroSerie`. Retorna `null` si no existe.
   * Usado para validar unicidad (índice único parcial `WHERE NOT NULL`)
   * antes de crear/editar.
   */
  findByNumeroSerie(numeroSerie: string): Promise<EquipoInformaticoEntity | null>;

  /** Retorna todos los equipos activos (`activo=true`, no soft-deleted) del tenant. */
  findAllActive(): Promise<EquipoInformaticoEntity[]>;

  /**
   * Retorna los equipos vigentes y los dados de baja (`activo` verdadero o falso), sin los
   * borrados lógicos. Solo lo usan la lista y la exportación cuando piden `incluirBajas`
   * (R11); los selectores de otras pantallas siguen usando `findAllActive()`.
   */
  findAllIncluyendoDadosDeBaja(): Promise<EquipoInformaticoEntity[]>;

  /**
   * Persiste el equipo (upsert: crea si no existe, actualiza si existe).
   *
   * La rama de actualización NO escribe `activo` ni `baja_*`: una entidad leída antes de una
   * baja no puede reactivar el equipo ni pisar sus datos de baja. La rama de creación sí los
   * conserva. El único escritor de la baja es `registrarBaja()`.
   */
  save(equipo: EquipoInformaticoEntity): Promise<void>;

  /**
   * Lee el equipo tomando el lock LE `FOR NO KEY UPDATE` sobre su fila (ADR-2). Lo usan la baja,
   * el borrado y la edición del equipo: espera a quien tenga `FOR SHARE` (altas, retiro,
   * reactivación, ticket) y es exclusivo entre sí. Nunca `FOR UPDATE`: chocaría con el
   * `FOR KEY SHARE` que los INSERT con FK al equipo toman y produciría deadlocks.
   *
   * Devuelve `null` si el equipo no existe. Un equipo con borrado lógico se devuelve igual
   * (con `deletedAt`): decidir que no existe es del llamador.
   *
   * @throws Error si no hay una transacción activa del tenant.
   */
  bloquearParaModificar(id: string): Promise<EquipoInformaticoEntity | null>;

  /**
   * Igual que `bloquearParaModificar` pero con `FOR SHARE`: lo toman las operaciones que
   * agregan, instalan, retiran o reactivan piezas y la creación de tickets, siempre como
   * PRIMER lock de la transacción. Es compatible con otros `FOR SHARE` y con el `FOR KEY SHARE`
   * de los INSERT con FK, y espera a una baja en curso (`FOR NO KEY UPDATE`).
   *
   * @throws Error si no hay una transacción activa del tenant.
   */
  bloquearParaOperarPiezas(id: string): Promise<EquipoInformaticoEntity | null>;

  /**
   * Da de baja el equipo escribiendo `activo = false` y los cinco campos `baja_*` de la entidad
   * con un CAS (`WHERE id = ? AND activo = true AND deleted_at IS NULL`). Es el único escritor
   * de la baja. Devuelve `false` si no tocó ninguna fila (ya estaba dado de baja o tiene
   * borrado lógico).
   */
  registrarBaja(equipo: EquipoInformaticoEntity): Promise<boolean>;

  /**
   * Busca el equipo cuyo QR tiene ese hash (sha256 hex del token). Devuelve `null` si ningún
   * equipo del tenant activo lo tiene: un token de otro cliente no resuelve nunca, porque la
   * búsqueda corre solo en la base del tenant. Devuelve también un equipo dado de baja o con
   * borrado lógico: decidir que abre el formulario sin equipo es del llamador.
   */
  findByQrHash(qrTokenHash: string): Promise<EquipoInformaticoEntity | null>;

  /**
   * Escribe el token del QR, su hash y su fecha de emisión en UNA sola sentencia, con un CAS
   * (`WHERE id = ? AND activo = true AND deleted_at IS NULL`). Reemplaza el par anterior: el
   * token viejo deja de resolver de inmediato. Es el único escritor de las columnas del QR.
   * Devuelve `false` si no tocó ninguna fila (equipo inexistente, dado de baja o borrado).
   */
  guardarQr(id: string, qrToken: string, qrTokenHash: string, emitidoAt: Date): Promise<boolean>;

  /** Baja lógica (soft delete) del equipo por id. */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IEquipoInformaticoRepository en NestJS. */
export const EQUIPO_INFORMATICO_REPOSITORY = Symbol('EQUIPO_INFORMATICO_REPOSITORY');
