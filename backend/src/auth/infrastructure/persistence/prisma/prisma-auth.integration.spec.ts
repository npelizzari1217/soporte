/**
 * 2.C.1 TEST — Integration tests de PrismaUsuarioRepository,
 *               PrismaRefreshTokenRepository y PrismaRoleRepository
 *               contra Postgres real (RED → GREEN con 2.C.2)
 *
 * Verifica:
 * - PrismaUsuarioRepository: findByEmail, findById, save con UUIDv7, soft delete.
 * - Hydration de roles+permisos: usuario con rol asignado retorna roles.permisos
 *   popolados (W3 carried-over).
 * - PrismaRefreshTokenRepository: findByHash, revokeAllByUsuarioId, save.
 * - PrismaRoleRepository: findByCodigo, findWithPermisos.
 *
 * Configuración de DB:
 * - TEST DB: soporte_master_test (nunca apunta a soporte_master).
 * - TRUNCATE en beforeEach: clientes, usuarios, refresh_tokens, usuarios_roles
 *   (cascade desde clientes preserva la cascada). Los catálogos roles/permisos/
 *   roles_permisos NO se truncan — son datos de referencia del seed PR-07.
 *
 * Notas:
 * - Los imports de Prisma son válidos aquí: estamos en infrastructure/.
 * - MasterContext se instancia directamente para los repos (sin NestJS DI).
 */

import * as crypto from 'crypto';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterContext } from '../../../../shared/tenancy/master-context';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';
import { PrismaRoleRepository } from './prisma-role.repository';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { RefreshTokenEntity } from '../../../domain/entities/refresh-token.entity';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';

// ─── Conexión de test ──────────────────────────────────────────────────────────
const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// ─── IDs fijos del seed PR-07 (estables cross-env) ────────────────────────────
const ADMIN_ROLE_ID = 'a0000000-0000-4000-a000-000000000001';
const SOPORTE_IT_ROLE_ID = 'a0000000-0000-4000-a000-000000000002';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClienteProps(suffix: string) {
  return {
    nombre: `TestCliente ${suffix}`,
    razonSocial: null,
    cuit: null,
    dbName: `test_auth_${suffix}`,
    activo: true,
  };
}

function makeUsuarioProps(clienteId: string, suffix: string) {
  return {
    email: `user_${suffix}@integration.test`,
    nombre: 'Test',
    apellido: 'Usuario',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$test$hash',
    clienteId,
    activo: true,
    roles: [],
  };
}

// ─── Suite principal ───────────────────────────────────────────────────────────

describe('Auth Repositories — Integration (2.C.1)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let masterContext: MasterContext;
  let usuarioRepo: PrismaUsuarioRepository;
  let refreshTokenRepo: PrismaRefreshTokenRepository;
  let roleRepo: PrismaRoleRepository;
  let clienteRepo: PrismaClienteRepository;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    masterContext = new MasterContext();
    usuarioRepo = new PrismaUsuarioRepository(prismaService, masterContext);
    refreshTokenRepo = new PrismaRefreshTokenRepository(prismaService, masterContext);
    roleRepo = new PrismaRoleRepository(prismaService);
    clienteRepo = new PrismaClienteRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    // Truncate en orden que respeta FKs. CASCADE desde clientes eliminará:
    //   usuarios → refresh_tokens + usuarios_roles
    // Roles/permisos/roles_permisos NO se tocan (datos de referencia del seed).
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE usuarios_roles, refresh_tokens, usuarios, clientes RESTART IDENTITY CASCADE',
    );
  });

  // ─── Helper interno: crear cliente de test ─────────────────────────────────

  async function createTestCliente(suffix: string): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create(makeClienteProps(suffix));
    await clienteRepo.save(cliente);
    return cliente;
  }

  // ─── PrismaUsuarioRepository ───────────────────────────────────────────────

  describe('PrismaUsuarioRepository', () => {
    describe('save() — insert nuevo', () => {
      it('persiste un usuario nuevo y se puede recuperar por email', async () => {
        const cliente = await createTestCliente('repo-a');
        const usuario = UsuarioEntity.create(makeUsuarioProps(cliente.id, 'repo-a'));

        await usuarioRepo.save(usuario);

        const found = await usuarioRepo.findByEmail(usuario.email);
        expect(found).not.toBeNull();
        expect(found!.email).toBe(usuario.email);
        expect(found!.id).toBe(usuario.id);
        expect(found!.activo).toBe(true);
        expect(found!.deletedAt).toBeNull();
      });

      it('el id en DB coincide con el UUIDv7 generado por el dominio', async () => {
        const cliente = await createTestCliente('repo-uuid');
        const usuario = UsuarioEntity.create(makeUsuarioProps(cliente.id, 'repo-uuid'));

        await usuarioRepo.save(usuario);

        const found = await usuarioRepo.findById(usuario.id);
        expect(found!.id).toBe(usuario.id);
        // Verificar formato UUIDv7
        expect(usuario.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      });
    });

    describe('findByEmail()', () => {
      it('retorna null cuando el email no existe', async () => {
        const found = await usuarioRepo.findByEmail('noexiste@test.com');
        expect(found).toBeNull();
      });

      it('encuentra un usuario por email exacto', async () => {
        const cliente = await createTestCliente('email-lookup');
        const usuario = UsuarioEntity.create(makeUsuarioProps(cliente.id, 'email-lookup'));
        await usuarioRepo.save(usuario);

        const found = await usuarioRepo.findByEmail(usuario.email);
        expect(found!.email).toBe(usuario.email);
      });
    });

    describe('findById()', () => {
      it('retorna null cuando el id no existe', async () => {
        const found = await usuarioRepo.findById('01966a6a-0000-7000-8000-000000000001');
        expect(found).toBeNull();
      });

      it('incluye usuarios soft-deleted en la búsqueda', async () => {
        const cliente = await createTestCliente('soft-del');
        const usuario = UsuarioEntity.create(makeUsuarioProps(cliente.id, 'soft-del'));
        await usuarioRepo.save(usuario);

        // Soft delete
        usuario.suspend();
        await usuarioRepo.save(usuario);

        // findById debe incluir soft-deleted
        const found = await usuarioRepo.findById(usuario.id);
        expect(found).not.toBeNull();
        expect(found!.activo).toBe(false);
        expect(found!.isDeleted()).toBe(true);
      });
    });

    describe('save() — soft delete', () => {
      it('setea activo=false y deleted_at al suspender usuario', async () => {
        const cliente = await createTestCliente('suspend');
        const usuario = UsuarioEntity.create(makeUsuarioProps(cliente.id, 'suspend'));
        await usuarioRepo.save(usuario);

        usuario.suspend();
        await usuarioRepo.save(usuario);

        const found = await usuarioRepo.findById(usuario.id);
        expect(found!.activo).toBe(false);
        expect(found!.deletedAt).not.toBeNull();
        expect(found!.isDeleted()).toBe(true);
      });
    });

    describe('W3 — roles + permisos hydration', () => {
      it('findByEmail retorna usuario con roles y permisos cargados (JOIN completo)', async () => {
        // 1. Crear cliente + usuario
        const cliente = await createTestCliente('roles-hydration');
        const usuario = UsuarioEntity.create(makeUsuarioProps(cliente.id, 'roles-hydration'));
        await usuarioRepo.save(usuario);

        // 2. Asignar rol ADMIN del seed (tiene 11 permisos) directamente en DB
        await masterClient.$executeRawUnsafe(
          `INSERT INTO usuarios_roles (usuario_id, rol_id) VALUES ('${usuario.id}', '${ADMIN_ROLE_ID}')`,
        );

        // 3. findByEmail debe retornar el usuario CON roles+permisos cargados
        const found = await usuarioRepo.findByEmail(usuario.email);

        expect(found).not.toBeNull();
        expect(found!.roles).toHaveLength(1);
        expect(found!.roles[0].codigo).toBe('ADMIN');
        // ADMIN tiene 11 permisos del seed PR-07
        expect(found!.roles[0].permisos.length).toBeGreaterThanOrEqual(11);
        const permisosCodigos = found!.roles[0].permisos.map((p) => p.codigo);
        expect(permisosCodigos).toContain('ticket:crear');
        expect(permisosCodigos).toContain('compra:aprobar');
        expect(permisosCodigos).toContain('usuario:gestionar');
      });

      it('findById retorna usuario con permisos de múltiples roles (unión para JWT)', async () => {
        // SOPORTE_IT tiene 5 permisos; ADMIN tiene 11.
        const cliente = await createTestCliente('multi-roles');
        const usuario = UsuarioEntity.create(makeUsuarioProps(cliente.id, 'multi-roles'));
        await usuarioRepo.save(usuario);

        // Asignar ADMIN + SOPORTE_IT
        await masterClient.$executeRawUnsafe(`
          INSERT INTO usuarios_roles (usuario_id, rol_id) VALUES
            ('${usuario.id}', '${ADMIN_ROLE_ID}'),
            ('${usuario.id}', '${SOPORTE_IT_ROLE_ID}')
        `);

        const found = await usuarioRepo.findById(usuario.id);

        expect(found!.roles).toHaveLength(2);
        const codigos = found!.roles.map((r) => r.codigo);
        expect(codigos).toContain('ADMIN');
        expect(codigos).toContain('SOPORTE_IT');
        // Cada rol tiene sus permisos
        const adminRole = found!.roles.find((r) => r.codigo === 'ADMIN')!;
        expect(adminRole.permisos.length).toBeGreaterThanOrEqual(11);
      });

      it('usuario sin roles retorna arreglo vacío de roles', async () => {
        const cliente = await createTestCliente('no-roles');
        const usuario = UsuarioEntity.create(makeUsuarioProps(cliente.id, 'no-roles'));
        await usuarioRepo.save(usuario);

        const found = await usuarioRepo.findByEmail(usuario.email);

        expect(found!.roles).toHaveLength(0);
      });
    });
  });

  // ─── PrismaRefreshTokenRepository ─────────────────────────────────────────

  describe('PrismaRefreshTokenRepository', () => {
    let testCliente: ClienteEntity;
    let testUsuario: UsuarioEntity;

    beforeEach(async () => {
      testCliente = await createTestCliente('rt-suite');
      testUsuario = UsuarioEntity.create(makeUsuarioProps(testCliente.id, 'rt-suite'));
      await usuarioRepo.save(testUsuario);
    });

    function makeTokenHash(): { raw: string; hash: string } {
      const raw = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      return { raw, hash };
    }

    describe('save() + findByHash()', () => {
      it('persiste un token y lo recupera por hash', async () => {
        const { hash } = makeTokenHash();
        const token = RefreshTokenEntity.create({
          usuarioId: testUsuario.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revokedAt: null,
        });

        await refreshTokenRepo.save(token);

        const found = await refreshTokenRepo.findByHash(hash);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(token.id);
        expect(found!.usuarioId).toBe(testUsuario.id);
        expect(found!.revokedAt).toBeNull();
      });

      it('retorna null cuando el hash no existe', async () => {
        const found = await refreshTokenRepo.findByHash('nonexistent_hash_abc123');
        expect(found).toBeNull();
      });
    });

    describe('revokeAllByUsuarioId()', () => {
      it('revoca todos los tokens activos del usuario', async () => {
        // Crear 3 tokens activos
        const tokens = await Promise.all(
          [1, 2, 3].map(async (i) => {
            const { hash } = makeTokenHash();
            const token = RefreshTokenEntity.create({
              usuarioId: testUsuario.id,
              tokenHash: `${hash}_${i}`,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              revokedAt: null,
            });
            await refreshTokenRepo.save(token);
            return token;
          }),
        );

        // Revocar todos
        await refreshTokenRepo.revokeAllByUsuarioId(testUsuario.id);

        // Verificar que todos están revocados
        for (const token of tokens) {
          const found = await refreshTokenRepo.findByHash(token.tokenHash);
          expect(found!.revokedAt).not.toBeNull();
          expect(found!.isRevoked()).toBe(true);
        }
      });

      it('revokeAll es idempotente — no falla si ya hay tokens revocados', async () => {
        const { hash } = makeTokenHash();
        const token = RefreshTokenEntity.create({
          usuarioId: testUsuario.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revokedAt: null,
        });
        await refreshTokenRepo.save(token);

        // Primera revocación
        await refreshTokenRepo.revokeAllByUsuarioId(testUsuario.id);
        // Segunda revocación (idempotente)
        await expect(refreshTokenRepo.revokeAllByUsuarioId(testUsuario.id)).resolves.not.toThrow();
      });
    });
  });

  // ─── PrismaRoleRepository ─────────────────────────────────────────────────

  describe('PrismaRoleRepository', () => {
    it('findByCodigo retorna el rol del catálogo (seed PR-07)', async () => {
      const role = await roleRepo.findByCodigo('ADMIN');
      expect(role).not.toBeNull();
      expect(role!.codigo).toBe('ADMIN');
      expect(role!.nombre).toBe('Administrador');
    });

    it('findByCodigo retorna null para un código inexistente', async () => {
      const role = await roleRepo.findByCodigo('ROL_INEXISTENTE');
      expect(role).toBeNull();
    });

    it('findWithPermisos carga los permisos del rol (JOIN roles_permisos + permisos)', async () => {
      const role = await roleRepo.findWithPermisos(ADMIN_ROLE_ID);
      expect(role).not.toBeNull();
      expect(role!.permisos.length).toBeGreaterThanOrEqual(11);
      const codigos = role!.permisos.map((p) => p.codigo);
      expect(codigos).toContain('ticket:crear');
      expect(codigos).toContain('compra:aprobar');
    });

    it('findWithPermisos retorna null para un id inexistente', async () => {
      const role = await roleRepo.findWithPermisos('01966a6a-0000-7000-8000-000000000001');
      expect(role).toBeNull();
    });
  });
});
