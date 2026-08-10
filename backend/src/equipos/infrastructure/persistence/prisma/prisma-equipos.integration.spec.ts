/**
 * T11.1, T11.3 [INTEGRATION] — RED→GREEN: PrismaEquipoInformaticoRepository,
 * PrismaComponenteEquipoRepository, PrismaTicketSoporteRepository
 * (save / find / delete) contra Postgres REAL (`soporte_tenant_test`).
 *
 * Fixtures propios prefijados `T11_TEST_*` (mismo patrón que
 * `prisma-compras.integration.spec.ts`, PR3 / `prisma-reparaciones.integration.spec.ts`,
 * PR7): la DB de test NO corre `TenantSeederAdapter` automáticamente, solo
 * está migrada. Cleanup en `afterAll` acotado por los ids de fixture de ESTA
 * suite (nunca TRUNCATE global — la DB es compartida).
 *
 * PR4b (sdd/tipos-componente-master): `PrismaTipoComponenteRepository` (y el
 * catálogo tenant `tipos_componente`) se ELIMINARON — `componentes_equipo`
 * referencia el catálogo MASTER por `tipoComponenteCodigo` (soft ref, sin FK
 * cross-DB), por eso esta suite usa códigos de fixture (`T11_TEST_RAM`) en
 * vez de un `id` de catálogo tenant.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1..Q4. Ref design: "Archivos
 * afectados" PR11, riesgo técnico #6 (índice único parcial numero_serie).
 * Tarea: T11.1, T11.2, T11.3.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaTicketRepository } from '../../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaEquipoInformaticoRepository } from './prisma-equipo-informatico.repository';
import { PrismaComponenteEquipoRepository } from './prisma-componente-equipo.repository';
import { PrismaTicketSoporteRepository } from './prisma-ticket-soporte.repository';

import { TicketEntity, TicketProps } from '../../../../tickets/domain/entities/ticket.entity';
import { EquipoInformaticoEntity } from '../../../domain/entities/equipo-informatico.entity';
import { ComponenteEquipoEntity } from '../../../domain/entities/componente-equipo.entity';
import { TicketSoporteEntity } from '../../../domain/entities/ticket-soporte.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000101';

describe('Equipos Persistence Repos — Integration (PR11)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let ticketRepo: PrismaTicketRepository;
  let equipoRepo: PrismaEquipoInformaticoRepository;
  let componenteRepo: PrismaComponenteEquipoRepository;
  let ticketSoporteRepo: PrismaTicketSoporteRepository;

  let tipoSoporteId: string;
  let estadoNuevoId: string;
  let prioridadMediaId: string;
  /** Código de fixture del tipo de componente (soft ref a MASTER — sin fila real en esta DB). */
  const tipoComponenteRamCodigo = 'T11_TEST_RAM';

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `T11${RUN_PREFIX}${String(numeroCounter).padStart(4, '0')}`;
  }

  const ticketIdsCreados: string[] = [];
  const equipoIdsCreados: string[] = [];

  function makeTicketProps(overrides: Partial<TicketProps> = {}): TicketProps {
    return {
      numero: nextNumero(),
      titulo: 'Ticket de soporte de test PR11',
      descripcion: null,
      tipoId: tipoSoporteId,
      estadoId: estadoNuevoId,
      prioridadId: prioridadMediaId,
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: DUMMY_USUARIO_ID,
      asignadoId: null,
      slaVenceAt: null,
      vencido: false,
      fechaCierre: null,
      ...overrides,
    };
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-pr11' },
      fn,
    );
  }

  async function crearEquipo(
    overrides: Partial<Parameters<typeof EquipoInformaticoEntity.create>[0]> = {},
  ): Promise<EquipoInformaticoEntity> {
    const equipo = EquipoInformaticoEntity.create({
      nombre: 'Equipo test PR11',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      ...overrides,
    });
    await withTenant(async () => {
      await equipoRepo.save(equipo);
    });
    equipoIdsCreados.push(equipo.id);
    return equipo;
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();

    ticketRepo = new PrismaTicketRepository(tenantContext);
    equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
    componenteRepo = new PrismaComponenteEquipoRepository(tenantContext);
    ticketSoporteRepo = new PrismaTicketSoporteRepository(tenantContext);

    const tipoSoporte = await tenantClient.tipoTicket.create({
      data: { codigo: 'T11_TEST_SOPORTE', nombre: 'Soporte Test PR11', activo: true },
    });
    tipoSoporteId = tipoSoporte.id;

    const estadoNuevo = await tenantClient.estado.create({
      data: { codigo: 'T11_TEST_NUEVO', nombre: 'Nuevo Test PR11', orden: 1, activo: true },
    });
    estadoNuevoId = estadoNuevo.id;

    const prioridadMedia = await tenantClient.prioridad.create({
      data: { codigo: 'T11_TEST_MEDIA', nombre: 'Media Test PR11', orden: 1, activo: true },
    });
    prioridadMediaId = prioridadMedia.id;
  }, 30_000);

  afterAll(async () => {
    // Cleanup acotado por los ids de fixture de ESTA suite (nunca TRUNCATE
    // global — soporte_tenant_test es compartida por otras suites).
    if (ticketIdsCreados.length > 0) {
      await tenantClient.ticketSoporte.deleteMany({
        where: { ticketId: { in: ticketIdsCreados } },
      });
      await tenantClient.ticket.deleteMany({ where: { id: { in: ticketIdsCreados } } });
    }
    if (equipoIdsCreados.length > 0) {
      await tenantClient.componenteEquipo.deleteMany({
        where: { equipoId: { in: equipoIdsCreados } },
      });
      await tenantClient.equipoInformatico.deleteMany({ where: { id: { in: equipoIdsCreados } } });
    }
    await tenantClient.prioridad.delete({ where: { id: prioridadMediaId } });
    await tenantClient.estado.delete({ where: { id: estadoNuevoId } });
    await tenantClient.tipoTicket.delete({ where: { id: tipoSoporteId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('PrismaEquipoInformaticoRepository', () => {
    it('save() + findById() persiste y recupera el equipo', async () => {
      const equipo = await crearEquipo({ nombre: 'Notebook A' });

      await withTenant(async () => {
        const found = await equipoRepo.findById(equipo.id);
        expect(found).not.toBeNull();
        expect(found!.nombre).toBe('Notebook A');
        expect(found!.activo).toBe(true);
      });
    });

    it('findByNumeroSerie() respeta la unicidad parcial: dos equipos con numeroSerie NULL conviven', async () => {
      const equipoA = await crearEquipo({ numeroSerie: null });
      const equipoB = await crearEquipo({ numeroSerie: null });

      await withTenant(async () => {
        const found = await equipoRepo.findByNumeroSerie('NO_EXISTE_' + RUN_PREFIX);
        expect(found).toBeNull();
      });

      expect(equipoA.id).not.toBe(equipoB.id);
    });

    it('findByNumeroSerie() con numeroSerie NOT NULL y save() de un duplicado falla (índice único parcial)', async () => {
      const serie = `T11-SN-${RUN_PREFIX}`;
      await crearEquipo({ numeroSerie: serie });

      await withTenant(async () => {
        const found = await equipoRepo.findByNumeroSerie(serie);
        expect(found).not.toBeNull();
        expect(found!.numeroSerie).toBe(serie);
      });

      const duplicado = EquipoInformaticoEntity.create({
        nombre: 'Equipo duplicado',
        numeroSerie: serie,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacionId: null,
      });

      await expect(
        withTenant(async () => {
          await equipoRepo.save(duplicado);
        }),
      ).rejects.toThrow();
    });

    it('deactivate() + save() persiste activo=false sin tocar deletedAt', async () => {
      const equipo = await crearEquipo();
      equipo.deactivate();

      await withTenant(async () => {
        await equipoRepo.save(equipo);
        const found = await equipoRepo.findById(equipo.id);
        expect(found!.activo).toBe(false);
        expect(found!.isDeleted()).toBe(false);
      });
    });

    it('delete() aplica soft delete (deletedAt), excluido de findAllActive()', async () => {
      const equipo = await crearEquipo();

      await withTenant(async () => {
        await equipoRepo.delete(equipo.id);
        const found = await equipoRepo.findById(equipo.id);
        expect(found!.isDeleted()).toBe(true);

        const activos = await equipoRepo.findAllActive();
        expect(activos.find((e) => e.id === equipo.id)).toBeUndefined();
      });
    });
  });

  describe('PrismaComponenteEquipoRepository', () => {
    it('save() + findActiveByEquipoId() permite N componentes del mismo tipo, excluye soft-deleted', async () => {
      const equipo = await crearEquipo();
      const componente1 = ComponenteEquipoEntity.create({
        equipoId: equipo.id,
        tipoComponenteCodigo: tipoComponenteRamCodigo,
        descripcion: 'RAM slot 1',
        numeroSerie: null,
        capacidad: '8GB',
      }).getValue();
      const componente2 = ComponenteEquipoEntity.create({
        equipoId: equipo.id,
        tipoComponenteCodigo: tipoComponenteRamCodigo,
        descripcion: 'RAM slot 2',
        numeroSerie: null,
        capacidad: '8GB',
      }).getValue();
      const componenteABorrar = ComponenteEquipoEntity.create({
        equipoId: equipo.id,
        tipoComponenteCodigo: tipoComponenteRamCodigo,
        descripcion: 'RAM a borrar',
        numeroSerie: null,
        capacidad: '4GB',
      }).getValue();

      await withTenant(async () => {
        await componenteRepo.save(componente1);
        await componenteRepo.save(componente2);
        await componenteRepo.save(componenteABorrar);
        await componenteRepo.delete(componenteABorrar.id);

        const activos = await componenteRepo.findActiveByEquipoId(equipo.id);
        expect(activos.map((c) => c.id).sort()).toEqual([componente1.id, componente2.id].sort());
      });
    });
  });

  describe('PrismaTicketSoporteRepository', () => {
    it('save() + findByTicketId() persiste el satélite con equipoId nullable', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const ticketSoporte = TicketSoporteEntity.create({
        ticketId: ticket.id,
        equipoId: null,
        descripcionProblema: 'Sin acceso a la VPN',
      });

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await ticketSoporteRepo.save(ticketSoporte);
        const found = await ticketSoporteRepo.findByTicketId(ticket.id);
        expect(found).not.toBeNull();
        expect(found!.equipoId).toBeNull();
      });
      ticketIdsCreados.push(ticket.id);
    });

    it('save() con equipoId presente + registrarSolucion() persistido', async () => {
      const equipo = await crearEquipo();
      const ticket = TicketEntity.create(makeTicketProps());
      const ticketSoporte = TicketSoporteEntity.create({
        ticketId: ticket.id,
        equipoId: equipo.id,
        descripcionProblema: 'Pantalla no enciende',
      });
      ticketSoporte.registrarSolucion('Se reemplazó el cable HDMI.');

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await ticketSoporteRepo.save(ticketSoporte);
        const found = await ticketSoporteRepo.findById(ticketSoporte.id);
        expect(found!.equipoId).toBe(equipo.id);
        expect(found!.solucionAplicada).toBe('Se reemplazó el cable HDMI.');

        const porEquipo = await ticketSoporteRepo.findByEquipoId(equipo.id);
        expect(porEquipo.map((t) => t.id)).toContain(ticketSoporte.id);
      });
      ticketIdsCreados.push(ticket.id);
    });
  });
});
