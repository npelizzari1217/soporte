/**
 * master.integration.spec.ts — lado MASTER del cargador legacy contra
 * `soporte_master_test`: cliente destino, usuarios (reusados sin tocar o
 * creados sin acceso), membresías con preset y ciclos vigentes.
 */
import { Argon2HashProvider } from '../../src/auth/infrastructure/argon2-hash.provider';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import type { MasterPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';
import {
  URL_MASTER_TEST_POR_DEFECTO,
  usarLockMasterTest,
} from '../../src/testing/lock-master-test';
import {
  aplicarMaster,
  leerCiclosVigentes,
  leerRoles,
  leerUsuariosExistentes,
  PASSWORD_HASH_SIN_ACCESO,
  resolverCliente,
  type ClienteDestino,
} from './master';
import { fechaDia } from './paquete';
import { paqueteSintetico } from './paquete-sintetico.fixture';
import { planificarCiclos, planificarUsuarios } from './plan';

const MASTER_URL = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const NOMBRE_CLIENTE = 'Cliente Legacy IT';

usarLockMasterTest();

describe('importacion legacy — lado master (integración)', () => {
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let cliente: ClienteDestino;

  beforeAll(() => {
    prismaService = new PrismaService(MASTER_URL);
    master = prismaService.getMasterClient();
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await master.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles, ciclos_vigentes RESTART IDENTITY CASCADE',
    );
    await master.role.createMany({
      data: ['USUARIO', 'COLABORADOR', 'TECNICO', 'ADMINISTRADOR'].map((codigo) => ({
        codigo,
        nombre: codigo,
      })),
    });
    cliente = await master.cliente.create({
      data: { nombre: NOMBRE_CLIENTE, dbName: 'soporte_prov_legacy_00000000_test' },
      select: { id: true, nombre: true, dbName: true },
    });
    await master.usuario.create({
      data: {
        email: 'existente@legacy.test',
        nombre: 'Original',
        apellido: 'Intacto',
        passwordHash: 'hash-original',
      },
    });
    await master.cicloVigente.create({
      data: {
        nombre: 'Otro nombre 2026',
        fechaInicio: fechaDia('2026-01-01'),
        fechaFin: fechaDia('2026-12-31'),
        activo: true,
      },
    });
  });

  async function correr() {
    const paquete = paqueteSintetico();
    const existentes = await leerUsuariosExistentes(
      master,
      paquete.usuarios.map((u) => u.email),
      cliente.id,
    );
    const usuarios = planificarUsuarios(paquete.usuarios, existentes);
    const ciclos = planificarCiclos(paquete.ciclos, await leerCiclosVigentes(master), []);
    const resultado = await aplicarMaster(
      master,
      cliente,
      paquete.usuarios,
      usuarios.plan,
      ciclos.plan,
      await leerRoles(master),
    );
    return { usuarios, resultado };
  }

  it('resolverCliente exige coincidencia EXACTA con un único cliente no borrado', async () => {
    expect((await resolverCliente(master, NOMBRE_CLIENTE)).getValue().id).toBe(cliente.id);
    expect((await resolverCliente(master, 'cliente legacy it')).isFail()).toBe(true);
    await master.cliente.create({
      data: { nombre: NOMBRE_CLIENTE, dbName: 'otra_base_borrada', deletedAt: new Date() },
    });
    expect((await resolverCliente(master, NOMBRE_CLIENTE)).isOk()).toBe(true);
    await master.cliente.create({ data: { nombre: NOMBRE_CLIENTE, dbName: 'otra_base_viva' } });
    expect((await resolverCliente(master, NOMBRE_CLIENTE)).isFail()).toBe(true);
  });

  it('[CRITICAL] usuario existente por email se reusa sin tocar nombre, rol ni contraseña; recibe membresía y preset', async () => {
    const { resultado } = await correr();

    const existente = await master.usuario.findUniqueOrThrow({
      where: { email: 'existente@legacy.test' },
      include: { membresias: { include: { rol: true } } },
    });
    expect(existente).toMatchObject({
      nombre: 'Original',
      apellido: 'Intacto',
      passwordHash: 'hash-original',
    });
    expect(existente.membresias.map((m) => [m.clienteId, m.rol.codigo, m.activo])).toEqual([
      [cliente.id, 'USUARIO', true],
    ]);
    expect(
      await master.usuarioClientePermiso.count({ where: { usuarioId: existente.id } }),
    ).toBeGreaterThan(0);
    expect(resultado).toMatchObject({
      usuariosCreados: 2,
      membresiasAgregadas: 3,
      vigentesCreados: 1,
    });
  });

  it('[CRITICAL] usuario nuevo se crea activo, con el rol del paquete y SIN acceso: ninguna contraseña valida', async () => {
    await correr();

    const tecnico = await master.usuario.findUniqueOrThrow({
      where: { email: 'tecnico@legacy.test' },
      include: { membresias: { include: { rol: true } } },
    });
    expect(tecnico).toMatchObject({
      activo: true,
      isGlobalAdmin: false,
      passwordHash: PASSWORD_HASH_SIN_ACCESO,
    });
    expect(tecnico.membresias.map((m) => m.rol.codigo)).toEqual(['TECNICO']);
    const hash = new Argon2HashProvider();
    for (const intento of ['', PASSWORD_HASH_SIN_ACCESO, 'sin-acceso']) {
      await expect(hash.verify(intento, tecnico.passwordHash)).resolves.toBe(false);
    }
    expect(await master.usuario.count({ where: { email: 'legacy-12@importado.invalid' } })).toBe(1);
  });

  it('ciclo vigente con las mismas fechas se reusa sin activarlo ni desactivarlo; el faltante nace inactivo', async () => {
    await correr();

    const vigentes = await master.cicloVigente.findMany({ orderBy: { fechaInicio: 'asc' } });
    expect(vigentes.map((v) => [v.nombre, v.activo])).toEqual([
      ['Ciclo 2024', false],
      ['Otro nombre 2026', true],
    ]);
  });

  it('[CRITICAL] segunda corrida es idempotente: no crea usuarios, membresías ni ciclos', async () => {
    await correr();
    const antes = [
      await master.usuario.count(),
      await master.membresia.count(),
      await master.cicloVigente.count(),
    ];

    const { usuarios, resultado } = await correr();

    expect([
      await master.usuario.count(),
      await master.membresia.count(),
      await master.cicloVigente.count(),
    ]).toEqual(antes);
    expect(resultado).toMatchObject({
      usuariosCreados: 0,
      membresiasAgregadas: 0,
      vigentesCreados: 0,
    });
    expect(usuarios.plan.every((p) => p.accion === 'reusar' && p.membresia === 'activa')).toBe(
      true,
    );
  });
});
