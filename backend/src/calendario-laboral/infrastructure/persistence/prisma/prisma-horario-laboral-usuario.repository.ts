/**
 * PrismaHorarioLaboralUsuarioRepository — implementación de
 * `IHorarioLaboralUsuarioRepository` sobre `horario_laboral_usuario`, en la
 * base del tenant activo (odd/tasks/tiempo-tecnico.md, T1).
 *
 * Toma el cliente de `TenantContext` en cada llamada: dentro de un
 * `ITenantTransactionRunner.run()` es el cliente transaccional, así que
 * `reemplazar` participa de la transacción del caso de uso.
 *
 * Fail-closed sin `TenantContext`, mismo criterio que
 * `PrismaCalendarioLaboralSemanalRepository`: sin tenant no hay forma segura
 * de saber de qué base leer.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IHorarioLaboralUsuarioRepository } from '../../../domain/ports/i-horario-laboral-usuario.repository';
import { CalendarioLaboralSemanal } from '../../../domain/services/calcular-sla-habil-vence.service';
import { HorarioLaboralSemanal } from '../../../domain/value-objects/horario-laboral-semanal';
import { PrismaCalendarioLaboralMapper } from './prisma-calendario-laboral.mapper';

/**
 * Error de wiring, no de dominio: el repositorio corrió sin un
 * `TenantContext` bindeado. Mismo criterio que
 * `CalendarioLaboralSinTenantContextError`.
 */
export class HorarioLaboralUsuarioSinTenantContextError extends Error {
  constructor() {
    super(
      'PrismaHorarioLaboralUsuarioRepository requiere un TenantContext bindeado: ' +
        'no hay forma segura de leer o escribir el horario de un usuario sin conocer el cliente.',
    );
    this.name = 'HorarioLaboralUsuarioSinTenantContextError';
  }
}

@Injectable()
export class PrismaHorarioLaboralUsuarioRepository implements IHorarioLaboralUsuarioRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get cliente(): InstanceType<typeof TenantPrismaClient> {
    const ctx = this.tenantContext.get();
    if (!ctx) {
      throw new HorarioLaboralUsuarioSinTenantContextError();
    }
    return ctx.prismaClient as InstanceType<typeof TenantPrismaClient>;
  }

  async obtener(usuarioId: string): Promise<CalendarioLaboralSemanal | null> {
    const filas = await this.cliente.horarioLaboralUsuarioDia.findMany({ where: { usuarioId } });
    if (filas.length === 0) {
      return null;
    }
    return PrismaCalendarioLaboralMapper.toCalendarioSemanal(
      filas,
      `horario_laboral_usuario (usuario ${usuarioId})`,
    );
  }

  /**
   * Siete `upsert` secuenciales en orden `diaSemana` 0→6 — nunca
   * `Promise.all` —, mismo criterio que
   * `PrismaCalendarioLaboralSemanalRepository.reemplazar`: dos `PUT`
   * concurrentes sobre el mismo usuario toman los locks en el mismo orden.
   */
  async reemplazar(usuarioId: string, horario: HorarioLaboralSemanal): Promise<void> {
    const cliente = this.cliente;
    const dias = horario.aCalendario();

    for (let diaSemana = 0; diaSemana < dias.length; diaSemana++) {
      const { aperturaMinuto, cierreMinuto } = dias[diaSemana];
      await cliente.horarioLaboralUsuarioDia.upsert({
        where: { usuarioId_diaSemana: { usuarioId, diaSemana } },
        create: { usuarioId, diaSemana, aperturaMinuto, cierreMinuto },
        update: { aperturaMinuto, cierreMinuto },
      });
    }
  }

  async borrar(usuarioId: string): Promise<void> {
    await this.cliente.horarioLaboralUsuarioDia.deleteMany({ where: { usuarioId } });
  }
}
