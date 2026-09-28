/**
 * prisma-password-reset-token.repository.integration.spec.ts — Integración
 * contra Postgres REAL (`soporte_master_test`). Tarea 2.4.
 *
 * `password_reset_tokens` tiene FK a `usuarios` (`ON DELETE CASCADE`) y a
 * `clientes`, ambas en MASTER: el TRUNCATE del `beforeEach` incluye las tres
 * tablas, mismo patrón que `prisma-auth-repos.integration.spec.ts`. Truncar
 * `usuarios`/`clientes` en la base COMPARTIDA de test exige el turno
 * exclusivo — ver `usarLockMasterTest()`.
 *
 * Ref design: ADR-5, ADR-6 (CAS de uso único). Ref spec: "Confirmar cambia
 * la contraseña como máximo una vez bajo concurrencia" (abuso: CAS sin
 * `revoked_at`/`expires_at`, doble reset). Tarea: 2.4.
 */
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaPasswordResetTokenRepository } from './prisma-password-reset-token.repository';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { PasswordResetTokenEntity } from '../../../domain/entities/password-reset-token.entity';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('PrismaPasswordResetTokenRepository — Integration (2.4)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let tokenRepo: PrismaPasswordResetTokenRepository;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    tokenRepo = new PrismaPasswordResetTokenRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE password_reset_tokens, usuarios, clientes RESTART IDENTITY CASCADE',
    );
  });

  let suffixCounter = 0;
  function nextSuffix(prefix: string): string {
    suffixCounter += 1;
    return `${prefix}_${suffixCounter}`;
  }

  async function createTestCliente(suffix: string): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `TestCliente ${suffix}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_pwreset_${suffix}`,
      activo: true,
      csatHabilitado: false,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function createTestUsuario(suffix: string): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `user_${suffix}@integration.test`,
      nombre: 'Test',
      apellido: 'Usuario',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$test$hash',
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  function makeToken(
    usuarioId: string,
    clienteId: string,
    overrides: Partial<{ tokenHash: string; expiresAt: Date }> = {},
  ) {
    return PasswordResetTokenEntity.create({
      usuarioId,
      clienteId,
      tokenHash: overrides.tokenHash ?? `hash-${Math.random().toString(36).slice(2)}`,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null,
      revokedAt: null,
    });
  }

  async function createFixture(prefix: string) {
    const suffix = nextSuffix(prefix);
    const cliente = await createTestCliente(suffix);
    const usuario = await createTestUsuario(suffix);
    return { cliente, usuario };
  }

  describe('findByHash() / save()', () => {
    it('persiste un token y lo recupera por su hash', async () => {
      const { cliente, usuario } = await createFixture('findbyhash');
      const token = makeToken(usuario.id, cliente.id, { tokenHash: 'hash-fijo-1' });

      await tokenRepo.save(token);
      const found = await tokenRepo.findByHash('hash-fijo-1');

      expect(found).not.toBeNull();
      expect(found!.id).toBe(token.id);
      expect(found!.usuarioId).toBe(usuario.id);
      expect(found!.clienteId).toBe(cliente.id);
      expect(found!.usedAt).toBeNull();
      expect(found!.revokedAt).toBeNull();
    });

    it('findByHash retorna null cuando el hash no existe', async () => {
      const found = await tokenRepo.findByHash('hash-inexistente');
      expect(found).toBeNull();
    });
  });

  describe('revocarVigentesDeUsuario()', () => {
    it('revoca solo los tokens VIGENTES del usuario (no toca uno ya usado)', async () => {
      const { cliente, usuario } = await createFixture('revocar');
      const vigente = makeToken(usuario.id, cliente.id, { tokenHash: 'hash-vigente' });
      const yaUsado = makeToken(usuario.id, cliente.id, { tokenHash: 'hash-ya-usado' });
      await tokenRepo.save(vigente);
      await tokenRepo.save(yaUsado);
      await tokenRepo.consumirSiVigente(yaUsado.id);

      const cantidad = await tokenRepo.revocarVigentesDeUsuario(usuario.id);

      expect(cantidad).toBe(1);
      const vigenteRevisado = await tokenRepo.findByHash('hash-vigente');
      const usadoRevisado = await tokenRepo.findByHash('hash-ya-usado');
      expect(vigenteRevisado!.revokedAt).not.toBeNull();
      expect(usadoRevisado!.revokedAt).toBeNull();
    });

    it('es idempotente: una segunda llamada sin tokens vigentes devuelve 0', async () => {
      const { cliente, usuario } = await createFixture('revocar-idempotente');
      const token = makeToken(usuario.id, cliente.id);
      await tokenRepo.save(token);

      await tokenRepo.revocarVigentesDeUsuario(usuario.id);
      const segundaVez = await tokenRepo.revocarVigentesDeUsuario(usuario.id);

      expect(segundaVez).toBe(0);
    });

    it('filtra por usuario — no revoca tokens de otro usuario', async () => {
      const { cliente, usuario: usuarioObjetivo } = await createFixture('revocar-filtro-objetivo');
      const usuarioAjeno = await createTestUsuario(nextSuffix('revocar-filtro-ajeno'));

      const tokenObjetivo = makeToken(usuarioObjetivo.id, cliente.id, {
        tokenHash: 'hash-objetivo',
      });
      const tokenAjeno = makeToken(usuarioAjeno.id, cliente.id, { tokenHash: 'hash-ajeno' });
      await tokenRepo.save(tokenObjetivo);
      await tokenRepo.save(tokenAjeno);

      const cantidad = await tokenRepo.revocarVigentesDeUsuario(usuarioObjetivo.id);

      expect(cantidad).toBe(1);
      const objetivoRevisado = await tokenRepo.findByHash('hash-objetivo');
      const ajenoRevisado = await tokenRepo.findByHash('hash-ajeno');
      expect(objetivoRevisado!.revokedAt).not.toBeNull();
      expect(ajenoRevisado!.revokedAt).toBeNull();
    });
  });

  describe('consumirSiVigente() — CAS de uso único (ADR-5/ADR-6)', () => {
    it('la PRIMERA llamada marca el token y devuelve true', async () => {
      const { cliente, usuario } = await createFixture('cas-primera');
      const token = makeToken(usuario.id, cliente.id);
      await tokenRepo.save(token);

      const resultado = await tokenRepo.consumirSiVigente(token.id);

      expect(resultado).toBe(true);
      const found = await tokenRepo.findByHash(token.tokenHash);
      expect(found!.usedAt).not.toBeNull();
    });

    it('la SEGUNDA llamada sobre el mismo token devuelve false — es el CAS que garantiza el uso único', async () => {
      const { cliente, usuario } = await createFixture('cas-segunda');
      const token = makeToken(usuario.id, cliente.id);
      await tokenRepo.save(token);

      const primera = await tokenRepo.consumirSiVigente(token.id);
      const segunda = await tokenRepo.consumirSiVigente(token.id);

      expect(primera).toBe(true);
      expect(segunda).toBe(false);
    });

    it('un id inexistente devuelve false (0 filas afectadas)', async () => {
      const resultado = await tokenRepo.consumirSiVigente('01977a00-0000-7000-8000-000000000000');
      expect(resultado).toBe(false);
    });

    it('un token REVOCADO devuelve false — un link revocado no puede cambiar la clave', async () => {
      const { cliente, usuario } = await createFixture('cas-revocado');
      const token = makeToken(usuario.id, cliente.id);
      await tokenRepo.save(token);
      await tokenRepo.revocarVigentesDeUsuario(usuario.id);

      const resultado = await tokenRepo.consumirSiVigente(token.id);

      expect(resultado).toBe(false);
      const found = await tokenRepo.findByHash(token.tokenHash);
      expect(found!.usedAt).toBeNull();
    });

    it('un token VENCIDO devuelve false — un link vencido no puede cambiar la clave', async () => {
      const { cliente, usuario } = await createFixture('cas-vencido');
      const token = makeToken(usuario.id, cliente.id, {
        expiresAt: new Date(Date.now() - 1000),
      });
      await tokenRepo.save(token);

      const resultado = await tokenRepo.consumirSiVigente(token.id);

      expect(resultado).toBe(false);
      const found = await tokenRepo.findByHash(token.tokenHash);
      expect(found!.usedAt).toBeNull();
    });

    it('[CRITICAL] dos consumirSiVigente concurrentes sobre el mismo token dan exactamente un true — doble reset imposible', async () => {
      const { cliente, usuario } = await createFixture('cas-concurrente');
      const token = makeToken(usuario.id, cliente.id);
      await tokenRepo.save(token);

      const [primero, segundo] = await Promise.all([
        tokenRepo.consumirSiVigente(token.id),
        tokenRepo.consumirSiVigente(token.id),
      ]);

      const ganadores = [primero, segundo].filter((resultado) => resultado === true);
      expect(ganadores).toHaveLength(1);
      const found = await tokenRepo.findByHash(token.tokenHash);
      expect(found!.usedAt).not.toBeNull();
    });
  });
});
