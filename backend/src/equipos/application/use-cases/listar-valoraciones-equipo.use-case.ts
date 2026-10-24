import { DomainError, Result } from '../../../shared/domain/result';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IValoracionEquipoRepository } from '../../domain/ports/i-valoracion-equipo.repository';
import { ValoracionEquipo } from '../../domain/entities/valoracion-equipo';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';

/** DTO de entrada para leer el historial del valor de un equipo. */
export interface ListarValoracionesEquipoDto {
  equipoId: string;
}

/** Una valoración del historial con el nombre de quien la guardó, si se pudo resolver. */
export interface ValoracionEquipoConUsuario {
  valoracion: ValoracionEquipo;
  /** `null` en las filas de migración o si el usuario ya no existe en master. */
  usuario: { nombre: string; apellido: string } | null;
}

/**
 * ListarValoracionesEquipoUseCase — historial del valor de un equipo, ordenado por fecha
 * ascendente (odd/tasks/historial-valor-residual.md, S5).
 *
 * Un equipo dado de baja también muestra su historial: la baja no lo borra. Uno inexistente o con
 * borrado lógico es `EquipoNoEncontradoError`, igual que el detalle.
 *
 * Los nombres de los usuarios se resuelven en UNA consulta a master (`resolverNombres`, sin N+1).
 * Un usuario que ya no existe queda sin nombre: el historial se muestra igual.
 */
export class ListarValoracionesEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly valoracionRepo: Pick<IValoracionEquipoRepository, 'listarPorEquipo'>,
    private readonly usuarios: Pick<IUsuarioMasterChecker, 'resolverNombres'>,
  ) {}

  /**
   * @param dto Equipo cuyo historial se pide.
   * @returns El historial con los nombres resueltos, o `EquipoNoEncontradoError`.
   */
  async execute(
    dto: ListarValoracionesEquipoDto,
  ): Promise<Result<ValoracionEquipoConUsuario[], DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }

    const valoraciones = await this.valoracionRepo.listarPorEquipo(equipo.id);
    const usuarioIds = [
      ...new Set(
        valoraciones.flatMap((valoracion) =>
          valoracion.usuarioId !== null ? [valoracion.usuarioId] : [],
        ),
      ),
    ];
    const nombres = await this.usuarios.resolverNombres(usuarioIds);

    return Result.ok(
      valoraciones.map((valoracion) => ({
        valoracion,
        usuario: valoracion.usuarioId !== null ? (nombres.get(valoracion.usuarioId) ?? null) : null,
      })),
    );
  }
}
