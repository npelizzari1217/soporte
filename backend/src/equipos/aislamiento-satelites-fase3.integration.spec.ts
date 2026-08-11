/**
 * TV.2 [INTEGRATION] — Aislamiento cross-tenant REAL de los repos satélite
 * de Fase 3 (compras, reparaciones, equipos): un repo bindeado al
 * TenantContext del tenant A (una DB física) NO ve filas del tenant B (OTRA
 * DB física) — mismo patrón que
 * `tickets/infrastructure/persistence/prisma/prisma-ticket-repository.aislamiento.integration.spec.ts`
 * (Fase 2, T5.7/T23), extendido a un repo representativo de cada módulo
 * satélite nuevo: `PrismaTicketCompraRepository`, `PrismaTicketEdiliciaRepository`,
 * `PrismaTicketSoporteRepository`.
 *
 * SEGURIDAD: crea UNA sola DB efímera `soporte_prov_f3iso_<rand>_test`
 * (prefijo `soporte_prov_`, sufijo `_test`) vía `PostgresAdminService`, la
 * migra vía `TenantMigrationRunnerAdapter`, y la borra en `afterAll`. El
 * tenant A es `soporte_tenant_test` (ya migrada, compartida por el resto de
 * la suite) — la DB efímera es el tenant B "vacío" que no debe ver las
 * filas de A. NUNCA toca `soporte_master`/`soporte_master_test`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C6/Q1 (matriz de tests, fila
 * "aislamiento cross-tenant de repos satélites"). Tarea: TV.2.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../clientes/infrastructure/tenant-migration-runner.adapter';

import { PrismaTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { TicketEntity, TicketProps } from '../tickets/domain/entities/ticket.entity';

import { PrismaTicketCompraRepository } from '../compras/infrastructure/persistence/prisma/prisma-ticket-compra.repository';
import { TicketCompraEntity } from '../compras/domain/entities/ticket-compra.entity';

import { PrismaTicketEdiliciaRepository } from '../reparaciones/infrastructure/persistence/prisma/prisma-ticket-edilicia.repository';
import { PrismaUbicacionRepository } from '../reparaciones/infrastructure/persistence/prisma/prisma-ubicacion.repository';
import { TicketEdiliciaEntity } from '../reparaciones/domain/entities/ticket-edilicia.entity';
import { UbicacionEntity } from '../reparaciones/domain/entities/ubicacion.entity';

import { PrismaTicketSoporteRepository } from './infrastructure/persistence/prisma/prisma-ticket-soporte.repository';
import { TicketSoporteEntity } from './domain/entities/ticket-soporte.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_A_DB_NAME = 'soporte_tenant_test';
const TENANT_B_DB_NAME = `soporte_prov_f3iso_${randomBytes(4).toString('hex')}_test`;
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000101';

describe('Aislamiento cross-tenant real — repos satélite de Fase 3 (TV.2)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  let prismaService: PrismaService;
  let tenantAClient: InstanceType<typeof TenantPrismaClient>;
  let tenantBClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let ticketRepo: PrismaTicketRepository;
  let ticketCompraRepo: PrismaTicketCompraRepository;
  let ticketEdiliciaRepo: PrismaTicketEdiliciaRepository;
  let ubicacionRepo: PrismaUbicacionRepository;
  let ticketSoporteRepo: PrismaTicketSoporteRepository;

  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;
  let ubicacionAId: string;

  let ticketCompraAId: string;
  let ticketEdiliciaAId: string;
  let ticketSoporteAId: string;

  const ticketIdsCreados: string[] = [];

  function withTenantA<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantAClient, dbName: TENANT_A_DB_NAME, clienteId: 'f3iso-tenant-a' },
      fn,
    );
  }

  function withTenantB<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantBClient, dbName: TENANT_B_DB_NAME, clienteId: 'f3iso-tenant-b' },
      fn,
    );
  }

  beforeAll(async () => {
    await admin.createDatabase(TENANT_B_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_B_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantAClient = prismaService.getTenantClient(TENANT_A_DB_NAME);
    tenantBClient = prismaService.getTenantClient(TENANT_B_DB_NAME);
    tenantContext = new TenantContext();

    ticketRepo = new PrismaTicketRepository(tenantContext);
    ticketCompraRepo = new PrismaTicketCompraRepository(tenantContext);
    ticketEdiliciaRepo = new PrismaTicketEdiliciaRepository(tenantContext);
    ubicacionRepo = new PrismaUbicacionRepository(tenantContext);
    ticketSoporteRepo = new PrismaTicketSoporteRepository(tenantContext);

    const suffix = randomBytes(3).toString('hex');
    const tipo = await tenantAClient.tipoTicket.create({
      data: { codigo: `TVISO${suffix}`, nombre: 'Aislamiento TV Test', activo: true, modulo: 'SOPORTE' },
    });
    tipoId = tipo.id;
    const estado = await tenantAClient.estado.create({
      data: {
        codigo: `TVISOEST${suffix}`,
        nombre: 'Estado Aislamiento TV',
        orden: 1,
        activo: true,
      },
    });
    estadoId = estado.id;
    const prioridad = await tenantAClient.prioridad.create({
      data: {
        codigo: `TVISOPRI${suffix}`,
        nombre: 'Prioridad Aislamiento TV',
        orden: 1,
        activo: true,
      },
    });
    prioridadId = prioridad.id;

    function makeTicketProps(numero: string): TicketProps {
      return {
        numero,
        titulo: 'Ticket aislamiento TV.2',
        descripcion: null,
        tipoId,
        estadoId,
        prioridadId,
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: DUMMY_USUARIO_ID,
        asignadoId: null,
        slaVenceAt: null,
        vencido: false,
        fechaCierre: null,
      };
    }

    // Fixture: TicketCompra en el tenant A.
    const ticketCompraBase = TicketEntity.create(makeTicketProps(`TVC${suffix.slice(0, 5)}`));
    const ticketCompra = TicketCompraEntity.create({ ticketId: ticketCompraBase.id });
    await withTenantA(async () => {
      await ticketRepo.save(ticketCompraBase);
      await ticketCompraRepo.save(ticketCompra);
    });
    ticketIdsCreados.push(ticketCompraBase.id);
    ticketCompraAId = ticketCompra.id;

    // Fixture: Ubicacion + TicketEdilicia en el tenant A.
    const ubicacionA = UbicacionEntity.create({ nombre: 'Ubicación aislamiento TV.2' });
    await withTenantA(() => ubicacionRepo.save(ubicacionA));
    ubicacionAId = ubicacionA.id;

    const ticketEdiliciaBase = TicketEntity.create(makeTicketProps(`TVE${suffix.slice(0, 5)}`));
    const ticketEdilicia = TicketEdiliciaEntity.create({
      ticketId: ticketEdiliciaBase.id,
      ubicacionId: ubicacionAId,
    });
    await withTenantA(async () => {
      await ticketRepo.save(ticketEdiliciaBase);
      await ticketEdiliciaRepo.save(ticketEdilicia);
    });
    ticketIdsCreados.push(ticketEdiliciaBase.id);
    ticketEdiliciaAId = ticketEdilicia.id;

    // Fixture: TicketSoporte (sin equipo) en el tenant A.
    const ticketSoporteBase = TicketEntity.create(makeTicketProps(`TVS${suffix.slice(0, 5)}`));
    const ticketSoporte = TicketSoporteEntity.create({
      ticketId: ticketSoporteBase.id,
      equipoId: null,
      descripcionProblema: null,
    });
    await withTenantA(async () => {
      await ticketRepo.save(ticketSoporteBase);
      await ticketSoporteRepo.save(ticketSoporte);
    });
    ticketIdsCreados.push(ticketSoporteBase.id);
    ticketSoporteAId = ticketSoporte.id;
  }, 60_000);

  afterAll(async () => {
    if (ticketIdsCreados.length > 0) {
      await tenantAClient.ticketCompra.deleteMany({
        where: { ticketId: { in: ticketIdsCreados } },
      });
      await tenantAClient.ticketEdilicia.deleteMany({
        where: { ticketId: { in: ticketIdsCreados } },
      });
      await tenantAClient.ticketSoporte.deleteMany({
        where: { ticketId: { in: ticketIdsCreados } },
      });
      await tenantAClient.ticket.deleteMany({ where: { id: { in: ticketIdsCreados } } });
    }
    await tenantAClient.ubicacion.delete({ where: { id: ubicacionAId } });
    await tenantAClient.tipoTicket.delete({ where: { id: tipoId } });
    await tenantAClient.estado.delete({ where: { id: estadoId } });
    await tenantAClient.prioridad.delete({ where: { id: prioridadId } });
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(TENANT_B_DB_NAME);
  }, 60_000);

  it('[CRITICAL] PrismaTicketCompraRepository bindeado al tenant B NO ve el ticket_compra del tenant A', async () => {
    const foundA = await withTenantA(() => ticketCompraRepo.findById(ticketCompraAId));
    expect(foundA).not.toBeNull();

    const foundB = await withTenantB(() => ticketCompraRepo.findById(ticketCompraAId));
    expect(foundB).toBeNull();
  });

  it('[CRITICAL] PrismaTicketEdiliciaRepository bindeado al tenant B NO ve el ticket_edilicia del tenant A', async () => {
    const foundA = await withTenantA(() => ticketEdiliciaRepo.findById(ticketEdiliciaAId));
    expect(foundA).not.toBeNull();

    const foundB = await withTenantB(() => ticketEdiliciaRepo.findById(ticketEdiliciaAId));
    expect(foundB).toBeNull();
  });

  it('[CRITICAL] PrismaTicketSoporteRepository bindeado al tenant B NO ve el ticket_soporte del tenant A', async () => {
    const foundA = await withTenantA(() => ticketSoporteRepo.findById(ticketSoporteAId));
    expect(foundA).not.toBeNull();

    const foundB = await withTenantB(() => ticketSoporteRepo.findById(ticketSoporteAId));
    expect(foundB).toBeNull();
  });
});
