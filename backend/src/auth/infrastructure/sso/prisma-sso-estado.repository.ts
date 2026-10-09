import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  ConsumirSsoEstado,
  ISsoEstadoRepository,
  NuevoSsoEstado,
  SsoEstadoConsumido,
} from '../../domain/ports/sso-estado-repository.port';

const PURGA_CADA_MS = 60 * 60 * 1000;

/**
 * Estado de los flujos SSO sobre `sso_estados` (master, ADR-1). El consumo es UNA sentencia
 * (`UPDATE ... RETURNING`): el lock de fila serializa los concurrentes y a lo sumo uno gana.
 */
@Injectable()
export class PrismaSsoEstadoRepository implements ISsoEstadoRepository {
  private ultimaPurga = 0;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly ahora: () => number = Date.now,
  ) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async crear(estado: NuevoSsoEstado): Promise<void> {
    await this.purgarSiCorresponde();
    await this.client.ssoEstado.create({
      data: {
        stateHash: estado.stateHash,
        proveedor: estado.proveedor,
        nonce: estado.nonce,
        codeVerifier: estado.codeVerifier,
        navegadorHash: estado.navegadorHash,
        siguiente: estado.siguiente,
        expiraAt: estado.expiraAt,
      },
    });
  }

  async consumir(datos: ConsumirSsoEstado): Promise<SsoEstadoConsumido | null> {
    const filas = await this.client.$queryRaw<
      { nonce: string; code_verifier: string; siguiente: string | null }[]
    >`
      UPDATE sso_estados SET usado_at = now()
      WHERE state_hash = ${datos.stateHash} AND proveedor = ${datos.proveedor}
        AND navegador_hash = ${datos.navegadorHash}
        AND usado_at IS NULL AND expira_at > now()
      RETURNING nonce, code_verifier, siguiente`;
    if (filas.length === 0) return null;
    return {
      nonce: filas[0].nonce,
      codeVerifier: filas[0].code_verifier,
      siguiente: filas[0].siguiente,
    };
  }

  /** Como maximo una vez por hora por proceso; un fallo de limpieza no afecta al login. */
  private async purgarSiCorresponde(): Promise<void> {
    const ahora = this.ahora();
    if (ahora - this.ultimaPurga < PURGA_CADA_MS) return;
    this.ultimaPurga = ahora;
    try {
      await this.client
        .$executeRaw`DELETE FROM sso_estados WHERE expira_at < now() - interval '1 hour'`;
    } catch {
      this.ultimaPurga = 0;
    }
  }
}
