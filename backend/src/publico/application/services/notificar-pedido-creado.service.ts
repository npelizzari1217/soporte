import { ICorreoDeCliente } from '../../../auth/domain/ports/i-correo-de-cliente.port';
import { ITareasSegundoPlano } from '../../../shared/domain/ports/i-tareas-segundo-plano.port';
import { templatePedidoCreado } from '../../domain/templates/pedido-creado-email.template';
import { PedidoPublicoConfirmado } from '../use-cases/confirmar-pedido-publico.use-case';

/**
 * NotificarPedidoCreadoService — manda al solicitante el mail con el número del ticket, ya fuera de
 * la transacción de la confirmación. Se difiere con `ITareasSegundoPlano`: el envío nunca condiciona
 * la respuesta ni la deshace, y un fallo del SMTP queda logueado por la tarea.
 *
 * Ref spec: pedido-publico (D1). Ref design: ADR-9. Tarea: 15.2.
 */
export class NotificarPedidoCreadoService {
  constructor(
    private readonly correoDeCliente: Pick<ICorreoDeCliente, 'enviar'>,
    private readonly tareas: ITareasSegundoPlano,
  ) {}

  notificar(pedido: PedidoPublicoConfirmado): void {
    const plantilla = templatePedidoCreado({
      nombre: pedido.nombre,
      clienteNombre: pedido.clienteNombre,
      numero: pedido.numero,
    });
    this.tareas.lanzar('pedido-publico.creado', () =>
      this.correoDeCliente.enviar(pedido.clienteId, { to: pedido.email, ...plantilla }),
    );
  }
}
