/**
 * PrismaConfiguracionRepository — implementación del puerto
 * `IConfiguracionRepository` (CRUD genérico de `ConfiguracionRuntime`).
 *
 * Scope dual (mismo criterio R9 que `PrismaConfigResolver`/`PrismaAuditLog`):
 * `scope.kind==='tenant'` re-resuelve el `dbName` real desde
 * `master.clientes` por `clienteId` (`activo=true`, `deletedAt=null`) y
 * persiste vía `getTenantClient(dbName)`; `'global'` ⇒ `getMasterClient()`.
 * NUNCA confía en un `dbName` crudo — no existe tal campo en `ConfigScope`.
 *
 * `scope.kind` se resuelve con un `switch` EXHAUSTIVO (`'tenant'`/`'global'`)
 * con una rama `default` que RECHAZA — arreglo 2, Judgment Day PR4 Ronda 1,
 * hallazgo Juez A: antes de esta ronda, cada método usaba
 * `if (kind==='tenant') {...} else {...global/master...}`, así que
 * CUALQUIER `kind` distinto de `'tenant'` (malformado, tampereado, o un
 * valor futuro no contemplado) caía en la rama `else` y operaba sobre
 * MASTER/GLOBAL por default — fail-OPEN, el peor comportamiento posible
 * para un dato multi-tenant. El `switch`/`default` es defensa en
 * profundidad: los use cases (`LeerConfigUseCase`/`ActualizarConfigUseCase`)
 * YA validan `scope.kind` antes de llegar acá (`esScopeKindValido()`), pero
 * este adapter NUNCA debe confiar en que todo caller pase por esa validación.
 *
 * `upsert()` NO usa `.upsert()` nativo de Prisma: la unicidad `(categoria,
 * clave)` es un PARTIAL unique index (`WHERE deleted_at IS NULL`, Dz9, raw
 * SQL en la migración) — Prisma no lo expresa como `@@unique`, así que no
 * hay `where` unique disponible para `.upsert()`. Resuelve existencia vía
 * `findFirst` (NUNCA `findUnique`, Dz9) y decide `create`/`update`.
 *
 * TOCTOU (arreglo 4, Judgment Day PR4 Ronda 1, confirmado A+B): la ventana
 * entre `findFirst` y `create`/`update` no es atómica — una escritura
 * concurrente para la misma `(categoria, clave)` del mismo scope puede
 * ganar la carrera y violar el partial unique index. Prisma reporta esa
 * violación como `P2002` — se mapea a `ConfigConflictoConcurrenteError`
 * (distinguible por `code` de un `InfraConfigError` genérico), en vez de
 * mezclarse con timeouts/conexión caída.
 *
 * Infra (mismo criterio que `PrismaConfigResolver`/`PrismaAuditLog`): TODA
 * llamada a Prisma está en try/catch propio — un `clienteId` malformado
 * (`PrismaClientValidationError`), timeout o conexión caída se mapea a
 * `Result.fail(InfraConfigError)`, NUNCA se deja rechazar la promesa fuera
 * de los métodos públicos.
 *
 * Ref design: §5, §12, Dz9. Ref spec: §0, Requirement 9. Tarea: 4.10 (PR4).
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1", arreglos 2 y 4.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { Result } from '../../../../shared/domain/result';
import { ConfigScope } from '../../../domain/events/configuracion-cambiada.event';
import {
  ConfigConflictoConcurrenteError,
  InfraConfigError,
} from '../../../domain/errors/config.errors';
import {
  ConfiguracionRow,
  IConfiguracionRepository,
  UpsertConfiguracionInput,
} from '../../../domain/ports/i-configuracion-repository';

type PersistedRow = {
  id: string;
  categoria: string;
  clave: string;
  valor: string;
  tipo: string;
  esSecreto: boolean;
  iv: string | null;
  authTag: string | null;
  actualizadoPor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Detecta el error `P2002` de Prisma (unique constraint violation) sin
 * importar tipos de `@prisma/client` — duck-typing sobre `code`, mismo
 * patrón que `isPrismaUniqueConstraintError` en
 * `equipos/application/use-cases/crear-equipo.use-case.ts`.
 */
function isPrismaUniqueConstraintError(err: unknown): err is { code: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

@Injectable()
export class PrismaConfiguracionRepository implements IConfiguracionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get masterClient() {
    return this.prismaService.getMasterClient();
  }

  async findAll(
    scope: ConfigScope,
    categoria?: string,
  ): Promise<Result<ConfiguracionRow[], InfraConfigError>> {
    const where = { deletedAt: null, ...(categoria ? { categoria } : {}) };

    switch (scope.kind) {
      case 'tenant': {
        const dbNameResult = await this.resolveTenantDbName(scope.clienteId);
        if (dbNameResult.isFail()) {
          return Result.fail(dbNameResult.getError());
        }
        try {
          const tenantClient = this.prismaService.getTenantClient(dbNameResult.getValue());
          const rows = await tenantClient.configuracionRuntime.findMany({ where });
          return Result.ok(rows.map((row) => this.toDomain(row)));
        } catch {
          return Result.fail(
            new InfraConfigError(`No se pudo listar la configuración del tenant (scope tenant).`),
          );
        }
      }
      case 'global': {
        try {
          const rows = await this.masterClient.configuracionRuntime.findMany({ where });
          return Result.ok(rows.map((row) => this.toDomain(row)));
        } catch {
          return Result.fail(new InfraConfigError(`No se pudo listar la configuración global.`));
        }
      }
      default:
        return Result.fail(this.buildInvalidScopeError(scope));
    }
  }

  async findByClave(
    scope: ConfigScope,
    categoria: string,
    clave: string,
  ): Promise<Result<ConfiguracionRow | null, InfraConfigError>> {
    const where = { categoria, clave, deletedAt: null };

    switch (scope.kind) {
      case 'tenant': {
        const dbNameResult = await this.resolveTenantDbName(scope.clienteId);
        if (dbNameResult.isFail()) {
          return Result.fail(dbNameResult.getError());
        }
        try {
          const tenantClient = this.prismaService.getTenantClient(dbNameResult.getValue());
          // findFirst NUNCA findUnique (Dz9) — la unicidad (categoria, clave)
          // es un partial unique index, no expresable como `@@unique` de Prisma.
          const row = await tenantClient.configuracionRuntime.findFirst({ where });
          return Result.ok(row ? this.toDomain(row) : null);
        } catch {
          return Result.fail(
            new InfraConfigError(
              `No se pudo buscar "${categoria}.${clave}" en la config del tenant.`,
            ),
          );
        }
      }
      case 'global': {
        try {
          const row = await this.masterClient.configuracionRuntime.findFirst({ where });
          return Result.ok(row ? this.toDomain(row) : null);
        } catch {
          return Result.fail(
            new InfraConfigError(`No se pudo buscar "${categoria}.${clave}" en la config global.`),
          );
        }
      }
      default:
        return Result.fail(this.buildInvalidScopeError(scope));
    }
  }

  async upsert(
    scope: ConfigScope,
    input: UpsertConfiguracionInput,
  ): Promise<Result<ConfiguracionRow, InfraConfigError | ConfigConflictoConcurrenteError>> {
    const data = {
      categoria: input.categoria,
      clave: input.clave,
      valor: input.valor,
      tipo: input.tipo,
      esSecreto: input.esSecreto,
      iv: input.iv,
      authTag: input.authTag,
      actualizadoPor: input.actualizadoPor,
    };
    const where = { categoria: input.categoria, clave: input.clave, deletedAt: null };

    switch (scope.kind) {
      case 'tenant': {
        const dbNameResult = await this.resolveTenantDbName(scope.clienteId);
        if (dbNameResult.isFail()) {
          return Result.fail(dbNameResult.getError());
        }
        try {
          const tenantClient = this.prismaService.getTenantClient(dbNameResult.getValue());
          const existing = await tenantClient.configuracionRuntime.findFirst({ where });
          const row = existing
            ? await tenantClient.configuracionRuntime.update({ where: { id: existing.id }, data })
            : await tenantClient.configuracionRuntime.create({ data });
          return Result.ok(this.toDomain(row));
        } catch (err) {
          if (isPrismaUniqueConstraintError(err)) {
            return Result.fail(new ConfigConflictoConcurrenteError(input.categoria, input.clave));
          }
          return Result.fail(
            new InfraConfigError(
              `No se pudo guardar "${input.categoria}.${input.clave}" en la config del tenant.`,
            ),
          );
        }
      }
      case 'global': {
        try {
          const existing = await this.masterClient.configuracionRuntime.findFirst({ where });
          const row = existing
            ? await this.masterClient.configuracionRuntime.update({
                where: { id: existing.id },
                data,
              })
            : await this.masterClient.configuracionRuntime.create({ data });
          return Result.ok(this.toDomain(row));
        } catch (err) {
          if (isPrismaUniqueConstraintError(err)) {
            return Result.fail(new ConfigConflictoConcurrenteError(input.categoria, input.clave));
          }
          return Result.fail(
            new InfraConfigError(
              `No se pudo guardar "${input.categoria}.${input.clave}" en la config global.`,
            ),
          );
        }
      }
      default:
        return Result.fail(this.buildInvalidScopeError(scope));
    }
  }

  /**
   * Resuelve el `dbName` real del tenant desde `master.clientes` por
   * `clienteId` — mismo patrón que `PrismaConfigResolver`/`PrismaAuditLog`
   * (R9). NUNCA confía en un `dbName` provisto por el caller. Un `clienteId`
   * no-UUID hace que `findFirst` LANCE `PrismaClientValidationError` —
   * capturado acá para no violar el contrato "NUNCA lanza".
   */
  private async resolveTenantDbName(clienteId: string): Promise<Result<string, InfraConfigError>> {
    let cliente: { dbName: string } | null;
    try {
      cliente = await this.masterClient.cliente.findFirst({
        where: { id: clienteId, activo: true, deletedAt: null },
        select: { dbName: true },
      });
    } catch {
      // No se interpola el error crudo del driver — mismo criterio que
      // InfraConfigError/PrismaConfigResolver/PrismaAuditLog.
      return Result.fail(
        new InfraConfigError(`No se pudo resolver el cliente "${clienteId}" en master.clientes.`),
      );
    }

    if (!cliente) {
      return Result.fail(
        new InfraConfigError(
          `Cliente "${clienteId}" inexistente o inactivo — no se puede operar sobre su config.`,
        ),
      );
    }

    return Result.ok(cliente.dbName);
  }

  /**
   * Rama `default` del `switch` exhaustivo de `scope.kind` (arreglo 2) — un
   * `kind` fuera de `'tenant'|'global'` se rechaza EXPLÍCITAMENTE, nunca cae
   * en master/global por ausencia de manejo. `scope` tiene tipo `never` acá
   * (TypeScript ya narrowed los 2 casos válidos arriba) — solo alcanzable si
   * un valor malformado cruza el boundary en runtime.
   */
  private buildInvalidScopeError(scope: never): InfraConfigError {
    const scopeRecibido: unknown = scope;
    return new InfraConfigError(
      `Scope de configuración inválido: ${JSON.stringify(scopeRecibido)} — rechazado, ` +
        'NUNCA se opera sobre master/global por default.',
    );
  }

  private toDomain(row: PersistedRow): ConfiguracionRow {
    return {
      id: row.id,
      categoria: row.categoria,
      clave: row.clave,
      valor: row.valor,
      tipo: row.tipo,
      esSecreto: row.esSecreto,
      iv: row.iv,
      authTag: row.authTag,
      actualizadoPor: row.actualizadoPor,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
