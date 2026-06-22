import { Global, Module } from '@nestjs/common';
import { FILE_STORAGE } from './domain/ports/i-file-storage';
import { LocalFileStorage } from './infrastructure/storage/local-file-storage';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import { TenantContext } from './tenancy/tenant-context';
import { MasterContext } from './tenancy/master-context';
import {
  TenantTransactionRunner,
  TENANT_TRANSACTION_RUNNER,
} from './infrastructure/persistence/tenant-transaction-runner';
import {
  MasterTransactionRunner,
  MASTER_TRANSACTION_RUNNER,
} from './infrastructure/persistence/master-transaction-runner';

/**
 * SharedModule — módulo global de infraestructura compartida.
 *
 * Provee y exporta los servicios transversales que necesitan todos los módulos:
 *   - PrismaService       → factory multi-tenant (master + Map de tenant clients)
 *   - TenantContext       → AsyncLocalStorage del tenant activo por request
 *   - TenantTransactionRunner → wrapper de $transaction con re-bind de TenantContext
 *   - FILE_STORAGE        → IFileStorage (LocalFileStorage en dev/test)
 *
 * Todos los providers usan tokens Symbol para respetar el principio de
 * inversión de dependencias: los consumidores dependen de la interfaz (token),
 * no de la implementación concreta.
 *
 * Tarea: 0.C.7
 */
@Global()
@Module({
  providers: [
    // PrismaService: factory multi-tenant inyectada con la URL master
    // desde la variable de entorno. En producción, DATABASE_URL_MASTER.
    {
      provide: PrismaService,
      useFactory: () => new PrismaService(process.env.DATABASE_URL_MASTER ?? ''),
    },

    // TenantContext: wrapper de AsyncLocalStorage. Singleton por proceso.
    TenantContext,

    // MasterContext: análogo a TenantContext pero para la DB master.
    // Almacena el cliente tx durante una transacción MasterTransactionRunner.
    MasterContext,

    // TenantTransactionRunner: implementación del puerto ITenantTransactionRunner.
    {
      provide: TENANT_TRANSACTION_RUNNER,
      useClass: TenantTransactionRunner,
    },

    // MasterTransactionRunner: implementación del puerto IMasterTransactionRunner.
    // Provee transacciones atómicas para tablas MASTER (usuarios, refresh_tokens).
    {
      provide: MASTER_TRANSACTION_RUNNER,
      useClass: MasterTransactionRunner,
    },

    // FILE_STORAGE: IFileStorage → LocalFileStorage (dev/test).
    // En producción, este binding se sobreescribe con S3FileStorage.
    {
      provide: FILE_STORAGE,
      useClass: LocalFileStorage,
    },
  ],
  exports: [
    // Exportar PrismaService para que los módulos de infraestructura
    // puedan inyectarlo en sus repositorios.
    PrismaService,

    // TenantContext exportado para TenantGuard y repos tenant.
    TenantContext,

    // MasterContext exportado para repos MASTER transaction-aware.
    MasterContext,

    // Token de transacción tenant.
    TENANT_TRANSACTION_RUNNER,

    // Token de transacción master.
    MASTER_TRANSACTION_RUNNER,

    // Token de storage: los casos de uso inyectan este token.
    FILE_STORAGE,
  ],
})
export class SharedModule {}
