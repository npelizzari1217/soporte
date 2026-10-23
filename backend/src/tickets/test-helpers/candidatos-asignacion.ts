import { MasterAgentesEnMemoria } from './master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from './permisos-tipo-ticket-en-memoria';

/**
 * Quienes NO pueden recibir un ticket del tipo, con el motivo como descripción del caso. Todos
 * salvo el técnico tienen `LECTURA` sobre el tipo: el rol es lo que los deja afuera.
 */
export const NO_ELEGIBLES_PARA_ASIGNAR = [
  ['un ADMINISTRADOR con LECTURA sobre el tipo', 'admin-uuid'],
  ['un ROOT con LECTURA sobre el tipo', 'root-uuid'],
  ['un USUARIO con LECTURA sobre el tipo', 'usuario-uuid'],
  ['un TECNICO sin LECTURA sobre el tipo (sí sobre otro)', 'tecnico-otro-tipo-uuid'],
] as const;

/** Quienes SÍ pueden recibir un ticket del tipo: agentes con `LECTURA` sobre él. */
export const ELEGIBLES_PARA_ASIGNAR = [
  ['un TECNICO con LECTURA sobre el tipo', 'tecnico-uuid'],
  ['un COLABORADOR con LECTURA sobre el tipo', 'colaborador-uuid'],
] as const;

/**
 * Suma a los dobles los usuarios de `NO_ELEGIBLES_PARA_ASIGNAR` y `ELEGIBLES_PARA_ASIGNAR`.
 *
 * @param master Doble de master donde se dan de alta con su rol.
 * @param permisos Doble del tenant donde se conceden las filas por tipo.
 * @param tipoId Tipo del ticket que se va a asignar.
 * @param otroTipoId Tipo sobre el que el técnico no elegible sí tiene `LECTURA`.
 */
export async function sumarCandidatosDeAsignacion(
  master: MasterAgentesEnMemoria,
  permisos: PermisosTipoTicketEnMemoria,
  tipoId: string,
  otroTipoId: string,
): Promise<void> {
  master.agregar({ id: 'admin-uuid', rol: 'ADMINISTRADOR', celdas: [] });
  master.agregar({ id: 'root-uuid', rol: 'ROOT', celdas: [] });
  master.agregar({ id: 'usuario-uuid', rol: 'USUARIO', celdas: [] });
  master.agregar({ id: 'tecnico-otro-tipo-uuid', rol: 'TECNICO', celdas: ['TICKETS:LECTURA'] });
  master.agregar({ id: 'tecnico-uuid', rol: 'TECNICO', celdas: [] });
  master.agregar({ id: 'colaborador-uuid', rol: 'COLABORADOR', celdas: [] });
  await permisos.agregarSiFaltan([
    ...['admin-uuid', 'root-uuid', 'usuario-uuid', 'tecnico-uuid', 'colaborador-uuid'].map(
      (usuarioId) => ({ usuarioId, tipoId, accion: 'LECTURA' as const }),
    ),
    { usuarioId: 'tecnico-otro-tipo-uuid', tipoId: otroTipoId, accion: 'LECTURA' },
  ]);
}
