/**
 * [INTEGRATION] Permisos por tipo de ticket (odd/tasks/permisos-por-tipo-ticket.md, T4a) contra
 * Postgres REAL, en una base de INQUILINO EFÍMERA migrada con todas las migraciones: el CHECK de
 * `accion` contra `ACCIONES_TIPO_TICKET`, la PK por terna, el ida y vuelta del repositorio, el
 * reemplazo atómico, el alta idempotente, la cascada al borrar el tipo y el `rollback.sql`.
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar pool -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { ACCIONES_TIPO_TICKET } from '../../../domain/permisos-tipo-ticket';
import { PrismaPermisoTipoTicketRepository } from './prisma-permiso-tipo-ticket.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB = `soporte_permiso_tipo_${sufijo}_test`;
const CARPETA = path.resolve(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261021120000_permisos_tipo_ticket',
);
const USUARIO_1 = '11111111-1111-4111-8111-111111111111';
const USUARIO_2 = '22222222-2222-4222-8222-222222222222';

describe('PrismaPermisoTipoTicketRepository (T4a, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const repo = new PrismaPermisoTipoTicketRepository(tenantContext);

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: 'cliente-a' }, fn);

  async function crearTipo(codigo: string): Promise<string> {
    const tipo = await client.tipoTicket.create({
      data: { codigo, nombre: codigo, modulo: 'TICKETS' },
    });
    return tipo.id;
  }

  /** Lectura cruda de las filas del usuario, sin pasar por el repositorio bajo prueba. */
  async function filasDe(usuarioId: string): Promise<string[]> {
    const filas = await client.permisoTipoTicket.findMany({ where: { usuarioId } });
    return filas.map((f) => `${f.tipoId}:${f.accion}`).sort();
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);
  }, 120_000);

  afterAll(async () => {
    try {
      await client?.permisoTipoTicket.deleteMany();
      await client?.tipoTicket.deleteMany();
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
    await client.permisoTipoTicket.deleteMany();
    await client.tipoTicket.deleteMany();
  });

  describe('CHECK permisos_tipo_ticket_accion_check', () => {
    /**
     * El CHECK enumera valores que TypeScript también enumera. El riesgo es la DERIVA: sumar una
     * acción a `ACCIONES_TIPO_TICKET` sin migración deja el INSERT rechazado por la base.
     */
    it('el CHECK real enumera exactamente ACCIONES_TIPO_TICKET', async () => {
      const filas = await client.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conname = 'permisos_tipo_ticket_accion_check'`,
      );

      expect(filas).toHaveLength(1);
      const enLaDb = [...filas[0].def.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
      expect(enLaDb).toEqual([...ACCIONES_TIPO_TICKET].sort());
    });

    it('rechaza una acción fuera del vocabulario', async () => {
      const tipoId = await crearTipo('T-CHECK');

      await expect(
        client.permisoTipoTicket.create({
          data: { usuarioId: USUARIO_1, tipoId, accion: 'APROBACION' },
        }),
      ).rejects.toThrow(/permisos_tipo_ticket_accion_check/i);
      await expect(filasDe(USUARIO_1)).resolves.toEqual([]);
    });

    it('la PK impide repetir la misma terna por fuera del repo', async () => {
      const tipoId = await crearTipo('T-PK');
      await client.permisoTipoTicket.create({
        data: { usuarioId: USUARIO_1, tipoId, accion: 'LECTURA' },
      });

      await expect(
        client.permisoTipoTicket.create({
          data: { usuarioId: USUARIO_1, tipoId, accion: 'LECTURA' },
        }),
      ).rejects.toThrow();
    });
  });

  it('listarPorUsuario sin filas devuelve un mapa vacío', async () => {
    await expect(enTenant(() => repo.listarPorUsuario(USUARIO_1))).resolves.toEqual(new Map());
  });

  it('ida y vuelta: agrupa las acciones por tipo y solo las del usuario pedido', async () => {
    const soporte = await crearTipo('T-SOPORTE');
    const mantenimiento = await crearTipo('T-MANT');
    await enTenant(() =>
      repo.agregarSiFaltan([
        { usuarioId: USUARIO_1, tipoId: soporte, accion: 'LECTURA' },
        { usuarioId: USUARIO_1, tipoId: soporte, accion: 'MODIFICACION' },
        { usuarioId: USUARIO_1, tipoId: mantenimiento, accion: 'LECTURA' },
        { usuarioId: USUARIO_2, tipoId: mantenimiento, accion: 'BORRADO' },
      ]),
    );

    const porTipo = await enTenant(() => repo.listarPorUsuario(USUARIO_1));

    expect(porTipo).toEqual(
      new Map([
        [soporte, new Set(['LECTURA', 'MODIFICACION'])],
        [mantenimiento, new Set(['LECTURA'])],
      ]),
    );
  });

  it('reemplazarDeUsuario deja exactamente las filas nuevas y no toca a otros usuarios', async () => {
    const tipoA = await crearTipo('T-A');
    const tipoB = await crearTipo('T-B');
    await enTenant(() =>
      repo.agregarSiFaltan([
        { usuarioId: USUARIO_1, tipoId: tipoA, accion: 'LECTURA' },
        { usuarioId: USUARIO_1, tipoId: tipoA, accion: 'ASIGNAR' },
        { usuarioId: USUARIO_2, tipoId: tipoA, accion: 'LECTURA' },
      ]),
    );

    await enTenant(() =>
      repo.reemplazarDeUsuario(USUARIO_1, [
        { tipoId: tipoB, accion: 'ALTAS' },
        { tipoId: tipoB, accion: 'ALTAS' },
      ]),
    );

    await expect(filasDe(USUARIO_1)).resolves.toEqual([`${tipoB}:ALTAS`]);
    await expect(filasDe(USUARIO_2)).resolves.toEqual([`${tipoA}:LECTURA`]);
  });

  it('reemplazarDeUsuario con lista vacía deja al usuario sin permisos por tipo', async () => {
    const tipoId = await crearTipo('T-VACIO');
    await enTenant(() =>
      repo.agregarSiFaltan([{ usuarioId: USUARIO_1, tipoId, accion: 'LECTURA' }]),
    );

    await enTenant(() => repo.reemplazarDeUsuario(USUARIO_1, []));

    await expect(filasDe(USUARIO_1)).resolves.toEqual([]);
  });

  it('reemplazarDeUsuario es atómico: si falla el alta, quedan las filas anteriores', async () => {
    const tipoId = await crearTipo('T-ATOMICO');
    await enTenant(() =>
      repo.agregarSiFaltan([{ usuarioId: USUARIO_1, tipoId, accion: 'LECTURA' }]),
    );

    await expect(
      enTenant(() =>
        repo.reemplazarDeUsuario(USUARIO_1, [
          { tipoId: '99999999-9999-4999-8999-999999999999', accion: 'ALTAS' },
        ]),
      ),
    ).rejects.toThrow();

    await expect(filasDe(USUARIO_1)).resolves.toEqual([`${tipoId}:LECTURA`]);
  });

  it('agregarSiFaltan es idempotente y no pisa las filas existentes', async () => {
    const tipoId = await crearTipo('T-IDEM');
    const filas = [
      { usuarioId: USUARIO_1, tipoId, accion: 'LECTURA' as const },
      { usuarioId: USUARIO_1, tipoId, accion: 'IMPRESION' as const },
    ];

    await expect(enTenant(() => repo.agregarSiFaltan(filas))).resolves.toBe(2);
    await expect(enTenant(() => repo.agregarSiFaltan(filas))).resolves.toBe(0);
    await expect(
      enTenant(() =>
        repo.agregarSiFaltan([...filas, { usuarioId: USUARIO_1, tipoId, accion: 'ALTAS' }]),
      ),
    ).resolves.toBe(1);

    await expect(filasDe(USUARIO_1)).resolves.toEqual(
      [`${tipoId}:ALTAS`, `${tipoId}:IMPRESION`, `${tipoId}:LECTURA`].sort(),
    );
  });

  it('agregarSiFaltan sin filas no inserta nada', async () => {
    await expect(enTenant(() => repo.agregarSiFaltan([]))).resolves.toBe(0);
  });

  it('al borrar el tipo se borran sus permisos (ON DELETE CASCADE)', async () => {
    const borrado = await crearTipo('T-BORRADO');
    const queda = await crearTipo('T-QUEDA');
    await enTenant(() =>
      repo.agregarSiFaltan([
        { usuarioId: USUARIO_1, tipoId: borrado, accion: 'LECTURA' },
        { usuarioId: USUARIO_1, tipoId: queda, accion: 'LECTURA' },
      ]),
    );

    await client.tipoTicket.delete({ where: { id: borrado } });

    await expect(filasDe(USUARIO_1)).resolves.toEqual([`${queda}:LECTURA`]);
  });

  it('rollback.sql elimina la tabla y es re-ejecutable', async () => {
    const rollback = fs.readFileSync(path.join(CARPETA, 'rollback.sql'), 'utf8');

    await client.$executeRawUnsafe(rollback);
    await client.$executeRawUnsafe(rollback);

    const filas = await client.$queryRawUnsafe<{ existe: boolean }[]>(
      `SELECT to_regclass('permisos_tipo_ticket') IS NOT NULL AS existe`,
    );
    expect(filas[0].existe).toBe(false);
  });
});
