/**
 * T5.2 [INTEGRATION] — RED→GREEN: `findLastSecuencia` bajo concurrencia
 * real (ADR-5).
 *
 * N creaciones de ticket SIMULTÁNEAS para el mismo (tipoId, año) deben
 * generar números de secuencia ÚNICOS y SIN HUECOS (1..N), nunca duplicados
 * ni saltos. Cada creación corre en su propia transacción real
 * (`ITenantTransactionRunner.run`) — el advisory lock de
 * `findLastSecuencia` (ver JSDoc en `prisma-ticket.repository.ts`) serializa
 * la sección crítica lectura-de-secuencia + INSERT para el mismo
 * (tipoId, año), incluso para el PRIMER ticket del año (sin fila previa
 * que lockear con `FOR UPDATE`).
 *
 * Spec separado del resto de PR5 (`prisma-tickets.integration.spec.ts`):
 * setup más pesado (transacciones Prisma reales concurrentes) y timeout
 * más alto.
 *
 * Ref spec: sdd/tickets-core/spec T5 ("la unicidad de numero MUST
 * garantizarse ante creaciones concurrentes"). Ref design: ADR-5. Tarea:
 * T5.2.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaTicketRepository } from './prisma-ticket.repository';
import { TicketEntity } from '../../../domain/entities/ticket.entity';
import { NumeradorTicket } from '../../../domain/services/numerador-ticket.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-pr5-concurrencia';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';
const ANIO_TEST = 2099; // año fuera de rango real: aísla de otras suites/reruns

describe('PrismaTicketRepository.findLastSecuencia — Concurrencia real (T5.2, ADR-5)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let ticketRepo: PrismaTicketRepository;
  let tipoConcurrenciaId: string;
  let estadoId: string;
  let prioridadId: string;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext);
    ticketRepo = new PrismaTicketRepository(tenantContext);

    const suffix = randomBytes(3).toString('hex');
    const tipo = await tenantClient.tipoTicket.create({
      data: { codigo: `T5CONC${suffix}`, nombre: 'Concurrencia Test PR5', activo: true, modulo: 'SOPORTE' },
    });
    tipoConcurrenciaId = tipo.id;

    const estado = await tenantClient.estado.create({
      data: { codigo: `T5CONCEST${suffix}`, nombre: 'Estado Concurrencia', orden: 1, activo: true },
    });
    estadoId = estado.id;

    const prioridad = await tenantClient.prioridad.create({
      data: {
        codigo: `T5CONCPRI${suffix}`,
        nombre: 'Prioridad Concurrencia',
        orden: 1,
        activo: true,
      },
    });
    prioridadId = prioridad.id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.ticket.deleteMany({ where: { tipoId: tipoConcurrenciaId } });
    await tenantClient.tipoTicket.delete({ where: { id: tipoConcurrenciaId } });
    await tenantClient.estado.delete({ where: { id: estadoId } });
    await tenantClient.prioridad.delete({ where: { id: prioridadId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: CLIENTE_ID },
      fn,
    );
  }

  it('8 creaciones simultáneas del mismo (tipoId, año) generan secuencias 1..8 sin duplicados ni huecos', async () => {
    const CONCURRENCIA = 8;

    const numerosGenerados = await withTenant(async () => {
      const tareas = Array.from({ length: CONCURRENCIA }, () =>
        txRunner.run(async () => {
          const lastSecuencia = await ticketRepo.findLastSecuencia(tipoConcurrenciaId, ANIO_TEST);
          const numero = NumeradorTicket.generarFormato('TCC', ANIO_TEST, lastSecuencia + 1);
          const ticket = TicketEntity.create({
            numero,
            titulo: 'Ticket concurrente',
            descripcion: null,
            tipoId: tipoConcurrenciaId,
            estadoId,
            prioridadId,
            cicloId: null,
            ticketReferenciaId: null,
            solicitanteId: DUMMY_USUARIO_ID,
          });
          await ticketRepo.save(ticket);
          return numero;
        }),
      );

      return Promise.all(tareas);
    });

    const unicos = new Set(numerosGenerados);
    expect(unicos.size).toBe(CONCURRENCIA);

    const secuencias = numerosGenerados
      .map((n) => parseInt(n.split('-')[2], 10))
      .sort((a, b) => a - b);
    expect(secuencias).toEqual(Array.from({ length: CONCURRENCIA }, (_, i) => i + 1));
  }, 60_000);
});
