import { ISolicitanteExternoRepository } from '../../tickets/domain/ports/i-solicitante-externo.repository';
import { IUsuarioContactoResolver } from '../domain/ports/i-usuario-contacto-resolver';
import {
  ContactoSolicitante,
  IContactoSolicitanteResolver,
  SolicitanteDeTicket,
} from '../domain/ports/i-contacto-solicitante-resolver';

/**
 * ContactoSolicitanteResolverAdapter — ramifica según el solicitante del ticket: un usuario
 * registrado se resuelve contra master con `IUsuarioContactoResolver` (comportamiento previo
 * intacto) y un externo se lee de `solicitantes_externos` en el tenant activo.
 *
 * Ref spec: sdd/formulario-publico-qr solicitante-externo, requisito D5. Tarea: 9.2.
 */
export class ContactoSolicitanteResolverAdapter implements IContactoSolicitanteResolver {
  constructor(
    private readonly usuarioResolver: Pick<IUsuarioContactoResolver, 'resolverContacto'>,
    private readonly externoRepo: Pick<ISolicitanteExternoRepository, 'findById'>,
  ) {}

  async resolver(ticket: SolicitanteDeTicket): Promise<ContactoSolicitante | null> {
    if (ticket.solicitanteId) {
      const contacto = await this.usuarioResolver.resolverContacto(ticket.solicitanteId);
      return contacto ? { ...contacto, esExterno: false } : null;
    }
    if (ticket.solicitanteExternoId) {
      const externo = await this.externoRepo.findById(ticket.solicitanteExternoId);
      return externo ? { email: externo.email, nombre: externo.nombre, esExterno: true } : null;
    }
    return null;
  }
}
