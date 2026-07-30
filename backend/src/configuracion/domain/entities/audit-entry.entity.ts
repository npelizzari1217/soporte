import { uuidv7 } from 'uuidv7';

/**
 * AuditEntryProps — shape de las propiedades de dominio de un `AuditEntry`.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * `valorAnterior`/`valorNuevo` YA vienen enmascarados (`maskIfSecret()`,
 * `mask-secret.ts`) cuando `esSecreto=true` — la entidad NO enmascara, solo
 * transporta el valor tal cual se lo pasan (REQUISITO DURO: el masking pasa
 * en el ORIGEN — write use case, PR4 — antes de llegar acá).
 *
 * Todos los campos son `readonly` (Judgment Day PR3 Ronda 1, issue 2 —
 * MEDIUM real): un audit log mutable deja de ser evidencia (Dz8). El
 * `readonly` a nivel de tipo es solo la primera defensa (compile-time); la
 * inmutabilidad REAL en runtime la da `Object.freeze()` en `AuditEntry.create()`.
 */
export interface AuditEntryProps {
  readonly actorId: string;
  readonly accion: string;
  readonly categoria: string;
  readonly clave: string;
  readonly valorAnterior: string | null;
  readonly valorNuevo: string | null;
  readonly esSecreto: boolean;
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
 * Inmutabilidad REAL (Judgment Day PR3 Ronda 1, issue 2): `create()` clona
 * `props` (`{ ...props }`) ANTES de congelarlo con `Object.freeze()` — así
 * mutar el objeto original que el caller pasó a `create()` NUNCA afecta la
 * entidad ya construida, y mutar `entry.props` directamente lanza
 * `TypeError` (ESM corre siempre en strict mode). Complementa los campos
 * `readonly` de `AuditEntryProps` (defensa de compile-time) con una defensa
 * real de runtime — la inmutabilidad de este log es solo convención de app
 * (sin trigger WORM en Postgres, ver STATE.md).
 *
 * Ref design: §2 Dz8, §5 (firma exacta). Ref spec: §0, R5. Tarea: 3.2/3.3
 * (PR3). Judgment Day PR3 Ronda 1, issues 2 y 4.
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
   *
   * `createdAt` opcional (Judgment Day PR3 Ronda 1, issue 4 — MEDIUM): espejo
   * de `id` — si no se provee, se estampa `new Date()` (alta nueva); un
   * futuro mapper de lectura pasa el `createdAt` YA persistido para
   * reconstituir la entidad sin perder el timestamp real ("ahora" ≠ el
   * momento original del alta).
   */
  static create(props: AuditEntryProps, id?: string, createdAt?: Date): AuditEntry {
    const propsInmutables = Object.freeze({ ...props });
    return new AuditEntry(id ?? uuidv7(), propsInmutables, createdAt ?? new Date());
  }
}
