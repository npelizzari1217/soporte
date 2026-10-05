import { DomainError, Result } from '../../../shared/domain/result';
import type { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../../clientes/domain/errors/clientes.errors';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import {
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
  QrRequiereSlugError,
} from '../../domain/errors/equipos.errors';

export interface ObtenerQrEquipoCommand {
  equipoId: string;
  /** Cliente de la sesión (`JWT.cliente_id`): el equipo se busca en SU tenant. */
  clienteId: string;
}

/**
 * Estado del QR de un equipo (issue #356):
 * - `VIGENTE`: hay token guardado; `url` y `emitidoAt` vienen completos.
 * - `SIN_EMITIR`: el equipo nunca tuvo QR.
 * - `REQUIERE_REGENERAR`: el QR se emitió antes de que el token se guardara en claro (hay hash,
 *   no hay token): el QR impreso sigue resolviendo, pero solo se puede volver a ver regenerándolo.
 */
export type QrEquipoLeido =
  | { estado: 'VIGENTE'; url: string; emitidoAt: Date }
  | { estado: 'SIN_EMITIR' }
  | { estado: 'REQUIERE_REGENERAR' };

/**
 * ObtenerQrEquipoUseCase — devuelve el QR vigente de un equipo para mostrarlo, descargarlo o
 * imprimirlo cuantas veces haga falta (issue #356). Solo lee: no congela el slug ni escribe.
 *
 * Un equipo dado de baja se rechaza igual que al emitir (EquipoDadoDeBajaError): su QR abre el
 * formulario sin equipo, así que mostrarlo no sirve.
 */
export class ObtenerQrEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findQrById'>,
    private readonly clienteRepo: Pick<IClienteRepository, 'findById'>,
    /** `entorno.APP_BASE_URL`: `application/` no lee `process.env` y nunca se usa el header `Host`. */
    private readonly appBaseUrl: string,
  ) {}

  async execute(command: ObtenerQrEquipoCommand): Promise<Result<QrEquipoLeido, DomainError>> {
    const qr = await this.equipoRepo.findQrById(command.equipoId);
    if (!qr) {
      return Result.fail(new EquipoNoEncontradoError(command.equipoId));
    }
    if (!qr.activo) {
      return Result.fail(new EquipoDadoDeBajaError(command.equipoId));
    }
    if (qr.qrToken === null || qr.qrEmitidoAt === null) {
      return Result.ok({ estado: qr.qrTokenHash === null ? 'SIN_EMITIR' : 'REQUIERE_REGENERAR' });
    }

    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    }
    // Con un QR emitido el slug quedó congelado: no puede ser null. Se valida igual por tipos.
    if (cliente.slug === null) {
      return Result.fail(new QrRequiereSlugError());
    }

    const base = this.appBaseUrl.replace(/\/+$/, '');
    return Result.ok({
      estado: 'VIGENTE',
      url: `${base}/c/${cliente.slug}/pedido?e=${qr.qrToken}`,
      emitidoAt: qr.qrEmitidoAt,
    });
  }
}
