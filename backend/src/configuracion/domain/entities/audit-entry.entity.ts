import { uuidv7 } from 'uuidv7';

/**
 * AuditEntryProps — shape de las propiedades de dominio de un `AuditEntry`.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * `valorAnterior`/`valorNuevo` YA vienen enmascarados (`maskIfSecret()`,
 * `mask-secret.ts`) cuando `esSecreto=true` — la entidad NO enmascara, solo
 * transporta el valor tal cual se lo pasan (REQUISITO DURO: el masking pasa
 * en el ORIGEN — write use case, PR4 — antes de llegar acá).
 */
export interface AuditEntryProps {
  actorId: string;
  accion: string;
  categoria: string;
  clave: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  esSecreto: boolean;
}

/**
 * AuditEntry — entidad de dominio inmutable del log de auditoría de cambios
 * de config (Dz8 — desviación deliberada del soft-delete universal del
 * proyecto).
 *
 * NO extiende `BaseEntity` (que fuerza `updatedAt`/`deletedAt`, soft-delete):
 * un audit borrable/mutable deja de ser evidencia (spec §0, ratificado).
 * Entidad plana con solo `id` + `createdAt` — mismo criterio de generación
 * de id que `BaseEntity` (`uuidv7()` en el backend antes del INSERT, id
 * opcional para reconstitución desde persistencia).
 *
 * Ref design: §2 Dz8, §5 (firma exacta). Ref spec: §0, R5. Tarea: 3.2/3.3
 * (PR3).
 */
export class AuditEntry {
  private constructor(
    readonly id: string,
    readonly props: AuditEntryProps,
    readonly createdAt: Date,
  ) {}

  /**
   * Factory method. `id` opcional: si no se provee, se genera un UUIDv7
   * nuevo (mismo criterio que `BaseEntity`); los mappers de infraestructura
   * pasan el id ya almacenado en la DB al reconstituir.
   */
  static create(props: AuditEntryProps, id?: string): AuditEntry {
    return new AuditEntry(id ?? uuidv7(), props, new Date());
  }
}
