import { BaseEntity } from '../../../shared/domain/base-entity';
import { PEDIDO_PUBLICO_TTL_MS } from '../constants/pedido-publico.constants';

export interface PedidoPublicoTokenProps {
  /** FK → master.clientes.id. */
  clienteId: string;
  /** SHA-256 del token crudo. El token en claro NUNCA se persiste. */
  tokenHash: string;
  expiresAt: Date;
  /** NULL = no usado. Se marca post-commit de la confirmación, best-effort. */
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface EmitirPedidoPublicoTokenInput {
  clienteId: string;
  tokenHash: string;
  /** Instante de emisión; por defecto, ahora. Inyectable para los tests. */
  ahora?: Date;
}

/**
 * PedidoPublicoTokenEntity — token de verificación del pedido público (MASTER).
 *
 * No guarda datos personales: nombre, email y descripción viven en el tenant
 * (`PedidoPendienteEntity`) bajo el mismo id. Vence a las 24 h (ADR-7). `isVigente` es la regla de
 * la spec: un token usado, vencido o revocado responde 404 uniforme.
 *
 * Dominio puro: sin Prisma ni NestJS.
 *
 * Ref spec: sdd/formulario-publico-qr pedido-publico. Tarea: 11.2/11.3.
 */
export class PedidoPublicoTokenEntity extends BaseEntity<PedidoPublicoTokenProps> {
  private constructor(props: PedidoPublicoTokenProps, id?: string) {
    super(props, id);
  }

  /** Emite un token nuevo con vigencia de 24 h desde `ahora`. */
  static emitir(input: EmitirPedidoPublicoTokenInput, id?: string): PedidoPublicoTokenEntity {
    const ahora = input.ahora ?? new Date();
    return new PedidoPublicoTokenEntity(
      {
        clienteId: input.clienteId,
        tokenHash: input.tokenHash,
        expiresAt: new Date(ahora.getTime() + PEDIDO_PUBLICO_TTL_MS),
        usedAt: null,
        revokedAt: null,
      },
      id,
    );
  }

  /** Reconstitución desde persistencia (mapper). */
  static reconstitute(
    props: PedidoPublicoTokenProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): PedidoPublicoTokenEntity {
    const entity = new PedidoPublicoTokenEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  get clienteId(): string {
    return this.props.clienteId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | null {
    return this.props.usedAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  /** `expiresAt <= ahora`: el instante exacto del vencimiento ya está vencido. */
  isExpired(ahora: Date = new Date()): boolean {
    return this.props.expiresAt.getTime() <= ahora.getTime();
  }

  isUsed(): boolean {
    return this.props.usedAt !== null;
  }

  isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  /** Vigente = ni vencido, ni usado, ni revocado, ni dado de baja. */
  isVigente(ahora: Date = new Date()): boolean {
    return !this.isExpired(ahora) && !this.isUsed() && !this.isRevoked() && this.deletedAt === null;
  }
}
