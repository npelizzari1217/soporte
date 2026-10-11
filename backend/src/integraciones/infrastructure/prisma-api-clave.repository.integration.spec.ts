/**
 * Repositorio de claves de API sobre `soporte_master_test`. No trunca: crea clientes y usuarios
 * propios con sufijo aleatorio y los borra al final (las claves caen por cascada).
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../testing/lock-master-test';
import { NuevaApiClave } from '../domain/api-clave';
import { generarClaveApi } from '../domain/generar-clave-api';
import { PrismaApiClaveRepository } from './prisma-api-clave.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;

usarLockMasterTest();

describe('PrismaApiClaveRepository', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaApiClaveRepository;
  const clientes: string[] = [];
  const usuarios: string[] = [];

  const sufijo = (): string => randomBytes(6).toString('hex');
  const crearCliente = async (): Promise<string> => {
    const s = sufijo();
    const r = await pool.query(
      'INSERT INTO clientes (nombre, db_name, updated_at) VALUES ($1, $2, now()) RETURNING id',
      [`Cliente ${s}`, `db_apiclave_${s}`],
    );
    clientes.push(r.rows[0].id);
    return r.rows[0].id;
  };
  const crearUsuario = async (): Promise<string> => {
    const s = sufijo();
    const r = await pool.query(
      `INSERT INTO usuarios (email, nombre, apellido, password_hash, es_integracion, updated_at)
       VALUES ($1, 'Integracion', 'Api', 'x', true, now()) RETURNING id`,
      [`api-${s}@test.local`],
    );
    usuarios.push(r.rows[0].id);
    return r.rows[0].id;
  };

  const nueva = (clienteId: string, usuarioId: string, extra: Partial<NuevaApiClave> = {}) => {
    const g = generarClaveApi();
    return {
      clienteId,
      usuarioId,
      nombre: 'ERP',
      prefijo: g.prefijo,
      hash: g.hash,
      permisos: ['TICKETS:LECTURA' as const],
      creadaPorId: usuarioId,
      ...extra,
    };
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaApiClaveRepository(prismaService);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clientes]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarios]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('crea la clave y la encuentra por hash con su cliente, usuario y permisos', async () => {
    const [c, u] = [await crearCliente(), await crearUsuario()];
    const datos = nueva(c, u, { permisos: ['TICKETS:LECTURA', 'TICKETS:ALTAS'] });
    const creada = (await repo.crear(datos)).getOrThrow();

    const hallada = await repo.buscarPorHash(datos.hash);
    expect(hallada).toMatchObject({
      id: creada.id,
      clienteId: c,
      usuarioId: u,
      permisos: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
      ultimoUsoAt: null,
      revocadaAt: null,
    });
    expect(await repo.buscarPorHash('0'.repeat(64))).toBeNull();
  });

  it('rechaza un hash o un prefijo repetidos con un error de dominio', async () => {
    const [c, u] = [await crearCliente(), await crearUsuario()];
    const datos = nueva(c, u);
    expect((await repo.crear(datos)).isOk()).toBe(true);

    const mismoHash = await repo.crear({ ...nueva(c, u), hash: datos.hash });
    const mismoPrefijo = await repo.crear({ ...nueva(c, u), prefijo: datos.prefijo });
    expect(mismoHash.getError().code).toBe('API_CLAVE_DUPLICADA');
    expect(mismoPrefijo.getError().code).toBe('API_CLAVE_DUPLICADA');
  });

  it('listarPorCliente nunca devuelve las claves de otro cliente', async () => {
    const [cA, cB, u] = [await crearCliente(), await crearCliente(), await crearUsuario()];
    const a = (await repo.crear(nueva(cA, u))).getOrThrow();
    const b = (await repo.crear(nueva(cB, u))).getOrThrow();

    expect((await repo.listarPorCliente(cA)).map((k) => k.id)).toEqual([a.id]);
    expect((await repo.listarPorCliente(cB)).map((k) => k.id)).toEqual([b.id]);
  });

  it('revocar esta acotado por cliente y es idempotente', async () => {
    const [cA, cB, u] = [await crearCliente(), await crearCliente(), await crearUsuario()];
    const datos = nueva(cA, u);
    const clave = (await repo.crear(datos)).getOrThrow();
    const t1 = new Date('2026-10-11T10:00:00Z');

    expect(await repo.revocar(cB, clave.id, t1)).toBe(false);
    expect((await repo.buscarPorHash(datos.hash))?.revocadaAt).toBeNull();

    expect(await repo.revocar(cA, clave.id, t1)).toBe(true);
    expect(await repo.revocar(cA, clave.id, new Date('2026-10-11T11:00:00Z'))).toBe(true);
    expect((await repo.buscarPorHash(datos.hash))?.revocadaAt).toEqual(t1);
  });

  it('registrarUso fija el ultimo uso', async () => {
    const [c, u] = [await crearCliente(), await crearUsuario()];
    const datos = nueva(c, u);
    const clave = (await repo.crear(datos)).getOrThrow();
    const ahora = new Date('2026-10-11T12:00:00Z');

    await repo.registrarUso(clave.id, ahora);
    expect((await repo.buscarPorHash(datos.hash))?.ultimoUsoAt).toEqual(ahora);
  });

  it('borrar el cliente o el usuario de integracion borra sus claves (cascada)', async () => {
    const [c1, u1] = [await crearCliente(), await crearUsuario()];
    const [c2, u2, admin] = [await crearCliente(), await crearUsuario(), await crearUsuario()];
    const porCliente = nueva(c1, u1, { creadaPorId: admin });
    const porUsuario = nueva(c2, u2, { creadaPorId: admin });
    await repo.crear(porCliente);
    await repo.crear(porUsuario);

    await pool.query('DELETE FROM clientes WHERE id = $1', [c1]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [u2]);

    expect(await repo.buscarPorHash(porCliente.hash)).toBeNull();
    expect(await repo.buscarPorHash(porUsuario.hash)).toBeNull();
  });

  it('no se puede borrar al administrador que emitio una clave (restrict)', async () => {
    const [c, u, admin] = [await crearCliente(), await crearUsuario(), await crearUsuario()];
    await repo.crear(nueva(c, u, { creadaPorId: admin }));

    await expect(pool.query('DELETE FROM usuarios WHERE id = $1', [admin])).rejects.toThrow(
      /api_claves_creada_por_id_fkey/,
    );
  });
});
