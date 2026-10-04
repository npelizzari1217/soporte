import { Result } from '../../../shared/domain/result';
import type { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { QrDeOtraOrganizacionError } from '../../domain/errors/equipos.errors';
import { hashTokenQr } from './emitir-qr-equipo.use-case';

export interface ResolverQrAutenticadoCommand {
  /** Cliente de la sesión (`JWT.cliente_id`): el tenant ya viene bindeado por `TenantGuard`. */
  clienteId: string;
  /** Slug del QR (`?c=`). */
  slug: unknown;
  /** Token del QR (`?e=`). */
  token: unknown;
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
 */
export class ResolverQrAutenticadoUseCase {
  constructor(
    private readonly clienteRepo: Pick<IClienteRepository, 'findById'>,
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findByQrHash'>,
  ) {}

  async execute(
    command: ResolverQrAutenticadoCommand,
  ): Promise<Result<QrAutenticadoResult, QrDeOtraOrganizacionError>> {
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
