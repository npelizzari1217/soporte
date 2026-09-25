/**
 * importar-legacy.integration.spec.ts — corrida completa del cargador contra
 * `soporte_master_test` y una base tenant EFÍMERA registrada como cliente:
 * simulación, `--aplicar`, re-corrida idempotente, conflictos y ausencia de
 * efectos laterales (eventos, correos, encuestas).
 */
import { randomBytes } from 'crypto';
import { PostgresAdminService } from '../../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../../src/clientes/infrastructure/tenant-seeder.adapter';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import {
  URL_MASTER_TEST_POR_DEFECTO,
  usarLockMasterTest,
} from '../../src/testing/lock-master-test';
import { importar } from './importar-legacy';
import { fechaDia } from './paquete';
import { paqueteSintetico } from './paquete-sintetico.fixture';

const { createTransport } = vi.hoisted(() => ({ createTransport: vi.fn() }));
vi.mock('nodemailer', () => ({ createTransport, default: { createTransport } }));

const MASTER_URL = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const DB = `soporte_prov_legacy_${randomBytes(4).toString('hex')}_test`;
const CLIENTE = 'Cliente Legacy E2E';

usarLockMasterTest();

describe('importar (integración: master de test + tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_URL);
  let prisma: PrismaService;
  const lineas: string[] = [];
  const correr = (aplicar: boolean, paquete = paqueteSintetico()) =>
    importar(prisma, paquete, CLIENTE, aplicar, (l) => lineas.push(l));

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_URL).run(DB);
    await new TenantSeederAdapter(MASTER_URL).seed(DB);
    prisma = new PrismaService(MASTER_URL);
  }, 90_000);

  afterAll(async () => {
    const tenant = prisma?.getTenantClient(DB);
    await tenant?.operacionTicket.deleteMany();
    await tenant?.ticketSoporte.deleteMany();
    await tenant?.ticket.deleteMany();
    await tenant?.cicloCliente.deleteMany();
    await prisma?.onModuleDestroy();
    await admin.dropDatabase(DB);
  }, 60_000);

  beforeEach(async () => {
    const master = prisma.getMasterClient();
    const tenant = prisma.getTenantClient(DB);
    await master.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles, ciclos_vigentes, encuesta_tokens RESTART IDENTITY CASCADE',
    );
    await tenant.operacionTicket.deleteMany();
    await tenant.ticketSoporte.deleteMany();
    await tenant.ticket.deleteMany();
    await tenant.cicloCliente.deleteMany();
    await master.role.createMany({
      data: ['USUARIO', 'COLABORADOR', 'TECNICO', 'ADMINISTRADOR'].map((codigo) => ({
        codigo,
        nombre: codigo,
      })),
    });
    await master.cliente.create({ data: { nombre: CLIENTE, dbName: DB } });
    await master.usuario.create({
      data: {
        email: 'existente@legacy.test',
        nombre: 'Ana',
        apellido: 'Previa',
        passwordHash: 'hash-original',
      },
    });
    const dias = { fechaInicio: fechaDia('2026-01-01'), fechaFin: fechaDia('2026-12-31') };
    const vigente = await master.cicloVigente.create({
      data: { nombre: 'Vigente 2026', ...dias, activo: true },
    });
    await tenant.cicloCliente.create({
      data: { cicloVigenteId: vigente.id, nombre: 'Del cliente 2026', ...dias, activo: true },
    });
    lineas.length = 0;
    createTransport.mockClear();
  });

  async function foto() {
    const master = prisma.getMasterClient();
    const tenant = prisma.getTenantClient(DB);
    return {
      usuarios: await master.usuario.count(),
      membresias: await master.membresia.count(),
      vigentes: await master.cicloVigente.count(),
      ciclos: await tenant.cicloCliente.count(),
      tickets: await tenant.ticket.count(),
      operaciones: await tenant.operacionTicket.count(),
    };
  }

  it('[CRITICAL] simulación no escribe nada e informa lo que haría', async () => {
    const antes = await foto();

    const r = await correr(false);

    expect(await foto()).toEqual(antes);
    expect(r).toEqual({ conflictos: [], master: null, tenant: null });
    expect(lineas[0]).toBe(`Cliente destino: ${CLIENTE} (base ${DB})`);
    expect(lineas).toContain(
      'Tickets: 2 en el paquete; a insertar 2 con 3 comentario(s); ya existian 0',
    );
  });

  it('[CRITICAL] --aplicar carga el paquete sin efectos laterales: ni correos, ni encuestas, ni SLA, ni operaciones de alta', async () => {
    const r = await correr(true);

    expect(r.master).toMatchObject({
      usuariosCreados: 2,
      membresiasAgregadas: 3,
      vigentesCreados: 1,
    });
    expect(r.tenant).toMatchObject({
      ciclosCreados: 1,
      ticketsInsertados: 2,
      comentariosInsertados: 3,
    });
    const tenant = prisma.getTenantClient(DB);
    expect(
      await tenant.ticket.count({ where: { numero: { startsWith: 'ANT-' }, slaVenceAt: null } }),
    ).toBe(2);
    expect(await tenant.cicloCliente.count({ where: { activo: true } })).toBe(1);
    const tipos = await tenant.operacionTicket.findMany({
      select: { tipoOperacion: { select: { codigo: true } } },
    });
    expect(new Set(tipos.map((t) => t.tipoOperacion.codigo))).toEqual(new Set(['COMENTARIO']));
    expect(await tenant.encuestaSatisfaccion.count()).toBe(0);
    expect(await prisma.getMasterClient().encuestaToken.count()).toBe(0);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('[CRITICAL] segundo --aplicar no inserta nada', async () => {
    await correr(true);
    const antes = await foto();

    const r = await correr(true);

    expect(await foto()).toEqual(antes);
    expect(r.tenant).toMatchObject({
      ciclosCreados: 0,
      ticketsInsertados: 0,
      yaExistian: ['ANT-1', 'ANT-2'],
    });
    expect(r.master).toMatchObject({
      usuariosCreados: 0,
      membresiasAgregadas: 0,
      vigentesCreados: 0,
    });
  });

  it('con un conflicto, --aplicar no escribe nada y lo informa', async () => {
    const paquete = paqueteSintetico();
    paquete.tickets[0].prioridadNombre = 'Urgentisima';
    const antes = await foto();

    const r = await correr(true, paquete);

    expect(r.conflictos).toEqual(['prioridad "Urgentisima" no existe en el tenant']);
    expect(await foto()).toEqual(antes);
    expect(lineas).toContain('Hay conflictos: no se escribio nada.');
  });

  it('cliente inexistente → conflicto, sin tocar ninguna base', async () => {
    const r = await importar(prisma, paqueteSintetico(), 'No existe', true, () => undefined);
    expect(r.conflictos[0]).toMatch(/coincide con 0 clientes/);
  });

  it('cliente inexistente → el conflicto se informa en el log (el CLI no sale en silencio)', async () => {
    const log: string[] = [];
    const r = await importar(prisma, paqueteSintetico(), 'No existe', false, (l) => log.push(l));
    expect(log).toEqual([`CONFLICTO: ${r.conflictos[0]}`]);
  });
});
