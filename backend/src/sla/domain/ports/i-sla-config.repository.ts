import { SlaConfigEntity } from '../entities/sla-config.entity';

/**
 * ISlaConfigRepository — puerto de acceso a `sla_config` (S1). Una fila por
 * prioridad del catálogo FIJO — sin `save()` de alta libre: el CRUD real es
 * "editar horas/activo de una fila ya sembrada" (S1).
 *
 * Ref spec: sdd/premium/spec S1. Ref design: ADR-P1/ADR-P4. Tarea: SA4/SA5.
 */
export interface ISlaConfigRepository {
  /** Busca la config de SLA por su id técnico. Retorna null si no existe. */
  findById(id: string): Promise<SlaConfigEntity | null>;

  /**
   * Busca la config de SLA de una prioridad (`prioridadId` es UNIQUE).
   * Retorna null si no existe fila para esa prioridad (sin SLA aplicable).
   */
  findByPrioridad(prioridadId: string): Promise<SlaConfigEntity | null>;

  /** Retorna todas las filas de `sla_config` del tenant (S1, listado). */
  findAll(): Promise<SlaConfigEntity[]>;

  /**
   * Persiste un `SlaConfigEntity` (upsert por id: INSERT si es nuevo, UPDATE
   * si ya existe). En el flujo normal solo se usa para UPDATE (S1 — no hay
   * alta libre desde la app, las filas nacen en el seed de provisioning).
   */
  save(config: SlaConfigEntity): Promise<void>;
}

/** Token de inyección de dependencias para ISlaConfigRepository en NestJS. */
export const SLA_CONFIG_REPOSITORY = Symbol('SLA_CONFIG_REPOSITORY');
