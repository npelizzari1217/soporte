import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * CicloClienteProps — shape de las propiedades de dominio del ciclo de
 * gestión ADOPTADO por un tenant (snapshot del catálogo master + link real
 * al `CicloVigente` elegido). Sin imports de Prisma ni NestJS.
 */
export interface CicloClienteProps {
  /** Snapshot de `CicloVigente.nombre` al momento de la elección (R21). */
  nombre: string;
  /** Snapshot de `CicloVigente.fechaInicio`. */
  fechaInicio: Date;
  /** Snapshot de `CicloVigente.fechaFin`. */
  fechaFin: Date;
  /** Solo un ciclo puede estar `activo=true` por tenant a la vez (R22). */
  activo: boolean;
  /** Soft ref → `master.ciclos_vigentes.id` (ADR-7). Sin FK cross-DB. */
  cicloVigenteId: string;
}

/**
 * CicloClienteEntity — ciclo de gestión adoptado por un tenant
 * (`tenant.ciclos_cliente`). El ADMINISTRADOR del cliente lo crea eligiendo
 * un ciclo del catálogo master (`ElegirCicloTenantUseCase`, R21) y lo activa
 * después (`ActivarCicloUseCase`, R22).
 *
 * Se crea SIEMPRE con `activo=false` (R21) — la activación es un paso
 * explícito y separado que además desactiva el resto de los ciclos del
 * tenant (invariante: máximo un `activo=true` por tenant).
 *
 * Tarea: T9.4 (elegir), T9.5 (activar) — PR9
 */
export class CicloClienteEntity extends BaseEntity<CicloClienteProps> {
  /** Factory method para nuevas instancias de dominio. */
  static create(props: CicloClienteProps, id?: string): CicloClienteEntity {
    return new CicloClienteEntity(props, id);
  }

  /** Reconstitución desde persistencia. */
  static reconstitute(
    props: CicloClienteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): CicloClienteEntity {
    const entity = new CicloClienteEntity(props, id);
    (entity as unknown as { _createdAt: Date })._createdAt = createdAt;
    (entity as unknown as { _updatedAt: Date })._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get nombre(): string {
    return this.props.nombre;
  }

  get fechaInicio(): Date {
    return this.props.fechaInicio;
  }

  get fechaFin(): Date {
    return this.props.fechaFin;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  get cicloVigenteId(): string {
    return this.props.cicloVigenteId;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Marca este ciclo como activo. El repositorio (`activarCiclo`, T9.6) es
   * responsable de desactivar transaccionalmente el resto de los ciclos del
   * tenant — este método solo refleja el nuevo estado en la instancia local
   * que el use case retorna al caller.
   */
  activate(): void {
    this.props.activo = true;
    this.touch();
  }

  /**
   * Marca este ciclo como inactivo. A diferencia de `activate()`, NO tiene
   * efecto sobre los demás ciclos del tenant: desactivar deja al tenant
   * simplemente sin ciclo activo (0 activos es un estado válido). El use case
   * persiste el cambio con el `save()` normal — no requiere transacción.
   */
  deactivate(): void {
    this.props.activo = false;
    this.touch();
  }
}
