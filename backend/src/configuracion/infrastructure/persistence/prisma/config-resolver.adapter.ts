/**
 * PrismaConfigResolver — implementación del puerto IConfigResolver.
 *
 * Resuelve `SmtpConfig` con merge por campo tenant→global (Dz4): por cada
 * campo requerido, el valor del tenant gana; si falta (fila ausente O fila
 * presente con `valor` vacío/blanco para un campo no-secreto — Judgment Day
 * PR2 Ronda 1, issue 2), cae al valor global; si falta en ambos,
 * `SmtpConfig.create()` devuelve `ConfigIncompletaError`.
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
 * Infraestructura (Judgment Day PR2 Ronda 1, issue 1): TODAS las llamadas a
 * Prisma (master + tenant) están envueltas en try/catch — un `clienteId`
 * malformado (`PrismaClientValidationError`), timeout o conexión caída se
 * mapean a `Result.fail(InfraConfigError)`, NUNCA se deja rechazar la
 * promesa fuera de `resolveSmtp()` (mismo patrón que
 * `SolicitanteEmailResolver`, precedente cross-DB sin boundary HTTP).
 *
 * Ref design: §3.1 (flujo de resolución), §5, Dz4. Ref spec: Requirement 1,
 * Requirement 2, Requirement 9. Tarea: 2.11 (PR2). Judgment Day PR2 Ronda 1.
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
  ConfigFilaCorruptaError,
  InfraConfigError,
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
    const [tenantRowsResult, globalRowsResult] = await Promise.all([
      this.findTenantRows(clienteId),
      this.findGlobalRows(),
    ]);

    if (tenantRowsResult.isFail()) {
      return Result.fail(tenantRowsResult.getError());
    }
    if (globalRowsResult.isFail()) {
      return Result.fail(globalRowsResult.getError());
    }

    const tenantRows = tenantRowsResult.getValue();
    const globalRows = globalRowsResult.getValue();

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
      const fila = this.resolverFilaParaCampo(campo, tenantByClave, globalByClave);
      if (!fila) continue;

      if (!fila.esSecreto) {
        raw[campo] = fila.valor;
        continue;
      }

      if (!fila.iv || !fila.authTag) {
        return Result.fail(
          new ConfigFilaCorruptaError(
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
   * Elige, para un campo dado, la fila del TENANT si esa fila CUBRE el
   * campo; si no, cae a la fila GLOBAL (o `undefined` si ninguna cubre).
   *
   * "Cubrir" para una fila no-secreta significa tener un `valor` no
   * vacío/no-whitespace — el fallback tenant→global es sobre el VALOR, no
   * sobre la mera existencia de la fila (design §3.1). Una fila de tenant
   * con `valor=''`/`'   '` para un campo no-secreto se trata como "campo NO
   * cubierto" y cae a la global. Para filas secretas el `valor` es
   * ciphertext (nunca vacío por contrato de `ISecretCipher.encrypt()`) — no
   * se aplica la regla de "vacío" ahí, la corrupción de esas filas se
   * detecta más abajo vía `iv`/`authTag`. Judgment Day PR2 Ronda 1, issue 2.
   */
  private resolverFilaParaCampo(
    campo: keyof SmtpConfigProps,
    tenantByClave: Map<string, ConfigRow>,
    globalByClave: Map<string, ConfigRow>,
  ): ConfigRow | undefined {
    const filaTenant = tenantByClave.get(campo);
    const tenantCubreElCampo =
      filaTenant !== undefined && (filaTenant.esSecreto || filaTenant.valor.trim().length > 0);
    return tenantCubreElCampo ? filaTenant : globalByClave.get(campo);
  }

  /**
   * Resuelve el `dbName` del tenant desde `master.clientes` por `clienteId`
   * y consulta SOLO esa DB. Si el cliente no existe/está inactivo, no hay
   * fila de tenant que consultar — se degrada a solo-global (spec R1
   * escenario 2/3 siguen cubiertos: cae a global o a `NO_CONFIG`).
   *
   * Ambas consultas Prisma (master + tenant) están en try/catch propio: un
   * `clienteId` no-UUID hace que `findFirst` LANCE
   * `PrismaClientValidationError` — sin este catch, el reject se propagaría
   * fuera de `resolveSmtp()` (Judgment Day PR2 Ronda 1, issue 1).
   */
  private async findTenantRows(clienteId: string): Promise<Result<ConfigRow[], InfraConfigError>> {
    let cliente: { dbName: string } | null;
    try {
      cliente = await this.masterClient.cliente.findFirst({
        where: { id: clienteId, activo: true, deletedAt: null },
        select: { dbName: true },
      });
    } catch {
      // No se interpola el error crudo del driver — puede contener detalles
      // de conexión sensibles (mismo criterio que SolicitanteEmailResolver).
      return Result.fail(
        new InfraConfigError(`No se pudo resolver el cliente "${clienteId}" en master.clientes.`),
      );
    }

    if (!cliente) return Result.ok([]);

    try {
      const tenantClient = this.prismaService.getTenantClient(cliente.dbName);
      const rows = await tenantClient.configuracionRuntime.findMany({
        where: { categoria: CATEGORIA_SMTP, deletedAt: null },
        select: { clave: true, valor: true, esSecreto: true, iv: true, authTag: true },
      });
      return Result.ok(rows);
    } catch {
      return Result.fail(
        new InfraConfigError(`No se pudo consultar la configuración del tenant "${clienteId}".`),
      );
    }
  }

  private async findGlobalRows(): Promise<Result<ConfigRow[], InfraConfigError>> {
    try {
      const rows = await this.masterClient.configuracionRuntime.findMany({
        where: { categoria: CATEGORIA_SMTP, deletedAt: null },
        select: { clave: true, valor: true, esSecreto: true, iv: true, authTag: true },
      });
      return Result.ok(rows);
    } catch {
      return Result.fail(
        new InfraConfigError(
          `No se pudo consultar la configuración global "${CATEGORIA_SMTP}" en master.`,
        ),
      );
    }
  }

  private toMap(rows: ConfigRow[]): Map<string, ConfigRow> {
    return new Map(rows.map((row) => [row.clave, row]));
  }
}
