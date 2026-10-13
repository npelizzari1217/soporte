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
    const creado = await repo.crear(datos(c, { eventos: ['TICKET_CREADO', 'TICKET_COMENTADO'] }));

    expect(creado).not.toBeNull();
    expect(await repo.buscarPorCliente(c)).toEqual(creado);
    expect(creado).toMatchObject({
      clienteId: c,
      url: `https://erp.example.com/hooks/${c}`,
      eventos: ['TICKET_CREADO', 'TICKET_COMENTADO'],
      secretoCifrado: `v1:iv:tag:${c}`,
      activo: true,
    });
    expect(creado?.createdAt).toBeInstanceOf(Date);
  });

  it('crear sobre un destino existente devuelve null y no pisa nada (JD-2)', async () => {
    const c = await crearCliente();
    const primero = await repo.crear(datos(c));

    const segundo = await repo.crear(
      datos(c, { url: 'https://otro.example.com/in', secretoCifrado: 'v1:iv:tag:otro' }),
    );

    expect(segundo).toBeNull();
    expect(await repo.buscarPorCliente(c)).toEqual(primero);
    const filas = await pool.query(
      'SELECT count(*)::int AS n FROM webhook_destinos WHERE cliente_id = $1',
      [c],
    );
    expect(filas.rows[0].n).toBe(1);
  });

  it('actualizarConfiguracion cambia URL, eventos y activo, y nunca el secreto', async () => {
    const c = await crearCliente();
    const primero = await repo.crear(datos(c));

    const actualizado = await repo.actualizarConfiguracion(c, {
      url: 'https://otro.example.com/in',
      eventos: ['TICKET_ASIGNADO', 'TICKET_ESTADO_CAMBIADO'],
      activo: false,
    });

    expect(actualizado).toMatchObject({
      url: 'https://otro.example.com/in',
      eventos: ['TICKET_ASIGNADO', 'TICKET_ESTADO_CAMBIADO'],
      secretoCifrado: `v1:iv:tag:${c}`,
      activo: false,
      createdAt: primero?.createdAt,
    });
    expect(await repo.buscarPorCliente(c)).toEqual(actualizado);
  });

  it('actualizarSecreto cambia solo el secreto', async () => {
    const c = await crearCliente();
    const primero = await repo.crear(datos(c));

    const actualizado = await repo.actualizarSecreto(c, 'v1:iv:tag:nuevo');

    expect(actualizado).toMatchObject({
      url: primero?.url,
      eventos: primero?.eventos,
      activo: primero?.activo,
      secretoCifrado: 'v1:iv:tag:nuevo',
    });
    expect(await repo.buscarPorCliente(c)).toEqual(actualizado);
  });

  it('las dos actualizaciones devuelven null y no crean nada si el cliente no tiene destino', async () => {
    const c = await crearCliente();

    expect(
      await repo.actualizarConfiguracion(c, {
        url: 'https://otro.example.com/in',
        eventos: ['TICKET_CREADO'],
        activo: true,
      }),
    ).toBeNull();
    expect(await repo.actualizarSecreto(c, 'v1:iv:tag:nuevo')).toBeNull();
    expect(await repo.buscarPorCliente(c)).toBeNull();
  });

  it('aislamiento: escribir el destino de un cliente no toca ni devuelve el de otro', async () => {
    const [cA, cB] = [await crearCliente(), await crearCliente()];
    await repo.crear(datos(cA));
    await repo.crear(datos(cB, { eventos: ['TICKET_ASIGNADO'] }));
    await repo.actualizarConfiguracion(cA, {
      url: 'https://a.example.com/cambiada',
      eventos: ['TICKET_CREADO'],
      activo: true,
    });
    await repo.actualizarSecreto(cA, 'v1:iv:tag:a-nuevo');

    expect(await repo.buscarPorCliente(cA)).toMatchObject({
      clienteId: cA,
      url: 'https://a.example.com/cambiada',
      secretoCifrado: 'v1:iv:tag:a-nuevo',
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
    await repo.crear(datos(c));
    await pool.query(
      `UPDATE webhook_destinos SET eventos = ARRAY['TICKET_CREADO', 'SLA_VENCIDO'] WHERE cliente_id = $1`,
      [c],
    );
    expect((await repo.buscarPorCliente(c))?.eventos).toEqual(['TICKET_CREADO']);
  });

  it('el destino cae en cascada al borrar el cliente', async () => {
    const c = await crearCliente();
    await repo.crear(datos(c));
    await pool.query('DELETE FROM clientes WHERE id = $1', [c]);
    expect(await repo.buscarPorCliente(c)).toBeNull();
  });
});
