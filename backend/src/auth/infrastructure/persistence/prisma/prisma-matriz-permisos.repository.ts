/**
 * PrismaMatrizPermisosRepository — impl del puerto IMatrizPermisosRepository
 * sobre la DB MASTER.
 *
 * Resuelve/escribe la matriz de permisos por usuario (tabla
 * `usuario_cliente_permisos`), celda por celda. ROOT/ADMINISTRADOR NO pasan
 * por acá — `resolverScope` les materializa `PARES_VALIDOS` completo sin
 * query (ADR-P6).
 *
 * Calcado de `PrismaUsuarioClienteModuloRepository.setModulos`
 * (`prisma-usuario-cliente-modulo.repository.ts:30-42`): `deleteMany` +
 * `createMany` en una transacción, reemplazo atómico e idempotente.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R2. Ref design: ADR-P3.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IMatrizPermisosRepository } from '../../../domain/ports/i-matriz-permisos.repository';

@Injectable()
export class PrismaMatrizPermisosRepository implements IMatrizPermisosRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findByUsuarioYCliente(usuarioId: string, clienteId: string): Promise<string[]> {
    const rows = await this.client.usuarioClientePermiso.findMany({
      where: { usuarioId, clienteId },
      select: { modulo: true, accion: true },
    });
    return rows.map((r) => `${r.modulo}:${r.accion}`);
  }

  async setPermisos(
    usuarioId: string,
    clienteId: string,
    celdas: readonly string[],
  ): Promise<void> {
    // Dedup: la PK compuesta es (usuarioId, clienteId, modulo, accion); un
    // código repetido reventaría el createMany.
    const celdasUnicas = [...new Set(celdas)];
    await this.client.$transaction(async (tx) => {
      await tx.usuarioClientePermiso.deleteMany({ where: { usuarioId, clienteId } });
      if (celdasUnicas.length > 0) {
        await tx.usuarioClientePermiso.createMany({
          data: celdasUnicas.map((codigo) => {
            const [modulo, accion] = codigo.split(':');
            return { usuarioId, clienteId, modulo, accion };
          }),
        });
      }
    });
  }
}
