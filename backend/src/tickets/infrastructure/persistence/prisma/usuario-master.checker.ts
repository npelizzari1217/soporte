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
 * `getAutorizacionModulos`/`listarTecnicosAsignables` (elegibilidad del
 * ASIGNADO) leen la matriz `usuario_cliente_permisos`, no
 * `usuario_cliente_modulos` (R9, WU-7.5, sdd/matriz-permisos-por-usuario) —
 * resuelven los módulos de OTRO usuario (el destinatario de una asignación),
 * fuera del alcance de `resolverScope` (que solo cubre el eje del ACTOR).
 *
 * Ref design: ADR-8. Ref spec: T14, T15; sdd/matriz-permisos-por-usuario/spec R9.
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
   * cliente) → `esAdminTotal = true`. El resto → `modulos` con AL MENOS UNA
   * acción otorgada en la matriz `usuario_cliente_permisos` (R9, WU-7.5 —
   * migrado de `usuario_cliente_modulos`; mismo umbral que `resolverScope`
   * usa para derivar `modulos` del actor: no se exige una acción específica,
   * `LECTURA` sola ya alcanza, porque todo módulo la declara).
   *
   * `esAdminTotal` NO cambió: sigue sin leer ninguna tabla de módulos, solo
   * `usuario.isGlobalAdmin` y la membresía con rol `ADMINISTRADOR`.
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

    const rows = await this.masterClient.usuarioClientePermiso.findMany({
      where: { usuarioId, clienteId },
      select: { modulo: true },
      distinct: ['modulo'],
    });
    return { esAdminTotal: false, modulos: rows.map((r) => r.modulo) };
  }

  /**
   * Técnicos elegibles por módulo en un cliente. Dos consultas (no N+1):
   * `usuario_cliente_permisos` NO tiene `@relation` a `Usuario` (soft ref
   * cross-DB), así que no se puede filtrar el módulo con un `some` anidado en
   * `usuario.findMany`. Se resuelven primero los `usuarioId` con AL MENOS UNA
   * acción otorgada en el módulo pedido (R9, WU-7.5 — migrado de
   * `usuario_cliente_modulos`, `distinct` evita duplicados cuando el usuario
   * tiene varias acciones del mismo módulo) y luego se intersecan con los
   * técnicos activos que tienen membresía ACTIVA con rol TECNICO en ese
   * cliente.
   *
   * Con `modulo === null` (tipo custom sin módulo) no hay elegibles por
   * catálogo → se retorna `[]` sin golpear la DB.
   */
  async listarTecnicosAsignables(
    clienteId: string,
    modulo: string | null,
  ): Promise<{ id: string; nombre: string; apellido: string }[]> {
    if (modulo === null) {
      return [];
    }

    const conModulo = await this.masterClient.usuarioClientePermiso.findMany({
      where: { clienteId, modulo },
      select: { usuarioId: true },
      distinct: ['usuarioId'],
    });
    const idsConModulo = conModulo.map((r) => r.usuarioId);
    if (idsConModulo.length === 0) {
      return [];
    }

    const rows = await this.masterClient.usuario.findMany({
      where: {
        id: { in: idsConModulo },
        activo: true,
        deletedAt: null,
        membresias: {
          some: { clienteId, activo: true, deletedAt: null, rol: { codigo: 'TECNICO' } },
        },
      },
      select: { id: true, nombre: true, apellido: true },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    });
    return rows.map((r) => ({ id: r.id, nombre: r.nombre, apellido: r.apellido }));
  }
}
