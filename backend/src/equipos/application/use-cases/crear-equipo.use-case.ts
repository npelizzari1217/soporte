import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { NumeroSerieEquipoDuplicadoError } from '../../domain/errors/equipos.errors';

/**
 * DTO para crear un nuevo equipo informático en el inventario.
 */
export interface CrearEquipoDto {
  /** Nombre o identificador descriptivo. Ej: "PC Contabilidad 03". */
  nombre: string;
  /**
   * Número de serie del fabricante. NULL si no disponible.
   * UNIQUE parcial: si se provee, no debe existir otro equipo con el mismo numero_serie.
   * Múltiples NULL son permitidos (solo aplica el UNIQUE WHERE NOT NULL).
   */
  numeroSerie: string | null;
  /** Fabricante. Ej: Dell, HP, Lenovo. */
  marca: string | null;
  /** Modelo comercial. */
  modelo: string | null;
  /** Fecha de compra o incorporación al inventario. */
  fechaAdquisicion: Date | null;
  /** UUID de la ubicación física del equipo. NULL si sin ubicar. */
  ubicacionId: string | null;
}

/**
 * CrearEquipoUseCase — caso de uso para crear un equipo informático en el inventario.
 *
 * Flujo:
 * 1. Si numeroSerie provisto: verifica unicidad vía repositorio → 409 si duplicado.
 * 2. Crea la EquipoInformaticoEntity (activo=true por defecto, UUIDv7).
 * 3. Persiste en transacción.
 * 4. Retorna Result.ok(equipo).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:equipos/Número de serie único, Equipo sin número de serie es válido]
 * Tarea: 6.B.3 / 6.B.4
 */
export class CrearEquipoUseCase {
  constructor(
    private readonly equipoRepo: IEquipoInformaticoRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    // 1. Verificar unicidad del numero_serie (solo cuando se provee)
    if (dto.numeroSerie !== null) {
      const existente = await this.equipoRepo.findByNumeroSerie(dto.numeroSerie);
      if (existente) {
        return Result.fail(new NumeroSerieEquipoDuplicadoError(dto.numeroSerie));
      }
    }

    // 2. Crear la entidad (activo=true por defecto, UUIDv7 generado por BaseEntity)
    const equipo = EquipoInformaticoEntity.create({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie,
      marca: dto.marca,
      modelo: dto.modelo,
      fechaAdquisicion: dto.fechaAdquisicion,
      ubicacionId: dto.ubicacionId,
      asignadoAId: null,
      activo: true,
    });

    // 3. Persistir en transacción
    await this.txRunner.run(async () => {
      await this.equipoRepo.save(equipo);
    });

    return Result.ok(equipo);
  }
}
