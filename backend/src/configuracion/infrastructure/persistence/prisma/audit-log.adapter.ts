/**
 * PrismaAuditLog — implementación del puerto `AuditLogPort`.
 *
 * Elige la DB por `scope` (R5 "scope dual" — nunca cruzado):
 * `scope.kind==='tenant'` → `getTenantClient(scope.dbName).auditEntry.create`;
 * `scope.kind==='global'` → `getMasterClient().auditEntry.create`.
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
 * Infra (mismo criterio que `PrismaConfigResolver`): la llamada a Prisma
 * está en try/catch — un fallo de conexión/timeout se mapea a
 * `Result.fail(AuditError)`, NUNCA se deja rechazar la promesa fuera de
 * `record()` (el llamador, `AuditConfiguracionHandler`, documenta "NUNCA
 * lanza").
 *
 * Ref design: §5, §8. Ref spec: Requirement 5. Tarea: 3.11/3.12 (PR3).
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

    try {
      if (scope.kind === 'tenant') {
        await this.prismaService.getTenantClient(scope.dbName).auditEntry.create({ data });
      } else {
        await this.prismaService.getMasterClient().auditEntry.create({ data });
      }
      return Result.ok(undefined);
    } catch {
      // No se interpola el error crudo del driver (puede contener detalles
      // de conexión sensibles) — mismo criterio que InfraConfigError.
      return Result.fail(
        new AuditError(
          `No se pudo persistir el AuditEntry de "${entry.props.categoria}.${entry.props.clave}" ` +
            `(scope ${scope.kind}).`,
        ),
      );
    }
  }
}
