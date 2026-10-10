import { Inject, Injectable } from '@nestjs/common';
import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';
import {
  ESTADO_REPOSITORY,
  IEstadoRepository,
} from '../../tickets/domain/ports/i-estado.repository';
import {
  ISolicitanteExternoRepository,
  SOLICITANTE_EXTERNO_REPOSITORY,
} from '../../tickets/domain/ports/i-solicitante-externo.repository';
import {
  IUsuarioMasterChecker,
  USUARIO_MASTER_CHECKER,
} from '../../tickets/domain/ports/i-usuario-master.checker';
import { NombresResueltos, toTicketResponseDto } from '../../tickets/interface/dtos/ticket.dto';
import { aTicketV1, TicketV1 } from './tickets-v1.dto';

/**
 * Arma la respuesta `v1` de tickets: resuelve en lote (sin N+1) los nombres de solicitante y
 * asignado y el codigo de estado, y proyecta a la lista blanca de campos del contrato publico.
 * Solo presenta: las reglas de acceso y de negocio las deciden los casos de uso.
 */
@Injectable()
export class TicketsV1Presenter {
  constructor(
    @Inject(USUARIO_MASTER_CHECKER)
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'resolverNombres'>,
    @Inject(SOLICITANTE_EXTERNO_REPOSITORY)
    private readonly solicitanteExternoRepo: Pick<ISolicitanteExternoRepository, 'findNombres'>,
    @Inject(ESTADO_REPOSITORY)
    private readonly estadoRepo: Pick<IEstadoRepository, 'findAllActive'>,
  ) {}

  async presentar(tickets: TicketEntity[]): Promise<TicketV1[]> {
    if (tickets.length === 0) {
      return [];
    }
    const idsUsuarios = new Set<string>();
    const idsExternos = new Set<string>();
    for (const t of tickets) {
      if (t.solicitanteId) idsUsuarios.add(t.solicitanteId);
      if (t.solicitanteExternoId) idsExternos.add(t.solicitanteExternoId);
      if (t.asignadoId) idsUsuarios.add(t.asignadoId);
    }
    const [usuarios, externos, estados] = await Promise.all([
      this.usuarioMasterChecker.resolverNombres([...idsUsuarios]),
      this.solicitanteExternoRepo.findNombres([...idsExternos]),
      this.estadoRepo.findAllActive(),
    ]);
    const codigos = new Map(estados.map((e) => [e.id, e.codigo]));

    return tickets.map((t) => {
      const externo = t.solicitanteExternoId ? externos.get(t.solicitanteExternoId) : undefined;
      const nombres: NombresResueltos = {
        solicitante: t.solicitanteId ? usuarios.get(t.solicitanteId) : undefined,
        solicitanteExterno: externo === undefined ? undefined : { nombre: externo },
        asignado: t.asignadoId ? usuarios.get(t.asignadoId) : undefined,
      };
      // Estado fuera del catalogo activo: codigo vacio (el SLA lo trata como "corriendo").
      const codigo = codigos.get(t.estadoId) ?? '';
      return aTicketV1(toTicketResponseDto(t, nombres, undefined, undefined, codigo), codigo);
    });
  }
}
