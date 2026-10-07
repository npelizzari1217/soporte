import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';

/** Adaptador Prisma de `IDispositivoConfiableRepository` sobre `tfa_dispositivos_confiables`. */
@Injectable()
export class PrismaDispositivoConfiableRepository implements IDispositivoConfiableRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async crear(usuarioId: string, tokenHash: string, expiraAt: Date): Promise<void> {
    await this.client.tfaDispositivoConfiable.create({ data: { usuarioId, tokenHash, expiraAt } });
  }

  async esValido(usuarioId: string, tokenHash: string, ahora: Date): Promise<boolean> {
    const fila = await this.client.tfaDispositivoConfiable.findFirst({
      where: { usuarioId, tokenHash, revocadoAt: null, expiraAt: { gt: ahora } },
      select: { id: true },
    });
    return fila !== null;
  }

  async revocarTodosDe(usuarioId: string): Promise<void> {
    await this.client.tfaDispositivoConfiable.updateMany({
      where: { usuarioId, revocadoAt: null },
      data: { revocadoAt: new Date() },
    });
  }
}
