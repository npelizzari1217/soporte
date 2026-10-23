import { ElegibilidadAsignado } from '../../tickets/application/services/elegibilidad-asignado';
import { ITipoTicketRepository } from '../../tickets/domain/ports/i-tipo-ticket.repository';
import { TIPO_CODIGO_PREVENTIVO } from '../../tickets/domain/tipos-ticket.constants';
import { MasterAgentesEnMemoria } from '../../tickets/test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';
import { ResponsablesPlanPreventivo } from '../application/services/responsables-plan-preventivo';

/** Id del tipo `PREVENTIVO` en el tenant simulado. */
export const TIPO_PREVENTIVO_ID = 'tipo-preventivo';

/**
 * Usuarios del tenant simulado. Solo `TECNICO_PREVENTIVO` y `COLABORADOR_PREVENTIVO` son
 * elegibles; el resto está para que un test pueda afirmar que NO aparecen.
 */
export const USUARIOS_PREVENTIVO = {
  TECNICO_PREVENTIVO: { id: 'tec-prev', nombre: 'Tomás', apellido: 'Paz' },
  COLABORADOR_PREVENTIVO: { id: 'col-prev', nombre: 'Celia', apellido: 'Ibarra' },
  /** USUARIO con `LECTURA` sobre Preventivo: ve el tipo, pero no es técnico. */
  USUARIO_PREVENTIVO: { id: 'usu-prev', nombre: 'Ulises', apellido: 'Arce' },
  /** TECNICO con `LECTURA` sobre otro tipo, no sobre Preventivo. */
  TECNICO_SOPORTE: { id: 'tec-sop', nombre: 'Sofía', apellido: 'Bravo' },
  /** TECNICO sin ninguna fila de permisos por tipo. */
  TECNICO_SIN_PERMISOS: { id: 'tec-sin', nombre: 'Saúl', apellido: 'Funes' },
} as const;

/**
 * `ResponsablesPlanPreventivo` real sobre dobles en memoria de master y del tenant.
 *
 * @param tipoPreventivoId Id que devuelve el catálogo para `PREVENTIVO`; `null` simula un tenant
 *   sin el tipo sembrado.
 * @returns El servicio y el doble de master, que cuenta las consultas de agentes.
 */
export function responsablesDePrueba(tipoPreventivoId: string | null = TIPO_PREVENTIVO_ID): {
  responsables: ResponsablesPlanPreventivo;
  master: MasterAgentesEnMemoria;
} {
  const u = USUARIOS_PREVENTIVO;
  const master = new MasterAgentesEnMemoria();
  master.agregar({ ...u.TECNICO_PREVENTIVO, rol: 'TECNICO', celdas: [] });
  master.agregar({ ...u.COLABORADOR_PREVENTIVO, rol: 'COLABORADOR', celdas: [] });
  master.agregar({ ...u.USUARIO_PREVENTIVO, rol: 'USUARIO', celdas: [] });
  master.agregar({ ...u.TECNICO_SOPORTE, rol: 'TECNICO', celdas: [] });
  master.agregar({ ...u.TECNICO_SIN_PERMISOS, rol: 'TECNICO', celdas: ['PREVENTIVO:LECTURA'] });
  const permisos = new PermisosTipoTicketEnMemoria(
    [],
    [
      { usuarioId: u.TECNICO_PREVENTIVO.id, tipoId: TIPO_PREVENTIVO_ID, accion: 'LECTURA' },
      { usuarioId: u.COLABORADOR_PREVENTIVO.id, tipoId: TIPO_PREVENTIVO_ID, accion: 'LECTURA' },
      { usuarioId: u.USUARIO_PREVENTIVO.id, tipoId: TIPO_PREVENTIVO_ID, accion: 'LECTURA' },
      { usuarioId: u.TECNICO_SOPORTE.id, tipoId: 'tipo-soporte', accion: 'LECTURA' },
    ],
  );
  const tipos: Pick<ITipoTicketRepository, 'findIdByCodigo'> = {
    findIdByCodigo: async (codigo) => (codigo === TIPO_CODIGO_PREVENTIVO ? tipoPreventivoId : null),
  };
  return {
    responsables: new ResponsablesPlanPreventivo(tipos, new ElegibilidadAsignado(master, permisos)),
    master,
  };
}
