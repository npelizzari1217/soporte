/**
 * [INTEGRATION] Token de verificacion del pedido publico (sdd/formulario-publico-qr, WU-11, tarea
 * 11.4) contra Postgres REAL (`soporte_master_test`): guardar y leer por hash, UNIQUE del hash,
 * FK a clientes, `marcarUsado` concurrente (gana una sola llamada) y `rollback.sql`.
 * Truncar `clientes` en la master de test COMPARTIDA exige el turno exclusivo.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';
import { PedidoPublicoTokenEntity } from '../../../domain/entities/pedido-publico-token.entity';
import { PrismaPedidoPublicoTokenRepository } from './prisma-pedido-publico-token.repository';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const CARPETA = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20261003160000_pedido_publico_tokens',
);

usarLockMasterTest();

describe('PrismaPedidoPublicoTokenRepository — Integration (WU-11)', () => {
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let repo: PrismaPedidoPublicoTokenRepository;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    master = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    repo = new PrismaPedidoPublicoTokenRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await master.$executeRawUnsafe(
      'TRUNCATE TABLE pedido_publico_tokens, clientes RESTART IDENTITY CASCADE',
    );
  });

  async function cliente(sufijo: string): Promise<ClienteEntity> {
    const c = ClienteEntity.create({
      nombre: `Cliente ${sufijo}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_pedido_pub_${sufijo}`,
      activo: true,
      csatHabilitado: false,
    });
    await clienteRepo.save(c);
    return c;
  }

  it('guarda un token y lo lee por su hash con vencimiento a 24 h', async () => {
    const c = await cliente('a');
    const token = PedidoPublicoTokenEntity.emitir({ clienteId: c.id, tokenHash: 'hash-a' });

    await repo.save(token);
    const leido = await repo.findByHash('hash-a');

    expect(leido).not.toBeNull();
    expect(leido!.id).toBe(token.id);
    expect(leido!.clienteId).toBe(c.id);
    expect(leido!.expiresAt.getTime()).toBe(token.expiresAt.getTime());
    expect(leido!.usedAt).toBeNull();
    expect(leido!.isVigente()).toBe(true);
  });

  it('un hash inexistente da null', async () => {
    expect(await repo.findByHash('no-existe')).toBeNull();
  });

  it('el hash es UNIQUE', async () => {
    const c = await cliente('b');
    await repo.save(PedidoPublicoTokenEntity.emitir({ clienteId: c.id, tokenHash: 'dup' }));
    await expect(
      repo.save(PedidoPublicoTokenEntity.emitir({ clienteId: c.id, tokenHash: 'dup' })),
    ).rejects.toThrow();
  });

  it('no admite un cliente inexistente (FK)', async () => {
    await expect(
      repo.save(
        PedidoPublicoTokenEntity.emitir({
          clienteId: '01977a00-0000-7000-8000-0000000000ff',
          tokenHash: 'huerfano',
        }),
      ),
    ).rejects.toThrow();
  });

  it('marcarUsado concurrente: gana exactamente una llamada y used_at queda marcado', async () => {
    const c = await cliente('c');
    const token = PedidoPublicoTokenEntity.emitir({ clienteId: c.id, tokenHash: 'hash-c' });
    await repo.save(token);

    const resultados = await Promise.all(
      Array.from({ length: 8 }, () => repo.marcarUsado(token.id)),
    );

    expect(resultados.filter(Boolean)).toHaveLength(1);
    const leido = await repo.findByHash('hash-c');
    expect(leido!.isUsed()).toBe(true);
    expect(leido!.isVigente()).toBe(false);
  });

  it('marcarUsado sobre un id inexistente da false', async () => {
    expect(await repo.marcarUsado('01977a00-0000-7000-8000-0000000000fe')).toBe(false);
  });

  it('rollback.sql elimina la tabla y migration.sql la vuelve a crear', async () => {
    const sentencias = (archivo: string): string[] =>
      fs
        .readFileSync(path.join(CARPETA, archivo), 'utf8')
        .split('\n')
        .filter((linea) => !linea.startsWith('--'))
        .join('\n')
        .split(';')
        .map((sentencia) => sentencia.trim())
        .filter(Boolean);
    const existe = async (): Promise<boolean> => {
      const rows = await master.$queryRawUnsafe<{ existe: boolean }[]>(
        `SELECT to_regclass('public.pedido_publico_tokens') IS NOT NULL AS existe`,
      );
      return rows[0].existe;
    };

    try {
      for (const sentencia of sentencias('rollback.sql')) await master.$executeRawUnsafe(sentencia);
      expect(await existe()).toBe(false);
    } finally {
      if (!(await existe())) {
        for (const sentencia of sentencias('migration.sql')) {
          await master.$executeRawUnsafe(sentencia);
        }
      }
    }
    expect(await existe()).toBe(true);
  });
});
