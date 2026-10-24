import { ElegibilidadAsignado } from '../../tickets/application/services/elegibilidad-asignado';
import { TipoTicketEntity } from '../../tickets/domain/entities/tipo-ticket.entity';
import { ITipoTicketRepository } from '../../tickets/domain/ports/i-tipo-ticket.repository';
import { MasterAgentesEnMemoria } from '../../tickets/test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';
import { ResponsablesPlanPreventivo } from '../application/services/responsables-plan-preventivo';

/** Id del tipo `PREVENTIVO` en el tenant simulado. */
export const TIPO_PREVENTIVO_ID = 'tipo-preventivo';

/** Id de otro tipo vigente del tenant simulado, con su propio técnico. */
export const TIPO_SOPORTE_ID = 'tipo-soporte';

/** Id de un tipo dado de baja: no admite tickets nuevos. */
export const TIPO_DADO_DE_BAJA_ID = 'tipo-dado-de-baja';

/**
 * Usuarios del tenant simulado. Para Preventivo solo `TECNICO_PREVENTIVO` y
 * `COLABORADOR_PREVENTIVO` son elegibles; para Soporte, solo `TECNICO_SOPORTE`. El resto está para
 * que un test pueda afirmar que NO aparecen.
 */
export const USUARIOS_PREVENTIVO = {
  TECNICO_PREVENTIVO: { id: 'tec-prev', nombre: 'Tomás', apellido: 'Paz' },
  COLABORADOR_PREVENTIVO: { id: 'col-prev', nombre: 'Celia', apellido: 'Ibarra' },
  /** USUARIO con `LECTURA` sobre Preventivo: ve el tipo, pero no es técnico. */
  USUARIO_PREVENTIVO: { id: 'usu-prev', nombre: 'Ulises', apellido: 'Arce' },
  /** TECNICO con `LECTURA` sobre Soporte, no sobre Preventivo. */
  TECNICO_SOPORTE: { id: 'tec-sop', nombre: 'Sofía', apellido: 'Bravo' },
  /** TECNICO sin ninguna fila de permisos por tipo. */
  TECNICO_SIN_PERMISOS: { id: 'tec-sin', nombre: 'Saúl', apellido: 'Funes' },
} as const;

/**
 * `ResponsablesPlanPreventivo` real sobre dobles en memoria de master y del tenant.
 *
 * @returns El servicio y el doble de master, que cuenta las consultas de agentes.
 */
export function responsablesDePrueba(): {
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
      { usuarioId: u.TECNICO_SOPORTE.id, tipoId: TIPO_SOPORTE_ID, accion: 'LECTURA' },
    ],
  );
  return {
    responsables: new ResponsablesPlanPreventivo(new ElegibilidadAsignado(master, permisos)),
    master,
  };
}

/**
 * Catálogo de tipos del tenant simulado: Preventivo y Soporte vigentes, y uno dado de baja.
 *
 * @returns El doble de `findById`, que devuelve también el dado de baja (como el repositorio real).
 */
export function tiposDePrueba(): Pick<ITipoTicketRepository, 'findById'> {
  const preventivo = TipoTicketEntity.create(
    { codigo: 'PREVENTIVO', nombre: 'Preventivo', modulo: 'EDILICIA', activo: true },
    TIPO_PREVENTIVO_ID,
  );
  const soporte = TipoTicketEntity.create(
    { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
    TIPO_SOPORTE_ID,
  );
  const dadoDeBaja = TipoTicketEntity.create(
    { codigo: 'VIEJO', nombre: 'Viejo', modulo: 'TICKETS', activo: true },
    TIPO_DADO_DE_BAJA_ID,
  );
  dadoDeBaja.desactivar();
  const porId = new Map([preventivo, soporte, dadoDeBaja].map((tipo) => [tipo.id, tipo]));
  return { findById: async (id) => porId.get(id) ?? null };
}
