/**
 * JD-2 (odd/webhooks, T9): un PUT del destino no reescribe el secreto. Reproduce las dos carreras
 * de forma determinista sobre `soporte_master_test`, con el repositorio real: el `buscarPorCliente`
 * que usa el PUT deja que otra escritura se confirme entre su lectura y la escritura del PUT.
 * No trunca: crea clientes propios con sufijo aleatorio y los borra al final.
 */
import type { LookupAddress } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { AesGcmSecretCipher } from '../../shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../testing/lock-master-test';
import { GuardarWebhookDestinoUseCase } from '../application/guardar-webhook-destino.use-case';
import { RegenerarSecretoWebhookUseCase } from '../application/regenerar-secreto-webhook.use-case';
import { SecretoWebhookCifrado } from '../application/secreto-webhook-cifrado';
import { WebhookDestino } from '../domain/webhook-destino';
import { PrismaWebhookDestinoRepository } from './prisma-webhook-destino.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const PUBLICA: LookupAddress = { address: '93.184.215.14', family: 4 };

usarLockMasterTest();

/** Repositorio real cuyo `buscarPorCliente` corre `entreLecturaYEscritura` antes de devolver. */
class RepositorioConIntercalado extends PrismaWebhookDestinoRepository {
  constructor(
    prisma: PrismaService,
    private readonly entreLecturaYEscritura: (clienteId: string) => Promise<void>,
  ) {
    super(prisma);
  }

  override async buscarPorCliente(clienteId: string): Promise<WebhookDestino | null> {
    const actual = await super.buscarPorCliente(clienteId);
    await this.entreLecturaYEscritura(clienteId);
    return actual;
  }
}

describe('GuardarWebhookDestinoUseCase contra escrituras concurrentes (JD-2)', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaWebhookDestinoRepository;
  let secretos: SecretoWebhookCifrado;
  let clavePrevia: string | undefined;
  const clientes: string[] = [];

  const crearCliente = async (): Promise<string> => {
    const s = randomBytes(6).toString('hex');
    const r = await pool.query(
      'INSERT INTO clientes (nombre, db_name, updated_at) VALUES ($1, $2, now()) RETURNING id',
      [`Cliente ${s}`, `db_webhook_${s}`],
    );
    clientes.push(r.rows[0].id);
    return r.rows[0].id;
  };

  const conApi = {
    findById: async (id: string) =>
      ClienteEntity.create(
        {
          nombre: 'Cliente',
          razonSocial: null,
          cuit: null,
          dbName: 'soporte_x',
          activo: true,
          apiHabilitada: true,
        },
        id,
      ),
  };

  const guardar = (destinos: PrismaWebhookDestinoRepository) =>
    new GuardarWebhookDestinoUseCase(conApi, destinos, secretos, async () => [PUBLICA]);

  const comando = (clienteId: string, url: string) => ({
    clienteId,
    url,
    eventos: ['TICKET_CREADO', 'TICKET_ASIGNADO'],
    activo: true,
  });

  const secretoGuardado = async (clienteId: string): Promise<string> => {
    const fila = await repo.buscarPorCliente(clienteId);
    return secretos.descifrar(clienteId, fila?.secretoCifrado ?? '').getValue();
  };

  beforeAll(() => {
    clavePrevia = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = 'ab'.repeat(32);
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaWebhookDestinoRepository(prismaService);
    secretos = new SecretoWebhookCifrado(new AesGcmSecretCipher());
  });

  afterAll(async () => {
    await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clientes]);
    await pool.end();
    await prismaService.onModuleDestroy();
    if (clavePrevia === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = clavePrevia;
  });

  it('una regeneración confirmada entre la lectura y la escritura del PUT sobrevive al PUT', async () => {
    const c = await crearCliente();
    const alta = await guardar(repo).execute(comando(c, 'https://erp.example.com/hook'));
    const secretoOriginal = alta.getValue().secreto;
    expect(secretoOriginal).toMatch(/^whsec_/);

    const regenerar = new RegenerarSecretoWebhookUseCase(conApi, repo, secretos);
    let regenerado: string | undefined;
    const intercalado = new RepositorioConIntercalado(prismaService, async (clienteId) => {
      regenerado = (await regenerar.execute(clienteId)).getValue().secreto;
    });

    const put = await guardar(intercalado).execute(comando(c, 'https://erp.example.com/otro'));

    expect(put.isOk()).toBe(true);
    expect(put.getValue()).not.toHaveProperty('secreto');
    expect(put.getValue().url).toBe('https://erp.example.com/otro');
    expect(regenerado).toMatch(/^whsec_/);
    expect(regenerado).not.toBe(secretoOriginal);
    expect(await secretoGuardado(c)).toBe(regenerado);
  });

  it('un alta que pierde la carrera contra otra alta no devuelve secreto ni pisa el guardado', async () => {
    const c = await crearCliente();
    const secretoGanador = 'whsec_ganador_de_la_carrera';
    const intercalado = new RepositorioConIntercalado(prismaService, async (clienteId) => {
      await pool.query(
        `INSERT INTO webhook_destinos (cliente_id, url, eventos, secreto_cifrado, activo, updated_at)
         VALUES ($1, 'https://ganador.example.com/hook', ARRAY['TICKET_CREADO'], $2, true, now())`,
        [clienteId, secretos.cifrar(clienteId, secretoGanador)],
      );
    });

    const put = await guardar(intercalado).execute(comando(c, 'https://perdedor.example.com/hook'));

    expect(put.isOk()).toBe(true);
    expect(put.getValue()).not.toHaveProperty('secreto');
    expect(put.getValue()).toMatchObject({
      url: 'https://perdedor.example.com/hook',
      eventos: ['TICKET_CREADO', 'TICKET_ASIGNADO'],
    });
    expect(await secretoGuardado(c)).toBe(secretoGanador);
    const filas = await pool.query(
      'SELECT count(*)::int AS n FROM webhook_destinos WHERE cliente_id = $1',
      [c],
    );
    expect(filas.rows[0].n).toBe(1);
  });
});
