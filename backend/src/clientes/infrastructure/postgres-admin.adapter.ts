/**
 * PostgresAdminAdapter — adapter de infraestructura para IPostgresAdminPort.
 *
 * Delega todas las operaciones al PostgresAdminService existente (shared/infrastructure/).
 * Su única responsabilidad es conectar el puerto de aplicación (clientes/application/ports/)
 * con el servicio concreto en shared/infrastructure/, sin agregar lógica propia.
 *
 * Por qué un adapter y no usar el servicio directamente:
 *   - Screaming Architecture: la capa de aplicación depende del puerto (interfaz),
 *     no de la implementación concreta. El adapter cierra esa brecha.
 *   - Permite intercambiar la implementación (ej. test stubs) sin tocar el use case.
 *
 * Registro DI:
 *   - PostgresAdminService debe estar registrado en ClientesModule (o SharedModule).
 *   - Este adapter se registra con token POSTGRES_ADMIN (provide: POSTGRES_ADMIN).
 *
 * Ref spec: [SPEC:clientes/Provisioning de tenant nuevo, Rollback compensatorio]
 * Tarea: Batch 4 - Parte A
 */
import { Injectable } from '@nestjs/common';
import { PostgresAdminService } from '../../shared/infrastructure/persistence/postgres-admin.service';
import { IPostgresAdminPort } from '../application/ports/i-postgres-admin.port';

@Injectable()
export class PostgresAdminAdapter implements IPostgresAdminPort {
  constructor(private readonly service: PostgresAdminService) {}

  createDatabase(dbName: string): Promise<void> {
    return this.service.createDatabase(dbName);
  }

  dropDatabase(dbName: string): Promise<void> {
    return this.service.dropDatabase(dbName);
  }

  databaseExists(dbName: string): Promise<boolean> {
    return this.service.databaseExists(dbName);
  }
}
