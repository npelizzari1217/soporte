import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import {
  EquipoInformaticoNoEncontradoError,
  NumeroSerieEquipoDuplicadoError,
} from '../../domain/errors/equipos.errors';

/**
 * DTO para editar un equipo informático existente.
 */
export interface EditarEquipoDto {
  /** UUID del equipo a editar. */
  equipoId: string;
  /** Nombre o identificador descriptivo. */
  nombre: string;
  /**
   * Número de serie del fabricante. NULL si no disponible.
   * Si se provee, no debe existir OTRO equipo con el mismo numero_serie (409).
   * Conservar el mismo numero_serie del equipo editado NO genera conflicto.
   */
  numeroSerie: string | null;
  /** Fabricante. */
  marca: string | null;
  /** Modelo comercial. */
  modelo: string | null;
  /** Fecha de compra o incorporación. */
  fechaAdquisicion: Date | null;
  /** UUID de la ubicación física. NULL si sin ubicar. */
  ubicacionId: string | null;
}

/**
 * EditarEquipoUseCase — caso de uso para actualizar datos de un equipo informático.
 *
 * Flujo:
 * 1. Carga el equipo por id → 404 si no existe o fue soft-deleted.
 * 2. Si numeroSerie provisto: verifica que ningún OTRO equipo lo use → 409 si duplicado.
 *    Si findByNumeroSerie retorna el mismo equipo (mismo id), no es conflicto.
 * 3. Aplica los cambios a la entidad.
 * 4. Persiste en transacción.
 * 5. Retorna Result.ok(equipo).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:equipos/Número de serie único, Inventario de equipos]
 * Tarea: 6.B.3 / 6.B.4
 */
export class EditarEquipoUseCase {
  constructor(
    private readonly equipoRepo: IEquipoInformaticoRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EditarEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    // 1. Cargar el equipo
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoInformaticoNoEncontradoError(dto.equipoId));
    }

    // 2. Verificar unicidad del nuevo numero_serie (solo cuando se provee)
    if (dto.numeroSerie !== null) {
      const existente = await this.equipoRepo.findByNumeroSerie(dto.numeroSerie);
      // Conflicto real solo si existe y es un equipo DISTINTO al que estamos editando
      if (existente && existente.id !== dto.equipoId) {
        return Result.fail(new NumeroSerieEquipoDuplicadoError(dto.numeroSerie));
      }
    }

    // 3. Aplicar cambios a la entidad (mutación via método de dominio)
    equipo.actualizar({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie,
      marca: dto.marca,
      modelo: dto.modelo,
      fechaAdquisicion: dto.fechaAdquisicion,
      ubicacionId: dto.ubicacionId,
    });

    // 4. Persistir en transacción
    await this.txRunner.run(async () => {
      await this.equipoRepo.save(equipo);
    });

    return Result.ok(equipo);
  }
}
