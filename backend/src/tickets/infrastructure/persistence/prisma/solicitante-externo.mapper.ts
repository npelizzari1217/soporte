/**
 * SolicitanteExternoMapper — fila Prisma <-> SolicitanteExternoEntity.
 * Vive en infrastructure/: único lugar donde se puede importar de '.prisma/tenant'.
 */
import type { SolicitanteExterno as PrismaSolicitanteExterno } from '.prisma/tenant';
import { SolicitanteExternoEntity } from '../../../domain/entities/solicitante-externo.entity';

export class SolicitanteExternoMapper {
  static toDomain(row: PrismaSolicitanteExterno): SolicitanteExternoEntity {
    return SolicitanteExternoEntity.reconstitute(
      {
        nombre: row.nombre,
        email: row.email,
        telefono: row.telefono ?? null,
        emailVerificadoAt: row.emailVerificadoAt,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
    );
  }
}
