/**
 * [INTEGRATION] Ediciones viejas de un componente (WU-5, baja-equipo-completo, ADR-5 y R8) contra
 * Postgres real. `EditarComponenteUseCase` persiste con `editar()` (CAS: `WHERE id AND
 * deleted_at IS NULL`, solo `descripcion`, `numero_serie`, `capacidad` y `updated_at`): una
 * entidad leída antes de una baja de equipo o de un retiro individual no puede pisar
 * `deleted_at` ni los `baja_*`.
 *
 * Wiring manual sin Nest DI, sobre `soporte_tenant_test` con un PREFIJO propio.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaEquipoInformaticoRepository } from '../../infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import { PrismaComponenteEquipoRepository } from '../../infrastructure/persistence/prisma/prisma-componente-equipo.repository';
import { EditarComponenteUseCase } from './editar-componente.use-case';
import type { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { ComponenteDadoDeBajaError } from '../../domain/errors/equipos.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const USUARIO = '01900000-0000-7000-8000-000000000551';

describe('EditarComponente — ediciones viejas con CAS (WU-5, ADR-5, R8)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let equipoRepo: PrismaEquipoInformaticoRepository;
  let componenteRepo: PrismaComponenteEquipoRepository;

  const PREFIJO = `EDC_${randomBytes(2).toString('hex')}_`;
  let insumoId: string;
  let equipoId: string;

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-edc' },
      fn,
    );
  }

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 4,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    tenantContext = new TenantContext();
    equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
    componenteRepo = new PrismaComponenteEquipoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia ediciones viejas', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Entera ediciones viejas', entera: true },
    });
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}N`,
          nombre: 'Repuesto ediciones viejas',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
          seguimiento: 'NINGUNO',
        },
      })
    ).id;
    equipoId = (
      await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}Equipo` } })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.componenteEquipo.deleteMany({ where: { equipoId } });
    await tenantClient.equipoInformatico.deleteMany({ where: { id: equipoId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  afterEach(async () => {
    await tenantClient.componenteEquipo.deleteMany({ where: { equipoId } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.equipoInformatico.update({
      where: { id: equipoId },
      data: {
        activo: true,
        bajaDestino: null,
        bajaCategoria: null,
        bajaMotivo: null,
        bajaFecha: null,
        bajaUsuarioId: null,
      },
    });
  });

  function crearComponente() {
    return tenantClient.componenteEquipo.create({
      data: { equipoId, insumoId, descripcion: 'Original', numeroSerie: 'SN-1', capacidad: '8GB' },
    });
  }

  /**
   * Repo que retira el componente por SQL justo DESPUÉS de leerlo: la entidad que recibe el use
   * case es la "vieja", leída antes del retiro.
   */
  function repoQueSeRetiraDespuesDeLeer(componenteId: string, motivo: string) {
    const repo = {
      findById: async (id: string) => {
        const leido = await componenteRepo.findById(id);
        await tenantClient.componenteEquipo.update({
          where: { id: componenteId },
          data: {
            deletedAt: new Date(),
            bajaDestino: 'DESCARTE',
            bajaMotivo: motivo,
            bajaUsuarioId: USUARIO,
          },
        });
        return leido;
      },
      editar: (c: Parameters<IComponenteEquipoRepository['editar']>[0]) => componenteRepo.editar(c),
    } satisfies Pick<IComponenteEquipoRepository, 'findById' | 'editar'>;
    return repo;
  }

  it('un componente activo escribe solo descripcion, numero_serie y capacidad', async () => {
    const componente = await crearComponente();
    const useCase = new EditarComponenteUseCase(componenteRepo);

    const result = await conTenant(() =>
      useCase.execute({
        equipoId,
        componenteId: componente.id,
        descripcion: 'Nueva',
        numeroSerie: 'SN-2',
        capacidad: '16GB',
      }),
    );

    expect(result.isOk()).toBe(true);
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componente.id },
    });
    expect(fila).toMatchObject({
      descripcion: 'Nueva',
      numeroSerie: 'SN-2',
      capacidad: '16GB',
      deletedAt: null,
      bajaDestino: null,
      insumoId,
      equipoId,
    });
    expect(fila.updatedAt.getTime()).toBeGreaterThanOrEqual(componente.updatedAt.getTime());
  });

  it('un componente con unidad edita sus datos propios y deja numero_serie NULL (CHECK de la unidad)', async () => {
    const unidad = await tenantClient.unidadInsumo.create({
      data: {
        insumoId,
        numeroSerie: 'SN-U',
        numeroSerieNormalizado: `${PREFIJO}SN-U`,
        condicion: 'NUEVO',
        estado: 'INSTALADA',
        equipoId,
      },
    });
    const componente = await tenantClient.componenteEquipo.create({
      data: { equipoId, insumoId, unidadId: unidad.id, capacidad: '8GB' },
    });
    const useCase = new EditarComponenteUseCase(componenteRepo);

    const result = await conTenant(() =>
      useCase.execute({ equipoId, componenteId: componente.id, capacidad: '16GB' }),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue().numeroSerie).toBe('SN-U');
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componente.id },
    });
    expect(fila).toMatchObject({ capacidad: '16GB', numeroSerie: null, unidadId: unidad.id });
  });

  it('entidad leida antes de un retiro individual: ComponenteDadoDeBajaError y el retiro queda intacto', async () => {
    const componente = await crearComponente();
    const useCase = new EditarComponenteUseCase(
      repoQueSeRetiraDespuesDeLeer(componente.id, 'retiro individual'),
    );

    const result = await conTenant(() =>
      useCase.execute({ equipoId, componenteId: componente.id, descripcion: 'Edicion vieja' }),
    );

    expect(result.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componente.id },
    });
    expect(fila.deletedAt).not.toBeNull();
    expect(fila.bajaDestino).toBe('DESCARTE');
    expect(fila.bajaMotivo).toBe('retiro individual');
    expect(fila.descripcion).toBe('Original');
  });

  it('entidad leida antes de la baja del equipo: ComponenteDadoDeBajaError y el componente sigue retirado', async () => {
    const componente = await crearComponente();
    const base = repoQueSeRetiraDespuesDeLeer(componente.id, 'Baja del equipo');
    const useCase = new EditarComponenteUseCase({
      ...base,
      findById: async (id: string) => {
        const leido = await base.findById(id);
        await conTenant(async () => {
          const equipo = await equipoRepo.findById(equipoId);
          equipo!.darDeBaja({
            destino: 'DESCARTE',
            categoria: 'VEJEZ',
            usuarioId: USUARIO,
            fecha: new Date(),
          });
          await equipoRepo.registrarBaja(equipo!);
        });
        return leido;
      },
    });

    const result = await conTenant(() =>
      useCase.execute({ equipoId, componenteId: componente.id, capacidad: '32GB' }),
    );

    expect(result.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componente.id },
    });
    expect(fila.deletedAt).not.toBeNull();
    expect(fila.bajaMotivo).toBe('Baja del equipo');
    expect(fila.capacidad).toBe('8GB');
  });
});
