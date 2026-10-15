/**
 * Fail-open de `PostgresThrottlerStorage` (CA3) y purga que falla sin frenar el pedido (CA4), sin
 * base: el cliente master es un doble que rechaza. Decision del dueno (2026-10-15): con la base
 * caida el limitador deja pasar y lo deja en el log.
 */
import type { PrismaService } from '../persistence/prisma.service';
import { PostgresThrottlerStorage, REGISTRO_SIN_LIMITE } from './postgres-throttler-storage';

const KEY = 'a3f1c9e0d2b4clave-secreta-en-claro';

function armar(cliente: { $queryRaw: unknown; $executeRaw: unknown }) {
  const logger = { log: vi.fn(), error: vi.fn() };
  const prisma = { getMasterClient: () => cliente } as unknown as PrismaService;
  return { storage: new PostgresThrottlerStorage(prisma, logger), logger };
}

describe('PostgresThrottlerStorage sin base', () => {
  it('CA3: si el increment falla deja pasar (cuenta 0, sin bloqueo) y loguea sin la key en claro', async () => {
    const { storage, logger } = armar({
      $queryRaw: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
      $executeRaw: vi.fn().mockResolvedValue(0),
    });

    const registro = await storage.increment(KEY, 60_000, 10, 60_000, 'default');

    expect(registro).toEqual(REGISTRO_SIN_LIMITE);
    expect(registro.isBlocked).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const mensaje: string = logger.error.mock.calls[0][0];
    expect(mensaje).toMatch(/^THROTTLER_ERROR \| throttler=default \| clave=[0-9a-f]{12} \| /);
    expect(mensaje).toContain('ECONNREFUSED');
    expect(mensaje).not.toContain(KEY);
  });

  it('CA4: si la purga falla, el pedido se cuenta igual y la purga se reintenta en la llamada siguiente', async () => {
    const fila = { hits: 1, expira_ms: Date.now() + 60_000, bloqueado: false, bloqueo_ms: 0 };
    const executeRaw = vi.fn().mockRejectedValue(new Error('purga caida'));
    const { storage, logger } = armar({
      $queryRaw: vi.fn().mockResolvedValue([fila]),
      $executeRaw: executeRaw,
    });

    const registro = await storage.increment(KEY, 60_000, 10, 60_000, 'default');
    await storage.increment(KEY, 60_000, 10, 60_000, 'default');

    expect(registro.totalHits).toBe(1);
    expect(registro.isBlocked).toBe(false);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/^THROTTLER_ERROR \| purga fallida/),
    );
  });

  it('CA4: una purga exitosa no se repite hasta pasada una hora', async () => {
    let reloj = Date.now();
    const executeRaw = vi.fn().mockResolvedValue(0);
    const cliente = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { hits: 1, expira_ms: reloj + 60_000, bloqueado: false, bloqueo_ms: 0 },
        ]),
      $executeRaw: executeRaw,
    };
    const prisma = { getMasterClient: () => cliente } as unknown as PrismaService;
    const storage = new PostgresThrottlerStorage(
      prisma,
      { log: vi.fn(), error: vi.fn() },
      () => reloj,
    );

    await storage.increment(KEY, 60_000, 10, 60_000, 'default');
    reloj += 60 * 60 * 1000 - 1;
    await storage.increment(KEY, 60_000, 10, 60_000, 'default');
    expect(executeRaw).toHaveBeenCalledTimes(1);
    reloj += 1;
    await storage.increment(KEY, 60_000, 10, 60_000, 'default');
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
});
