import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { RegistrarSalidaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-salida-insumo.use-case';
import { OperacionesUnidadInsumo } from '../../../insumos/application/services/operaciones-unidad-insumo.service';
import { CondicionStock } from '../../../insumos/domain/entities/tipo-movimiento-insumo';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';

/**
 * Excepción de uso INTERNO de este archivo: envuelve el `DomainError` de una
 * salida de stock fallida para que viaje como EXCEPCIÓN dentro de la
 * transacción y vuelva a ser `Result.fail` afuera.
 *
 * **Existe porque `$transaction` de Prisma solo revierte ante una excepción**
 * — el mismo mecanismo que documenta `FalloEntradaDeStock` en
 * `RegistrarRecepcionDeItemUseCase` (compras) y que S36 fija como contrato
 * (`registrar-operacion-compra.s36.integration.spec.ts`).
 * `RegistrarSalidaInsumoUseCase` devuelve `Result` y no lanza: propagar ese
 * `Result.fail` desde adentro del `run()` haría que Postgres comitee el
 * componente SIN la salida de stock, que es exactamente la pérdida silenciosa
 * que este work unit existe para cerrar (issue #153).
 *
 * No es un `DomainError` y no sale de este módulo: el caso de uso la
 * desenvuelve en su `catch` y devuelve el error original, así que su firma
 * sigue prometiendo lo mismo que antes.
 */
class FalloSalidaDeStock extends Error {
  constructor(readonly errorDeDominio: DomainError) {
    super(`La salida de stock de la instalación falló: ${errorDeDominio.message}`);
    this.name = 'FalloSalidaDeStock';
  }
}

/**
 * DTO de entrada de `InstalarComponenteDesdeDepositoUseCase`.
 *
 * Sin `tipoComponenteCodigo`: a diferencia de `AgregarComponenteDto`, este
 * flujo SIEMPRE vincula un repuesto del catálogo — `insumoId` es obligatorio,
 * nunca el camino de texto libre — así que el tipo del componente SIEMPRE se
 * deriva de la familia del repuesto (mismas reglas del WU-3, reusadas vía
 * `AgregarComponenteUseCase`, nunca duplicadas).
 *
 * Sin ningún campo de cantidad (issue #153, "NO entra"): un `ComponenteEquipo`
 * es siempre UNA unidad física — instalar dos memorias son dos componentes,
 * dos llamadas a este caso de uso.
 */
export interface InstalarComponenteDesdeDepositoDto {
  equipoId: string;
  /** Repuesto del catálogo a instalar. Obligatorio — este flujo no tiene camino de texto libre. */
  insumoId: string;
  /** Quién instala el repuesto. Lo pone el borde desde el usuario autenticado (`JWT.sub`), nunca el body. */
  usuarioId: string;
  descripcion?: string | null;
  /** Ignorado con `unidadId`: el serial es el de la unidad (ADR-7). */
  numeroSerie?: string | null;
  capacidad?: string | null;
  /**
   * Unidad `SERIE` elegida (con serial, `EN_DEPOSITO`, del mismo insumo). Con ella la
   * instalación va por `OperacionesUnidadInsumo.instalar`; sin ella, el camino de
   * siempre, que para un insumo `SERIE` termina en `UnidadRequeridaError`.
   */
  unidadId?: string | null;
  /**
   * Condición del saldo del que sale la unidad. Omitida = `NUEVO`; la decide
   * y valida `RegistrarSalidaInsumoUseCase` (saldo de esa condición, ADR-6).
   */
  condicion?: CondicionStock;
}

/**
 * InstalarComponenteDesdeDepositoUseCase — WU-4 (sdd/repuestos-instalar-desde-deposito,
 * issue #153): en UNA sola transacción, registra la SALIDA del repuesto del
 * depósito y crea el componente vinculado en el equipo. O pasan las dos
 * cosas, o no pasa ninguna.
 *
 * ## Por qué vive en EQUIPOS y no en INSUMOS
 *
 * Mismo criterio que `RegistrarRecepcionDeItemUseCase` en COMPRAS: el módulo
 * cuyo endpoint dispara la acción es dueño de la compuerta, no el módulo cuya
 * tabla de stock se escribe. Este caso de uso vive en EQUIPOS, produce un
 * componente nuevo, y se gatea con `EQUIPOS:ALTAS` — la consecuencia asumida
 * a conciencia (documentada en el issue) es que alguien con `EQUIPOS:ALTAS` y
 * sin ningún permiso de INSUMOS puede descontar stock, exactamente como ya
 * pasa hoy con `COMPRAS:MODIFICACION` sobre `RegistrarEntradaInsumoUseCase`.
 *
 * ## Mecanismo de atomicidad (S36)
 *
 * El componente se crea PRIMERO (reusando `AgregarComponenteUseCase.execute()`
 * completo — equipo existe, insumo elegible y familia `esRepuesto`+activa —
 * nada de eso se duplica acá) y la salida
 * se intenta SEGUNDO, dentro del mismo `txRunner.run()`: si la salida falla
 * (stock insuficiente, `StockInsuficienteError`), se LANZA `FalloSalidaDeStock`
 * para que Postgres revierta TAMBIÉN el componente recién creado — igual
 * orden y mismo mecanismo que `RegistrarRecepcionDeItemUseCase` (compras: la
 * recepción se persiste primero, la entrada de stock se intenta después).
 *
 * `RegistrarSalidaInsumoUseCase.execute()` abre SU PROPIO `txRunner.run()`
 * para tomar el `pg_advisory_xact_lock` — pero `ITenantTransactionRunner.run()`
 * es RE-ENTRANTE (ver `PrismaTenantTransactionRunner`): al estar ya dentro de
 * la transacción abierta acá, ese `run()` anidado detecta `enTransaccion` y
 * simplemente ejecuta el callback en la MISMA transacción, así que el lock se
 * toma dentro de la transacción única que este caso de uso abrió. No hace
 * falta ningún plumbing extra para que las dos escrituras compartan
 * atomicidad.
 *
 * ## Con unidad (sdd/repuestos-numero-de-serie, ADR-7)
 *
 * Con `unidadId` el orden cambia por la invariante de locks L (ADR-12): el
 * componente (L4) se guarda DESPUÉS de `OperacionesUnidadInsumo.instalar` (L1 a
 * L3). Ver `instalarUnidad()`. Un insumo `SERIE` sin `unidadId` sigue el camino
 * de arriba y la SALIDA lo rechaza con `UnidadRequeridaError`, que revierte el
 * componente recién creado.
 *
 * La cantidad de la salida es SIEMPRE 1 (issue #153, "NO entra: ninguna
 * noción de cantidad"): un componente es una unidad física.
 *
 * Ref: sdd/repuestos-instalar-desde-deposito (WU-4). Ref precedente:
 * `compras/application/use-cases/registrar-recepcion-de-item.use-case.ts`.
 */
export class InstalarComponenteDesdeDepositoUseCase {
  constructor(
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly agregarComponenteUseCase: Pick<
      AgregarComponenteUseCase,
      'execute' | 'preparar'
    >,
    private readonly registrarSalidaInsumoUseCase: Pick<RegistrarSalidaInsumoUseCase, 'execute'>,
    private readonly operaciones: Pick<OperacionesUnidadInsumo, 'instalar'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'save' | 'findById'>,
  ) {}

  async execute(
    dto: InstalarComponenteDesdeDepositoDto,
  ): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    try {
      return await this.txRunner.run(async () => {
        if (dto.unidadId) {
          return await this.instalarUnidad(dto, dto.unidadId);
        }

        const componenteResult = await this.agregarComponenteUseCase.execute({
          equipoId: dto.equipoId,
          insumoId: dto.insumoId,
          descripcion: dto.descripcion ?? null,
          numeroSerie: dto.numeroSerie ?? null,
          capacidad: dto.capacidad ?? null,
        });
        if (componenteResult.isFail()) {
          // Nada se escribió todavía (`AgregarComponenteUseCase` solo
          // persiste al final, tras validar todo) — devolver el `Result.fail`
          // tal cual es seguro, no hace falta lanzar para revertir nada.
          return Result.fail<ComponenteEquipoEntity, DomainError>(componenteResult.getError());
        }
        const componente = componenteResult.getValue();

        const salidaResult = await this.registrarSalidaInsumoUseCase.execute({
          insumoId: dto.insumoId,
          cantidad: 1,
          usuarioId: dto.usuarioId,
          equipoId: dto.equipoId,
          condicion: dto.condicion,
        });
        if (salidaResult.isFail()) {
          // LANZAR, no propagar el `Result.fail`: es lo único que hace que
          // Postgres revierta también el componente recién creado arriba.
          throw new FalloSalidaDeStock(salidaResult.getError());
        }

        // ADR-4: el componente guarda la SALIDA que respaldó su instalación,
        // en la misma transacción. Es lo que permite saber, al retirarlo, si
        // la unidad salió del depósito (`bajaSinSalidaPrevia`).
        componente.vincularInstalacion(salidaResult.getValue().id);
        await this.componenteRepo.save(componente);

        return Result.ok<ComponenteEquipoEntity, DomainError>(componente);
      });
    } catch (error) {
      // Solo se desenvuelve el fallo de negocio de la salida. Cualquier otra
      // excepción —la base caída, un fallo real de persistencia— sigue
      // propagando: convertirla en `Result.fail` acá la disfrazaría de
      // desviación de negocio y el borde la contestaría con un 4xx.
      if (error instanceof FalloSalidaDeStock) {
        return Result.fail(error.errorDeDominio);
      }
      throw error;
    }
  }

  /**
   * Instalación de una unidad `SERIE` elegida (ADR-7), dentro de la transacción
   * abierta por `execute()` y en este orden, que respeta la invariante L de
   * ADR-12 (locks antes de la primera escritura; el componente es L4 y va último):
   *
   * 1. `preparar()`: valida y construye el componente con `unidadId`, sin escribir.
   * 2. `operaciones.instalar()`: L1, L2 y L3, valida la unidad (en depósito, con
   *    serial, del mismo insumo) y escribe SALIDA, CAS y evento `INSTALACION`.
   *    Un `Result.fail` suyo no escribió nada, así que se devuelve tal cual.
   * 3. `vincularInstalacion()` y un único `save()` del componente (L4).
   *
   * El `usuarioId` firma la SALIDA; `condicion` y `numeroSerie` del DTO se ignoran
   * (la condición y el serial son de la unidad).
   */
  private async instalarUnidad(
    dto: InstalarComponenteDesdeDepositoDto,
    unidadId: string,
  ): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    const preparado = await this.agregarComponenteUseCase.preparar({
      equipoId: dto.equipoId,
      insumoId: dto.insumoId,
      descripcion: dto.descripcion ?? null,
      numeroSerie: null,
      capacidad: dto.capacidad ?? null,
      unidadId,
    });
    if (preparado.isFail()) {
      return Result.fail(preparado.getError());
    }
    const componente = preparado.getValue();

    const instalada = await this.operaciones.instalar(
      [{ unidadId, equipoId: dto.equipoId, componenteId: componente.id, insumoId: dto.insumoId }],
      { usuarioId: dto.usuarioId },
    );
    if (instalada.isFail()) {
      return Result.fail(instalada.getError());
    }

    componente.vincularInstalacion(instalada.getValue()[0].movimiento.id);
    await this.componenteRepo.save(componente);

    // La respuesta lleva el serial resuelto de la unidad: se relee por el mapper,
    // la única fuente (ADR-7), en vez de duplicar la regla acá.
    return Result.ok((await this.componenteRepo.findById(componente.id)) ?? componente);
  }
}
