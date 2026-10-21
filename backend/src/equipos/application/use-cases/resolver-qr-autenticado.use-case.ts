import { DomainError, Result } from '../../../shared/domain/result';
import type { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { QrDeOtraOrganizacionError } from '../../domain/errors/equipos.errors';
import { hashTokenQr } from './emitir-qr-equipo.use-case';
import type { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { TIPO_CODIGO_SOPORTE } from '../../../tickets/domain/tipos-ticket.constants';
import {
  AlcanceActorTicket,
  exigirAccionSobreTipo,
} from '../../../tickets/application/services/visibilidad-ticket';

export interface ResolverQrAutenticadoCommand {
  /** Cliente de la sesión (`JWT.cliente_id`): el tenant ya viene bindeado por `TenantGuard`. */
  clienteId: string;
  /** Slug del QR (`?c=`). */
  slug: unknown;
  /** Token del QR (`?e=`). */
  token: unknown;
  /** Permisos por tipo del actor: el escaneo es el primer paso del alta de un ticket SOPORTE. */
  alcance: AlcanceActorTicket;
}

export interface QrAutenticadoResult {
  readonly equipo: { readonly id: string; readonly nombre: string } | null;
}

/** Largo máximo aceptado para el token: el real mide 22 (mismo tope que el contexto público). */
const LARGO_MAX_TOKEN = 128;

/**
 * ResolverQrAutenticadoUseCase — `GET /soporte/qr?c=&e=` (sdd/formulario-publico-qr, WU-17; ADR-9).
 *
 * Camino D3 (modo `SESION`): el usuario registrado escanea el QR de un equipo. El slug `c` debe
 * ser el del cliente de la sesión; si no, 404 (la UI dice que el QR es de otra organización). Con
 * slug correcto, el token se busca en el tenant de la sesión: token ausente, inexistente,
 * regenerado o de un equipo dado de baja o borrado da `equipo: null` (como el contexto público).
 *
 * El escaneo es el primer paso del alta de un ticket de soporte: exige `ALTAS` sobre el tipo SOPORTE,
 * lo mismo que `POST /soporte` (odd/permisos-por-tipo-ticket, D5 c-d). Sin ella, 403.
 */
export class ResolverQrAutenticadoUseCase {
  constructor(
    private readonly clienteRepo: Pick<IClienteRepository, 'findById'>,
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findByQrHash'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findIdByCodigo'>,
  ) {}

  async execute(
    command: ResolverQrAutenticadoCommand,
  ): Promise<Result<QrAutenticadoResult, DomainError>> {
    const permitido = await this.exigirAltaDeSoporte(command.alcance);
    if (permitido.isFail()) {
      return Result.fail(permitido.getError());
    }
    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (
      typeof command.slug !== 'string' ||
      !cliente ||
      !cliente.activo ||
      cliente.isDeleted() ||
      cliente.slug === null ||
      cliente.slug !== command.slug
    ) {
      return Result.fail(new QrDeOtraOrganizacionError());
    }
    return Result.ok({ equipo: await this.resolverEquipo(command.token) });
  }

  /** `ALTAS` sobre el tipo SOPORTE; sin restricción (ROOT y ADMINISTRADOR) ni lo busca. */
  private async exigirAltaDeSoporte(
    alcance: AlcanceActorTicket,
  ): Promise<Result<void, DomainError>> {
    if (alcance.permisosPorTipo === null) return Result.ok(undefined);
    const tipoSoporteId = await this.tipoTicketRepo.findIdByCodigo(TIPO_CODIGO_SOPORTE);
    if (tipoSoporteId === null) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo "${TIPO_CODIGO_SOPORTE}" en el tenant activo.`,
      );
    }
    return exigirAccionSobreTipo(alcance, tipoSoporteId, 'ALTAS');
  }

  private async resolverEquipo(token: unknown): Promise<QrAutenticadoResult['equipo']> {
    if (typeof token !== 'string' || token.length === 0 || token.length > LARGO_MAX_TOKEN) {
      return null;
    }
    const equipo = await this.equipoRepo.findByQrHash(hashTokenQr(token));
    if (!equipo || !equipo.activo || equipo.isDeleted()) {
      return null;
    }
    return { id: equipo.id, nombre: equipo.nombre };
  }
}
