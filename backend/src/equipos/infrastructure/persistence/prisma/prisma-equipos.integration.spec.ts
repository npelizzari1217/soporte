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

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `T11${RUN_PREFIX}${String(numeroCounter).padStart(4, '0')}`;
  }

  const ticketIdsCreados: string[] = [];
  const equipoIdsCreados: string[] = [];
  /** Fixture del catálogo `modelos_equipo` — destino de `equipos.modelo_equipo_id`. */
  let modeloEquipoId: string;
  /** Fixtures de WU-3 — destino de `componentes_equipo.insumo_id` (FK real, misma base). */
  let unidadMedidaId: string;
  let familiaInsumoRepuestoId: string;
  let insumoRepuestoId: string;

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
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
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
      data: {
        codigo: 'T11_TEST_SOPORTE',
        nombre: 'Soporte Test PR11',
        activo: true,
        modulo: 'SOPORTE',
      },
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

    const modeloEquipo = await tenantClient.modeloEquipo.create({
      data: { marca: `T11_TEST_HP_${RUN_PREFIX}`, modelo: 'LaserJet Pro M404' },
    });
    modeloEquipoId = modeloEquipo.id;

    // Fixtures de WU-3 (sdd/repuestos-vinculo-componente): repuesto real del
    // catálogo del tenant para cubrir `componentes_equipo.insumo_id` (FK real,
    // MISMA base).
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `T11_TEST_UN_${RUN_PREFIX}`, nombre: 'Unidad Test PR11' },
    });
    unidadMedidaId = unidadMedida.id;

    const familiaRepuesto = await tenantClient.familiaInsumo.create({
      data: { codigo: `T11_TEST_MOUSE_${RUN_PREFIX}`, nombre: 'Mouse Test PR11', esRepuesto: true },
    });
    familiaInsumoRepuestoId = familiaRepuesto.id;

    const insumoRepuesto = await tenantClient.insumo.create({
      data: {
        codigo: `T11_TEST_REP_${RUN_PREFIX}`,
        nombre: 'Mouse óptico Test PR11',
        familiaId: familiaInsumoRepuestoId,
        unidadMedidaId,
      },
    });
    insumoRepuestoId = insumoRepuesto.id;
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
    // Después de los componentes (arriba): `componentes_equipo.insumo_id` (WU-3,
    // ON DELETE RESTRICT) apunta acá — borrar el insumo antes fallaría.
    await tenantClient.insumo.delete({ where: { id: insumoRepuestoId } });
    await tenantClient.familiaInsumo.delete({ where: { id: familiaInsumoRepuestoId } });
    await tenantClient.unidadMedida.delete({ where: { id: unidadMedidaId } });
    // Después de los equipos: `equipos_informaticos.modelo_equipo_id` apunta acá.
    await tenantClient.modeloEquipo.delete({ where: { id: modeloEquipoId } });
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
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
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

    /**
     * `modelo_equipo_id` tiene que SOBREVIVIR al guardado, en el INSERT y en el
     * UPDATE. El objeto que arma `toPersistence()` es el mismo que viaja al
     * `update` del upsert: si alguien vuelve a excluir el campo del literal —o
     * peor, lo fija en `null`— el modelo del equipo se borra solo en el
     * siguiente guardado, y es pérdida de datos que ningún otro test de esta
     * suite ve, porque todos los demás equipos de fixture lo dejan en null.
     *
     * Por eso el segundo `save()` es parte del caso y no un caso aparte: el
     * INSERT solo probaría la mitad barata.
     */
    it('modeloEquipoId sobrevive al INSERT y al UPDATE de save()', async () => {
      const equipo = await crearEquipo({ nombre: 'Impresora del catálogo', modeloEquipoId });

      await withTenant(async () => {
        const trasInsert = await equipoRepo.findById(equipo.id);
        expect(trasInsert!.modeloEquipoId).toBe(modeloEquipoId);
      });

      equipo.actualizar({ nombre: 'Impresora renombrada' });
      await withTenant(async () => {
        await equipoRepo.save(equipo);
        const trasUpdate = await equipoRepo.findById(equipo.id);
        expect(trasUpdate!.nombre).toBe('Impresora renombrada');
        expect(trasUpdate!.modeloEquipoId).toBe(modeloEquipoId);
      });
    });

    /**
     * Hermano del caso de arriba: el equipo SIN modelo de catálogo —el clon
     * armado en casa— se guarda igual. Sin este caso, hacer obligatoria la
     * columna no pondría nada en rojo.
     */
    it('un equipo sin modeloEquipoId se guarda y se relee con null', async () => {
      const equipo = await crearEquipo({ nombre: 'Clon armado en casa' });

      await withTenant(async () => {
        const found = await equipoRepo.findById(equipo.id);
        expect(found!.modeloEquipoId).toBeNull();
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
        insumoId: insumoRepuestoId,
        descripcion: 'RAM slot 1',
        numeroSerie: null,
        capacidad: '8GB',
      }).getValue();
      const componente2 = ComponenteEquipoEntity.create({
        equipoId: equipo.id,
        insumoId: insumoRepuestoId,
        descripcion: 'RAM slot 2',
        numeroSerie: null,
        capacidad: '8GB',
      }).getValue();
      const componenteABorrar = ComponenteEquipoEntity.create({
        equipoId: equipo.id,
        insumoId: insumoRepuestoId,
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

    /**
     * `insumo_id` es obligatorio (sdd/catalogo-unico-componentes) y una FK
     * REAL contra Postgres: un id inexistente lo rechaza la base, no una
     * validación de aplicación que podría faltar.
     */
    /**
     * El segundo `save()` es parte del caso y no un caso aparte, por el mismo
     * motivo que en `modeloEquipoId sobrevive al INSERT y al UPDATE`: el objeto
     * que arma `ComponenteEquipoMapper.toPersistence()` es el MISMO que viaja
     * al `update` del upsert. Si alguien vuelve a excluir `insumoId` de ese
     * literal —o peor, lo fija en `null`— el vínculo con el repuesto se borra
     * solo en el siguiente guardado, sin error y sin log.
     *
     * Y ese segundo guardado no es hipotético: es el camino normal. Editar la
     * descripción de un componente vinculado termina en `componenteRepo.save()`
     * (`EditarComponenteUseCase`, y lo mismo `ReactivarComponenteUseCase`),
     * y `actualizar()` no toca `insumoId`. Probar solo el INSERT deja afuera
     * justo la mitad donde se pierden datos, y ningún otro caso de esta suite
     * lo vería: los demás casos solo miran el alta.
     */
    it('insumoId sobrevive al INSERT y al UPDATE de save()', async () => {
      const equipo = await crearEquipo();
      const componente = ComponenteEquipoEntity.create({
        equipoId: equipo.id,
        insumoId: insumoRepuestoId,
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      }).getValue();

      await withTenant(async () => {
        await componenteRepo.save(componente);
        const trasInsert = await componenteRepo.findById(componente.id);
        expect(trasInsert!.insumoId).toBe(insumoRepuestoId);
      });

      componente.actualizar({ descripcion: 'Memoria renombrada' });
      await withTenant(async () => {
        await componenteRepo.save(componente);
        const trasUpdate = await componenteRepo.findById(componente.id);
        expect(trasUpdate!.descripcion).toBe('Memoria renombrada');
        expect(trasUpdate!.insumoId).toBe(insumoRepuestoId);
      });
    });

    it('save() con insumoId inexistente falla — la FK real lo rechaza', async () => {
      const equipo = await crearEquipo();
      const insumoIdInexistente = '00000000-0000-7000-8000-000000000000';
      const componente = ComponenteEquipoEntity.create({
        equipoId: equipo.id,
        insumoId: insumoIdInexistente,
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      }).getValue();

      await withTenant(async () => {
        await expect(componenteRepo.save(componente)).rejects.toThrow();
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
