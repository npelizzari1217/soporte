/**
 * 2.B.1 TEST — Unit tests de LoginUseCase (RED → GREEN con 2.B.2)
 *
 * Todos los repositorios/providers son mocks puros — sin DB, sin argon2, sin JWT reales.
 *
 * Cubre:
 * - Login exitoso: JWT payload {sub, cliente_id, email, roles, permisos}
 * - Permisos efectivos: unión de roles sin duplicados
 * - Hash argon2id vía mock: el provider es llamado; no hay plaintext en respuesta
 * - SHA-256 del token_hash almacenado en refresh_tokens
 * - Usuario inactivo → 401 (CredencialesInvalidasError)
 * - Usuario con deleted_at → 401 (CredencialesInvalidasError)
 * - Password incorrecto → 401 (CredencialesInvalidasError)
 * - Cliente inactivo → 403 (ClienteInactivoError)
 * - Email no registrado → 401 (CredencialesInvalidasError)
 */
import * as crypto from 'crypto';
import { LoginUseCase } from './login.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import { PermisoEntity } from '../../domain/entities/permiso.entity';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { CredencialesInvalidasError, ClienteInactivoError } from '../../domain/errors/auth.errors';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';

// ─── Factories de entidades de test ──────────────────────────────────────────

const makePermisoEntity = (codigo: string, id?: string) =>
  PermisoEntity.reconstitute(
    { codigo, descripcion: null },
    id ?? `permiso-${codigo}`,
    new Date('2025-01-01T00:00:00Z'),
    new Date('2025-01-01T00:00:00Z'),
    null,
  );

const makeRole = (codigo: string, permisos: PermisoEntity[]): RoleEntity =>
  RoleEntity.reconstitute(
    { codigo, nombre: codigo, descripcion: null, permisos },
    `role-${codigo}`,
    new Date('2025-01-01T00:00:00Z'),
    new Date('2025-01-01T00:00:00Z'),
    null,
  );

const makeUsuario = (
  overrides: Partial<{
    activo: boolean;
    roles: RoleEntity[];
    deletedAt: Date | null;
  }> = {},
): UsuarioEntity => {
  const u = UsuarioEntity.create({
    email: 'user@test.com',
    nombre: 'Juan',
    apellido: 'Perez',
    passwordHash: 'stored_hash',
    clienteId: 'cliente-uuid',
    activo: overrides.activo ?? true,
    roles: overrides.roles ?? [],
  });
  if (overrides.deletedAt !== undefined) {
    u._deletedAt = overrides.deletedAt;
  }
  return u;
};

const makeCliente = (nombre = 'Empresa Test', activo = true): ClienteEntity =>
  ClienteEntity.create({
    nombre,
    razonSocial: null,
    cuit: null,
    dbName: 'empresa_test',
    activo,
  });

// ─── Mocks de puertos ────────────────────────────────────────────────────────

const makeHashProvider = (): vi.Mocked<IHashProvider> => ({
  hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
  verify: vi.fn().mockResolvedValue(true),
});

const makeTokenService = (): vi.Mocked<ITokenService> => ({
  signJwt: vi.fn().mockReturnValue('signed.jwt.token'),
  verifyJwt: vi.fn().mockReturnValue(null),
});

const makeUsuarioRepo = (): vi.Mocked<IUsuarioRepository> => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  findByClienteId: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
});

const makeClienteRepo = (): vi.Mocked<IClienteRepository> => ({
  findByDbName: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const makeRefreshTokenRepo = (): vi.Mocked<IRefreshTokenRepository> => ({
  findByHash: vi.fn(),
  revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LoginUseCase', () => {
  let usuarioRepo: vi.Mocked<IUsuarioRepository>;
  let clienteRepo: vi.Mocked<IClienteRepository>;
  let hashProvider: vi.Mocked<IHashProvider>;
  let tokenService: vi.Mocked<ITokenService>;
  let refreshTokenRepo: vi.Mocked<IRefreshTokenRepository>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    clienteRepo = makeClienteRepo();
    hashProvider = makeHashProvider();
    tokenService = makeTokenService();
    refreshTokenRepo = makeRefreshTokenRepo();
    useCase = new LoginUseCase(
      usuarioRepo,
      clienteRepo,
      hashProvider,
      tokenService,
      refreshTokenRepo,
    );
  });

  describe('Login exitoso', () => {
    it('retorna accessToken y refreshToken cuando las credenciales son válidas', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(makeCliente());

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isOk()).toBe(true);
      const { accessToken, refreshToken } = result.getValue();
      expect(accessToken).toBeTruthy();
      expect(refreshToken).toBeTruthy();
    });

    it('el accessToken es el resultado de tokenService.signJwt', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(makeCliente());
      tokenService.signJwt.mockReturnValue('custom.jwt.token');

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.getValue().accessToken).toBe('custom.jwt.token');
    });

    it('el payload del JWT contiene {sub, cliente_id, email, roles, permisos}', async () => {
      const permisos = [makePermisoEntity('ticket:crear'), makePermisoEntity('ticket:ver_todos')];
      const role = makeRole('SOPORTE_IT', permisos);
      const usuario = makeUsuario({ roles: [role] });
      usuarioRepo.findByEmail.mockResolvedValue(usuario);
      clienteRepo.findById.mockResolvedValue(makeCliente());

      let capturedPayload: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((payload) => {
        capturedPayload = payload;
        return 'jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload!.sub).toBe(usuario.id);
      expect(capturedPayload!.cliente_id).toBe(usuario.clienteId);
      expect(capturedPayload!.email).toBe('user@test.com');
      expect(capturedPayload!.roles).toContain('SOPORTE_IT');
      expect(capturedPayload!.permisos).toContain('ticket:crear');
      expect(capturedPayload!.permisos).toContain('ticket:ver_todos');
    });

    it('permisos efectivos = unión de roles sin duplicados', async () => {
      const p1 = makePermisoEntity('ticket:crear', 'p1');
      const p2 = makePermisoEntity('ticket:ver_todos', 'p2');
      const p3 = makePermisoEntity('compra:aprobar', 'p3');
      const role1 = makeRole('SOPORTE_IT', [p1, p2]);
      const role2 = makeRole('APROBADOR_COMPRAS', [p1, p3]); // ticket:crear duplicado
      const usuario = makeUsuario({ roles: [role1, role2] });
      usuarioRepo.findByEmail.mockResolvedValue(usuario);
      clienteRepo.findById.mockResolvedValue(makeCliente());

      let capturedPayload: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((payload) => {
        capturedPayload = payload;
        return 'jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      // ticket:crear debe aparecer UNA SOLA VEZ (deduplicado)
      const permisosCodes = capturedPayload!.permisos;
      const uniquePermisos = [...new Set(permisosCodes)];
      expect(permisosCodes).toHaveLength(uniquePermisos.length);
      expect(permisosCodes).toContain('ticket:crear');
      expect(permisosCodes).toContain('ticket:ver_todos');
      expect(permisosCodes).toContain('compra:aprobar');
    });

    it('llama a hashProvider.verify con el password crudo y el hash almacenado (no plaintext en respuesta)', async () => {
      const usuario = makeUsuario();
      usuarioRepo.findByEmail.mockResolvedValue(usuario);
      clienteRepo.findById.mockResolvedValue(makeCliente());

      await useCase.execute({ email: 'user@test.com', password: 'mi_password' });

      expect(hashProvider.verify).toHaveBeenCalledWith('mi_password', usuario.passwordHash);
      // La respuesta no contiene el plaintext
      const result = await useCase.execute({ email: 'user@test.com', password: 'mi_password' });
      const { accessToken, refreshToken } = result.getValue();
      expect(accessToken).not.toContain('mi_password');
      expect(refreshToken).not.toContain('mi_password');
    });

    it('almacena SHA-256 del refresh token en refresh_tokens (no el valor crudo)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(makeCliente());

      let savedToken: RefreshTokenEntity | undefined;
      refreshTokenRepo.save.mockImplementation(async (token) => {
        savedToken = token;
      });

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isOk()).toBe(true);
      const rawToken = result.getValue().refreshToken;

      // El hash almacenado debe ser SHA-256(rawToken)
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      expect(savedToken!.tokenHash).toBe(expectedHash);
      // SHA-256 = 64 hex chars
      expect(savedToken!.tokenHash).toHaveLength(64);
      // El hash no es igual al token crudo
      expect(savedToken!.tokenHash).not.toBe(rawToken);
    });

    it('almacena el usuarioId correcto en el refresh token', async () => {
      const usuario = makeUsuario();
      usuarioRepo.findByEmail.mockResolvedValue(usuario);
      clienteRepo.findById.mockResolvedValue(makeCliente());

      let savedToken: RefreshTokenEntity | undefined;
      refreshTokenRepo.save.mockImplementation(async (token) => {
        savedToken = token;
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(savedToken!.usuarioId).toBe(usuario.id);
    });

    it('el refreshToken retornado tiene una longitud mínima (es un token aleatorio)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(makeCliente());

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.getValue().refreshToken.length).toBeGreaterThanOrEqual(32);
    });

    it('incluye cliente_nombre igual a cliente.nombre en el payload del JWT', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(makeCliente('Acme Corp'));

      let capturedPayload: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((payload) => {
        capturedPayload = payload;
        return 'signed.jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(capturedPayload!.cliente_nombre).toBe('Acme Corp');
    });

    it('cliente_nombre del JWT corresponde solo al cliente del usuario autenticado', async () => {
      // El use case llama clienteRepo.findById con usuario.clienteId → devuelve el cliente correcto
      const usuario = makeUsuario();
      usuarioRepo.findByEmail.mockResolvedValue(usuario);
      clienteRepo.findById.mockResolvedValue(makeCliente('Acme Corp')); // cliente del usuario

      let capturedPayload: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((payload) => {
        capturedPayload = payload;
        return 'signed.jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      // Verificar que el claim proviene del cliente resuelto por el id del usuario
      expect(clienteRepo.findById).toHaveBeenCalledWith(usuario.clienteId);
      expect(capturedPayload!.cliente_nombre).toBe('Acme Corp');
    });
  });

  describe('Usuario inactivo → 401', () => {
    it('retorna CredencialesInvalidasError cuando activo=false', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ activo: false }));

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
    });

    it('NO genera tokens cuando el usuario está inactivo', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ activo: false }));

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(tokenService.signJwt).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });

    it('retorna CredencialesInvalidasError cuando deleted_at IS NOT NULL', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ deletedAt: new Date() }));

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
    });
  });

  describe('Email no registrado → 401', () => {
    it('retorna CredencialesInvalidasError cuando el email no existe', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);

      const result = await useCase.execute({ email: 'noexiste@test.com', password: 'secret' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
    });

    it('llama a hashProvider.verify con DUMMY_HASH cuando el usuario no existe (timing side-channel defense)', async () => {
      // W1 — Constant-time defense: incluso cuando el usuario no existe, se llama
      // verify() con DUMMY_HASH para que el tiempo de respuesta sea ~igual al path
      // de password incorrecto (argon2id ~100ms). Evita enumerar emails via timing.
      usuarioRepo.findByEmail.mockResolvedValue(null);

      await useCase.execute({ email: 'noexiste@test.com', password: 'secret' });

      expect(hashProvider.verify).toHaveBeenCalledWith('secret', expect.any(String));
    });
  });

  describe('Usuario inactivo → timing defense', () => {
    it('llama a hashProvider.verify con DUMMY_HASH cuando el usuario está inactivo (timing defense)', async () => {
      // W1 — El path de usuario inactivo también llama verify() para normalizar timing.
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ activo: false }));

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(hashProvider.verify).toHaveBeenCalledWith('secret', expect.any(String));
    });

    it('llama a hashProvider.verify con DUMMY_HASH cuando el usuario tiene deleted_at (timing defense)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ deletedAt: new Date() }));

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(hashProvider.verify).toHaveBeenCalledWith('secret', expect.any(String));
    });
  });

  describe('Password incorrecto → 401', () => {
    it('retorna CredencialesInvalidasError cuando el password no coincide', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      hashProvider.verify.mockResolvedValue(false);

      const result = await useCase.execute({ email: 'user@test.com', password: 'wrong_pass' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
    });

    it('NO genera tokens cuando el password es incorrecto', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      hashProvider.verify.mockResolvedValue(false);

      await useCase.execute({ email: 'user@test.com', password: 'wrong_pass' });

      expect(tokenService.signJwt).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Cliente inactivo → 403', () => {
    it('retorna ClienteInactivoError cuando el cliente tiene activo=false', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(makeCliente('Empresa Test', false));

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteInactivoError);
    });

    it('NO genera tokens cuando el cliente está inactivo', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(makeCliente('Empresa Test', false));

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(tokenService.signJwt).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });

    it('retorna ClienteInactivoError cuando el cliente no existe (null)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteInactivoError);
    });

    it('busca el cliente por el clienteId del usuario', async () => {
      const usuario = makeUsuario();
      usuarioRepo.findByEmail.mockResolvedValue(usuario);
      clienteRepo.findById.mockResolvedValue(makeCliente());

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(clienteRepo.findById).toHaveBeenCalledWith(usuario.clienteId);
    });
  });
});
