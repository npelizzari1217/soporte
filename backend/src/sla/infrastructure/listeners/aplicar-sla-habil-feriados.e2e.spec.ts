/**
 * aplicar-sla-habil-feriados.e2e.spec.ts — e2e real (tarea 5.6, WU5c,
 * sdd/feriados-configurables) de `AplicarSlaListener` → `AplicarSlaUseCase` →
 * `CalcularSlaHabilVenceService` sobre Postgres REAL, contra DOS tenants
 * efímeros (A y B), probando la union global ∪ feriados propios (D3) que
 * WU5a/WU5b ya cablearon en `PrismaFeriadosLaboralesRepository`.
 *
 * Wiring MANUAL de clases de producción (no `Test.createTestingModule`):
 * ningún controller ni JWT entra en juego acá — el camino real bajo prueba
 * es `AplicarSlaListener.onTicketCreado/onTicketReprioritizado`, no HTTP. El
 * mismo patrón liviano que `prisma-sla-ticket.integration.spec.ts` (repos
 * `new`-eados contra Prisma real) evita compilar `SlaModule` completo
 * (`TicketsModule` + `AuthModule` + `CalendarioLaboralModule`) solo para
 * resolver 9 providers ya conocidos — se queda dentro del presupuesto de
 * 400 líneas sin perder realismo: mismas clases, mismo Postgres, mismo
 * cálculo de dominio.
 *
 * El calendario semanal (L-V 09:00-18:00 ART, fin de semana cerrado) es el
 * default por cliente que trae solo cada tenant provisionado: lo siembra la
 * migración de tenant `20260928150000_calendario_laboral_dias_cliente`
 * (sdd/horario-laboral-por-cliente, `calendario-laboral-dias-cliente-check.integration.spec.ts`),
 * que corre automático vía `TenantMigrationRunnerAdapter.run()` — no hace
 * falta sembrarlo acá. Antes vivía en MASTER, migración
 * `20260830210000_add_calendario_laboral` (hoy deprecada, D12).
 *
 * Fechas 2031 (fuera del rango 2026-2028 sembrado por migración) para todo lo
 * propio del tenant; el feriado GLOBAL usa una fila 2031 insertada y borrada
 * por este spec (no depende de qué fecha global venga sembrada).
 *
 * Higiene (soporte/CLAUDE.md): NUNCA trunca `feriados` (master, compartida) —
 * borra solo su propia fila en `afterAll`. `usarLockMasterTest()` por tocar
 * `feriados` (master, sigue siendo global). Orden:
 * limpiar filas propias → `app` no existe acá (sin HTTP) →
 * `prismaService.onModuleDestroy()` → `dropDatabase` de A y B.
 *
 * WU-9 (fix W4, verify-report.md): además del feriado propio de A
 * (`FECHA_A`), A también tiene un feriado propio EN LA MISMA FECHA que el
 * global (`FECHA_GLOBAL`) — inserción raw en `feriadoCliente` (el caso de uso
 * de creación lo rechazaría: mismo día que un feriado global). Antes de
 * WU-9, la deduplicación de "la misma fecha existe en global Y en el
 * cliente" solo tenía cobertura con mocks
 * (`prisma-feriados-laborales.repository.spec.ts`) — este e2e usaba fechas
 * siempre distintas entre global y cliente.
 *
 * Ref spec: sdd/feriados-configurables specs/feriados-cliente/spec.md,
 * requirement "SLA HABIL skips global and the ticket's own client holidays
 * only" (las 4 escenarios). Ref design: Testing Strategy (fila E2E). Tarea: 5.6.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

import { PrismaTicketRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaEstadoRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaPrioridadRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-prioridad.repository';
import { PrismaTipoTicketRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-tipo-ticket.repository';

import { PrismaSlaTicketWriteRepository } from '../persistence/prisma/prisma-sla-ticket-write.repository';
import { CalcularSlaVenceService } from '../../domain/services/calcular-sla-vence.service';
import { AplicarSlaUseCase } from '../../application/use-cases/aplicar-sla.use-case';
import { AplicarSlaListener } from './aplicar-sla.listener';

import { PrismaCalendarioLaboralSemanalRepository } from '../../../calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral-semanal.repository';
import { PrismaFeriadosLaboralesRepository } from '../../../calendario-laboral/infrastructure/persistence/prisma/prisma-feriados-laborales.repository';
import { CalcularSlaHabilVenceService } from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';

import { TicketCreadoEvent } from '../../../tickets/domain/events/ticket-creado.event';
import { TicketReprioritizadoEvent } from '../../../tickets/domain/events/ticket-reprioritizado.event';
import type { ILogger } from '../../../shared/domain/ports/i-logger.port';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SUFIJO = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_slaHabilA_${SUFIJO}_test`;
const DB_B = `soporte_prov_slaHabilB_${SUFIJO}_test`;

/** Feriado GLOBAL propio de este spec — sembrado y borrado acá, 2031 fuera del rango de migración. */
const FECHA_GLOBAL = new Date('2031-04-08T00:00:00.000Z'); // martes
const FECHA_A = new Date('2031-04-09T00:00:00.000Z'); // miércoles, feriado propio de A
const FECHA_B = new Date('2031-04-10T00:00:00.000Z'); // jueves, feriado propio de B (nunca de A)
const FECHA_A_TARDIA = new Date('2031-04-16T00:00:00.000Z'); // agregado DESPUÉS de que el ticket ya está abierto

/** Lunes 2031-04-07, 09:00 ART = 12:00 UTC — ancla de creación del ticket (ventana abre exacto). */
const CREADO_EN = new Date('2031-04-07T12:00:00.000Z');

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('SLA HABIL e2e — union global ∪ feriados del cliente (WU5c, tarea 5.6)', () => {
  const admin = new PostgresAdminService(MASTER_URL);
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantContext: TenantContext;
  let aplicarSlaListener: AplicarSlaListener;

  let tenantAClient: ReturnType<PrismaService['getTenantClient']>;
  let tipoId: string;
  let estadoId: string;
  let prioridad1Id: string; // 27h — case 1/2 (create)
  let prioridad2Id: string; // 36h — case 3 (reprioritize)
  let ticketId: string;

  const logger: ILogger = { log: () => undefined, error: () => undefined };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_URL;
    }

    await admin.createDatabase(DB_A);
    await admin.createDatabase(DB_B);
    await new TenantMigrationRunnerAdapter(MASTER_URL).run(DB_A);
    await new TenantMigrationRunnerAdapter(MASTER_URL).run(DB_B);

    prismaService = new PrismaService(MASTER_URL);
    masterClient = prismaService.getMasterClient();
    tenantContext = new TenantContext();
    tenantAClient = prismaService.getTenantClient(DB_A);
    const tenantBClient = prismaService.getTenantClient(DB_B);

    await masterClient.feriado.create({
      data: { fecha: FECHA_GLOBAL, descripcion: 'Global SLA-habil e2e' },
    });
    await tenantAClient.feriadoCliente.create({
      data: { fecha: FECHA_A, descripcion: 'Propio de A' },
    });
    // WU-9 (fix W4): la MISMA fecha que el feriado global, también como
    // feriado propio de A — el use case de creación la rechazaría (mismo
    // día que un feriado global), así que va por INSERT raw, igual que las
    // otras filas de este `beforeAll`.
    await tenantAClient.feriadoCliente.create({
      data: { fecha: FECHA_GLOBAL, descripcion: 'Propio de A, MISMA fecha que el global (fix W4)' },
    });
    await tenantBClient.feriadoCliente.create({
      data: { fecha: FECHA_B, descripcion: 'Propio de B — nunca debe afectar a A' },
    });

    const tipo = await tenantAClient.tipoTicket.create({
      data: {
        codigo: 'SLAHABIL_TIPO',
        nombre: 'Fixture SLA hábil',
        activo: true,
        modulo: 'SOPORTE',
      },
    });
    tipoId = tipo.id;
    const estado = await tenantAClient.estado.create({
      data: { codigo: 'SLAHABIL_NUEVO', nombre: 'Nuevo fixture', orden: 10, activo: true },
    });
    estadoId = estado.id;
    const prioridad1 = await tenantAClient.prioridad.create({
      data: {
        codigo: 'SLAHABIL_P27',
        nombre: '27h fixture',
        orden: 1,
        slaHoras: 27,
        slaActivo: true,
      },
    });
    prioridad1Id = prioridad1.id;
    const prioridad2 = await tenantAClient.prioridad.create({
      data: {
        codigo: 'SLAHABIL_P36',
        nombre: '36h fixture',
        orden: 2,
        slaHoras: 36,
        slaActivo: true,
      },
    });
    prioridad2Id = prioridad2.id;

    const ticket = await tenantAClient.ticket.create({
      data: {
        numero: 'SLAHABIL-0001',
        titulo: 'Ticket HABIL — union de feriados',
        tipoId,
        estadoId,
        prioridadId: prioridad1Id,
        solicitanteId: randomUUID(),
        createdAt: CREADO_EN,
      },
    });
    ticketId = ticket.id;

    // Mismas clases de producción que `SlaModule`/`CalendarioLaboralModule`
    // cablean vía DI (sla.module.ts:100-159) — instanciadas a mano contra el
    // mismo `tenantContext`, sin compilar el árbol completo de módulos Nest.
    const useCase = new AplicarSlaUseCase(
      new PrismaPrioridadRepository(tenantContext),
      new PrismaSlaTicketWriteRepository(tenantContext),
      new PrismaTicketRepository(tenantContext),
      new PrismaEstadoRepository(tenantContext),
      new CalcularSlaVenceService(),
      new PrismaTipoTicketRepository(tenantContext),
      new CalcularSlaHabilVenceService(),
      new PrismaCalendarioLaboralSemanalRepository(tenantContext),
      new PrismaFeriadosLaboralesRepository(prismaService, tenantContext),
    );
    aplicarSlaListener = new AplicarSlaListener(useCase, logger);
  }, 90_000);

  afterAll(async () => {
    await masterClient.feriado.delete({ where: { fecha: FECHA_GLOBAL } }).catch(() => undefined);
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB_A);
    await admin.dropDatabase(DB_B);
  }, 60_000);

  async function slaVenceAtActual(): Promise<Date | null> {
    const fila = await tenantAClient.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    return fila.slaVenceAt;
  }

  it('[CRITICAL] crea con union global+propio, no toca el de otro cliente, repriorización recalcula la union, y un feriado agregado después no mueve el vencimiento ya fijado', async () => {
    // Escenario 1+2 ("Due date skips global and own-client holidays" / "Due
    // date never skips another client's holiday"): 27h desde el lunes
    // 09:00 ART saltan el martes (global) y el miércoles (propio de A), NO
    // el jueves (propio de B) — consume lun 9h + jue 9h + vie 9h = 27h,
    // vence viernes 18:00 ART = 21:00 UTC. El martes aparece en ambas
    // fuentes (global Y feriado propio de A, fix W4): esta aserción verifica
    // que una fecha presente en ambas se resuelve a exactamente un día saltado.
    await tenantContext.run(
      { prismaClient: tenantAClient, dbName: DB_A, clienteId: 'sla-habil-e2e-A' },
      () =>
        aplicarSlaListener.onTicketCreado(
          new TicketCreadoEvent({ ticketId, prioridadId: prioridad1Id }),
        ),
    );
    expect((await slaVenceAtActual())?.toISOString()).toBe('2031-04-11T21:00:00.000Z');

    // Escenario 3 ("Reprioritization applies the same union"): repriorizado a
    // 36h desde el MISMO createdAt (ancla fija) — misma union (salta martes
    // global + miércoles de A, cuenta jueves de B), consume lun 9h + jue 9h +
    // vie 9h + (fin de semana cerrado) + lun-siguiente 9h = 36h, vence el
    // lunes 14/04 18:00 ART = 21:00 UTC.
    await tenantAClient.ticket.update({
      where: { id: ticketId },
      data: { prioridadId: prioridad2Id },
    });
    await tenantContext.run(
      { prismaClient: tenantAClient, dbName: DB_A, clienteId: 'sla-habil-e2e-A' },
      () =>
        aplicarSlaListener.onTicketReprioritizado(
          new TicketReprioritizadoEvent({ ticketId, prioridadId: prioridad2Id }),
        ),
    );
    const venceTrasRepriorizar = await slaVenceAtActual();
    expect(venceTrasRepriorizar?.toISOString()).toBe('2031-04-14T21:00:00.000Z');

    // Escenario 4 ("Already-open tickets are not recalculated"): agregar un
    // feriado nuevo de A DESPUÉS de que el ticket ya tiene `sla_vence_at`
    // fijado no lo recalcula — nada dispara `AplicarSlaUseCase` al crear un
    // feriado.
    await tenantAClient.feriadoCliente.create({
      data: { fecha: FECHA_A_TARDIA, descripcion: 'Agregado después de abierto el ticket' },
    });
    expect((await slaVenceAtActual())?.toISOString()).toBe(venceTrasRepriorizar?.toISOString());
  });
});
