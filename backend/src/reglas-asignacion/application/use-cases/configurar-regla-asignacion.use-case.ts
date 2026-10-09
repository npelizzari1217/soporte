import { Result } from '../../../shared/domain/result';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { IReglaAsignacionRepository } from '../../../tickets/domain/ports/i-regla-asignacion.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { esResponsableElegible } from '../../../tickets/application/services/elegibilidad-responsable-regla';
import { ReglaAsignacionFila } from '../../domain/estado-regla-asignacion';
import {
  ResponsableReglaNoElegibleError,
  TipoTicketNoConfigurableError,
} from '../../domain/errors';

export interface ConfigurarReglaAsignacionDto {
  tipoId: string;
  /** `null` elimina la regla del tipo. */
  responsableId: string | null;
  clienteId: string;
  /** `sub` del actor: queda como `actualizado_por`. */
  actorId: string;
}

/**
 * ConfigurarReglaAsignacionUseCase — fija, reemplaza o quita la regla de un tipo (R1, R3).
 * Revalida en el servidor la elegibilidad del responsable con el criterio compartido del alta;
 * un fallo del maestro se propaga (500 honesto): una escritura de configuración no se degrada.
 *
 * Ref spec: reglas-asignacion R1, R2, R3. Ref design: ADR-9.
 */
export class ConfigurarReglaAsignacionUseCase {
  constructor(
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly reglaRepo: Pick<IReglaAsignacionRepository, 'fijar' | 'quitar'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>,
  ) {}

  async execute(
    dto: ConfigurarReglaAsignacionDto,
  ): Promise<
    Result<ReglaAsignacionFila, TipoTicketNoConfigurableError | ResponsableReglaNoElegibleError>
  > {
    const tipo = await this.tipoTicketRepo.findById(dto.tipoId);
    if (!tipo || tipo.isDeleted() || !tipo.activo) {
      return Result.fail(new TipoTicketNoConfigurableError(dto.tipoId));
    }
    const base = {
      tipoId: tipo.id,
      codigo: tipo.codigo,
      nombre: tipo.nombre,
      modulo: tipo.modulo,
    };

    if (dto.responsableId === null) {
      await this.reglaRepo.quitar(tipo.id);
      return Result.ok({
        ...base,
        responsableId: null,
        responsableNombre: null,
        estado: 'SIN_REGLA',
      });
    }

    const candidatos = await this.usuarioMasterChecker.listarTecnicosAsignables(
      dto.clienteId,
      tipo.modulo,
    );
    const candidato = candidatos.find((c) => c.id === dto.responsableId);
    if (!candidato || !esResponsableElegible(dto.responsableId, candidatos)) {
      return Result.fail(new ResponsableReglaNoElegibleError(dto.responsableId, tipo.id));
    }

    await this.reglaRepo.fijar(tipo.id, dto.responsableId, dto.actorId);
    return Result.ok({
      ...base,
      responsableId: dto.responsableId,
      responsableNombre: `${candidato.nombre} ${candidato.apellido}`.trim(),
      estado: 'VALIDA',
    });
  }
}
