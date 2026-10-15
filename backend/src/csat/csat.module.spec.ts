import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, getOptionsToken } from '@nestjs/throttler';
import { SharedModule } from '../shared/shared.module';
import { PostgresThrottlerStorage } from '../shared/infrastructure/throttler/postgres-throttler-storage';
import { CsatModule } from './csat.module';
import { CsatThrottlerGuard } from './infrastructure/guards/csat-throttler.guard';
import {
  CSAT_THROTTLE_LIMIT,
  CSAT_THROTTLE_TTL_MS,
} from './infrastructure/guards/csat-throttler.guard';

/**
 * El limitador de CSAT cuenta en Postgres (odd/tasks/throttler-postgres.md, CA5) y conserva su
 * limite. Compilacion real con `SharedModule` (`PrismaService` no se conecta al construirse), como
 * `recuperacion-password.module.spec.ts`. El 429 lo prueba `csat.e2e.spec.ts`.
 */
describe('CsatModule — throttler', () => {
  it('el guard usa el storage de Postgres y las mismas opciones de siempre', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, CsatModule],
    }).compile();

    const storage = moduleRef.get(ThrottlerStorage);
    expect(storage).toBeInstanceOf(PostgresThrottlerStorage);
    expect(moduleRef.get(getOptionsToken())).toMatchObject({
      throttlers: [{ limit: CSAT_THROTTLE_LIMIT, ttl: CSAT_THROTTLE_TTL_MS }],
    });
    const guard = await moduleRef.resolve(CsatThrottlerGuard);
    // `storageService` es `protected` en `ThrottlerGuard`: es el que usa el guard al limitar.
    expect((guard as unknown as { storageService: unknown }).storageService).toBe(storage);

    await moduleRef.close();
  });
});
