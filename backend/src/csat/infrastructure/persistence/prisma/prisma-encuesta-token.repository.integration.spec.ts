/**
 * prisma-encuesta-token.repository.integration.spec.ts — Integración contra
 * Postgres REAL (`soporte_master_test`). Tarea 5.2.
 *
 * `encuesta_tokens` tiene FK a `clientes` (misma DB): el TRUNCATE del
 * `beforeEach` incluye ambas tablas, mismo patrón que
 * `prisma-auth-repos.integration.spec.ts`. Truncar `clientes` en la base
 * COMPARTIDA de test exige el turno exclusivo — ver `usarLockMasterTest()`.
 *
 * Ref design: ADR-C1, ADR-C2 (CAS de uso único). Tarea: 5.2.
 */
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaEncuestaTokenRepository } from './prisma-encuesta-token.repository';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { EncuestaTokenEntity } from '../../../domain/entities/encuesta-token.entity';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('PrismaEncuestaTokenRepository — Integration (5.2)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let tokenRepo: PrismaEncuestaTokenRepository;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    tokenRepo = new PrismaEncuestaTokenRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE encuesta_tokens, clientes RESTART IDENTITY CASCADE',
    );
  });

  async function createTestCliente(suffix: string): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `TestCliente ${suffix}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_csat_${suffix}`,
      activo: true,
      csatHabilitado: true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  function makeToken(
    clienteId: string,
    ticketId: string,
    overrides: Partial<{ tokenHash: string }> = {},
  ) {
    return EncuestaTokenEntity.create({
      clienteId,
      ticketId,
      tokenHash: overrides.tokenHash ?? `hash-${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      usedAt: null,
      revokedAt: null,
    });
  }

  describe('findByHash() / save()', () => {
    it('persiste un token y lo recupera por su hash', async () => {
      const cliente = await createTestCliente('findbyhash');
      const ticketId = '01977a00-0000-7000-8000-0000000000a1';
      const token = makeToken(cliente.id, ticketId, { tokenHash: 'hash-fijo-1' });

      await tokenRepo.save(token);
      const found = await tokenRepo.findByHash('hash-fijo-1');

      expect(found).not.toBeNull();
      expect(found!.id).toBe(token.id);
      expect(found!.clienteId).toBe(cliente.id);
      expect(found!.ticketId).toBe(ticketId);
      expect(found!.usedAt).toBeNull();
      expect(found!.revokedAt).toBeNull();
    });

    it('findByHash retorna null cuando el hash no existe', async () => {
      const found = await tokenRepo.findByHash('hash-inexistente');
      expect(found).toBeNull();
    });
  });

  describe('revocarVigentesDeTicket()', () => {
    it('revoca solo los tokens VIGENTES del ticket (no toca uno ya usado)', async () => {
      const cliente = await createTestCliente('revocar');
      const ticketId = '01977a00-0000-7000-8000-0000000000a2';
      const vigente = makeToken(cliente.id, ticketId, { tokenHash: 'hash-vigente' });
      const yaUsado = makeToken(cliente.id, ticketId, { tokenHash: 'hash-ya-usado' });
      await tokenRepo.save(vigente);
      await tokenRepo.save(yaUsado);
      await tokenRepo.marcarUsadoSiNoUsado(yaUsado.id);

      const cantidad = await tokenRepo.revocarVigentesDeTicket(cliente.id, ticketId);

      expect(cantidad).toBe(1);
      const vigenteRevisado = await tokenRepo.findByHash('hash-vigente');
      const usadoRevisado = await tokenRepo.findByHash('hash-ya-usado');
      expect(vigenteRevisado!.revokedAt).not.toBeNull();
      expect(usadoRevisado!.revokedAt).toBeNull();
    });

    it('es idempotente: una segunda llamada sin tokens vigentes devuelve 0', async () => {
      const cliente = await createTestCliente('revocar-idempotente');
      const ticketId = '01977a00-0000-7000-8000-0000000000a3';
      const token = makeToken(cliente.id, ticketId);
      await tokenRepo.save(token);

      await tokenRepo.revocarVigentesDeTicket(cliente.id, ticketId);
      const segundaVez = await tokenRepo.revocarVigentesDeTicket(cliente.id, ticketId);

      expect(segundaVez).toBe(0);
    });

    /**
     * WU11.2 (verify #2507, CRITICAL-2): sacar `clienteId`/`ticketId` del
     * WHERE de `revocarVigentesDeTicket` dejaba 85/85 en verde porque el
     * único test de esta función usaba UN cliente y UN ticket — sin
     * ninguna fila que el filtro debiera EXCLUIR, cualquier WHERE pasa. Este
     * test siembra tokens vigentes de OTRO cliente y de OTRO ticket del
     * MISMO cliente, y verifica que revocar uno no toca los ajenos.
     */
    it('[CRITICAL] filtra por cliente Y ticket — no revoca tokens de otro cliente ni de otro ticket del mismo cliente', async () => {
      const clienteObjetivo = await createTestCliente('revocar-filtro-objetivo');
      const clienteAjeno = await createTestCliente('revocar-filtro-ajeno');
      const ticketObjetivoId = '01977a00-0000-7000-8000-0000000000b1';
      const otroTicketMismoClienteId = '01977a00-0000-7000-8000-0000000000b2';

      const tokenObjetivo = makeToken(clienteObjetivo.id, ticketObjetivoId, {
        tokenHash: 'hash-objetivo',
      });
      const tokenOtroTicketMismoCliente = makeToken(clienteObjetivo.id, otroTicketMismoClienteId, {
        tokenHash: 'hash-otro-ticket-mismo-cliente',
      });
      const tokenOtroCliente = makeToken(clienteAjeno.id, ticketObjetivoId, {
        tokenHash: 'hash-otro-cliente',
      });
      await tokenRepo.save(tokenObjetivo);
      await tokenRepo.save(tokenOtroTicketMismoCliente);
      await tokenRepo.save(tokenOtroCliente);

      const cantidad = await tokenRepo.revocarVigentesDeTicket(
        clienteObjetivo.id,
        ticketObjetivoId,
      );

      expect(cantidad).toBe(1);
      const objetivoRevisado = await tokenRepo.findByHash('hash-objetivo');
      const otroTicketRevisado = await tokenRepo.findByHash('hash-otro-ticket-mismo-cliente');
      const otroClienteRevisado = await tokenRepo.findByHash('hash-otro-cliente');
      expect(objetivoRevisado!.revokedAt).not.toBeNull();
      expect(otroTicketRevisado!.revokedAt).toBeNull();
      expect(otroClienteRevisado!.revokedAt).toBeNull();
    });
  });

  describe('marcarUsadoSiNoUsado() — CAS de uso único (ADR-C2)', () => {
    it('la PRIMERA llamada marca el token y devuelve true', async () => {
      const cliente = await createTestCliente('cas-primera');
      const token = makeToken(cliente.id, '01977a00-0000-7000-8000-0000000000a4');
      await tokenRepo.save(token);

      const resultado = await tokenRepo.marcarUsadoSiNoUsado(token.id);

      expect(resultado).toBe(true);
      const found = await tokenRepo.findByHash(token.tokenHash);
      expect(found!.usedAt).not.toBeNull();
    });

    it('la SEGUNDA llamada sobre el mismo token devuelve false — es el CAS que garantiza el uso único', async () => {
      const cliente = await createTestCliente('cas-segunda');
      const token = makeToken(cliente.id, '01977a00-0000-7000-8000-0000000000a5');
      await tokenRepo.save(token);

      const primera = await tokenRepo.marcarUsadoSiNoUsado(token.id);
      const segunda = await tokenRepo.marcarUsadoSiNoUsado(token.id);

      expect(primera).toBe(true);
      expect(segunda).toBe(false);
    });

    it('un id inexistente devuelve false (0 filas afectadas)', async () => {
      const resultado = await tokenRepo.marcarUsadoSiNoUsado(
        '01977a00-0000-7000-8000-000000000000',
      );
      expect(resultado).toBe(false);
    });
  });

  describe('liberarUso()', () => {
    it('limpia usedAt — compensación best-effort si el insert del tenant falla', async () => {
      const cliente = await createTestCliente('liberar-uso');
      const token = makeToken(cliente.id, '01977a00-0000-7000-8000-0000000000a6');
      await tokenRepo.save(token);
      await tokenRepo.marcarUsadoSiNoUsado(token.id);

      await tokenRepo.liberarUso(token.id);

      const found = await tokenRepo.findByHash(token.tokenHash);
      expect(found!.usedAt).toBeNull();
      // Liberado, el CAS vuelve a poder marcarlo — confirma que quedó limpio.
      const puedeMarcarseDeNuevo = await tokenRepo.marcarUsadoSiNoUsado(token.id);
      expect(puedeMarcarseDeNuevo).toBe(true);
    });
  });
});
