/**
 * N9 [INTEGRATION] — RED→GREEN: PrismaUsuarioContactoResolver — resolución
 * cross-DB de contacto (N4) contra Postgres REAL (`soporte_master_test`,
 * sin mocks de Prisma). Mismo patrón que
 * `usuario-master.checker.integration.spec.ts`.
 *
 * Ref spec: sdd/premium/spec N4. Ref design: ADR-P8. Tarea: N9/N10.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaUsuarioContactoResolver } from './prisma-usuario-contacto-resolver';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('PrismaUsuarioContactoResolver — integration (N4)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let resolver: PrismaUsuarioContactoResolver;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    resolver = new PrismaUsuarioContactoResolver(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  async function createCliente(suffix: string) {
    return masterClient.cliente.create({
      data: { nombre: `Contacto Cliente ${suffix}`, dbName: `contacto_${suffix}` },
    });
  }

  async function createRole(codigo: string) {
    return masterClient.role.create({ data: { codigo, nombre: codigo } });
  }

  async function createUsuario(
    suffix: string,
    activo = true,
    deletedAt: Date | null = null,
    email?: string,
  ) {
    return masterClient.usuario.create({
      data: {
        email: email ?? `contacto_${suffix}@integration.test`,
        nombre: 'Nombre',
        apellido: `Apellido${suffix}`,
        passwordHash: 'hash-fake',
        activo,
        deletedAt,
      },
    });
  }

  async function createMembresia(
    usuarioId: string,
    clienteId: string,
    rolId: string,
    activo = true,
    deletedAt: Date | null = null,
  ) {
    return masterClient.membresia.create({
      data: { usuarioId, clienteId, rolId, activo, deletedAt },
    });
  }

  describe('resolverContacto()', () => {
    it('usuario existente → { email, nombre }', async () => {
      const usuario = await createUsuario('contacto-1', true, null, 'usuario1@empresa.com');

      const contacto = await resolver.resolverContacto(usuario.id);

      expect(contacto).toEqual({ email: 'usuario1@empresa.com', nombre: 'Nombre' });
    });

    it('usuario soft-deleted → null', async () => {
      const usuario = await createUsuario('contacto-deleted', true, new Date());

      const contacto = await resolver.resolverContacto(usuario.id);

      expect(contacto).toBeNull();
    });

    it('usuario inexistente → null', async () => {
      const contacto = await resolver.resolverContacto('00000000-0000-0000-0000-000000000000');

      expect(contacto).toBeNull();
    });
  });

  describe('resolverAdministradores()', () => {
    it('retorna los usuarios con membresía ACTIVA + rol ADMINISTRADOR + usuario activo', async () => {
      const cliente = await createCliente('admins-1');
      const rolAdmin = await createRole('ADMINISTRADOR');
      const admin = await createUsuario('admin-1', true, null, 'admin1@empresa.com');
      await createMembresia(admin.id, cliente.id, rolAdmin.id, true);

      const admins = await resolver.resolverAdministradores(cliente.id);

      expect(admins).toEqual([{ email: 'admin1@empresa.com', nombre: 'Nombre' }]);
    });

    it('excluye membresías inactivas', async () => {
      const cliente = await createCliente('admins-inactiva');
      const rolAdmin = await createRole('ADMINISTRADOR_INACTIVA');
      const admin = await createUsuario('admin-inactiva');
      await createMembresia(admin.id, cliente.id, rolAdmin.id, false);

      const admins = await resolver.resolverAdministradores(cliente.id);

      expect(admins).toEqual([]);
    });

    it('excluye usuarios con activo=false', async () => {
      const cliente = await createCliente('admins-usuario-inactivo');
      const rolAdmin = await createRole('ADMINISTRADOR_USR_INACTIVO');
      const admin = await createUsuario('admin-usr-inactivo', false);
      await createMembresia(admin.id, cliente.id, rolAdmin.id, true);

      const admins = await resolver.resolverAdministradores(cliente.id);

      expect(admins).toEqual([]);
    });

    it('excluye roles distintos de ADMINISTRADOR', async () => {
      const cliente = await createCliente('admins-otro-rol');
      const rolTecnico = await createRole('TECNICO_ADMINS_TEST');
      const tecnico = await createUsuario('tecnico-admins-test');
      await createMembresia(tecnico.id, cliente.id, rolTecnico.id, true);

      const admins = await resolver.resolverAdministradores(cliente.id);

      expect(admins).toEqual([]);
    });

    it('aislamiento cross-tenant: administrador de cliente A no aparece en cliente B', async () => {
      const clienteA = await createCliente('admins-cross-a');
      const clienteB = await createCliente('admins-cross-b');
      const rolAdmin = await createRole('ADMINISTRADOR_CROSS');
      const admin = await createUsuario('admin-cross');
      await createMembresia(admin.id, clienteA.id, rolAdmin.id, true);

      const admins = await resolver.resolverAdministradores(clienteB.id);

      expect(admins).toEqual([]);
    });
  });
});
