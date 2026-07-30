/**
 * PrismaAuditLog — implementación del puerto `AuditLogPort`.
 *
 * Elige la DB por `scope` (R5 "scope dual" — nunca cruzado):
 * `scope.kind==='tenant'` → resuelve `dbName` desde `master.clientes` por
 * `scope.clienteId` y persiste vía `getTenantClient(dbName).auditEntry.create`;
 * `scope.kind==='global'` → `getMasterClient().auditEntry.create`.
 *
 * Aislamiento cross-DB (Judgment Day PR3 Ronda 1, issue 3 — real confirmado
 * A+B, mismo patrón R9 que `PrismaConfigResolver`): el `dbName` NUNCA viaja
 * crudo en el `ConfigScope` — este adapter lo re-resuelve SIEMPRE desde
 * `master.clientes` por `clienteId` (`activo=true`, `deletedAt=null`), igual
 * que `PrismaConfigResolver.findTenantRows()`. Un `clienteId`
 * inválido/inexistente/inactivo NUNCA cae a otra DB — se mapea a
 * `Result.fail(AuditError)` antes de tocar `getTenantClient()`.
 *
 * REQUISITO DURO (STATE.md "Judgment Day — PR1 — fixes Ronda 2" fix #6): el
 * adapter persiste `entry.props` TAL CUAL — nunca descifra, nunca enmascara
 * ni transforma nada. La garantía de que `valorAnterior`/`valorNuevo` NUNCA
 * contienen el plaintext de un secreto vive AGUAS ARRIBA (write use case
 * PR4 + `AuditConfiguracionHandler`, vía `maskIfSecret()`). `audit_entries`
 * NO tiene columnas `iv`/`auth_tag` a propósito (Dz7 design §4.2): si algo
 * en una capa superior rompiera el masking, este adapter NO tiene forma de
 * detectarlo ni de "arreglarlo" — por eso el contrato es de arriba hacia
 * abajo, no acá.
 *
 * Infra (mismo criterio que `PrismaConfigResolver`): TODA llamada a Prisma
 * (resolución de `clienteId` en master + `auditEntry.create`) está en
 * try/catch propio — un fallo de conexión/timeout/`clienteId` malformado
 * (`PrismaClientValidationError`) se mapea a `Result.fail(AuditError)`,
 * NUNCA se deja rechazar la promesa fuera de `record()` (el llamador,
 * `AuditConfiguracionHandler`, documenta "NUNCA lanza").
 *
 * Ref design: §5, §8. Ref spec: Requirement 5, Requirement 9. Tarea:
 * 3.11/3.12 (PR3). Judgment Day PR3 Ronda 1, issue 3.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { Result } from '../../../../shared/domain/result';
import { AuditEntry } from '../../../domain/entities/audit-entry.entity';
import { ConfigScope } from '../../../domain/events/configuracion-cambiada.event';
import { AuditError, AuditLogPort } from '../../../domain/ports/i-audit-log.port';

@Injectable()
export class PrismaAuditLog implements AuditLogPort {
  constructor(private readonly prismaService: PrismaService) {}

  private get masterClient() {
    return this.prismaService.getMasterClient();
  }

  async record(entry: AuditEntry, scope: ConfigScope): Promise<Result<void, AuditError>> {
    const data = {
      id: entry.id,
      actorId: entry.props.actorId,
      accion: entry.props.accion,
      categoria: entry.props.categoria,
      clave: entry.props.clave,
      valorAnterior: entry.props.valorAnterior,
      valorNuevo: entry.props.valorNuevo,
      esSecreto: entry.props.esSecreto,
      createdAt: entry.createdAt,
    };

    if (scope.kind === 'tenant') {
      const dbNameResult = await this.resolveTenantDbName(scope.clienteId);
      if (dbNameResult.isFail()) {
        return Result.fail(dbNameResult.getError());
      }

      try {
        const tenantClient = this.prismaService.getTenantClient(dbNameResult.getValue());
        await tenantClient.auditEntry.create({ data });
        return Result.ok(undefined);
      } catch {
        return Result.fail(this.buildAuditError(entry, scope));
      }
    }

    try {
      await this.masterClient.auditEntry.create({ data });
      return Result.ok(undefined);
    } catch {
      return Result.fail(this.buildAuditError(entry, scope));
    }
  }

  /**
   * Resuelve el `dbName` real del tenant desde `master.clientes` por
   * `clienteId` — mismo patrón que `PrismaConfigResolver.findTenantRows()`
   * (R9). NUNCA confía en un `dbName` provisto por el caller. Un
   * `clienteId` no-UUID hace que `findFirst` LANCE
   * `PrismaClientValidationError` — capturado acá para no violar el
   * contrato "NUNCA lanza" de `record()`.
   */
  private async resolveTenantDbName(clienteId: string): Promise<Result<string, AuditError>> {
    let cliente: { dbName: string } | null;
    try {
      cliente = await this.masterClient.cliente.findFirst({
        where: { id: clienteId, activo: true, deletedAt: null },
        select: { dbName: true },
      });
    } catch {
      // No se interpola el error crudo del driver — mismo criterio que
      // InfraConfigError/PrismaConfigResolver.
      return Result.fail(
        new AuditError(`No se pudo resolver el cliente "${clienteId}" en master.clientes.`),
      );
    }

    if (!cliente) {
      return Result.fail(
        new AuditError(
          `Cliente "${clienteId}" inexistente o inactivo — no se puede auditar en su DB.`,
        ),
      );
    }

    return Result.ok(cliente.dbName);
  }

  private buildAuditError(entry: AuditEntry, scope: ConfigScope): AuditError {
    // No se interpola el error crudo del driver (puede contener detalles de
    // conexión sensibles) — mismo criterio que InfraConfigError.
    return new AuditError(
      `No se pudo persistir el AuditEntry de "${entry.props.categoria}.${entry.props.clave}" ` +
        `(scope ${scope.kind}).`,
    );
  }
}
