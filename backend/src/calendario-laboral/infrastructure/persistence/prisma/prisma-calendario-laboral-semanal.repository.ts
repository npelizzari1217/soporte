/**
 * PrismaCalendarioLaboralSemanalRepository — implementación del puerto
 * ICalendarioLaboralSemanalRepository sobre el `PrismaClient` del TENANT
 * activo (sdd/horario-laboral-por-cliente, WU-3). El horario laboral ya NO
 * es global: cada cliente tiene el suyo, en `calendario_laboral_dias_cliente`
 * dentro de su propia base de inquilino.
 *
 * Fail-closed (D4): sin un `TenantContext` bindeado no hay forma segura de
 * saber de qué cliente leer el horario — devolver un default en silencio
 * calcularía un vencimiento de SLA con un horario que el cliente no eligió.
 * Mismo criterio que `FeriadosSinTenantContextError`
 * (`prisma-feriados-laborales.repository.ts:39-48,61-65`).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ICalendarioLaboralSemanalRepository } from '../../../domain/ports/i-calendario-laboral-semanal.repository';
import { IHorarioLaboralEscrituraRepository } from '../../../domain/ports/i-horario-laboral-escritura.repository';
import { CalendarioLaboralSemanal } from '../../../domain/services/calcular-sla-habil-vence.service';
import { HorarioLaboralSemanal } from '../../../domain/value-objects/horario-laboral-semanal';
import { PrismaCalendarioLaboralMapper } from './prisma-calendario-laboral.mapper';

/**
 * CalendarioLaboralSinTenantContextError — lanzada por `obtener()` cuando
 * corre sin un `TenantContext` bindeado. No es un `DomainError`: es un error
 * de infraestructura/wiring, y se modela como excepción, no como
 * `Result.fail` (mismo criterio que `FeriadosSinTenantContextError`).
 */
export class CalendarioLaboralSinTenantContextError extends Error {
  constructor() {
    super(
      'PrismaCalendarioLaboralSemanalRepository.obtener() requiere un TenantContext bindeado: ' +
        'no hay forma segura de leer el horario laboral sin conocer el cliente del ticket.',
    );
    this.name = 'CalendarioLaboralSinTenantContextError';
  }
}

@Injectable()
export class PrismaCalendarioLaboralSemanalRepository
  implements ICalendarioLaboralSemanalRepository, IHorarioLaboralEscrituraRepository
{
  constructor(private readonly tenantContext: TenantContext) {}

  async obtener(): Promise<CalendarioLaboralSemanal> {
    const ctx = this.tenantContext.get();
    if (!ctx) {
      throw new CalendarioLaboralSinTenantContextError();
    }
    const tenantClient = ctx.prismaClient as InstanceType<typeof TenantPrismaClient>;
    const filas = await tenantClient.calendarioLaboralDiaCliente.findMany();
    return PrismaCalendarioLaboralMapper.toCalendarioSemanal(filas);
  }

  /**
   * Reemplaza las 7 filas del horario laboral del tenant activo (WU-5, D6).
   *
   * Los 7 `upsert` son SECUENCIALES (`for … await`), en orden `diaSemana`
   * 0→6 ascendente — NUNCA `Promise.all`: así dos `PUT` concurrentes toman
   * los locks de fila en el mismo orden y no pueden deadlockear entre sí.
   * Sin control de versión optimista: gana el último payload que commitea
   * (D6, `design.md`).
   */
  async reemplazar(horario: HorarioLaboralSemanal): Promise<void> {
    const ctx = this.tenantContext.get();
    if (!ctx) {
      throw new CalendarioLaboralSinTenantContextError();
    }
    const tenantClient = ctx.prismaClient as InstanceType<typeof TenantPrismaClient>;
    const dias = horario.aCalendario();

    for (let diaSemana = 0; diaSemana < dias.length; diaSemana++) {
      const { aperturaMinuto, cierreMinuto } = dias[diaSemana];
      // Secuencial a propósito (D6): nunca Promise.all.
      await tenantClient.calendarioLaboralDiaCliente.upsert({
        where: { diaSemana },
        create: { diaSemana, aperturaMinuto, cierreMinuto },
        update: { aperturaMinuto, cierreMinuto },
      });
    }
  }
}
