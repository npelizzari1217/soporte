/**
 * PrismaEncuestaTokenRepository — implementación del puerto
 * `IEncuestaTokenRepository` (MASTER, `encuesta_tokens`).
 *
 * `marcarUsadoSiNoUsado` es el CAS de uso único (ADR-C2): `updateMany` con
 * `where: { id, usedAt: null }` es, a nivel Postgres, EXACTAMENTE
 * `UPDATE ... WHERE id = $1 AND used_at IS NULL` — una sola sentencia
 * atómica. `result.count` es 1 solo si ESTA llamada ganó la carrera; una
 * segunda llamada sobre el mismo id ya no encuentra `usedAt IS NULL` y
 * devuelve 0 filas afectadas → `false`.
 *
 * Ref design: ADR-C1, ADR-C2. Tarea: 5.2.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IEncuestaTokenRepository } from '../../../domain/ports/i-encuesta-token.repository';
import { EncuestaTokenEntity } from '../../../domain/entities/encuesta-token.entity';
import { EncuestaTokenMapper } from './encuesta-token.mapper';

@Injectable()
export class PrismaEncuestaTokenRepository implements IEncuestaTokenRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async findByHash(tokenHash: string): Promise<EncuestaTokenEntity | null> {
    const row = await this.client.encuestaToken.findUnique({ where: { tokenHash } });
    return row ? EncuestaTokenMapper.toDomain(row) : null;
  }

  async save(token: EncuestaTokenEntity): Promise<void> {
    const data = EncuestaTokenMapper.toPersistence(token);
    const { id, ...updateData } = data;

    await this.client.encuestaToken.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async revocarVigentesDeTicket(clienteId: string, ticketId: string): Promise<number> {
    const result = await this.client.encuestaToken.updateMany({
      where: { clienteId, ticketId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async marcarUsadoSiNoUsado(tokenId: string): Promise<boolean> {
    const result = await this.client.encuestaToken.updateMany({
      where: { id: tokenId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  async liberarUso(tokenId: string): Promise<void> {
    await this.client.encuestaToken.update({
      where: { id: tokenId },
      data: { usedAt: null },
    });
  }
}
