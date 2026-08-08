import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IUsuarioMasterChecker } from '../../../domain/ports/i-usuario-master.checker';

/**
 * UsuarioMasterChecker — implementación del puerto IUsuarioMasterChecker.
 *
 * Valida la existencia y elegibilidad de usuarios cross-DB consultando
 * `master.usuarios` + `master.membresias` vía MasterPrismaClient
 * (PrismaService). Opera SIEMPRE sobre la DB MASTER — NO usa TenantContext.
 *
 * El schema real (Fase 1) modela la pertenencia usuario↔cliente como N:N vía
 * `Membresia` (sin columna `usuarios.cliente_id`) — "pertenece al tenant" se
 * resuelve con un JOIN a `membresias` filtrado por `clienteId` (ver JSDoc del
 * puerto para el detalle de la adaptación al schema real).
 *
 * Ref design: ADR-8. Ref spec: T14, T15.
 */
@Injectable()
export class UsuarioMasterChecker implements IUsuarioMasterChecker {
  constructor(private readonly prismaService: PrismaService) {}

  private get masterClient() {
    return this.prismaService.getMasterClient();
  }

  /**
   * Usuario no soft-deleted + membresía (no soft-deleted) en el cliente
   * indicado. NO filtra por `activo` (ni de usuario ni de membresía) — un
   * solicitante puede estar inactivo y seguir siendo una referencia válida.
   */
  async existeEnTenant(usuarioId: string, clienteId: string): Promise<boolean> {
    // El ROOT (is_global_admin) opera en CUALQUIER tenant sin membresía propia,
    // por lo que es un solicitante válido en cualquier cliente. Para el resto,
    // se exige una membresía viva en el cliente indicado.
    const row = await this.masterClient.usuario.findFirst({
      where: {
        id: usuarioId,
        deletedAt: null,
        OR: [{ isGlobalAdmin: true }, { membresias: { some: { clienteId, deletedAt: null } } }],
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Usuario activo + no soft-deleted, con una membresía ACTIVA (y no
   * soft-deleted) en el cliente indicado. Usado para asignados: ni el
   * usuario ni su membresía en el tenant pueden estar desactivados.
   */
  async estaActivoEnTenant(usuarioId: string, clienteId: string): Promise<boolean> {
    // El ROOT (is_global_admin) activo es elegible en cualquier tenant sin
    // membresía. Para el resto, se exige membresía ACTIVA en el cliente.
    const row = await this.masterClient.usuario.findFirst({
      where: {
        id: usuarioId,
        activo: true,
        deletedAt: null,
        OR: [
          { isGlobalAdmin: true },
          { membresias: { some: { clienteId, activo: true, deletedAt: null } } },
        ],
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Batch, sin N+1: un único `findMany` con `id IN (...)`. Ver JSDoc del
   * puerto para la decisión de NO filtrar por `clienteId` acá.
   */
  async resolverNombres(
    usuarioIds: string[],
  ): Promise<Map<string, { nombre: string; apellido: string }>> {
    if (usuarioIds.length === 0) {
      return new Map();
    }
    const rows = await this.masterClient.usuario.findMany({
      where: { id: { in: usuarioIds } },
      select: { id: true, nombre: true, apellido: true },
    });
    return new Map(rows.map((row) => [row.id, { nombre: row.nombre, apellido: row.apellido }]));
  }

  /**
   * ROOT o ADMINISTRADOR (membresía activa con rol `ADMINISTRADOR` en el
   * cliente) → `esAdminTotal = true`. El resto → `modulos` asignados en
   * `usuario_cliente_modulos`. Mismo criterio de "ve todo" que `resolverScope`.
   */
  async getAutorizacionModulos(
    usuarioId: string,
    clienteId: string,
  ): Promise<{ esAdminTotal: boolean; modulos: string[] }> {
    const usuario = await this.masterClient.usuario.findFirst({
      where: { id: usuarioId, deletedAt: null },
      select: { isGlobalAdmin: true },
    });

    const esAdmin =
      (await this.masterClient.membresia.findFirst({
        where: {
          usuarioId,
          clienteId,
          activo: true,
          deletedAt: null,
          rol: { codigo: 'ADMINISTRADOR' },
        },
        select: { id: true },
      })) !== null;

    if (usuario?.isGlobalAdmin || esAdmin) {
      return { esAdminTotal: true, modulos: [] };
    }

    const rows = await this.masterClient.usuarioClienteModulo.findMany({
      where: { usuarioId, clienteId },
      select: { modulo: true },
    });
    return { esAdminTotal: false, modulos: rows.map((r) => r.modulo) };
  }
}
