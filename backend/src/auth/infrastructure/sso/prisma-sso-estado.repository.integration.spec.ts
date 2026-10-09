/**
 * Repositorio de estados SSO sobre `soporte_master_test` (WU-1a, ADR-1). No trunca: usa hashes
 * con sufijo aleatorio y borra solo sus filas. La purga se prueba con filas viejas propias.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { NuevoSsoEstado } from '../../domain/ports/sso-estado-repository.port';
import { PrismaSsoEstadoRepository } from './prisma-sso-estado.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');
const MINUTO = 60_000;

usarLockMasterTest();

describe('PrismaSsoEstadoRepository', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaSsoEstadoRepository;
  let reloj = Date.now();
  const hashes: string[] = [];

  const nuevo = (extra: Partial<NuevoSsoEstado> = {}): NuevoSsoEstado => {
    const stateHash = sha256(`state-${randomBytes(8).toString('hex')}`);
    hashes.push(stateHash);
    return {
      stateHash,
      proveedor: 'GOOGLE',
      nonce: 'nonce-1',
      codeVerifier: 'verifier-1',
      navegadorHash: sha256('binding-1'),
      siguiente: '/tickets',
      expiraAt: new Date(Date.now() + 10 * MINUTO),
      ...extra,
    };
  };
  const consumo = (e: NuevoSsoEstado, extra: Record<string, string> = {}) => ({
    stateHash: e.stateHash,
    proveedor: e.proveedor,
    navegadorHash: e.navegadorHash,
    ...extra,
  });
  const fila = async (stateHash: string) =>
    (await pool.query('SELECT * FROM sso_estados WHERE state_hash = $1', [stateHash])).rows[0];

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaSsoEstadoRepository(prismaService, () => reloj);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM sso_estados WHERE state_hash = ANY($1)', [hashes]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('persiste solo hashes: ni el state ni el bindingToken crudos aparecen en la fila', async () => {
    const estado = nuevo();
    await repo.crear(estado);
    const f = await fila(estado.stateHash);
    expect(f.state_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(f.navegador_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(f)).not.toContain('binding-1');
    expect(f.proveedor).toBe('GOOGLE');
  });

  it('consumir devuelve nonce, code_verifier y siguiente una sola vez', async () => {
    const estado = nuevo();
    await repo.crear(estado);
    expect(await repo.consumir(consumo(estado))).toEqual({
      nonce: 'nonce-1',
      codeVerifier: 'verifier-1',
      siguiente: '/tickets',
    });
    expect(await repo.consumir(consumo(estado))).toBeNull();
    expect((await fila(estado.stateHash)).usado_at).not.toBeNull();
  });

  it('un estado expirado no se consume', async () => {
    const estado = nuevo({ expiraAt: new Date(Date.now() - MINUTO) });
    await repo.crear(estado);
    expect(await repo.consumir(consumo(estado))).toBeNull();
  });

  it('un state inventado devuelve null', async () => {
    const estado = nuevo();
    expect(await repo.consumir(consumo(estado))).toBeNull();
  });

  it('proveedor cruzado devuelve null y la fila sigue consumible', async () => {
    const estado = nuevo();
    await repo.crear(estado);
    expect(await repo.consumir(consumo(estado, { proveedor: 'MICROSOFT' }))).toBeNull();
    expect((await fila(estado.stateHash)).usado_at).toBeNull();
    expect(await repo.consumir(consumo(estado))).not.toBeNull();
  });

  it('navegador ajeno devuelve null y la fila sigue consumible', async () => {
    const estado = nuevo();
    await repo.crear(estado);
    expect(await repo.consumir(consumo(estado, { navegadorHash: sha256('otro') }))).toBeNull();
    expect((await fila(estado.stateHash)).usado_at).toBeNull();
    expect(await repo.consumir(consumo(estado))).not.toBeNull();
  });

  it('dos consumos concurrentes: exactamente uno gana', async () => {
    const estado = nuevo();
    await repo.crear(estado);
    const resultados = await Promise.all([
      repo.consumir(consumo(estado)),
      repo.consumir(consumo(estado)),
    ]);
    expect(resultados.filter((r) => r !== null)).toHaveLength(1);
  });

  it('siguiente nulo se devuelve como nulo', async () => {
    const estado = nuevo({ siguiente: null });
    await repo.crear(estado);
    expect((await repo.consumir(consumo(estado)))?.siguiente).toBeNull();
  });

  describe('purga horaria', () => {
    const sembrarVencida = async (intervalo: string): Promise<string> => {
      const h = sha256(`vieja-${randomBytes(8).toString('hex')}`);
      hashes.push(h);
      await pool.query(
        `INSERT INTO sso_estados (state_hash, proveedor, nonce, code_verifier, navegador_hash, expira_at)
         VALUES ($1, 'GOOGLE', 'n', 'v', 'b', now() - $2::interval)`,
        [h, intervalo],
      );
      return h;
    };

    it('borra lo vencido hace mas de una hora y conserva lo vencido hace menos', async () => {
      const vieja = await sembrarVencida('2 hours');
      const reciente = await sembrarVencida('10 minutes');
      reloj += 2 * 60 * MINUTO;
      await repo.crear(nuevo());
      expect(await fila(vieja)).toBeUndefined();
      expect(await fila(reciente)).toBeDefined();
    });

    it('corre como maximo una vez por hora', async () => {
      await repo.crear(nuevo());
      const vieja = await sembrarVencida('2 hours');
      reloj += 5 * MINUTO;
      await repo.crear(nuevo());
      expect(await fila(vieja)).toBeDefined();
    });

    it('un fallo de purga no falla crear', async () => {
      const real = prismaService.getMasterClient();
      const cliente = new Proxy(real, {
        get: (target, prop, receiver) =>
          prop === '$executeRaw'
            ? () => Promise.reject(new Error('purga caida'))
            : Reflect.get(target, prop, receiver),
      });
      const servicio = { getMasterClient: () => cliente } as unknown as PrismaService;
      const reloj2 = reloj + 10 * 60 * MINUTO;
      const repoConFallo = new PrismaSsoEstadoRepository(servicio, () => reloj2);
      const estado = nuevo();
      await expect(repoConFallo.crear(estado)).resolves.toBeUndefined();
      expect(await fila(estado.stateHash)).toBeDefined();
    });
  });
});
