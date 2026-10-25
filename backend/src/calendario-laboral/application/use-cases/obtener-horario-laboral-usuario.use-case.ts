import { Result } from '../../../shared/domain/result';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { UsuarioHorarioNoEncontradoError } from '../../domain/errors/horario-laboral.errors';
import {
  HorarioLaboralResuelto,
  ResolverHorarioLaboralUsuarioService,
} from '../../domain/services/resolver-horario-laboral-usuario.service';

/** Entrada común de los casos de uso del horario propio de un usuario. */
export interface HorarioLaboralUsuarioInput {
  readonly usuarioId: string;
  /** Cliente del tenant activo (`JwtPayload.cliente_id`). */
  readonly clienteId: string;
}

/**
 * ObtenerHorarioLaboralUsuarioUseCase — horario con el que se mide a un
 * usuario del tenant (odd/tasks/tiempo-tecnico.md, S1-S2): el propio o, si no
 * tiene, el del cliente, con el origen de cada uno.
 *
 * Falla con `UsuarioHorarioNoEncontradoError` si el usuario no pertenece al
 * tenant: sin ese chequeo, cualquier UUID devolvería el horario del cliente
 * como si fuera de un usuario real.
 */
export class ObtenerHorarioLaboralUsuarioUseCase {
  constructor(
    private readonly usuarioChecker: Pick<IUsuarioMasterChecker, 'existeEnTenant'>,
    private readonly resolver: Pick<ResolverHorarioLaboralUsuarioService, 'obtenerParaUsuario'>,
  ) {}

  /**
   * @param input Usuario y cliente activo.
   * @returns El horario resuelto, o `UsuarioHorarioNoEncontradoError`.
   */
  async execute(
    input: HorarioLaboralUsuarioInput,
  ): Promise<Result<HorarioLaboralResuelto, UsuarioHorarioNoEncontradoError>> {
    if (!(await this.usuarioChecker.existeEnTenant(input.usuarioId, input.clienteId))) {
      return Result.fail(new UsuarioHorarioNoEncontradoError(input.usuarioId));
    }
    return Result.ok(await this.resolver.obtenerParaUsuario(input.usuarioId));
  }
}
