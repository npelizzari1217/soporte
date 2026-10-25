import { Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import {
  HorarioLaboralInvalidoError,
  UsuarioHorarioNoEncontradoError,
} from '../../domain/errors/horario-laboral.errors';
import { IHorarioLaboralUsuarioRepository } from '../../domain/ports/i-horario-laboral-usuario.repository';
import {
  HorarioLaboralResuelto,
  ResolverHorarioLaboralUsuarioService,
} from '../../domain/services/resolver-horario-laboral-usuario.service';
import {
  DiaHorarioEntrada,
  HorarioLaboralSemanal,
} from '../../domain/value-objects/horario-laboral-semanal';
import { HorarioLaboralUsuarioInput } from './obtener-horario-laboral-usuario.use-case';

/** Entrada: el usuario, el cliente activo y los 7 días crudos del DTO HTTP. */
export interface GuardarHorarioLaboralUsuarioInput extends HorarioLaboralUsuarioInput {
  readonly dias: readonly DiaHorarioEntrada[];
}

/**
 * GuardarHorarioLaboralUsuarioUseCase — fija o reemplaza el horario propio de
 * un usuario del tenant (odd/tasks/tiempo-tecnico.md, S1). Mismo flujo que
 * `GuardarHorarioLaboralUseCase`:
 *
 * 1. `HorarioLaboralSemanal.crear(dias)`: las mismas reglas que el horario del
 *    cliente. Si falla, no toca la base.
 * 2. El usuario tiene que pertenecer al tenant; si no, no toca la base.
 * 3. Las 7 filas se reemplazan en una transacción del tenant.
 * 4. Devuelve el horario leído después del commit, con su origen.
 *
 * Sin control de versión optimista: gana el último `PUT` que commitea.
 */
export class GuardarHorarioLaboralUsuarioUseCase {
  constructor(
    private readonly usuarioChecker: Pick<IUsuarioMasterChecker, 'existeEnTenant'>,
    private readonly repo: Pick<IHorarioLaboralUsuarioRepository, 'reemplazar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly resolver: Pick<ResolverHorarioLaboralUsuarioService, 'obtenerParaUsuario'>,
  ) {}

  /**
   * @param input Usuario, cliente activo y los 7 días.
   * @returns El horario guardado, `HorarioLaboralInvalidoError` o
   *          `UsuarioHorarioNoEncontradoError`.
   */
  async execute(
    input: GuardarHorarioLaboralUsuarioInput,
  ): Promise<
    Result<HorarioLaboralResuelto, HorarioLaboralInvalidoError | UsuarioHorarioNoEncontradoError>
  > {
    const horarioResult = HorarioLaboralSemanal.crear(input.dias);
    if (horarioResult.isFail()) {
      return Result.fail(horarioResult.getError());
    }
    if (!(await this.usuarioChecker.existeEnTenant(input.usuarioId, input.clienteId))) {
      return Result.fail(new UsuarioHorarioNoEncontradoError(input.usuarioId));
    }

    const horario = horarioResult.getValue();
    await this.txRunner.run(() => this.repo.reemplazar(input.usuarioId, horario));

    return Result.ok(await this.resolver.obtenerParaUsuario(input.usuarioId));
  }
}
