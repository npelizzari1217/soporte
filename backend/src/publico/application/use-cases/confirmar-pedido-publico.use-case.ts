import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DomainError, Result } from '../../../shared/domain/result';
import { ILogger, LOGGER } from '../../../shared/domain/ports/i-logger.port';
import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  CORREO_DE_CLIENTE,
  ICorreoDeCliente,
} from '../../../auth/domain/ports/i-correo-de-cliente.port';
import { CrearTicketSoporteUseCase } from '../../../equipos/application/use-cases/crear-ticket-soporte.use-case';
import { AUTOR_FORMULARIO_PUBLICO } from '../../../tickets/domain/constants/formulario-publico.constants';
import { SolicitanteExternoEntity } from '../../../tickets/domain/entities/solicitante-externo.entity';
import {
  IPrioridadRepository,
  PRIORIDAD_REPOSITORY,
} from '../../../tickets/domain/ports/i-prioridad.repository';
import {
  ISolicitanteExternoRepository,
  SOLICITANTE_EXTERNO_REPOSITORY,
} from '../../../tickets/domain/ports/i-solicitante-externo.repository';
import { FormularioPublicoNoDisponibleError } from '../../domain/errors/publico.errors';
import {
  IPedidoPendienteRepository,
  PEDIDO_PENDIENTE_REPOSITORY,
} from '../../domain/ports/i-pedido-pendiente.repository';
import {
  IPedidoPublicoTokenRepository,
  PEDIDO_PUBLICO_TOKEN_REPOSITORY,
} from '../../domain/ports/i-pedido-publico-token.repository';
import { ResolverClientePublicoService } from '../services/resolver-cliente-publico.service';

/** Código de la prioridad de todo ticket del formulario público: la elige el código, no el cliente. */
export const PRIORIDAD_FORMULARIO_PUBLICO = 'MEDIA';

export interface ConfirmarPedidoPublicoCommand {
  readonly slug: string;
  /** Token crudo del link; solo su sha256 se compara contra master. */
  readonly token: string;
}

/** Lo que la ruta necesita para mandar el mail con el número, ya fuera de la transacción. */
export interface PedidoPublicoConfirmado {
  readonly ticketId: string;
  readonly numero: string;
  readonly nombre: string;
  readonly email: string;
  readonly clienteId: string;
  readonly clienteNombre: string;
}

/** 404 uniforme (token inexistente, usado, vencido, ajeno al slug o sin pendiente) o el fallo del ticket (409 sin ciclo). */
export type ConfirmarPedidoPublicoError = FormularioPublicoNoDisponibleError | DomainError;

/**
 * Error centinela: `crearTicket` devolvió un `Result.fail` DENTRO de la transacción. Lanzarlo hace
 * ROLLBACK, que restaura el pendiente borrado: el link sigue siendo válido (ADR-7). No sale del caso de uso.
 */
class ConfirmacionAbortadaError extends Error {
  constructor(readonly causa: DomainError) {
    super(causa.message);
    this.name = 'ConfirmacionAbortadaError';
  }
}

/**
 * ConfirmarPedidoPublicoUseCase — `POST publico/c/:slug/pedido/confirmar` (D1, ADR-4, ADR-7).
 *
 * 1. `findByHash` en master; un token inexistente, usado, revocado o vencido es el 404 uniforme.
 * 2. `ResolverClientePublicoService` (404 uniforme + bind del tenant del SLUG) y el token tiene que
 *    pertenecer a ese mismo cliente: un token de B en el slug de A es un 404. El correo debe seguir `LISTO`.
 * 3. Prioridad `MEDIA` resuelta por código (catálogo fijo; su ausencia lanza). Nunca viene del cliente.
 * 4. `txRunner.run`: `consumir` (DELETE ... RETURNING) serializa dos confirmaciones sobre la fila, la
 *    segunda recibe null y es 404. Con lo borrado se guarda el solicitante externo y se crea el
 *    ticket (`OMITIR`: un QR viejo no tumba el pedido). Si el ticket falla se lanza el centinela:
 *    ROLLBACK, el pendiente vuelve y el link sigue válido.
 * 5. Post-commit y best-effort: `marcarUsado` en master. Si falla, el pendiente ya no existe y el
 *    token igual da 404.
 *
 * El mail con el número lo manda la ruta (`PedidoPublicoController.confirmar`) después del commit,
 * con `NotificarPedidoCreadoService`.
 *
 * Ref spec: pedido-publico D1. Ref design: ADR-4, ADR-7. Tarea: 14.2.
 */
@Injectable()
export class ConfirmarPedidoPublicoUseCase {
  constructor(
    private readonly resolverClientePublico: ResolverClientePublicoService,
    @Inject(CORREO_DE_CLIENTE) private readonly correoDeCliente: Pick<ICorreoDeCliente, 'estado'>,
    @Inject(PEDIDO_PUBLICO_TOKEN_REPOSITORY)
    private readonly tokenRepo: IPedidoPublicoTokenRepository,
    @Inject(PEDIDO_PENDIENTE_REPOSITORY)
    private readonly pendienteRepo: Pick<IPedidoPendienteRepository, 'consumir'>,
    @Inject(SOLICITANTE_EXTERNO_REPOSITORY)
    private readonly solicitanteRepo: Pick<ISolicitanteExternoRepository, 'save'>,
    @Inject(PRIORIDAD_REPOSITORY)
    private readonly prioridadRepo: Pick<IPrioridadRepository, 'findIdByCodigo'>,
    private readonly crearTicketSoporte: Pick<CrearTicketSoporteUseCase, 'execute'>,
    @Inject(TENANT_TX_RUNNER) private readonly txRunner: ITenantTransactionRunner,
    @Inject(LOGGER) private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  async ejecutar(
    cmd: ConfirmarPedidoPublicoCommand,
  ): Promise<Result<PedidoPublicoConfirmado, ConfirmarPedidoPublicoError>> {
    const noDisponible = () =>
      Result.fail<PedidoPublicoConfirmado, ConfirmarPedidoPublicoError>(
        new FormularioPublicoNoDisponibleError(),
      );

    if (typeof cmd.token !== 'string' || cmd.token.length === 0) {
      return noDisponible();
    }
    const token = await this.tokenRepo.findByHash(sha256(cmd.token));
    if (!token || !token.isVigente()) {
      return noDisponible();
    }

    const resuelto = await this.resolverClientePublico.resolver(cmd.slug);
    if (resuelto.isFail()) {
      return Result.fail(resuelto.getError());
    }
    const cliente = resuelto.getValue();
    if (token.clienteId !== cliente.id) {
      return noDisponible();
    }
    if ((await this.correoDeCliente.estado(cliente.id)) !== 'LISTO') {
      return noDisponible();
    }

    const prioridadId = await this.prioridadRepo.findIdByCodigo(PRIORIDAD_FORMULARIO_PUBLICO);
    if (!prioridadId) {
      throw new Error(
        `Catálogo de prioridades inconsistente: no existe la prioridad "${PRIORIDAD_FORMULARIO_PUBLICO}" en el tenant activo.`,
      );
    }

    let confirmado: PedidoPublicoConfirmado | null;
    try {
      confirmado = await this.txRunner.run(async () => {
        const pendiente = await this.pendienteRepo.consumir(token.id);
        // El DELETE ya corrió: un pendiente vencido queda borrado (era PII sin verificar) y es 404.
        if (!pendiente || pendiente.isExpired()) {
          return null;
        }

        const solicitante = SolicitanteExternoEntity.create({
          nombre: pendiente.nombre,
          email: pendiente.email,
          telefono: pendiente.telefono,
          emailVerificadoAt: new Date(),
        });
        if (solicitante.isFail()) {
          throw new ConfirmacionAbortadaError(solicitante.getError());
        }
        const externo = solicitante.getValue();
        await this.solicitanteRepo.save(externo);

        const creado = await this.crearTicketSoporte.execute({
          titulo: pendiente.titulo,
          descripcion: pendiente.descripcion,
          prioridadId,
          equipoId: pendiente.equipoId,
          solicitanteId: null,
          solicitanteExternoId: externo.id,
          equipoInvalido: 'OMITIR',
          clienteId: cliente.id,
          autorId: AUTOR_FORMULARIO_PUBLICO,
          anio: new Date().getFullYear(),
        });
        if (creado.isFail()) {
          throw new ConfirmacionAbortadaError(creado.getError());
        }
        const { ticket } = creado.getValue();
        return {
          ticketId: ticket.id,
          numero: ticket.numero,
          nombre: externo.nombre,
          email: externo.email,
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
        };
      });
    } catch (error) {
      if (error instanceof ConfirmacionAbortadaError) {
        return Result.fail(error.causa);
      }
      throw error;
    }

    if (confirmado === null) {
      return noDisponible();
    }

    await this.marcarUsado(token.id);
    return Result.ok(confirmado);
  }

  /** Best-effort: la atomicidad la dio el DELETE del pendiente, no esta marca. */
  private async marcarUsado(tokenId: string): Promise<void> {
    try {
      await this.tokenRepo.marcarUsado(tokenId);
    } catch {
      this.logger.error(`pedido-publico: no se pudo marcar used_at del token ${tokenId}`);
    }
  }
}

function sha256(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}
