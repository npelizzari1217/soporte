import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { ITipoComponenteMasterChecker } from '../../../domain/ports/i-tipo-componente-master.checker';

/**
 * TipoComponenteMasterChecker — implementación del puerto
 * ITipoComponenteMasterChecker.
 *
 * Consulta `master.tipos_componente` directamente vía MasterPrismaClient
 * (PrismaService) — NO depende del módulo `tipos-componente/` (mismo
 * criterio de decoplamiento que `UsuarioMasterChecker`).
 *
 * Ref: sdd/tipos-componente-master (PR3).
 */
@Injectable()
export class TipoComponenteMasterChecker implements ITipoComponenteMasterChecker {
  constructor(private readonly prismaService: PrismaService) {}

  private get masterClient() {
    return this.prismaService.getMasterClient();
  }

  /** Batch, sin N+1: un único `findMany` con `codigo IN (...)`. */
  async resolver(codigos: string[]): Promise<Map<string, { nombre: string; activo: boolean }>> {
    if (codigos.length === 0) {
      return new Map();
    }
    const rows = await this.masterClient.tipoComponente.findMany({
      where: { codigo: { in: codigos } },
      select: { codigo: true, nombre: true, activo: true },
    });
    return new Map(rows.map((row) => [row.codigo, { nombre: row.nombre, activo: row.activo }]));
  }

  async estaActivo(codigo: string): Promise<boolean> {
    const row = await this.masterClient.tipoComponente.findFirst({
      where: { codigo, activo: true },
      select: { codigo: true },
    });
    return row !== null;
  }

  async listarActivos(): Promise<{ codigo: string; nombre: string }[]> {
    const rows = await this.masterClient.tipoComponente.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: { codigo: true, nombre: true },
    });
    return rows.map((row) => ({ codigo: row.codigo, nombre: row.nombre }));
  }
}
