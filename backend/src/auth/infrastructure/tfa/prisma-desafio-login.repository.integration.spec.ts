/**
 * Repositorio de desafios de login sobre `soporte_master_test` (WU-5a, ADR-1). No trunca:
 * usuarios con sufijo aleatorio, borrados al final (la tabla cae por cascada).
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { TICKET_DURACION_MS } from '../../domain/tfa/tfa.constants';
import { PrismaDesafioLoginRepository } from './prisma-desafio-login.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');

usarLockMasterTest();

describe('PrismaDesafioLoginRepository', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaDesafioLoginRepository;
  let ahora = new Date();
  const usuarioIds: string[] = [];

  const crearUsuario = async (): Promise<string> => {
    const u = await prismaService.getMasterClient().usuario.create({
      data: {
        email: `desafio-${SUFIJO}-${usuarioIds.length}@test.local`,
        nombre: 'Desafio',
        apellido: 'Test',
        passwordHash: 'x',
      },
    });
    usuarioIds.push(u.id);
    return u.id;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaDesafioLoginRepository(prismaService, () => ahora);
  });

  beforeEach(() => {
    ahora = new Date();
  });

  afterAll(async () => {
    if (usuarioIds.length)
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarioIds]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('verificar rota el token: el ticket sirve y el texto del desafio deja de servir (L2)', async () => {
    const usuario = await crearUsuario();
    const desafio = await repo.crear(usuario, 'VERIFICAR');
    const ticket = await repo.verificar(desafio, 'VERIFICAR', usuario);
    expect(ticket).toEqual(expect.any(String));
    expect(ticket).not.toBe(desafio);
    expect(await repo.verificar(desafio, 'VERIFICAR', usuario)).toBeNull();
    expect(await repo.buscarSinVerificar(desafio, 'VERIFICAR')).toBeNull();
    expect(await repo.consumir(desafio, usuario)).toBe(false);
    expect(await repo.consumir(ticket as string, usuario)).toBe(true);
  });

  it('un ticket es de un solo uso: dos consumos concurrentes, uno gana', async () => {
    const usuario = await crearUsuario();
    const ticket = await repo.crear(usuario, 'SELECCIONAR');
    const resultados = await Promise.all([
      repo.consumir(ticket, usuario),
      repo.consumir(ticket, usuario),
    ]);
    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it('dos verificar concurrentes del mismo desafio: solo uno obtiene ticket', async () => {
    const usuario = await crearUsuario();
    const desafio = await repo.crear(usuario, 'VERIFICAR');
    const tickets = await Promise.all([
      repo.verificar(desafio, 'VERIFICAR', usuario),
      repo.verificar(desafio, 'VERIFICAR', usuario),
    ]);
    expect(tickets.filter((t) => t !== null)).toHaveLength(1);
  });

  it('un desafio sin verificar no se consume (no es ticket)', async () => {
    const usuario = await crearUsuario();
    const desafio = await repo.crear(usuario, 'ENROLAR');
    expect(await repo.consumir(desafio, usuario)).toBe(false);
  });

  it('el desafio vencido no sirve y el ticket vence 5 min despues de verificar', async () => {
    const usuario = await crearUsuario();
    const vencido = await repo.crear(usuario, 'VERIFICAR');
    const otro = await repo.crear(usuario, 'VERIFICAR');
    const ticket = (await repo.verificar(otro, 'VERIFICAR', usuario)) as string;
    ahora = new Date(ahora.getTime() + TICKET_DURACION_MS + 1);
    expect(await repo.buscarSinVerificar(vencido, 'VERIFICAR')).toBeNull();
    expect(await repo.verificar(vencido, 'VERIFICAR', usuario)).toBeNull();
    expect(await repo.consumir(ticket, usuario)).toBe(false);
  });

  it('el desafio de otro usuario o de otro proposito no sirve', async () => {
    const [a, b] = [await crearUsuario(), await crearUsuario()];
    const desafio = await repo.crear(a, 'VERIFICAR');
    expect(await repo.verificar(desafio, 'VERIFICAR', b)).toBeNull();
    expect(await repo.verificar(desafio, 'ENROLAR', a)).toBeNull();
    expect(await repo.buscarSinVerificar(desafio, 'ENROLAR')).toBeNull();
    expect(await repo.buscarSinVerificar(desafio, 'VERIFICAR')).toEqual({ usuarioId: a });
    const ticket = (await repo.verificar(desafio, 'VERIFICAR', a)) as string;
    expect(await repo.consumir(ticket, b)).toBe(false);
  });

  it('un token desconocido no sirve', async () => {
    const usuario = await crearUsuario();
    expect(await repo.buscarSinVerificar('x'.repeat(64), 'VERIFICAR')).toBeNull();
    expect(await repo.verificar('x'.repeat(64), 'VERIFICAR', usuario)).toBeNull();
  });
});
