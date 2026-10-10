import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { ApiClaveGuard } from './infrastructure/api-clave.guard';
import {
  API_V1_VENTANA_MS,
  ApiV1ThrottlerGuard,
  limiteApiV1,
} from './infrastructure/api-v1-throttler.guard';
import { IntegracionesModule } from './integraciones.module';

/**
 * ApiV1Module — host de los controllers de la API publica `v1` (sdd/api-publica, T4).
 *
 * Provee los guards de clave y de limite por clave. Los controllers `v1` (T5) se declaran aca y
 * usan `@ApiV1()`. El limite se lee al compilar el modulo (`API_V1_RATE_LIMIT`, 60 por defecto),
 * con storage propio en memoria, independiente del de CSAT.
 */
@Module({
  imports: [
    AuthModule,
    IntegracionesModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => [{ limit: limiteApiV1(), ttl: API_V1_VENTANA_MS }],
    }),
  ],
  providers: [ApiClaveGuard, ApiV1ThrottlerGuard],
  exports: [ApiClaveGuard, ApiV1ThrottlerGuard, ThrottlerModule, IntegracionesModule],
})
export class ApiV1Module {}
