/**
 * Repositorio del destino de webhooks sobre `soporte_master_test`. No trunca: crea clientes propios
 * con sufijo aleatorio y los borra al final (los destinos caen por cascada).
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../testing/lock-master-test';
import { DatosWebhookDestino } from '../domain/webhook-destino';
import { PrismaWebhookDestinoRepository } from './prisma-webhook-destino.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;

usarLockMasterTest();

describe('PrismaWebhookDestinoRepository', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaWebhookDestinoRepository;
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

  const datos = (clienteId: string, extra: Partial<DatosWebhookDestino> = {}) => ({
    clienteId,
    url: `https://erp.example.com/hooks/${clienteId}`,
    eventos: ['TICKET_CREADO' as const],
    secretoCifrado: `v1:iv:tag:${clienteId}`,
    activo: true,
    ...extra,
  });

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaWebhookDestinoRepository(prismaService);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clientes]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('devuelve null si el cliente no tiene destino', async () => {
    expect(await repo.buscarPorCliente(await crearCliente())).toBeNull();
  });

  it('crea el destino y lo lee con el secreto cifrado tal como se guardo', async () => {
    const c = await crearCliente();
    const guardado = await repo.guardar(
      datos(c, { eventos: ['TICKET_CREADO', 'TICKET_COMENTADO'] }),
    );

    expect(await repo.buscarPorCliente(c)).toEqual(guardado);
    expect(guardado).toMatchObject({
      clienteId: c,
      url: `https://erp.example.com/hooks/${c}`,
      eventos: ['TICKET_CREADO', 'TICKET_COMENTADO'],
      secretoCifrado: `v1:iv:tag:${c}`,
      activo: true,
    });
    expect(guardado.createdAt).toBeInstanceOf(Date);
  });

  it('guardar de nuevo reemplaza el destino del cliente: sigue habiendo uno solo', async () => {
    const c = await crearCliente();
    const primero = await repo.guardar(datos(c));
    const segundo = await repo.guardar(
      datos(c, {
        url: 'https://otro.example.com/in',
        eventos: ['TICKET_ASIGNADO', 'TICKET_ESTADO_CAMBIADO'],
        secretoCifrado: 'v1:iv:tag:nuevo',
        activo: false,
      }),
    );

    expect(segundo).toMatchObject({
      url: 'https://otro.example.com/in',
      eventos: ['TICKET_ASIGNADO', 'TICKET_ESTADO_CAMBIADO'],
      secretoCifrado: 'v1:iv:tag:nuevo',
      activo: false,
      createdAt: primero.createdAt,
    });
    const filas = await pool.query(
      'SELECT count(*)::int AS n FROM webhook_destinos WHERE cliente_id = $1',
      [c],
    );
    expect(filas.rows[0].n).toBe(1);
  });

  it('aislamiento: guardar el destino de un cliente no toca ni devuelve el de otro', async () => {
    const [cA, cB] = [await crearCliente(), await crearCliente()];
    await repo.guardar(datos(cA));
    await repo.guardar(datos(cB, { eventos: ['TICKET_ASIGNADO'] }));
    await repo.guardar(datos(cA, { url: 'https://a.example.com/cambiada' }));

    expect(await repo.buscarPorCliente(cA)).toMatchObject({
      clienteId: cA,
      url: 'https://a.example.com/cambiada',
      secretoCifrado: `v1:iv:tag:${cA}`,
    });
    expect(await repo.buscarPorCliente(cB)).toMatchObject({
      clienteId: cB,
      url: `https://erp.example.com/hooks/${cB}`,
      eventos: ['TICKET_ASIGNADO'],
      secretoCifrado: `v1:iv:tag:${cB}`,
    });
  });

  it('descarta al leer un evento que el dominio no reconoce', async () => {
    const c = await crearCliente();
    await repo.guardar(datos(c));
    await pool.query(
      `UPDATE webhook_destinos SET eventos = ARRAY['TICKET_CREADO', 'SLA_VENCIDO'] WHERE cliente_id = $1`,
      [c],
    );
    expect((await repo.buscarPorCliente(c))?.eventos).toEqual(['TICKET_CREADO']);
  });

  it('el destino cae en cascada al borrar el cliente', async () => {
    const c = await crearCliente();
    await repo.guardar(datos(c));
    await pool.query('DELETE FROM clientes WHERE id = $1', [c]);
    expect(await repo.buscarPorCliente(c)).toBeNull();
  });
});
