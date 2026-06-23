import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { ITiposComponenteRepository } from '../../domain/ports/i-tipos-componente.repository';
import {
  EquipoInformaticoNoEncontradoError,
  TipoComponenteInactivoError,
} from '../../domain/errors/equipos.errors';

/**
 * DTO para agregar un componente a un equipo.
 */
export interface AgregarComponenteDto {
  /** UUID del equipo al que se agrega el componente. */
  equipoId: string;
  /**
   * UUID del tipo de componente (FK → tipos_componente.id).
   * El tipo DEBE existir y estar activo (activo=TRUE).
   * Un tipo inactivo rechaza nuevas inserciones pero NO afecta los existentes.
   */
  tipoComponenteId: string;
  /** Descripción adicional: modelo, especificación técnica. */
  descripcion: string | null;
  /** Número de serie del componente individual. */
  numeroSerie: string | null;
  /** Capacidad/especificación. Ej: "16GB DDR4", "1TB NVMe". */
  capacidad: string | null;
}

/**
 * AgregarComponenteUseCase — agrega un nuevo componente de hardware a un equipo.
 *
 * Flujo:
 * 1. Carga el equipo → 404 si no existe o fue soft-deleted.
 * 2. Carga el tipo de componente → falla con TipoComponenteInactivoError si:
 *    - El tipo no existe (tratado como inactivo/inválido).
 *    - El tipo existe pero activo=FALSE.
 *    Nota: un tipo inactivo NO afecta los componentes EXISTENTES de ese tipo;
 *    solo bloquea NUEVAS inserciones.
 * 3. Crea la ComponenteEquipoEntity (UUIDv7).
 * 4. Persiste en transacción.
 * 5. Retorna Result.ok(componente).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:equipos/Tipo de componente inactivo no bloquea componentes existentes]
 * Ref spec: [SPEC:equipos/Múltiples componentes del mismo tipo en un equipo]
 * Tarea: 6.B.5 / 6.B.6
 */
export class AgregarComponenteUseCase {
  constructor(
    private readonly equipoRepo: IEquipoInformaticoRepository,
    private readonly componenteRepo: IComponenteEquipoRepository,
    private readonly tiposComponenteRepo: ITiposComponenteRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: AgregarComponenteDto): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    // 1. Cargar el equipo
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoInformaticoNoEncontradoError(dto.equipoId));
    }

    // 2. Cargar el tipo de componente y verificar que está activo
    //    Si no existe → TipoComponenteInactivoError (tratamos "no existe" igual que "inactivo"
    //    para no revelar si el UUID existe o no — simplifica la lógica de presentation).
    const tipoComponente = await this.tiposComponenteRepo.findById(dto.tipoComponenteId);
    if (!tipoComponente || !tipoComponente.activo) {
      return Result.fail(new TipoComponenteInactivoError(dto.tipoComponenteId));
    }

    // 3. Crear la entidad del componente (UUIDv7 generado por BaseEntity)
    const componente = ComponenteEquipoEntity.create({
      equipoId: dto.equipoId,
      tipoComponenteId: dto.tipoComponenteId,
      descripcion: dto.descripcion,
      numeroSerie: dto.numeroSerie,
      capacidad: dto.capacidad,
    });

    // 4. Persistir en transacción
    await this.txRunner.run(async () => {
      await this.componenteRepo.save(componente);
    });

    return Result.ok(componente);
  }
}
