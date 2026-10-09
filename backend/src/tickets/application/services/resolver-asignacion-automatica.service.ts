import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IReglaAsignacionRepository } from '../../domain/ports/i-regla-asignacion.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { evaluarResponsableRegla } from './elegibilidad-responsable-regla';

/** Qué debe escribir el alta cuando la regla del tipo asigna: responsable y ids de catálogo. */
export interface AsignacionAutomatica {
  asignadoId: string;
  estadoAsignadoId: string;
  tipoOperacionAsignacionId: string;
}

/**
 * ResolverAsignacionAutomatica — decide, ANTES de la transacción del alta, si el ticket nace
 * asignado por la regla de su tipo. Su salida es "asignación o nada": nunca devuelve
 * `Result.fail`, porque un problema de configuración jamás debe impedir pedir ayuda.
 *
 * Qué se traga y qué se propaga:
 * - Errores del MAESTRO (`listarTecnicosAsignables`): se degradan a `null` con un log enmascarado
 *   (solo el nombre de la clase del error). Van por otra conexión; no contaminan la transacción.
 * - Errores del TENANT (`findByTipoId`, catálogos): se propagan. En el preventivo el alta corre
 *   dentro de la transacción por plan; una consulta fallida la deja abortada en Postgres, y
 *   tragarla escondería la causa real detrás de "current transaction is aborted".
 *
 * Ref design: sdd/asignacion-automatica-por-tipo ADR-2.
 */
export class ResolverAsignacionAutomatica {
  constructor(
    private readonly reglaRepo: Pick<IReglaAsignacionRepository, 'findByTipoId'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findIdByCodigo'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly logger: ILogger,
  ) {}

  async resolver(tipo: TipoTicketEntity, clienteId: string): Promise<AsignacionAutomatica | null> {
    // Un tipo dado de baja (deleted_at y activo=false van juntos) ignora su regla.
    if (tipo.isDeleted() || !tipo.activo) return null;

    const regla = await this.reglaRepo.findByTipoId(tipo.id);
    if (!regla) return null;

    let elegible: boolean;
    try {
      elegible = await evaluarResponsableRegla(
        regla.responsableId,
        clienteId,
        tipo.modulo,
        this.usuarioMasterChecker,
      );
    } catch (error) {
      const nombreError = error instanceof Error ? error.constructor.name : 'desconocido';
      this.logger.error(
        `ASIGNACION_AUTOMATICA_DEGRADADA | tipoId=${tipo.id} | error=${nombreError}`,
      );
      return null;
    }
    if (!elegible) {
      this.logger.log(
        `ASIGNACION_AUTOMATICA_REGLA_ROTA | tipoId=${tipo.id} | responsableId=${regla.responsableId}`,
      );
      return null;
    }

    const estadoAsignadoId = await this.estadoRepo.findIdByCodigo('ASIGNADO');
    if (!estadoAsignadoId) {
      throw new Error(
        'Catálogo de estados inconsistente: no existe el estado "ASIGNADO" en el tenant activo.',
      );
    }
    const tipoOperacionAsignacionId = await this.tipoOperacionRepo.findIdByCodigo('ASIGNACION');
    if (!tipoOperacionAsignacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "ASIGNACION" en el tenant activo.',
      );
    }

    return { asignadoId: regla.responsableId, estadoAsignadoId, tipoOperacionAsignacionId };
  }
}
