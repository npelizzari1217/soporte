import { Result } from '../../../shared/domain/result';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { UsuarioHorarioNoEncontradoError } from '../../domain/errors/horario-laboral.errors';
import { IHorarioLaboralUsuarioRepository } from '../../domain/ports/i-horario-laboral-usuario.repository';
import {
  HorarioLaboralResuelto,
  ResolverHorarioLaboralUsuarioService,
} from '../../domain/services/resolver-horario-laboral-usuario.service';
import { HorarioLaboralUsuarioInput } from './obtener-horario-laboral-usuario.use-case';

/**
 * BorrarHorarioLaboralUsuarioUseCase — quita el horario propio de un usuario
 * del tenant, que vuelve a medirse con el del cliente (odd/tasks/tiempo-tecnico.md,
 * S2). Sin horario propio, no cambia nada y responde igual.
 *
 * El borrado es una sola sentencia: no necesita transacción.
 */
export class BorrarHorarioLaboralUsuarioUseCase {
  constructor(
    private readonly usuarioChecker: Pick<IUsuarioMasterChecker, 'existeEnTenant'>,
    private readonly repo: Pick<IHorarioLaboralUsuarioRepository, 'borrar'>,
    private readonly resolver: Pick<ResolverHorarioLaboralUsuarioService, 'obtenerParaUsuario'>,
  ) {}

  /**
   * @param input Usuario y cliente activo.
   * @returns El horario con el que queda el usuario (el del cliente), o
   *          `UsuarioHorarioNoEncontradoError`.
   */
  async execute(
    input: HorarioLaboralUsuarioInput,
  ): Promise<Result<HorarioLaboralResuelto, UsuarioHorarioNoEncontradoError>> {
    if (!(await this.usuarioChecker.existeEnTenant(input.usuarioId, input.clienteId))) {
      return Result.fail(new UsuarioHorarioNoEncontradoError(input.usuarioId));
    }
    await this.repo.borrar(input.usuarioId);
    return Result.ok(await this.resolver.obtenerParaUsuario(input.usuarioId));
  }
}
