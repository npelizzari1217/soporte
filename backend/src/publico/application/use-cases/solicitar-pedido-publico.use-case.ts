import { createHash, randomBytes } from 'node:crypto';
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
import {
  ITareasSegundoPlano,
  TAREAS_SEGUNDO_PLANO,
} from '../../../shared/domain/ports/i-tareas-segundo-plano.port';
import { PEDIDO_PUBLICO_TTL_MS } from '../../domain/constants/pedido-publico.constants';
import { PedidoPendienteEntity } from '../../domain/entities/pedido-pendiente.entity';
import { PedidoPublicoTokenEntity } from '../../domain/entities/pedido-publico-token.entity';
import {
  FormularioPublicoNoDisponibleError,
  PedidoPendienteInvalidoError,
} from '../../domain/errors/publico.errors';
import {
  IPedidoPendienteRepository,
  PEDIDO_PENDIENTE_REPOSITORY,
} from '../../domain/ports/i-pedido-pendiente.repository';
import {
  IPedidoPublicoTokenRepository,
  PEDIDO_PUBLICO_TOKEN_REPOSITORY,
} from '../../domain/ports/i-pedido-publico-token.repository';
import { templateVerificarPedido } from '../../domain/templates/verificar-pedido-email.template';
import { ResolverClientePublicoService } from '../services/resolver-cliente-publico.service';

/** Mismo tope que el contexto: un token de QR emitido mide 22; más largo no puede serlo. */
const LARGO_MAX_TOKEN_EQUIPO = 128;

/** Bytes de entropía del token de verificación (256 bits). */
const BYTES_TOKEN_VERIFICACION = 32;

const HORAS_VIGENCIA = PEDIDO_PUBLICO_TTL_MS / (60 * 60 * 1000);

export interface SolicitarPedidoPublicoCommand {
  readonly slug: string;
  readonly nombre: string;
  readonly email: string;
  readonly telefono?: string | null;
  readonly titulo: string;
  readonly descripcion: string;
  readonly equipoToken?: string;
}

export type SolicitarPedidoPublicoError =
  FormularioPublicoNoDisponibleError | PedidoPendienteInvalidoError;

/**
 * SolicitarPedidoPublicoUseCase — `POST publico/c/:slug/pedido/solicitud` (D1, ADR-1, ADR-7).
 *
 * 1. `ResolverClientePublicoService` (404 uniforme + bind del tenant del slug).
 * 2. `estado()` distinto de `LISTO` es el mismo 404 uniforme y NO escribe nada, ni en el tenant ni
 *    en master (D3: ese cliente pide por la vía autenticada).
 * 3. Purga los pendientes vencidos del tenant (PII sin verificar; no hay scheduler).
 * 4. Resuelve el equipo del QR en ESE tenant; un token inválido deja `equipoId` en null.
 * 5. Guarda el pendiente (TENANT, con la PII) y después el token (MASTER, SOLO el sha256 bajo el
 *    mismo id). Master nunca ve nombre, email ni descripción.
 * 6. Diferido por `ITareasSegundoPlano`: el mail con el link `APP_BASE_URL/c/<slug>/pedido/confirmar#token=<crudo>`
 *    por el SMTP del cliente. El token crudo solo existe en ese link.
 *
 * No crea ticket: eso ocurre al confirmar el link (WU-14).
 *
 * Ref spec: pedido-publico D1, D3. Ref design: ADR-1, ADR-7. Tarea: 13.2.
 */
@Injectable()
export class SolicitarPedidoPublicoUseCase {
  constructor(
    private readonly resolverClientePublico: ResolverClientePublicoService,
    @Inject(CORREO_DE_CLIENTE) private readonly correoDeCliente: ICorreoDeCliente,
    @Inject(EQUIPO_INFORMATICO_REPOSITORY)
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findByQrHash'>,
    @Inject(PEDIDO_PENDIENTE_REPOSITORY)
    private readonly pendienteRepo: IPedidoPendienteRepository,
    @Inject(PEDIDO_PUBLICO_TOKEN_REPOSITORY)
    private readonly tokenRepo: IPedidoPublicoTokenRepository,
    @Inject(TAREAS_SEGUNDO_PLANO) private readonly tareas: ITareasSegundoPlano,
    /** `entorno.APP_BASE_URL` sin barra final: `application/` no lee `process.env`. */
    private readonly appBaseUrl: string,
  ) {}

  async ejecutar(
    cmd: SolicitarPedidoPublicoCommand,
  ): Promise<Result<void, SolicitarPedidoPublicoError>> {
    const resuelto = await this.resolverClientePublico.resolver(cmd.slug);
    if (resuelto.isFail()) {
      return Result.fail(resuelto.getError());
    }
    const cliente = resuelto.getValue();

    if ((await this.correoDeCliente.estado(cliente.id)) !== 'LISTO') {
      return Result.fail(new FormularioPublicoNoDisponibleError());
    }

    const pendiente = PedidoPendienteEntity.create({
      nombre: cmd.nombre,
      email: cmd.email,
      telefono: cmd.telefono,
      titulo: cmd.titulo,
      descripcion: cmd.descripcion,
      equipoId: await this.resolverEquipoId(cmd.equipoToken),
    });
    if (pendiente.isFail()) {
      return Result.fail(pendiente.getError());
    }
    const pedido = pendiente.getValue();

    await this.pendienteRepo.purgarVencidos();

    const tokenCrudo = randomBytes(BYTES_TOKEN_VERIFICACION).toString('base64url');
    const token = PedidoPublicoTokenEntity.emitir(
      { clienteId: cliente.id, tokenHash: sha256(tokenCrudo) },
      pedido.id,
    );
    // Pendiente primero: un token en master nunca apunta a una fila que no existe.
    await this.pendienteRepo.save(pedido);
    await this.tokenRepo.save(token);

    const plantilla = templateVerificarPedido({
      nombre: pedido.nombre,
      clienteNombre: cliente.nombre,
      link: `${this.appBaseUrl}/c/${cmd.slug}/pedido/confirmar#token=${tokenCrudo}`,
      vigenciaHoras: HORAS_VIGENCIA,
    });
    const destinatario = pedido.email;
    this.tareas.lanzar('pedido-publico.verificacion', () =>
      this.correoDeCliente.enviar(cliente.id, { to: destinatario, ...plantilla }),
    );

    return Result.ok(undefined);
  }

  private async resolverEquipoId(token: string | undefined): Promise<string | null> {
    if (typeof token !== 'string' || token.length === 0 || token.length > LARGO_MAX_TOKEN_EQUIPO) {
      return null;
    }
    const equipo = await this.equipoRepo.findByQrHash(hashTokenQr(token));
    if (!equipo || !equipo.activo || equipo.isDeleted()) {
      return null;
    }
    return equipo.id;
  }
}

function sha256(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}
