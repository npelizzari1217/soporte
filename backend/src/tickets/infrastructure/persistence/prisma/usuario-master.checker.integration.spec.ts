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

  // ─── getAutorizacionModulos (R9, WU-7.5 — migrado de usuario_cliente_modulos
  // a la matriz usuario_cliente_permisos) ─────────────────────────────────

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

  describe('getAutorizacionModulos() — lee la matriz, no usuario_cliente_modulos (R9, S20-S21)', () => {
    it('S20: usuario con celdas en TICKETS y EQUIPOS (una sola acción cada una) → modulos deduplicados por MÓDULO, no por acción', async () => {
      const cliente = await createCliente('auth-modulos-1');
      const role = await createRole('AUTH_MODULOS_TECNICO_1');
      const usuario = await createUsuario('auth-modulos-1');
      await createMembresia(usuario.id, cliente.id, role.id);
      await createPermiso(usuario.id, cliente.id, 'TICKETS', 'LECTURA');
      await createPermiso(usuario.id, cliente.id, 'EQUIPOS', 'ALTAS');
      // Ruido: otro cliente NO debe filtrarse (aislamiento).
      const otroCliente = await createCliente('auth-modulos-1-otro');
      await createPermiso(usuario.id, otroCliente.id, 'KB', 'LECTURA');

      const result = await checker.getAutorizacionModulos(usuario.id, cliente.id);

      expect(result.esAdminTotal).toBe(false);
      expect(result.modulos.sort()).toEqual(['EQUIPOS', 'TICKETS']);
    });

    it('S21: ADMINISTRADOR con CERO filas propias en la matriz → esAdminTotal=true, modulos=[] (el backfill no le crea filas)', async () => {
      const cliente = await createCliente('auth-modulos-admin');
      const role = await createRole('ADMINISTRADOR');
      const usuario = await createUsuario('auth-modulos-admin');
      await createMembresia(usuario.id, cliente.id, role.id);
      // A propósito: CERO filas en usuario_cliente_permisos para este usuario.

      const result = await checker.getAutorizacionModulos(usuario.id, cliente.id);

      expect(result).toEqual({ esAdminTotal: true, modulos: [] });
    });

    it('ROOT (is_global_admin) → esAdminTotal=true sin consultar la matriz, aunque tenga membresía no-ADMINISTRADOR', async () => {
      const cliente = await createCliente('auth-modulos-root');
      const role = await createRole('AUTH_MODULOS_ROOT_ROLE');
      const root = await masterClient.usuario.create({
        data: {
          email: 'checker_root_modulos@integration.test',
          nombre: 'Root',
          apellido: 'Modulos',
          passwordHash: 'hash-fake',
          activo: true,
          isGlobalAdmin: true,
        },
      });
      await createMembresia(root.id, cliente.id, role.id);

      const result = await checker.getAutorizacionModulos(root.id, cliente.id);

      expect(result).toEqual({ esAdminTotal: true, modulos: [] });
    });

    it('usuario sin ninguna fila en la matriz (ni admin) → esAdminTotal=false, modulos=[] (fail-closed, sin crash)', async () => {
      const cliente = await createCliente('auth-modulos-vacio');
      const role = await createRole('AUTH_MODULOS_SIN_FILAS');
      const usuario = await createUsuario('auth-modulos-vacio');
      await createMembresia(usuario.id, cliente.id, role.id);

      const result = await checker.getAutorizacionModulos(usuario.id, cliente.id);

      expect(result).toEqual({ esAdminTotal: false, modulos: [] });
    });
  });

  // ─── listarTecnicosAsignables (R9, WU-7.5 — migrado a la matriz) ─────────

  describe('listarTecnicosAsignables() — filtra por AL MENOS UNA acción en el módulo (R9, S22-S23)', () => {
    it('S22: dos TECNICOs, solo uno con una celda del módulo pedido → la lista incluye solo al que tiene el módulo', async () => {
      const cliente = await createCliente('tecnicos-asignables-1');
      const role = await createRole('TECNICO');
      const conModulo = await masterClient.usuario.create({
        data: {
          email: 'con_modulo@integration.test',
          nombre: 'Con',
          apellido: 'Modulo',
          passwordHash: 'hash-fake',
          activo: true,
        },
      });
      const sinModulo = await masterClient.usuario.create({
        data: {
          email: 'sin_modulo@integration.test',
          nombre: 'Sin',
          apellido: 'Modulo',
          passwordHash: 'hash-fake',
          activo: true,
        },
      });
      await createMembresia(conModulo.id, cliente.id, role.id);
      await createMembresia(sinModulo.id, cliente.id, role.id);
      // "Al menos una acción" alcanza: LECTURA sola habilita, no hace falta ALTAS/MODIFICACION.
      await createPermiso(conModulo.id, cliente.id, 'EDILICIA', 'LECTURA');

      const result = await checker.listarTecnicosAsignables(cliente.id, 'EDILICIA');

      expect(result.map((r) => r.id)).toEqual([conModulo.id]);
    });

    it('S23: modulo === null → [] SIN consultar la matriz (corte temprano preservado)', async () => {
      const cliente = await createCliente('tecnicos-asignables-null');

      const result = await checker.listarTecnicosAsignables(cliente.id, null);

      expect(result).toEqual([]);
    });

    it('técnico con el módulo pero membresía INACTIVA → excluido (mismo criterio que hoy)', async () => {
      const cliente = await createCliente('tecnicos-asignables-inactivo');
      const role = await createRole('TECNICO');
      const usuario = await masterClient.usuario.create({
        data: {
          email: 'tecnico_inactivo@integration.test',
          nombre: 'Tecnico',
          apellido: 'Inactivo',
          passwordHash: 'hash-fake',
          activo: true,
        },
      });
      await createMembresia(usuario.id, cliente.id, role.id, false);
      await createPermiso(usuario.id, cliente.id, 'EQUIPOS', 'LECTURA');

      const result = await checker.listarTecnicosAsignables(cliente.id, 'EQUIPOS');

      expect(result).toEqual([]);
    });

    it('usuario con el módulo pero SIN rol TECNICO en ese cliente → excluido', async () => {
      const cliente = await createCliente('tecnicos-asignables-no-tecnico');
      const roleNoTecnico = await createRole('COLABORADOR');
      const usuario = await masterClient.usuario.create({
        data: {
          email: 'no_tecnico@integration.test',
          nombre: 'No',
          apellido: 'Tecnico',
          passwordHash: 'hash-fake',
          activo: true,
        },
      });
      await createMembresia(usuario.id, cliente.id, roleNoTecnico.id);
      await createPermiso(usuario.id, cliente.id, 'EQUIPOS', 'LECTURA');

      const result = await checker.listarTecnicosAsignables(cliente.id, 'EQUIPOS');

      expect(result).toEqual([]);
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
