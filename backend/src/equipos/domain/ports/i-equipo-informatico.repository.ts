import { EquipoInformaticoEntity } from '../entities/equipo-informatico.entity';

/**
 * IEquipoInformaticoRepository — puerto de persistencia para equipos informáticos.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:equipos/Tabla equipos_informaticos]
 * Tarea: 6.A.3
 */
export interface IEquipoInformaticoRepository {
  /**
   * Busca un equipo por su identificador técnico (UUIDv7).
   * Retorna null si no existe. Incluye equipos soft-deleted.
   */
  findById(id: string): Promise<EquipoInformaticoEntity | null>;

  /**
   * Busca un equipo activo y no eliminado por su número de serie.
   * Retorna null si no existe o si el equipo está soft-deleted.
   * Usado por GestionarEquipoUseCase para verificar unicidad del número de serie.
   */
  findByNumeroSerie(numeroSerie: string): Promise<EquipoInformaticoEntity | null>;

  /**
   * Retorna todos los equipos activos y no eliminados (activo=true, deleted_at IS NULL).
   */
  findAllActive(): Promise<EquipoInformaticoEntity[]>;

  /**
   * Retorna todos los equipos asignados a un usuario específico.
   * Incluye solo equipos no eliminados (deleted_at IS NULL).
   *
   * @param asignadoAId UUID del usuario de master.usuarios.
   */
  findByAsignadoAId(asignadoAId: string): Promise<EquipoInformaticoEntity[]>;

  /**
   * Persiste el equipo (upsert: crea si no existe, actualiza si existe).
   * El repositorio decide si es INSERT o UPDATE según el id.
   */
  save(equipo: EquipoInformaticoEntity): Promise<void>;

  /**
   * Baja lógica: setea deleted_at. NO elimina la fila.
   * Los tickets de soporte que referencian el equipo permanecen intactos.
   * Para la baja real, usar EquipoInformaticoEntity.softDelete() + save().
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IEquipoInformaticoRepository en NestJS. */
export const EQUIPO_INFORMATICO_REPOSITORY = Symbol('EQUIPO_INFORMATICO_REPOSITORY');
