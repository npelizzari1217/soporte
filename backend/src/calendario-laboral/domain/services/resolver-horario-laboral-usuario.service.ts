import { CalendarioLaboralSemanal } from './calcular-sla-habil-vence.service';
import { ICalendarioLaboralSemanalRepository } from '../ports/i-calendario-laboral-semanal.repository';
import { IHorarioLaboralUsuarioRepository } from '../ports/i-horario-laboral-usuario.repository';

/** De dónde sale el horario con el que se mide a un usuario: el propio o el del tenant. */
export const ORIGENES_HORARIO_LABORAL = ['USUARIO', 'CLIENTE'] as const;

/** Origen del horario resuelto. Derivado de `ORIGENES_HORARIO_LABORAL`. */
export type OrigenHorarioLaboral = (typeof ORIGENES_HORARIO_LABORAL)[number];

/** Horario con el que se mide a un usuario y de dónde salió. */
export interface HorarioLaboralResuelto {
  readonly calendario: CalendarioLaboralSemanal;
  readonly origen: OrigenHorarioLaboral;
}

/**
 * ResolverHorarioLaboralUsuarioService — horario con el que se mide a un
 * usuario (odd/tasks/tiempo-tecnico.md, S1-S2): el propio si lo tiene, si no
 * el del tenant.
 *
 * No valida que el usuario pertenezca al tenant: para un usuario sin filas
 * devuelve el horario del tenant, sea quien sea. La pertenencia la valida el
 * caso de uso que expone el horario por HTTP.
 */
export class ResolverHorarioLaboralUsuarioService {
  constructor(
    private readonly horarioUsuarioRepo: Pick<IHorarioLaboralUsuarioRepository, 'obtener'>,
    private readonly horarioClienteRepo: Pick<ICalendarioLaboralSemanalRepository, 'obtener'>,
  ) {}

  /**
   * @param usuarioId UUID del usuario en `master.usuarios`.
   * @returns El horario propio con origen `USUARIO`, o el del tenant con
   *          origen `CLIENTE` si el usuario no tiene uno.
   */
  async obtenerParaUsuario(usuarioId: string): Promise<HorarioLaboralResuelto> {
    const propio = await this.horarioUsuarioRepo.obtener(usuarioId);
    if (propio !== null) {
      return { calendario: propio, origen: 'USUARIO' };
    }
    return { calendario: await this.horarioClienteRepo.obtener(), origen: 'CLIENTE' };
  }
}
