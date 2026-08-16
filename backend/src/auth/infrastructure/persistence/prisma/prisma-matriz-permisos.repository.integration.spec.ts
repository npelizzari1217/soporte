/**
 * prisma-matriz-permisos.repository.integration.spec.ts — WU-3
 * (sdd/matriz-permisos-por-usuario).
 *
 * Integration contra Postgres real (soporte_master_test): `setPermisos` es
 * reemplazo atómico e idempotente sobre la celda `(usuario, cliente)`, sin
 * tocar a otro usuario ni al mismo usuario en otro cliente; `findByUsuarioYCliente`
 * devuelve `string[]` de códigos `MODULO:ACCION`.
 *
 * Precedente: `prisma-auth-repos.integration.spec.ts` (fixtures de usuario/cliente).
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R2. Ref design: ADR-P3, ADR-P10.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from './prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

describe('PrismaMatrizPermisosRepository — Integration (WU-3)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let repo: PrismaMatrizPermisosRepository;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    repo = new PrismaMatrizPermisosRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE usuario_cliente_permisos, membresias, refresh_tokens, roles_permisos, usuarios, clientes, roles, permisos RESTART IDENTITY CASCADE',
    );
  });

  async function createTestCliente(suffix: string): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `TestCliente ${suffix}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_matriz_repo_${suffix}`,
      activo: true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function createTestUsuario(suffix: string): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `user_matriz_${suffix}@integration.test`,
      nombre: 'Test',
      apellido: 'Usuario',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$test$hash',
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  it('findByUsuarioYCliente retorna [] cuando el usuario no tiene celdas', async () => {
    const usuario = await createTestUsuario('sin-celdas');
    const cliente = await createTestCliente('sin-celdas');

    const celdas = await repo.findByUsuarioYCliente(usuario.id, cliente.id);
    expect(celdas).toEqual([]);
  });

  it('setPermisos persiste las celdas, recuperables vía findByUsuarioYCliente', async () => {
    const usuario = await createTestUsuario('con-celdas');
    const cliente = await createTestCliente('con-celdas');

    await repo.setPermisos(usuario.id, cliente.id, ['TICKETS:LECTURA', 'TICKETS:ALTAS']);

    const celdas = await repo.findByUsuarioYCliente(usuario.id, cliente.id);
    expect(celdas.sort()).toEqual(['TICKETS:ALTAS', 'TICKETS:LECTURA']);
  });

  it('setPermisos es REEMPLAZO total: la segunda llamada pisa la primera, no fusiona', async () => {
    const usuario = await createTestUsuario('reemplazo');
    const cliente = await createTestCliente('reemplazo');

    await repo.setPermisos(usuario.id, cliente.id, ['TICKETS:LECTURA', 'TICKETS:ALTAS']);
    await repo.setPermisos(usuario.id, cliente.id, ['KB:LECTURA']);

    const celdas = await repo.findByUsuarioYCliente(usuario.id, cliente.id);
    expect(celdas).toEqual(['KB:LECTURA']);
  });

  it('setPermisos con array vacío deja al usuario sin celdas (0 filas, no crashea)', async () => {
    const usuario = await createTestUsuario('vacio');
    const cliente = await createTestCliente('vacio');

    await repo.setPermisos(usuario.id, cliente.id, ['TICKETS:LECTURA']);
    await repo.setPermisos(usuario.id, cliente.id, []);

    const celdas = await repo.findByUsuarioYCliente(usuario.id, cliente.id);
    expect(celdas).toEqual([]);
  });

  it('setPermisos es idempotente: llamar dos veces con el mismo set no duplica filas', async () => {
    const usuario = await createTestUsuario('idempotente');
    const cliente = await createTestCliente('idempotente');

    await repo.setPermisos(usuario.id, cliente.id, ['TICKETS:LECTURA', 'TICKETS:ALTAS']);
    await repo.setPermisos(usuario.id, cliente.id, ['TICKETS:LECTURA', 'TICKETS:ALTAS']);

    const celdas = await repo.findByUsuarioYCliente(usuario.id, cliente.id);
    expect(celdas.sort()).toEqual(['TICKETS:ALTAS', 'TICKETS:LECTURA']);
  });

  it('AISLAMIENTO: setPermisos NO toca las celdas de OTRO usuario', async () => {
    const usuarioA = await createTestUsuario('aislamiento-a');
    const usuarioB = await createTestUsuario('aislamiento-b');
    const cliente = await createTestCliente('aislamiento-usuarios');

    await repo.setPermisos(usuarioA.id, cliente.id, ['TICKETS:LECTURA']);
    await repo.setPermisos(usuarioB.id, cliente.id, ['COMPRAS:LECTURA']);
    await repo.setPermisos(usuarioA.id, cliente.id, ['TICKETS:ALTAS']);

    const celdasA = await repo.findByUsuarioYCliente(usuarioA.id, cliente.id);
    const celdasB = await repo.findByUsuarioYCliente(usuarioB.id, cliente.id);
    expect(celdasA).toEqual(['TICKETS:ALTAS']);
    expect(celdasB).toEqual(['COMPRAS:LECTURA']);
  });

  it('AISLAMIENTO: setPermisos NO toca las celdas del MISMO usuario en OTRO cliente', async () => {
    const usuario = await createTestUsuario('multi-cliente');
    const clienteA = await createTestCliente('multi-cliente-a');
    const clienteB = await createTestCliente('multi-cliente-b');

    await repo.setPermisos(usuario.id, clienteA.id, ['TICKETS:LECTURA']);
    await repo.setPermisos(usuario.id, clienteB.id, ['COMPRAS:LECTURA']);
    await repo.setPermisos(usuario.id, clienteA.id, ['TICKETS:ALTAS']);

    const celdasA = await repo.findByUsuarioYCliente(usuario.id, clienteA.id);
    const celdasB = await repo.findByUsuarioYCliente(usuario.id, clienteB.id);
    expect(celdasA).toEqual(['TICKETS:ALTAS']);
    expect(celdasB).toEqual(['COMPRAS:LECTURA']);
  });
});
