/**
 * usuario-master.checker.integration.spec.ts — TDD RED phase (PR1
 * tickets-core, alcance ampliado a pedido explícito: IUsuarioMasterChecker
 * pull-forward de PR5/T5.5).
 *
 * Integration contra Postgres REAL (`soporte_master_test`) — sin mocks de
 * Prisma. Ejercita el JOIN usuario→membresia real del schema de Fase 1
 * (N:N vía Membresia, sin columna `usuarios.cliente_id`).
 *
 * Ref design: ADR-8, Firmas TS (IUsuarioMasterChecker). Ref spec: T14, T15.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { UsuarioMasterChecker } from './usuario-master.checker';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

describe('UsuarioMasterChecker — integration (T14, T15)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let checker: UsuarioMasterChecker;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    checker = new UsuarioMasterChecker(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  // ─── Fixtures ─────────────────────────────────────────────────────────

  async function createCliente(suffix: string) {
    return masterClient.cliente.create({
      data: { nombre: `Checker Cliente ${suffix}`, dbName: `checker_${suffix}` },
    });
  }

  async function createRole(codigo: string) {
    return masterClient.role.create({ data: { codigo, nombre: codigo } });
  }

  async function createUsuario(suffix: string, activo = true, deletedAt: Date | null = null) {
    return masterClient.usuario.create({
      data: {
        email: `checker_${suffix}@integration.test`,
        nombre: 'Checker',
        apellido: 'User',
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

  // ─── existeEnTenant (T14 — validación de solicitante) ──────────────────

  describe('existeEnTenant()', () => {
    it('usuario existente + membresía viva en el cliente → true (aunque ambos estén inactivos)', async () => {
      const cliente = await createCliente('existe-1');
      const role = await createRole('USUARIO_EXISTE_1');
      const usuario = await createUsuario('existe-1', false);
      await createMembresia(usuario.id, cliente.id, role.id, false);

      const result = await checker.existeEnTenant(usuario.id, cliente.id);

      expect(result).toBe(true);
    });

    it('usuario soft-deleted → false', async () => {
      const cliente = await createCliente('existe-deleted');
      const role = await createRole('USUARIO_EXISTE_DELETED');
      const usuario = await createUsuario('existe-deleted', true, new Date());
      await createMembresia(usuario.id, cliente.id, role.id);

      const result = await checker.existeEnTenant(usuario.id, cliente.id);

      expect(result).toBe(false);
    });

    it('usuario existe pero sin membresía en ese cliente → false', async () => {
      const usuario = await createUsuario('existe-sin-membresia');
      const otroCliente = await createCliente('existe-otro');

      const result = await checker.existeEnTenant(usuario.id, otroCliente.id);

      expect(result).toBe(false);
    });

    it('membresía soft-deleted en ese cliente → false', async () => {
      const cliente = await createCliente('existe-membresia-deleted');
      const role = await createRole('USUARIO_EXISTE_MEMBRESIA_DELETED');
      const usuario = await createUsuario('existe-membresia-deleted');
      await createMembresia(usuario.id, cliente.id, role.id, true, new Date());

      const result = await checker.existeEnTenant(usuario.id, cliente.id);

      expect(result).toBe(false);
    });

    it('aislamiento cross-tenant: membresía en cliente A no valida contra cliente B', async () => {
      const clienteA = await createCliente('existe-cross-a');
      const clienteB = await createCliente('existe-cross-b');
      const role = await createRole('USUARIO_EXISTE_CROSS');
      const usuario = await createUsuario('existe-cross');
      await createMembresia(usuario.id, clienteA.id, role.id);

      const result = await checker.existeEnTenant(usuario.id, clienteB.id);

      expect(result).toBe(false);
    });
  });

  // ─── estaActivoEnTenant (T14, T15 — validación de asignado) ────────────

  describe('estaActivoEnTenant()', () => {
    it('usuario activo + membresía activa + ambos no eliminados → true', async () => {
      const cliente = await createCliente('activo-1');
      const role = await createRole('USUARIO_ACTIVO_1');
      const usuario = await createUsuario('activo-1', true);
      await createMembresia(usuario.id, cliente.id, role.id, true);

      const result = await checker.estaActivoEnTenant(usuario.id, cliente.id);

      expect(result).toBe(true);
    });

    it('usuario inactivo (activo=false) → false', async () => {
      const cliente = await createCliente('activo-usuario-inactivo');
      const role = await createRole('USUARIO_ACTIVO_INACTIVO');
      const usuario = await createUsuario('activo-usuario-inactivo', false);
      await createMembresia(usuario.id, cliente.id, role.id, true);

      const result = await checker.estaActivoEnTenant(usuario.id, cliente.id);

      expect(result).toBe(false);
    });

    it('membresía inactiva (activo=false) en el tenant → false', async () => {
      const cliente = await createCliente('activo-membresia-inactiva');
      const role = await createRole('USUARIO_ACTIVO_MEMBRESIA_INACTIVA');
      const usuario = await createUsuario('activo-membresia-inactiva', true);
      await createMembresia(usuario.id, cliente.id, role.id, false);

      const result = await checker.estaActivoEnTenant(usuario.id, cliente.id);

      expect(result).toBe(false);
    });

    it('usuario inexistente → false', async () => {
      const cliente = await createCliente('activo-inexistente');

      const result = await checker.estaActivoEnTenant(
        '00000000-0000-0000-0000-000000000000',
        cliente.id,
      );

      expect(result).toBe(false);
    });
  });

  // ─── resolverNombres (sdd/beta-frontend item 2 — batch, sin N+1) ───────

  describe('resolverNombres()', () => {
    it('resuelve nombre/apellido de varios usuarios en un solo lote', async () => {
      const usuario1 = await createUsuario('nombres-1');
      const usuario2 = await createUsuario('nombres-2');

      const result = await checker.resolverNombres([usuario1.id, usuario2.id]);

      expect(result.size).toBe(2);
      expect(result.get(usuario1.id)).toEqual({ nombre: 'Checker', apellido: 'User' });
      expect(result.get(usuario2.id)).toEqual({ nombre: 'Checker', apellido: 'User' });
    });

    it('ids inexistentes se omiten del Map (best-effort, sin error)', async () => {
      const usuario = await createUsuario('nombres-parcial');

      const result = await checker.resolverNombres([
        usuario.id,
        '00000000-0000-0000-0000-000000000000',
      ]);

      expect(result.size).toBe(1);
      expect(result.has('00000000-0000-0000-0000-000000000000')).toBe(false);
    });

    it('array vacío retorna Map vacío sin consultar la DB', async () => {
      const result = await checker.resolverNombres([]);

      expect(result.size).toBe(0);
    });
  });
});
