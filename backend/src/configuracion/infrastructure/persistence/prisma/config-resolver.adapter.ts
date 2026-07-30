/**
 * PrismaConfigResolver — implementación del puerto IConfigResolver.
 *
 * Resuelve `SmtpConfig` con merge por campo tenant→global (Dz4): por cada
 * campo requerido, el valor del tenant gana; si falta, cae al valor global;
 * si falta en ambos, `SmtpConfig.create()` devuelve `ConfigIncompletaError`.
 *
 * Aislamiento cross-DB (Requirement 9): el `dbName` del tenant se resuelve
 * SIEMPRE desde `master.clientes` por `clienteId` — NUNCA depende de
 * `TenantContext` (mismo patrón que `SolicitanteEmailResolver`/
 * `UsuarioMasterChecker`: este resolver puede correr fuera del ciclo
 * request/response, ej. desde un listener async de `notificar-cambio-estado`).
 * Solo se consulta `getTenantClient(dbName de ese clienteId)` — nunca otra DB.
 *
 * Descifrado (Requirement 2): toda fila con `esSecreto=true` (ej. `pass`) se
 * descifra vía `ISecretCipher.decrypt()`. Un fallo de descifrado (clave
 * inválida, tampering) se propaga tal cual como `Result.fail(CifradoError)`
 * — el resolver NUNCA lanza.
 *
 * Ref design: §3.1 (flujo de resolución), §5, Dz4. Ref spec: Requirement 1,
 * Requirement 2, Requirement 9. Tarea: 2.11 (PR2).
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { Result } from '../../../../shared/domain/result';
import { ISecretCipher, SECRET_CIPHER } from '../../../../shared/domain/ports/i-secret-cipher';
import {
  SmtpConfig,
  SmtpConfigProps,
  SMTP_CONFIG_CAMPOS_REQUERIDOS,
} from '../../../../shared/domain/value-objects/smtp-config.vo';
import { IConfigResolver } from '../../../domain/ports/i-config-resolver';
import {
  ConfigIncompletaError,
  NoConfigError,
  ResolveConfigError,
} from '../../../domain/errors/config.errors';

const CATEGORIA_SMTP = 'smtp';

type ConfigRow = {
  clave: string;
  valor: string;
  esSecreto: boolean;
  iv: string | null;
  authTag: string | null;
};

@Injectable()
export class PrismaConfigResolver implements IConfigResolver {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(SECRET_CIPHER) private readonly secretCipher: ISecretCipher,
  ) {}

  private get masterClient() {
    return this.prismaService.getMasterClient();
  }

  async resolveSmtp(clienteId: string): Promise<Result<SmtpConfig, ResolveConfigError>> {
    const tenantRows = await this.findTenantRows(clienteId);
    const globalRows = await this.findGlobalRows();

    if (tenantRows.length === 0 && globalRows.length === 0) {
      return Result.fail(
        new NoConfigError(
          `No hay configuración "${CATEGORIA_SMTP}" para el tenant "${clienteId}" ni global.`,
        ),
      );
    }

    const tenantByClave = this.toMap(tenantRows);
    const globalByClave = this.toMap(globalRows);

    const raw: Partial<Record<keyof SmtpConfigProps, unknown>> = {};

    for (const campo of SMTP_CONFIG_CAMPOS_REQUERIDOS) {
      const fila = tenantByClave.get(campo) ?? globalByClave.get(campo);
      if (!fila) continue;

      if (!fila.esSecreto) {
        raw[campo] = fila.valor;
        continue;
      }

      if (!fila.iv || !fila.authTag) {
        return Result.fail(
          new ConfigIncompletaError(
            `Config "${campo}" marcada esSecreto sin iv/authTag — fila corrupta.`,
          ),
        );
      }

      const descifrado = this.secretCipher.decrypt({
        valor: fila.valor,
        iv: fila.iv,
        authTag: fila.authTag,
      });
      if (descifrado.isFail()) {
        return Result.fail(descifrado.getError());
      }
      raw[campo] = descifrado.getValue();
    }

    const smtpConfigResult = SmtpConfig.create(raw);
    if (smtpConfigResult.isFail()) {
      return Result.fail(smtpConfigResult.getError());
    }

    return Result.ok(smtpConfigResult.getValue());
  }

  /**
   * Resuelve el `dbName` del tenant desde `master.clientes` por `clienteId`
   * y consulta SOLO esa DB. Si el cliente no existe/está inactivo, no hay
   * fila de tenant que consultar — se degrada a solo-global (spec R1
   * escenario 2/3 siguen cubiertos: cae a global o a `NO_CONFIG`).
   */
  private async findTenantRows(clienteId: string): Promise<ConfigRow[]> {
    const cliente = await this.masterClient.cliente.findFirst({
      where: { id: clienteId, activo: true, deletedAt: null },
      select: { dbName: true },
    });
    if (!cliente) return [];

    const tenantClient = this.prismaService.getTenantClient(cliente.dbName);
    return tenantClient.configuracionRuntime.findMany({
      where: { categoria: CATEGORIA_SMTP, deletedAt: null },
      select: { clave: true, valor: true, esSecreto: true, iv: true, authTag: true },
    });
  }

  private async findGlobalRows(): Promise<ConfigRow[]> {
    return this.masterClient.configuracionRuntime.findMany({
      where: { categoria: CATEGORIA_SMTP, deletedAt: null },
      select: { clave: true, valor: true, esSecreto: true, iv: true, authTag: true },
    });
  }

  private toMap(rows: ConfigRow[]): Map<string, ConfigRow> {
    return new Map(rows.map((row) => [row.clave, row]));
  }
}
