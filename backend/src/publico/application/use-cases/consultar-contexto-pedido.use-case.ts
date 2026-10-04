import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import {
  CORREO_DE_CLIENTE,
  ICorreoDeCliente,
} from '../../../auth/domain/ports/i-correo-de-cliente.port';
import {
  EQUIPO_INFORMATICO_REPOSITORY,
  IEquipoInformaticoRepository,
} from '../../../equipos/domain/ports/i-equipo-informatico.repository';
import { hashTokenQr } from '../../../equipos/application/use-cases/emitir-qr-equipo.use-case';
import { FormularioPublicoNoDisponibleError } from '../../domain/errors/publico.errors';
import { ResolverClientePublicoService } from '../services/resolver-cliente-publico.service';

/** Largo máximo aceptado para el token `e`: el real mide 22; más largo no puede ser un QR emitido. */
const LARGO_MAX_TOKEN = 128;

/**
 * Contexto público del formulario. SOLO nombres: sin serie, ubicación ni valoración del equipo
 * (equipos-qr, D8). `modo` lo decide `ICorreoDeCliente.estado()` (ADR-1).
 */
export interface ContextoPedidoResult {
  readonly cliente: { readonly nombre: string };
  readonly equipo: { readonly nombre: string } | null;
  readonly modo: 'EXTERNO' | 'SESION';
}

/**
 * ConsultarContextoPedidoUseCase — `GET publico/c/:slug/pedido/contexto?e=`.
 *
 * 1. `ResolverClientePublicoService` (404 uniforme + bind del tenant del slug).
 * 2. `estado()` del correo: `LISTO` es `EXTERNO`; cualquier otro valor es `SESION` (falla cerrado).
 * 3. El token se busca SOLO en la base ya bindeada por el slug: el de otro cliente no resuelve.
 *
 * Token ausente, inexistente, regenerado, de otro tenant o de un equipo dado de baja o borrado
 * producen exactamente la misma respuesta: `equipo: null` (ADR-5).
 *
 * Ref spec: equipos-qr D8; formulario-publico-cliente D3. Ref design: ADR-1, ADR-5. Tarea: 12.3.
 */
@Injectable()
export class ConsultarContextoPedidoUseCase {
  constructor(
    private readonly resolverClientePublico: ResolverClientePublicoService,
    @Inject(CORREO_DE_CLIENTE) private readonly correoDeCliente: ICorreoDeCliente,
    @Inject(EQUIPO_INFORMATICO_REPOSITORY)
    private readonly equipoRepo: IEquipoInformaticoRepository,
  ) {}

  async ejecutar(
    slug: string,
    token: unknown,
  ): Promise<Result<ContextoPedidoResult, FormularioPublicoNoDisponibleError>> {
    const resuelto = await this.resolverClientePublico.resolver(slug);
    if (resuelto.isFail()) {
      return Result.fail(resuelto.getError());
    }
    const cliente = resuelto.getValue();

    const estado = await this.correoDeCliente.estado(cliente.id);
    const modo = estado === 'LISTO' ? 'EXTERNO' : 'SESION';

    return Result.ok({
      cliente: { nombre: cliente.nombre },
      equipo: await this.resolverEquipo(token),
      modo,
    });
  }

  private async resolverEquipo(token: unknown): Promise<{ nombre: string } | null> {
    if (typeof token !== 'string' || token.length === 0 || token.length > LARGO_MAX_TOKEN) {
      return null;
    }
    const equipo = await this.equipoRepo.findByQrHash(hashTokenQr(token));
    if (!equipo || !equipo.activo || equipo.isDeleted()) {
      return null;
    }
    return { nombre: equipo.nombre };
  }
}
