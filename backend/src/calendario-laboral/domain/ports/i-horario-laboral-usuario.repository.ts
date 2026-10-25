import { CalendarioLaboralSemanal } from '../services/calcular-sla-habil-vence.service';
import { HorarioLaboralSemanal } from '../value-objects/horario-laboral-semanal';

/**
 * IHorarioLaboralUsuarioRepository — horario laboral propio de cada usuario
 * (`horario_laboral_usuario`, base del tenant; odd/tasks/tiempo-tecnico.md, S1).
 *
 * Un usuario sin horario propio no tiene filas: `obtener` devuelve `null` y
 * quien resuelve el horario cae al del tenant (S2). `usuarioId` es referencia
 * blanda a `master.usuarios`; validar que pertenece al tenant es del caso de
 * uso, no de este puerto.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface IHorarioLaboralUsuarioRepository {
  /**
   * Horario propio del usuario, como las 7 ventanas indexadas 0 (domingo) a
   * 6 (sábado).
   *
   * @param usuarioId UUID del usuario en `master.usuarios`.
   * @returns El horario, o `null` si el usuario no tiene horario propio.
   * @throws Error si el usuario tiene filas pero no las 7: un horario
   *               incompleto nunca se completa en silencio.
   */
  obtener(usuarioId: string): Promise<CalendarioLaboralSemanal | null>;

  /**
   * Reemplaza el horario propio del usuario con las 7 ventanas del agregado ya
   * validado. El caller lo corre dentro de una transacción del tenant: la
   * implementación escribe las 7 filas en orden `diaSemana` 0→6, de forma
   * secuencial, para que dos escrituras concurrentes tomen los locks en el
   * mismo orden.
   *
   * @param usuarioId UUID del usuario en `master.usuarios`.
   * @param horario Horario semanal validado.
   */
  reemplazar(usuarioId: string, horario: HorarioLaboralSemanal): Promise<void>;

  /**
   * Borra el horario propio del usuario: vuelve a medirse con el del tenant.
   * Sin horario propio, no hace nada.
   *
   * @param usuarioId UUID del usuario en `master.usuarios`.
   */
  borrar(usuarioId: string): Promise<void>;
}

/** Token de inyección de dependencias para IHorarioLaboralUsuarioRepository en NestJS. */
export const HORARIO_LABORAL_USUARIO_REPOSITORY = Symbol('HORARIO_LABORAL_USUARIO_REPOSITORY');
