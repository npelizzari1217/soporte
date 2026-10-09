/**
 * Regla de asignación automática: el responsable fijo de un tipo de ticket. Una regla por tipo;
 * "sin regla" es la ausencia de fila. `responsableId` y `actualizadoPor` son ids de usuario de
 * master (referencia blanda, sin FK).
 */
export interface ReglaAsignacion {
  tipoId: string;
  responsableId: string;
  actualizadoPor: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * IReglaAsignacionRepository — puerto de persistencia de las reglas de asignación, locales al
 * tenant. Sin imports de Prisma ni NestJS: la implementación toma el cliente de `TenantContext`.
 *
 * Ref spec: sdd/asignacion-automatica-por-tipo reglas-asignacion (R1, R7).
 */
export interface IReglaAsignacionRepository {
  /** Regla del tipo, o `null` si el tipo no tiene (no hay fila). */
  findByTipoId(tipoId: string): Promise<ReglaAsignacion | null>;

  /** Todas las reglas del tenant (una por tipo con regla). */
  listar(): Promise<ReglaAsignacion[]>;

  /** Upsert por tipo: fija el responsable y registra quién lo configuró. */
  fijar(tipoId: string, responsableId: string, actualizadoPor: string): Promise<ReglaAsignacion>;

  /** Quita la regla del tipo. Idempotente: sin regla no falla. */
  quitar(tipoId: string): Promise<void>;
}

/** Token de inyección de dependencias para IReglaAsignacionRepository en NestJS. */
export const REGLA_ASIGNACION_REPOSITORY = Symbol('REGLA_ASIGNACION_REPOSITORY');
