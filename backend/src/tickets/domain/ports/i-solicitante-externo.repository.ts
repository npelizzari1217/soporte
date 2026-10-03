import { SolicitanteExternoEntity } from '../entities/solicitante-externo.entity';

/**
 * ISolicitanteExternoRepository — puerto de persistencia de los solicitantes externos, locales al
 * tenant. Sin imports de Prisma ni NestJS: la implementación toma el cliente de `TenantContext`.
 *
 * Solo inserta: una fila por pedido confirmado, sin upsert por email ni borrado (D2, D11).
 *
 * Ref spec: sdd/formulario-publico-qr solicitante-externo. Tarea: 6.3.
 */
export interface ISolicitanteExternoRepository {
  /** Inserta el solicitante. El id lo genera el dominio (UUIDv7). */
  save(solicitante: SolicitanteExternoEntity): Promise<void>;

  /** Busca por id. Null si no existe en el tenant activo. */
  findById(id: string): Promise<SolicitanteExternoEntity | null>;

  /**
   * Resuelve nombres en un solo query para listados y detalle. Los ids inexistentes no figuran en
   * el mapa y una lista vacía no consulta la base.
   */
  findNombres(ids: readonly string[]): Promise<Map<string, string>>;
}

/** Token de inyección de dependencias para ISolicitanteExternoRepository en NestJS. */
export const SOLICITANTE_EXTERNO_REPOSITORY = Symbol('SOLICITANTE_EXTERNO_REPOSITORY');
