import { createHash, randomBytes } from 'node:crypto';
import { DomainError, Result } from '../../../shared/domain/result';
import type { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../../clientes/domain/errors/clientes.errors';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import {
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
  QrRequiereSlugError,
  QrSlugCambiadoError,
} from '../../domain/errors/equipos.errors';

export interface EmitirQrEquipoCommand {
  equipoId: string;
  /** Cliente de la sesión (`JWT.cliente_id`): el equipo se busca en SU tenant. */
  clienteId: string;
}

export interface QrEmitido {
  /** `${APP_BASE_URL}/c/<slug>/pedido?e=<token>`. El token solo existe en esta respuesta. */
  url: string;
  emitidoAt: Date;
}

/** Bytes de entropía del token: 128 bits (ADR-10). */
const BYTES_TOKEN = 16;

/** sha256 hex del token: lo único que se guarda (ADR-10) y lo que se busca al resolver. */
export function hashTokenQr(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * EmitirQrEquipoUseCase — emite o regenera el QR de un equipo (sdd/formulario-publico-qr, WU-4;
 * D8). Regenerar reemplaza el hash: el token anterior deja de resolver de inmediato.
 *
 * Orden (ADR-2): primero se congela el slug en master (CAS con el slug leído) y recién después
 * se escribe el hash en el tenant. Un slug congelado sin QR es inofensivo; un QR sin el slug
 * congelado es el defecto que hay que evitar. No exige que el formulario esté habilitado.
 *
 * El equipo se valida ANTES del CAS de master: un equipo inexistente es un 404 y no congela el
 * slug de un cliente sin que se emita nada.
 */
export class EmitirQrEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById' | 'guardarQrHash'>,
    private readonly clienteRepo: Pick<IClienteRepository, 'findById' | 'congelarSlug'>,
    /** `entorno.APP_BASE_URL`: `application/` no lee `process.env` y nunca se usa el header `Host`. */
    private readonly appBaseUrl: string,
  ) {}

  async execute(command: EmitirQrEquipoCommand): Promise<Result<QrEmitido, DomainError>> {
    const equipo = await this.equipoRepo.findById(command.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(command.equipoId));
    }
    if (!equipo.activo) {
      return Result.fail(new EquipoDadoDeBajaError(equipo.id));
    }

    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    }
    const slug = cliente.slug;
    if (slug === null) {
      return Result.fail(new QrRequiereSlugError());
    }

    if (!(await this.clienteRepo.congelarSlug(cliente.id, slug))) {
      return Result.fail(new QrSlugCambiadoError());
    }

    const token = randomBytes(BYTES_TOKEN).toString('base64url');
    const emitidoAt = new Date();
    if (!(await this.equipoRepo.guardarQrHash(equipo.id, hashTokenQr(token), emitidoAt))) {
      // El equipo se dio de baja o se borró entre la lectura y el CAS.
      return Result.fail(new EquipoDadoDeBajaError(equipo.id));
    }

    const base = this.appBaseUrl.replace(/\/+$/, '');
    return Result.ok({ url: `${base}/c/${slug}/pedido?e=${token}`, emitidoAt });
  }
}
