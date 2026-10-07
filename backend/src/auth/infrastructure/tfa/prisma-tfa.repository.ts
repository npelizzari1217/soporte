import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  CodigoRecuperacionDisponible,
  EstadoTfa,
  ITfaRepository,
} from '../../domain/ports/tfa-repository.port';

/** Adaptador Prisma de `ITfaRepository` sobre master (ADR-2, ADR-3). */
@Injectable()
export class PrismaTfaRepository implements ITfaRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async obtener(usuarioId: string): Promise<EstadoTfa | null> {
    return this.client.usuarioTfa.findUnique({
      where: { usuarioId },
      select: {
        secretoCifrado: true,
        confirmadoAt: true,
        ultimoPaso: true,
        secretoPendienteCifrado: true,
        pendienteCreadoAt: true,
      },
    });
  }

  async guardarPendiente(usuarioId: string, secretoPendienteCifrado: string): Promise<void> {
    const pendienteCreadoAt = new Date();
    await this.client.usuarioTfa.upsert({
      where: { usuarioId },
      create: { usuarioId, secretoPendienteCifrado, pendienteCreadoAt },
      update: { secretoPendienteCifrado, pendienteCreadoAt },
    });
  }

  async promoverPendiente(
    usuarioId: string,
    pendienteLeido: string,
    paso: number,
  ): Promise<boolean> {
    const n = await this.client.$executeRaw`
      UPDATE usuarios_tfa SET
        secreto_cifrado = secreto_pendiente_cifrado, confirmado_at = now(),
        ultimo_paso = ${paso}::int, secreto_pendiente_cifrado = NULL,
        pendiente_creado_at = NULL, updated_at = now()
      WHERE usuario_id = ${usuarioId}::uuid AND secreto_pendiente_cifrado = ${pendienteLeido}`;
    return n === 1;
  }

  async registrarPaso(
    usuarioId: string,
    paso: number,
    secretoCifradoLeido: string,
  ): Promise<boolean> {
    const n = await this.client.$executeRaw`
      UPDATE usuarios_tfa SET ultimo_paso = ${paso}::int, updated_at = now()
      WHERE usuario_id = ${usuarioId}::uuid AND ultimo_paso < ${paso}::int
        AND secreto_cifrado = ${secretoCifradoLeido}`;
    return n === 1;
  }

  async reemplazarCodigos(usuarioId: string, codigosHash: string[]): Promise<void> {
    await this.client.$transaction(async (tx) => {
      await tx.tfaCodigoRecuperacion.deleteMany({ where: { usuarioId } });
      await tx.tfaCodigoRecuperacion.createMany({
        data: codigosHash.map((codigoHash) => ({ usuarioId, codigoHash })),
      });
    });
  }

  async obtenerCodigosDisponibles(usuarioId: string): Promise<CodigoRecuperacionDisponible[]> {
    return this.client.tfaCodigoRecuperacion.findMany({
      where: { usuarioId, usadoAt: null },
      select: { id: true, codigoHash: true },
    });
  }

  async consumirCodigo(codigoId: string): Promise<boolean> {
    const { count } = await this.client.tfaCodigoRecuperacion.updateMany({
      where: { id: codigoId, usadoAt: null },
      data: { usadoAt: new Date() },
    });
    return count === 1;
  }

  async contarCodigosRestantes(usuarioId: string): Promise<number> {
    return this.client.tfaCodigoRecuperacion.count({ where: { usuarioId, usadoAt: null } });
  }

  async eliminarTodo(usuarioId: string): Promise<void> {
    const ahora = new Date();
    await this.client.$transaction(async (tx) => {
      await tx.usuarioTfa.deleteMany({ where: { usuarioId } });
      await tx.tfaCodigoRecuperacion.deleteMany({ where: { usuarioId } });
      await tx.tfaDispositivoConfiable.updateMany({
        where: { usuarioId, revocadoAt: null },
        data: { revocadoAt: ahora },
      });
      await tx.authDesafio.updateMany({
        where: { usuarioId, usadoAt: null },
        data: { usadoAt: ahora },
      });
    });
  }
}
