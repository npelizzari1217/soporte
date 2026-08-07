/**
 * prisma-auth-repos.integration.spec.ts — TDD RED phase (T5.3 + T5.4, PR5).
 *
 * Integration tests contra Postgres REAL (soporte_master_test) de los repos
 * Prisma que implementan los puertos de dominio consumidos por PR3/PR4:
 * - PrismaClienteRepository (findById + CRUD básico — soporte de fixtures y
 *   de `resolverScope`, R5/R10).
 * - PrismaRoleRepository (findByCodigo, findWithPermisos — R1 catálogo RBAC).
 * - PrismaUsuarioRepository (findByEmail, findById, save — R3 identidad global).
 * - PrismaMembresiaRepository (findActivasByUsuario, findActivaByUsuarioYCliente
 *   — join rol+permisos+cliente, R4/R5/R10). [T5.3]
 * - PrismaRefreshTokenRepository (findByHash, revokeAllByUsuarioId, save,
 *   incl. columna `cliente_id` nueva — Opción B decisión #2025). [T5.4]
 *
 * Configuración de DB:
 * - TEST DB: soporte_master_test (nunca soporte_master). Migración inicial
 *   `20260805105221_init_master` aplicada vía `prisma migrate deploy`.
 * - TRUNCATE en beforeEach (respeta FKs vía CASCADE); catálogo roles/permisos
 *   se sembra directo en el test (RBAC seed real es PR1, fuera de este scope).
 */
import * as crypto from 'crypto';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaRoleRepository } from './prisma-role.repository';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaMembresiaRepository } from './prisma-membresia.repository';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { RoleEntity } from '../../../domain/entities/role.entity';
import { PermisoEntity } from '../../../domain/entities/permiso.entity';
import { RefreshTokenEntity } from '../../../domain/entities/refresh-token.entity';
import { MembresiaEntity } from '../../../domain/entities/membresia.entity';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

describe('Auth Prisma Repositories — Integration (T5.3 + T5.4)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let roleRepo: PrismaRoleRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let membresiaRepo: PrismaMembresiaRepository;
  let refreshTokenRepo: PrismaRefreshTokenRepository;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    roleRepo = new PrismaRoleRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    membresiaRepo = new PrismaMembresiaRepository(prismaService);
    refreshTokenRepo = new PrismaRefreshTokenRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    // TRUNCATE respeta FKs: membresias/refresh_tokens dependen de
    // usuarios/clientes/roles; roles_permisos depende de roles/permisos.
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, roles_permisos, usuarios, clientes, roles, permisos RESTART IDENTITY CASCADE',
    );
  });

  // ─── Helpers de fixture ─────────────────────────────────────────────────

  async function createTestCliente(suffix: string, activo = true): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `TestCliente ${suffix}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_auth_${suffix}`,
      activo,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function createTestRoleConPermisos(codigo: string, permisoCodigos: string[]) {
    const permisos = permisoCodigos.map((codigo) =>
      PermisoEntity.create({ codigo, descripcion: null }),
    );
    const role = RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos });

    // Insert directo — el seed RBAC real (PR1) no es scope de PR5.
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    for (const permiso of permisos) {
      await masterClient.permiso.upsert({
        where: { codigo: permiso.codigo },
        create: { id: permiso.id, codigo: permiso.codigo },
        update: {},
      });
      const permisoRow = await masterClient.permiso.findUniqueOrThrow({
        where: { codigo: permiso.codigo },
      });
      await masterClient.rolesPermisos.create({
        data: { rolId: role.id, permisoId: permisoRow.id },
      });
    }
    return role;
  }

  async function createTestUsuario(
    suffix: string,
    overrides: Partial<{ isGlobalAdmin: boolean }> = {},
  ) {
    const usuario = UsuarioEntity.create({
      email: `user_${suffix}@integration.test`,
      nombre: 'Test',
      apellido: 'Usuario',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$test$hash',
      activo: true,
      isGlobalAdmin: overrides.isGlobalAdmin ?? false,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  async function createTestMembresia(
    usuarioId: string,
    clienteId: string,
    rolId: string,
    activo = true,
  ) {
    await masterClient.membresia.create({
      data: { usuarioId, clienteId, rolId, activo },
    });
  }

  // ─── PrismaClienteRepository ────────────────────────────────────────────

  describe('PrismaClienteRepository', () => {
    it('save() + findById() — persiste y recupera un cliente', async () => {
      const cliente = await createTestCliente('cliente-a');

      const found = await clienteRepo.findById(cliente.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(cliente.id);
      expect(found!.nombre).toBe(cliente.nombre);
      expect(found!.dbName).toBe(cliente.dbName);
      expect(found!.activo).toBe(true);
    });

    it('findById() retorna null cuando el id no existe', async () => {
      const found = await clienteRepo.findById('01966a6a-0000-7000-8000-000000000001');
      expect(found).toBeNull();
    });

    it('findByDbName() encuentra un cliente por su db_name', async () => {
      const cliente = await createTestCliente('by-dbname');

      const found = await clienteRepo.findByDbName(cliente.dbName);
      expect(found!.id).toBe(cliente.id);
    });

    it('findAll() retorna todos los clientes creados', async () => {
      await createTestCliente('all-1');
      await createTestCliente('all-2');

      const all = await clienteRepo.findAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('save() actualiza un cliente existente (suspend → activo=false)', async () => {
      const cliente = await createTestCliente('suspend-cliente');
      cliente.suspend();
      await clienteRepo.save(cliente);

      const found = await clienteRepo.findById(cliente.id);
      expect(found!.activo).toBe(false);
      expect(found!.isDeleted()).toBe(true);
    });

    it('delete() elimina físicamente el registro', async () => {
      const cliente = await createTestCliente('delete-cliente');
      await clienteRepo.delete(cliente.id);

      const found = await clienteRepo.findById(cliente.id);
      expect(found).toBeNull();
    });
  });

  // ─── PrismaRoleRepository ───────────────────────────────────────────────

  describe('PrismaRoleRepository', () => {
    it('findByCodigo retorna el rol sin permisos hidratados', async () => {
      await createTestRoleConPermisos('TECNICO', ['ticket:crear', 'ticket:editar']);

      const role = await roleRepo.findByCodigo('TECNICO');
      expect(role).not.toBeNull();
      expect(role!.codigo).toBe('TECNICO');
    });

    it('findByCodigo retorna null para un código inexistente', async () => {
      const role = await roleRepo.findByCodigo('ROL_INEXISTENTE');
      expect(role).toBeNull();
    });

    it('findWithPermisos carga los permisos del rol (JOIN roles_permisos + permisos)', async () => {
      const created = await createTestRoleConPermisos('ADMINISTRADOR', [
        'ticket:crear',
        'usuario:gestionar',
        'cliente:gestionar',
      ]);

      const role = await roleRepo.findWithPermisos(created.id);
      expect(role).not.toBeNull();
      expect(role!.permisos).toHaveLength(3);
      const codigos = role!.permisos.map((p) => p.codigo);
      expect(codigos).toContain('ticket:crear');
      expect(codigos).toContain('usuario:gestionar');
      expect(codigos).toContain('cliente:gestionar');
    });

    it('findWithPermisos retorna null para un id inexistente', async () => {
      const role = await roleRepo.findWithPermisos('01966a6a-0000-7000-8000-000000000001');
      expect(role).toBeNull();
    });
  });

  // ─── PrismaUsuarioRepository ────────────────────────────────────────────

  describe('PrismaUsuarioRepository', () => {
    it('save() + findByEmail() — persiste un usuario y lo recupera por email', async () => {
      const usuario = await createTestUsuario('repo-a');

      const found = await usuarioRepo.findByEmail(usuario.email);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(usuario.id);
      expect(found!.email).toBe(usuario.email);
      expect(found!.activo).toBe(true);
      expect(found!.isGlobalAdmin).toBe(false);
    });

    it('findByEmail retorna null cuando el email no existe', async () => {
      const found = await usuarioRepo.findByEmail('noexiste@integration.test');
      expect(found).toBeNull();
    });

    it('findById incluye usuarios soft-deleted (suspend)', async () => {
      const usuario = await createTestUsuario('soft-del');
      usuario.suspend();
      await usuarioRepo.save(usuario);

      const found = await usuarioRepo.findById(usuario.id);
      expect(found).not.toBeNull();
      expect(found!.activo).toBe(false);
      expect(found!.isDeleted()).toBe(true);
    });

    it('save() persiste isGlobalAdmin=true (root)', async () => {
      const root = await createTestUsuario('root-user', { isGlobalAdmin: true });

      const found = await usuarioRepo.findById(root.id);
      expect(found!.isGlobalAdmin).toBe(true);
    });

    it('el id persistido coincide con el UUIDv7 generado por el dominio', async () => {
      const usuario = await createTestUsuario('repo-uuid');

      const found = await usuarioRepo.findById(usuario.id);
      expect(found!.id).toBe(usuario.id);
      expect(usuario.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  // ─── PrismaMembresiaRepository (T5.3) ───────────────────────────────────

  describe('PrismaMembresiaRepository', () => {
    it('findActivasByUsuario retorna [] cuando el usuario no tiene membresías', async () => {
      const usuario = await createTestUsuario('no-membresias');
      const activas = await membresiaRepo.findActivasByUsuario(usuario.id);
      expect(activas).toEqual([]);
    });

    it('findActivasByUsuario resuelve rol+permisos+cliente de una membresía activa', async () => {
      const usuario = await createTestUsuario('con-membresia');
      const cliente = await createTestCliente('membresia-cliente');
      const role = await createTestRoleConPermisos('COLABORADOR', [
        'ticket:crear',
        'ticket:comentar',
        'compra:gestionar',
      ]);
      await createTestMembresia(usuario.id, cliente.id, role.id);

      const activas = await membresiaRepo.findActivasByUsuario(usuario.id);
      expect(activas).toHaveLength(1);
      expect(activas[0].clienteId).toBe(cliente.id);
      expect(activas[0].clienteNombre).toBe(cliente.nombre);
      expect(activas[0].rolCodigo).toBe('COLABORADOR');
      expect(activas[0].permisos).toHaveLength(3);
      expect(activas[0].permisos).toContain('ticket:crear');
    });

    it('findActivasByUsuario excluye membresías inactivas (activo=false)', async () => {
      const usuario = await createTestUsuario('membresia-inactiva');
      const cliente = await createTestCliente('cliente-inactiva-membresia');
      const role = await createTestRoleConPermisos('USUARIO', ['ticket:crear']);
      await createTestMembresia(usuario.id, cliente.id, role.id, false);

      const activas = await membresiaRepo.findActivasByUsuario(usuario.id);
      expect(activas).toEqual([]);
    });

    it('findActivasByUsuario excluye membresías de clientes inactivos', async () => {
      const usuario = await createTestUsuario('membresia-cliente-inactivo');
      const cliente = await createTestCliente('cliente-suspendido', false);
      const role = await createTestRoleConPermisos('TECNICO', ['ticket:editar']);
      await createTestMembresia(usuario.id, cliente.id, role.id);

      const activas = await membresiaRepo.findActivasByUsuario(usuario.id);
      expect(activas).toEqual([]);
    });

    it('findActivasByUsuario retorna múltiples membresías (multi-tenant)', async () => {
      const usuario = await createTestUsuario('multi-tenant');
      const clienteA = await createTestCliente('multi-a');
      const clienteB = await createTestCliente('multi-b');
      const roleTecnico = await createTestRoleConPermisos('TECNICO', ['ticket:editar']);
      const roleUsuario = await createTestRoleConPermisos('USUARIO', ['ticket:crear']);
      await createTestMembresia(usuario.id, clienteA.id, roleTecnico.id);
      await createTestMembresia(usuario.id, clienteB.id, roleUsuario.id);

      const activas = await membresiaRepo.findActivasByUsuario(usuario.id);
      expect(activas).toHaveLength(2);
      const codigos = activas.map((m) => m.rolCodigo).sort();
      expect(codigos).toEqual(['TECNICO', 'USUARIO']);
    });

    it('findActivaByUsuarioYCliente retorna null si no hay membresía en ese cliente', async () => {
      const usuario = await createTestUsuario('sin-match');
      const cliente = await createTestCliente('sin-match-cliente');

      const found = await membresiaRepo.findActivaByUsuarioYCliente(usuario.id, cliente.id);
      expect(found).toBeNull();
    });

    it('findActivaByUsuarioYCliente resuelve la membresía específica', async () => {
      const usuario = await createTestUsuario('match-especifico');
      const clienteA = await createTestCliente('match-a');
      const clienteB = await createTestCliente('match-b');
      const roleA = await createTestRoleConPermisos('ADMINISTRADOR', ['cliente:gestionar']);
      const roleB = await createTestRoleConPermisos('USUARIO', ['ticket:crear']);
      await createTestMembresia(usuario.id, clienteA.id, roleA.id);
      await createTestMembresia(usuario.id, clienteB.id, roleB.id);

      const found = await membresiaRepo.findActivaByUsuarioYCliente(usuario.id, clienteA.id);
      expect(found).not.toBeNull();
      expect(found!.rolCodigo).toBe('ADMINISTRADOR');
      expect(found!.permisos).toEqual(['cliente:gestionar']);
    });

    it('findActivaByUsuarioYCliente retorna null si la membresía está inactiva', async () => {
      const usuario = await createTestUsuario('match-inactivo');
      const cliente = await createTestCliente('match-inactivo-cliente');
      const role = await createTestRoleConPermisos('TECNICO', ['ticket:editar']);
      await createTestMembresia(usuario.id, cliente.id, role.id, false);

      const found = await membresiaRepo.findActivaByUsuarioYCliente(usuario.id, cliente.id);
      expect(found).toBeNull();
    });

    it('create() persiste una nueva membresía, recuperable vía findActivaByUsuarioYCliente (T8.3, PR8)', async () => {
      const usuario = await createTestUsuario('create-membresia');
      const cliente = await createTestCliente('create-membresia-cliente');
      const role = await createTestRoleConPermisos('ADMINISTRADOR', ['cliente:gestionar']);

      const membresia = MembresiaEntity.create({
        usuarioId: usuario.id,
        clienteId: cliente.id,
        rolId: role.id,
        activo: true,
      });
      await membresiaRepo.create(membresia);

      const found = await membresiaRepo.findActivaByUsuarioYCliente(usuario.id, cliente.id);
      expect(found).not.toBeNull();
      expect(found!.rolCodigo).toBe('ADMINISTRADOR');
    });

    // ─── findActivasByCliente / findByUsuarioYCliente / save (gestión mínima
    // de usuarios, sdd/beta-frontend — GET/POST/PATCH/DELETE /usuarios) ─────

    it('findActivasByCliente retorna los usuarios con membresía activa del cliente, con rol resuelto', async () => {
      const clienteA = await createTestCliente('usuarios-a');
      const usuario1 = await createTestUsuario('usuarios-a-1');
      const usuario2 = await createTestUsuario('usuarios-a-2');
      const roleTecnico = await createTestRoleConPermisos('TECNICO', ['ticket:editar']);
      const roleUsuario = await createTestRoleConPermisos('USUARIO', ['ticket:crear']);
      await createTestMembresia(usuario1.id, clienteA.id, roleTecnico.id);
      await createTestMembresia(usuario2.id, clienteA.id, roleUsuario.id);

      const usuarios = await membresiaRepo.findActivasByCliente(clienteA.id);

      expect(usuarios).toHaveLength(2);
      const porEmail = new Map(usuarios.map((u) => [u.email, u]));
      expect(porEmail.get(usuario1.email)?.rolCodigo).toBe('TECNICO');
      expect(porEmail.get(usuario2.email)?.rolCodigo).toBe('USUARIO');
    });

    it('findActivasByCliente AISLAMIENTO: no incluye usuarios de otro cliente', async () => {
      const clienteA = await createTestCliente('aislamiento-a');
      const clienteB = await createTestCliente('aislamiento-b');
      const usuarioA = await createTestUsuario('aislamiento-user-a');
      const usuarioB = await createTestUsuario('aislamiento-user-b');
      const role = await createTestRoleConPermisos('TECNICO', ['ticket:editar']);
      await createTestMembresia(usuarioA.id, clienteA.id, role.id);
      await createTestMembresia(usuarioB.id, clienteB.id, role.id);

      const usuariosA = await membresiaRepo.findActivasByCliente(clienteA.id);

      expect(usuariosA).toHaveLength(1);
      expect(usuariosA[0]!.email).toBe(usuarioA.email);
    });

    it('findActivasByCliente excluye membresías inactivas', async () => {
      const cliente = await createTestCliente('findactivas-inactiva');
      const usuario = await createTestUsuario('findactivas-inactivo-user');
      const role = await createTestRoleConPermisos('USUARIO', ['ticket:crear']);
      await createTestMembresia(usuario.id, cliente.id, role.id, false);

      const usuarios = await membresiaRepo.findActivasByCliente(cliente.id);
      expect(usuarios).toEqual([]);
    });

    it('findByUsuarioYCliente retorna la MembresiaEntity cruda (incl. inactiva)', async () => {
      const cliente = await createTestCliente('find-by-uc');
      const usuario = await createTestUsuario('find-by-uc-user');
      const role = await createTestRoleConPermisos('TECNICO', ['ticket:editar']);
      await createTestMembresia(usuario.id, cliente.id, role.id, false);

      const found = await membresiaRepo.findByUsuarioYCliente(usuario.id, cliente.id);

      expect(found).not.toBeNull();
      expect(found!.usuarioId).toBe(usuario.id);
      expect(found!.clienteId).toBe(cliente.id);
      expect(found!.activo).toBe(false);
    });

    it('findByUsuarioYCliente AISLAMIENTO: retorna null si la membresía es de otro cliente', async () => {
      const clienteA = await createTestCliente('find-by-uc-a');
      const clienteB = await createTestCliente('find-by-uc-b');
      const usuario = await createTestUsuario('find-by-uc-cross-user');
      const role = await createTestRoleConPermisos('TECNICO', ['ticket:editar']);
      await createTestMembresia(usuario.id, clienteA.id, role.id);

      const found = await membresiaRepo.findByUsuarioYCliente(usuario.id, clienteB.id);
      expect(found).toBeNull();
    });

    it('save() persiste cambiarRol() — round-trip vía findByUsuarioYCliente', async () => {
      const cliente = await createTestCliente('save-cambiar-rol');
      const usuario = await createTestUsuario('save-cambiar-rol-user');
      const roleViejo = await createTestRoleConPermisos('USUARIO', ['ticket:crear']);
      const roleNuevo = await createTestRoleConPermisos('TECNICO', ['ticket:editar']);
      await createTestMembresia(usuario.id, cliente.id, roleViejo.id);

      const membresia = await membresiaRepo.findByUsuarioYCliente(usuario.id, cliente.id);
      membresia!.cambiarRol(roleNuevo.id);
      await membresiaRepo.save(membresia!);

      const found = await membresiaRepo.findByUsuarioYCliente(usuario.id, cliente.id);
      expect(found!.rolId).toBe(roleNuevo.id);
    });

    it('save() persiste desactivar() — la membresía deja de aparecer en findActivasByCliente', async () => {
      const cliente = await createTestCliente('save-desactivar');
      const usuario = await createTestUsuario('save-desactivar-user');
      const role = await createTestRoleConPermisos('USUARIO', ['ticket:crear']);
      await createTestMembresia(usuario.id, cliente.id, role.id);

      const membresia = await membresiaRepo.findByUsuarioYCliente(usuario.id, cliente.id);
      membresia!.desactivar();
      await membresiaRepo.save(membresia!);

      const found = await membresiaRepo.findByUsuarioYCliente(usuario.id, cliente.id);
      expect(found!.activo).toBe(false);
      const activos = await membresiaRepo.findActivasByCliente(cliente.id);
      expect(activos).toEqual([]);
    });
  });

  // ─── PrismaRefreshTokenRepository ───────────────────────────────────────

  describe('PrismaRefreshTokenRepository', () => {
    let testUsuario: UsuarioEntity;

    beforeEach(async () => {
      testUsuario = await createTestUsuario('rt-suite');
    });

    function makeTokenHash(): { raw: string; hash: string } {
      const raw = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      return { raw, hash };
    }

    it('save() + findByHash() — persiste y recupera un token con clienteId embebido (Opción B)', async () => {
      const cliente = await createTestCliente('rt-cliente');
      const { hash } = makeTokenHash();
      const token = RefreshTokenEntity.create({
        usuarioId: testUsuario.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        clienteId: cliente.id,
      });

      await refreshTokenRepo.save(token);

      const found = await refreshTokenRepo.findByHash(hash);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(token.id);
      expect(found!.usuarioId).toBe(testUsuario.id);
      expect(found!.clienteId).toBe(cliente.id);
      expect(found!.revokedAt).toBeNull();
    });

    it('save() persiste clienteId=null (scope MASTER, root)', async () => {
      const { hash } = makeTokenHash();
      const token = RefreshTokenEntity.create({
        usuarioId: testUsuario.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        clienteId: null,
      });

      await refreshTokenRepo.save(token);

      const found = await refreshTokenRepo.findByHash(hash);
      expect(found!.clienteId).toBeNull();
    });

    it('findByHash retorna null cuando el hash no existe', async () => {
      const found = await refreshTokenRepo.findByHash('nonexistent_hash_abc123');
      expect(found).toBeNull();
    });

    it('revokeAllByUsuarioId revoca todos los tokens activos del usuario', async () => {
      const tokens = await Promise.all(
        [1, 2, 3].map(async (i) => {
          const { hash } = makeTokenHash();
          const token = RefreshTokenEntity.create({
            usuarioId: testUsuario.id,
            tokenHash: `${hash}_${i}`,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            revokedAt: null,
            clienteId: null,
          });
          await refreshTokenRepo.save(token);
          return token;
        }),
      );

      await refreshTokenRepo.revokeAllByUsuarioId(testUsuario.id);

      for (const token of tokens) {
        const found = await refreshTokenRepo.findByHash(token.tokenHash);
        expect(found!.revokedAt).not.toBeNull();
        expect(found!.isRevoked()).toBe(true);
      }
    });

    it('revokeAllByUsuarioId es idempotente', async () => {
      const { hash } = makeTokenHash();
      const token = RefreshTokenEntity.create({
        usuarioId: testUsuario.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        clienteId: null,
      });
      await refreshTokenRepo.save(token);

      await refreshTokenRepo.revokeAllByUsuarioId(testUsuario.id);
      await expect(refreshTokenRepo.revokeAllByUsuarioId(testUsuario.id)).resolves.not.toThrow();
    });

    it('save() sobre un token existente (revoke + save) actualiza revokedAt', async () => {
      const { hash } = makeTokenHash();
      const token = RefreshTokenEntity.create({
        usuarioId: testUsuario.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        clienteId: null,
      });
      await refreshTokenRepo.save(token);

      token.revoke();
      await refreshTokenRepo.save(token);

      const found = await refreshTokenRepo.findByHash(hash);
      expect(found!.revokedAt).not.toBeNull();
    });
  });
});
