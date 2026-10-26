/**
 * Repositorio de `asistente_ia_config` contra `soporte_master_test` (odd/asistente-ia-ayuda, T1).
 * No trunca: crea clientes propios con sufijo aleatorio y los borra al final.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../testing/lock-master-test';
import { URL_IA_POR_DEFECTO } from '../domain/config-ia';
import { PrismaAsistenteIaConfigRepository } from './prisma-asistente-ia-config.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;

usarLockMasterTest();

describe('PrismaAsistenteIaConfigRepository (integración)', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaAsistenteIaConfigRepository;
  const clientes: string[] = [];

  const crearCliente = async (): Promise<string> => {
    const s = randomBytes(6).toString('hex');
    const r = await pool.query(
      'INSERT INTO clientes (nombre, db_name, updated_at) VALUES ($1, $2, now()) RETURNING id',
      [`Cliente ${s}`, `db_ia_${s}`],
    );
    clientes.push(r.rows[0].id);
    return r.rows[0].id;
  };

  const datos = (clienteId: string, claveCifrada = 'v1:a:b:c') => ({
    clienteId,
    url: URL_IA_POR_DEFECTO,
    modelo: 'gemini-2.5-flash',
    claveCifrada,
  });

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaAsistenteIaConfigRepository(prismaService);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clientes]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('un cliente sin configuración devuelve null', async () => {
    expect(await repo.buscarPorCliente(await crearCliente())).toBeNull();
  });

  it('guardar crea la fila y buscar la devuelve con la clave cifrada tal cual', async () => {
    const c = await crearCliente();
    await repo.guardar(datos(c));
    expect(await repo.buscarPorCliente(c)).toEqual({
      ...datos(c),
      verificadoAt: null,
      verificacionError: null,
    });
  });

  it('volver a guardar reemplaza la configuración y limpia la verificación anterior', async () => {
    const c = await crearCliente();
    await repo.guardar(datos(c));
    await repo.guardarVerificacion(c, { ok: true, motivo: null });
    await repo.guardar({ ...datos(c, 'v1:nueva'), modelo: 'gemini-2.0-flash' });

    const fila = await repo.buscarPorCliente(c);
    expect(fila?.claveCifrada).toBe('v1:nueva');
    expect(fila?.modelo).toBe('gemini-2.0-flash');
    expect(fila?.verificadoAt).toBeNull();
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM asistente_ia_config WHERE cliente_id = $1',
      [c],
    );
    expect(rows[0].n).toBe(1);
  });

  it('una falla de verificación conserva el último éxito y escribe solo el motivo', async () => {
    const c = await crearCliente();
    await repo.guardar(datos(c));
    const exito = await repo.guardarVerificacion(c, { ok: true, motivo: null });
    const falla = await repo.guardarVerificacion(c, {
      ok: false,
      motivo: 'El proveedor rechazó la clave.',
    });

    expect(exito?.verificadoAt).toBeInstanceOf(Date);
    expect(falla?.verificadoAt).toEqual(exito?.verificadoAt);
    expect(falla?.verificacionError).toBe('El proveedor rechazó la clave.');
    expect(falla?.claveCifrada).toBe('v1:a:b:c');
  });

  it('verificar un cliente sin configuración devuelve null y no crea la fila', async () => {
    const c = await crearCliente();
    expect(await repo.guardarVerificacion(c, { ok: true, motivo: null })).toBeNull();
    expect(await repo.buscarPorCliente(c)).toBeNull();
  });

  it('quitar borra la configuración y es idempotente', async () => {
    const c = await crearCliente();
    await repo.guardar(datos(c));
    await repo.quitar(c);
    await repo.quitar(c);
    expect(await repo.buscarPorCliente(c)).toBeNull();
  });

  it('borrar el cliente borra su configuración (FK en cascada)', async () => {
    const c = await crearCliente();
    await repo.guardar(datos(c));
    await pool.query('DELETE FROM clientes WHERE id = $1', [c]);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM asistente_ia_config WHERE cliente_id = $1',
      [c],
    );
    expect(rows[0].n).toBe(0);
  });
});
