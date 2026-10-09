import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import {
  AUTOR_SISTEMA,
  DESCRIPCION_ASIGNACION_POR_REGLA,
  ORIGEN_ASIGNACION,
} from '../../domain/constants/autor-sistema.constants';
import { AsignacionAutomatica } from './resolver-asignacion-automatica.service';

export interface OperacionesAperturaProps {
  ticketId: string;
  tipoId: string;
  estadoInicialId: string;
  tipoOperacionAperturaId: string;
  autorId: string;
  asignacion: AsignacionAutomatica | null;
}

/**
 * Operaciones que escribe el alta de un ticket (ADR-3): la apertura `CAMBIO_ESTADO null → inicial`
 * con el autor recibido y, solo si la regla asigna, la `ASIGNACION` del sistema. Compartido por los
 * tres casos de uso de alta para no triplicar el armado.
 */
export function operacionesDeApertura(props: OperacionesAperturaProps): OperacionTicketEntity[] {
  const apertura = OperacionTicketEntity.create({
    ticketId: props.ticketId,
    tipoOperacionId: props.tipoOperacionAperturaId,
    descripcion: null,
    estadoAnteriorId: null,
    estadoNuevoId: props.estadoInicialId,
    autorId: props.autorId,
    esInterno: false,
    metadata: null,
  });
  if (!props.asignacion) return [apertura];

  const asignacion = OperacionTicketEntity.create({
    ticketId: props.ticketId,
    tipoOperacionId: props.asignacion.tipoOperacionAsignacionId,
    descripcion: DESCRIPCION_ASIGNACION_POR_REGLA,
    estadoAnteriorId: null,
    estadoNuevoId: null,
    autorId: AUTOR_SISTEMA,
    esInterno: false,
    metadata: {
      origen: ORIGEN_ASIGNACION,
      tipoId: props.tipoId,
      asignadoId: props.asignacion.asignadoId,
    },
  });
  return [apertura, asignacion];
}
