/**
 * [INTEGRATION] Historial del valor de un equipo (odd/tasks/historial-valor-residual.md, S2 y S3)
 * contra Postgres REAL, en una base de INQUILINO EFÍMERA migrada con todas las migraciones:
 * - `PrismaValoracionEquipoRepository`: upsert por equipo y día, orden por fecha, fechas `@db.Date`.
 * - `CrearEquipoUseCase` / `EditarEquipoUseCase` con los repositorios reales y la transacción real:
 *   qué guardados registran, el reemplazo del mismo día y el rollback si el registro falla.
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar clientes -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { unstubbed } from '../../../../testing/mocks';
import { PrismaEquipoInformaticoRepository } from './prisma-equipo-informatico.repository';
import { PrismaValoracionEquipoRepository } from './prisma-valoracion-equipo.repository';
import { CrearEquipoUseCase } from '../../../application/use-cases/crear-equipo.use-case';
import { EditarEquipoUseCase } from '../../../application/use-cases/editar-equipo.use-case';
import { claveDiaCalendario } from '../../../domain/entities/valoracion-equipo';
import type { IValoracionEquipoRepository } from '../../../domain/ports/i-valoracion-equipo.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_valoraciones_${randomBytes(4).toString('hex')}_test`;
const ANA = '01900000-0000-7000-8000-0000000000d1';
const BETO = '01900000-0000-7000-8000-0000000000d2';

/** Fecha de calendario como la manda el controller (`new Date('YYYY-MM-DD')`): medianoche UTC. */
const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('Historial del valor de un equipo — repositorio y casos de uso (tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
  const valoracionRepo = new PrismaValoracionEquipoRepository(tenantContext);
  const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
  const catalogo = { findById: unstubbed('modelo') };

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: 'cliente-a' }, fn);

  const crear = (valoraciones: Pick<IValoracionEquipoRepository, 'registrar'> = valoracionRepo) =>
    new CrearEquipoUseCase(equipoRepo, txRunner, catalogo, valoraciones);
  const editar = (valoraciones: Pick<IValoracionEquipoRepository, 'registrar'> = valoracionRepo) =>
    new EditarEquipoUseCase(equipoRepo, txRunner, catalogo, valoraciones);

  /** Historial del equipo leído directo de la base, con la fecha como texto (sin pasar por `Date`). */
  async function filas(equipoId: string) {
    return client.$queryRaw<
      { fecha: string; importe: string; origen: string; usuario_id: string | null }[]
    >`SELECT fecha::text AS fecha, importe::text AS importe, origen, usuario_id
        FROM equipo_valoraciones WHERE equipo_id = ${equipoId}::uuid ORDER BY fecha`;
  }

  async function equipoEnBase(nombre: string, datos: { valorResidual?: number; fecha?: string }) {
    const fila = await client.equipoInformatico.create({
      data: {
        nombre,
        valorResidual: datos.valorResidual ?? null,
        fechaValorResidual: datos.fecha ? dia(datos.fecha) : null,
      },
    });
    return fila.id;
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);
  }, 120_000);

  afterAll(async () => {
    try {
      await client?.valoracionEquipo.deleteMany();
      await client?.equipoInformatico.deleteMany();
    } catch {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB);
  }, 60_000);

  beforeEach(async () => {
    await client.valoracionEquipo.deleteMany();
    await client.equipoInformatico.deleteMany();
  });

  describe('PrismaValoracionEquipoRepository', () => {
    it('registrar en un día nuevo agrega una fila MANUAL con el usuario', async () => {
      const equipoId = await equipoEnBase('Repo alta', {});

      await enTenant(() =>
        valoracionRepo.registrar({
          equipoId,
          fecha: dia('2026-10-24'),
          importe: 700.25,
          usuarioId: ANA,
        }),
      );

      expect(await filas(equipoId)).toEqual([
        { fecha: '2026-10-24', importe: '700.25', origen: 'MANUAL', usuario_id: ANA },
      ]);
    });

    it('registrar el mismo día reemplaza importe, usuario y updated_at, también sobre una fila de migración', async () => {
      const equipoId = await equipoEnBase('Repo mismo dia', {});
      await client.$executeRaw`
        INSERT INTO equipo_valoraciones (equipo_id, fecha, importe, origen, updated_at)
        VALUES (${equipoId}::uuid, '2026-10-24', 1000, 'MIGRACION', '2026-01-01T00:00:00Z')`;
      const antes = await client.valoracionEquipo.findFirstOrThrow({ where: { equipoId } });

      await enTenant(() =>
        valoracionRepo.registrar({
          equipoId,
          fecha: dia('2026-10-24'),
          importe: 650,
          usuarioId: BETO,
        }),
      );

      expect(await filas(equipoId)).toEqual([
        { fecha: '2026-10-24', importe: '650.00', origen: 'MANUAL', usuario_id: BETO },
      ]);
      const despues = await client.valoracionEquipo.findFirstOrThrow({ where: { equipoId } });
      expect(despues.id).toBe(antes.id);
      expect(despues.createdAt.getTime()).toBe(antes.createdAt.getTime());
      expect(despues.updatedAt.getTime()).toBeGreaterThan(antes.updatedAt.getTime());
    });

    it('listarPorEquipo devuelve solo ese equipo, por fecha ascendente, con el día intacto', async () => {
      const equipoId = await equipoEnBase('Repo orden', {});
      const otroId = await equipoEnBase('Repo otro', {});
      // Insertadas fuera de orden: el orden lo pone la consulta, no la inserción.
      for (const [fecha, importe] of [
        ['2026-10-24', 490],
        ['2026-01-10', 1000],
        ['2026-06-01', 700],
      ] as const) {
        await enTenant(() =>
          valoracionRepo.registrar({ equipoId, fecha: dia(fecha), importe, usuarioId: ANA }),
        );
      }
      await enTenant(() =>
        valoracionRepo.registrar({
          equipoId: otroId,
          fecha: dia('2026-03-03'),
          importe: 1,
          usuarioId: ANA,
        }),
      );

      const historial = await enTenant(() => valoracionRepo.listarPorEquipo(equipoId));

      // La suite corre con TZ de Argentina: leer el día con getters locales daría el anterior.
      expect(
        historial.map((v) => ({
          dia: claveDiaCalendario(v.fecha),
          importe: v.importe,
          origen: v.origen,
          usuarioId: v.usuarioId,
          equipoId: v.equipoId,
        })),
      ).toEqual([
        { dia: '2026-01-10', importe: 1000, origen: 'MANUAL', usuarioId: ANA, equipoId },
        { dia: '2026-06-01', importe: 700, origen: 'MANUAL', usuarioId: ANA, equipoId },
        { dia: '2026-10-24', importe: 490, origen: 'MANUAL', usuarioId: ANA, equipoId },
      ]);
    });

    it('listarPorEquipo de un equipo sin historial devuelve un arreglo vacío', async () => {
      const equipoId = await equipoEnBase('Repo vacio', {});

      await expect(enTenant(() => valoracionRepo.listarPorEquipo(equipoId))).resolves.toEqual([]);
    });
  });

  describe('casos de uso con la transacción real (S2, S3)', () => {
    it('el alta con valor residual y fecha registra la valoración con el actor', async () => {
      const result = await enTenant(() =>
        crear().execute({
          usuarioId: ANA,
          nombre: 'Alta con valor',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          importe: 1000,
          fechaValoracion: dia('2026-10-01'),
          valorResidual: 700,
          fechaValorResidual: dia('2026-10-24'),
        }),
      );

      expect(result.isOk()).toBe(true);
      expect(await filas(result.getValue().id)).toEqual([
        { fecha: '2026-10-24', importe: '700.00', origen: 'MANUAL', usuario_id: ANA },
      ]);
    });

    it('editar: cambio de valor registra, mismo día reemplaza, sin cambio y vaciar no registran', async () => {
      const equipoId = await equipoEnBase('Edicion', { valorResidual: 1000, fecha: '2026-01-10' });
      const ejecutar = (datos: Parameters<EditarEquipoUseCase['execute']>[0]) =>
        enTenant(() => editar().execute(datos));

      await ejecutar({
        usuarioId: ANA,
        equipoId,
        valorResidual: 700,
        fechaValorResidual: dia('2026-10-24'),
      });
      await ejecutar({ usuarioId: BETO, equipoId, valorResidual: 490 });
      await ejecutar({ usuarioId: ANA, equipoId, nombre: 'Edicion renombrado', importe: 2000 });
      await ejecutar({
        usuarioId: ANA,
        equipoId,
        valorResidual: null,
        fechaValorResidual: null,
      });

      expect(await filas(equipoId)).toEqual([
        { fecha: '2026-10-24', importe: '490.00', origen: 'MANUAL', usuario_id: BETO },
      ]);
      const equipo = await client.equipoInformatico.findUniqueOrThrow({ where: { id: equipoId } });
      expect(equipo.nombre).toBe('Edicion renombrado');
      expect(equipo.valorResidual).toBeNull();
    });

    it('si el registro falla, la edición del equipo hace rollback', async () => {
      const equipoId = await equipoEnBase('Rollback', { valorResidual: 1000, fecha: '2026-01-10' });
      const falla = {
        registrar: async (): Promise<void> => {
          throw new Error('fallo al registrar');
        },
      };

      await expect(
        enTenant(() =>
          editar(falla).execute({
            usuarioId: ANA,
            equipoId,
            nombre: 'No debe quedar',
            valorResidual: 700,
            fechaValorResidual: dia('2026-10-24'),
          }),
        ),
      ).rejects.toThrow('fallo al registrar');

      const equipo = await client.equipoInformatico.findUniqueOrThrow({ where: { id: equipoId } });
      expect(equipo.nombre).toBe('Rollback');
      expect(Number(equipo.valorResidual)).toBe(1000);
      expect(equipo.fechaValorResidual?.toISOString().slice(0, 10)).toBe('2026-01-10');
      expect(await filas(equipoId)).toEqual([]);
    });

    it('si el registro falla, el alta no deja el equipo creado', async () => {
      const falla = {
        registrar: async (): Promise<void> => {
          throw new Error('fallo al registrar');
        },
      };

      await expect(
        enTenant(() =>
          crear(falla).execute({
            usuarioId: ANA,
            nombre: 'Alta revertida',
            numeroSerie: null,
            marca: null,
            modelo: null,
            fechaAdquisicion: null,
            valorResidual: 700,
            fechaValorResidual: dia('2026-10-24'),
          }),
        ),
      ).rejects.toThrow('fallo al registrar');

      await expect(
        client.equipoInformatico.count({ where: { nombre: 'Alta revertida' } }),
      ).resolves.toBe(0);
    });
  });
});
