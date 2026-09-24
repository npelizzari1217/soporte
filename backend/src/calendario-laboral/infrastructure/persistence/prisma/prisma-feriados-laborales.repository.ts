/**
 * PrismaFeriadosLaboralesRepository — implementación del puerto
 * IFeriadosLaboralesRepository. Devuelve la UNIÓN de los feriados globales
 * (MASTER, tabla `feriado`) y los feriados propios del cliente del
 * `TenantContext` activo (tenant, tabla `feriado_cliente` — WU3/WU4, sdd/
 * feriados-configurables). Antes de WU5b leía solo MASTER; ver H3 en
 * design.md — los comentarios "global-only" de este módulo quedaron
 * desactualizados por ese cambio y se corrigen en esta misma tarea (5.5).
 *
 * Fail-closed (D3): sin un `TenantContext` bindeado no hay forma de saber
 * cuáles son los feriados PROPIOS del ticket — devolver solo los globales
 * en ese caso sería un resultado incompleto servido en silencio. El único
 * consumidor de este puerto (`AplicarSlaUseCase`) siempre corre dentro de un
 * `TenantContext` bindeado por `AplicarSlaListener` (ADR-P8), así que un
 * contexto ausente es un bug de wiring, no un caso de negocio esperado —
 * por eso se LANZA (`FeriadosSinTenantContextError`), nunca `Result.fail()`
 * (`error-handling` skill: throw en el borde de infraestructura).
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { IFeriadosLaboralesRepository } from '../../../domain/ports/i-feriados-laborales.repository';
import { FeriadosLaborales } from '../../../domain/services/calcular-sla-habil-vence.service';
import { PrismaCalendarioLaboralMapper } from './prisma-calendario-laboral.mapper';

/**
 * FeriadosSinTenantContextError — lanzada por `obtener()` cuando corre sin
 * un `TenantContext` bindeado (D3). No es un `DomainError`: es un error de
 * infraestructura/wiring, y se modela como excepción, no como `Result.fail`
 * (mismo criterio que `ErrorEntornoInvalido`, `config/validar-entorno.ts`).
 * `AplicarSlaListener` la captura, la loguea vía `ILogger` y NO la relanza
 * (D10) — el ticket ya committeado no se revierte, pero el fallo queda
 * registrado en vez de perderse en silencio.
 */
export class FeriadosSinTenantContextError extends Error {
  constructor() {
    super(
      'PrismaFeriadosLaboralesRepository.obtener() requiere un TenantContext bindeado: ' +
        'no hay forma segura de calcular el SLA HABIL sin conocer los feriados propios ' +
        'del cliente del ticket.',
    );
    this.name = 'FeriadosSinTenantContextError';
  }
}

@Injectable()
export class PrismaFeriadosLaboralesRepository implements IFeriadosLaboralesRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private get masterClient(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async obtener(): Promise<FeriadosLaborales> {
    const ctx = this.tenantContext.get();
    if (!ctx) {
      throw new FeriadosSinTenantContextError();
    }
    const tenantClient = ctx.prismaClient as InstanceType<typeof TenantPrismaClient>;

    const [globales, propios] = await Promise.all([
      this.masterClient.feriado.findMany(),
      tenantClient.feriadoCliente.findMany(),
    ]);

    const claves = new Set<string>();
    for (const fila of globales) {
      claves.add(PrismaCalendarioLaboralMapper.claveDiaUtcDe(fila.fecha));
    }
    for (const fila of propios) {
      claves.add(PrismaCalendarioLaboralMapper.claveDiaUtcDe(fila.fecha));
    }
    return claves;
  }
}
