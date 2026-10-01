/**
 * [INTEGRATION] Guards de un equipo dado de baja (WU-4, baja-equipo-completo, R8 y R11) contra
 * Postgres real: editar, agregar componente (con y sin descuento) y reactivar un componente se
 * rechazan con `EquipoDadoDeBajaError`, sin escribir nada.
 *
 * El equipo se da de baja por `registrarBaja()` (el único escritor de la baja, WU-2). Wiring
 * manual sin Nest DI, sobre `soporte_tenant_test` con un PREFIJO propio.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { unstubbed } from '../../../testing/mocks';
import { PrismaEquipoInformaticoRepository } from '../../infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import { PrismaComponenteEquipoRepository } from '../../infrastructure/persistence/prisma/prisma-componente-equipo.repository';
import { PrismaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-insumo.repository';
import { PrismaFamiliaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import { PrismaMovimientoInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';
import { RegistrarSalidaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-salida-insumo.use-case';
import { construirOperacionesReal } from '../../../insumos/testing/operaciones-unidad-real';
import { EditarEquipoUseCase } from './editar-equipo.use-case';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { AgregarComponenteSinDescuentoUseCase } from './agregar-componente-sin-descuento.use-case';
import { InstalarComponenteDesdeDepositoUseCase } from './instalar-componente-desde-deposito.use-case';
import { ReactivarComponenteUseCase } from './reactivar-componente.use-case';
import { EquipoDadoDeBajaError } from '../../domain/errors/equipos.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const USUARIO = '01900000-0000-7000-8000-000000000451';

describe('Equipo dado de baja — guards con LE (WU-4, R8 y R11)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let equipoRepo: PrismaEquipoInformaticoRepository;
  let componenteRepo: PrismaComponenteEquipoRepository;
  let insumoRepo: PrismaInsumoRepository;
  let familiaRepo: PrismaFamiliaInsumoRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;
  let txRunner: PrismaTenantTransactionRunner;

  const PREFIJO = `GBJ_${randomBytes(2).toString('hex')}_`;
  let insumoNingunoId: string;
  let insumoSerieId: string;
  const equipoIds: string[] = [];

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-gbj' },
      fn,
    );
  }

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 6,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    tenantContext = new TenantContext();
    equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
    componenteRepo = new PrismaComponenteEquipoRepository(tenantContext);
    insumoRepo = new PrismaInsumoRepository(tenantContext);
    familiaRepo = new PrismaFamiliaInsumoRepository(tenantContext);
    movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia guards baja', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Entera guards baja', entera: true },
    });
    const crearInsumo = async (sufijo: string, seguimiento: 'NINGUNO' | 'SERIE') =>
      (
        await tenantClient.insumo.create({
          data: {
            codigo: `${PREFIJO}${sufijo}`,
            nombre: `Repuesto ${sufijo} guards baja`,
            familiaId: familia.id,
            unidadMedidaId: unidadMedida.id,
            seguimiento,
          },
        })
      ).id;
    insumoNingunoId = await crearInsumo('N', 'NINGUNO');
    insumoSerieId = await crearInsumo('S', 'SERIE');
    // Stock disponible: si el guard no cortara, la SALIDA se registraría.
    await tenantClient.movimientoInsumo.create({
      data: {
        insumoId: insumoNingunoId,
        tipo: 'ENTRADA',
        condicion: 'NUEVO',
        cantidad: 5,
        usuarioId: USUARIO,
      },
    });
  }, 30_000);

  afterAll(async () => {
    const insumos = { in: [insumoNingunoId, insumoSerieId] };
    await tenantClient.componenteEquipo.deleteMany({ where: { equipoId: { in: equipoIds } } });
    await tenantClient.eventoUnidadInsumo.deleteMany({ where: { unidad: { insumoId: insumos } } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId: insumos } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId: insumos } });
    await tenantClient.equipoInformatico.deleteMany({ where: { id: { in: equipoIds } } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  /** Crea un equipo vigente y lo da de baja por `registrarBaja()`, el único escritor. */
  async function crearEquipoDadoDeBaja(): Promise<string> {
    const fila = await tenantClient.equipoInformatico.create({
      data: { nombre: `${PREFIJO}${randomBytes(2).toString('hex')}` },
    });
    equipoIds.push(fila.id);
    await conTenant(async () => {
      const equipo = await equipoRepo.findById(fila.id);
      equipo!.darDeBaja({
        destino: 'DESCARTE',
        categoria: 'VEJEZ',
        usuarioId: USUARIO,
        fecha: new Date(),
      });
      expect(await equipoRepo.registrarBaja(equipo!)).toBe(true);
    });
    return fila.id;
  }

  async function equipoEnBase(id: string) {
    return tenantClient.equipoInformatico.findUniqueOrThrow({ where: { id } });
  }

  function makeAgregar() {
    return new AgregarComponenteUseCase(equipoRepo, componenteRepo, insumoRepo, familiaRepo);
  }

  function makeOperaciones() {
    return construirOperacionesReal({ tenantContext, insumoRepo, movimientoRepo });
  }

  it('EditarEquipo con la entidad leída antes de la baja devuelve error y el equipo sigue dado de baja con sus baja_*', async () => {
    const equipoId = await crearEquipoDadoDeBaja();
    const antes = await equipoEnBase(equipoId);
    // Edición vieja: la entidad se leyó antes de la baja (la lee el caller, fuera de la tx).
    const useCase = new EditarEquipoUseCase(equipoRepo, txRunner, {
      findById: unstubbed('modelo'),
    });

    const result = await conTenant(() => useCase.execute({ equipoId, nombre: 'Editado tarde' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    const despues = await equipoEnBase(equipoId);
    expect(despues.activo).toBe(false);
    expect(despues.nombre).toBe(antes.nombre);
    expect(despues.bajaDestino).toBe('DESCARTE');
    expect(despues.bajaCategoria).toBe('VEJEZ');
    expect(despues.bajaUsuarioId).toBe(USUARIO);
    expect(despues.bajaFecha?.getTime()).toBe(antes.bajaFecha?.getTime());
  });

  it('agregar un componente CON descuento (insumo NINGUNO) se rechaza: sin componente nuevo ni SALIDA', async () => {
    const equipoId = await crearEquipoDadoDeBaja();
    const operaciones = makeOperaciones();
    const useCase = new InstalarComponenteDesdeDepositoUseCase(
      txRunner,
      makeAgregar(),
      new RegistrarSalidaInsumoUseCase(
        insumoRepo,
        movimientoRepo,
        txRunner,
        familiaRepo,
        operaciones,
      ),
      operaciones,
      componenteRepo,
    );

    const result = await conTenant(() =>
      useCase.execute({ equipoId, insumoId: insumoNingunoId, usuarioId: USUARIO }),
    );

    expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(await tenantClient.componenteEquipo.count({ where: { equipoId } })).toBe(0);
    expect(
      await tenantClient.movimientoInsumo.count({
        where: { insumoId: insumoNingunoId, tipo: 'SALIDA' },
      }),
    ).toBe(0);
  });

  it('instalar una unidad SERIE se rechaza: la unidad sigue EN_DEPOSITO y no hay componente ni SALIDA', async () => {
    const equipoId = await crearEquipoDadoDeBaja();
    const unidad = await tenantClient.unidadInsumo.create({
      data: {
        insumoId: insumoSerieId,
        numeroSerie: 'S1',
        numeroSerieNormalizado: `${PREFIJO}S1`,
        condicion: 'NUEVO',
        estado: 'EN_DEPOSITO',
      },
    });
    const operaciones = makeOperaciones();
    const useCase = new InstalarComponenteDesdeDepositoUseCase(
      txRunner,
      makeAgregar(),
      new RegistrarSalidaInsumoUseCase(
        insumoRepo,
        movimientoRepo,
        txRunner,
        familiaRepo,
        operaciones,
      ),
      operaciones,
      componenteRepo,
    );

    const result = await conTenant(() =>
      useCase.execute({
        equipoId,
        insumoId: insumoSerieId,
        usuarioId: USUARIO,
        unidadId: unidad.id,
      }),
    );

    expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(await tenantClient.componenteEquipo.count({ where: { equipoId } })).toBe(0);
    const u = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidad.id } });
    expect(u.estado).toBe('EN_DEPOSITO');
    expect(
      await tenantClient.movimientoInsumo.count({
        where: { insumoId: insumoSerieId, tipo: 'SALIDA' },
      }),
    ).toBe(0);
  });

  it('agregar un componente SIN descuento (SERIE con serial) se rechaza: sin componente ni unidad nueva', async () => {
    const equipoId = await crearEquipoDadoDeBaja();
    const useCase = new AgregarComponenteSinDescuentoUseCase(
      txRunner,
      makeAgregar(),
      insumoRepo,
      makeOperaciones(),
      componenteRepo,
    );
    const unidadesAntes = await tenantClient.unidadInsumo.count({
      where: { insumoId: insumoSerieId },
    });

    const result = await conTenant(() =>
      useCase.execute({
        equipoId,
        insumoId: insumoSerieId,
        usuarioId: USUARIO,
        numeroSerie: `${PREFIJO}SN-NUEVO`,
      }),
    );

    expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(await tenantClient.componenteEquipo.count({ where: { equipoId } })).toBe(0);
    expect(await tenantClient.unidadInsumo.count({ where: { insumoId: insumoSerieId } })).toBe(
      unidadesAntes,
    );
  });

  it('reactivar un componente DESCARTE con la unidad "S1" DESCARTADA se rechaza: sigue retirado y "S1" DESCARTADA', async () => {
    const equipoId = await crearEquipoDadoDeBaja();
    const unidad = await tenantClient.unidadInsumo.create({
      data: {
        insumoId: insumoSerieId,
        numeroSerie: 'S1',
        numeroSerieNormalizado: `${PREFIJO}S1-DESC`,
        condicion: 'USADO',
        estado: 'DESCARTADA',
      },
    });
    const componente = await tenantClient.componenteEquipo.create({
      data: {
        equipoId,
        insumoId: insumoSerieId,
        unidadId: unidad.id,
        deletedAt: new Date(),
        bajaDestino: 'DESCARTE',
        bajaMotivo: 'Baja del equipo',
        bajaUsuarioId: USUARIO,
      },
    });
    const useCase = new ReactivarComponenteUseCase(
      txRunner,
      equipoRepo,
      componenteRepo,
      makeOperaciones(),
    );

    const result = await conTenant(() =>
      useCase.execute({ equipoId, componenteId: componente.id, usuarioId: USUARIO }),
    );

    expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    const c = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componente.id },
    });
    expect(c.deletedAt).not.toBeNull();
    expect(c.bajaDestino).toBe('DESCARTE');
    const u = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidad.id } });
    expect(u.estado).toBe('DESCARTADA');
  });
});
