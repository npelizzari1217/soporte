/**
 * UsuarioMasterChecker — implementación del puerto IUsuarioMasterChecker.
 *
 * Valida la existencia y elegibilidad de usuarios cross-DB consultando
 * `master.usuarios` vía MasterPrismaClient (PrismaService).
 *
 * IMPORTANTE:
 * - Este checker opera sobre la DB MASTER (no sobre el tenant activo).
 * - NO usa TenantContext — accede directamente al master client del PrismaService.
 * - PrismaService es inyectado desde SharedModule (@Global) sin violación de la
 *   fitness rule, porque este archivo está dentro de `infrastructure/`.
 *
 * Dos métodos con semántica distinta:
 * - existeEnTenant(): verifica deleted_at IS NULL + pertenece al tenant.
 *   Usado para solicitantes (pueden estar inactivos).
 * - estaActivoEnTenant(): verifica activo=TRUE + deleted_at IS NULL + pertenece al tenant.
 *   Usado para asignados (deben poder recibir nuevas asignaciones).
 *
 * Ref spec: [SPEC:tickets-core/Validación soft refs cross-DB]
 * Tarea: 3.D.2
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IUsuarioMasterChecker } from '../../../domain/ports/i-usuario-master.checker';

@Injectable()
export class UsuarioMasterChecker implements IUsuarioMasterChecker {
  constructor(private readonly prismaService: PrismaService) {}

  private get masterClient() {
    return this.prismaService.getMasterClient();
  }

  /**
   * Verifica que el usuario existe en master.usuarios con deleted_at IS NULL
   * y pertenece al tenant indicado (cliente_id = clienteId).
   *
   * Nota: NO verifica `activo`. Un solicitante puede estar inactivo y aun
   * así ser válido como referencia histórica del ticket.
   */
  async existeEnTenant(usuarioId: string, clienteId: string): Promise<boolean> {
    const row = await this.masterClient.usuario.findFirst({
      where: {
        id: usuarioId,
        clienteId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Verifica que el usuario existe en master.usuarios con activo=TRUE,
   * deleted_at IS NULL, y pertenece al tenant indicado.
   *
   * Usado para asignados: un usuario inactivo no puede recibir nuevas
   * asignaciones aunque exista en el sistema.
   */
  async estaActivoEnTenant(usuarioId: string, clienteId: string): Promise<boolean> {
    const row = await this.masterClient.usuario.findFirst({
      where: {
        id: usuarioId,
        clienteId,
        activo: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    return row !== null;
  }
}
