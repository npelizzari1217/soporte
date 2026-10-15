import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { SharedModule } from '../shared/shared.module';
import { PostgresThrottlerStorage } from '../shared/infrastructure/throttler/postgres-throttler-storage';
import { FormularioPublicoModule } from './formulario-publico.module';
import { PedidoPublicoThrottlerGuard } from './infrastructure/guards/pedido-publico-throttler.guard';

/**
 * Los cuatro throttlers del formulario publico cuentan en Postgres
 * (odd/tasks/throttler-postgres.md, CA5). Compilacion real con `SharedModule`, como
 * `recuperacion-password.module.spec.ts`; los 429 los prueban los e2e de `pedido-publico-*`.
 */
describe('FormularioPublicoModule — throttler', () => {
  it('el guard usa el storage de Postgres', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, FormularioPublicoModule],
    }).compile();

    const storage = moduleRef.get(ThrottlerStorage);
    expect(storage).toBeInstanceOf(PostgresThrottlerStorage);
    const guard = moduleRef.get(PedidoPublicoThrottlerGuard);
    // `storageService` es `protected` en `ThrottlerGuard`: es el que usa el guard al limitar.
    expect((guard as unknown as { storageService: unknown }).storageService).toBe(storage);

    await moduleRef.close();
  });
});
