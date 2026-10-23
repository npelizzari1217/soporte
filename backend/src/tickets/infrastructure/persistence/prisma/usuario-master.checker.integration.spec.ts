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
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

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

  // ─── listarAgentes (odd/permisos-por-tipo-ticket, D5 g) ──
  // Solo identidad, rol y membresía: las celdas de la matriz por módulo NO deciden. Se siembran a
  // propósito para que un regreso al criterio por módulo ponga estos casos en rojo.

  async function createPermiso(
    usuarioId: string,
    clienteId: string,
    modulo: string,
    accion: string,
  ) {
    return masterClient.usuarioClientePermiso.create({
      data: { usuarioId, clienteId, modulo, accion },
    });
  }

  async function createUsuarioNombrado(email: string, nombre: string, apellido: string) {
    return masterClient.usuario.create({
      data: { email, nombre, apellido, passwordHash: 'hash-fake', activo: true },
    });
  }

  describe('listarAgentes() — TECNICO o COLABORADOR activos de entre los candidatos', () => {
    it('incluye a un TECNICO sin ninguna celda y excluye a uno con celdas que no es candidato', async () => {
      const cliente = await createCliente('agentes-1');
      const role = await createRole('TECNICO');
      const sinCeldas = await createUsuarioNombrado(
        'agente_sin_celdas@integration.test',
        'Sin',
        'Celdas',
      );
      const conCeldas = await createUsuarioNombrado(
        'agente_con_celdas@integration.test',
        'Con',
        'Celdas',
      );
      await createMembresia(sinCeldas.id, cliente.id, role.id);
      await createMembresia(conCeldas.id, cliente.id, role.id);
      await createPermiso(conCeldas.id, cliente.id, 'EDILICIA', 'BORRADO');

      const result = await checker.listarAgentes(cliente.id, [sinCeldas.id]);

      expect(result).toEqual([{ id: sinCeldas.id, nombre: 'Sin', apellido: 'Celdas' }]);
    });

    it('sin candidatos → [] sin consultar', async () => {
      const cliente = await createCliente('agentes-vacio');

      expect(await checker.listarAgentes(cliente.id, [])).toEqual([]);
    });

    it('ordena por apellido y nombre', async () => {
      const cliente = await createCliente('agentes-orden');
      const role = await createRole('TECNICO');
      const zeta = await createUsuarioNombrado('agente_zeta@integration.test', 'Ana', 'Zeta');
      const alfa = await createUsuarioNombrado('agente_alfa@integration.test', 'Bruno', 'Alfa');
      await createMembresia(zeta.id, cliente.id, role.id);
      await createMembresia(alfa.id, cliente.id, role.id);

      const result = await checker.listarAgentes(cliente.id, [zeta.id, alfa.id]);

      expect(result.map((r) => r.id)).toEqual([alfa.id, zeta.id]);
    });

    it('técnico con membresía INACTIVA, o activa en OTRO cliente → excluido', async () => {
      const cliente = await createCliente('agentes-inactivo');
      const otroCliente = await createCliente('agentes-inactivo-otro');
      const role = await createRole('TECNICO');
      const inactivo = await createUsuario('agente-inactivo');
      const deOtro = await createUsuario('agente-de-otro');
      await createMembresia(inactivo.id, cliente.id, role.id, false);
      await createMembresia(deOtro.id, otroCliente.id, role.id);

      expect(await checker.listarAgentes(cliente.id, [inactivo.id, deOtro.id])).toEqual([]);
    });

    it('usuario inactivo o soft-deleted → excluido', async () => {
      const cliente = await createCliente('agentes-usuario-inactivo');
      const role = await createRole('TECNICO');
      const inactivo = await createUsuario('agente-usuario-inactivo', false);
      const borrado = await createUsuario('agente-usuario-borrado', true, new Date());
      await createMembresia(inactivo.id, cliente.id, role.id);
      await createMembresia(borrado.id, cliente.id, role.id);

      expect(await checker.listarAgentes(cliente.id, [inactivo.id, borrado.id])).toEqual([]);
    });

    it('rol USUARIO o ADMINISTRADOR → excluido; COLABORADOR → incluido', async () => {
      const cliente = await createCliente('agentes-roles');
      const roleUsuario = await createRole('USUARIO');
      const roleAdmin = await createRole('ADMINISTRADOR');
      const roleColaborador = await createRole('COLABORADOR');
      const usuario = await createUsuario('agente-rol-usuario');
      const admin = await createUsuario('agente-rol-admin');
      const colaborador = await createUsuario('agente-rol-colaborador');
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(admin.id, cliente.id, roleAdmin.id);
      await createMembresia(colaborador.id, cliente.id, roleColaborador.id);

      const result = await checker.listarAgentes(cliente.id, [
        usuario.id,
        admin.id,
        colaborador.id,
      ]);

      expect(result.map((r) => r.id)).toEqual([colaborador.id]);
    });

    it('ROOT (is_global_admin) sin membresía de técnico → excluido: no recibe tickets', async () => {
      const cliente = await createCliente('agentes-root');
      const roleUsuario = await createRole('USUARIO');
      const root = await masterClient.usuario.create({
        data: {
          email: 'checker_root_agente@integration.test',
          nombre: 'Root',
          apellido: 'Global',
          passwordHash: 'hash-fake',
          activo: true,
          isGlobalAdmin: true,
        },
      });
      await createMembresia(root.id, cliente.id, roleUsuario.id);

      expect(await checker.listarAgentes(cliente.id, [root.id])).toEqual([]);
    });
  });

  describe('usuario de integración de la API pública (sdd/api-publica, CA2)', () => {
    async function crearIntegracion(suffix: string, rolCodigo: string) {
      const cliente = await createCliente(suffix);
      const role = await createRole(rolCodigo);
      const usuario = await masterClient.usuario.create({
        data: {
          email: `integracion_${suffix}@integraciones.invalid`,
          nombre: 'Integracion',
          apellido: 'API',
          passwordHash: 'hash-fake',
          activo: true,
          esIntegracion: true,
        },
      });
      await createMembresia(usuario.id, cliente.id, role.id);
      return { cliente, usuario };
    }

    it('es un autor/solicitante válido en su cliente (membresía USUARIO viva)', async () => {
      const { cliente, usuario } = await crearIntegracion('integ-autor', 'USUARIO');

      expect(await checker.existeEnTenant(usuario.id, cliente.id)).toBe(true);
    });

    it('NO es un asignado elegible aunque esté activo', async () => {
      const { cliente, usuario } = await crearIntegracion('integ-asignado', 'USUARIO');

      expect(await checker.estaActivoEnTenant(usuario.id, cliente.id)).toBe(false);
    });

    it('NO es un agente aunque tenga rol TECNICO y sea candidato', async () => {
      const { cliente, usuario } = await crearIntegracion('integ-lista', 'TECNICO');

      expect(await checker.listarAgentes(cliente.id, [usuario.id])).toEqual([]);
    });
  });

  describe('ROOT (is_global_admin) sin membresía es elegible en cualquier tenant', () => {
    it('existeEnTenant y estaActivoEnTenant → true para un root sin membresía en el cliente', async () => {
      const cliente = await createCliente('root-elegible');
      const root = await masterClient.usuario.create({
        data: {
          email: 'checker_root@integration.test',
          nombre: 'Root',
          apellido: 'Checker',
          passwordHash: 'hash-fake',
          activo: true,
          isGlobalAdmin: true,
        },
      });

      // Sin ninguna membresía en `cliente`, el root debe ser solicitante/asignado válido.
      expect(await checker.existeEnTenant(root.id, cliente.id)).toBe(true);
      expect(await checker.estaActivoEnTenant(root.id, cliente.id)).toBe(true);
    });
  });
});
