import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  PiezaDeEquipoADevolver,
  RegistrarEntradaInsumoUseCase,
} from '../../../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import {
  ItemEnEquipo,
  OperacionesUnidadInsumo,
} from '../../../insumos/application/services/operaciones-unidad-insumo.service';
import { FalloOperacionDeUnidad } from '../../../insumos/domain/errors/fallo-operacion-de-unidad';
import { DevolucionConPiezasProblematicasError } from '../../../insumos/domain/errors/unidades-insumo.errors';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  CategoriaBajaEquipo,
  componerLeyendaBaja,
  DESTINOS_BAJA_EQUIPO,
  DestinoBajaEquipo,
  EquipoInformaticoEntity,
  esCategoriaBajaEquipo,
  largoMaximoTextoBaja,
} from '../../domain/entities/equipo-informatico.entity';
import {
  BajaEquipoConPiezasProblematicasError,
  ComponenteDadoDeBajaError,
  EquipoDadoDeBajaError,
  EquipoModificadoDuranteLaBajaError,
  EquipoNoEncontradoError,
  MotivoBajaEquipoInvalidoError,
} from '../../domain/errors/equipos.errors';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';

/**
 * Excepción de uso INTERNO de este archivo: envuelve el `DomainError` de cualquier paso de la
 * baja que falla dentro de la transacción, para que viaje como EXCEPCIÓN (`$transaction` solo
 * revierte ante una excepción) y vuelva a ser `Result.fail` afuera. Mismo patrón que
 * `FalloRetiroDeComponente`. Ninguna rama devuelve `fail` dentro de `run()` después de una
 * escritura.
 */
class FalloBajaDeEquipo extends Error {
  constructor(readonly errorDeDominio: DomainError) {
    super(`La baja del equipo falló: ${errorDeDominio.message}`);
    this.name = 'FalloBajaDeEquipo';
  }
}

/** Serial informado para un componente legado (sin unidad) que vuelve al stock. */
export interface SerialDeComponenteDeBaja {
  componenteId: string;
  numeroSerie: string;
}

/** DTO de entrada de `DarDeBajaEquipoUseCase`. */
export interface DarDeBajaEquipoDto {
  equipoId: string;
  /** Destino único de todas las piezas activas (`STOCK_USADO` o `DESCARTE`). */
  destino: string;
  categoria: string;
  /** Texto libre del motivo; vacío equivale a ausente. */
  motivo?: string | null;
  /** Seriales de los legados `SERIE` (solo con `STOCK_USADO`); se ignoran para otras piezas. */
  seriales?: readonly SerialDeComponenteDeBaja[];
  /** Quién da de baja. Lo pone el borde desde el usuario autenticado, nunca el body. */
  usuarioId: string;
}

/**
 * DarDeBajaEquipoUseCase — sdd/baja-equipo-completo (ADR-3): da de baja un equipo con TODAS sus
 * piezas activas en un mismo destino (`STOCK_USADO` o `DESCARTE`), todo o nada.
 *
 * Fuera de la transacción (camino rápido, sin locks): el equipo existe y es vigente, el motivo y
 * la leyenda compuesta son válidos (ADR-4) y, con `STOCK_USADO`, el diagnóstico junta TODAS las
 * piezas que no pueden volver al depósito.
 *
 * Dentro de `txRunner.run()`, en este orden: LE `FOR NO KEY UPDATE` del equipo y recheck; relectura
 * de las piezas (un conjunto distinto es `EquipoModificadoDuranteLaBajaError`); stock (A:
 * `registrarDevolucionesDeEquipo`, B: `descartarInstaladas` con las unidades ordenadas por id);
 * componentes (L4) ordenados por id con CAS; y `registrarBaja` con CAS. NUNCA se itera
 * `RetirarComponenteUseCase`: tomaría L1 a L3 en el orden de los componentes.
 *
 * Todo `Result.fail` interno se lanza como `FalloBajaDeEquipo` y todo `FalloOperacionDeUnidad`
 * (un P2002 residual) se deja propagar; ambos se desenvuelven afuera del `run()`.
 */
export class DarDeBajaEquipoUseCase {
  constructor(
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly equipoRepo: Pick<
      IEquipoInformaticoRepository,
      'findById' | 'bloquearParaModificar' | 'registrarBaja'
    >,
    private readonly componenteRepo: Pick<
      IComponenteEquipoRepository,
      'findActiveByEquipoId' | 'retirar'
    >,
    private readonly registrarEntrada: Pick<
      RegistrarEntradaInsumoUseCase,
      'diagnosticarDevolucionesDeEquipo' | 'registrarDevolucionesDeEquipo'
    >,
    private readonly operaciones: Pick<OperacionesUnidadInsumo, 'descartarInstaladas'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async execute(dto: DarDeBajaEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }
    if (!equipo.activo) {
      return Result.fail(new EquipoDadoDeBajaError(dto.equipoId));
    }

    const destino = this.validarDestino(dto.destino);
    const categoria = esCategoriaBajaEquipo(dto.categoria) ? dto.categoria : null;
    if (destino === null || categoria === null) {
      return Result.fail(new MotivoBajaEquipoInvalidoError());
    }
    const validado = this.validarMotivo(equipo.nombre, categoria, dto.motivo);
    if (validado.isFail()) return Result.fail(validado.getError());

    const previas = await this.componenteRepo.findActiveByEquipoId(dto.equipoId);
    if (destino === 'STOCK_USADO') {
      const causas = await this.registrarEntrada.diagnosticarDevolucionesDeEquipo(
        this.piezasADevolver(previas, dto.seriales),
      );
      if (causas.length > 0) {
        return Result.fail(new BajaEquipoConPiezasProblematicasError(causas));
      }
    }

    try {
      return await this.txRunner.run(async () => {
        const bloqueado = await this.equipoRepo.bloquearParaModificar(dto.equipoId);
        if (!bloqueado || bloqueado.isDeleted()) {
          throw new FalloBajaDeEquipo(new EquipoNoEncontradoError(dto.equipoId));
        }
        if (!bloqueado.activo) {
          throw new FalloBajaDeEquipo(new EquipoDadoDeBajaError(dto.equipoId));
        }
        // El nombre pudo cambiar antes de tomar el lock: la leyenda se recompone con el definitivo.
        const bajo = this.validarMotivo(bloqueado.nombre, categoria, dto.motivo);
        if (bajo.isFail()) throw new FalloBajaDeEquipo(bajo.getError());
        const leyenda = bajo.getValue();
        const texto = dto.motivo?.trim() ?? '';

        const piezas = [...(await this.componenteRepo.findActiveByEquipoId(dto.equipoId))].sort(
          (a, b) => a.id.localeCompare(b.id),
        );
        if (!mismoConjunto(previas, piezas)) {
          throw new FalloBajaDeEquipo(new EquipoModificadoDuranteLaBajaError(dto.equipoId));
        }

        const movimientos = await this.moverStock(destino, dto, piezas, leyenda);

        for (const pieza of piezas) {
          pieza.retirar({
            destino,
            motivo: leyenda,
            usuarioId: dto.usuarioId,
            bajaMovimientoId:
              destino === 'STOCK_USADO' ? (movimientos.get(pieza.id) ?? null) : null,
          });
          if (!(await this.componenteRepo.retirar(pieza))) {
            throw new FalloBajaDeEquipo(new ComponenteDadoDeBajaError(pieza.id));
          }
        }

        bloqueado.darDeBaja({
          destino,
          categoria,
          motivo: texto,
          usuarioId: dto.usuarioId,
          fecha: this.ahora(),
        });
        if (!(await this.equipoRepo.registrarBaja(bloqueado))) {
          throw new FalloBajaDeEquipo(new EquipoDadoDeBajaError(dto.equipoId));
        }
        return Result.ok<EquipoInformaticoEntity, DomainError>(bloqueado);
      });
    } catch (error) {
      if (error instanceof FalloBajaDeEquipo || error instanceof FalloOperacionDeUnidad) {
        return Result.fail(this.traducir(error.errorDeDominio));
      }
      throw error;
    }
  }

  /** Paso 3 de ADR-3: devuelve las piezas al stock (A) o descarta sus unidades (B). */
  private async moverStock(
    destino: DestinoBajaEquipo,
    dto: DarDeBajaEquipoDto,
    piezas: readonly ComponenteEquipoEntity[],
    leyenda: string,
  ): Promise<Map<string, string>> {
    if (piezas.length === 0) return new Map();

    if (destino === 'STOCK_USADO') {
      const devueltas = await this.registrarEntrada.registrarDevolucionesDeEquipo({
        equipoId: dto.equipoId,
        usuarioId: dto.usuarioId,
        motivo: leyenda,
        piezas: this.piezasADevolver(piezas, dto.seriales),
      });
      if (devueltas.isFail()) throw new FalloBajaDeEquipo(this.traducir(devueltas.getError()));
      return devueltas.getValue();
    }

    const items: ItemEnEquipo[] = piezas
      .flatMap((p) =>
        p.unidadId === null
          ? []
          : [
              {
                unidadId: p.unidadId,
                equipoId: dto.equipoId,
                componenteId: p.id,
                insumoId: p.insumoId,
              },
            ],
      )
      .sort((a, b) => a.unidadId.localeCompare(b.unidadId));
    if (items.length > 0) {
      const descartadas = await this.operaciones.descartarInstaladas(items, {
        usuarioId: dto.usuarioId,
        motivo: leyenda,
      });
      if (descartadas.isFail()) throw new FalloBajaDeEquipo(descartadas.getError());
    }
    return new Map();
  }

  private validarDestino(destino: string): DestinoBajaEquipo | null {
    return DESTINOS_BAJA_EQUIPO.find((d) => d === destino) ?? null;
  }

  /**
   * Valida categoría, texto y largo, y compone la leyenda. `OTRA` exige texto; el texto debe caber
   * en el espacio que deja el nombre (ADR-4): se valida, no se trunca.
   */
  private validarMotivo(
    nombre: string,
    categoria: CategoriaBajaEquipo,
    motivo: string | null | undefined,
  ): Result<string, MotivoBajaEquipoInvalidoError> {
    const texto = motivo?.trim() ?? '';
    if (categoria === 'OTRA' && texto === '') {
      return Result.fail(new MotivoBajaEquipoInvalidoError());
    }
    const largoMaximo = largoMaximoTextoBaja(nombre, categoria);
    if (texto.length > largoMaximo) {
      return Result.fail(new MotivoBajaEquipoInvalidoError(largoMaximo));
    }
    return Result.ok(componerLeyendaBaja(nombre, categoria, texto));
  }

  /** Piezas en la forma que pide stock: el serial informado solo cuenta para un legado (sin unidad). */
  private piezasADevolver(
    componentes: readonly ComponenteEquipoEntity[],
    seriales: readonly SerialDeComponenteDeBaja[] | undefined,
  ): PiezaDeEquipoADevolver[] {
    const porComponente = new Map((seriales ?? []).map((s) => [s.componenteId, s.numeroSerie]));
    return componentes.map((c) => ({
      componenteId: c.id,
      insumoId: c.insumoId,
      unidadId: c.unidadId,
      numeroSerie: c.unidadId === null ? (porComponente.get(c.id) ?? null) : null,
    }));
  }

  /** El error de devolución de insumos pasa a ser el de la baja; el resto se informa tal cual. */
  private traducir(error: DomainError): DomainError {
    if (error instanceof DevolucionConPiezasProblematicasError) {
      return new BajaEquipoConPiezasProblematicasError(error.piezas.map((p) => ({ ...p })));
    }
    return error;
  }
}

function mismoConjunto(
  previas: readonly ComponenteEquipoEntity[],
  actuales: readonly ComponenteEquipoEntity[],
): boolean {
  if (previas.length !== actuales.length) return false;
  const ids = new Set(previas.map((c) => c.id));
  return actuales.every((c) => ids.has(c.id));
}
