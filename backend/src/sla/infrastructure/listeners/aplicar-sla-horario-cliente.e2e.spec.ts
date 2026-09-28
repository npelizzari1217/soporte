/**
 * aplicar-sla-horario-cliente.e2e.spec.ts — e2e real (WU-4,
 * sdd/horario-laboral-por-cliente) de `AplicarSlaListener` →
 * `AplicarSlaUseCase` → `CalcularSlaHabilVenceService`, sobre Postgres REAL,
 * contra DOS tenants efímeros (A y B), probando que el horario laboral por
 * cliente (WU-1/WU-3) gobierna el vencimiento HABIL sin recalcular tickets
 * ya abiertos.
 *
 * Wiring MANUAL de clases de producción (no `Test.createTestingModule`),
 * mismo patrón liviano que `aplicar-sla-habil-feriados.e2e.spec.ts`
 * (sdd/feriados-configurables): el camino real bajo prueba es
 * `AplicarSlaListener.onTicketCreado/onTicketReprioritizado`, no HTTP.
 *
 * WU-9 (fix W2, verify-report.md): el cambio de horario de A pasa por
 * `GuardarHorarioLaboralUseCase` REAL, cableado a mano con
 * `PrismaCalendarioLaboralSemanalRepository` (lectura Y escritura, WU-3/WU-5)
 * y `PrismaTenantTransactionRunner` (transacción de tenant real, D6). Antes
 * de WU-9 el cambio se escribía DIRECTO contra `calendarioLaboralDiaCliente`
 * (Prisma), sin pasar por ningún caso de uso — eso dejaba a la escena "guardar
 * el horario no recalcula el SLA de tickets abiertos" sin cobertura real del
 * camino de guardado: una mutación que hiciera recalcular o tocar tickets
 * abiertos DESDE el use case podía sobrevivir sin que este spec la detectara.
 *

 * Fechas 2031 para no depender de qué feriado venga sembrado por la
 * migración (rango 2026-2028). Ancla fija de creación: lunes 2031-04-07
 * 12:00 UTC (09:00 ART), la MISMA para las 4 cuentas de tickets — así A
 * (horario nuevo) y B (default, sin tocar) son directamente comparables, y
 * el spec no depende de `Date.now()` en ningún momento.
 *
 * `usarLockMasterTest()` es OBLIGATORIO acá aunque este spec no escribe en
 * `feriados` (master): `aplicar-sla-habil-feriados.e2e.spec.ts` inserta y
 * borra un feriado GLOBAL temporal el 2031-04-08 (martes), que cae DENTRO de
 * la ventana repriorizada de este spec (lunes 07 a miércoles 09). Sin el
 * lock, correr ambos specs en paralelo podría filtrar ese feriado temporal
 * hacia este cálculo y volverlo no determinístico.
 *
 * Higiene: este spec no siembra ninguna fila en master, así que no hay filas
 * propias que limpiar antes de cerrar. Orden: `prismaService.onModuleDestroy()`
 * → `dropDatabase` de A y B (sin HTTP, sin `app` — mismo criterio que el
 * spec hermano).
 *
 * Ref spec: openspec/changes/horario-laboral-por-cliente/specs/horario-laboral-cliente/spec.md,
 * requirements "Guardar el horario no recalcula el SLA de tickets abiertos" y
 * "Aislamiento por cliente". Ref design: fila E2E SLA de "Estrategia de
 * testing". Tarea: 4.1-4.4 (WU-4).
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
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
import { GuardarHorarioLaboralUseCase } from '../../../calendario-laboral/application/use-cases/guardar-horario-laboral.use-case';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';

import { TicketCreadoEvent } from '../../../tickets/domain/events/ticket-creado.event';
import { TicketReprioritizadoEvent } from '../../../tickets/domain/events/ticket-reprioritizado.event';
import type { ILogger } from '../../../shared/domain/ports/i-logger.port';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SUFIJO = randomBytes(4).toString('hex');
const DB_A = `soporte_horarioCliA_${SUFIJO}_test`;
const DB_B = `soporte_horarioCliB_${SUFIJO}_test`;

/** Lunes 2031-04-07, 09:00 ART = 12:00 UTC — ancla fija para las 4 cuentas de tickets. */
const CREADO_EN = new Date('2031-04-07T12:00:00.000Z');

// Turno exclusivo sobre la master de test compartida — ver JSDoc del archivo.
usarLockMasterTest();

describe('SLA HABIL e2e — horario laboral por cliente gobierna el vencimiento (WU-4, sdd/horario-laboral-por-cliente)', () => {
  const admin = new PostgresAdminService(MASTER_URL);
  let prismaService: PrismaService;
  let tenantContext: TenantContext;
  let aplicarSlaListener: AplicarSlaListener;

  let guardarHorarioUseCase: GuardarHorarioLaboralUseCase;

  let tenantAClient: ReturnType<PrismaService['getTenantClient']>;
  let tenantBClient: ReturnType<PrismaService['getTenantClient']>;

  let tipoAId: string;
  let estadoAId: string;
  let tipoBId: string;
  let estadoBId: string;
  let prioridadCreacionAId: string; // 8h — creación en A, todavía con el default
  let prioridadReprioAId: string; // 8h — repriorización en A, ya con el horario nuevo
  let prioridadBId: string; // 8h — creación en B, default sin tocar (aislamiento)

  const logger: ILogger = { log: () => undefined, error: () => undefined };

  async function slaVenceAtDe(
    client: ReturnType<PrismaService['getTenantClient']>,
    ticketId: string,
  ): Promise<Date | null> {
    const fila = await client.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    return fila.slaVenceAt;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_URL;
    }

    await admin.createDatabase(DB_A);
    await admin.createDatabase(DB_B);
    await new TenantMigrationRunnerAdapter(MASTER_URL).run(DB_A);
    await new TenantMigrationRunnerAdapter(MASTER_URL).run(DB_B);

    prismaService = new PrismaService(MASTER_URL);
    tenantContext = new TenantContext();
    tenantAClient = prismaService.getTenantClient(DB_A);
    tenantBClient = prismaService.getTenantClient(DB_B);

    const tipoA = await tenantAClient.tipoTicket.create({
      data: {
        codigo: 'HORCLI_TIPO_A',
        nombre: 'Fixture horario cliente A',
        activo: true,
        modulo: 'SOPORTE',
      },
    });
    tipoAId = tipoA.id;
    const estadoA = await tenantAClient.estado.create({
      data: { codigo: 'HORCLI_NUEVO_A', nombre: 'Nuevo fixture A', orden: 10, activo: true },
    });
    estadoAId = estadoA.id;
    const prioridadCreacionA = await tenantAClient.prioridad.create({
      data: {
        codigo: 'HORCLI_P8_CREA',
        nombre: '8h fixture — creación',
        orden: 1,
        slaHoras: 8,
        slaActivo: true,
      },
    });
    prioridadCreacionAId = prioridadCreacionA.id;
    const prioridadReprioA = await tenantAClient.prioridad.create({
      data: {
        codigo: 'HORCLI_P8_REPRIO',
        nombre: '8h fixture — repriorización',
        orden: 2,
        slaHoras: 8,
        slaActivo: true,
      },
    });
    prioridadReprioAId = prioridadReprioA.id;

    const tipoB = await tenantBClient.tipoTicket.create({
      data: {
        codigo: 'HORCLI_TIPO_B',
        nombre: 'Fixture horario cliente B',
        activo: true,
        modulo: 'SOPORTE',
      },
    });
    tipoBId = tipoB.id;
    const estadoB = await tenantBClient.estado.create({
      data: { codigo: 'HORCLI_NUEVO_B', nombre: 'Nuevo fixture B', orden: 10, activo: true },
    });
    estadoBId = estadoB.id;
    const prioridadB = await tenantBClient.prioridad.create({
      data: {
        codigo: 'HORCLI_P8_B',
        nombre: '8h fixture B',
        orden: 1,
        slaHoras: 8,
        slaActivo: true,
      },
    });
    prioridadBId = prioridadB.id;

    // Mismas clases de producción que `SlaModule`/`CalendarioLaboralModule`
    // cablean vía DI (sla.module.ts) — instanciadas a mano contra el mismo
    // `tenantContext`, sin compilar el árbol completo de módulos Nest. Mismo
    // criterio que `aplicar-sla-habil-feriados.e2e.spec.ts`.
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

    // WU-9 (fix W2): mismo repo que la lectura (implementa los dos puertos,
    // WU-5) más un `PrismaTenantTransactionRunner` real — la MISMA
    // composición que `HorarioLaboralModule` cablea vía DI para el `PUT`.
    const calendarioEscrituraRepo = new PrismaCalendarioLaboralSemanalRepository(tenantContext);
    guardarHorarioUseCase = new GuardarHorarioLaboralUseCase(
      calendarioEscrituraRepo,
      calendarioEscrituraRepo,
      new PrismaTenantTransactionRunner(tenantContext, logger),
    );
  }, 90_000);

  afterAll(async () => {
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB_A);
    await admin.dropDatabase(DB_B);
  }, 60_000);

  it('[CRITICAL] guardar el horario no recalcula lo abierto, repriorizar usa el horario nuevo anclado al createdAt original, un ticket nuevo usa el horario nuevo, y B queda aislado', async () => {
    // Escenario "Un ticket abierto conserva su vencimiento" (parte 1): A crea
    // con el default (lun-vie 09:00-18:00 ART) — 8h desde las 09:00 ART
    // vencen el mismo día a las 17:00 ART = 20:00 UTC.
    const ticketA = await tenantAClient.ticket.create({
      data: {
        numero: 'HORCLI-A-0001',
        titulo: 'Ticket HABIL — horario laboral por cliente (A, default)',
        tipoId: tipoAId,
        estadoId: estadoAId,
        prioridadId: prioridadCreacionAId,
        solicitanteId: randomUUID(),
        createdAt: CREADO_EN,
      },
    });
    await tenantContext.run(
      { prismaClient: tenantAClient, dbName: DB_A, clienteId: 'horario-cliente-e2e-A' },
      () =>
        aplicarSlaListener.onTicketCreado(
          new TicketCreadoEvent({ ticketId: ticketA.id, prioridadId: prioridadCreacionAId }),
        ),
    );
    const venceInicialA = await slaVenceAtDe(tenantAClient, ticketA.id);
    expect(venceInicialA?.toISOString()).toBe('2031-04-07T20:00:00.000Z');

    // Escenario "Guardar el horario no recalcula el SLA de tickets abiertos":
    // el horario nuevo de A pasa por `GuardarHorarioLaboralUseCase` REAL
    // (WU-9, fix W2) — lun-vie pasa a 08:00-12:00 ART (480-720 minutos),
    // domingo y sábado siguen cerrados. Nada en el caso de uso toca
    // `ticket`: el vencimiento ya fijado de A no cambia.
    const guardado = await tenantContext.run(
      { prismaClient: tenantAClient, dbName: DB_A, clienteId: 'horario-cliente-e2e-A' },
      () =>
        guardarHorarioUseCase.execute({
          dias: [
            { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
            { diaSemana: 1, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 2, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 3, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 4, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 5, aperturaMinuto: 480, cierreMinuto: 720 },
            { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
          ],
        }),
    );
    expect(guardado.isOk()).toBe(true);
    expect((await slaVenceAtDe(tenantAClient, ticketA.id))?.toISOString()).toBe(
      venceInicialA?.toISOString(),
    );

    // Escenario "Un ticket repriorizado usa el horario nuevo": mismo
    // `createdAt` (12:00 UTC lunes, dentro de la ventana nueva 11:00-15:00
    // UTC), ahora con la ventana 08:00-12:00 ART — 3h el lunes (resto del
    // día) + 4h el martes + 1h el miércoles = 8h, vence miércoles 09:00 ART
    // = 12:00 UTC.
    await tenantAClient.ticket.update({
      where: { id: ticketA.id },
      data: { prioridadId: prioridadReprioAId },
    });
    await tenantContext.run(
      { prismaClient: tenantAClient, dbName: DB_A, clienteId: 'horario-cliente-e2e-A' },
      () =>
        aplicarSlaListener.onTicketReprioritizado(
          new TicketReprioritizadoEvent({ ticketId: ticketA.id, prioridadId: prioridadReprioAId }),
        ),
    );
    expect((await slaVenceAtDe(tenantAClient, ticketA.id))?.toISOString()).toBe(
      '2031-04-09T12:00:00.000Z',
    );

    // Escenario "Un ticket nuevo usa el horario nuevo": mismo `createdAt`,
    // mismo cálculo que la repriorización — confirma que A ya lee el
    // horario nuevo para cualquier ticket, no solo el que se repriorizó.
    const ticketANuevo = await tenantAClient.ticket.create({
      data: {
        numero: 'HORCLI-A-0002',
        titulo: 'Ticket HABIL — horario laboral por cliente (A, nuevo tras el cambio)',
        tipoId: tipoAId,
        estadoId: estadoAId,
        prioridadId: prioridadCreacionAId,
        solicitanteId: randomUUID(),
        createdAt: CREADO_EN,
      },
    });
    await tenantContext.run(
      { prismaClient: tenantAClient, dbName: DB_A, clienteId: 'horario-cliente-e2e-A' },
      () =>
        aplicarSlaListener.onTicketCreado(
          new TicketCreadoEvent({ ticketId: ticketANuevo.id, prioridadId: prioridadCreacionAId }),
        ),
    );
    expect((await slaVenceAtDe(tenantAClient, ticketANuevo.id))?.toISOString()).toBe(
      '2031-04-09T12:00:00.000Z',
    );

    // Escenario "Aislamiento por cliente": B nunca tocó su horario — mismo
    // `createdAt`, mismo default 9-18 lun-vie que tenía A al principio — el
    // cambio de A no lo afecta.
    const ticketB = await tenantBClient.ticket.create({
      data: {
        numero: 'HORCLI-B-0001',
        titulo: 'Ticket HABIL — horario laboral por cliente (B, aislado del cambio de A)',
        tipoId: tipoBId,
        estadoId: estadoBId,
        prioridadId: prioridadBId,
        solicitanteId: randomUUID(),
        createdAt: CREADO_EN,
      },
    });
    await tenantContext.run(
      { prismaClient: tenantBClient, dbName: DB_B, clienteId: 'horario-cliente-e2e-B' },
      () =>
        aplicarSlaListener.onTicketCreado(
          new TicketCreadoEvent({ ticketId: ticketB.id, prioridadId: prioridadBId }),
        ),
    );
    expect((await slaVenceAtDe(tenantBClient, ticketB.id))?.toISOString()).toBe(
      '2031-04-07T20:00:00.000Z',
    );
  });
});
