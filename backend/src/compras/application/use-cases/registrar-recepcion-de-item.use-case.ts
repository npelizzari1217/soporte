import { DomainError, Result } from '../../../shared/domain/result';
import { enCentesimas } from '../../../shared/domain/centesimas';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import { RegistrarEntradaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';

/**
 * Excepción de uso INTERNO de este archivo: envuelve el `DomainError` de una
 * entrada de stock fallida para que viaje como EXCEPCIÓN dentro de la
 * transacción y vuelva a ser `Result.fail` afuera.
 *
 * **Existe porque `$transaction` de Prisma solo revierte ante una excepción**
 * (decisión 3 del diseño de la Entrega 3, y el mismo mecanismo que S36
 * documenta en `RegistrarOperacionCompra`). `RegistrarEntradaInsumoUseCase`
 * devuelve `Result` y no lanza: propagar ese `Result.fail` desde adentro del
 * `run()` haría que Postgres comitee la recepción SIN el movimiento de stock,
 * que es la pérdida silenciosa que el diseño descartó explícitamente.
 *
 * No es un `DomainError` y no sale de este módulo: el caso de uso la
 * desenvuelve en su `catch` y devuelve el error original, así que su firma
 * sigue prometiendo lo mismo que antes. Un error del catálogo de insumos
 * traducido a uno de compras le mentiría al borde sobre qué salió mal.
 */
class FalloEntradaDeStock extends Error {
  constructor(readonly errorDeDominio: DomainError) {
    super(`La entrada de stock de la recepción falló: ${errorDeDominio.message}`);
    this.name = 'FalloEntradaDeStock';
  }
}

/**
 * DTO de entrada de `RegistrarRecepcionDeItemUseCase`. `cantidadRecibida` es
 * el ACUMULADO total, no un delta (spec R1/§4.5) —
 * `ItemCompraEntity.registrarRecepcion()` es quien interpreta ese contrato.
 * `fecha` es opcional (R4/S51): sin ella, la entidad prellena con hoy
 * (Argentina).
 *
 * **Renombrado** (WU-23, `compras-tres-etapas-y-sectores`): reemplaza a
 * `RegistrarCompraDeItemDto`/`RegistrarCompraDeItemUseCase`. "Recibida" es
 * la segunda de las TRES etapas — antes era la primera ("comprada").
 */
export interface RegistrarRecepcionDeItemDto {
  compraId: string;
  itemId: string;
  /** Actor que registra el avance (`JWT.sub`) — autor de la operación de bitácora. */
  usuarioId: string;
  cantidadRecibida: number;
  fecha?: Date;
  /**
   * Seriales de las piezas que entran en ESTA recepción (un insumo `SERIE`).
   * Como mucho tantos como el delta: las piezas sin serial quedan con serie
   * pendiente (ADR-6). Con un insumo `NINGUNO` la entrada los rechaza.
   */
  seriales?: readonly string[];
}

/**
 * RegistrarRecepcionDeItemUseCase — registra el acumulado de cantidad
 * recibida de un ítem con orden emitida (R1/R2, S42-S44, S46).
 *
 * Flujo idéntico al resto de las etapas (ver
 * `RegistrarOrdenDeItemUseCase`/`RegistrarEntregaDeItemUseCase`): carga el
 * agregado, guard de compra cancelada ANTES de la transacción, busca el
 * ítem activo, delega en `ItemCompraEntity.registrarRecepcion()` (que YA
 * resuelve terminalidad/aprobado/exceso/retroceso/fecha — este caso de uso
 * NO reimplementa esa lógica), y si es exitosa persiste + registra
 * `OperacionCompra{RECEPCION_REGISTRADA}` (S35) dentro de la misma
 * transacción.
 *
 * ## Recibir la compra suma el stock (insumos-entrega-3, unidades 5 y 6)
 *
 * Cuando el ítem declara un `insumoId`, la recepción asienta además una
 * ENTRADA en la bitácora de existencias, DENTRO de la misma transacción: la
 * recepción y el movimiento de stock son el mismo hecho, y comitear uno sin el
 * otro deja el depósito describiendo algo que no pasó.
 *
 * Tres reglas gobiernan el enganche, y las tres tienen su porqué:
 *
 * 1. **Se emite por DELTA, no por el acumulado.** `cantidadRecibida` es el
 *    total recibido hasta el momento, y `registrarRecepcion()` acepta que se
 *    reenvíe el mismo número sin error. Emitir la diferencia contra el
 *    acumulado ANTERIOR es lo que da idempotencia sin ningún mecanismo extra:
 *    un reintento produce delta cero. El valor viejo se captura ANTES de
 *    mutar la entidad — después de esa línea ya se perdió.
 * 2. **El delta cero no emite nada.** Un asiento de cero no mueve stock,
 *    ensucia una bitácora que se lee fila por fila, y la entidad del
 *    movimiento lo rechaza de todos modos.
 * 3. **El fallo de la entrada se LANZA dentro del `run()`** y se convierte de
 *    vuelta a `Result.fail` afuera. Ver `FalloEntradaDeStock` para el porqué
 *    completo; en una línea: `$transaction` solo revierte ante una excepción.
 *    Vale en especial para un serial duplicado de un insumo `SERIE`: si el
 *    `P2002` ocurre dentro de la transacción, Postgres la deja abortada y solo
 *    el rechazo del `run()` la cierra con rollback.
 *
 * ## Insumos `SERIE` (repuestos-numero-de-serie, ADR-11)
 *
 * La recepción sigue subiendo el stock por delta; `dto.seriales` viaja a la
 * entrada junto con `completarConPendientes: true`. La entrada valida que el
 * delta sea entero (`CantidadNoEnteraError`) y que los seriales no superen el
 * delta (`SerialesNoCoincidenError`); cualquiera de los dos rechaza TODA la
 * recepción, y el delta cero no crea ninguna unidad.
 *
 * El ítem SIN insumo —el histórico de texto libre, que es la mayoría— se
 * recibe exactamente como antes: no hay a qué insumo imputarle nada. Y un
 * insumo DESHABILITADO no bloquea la recepción: el permiso se lo da el
 * `itemCompraId` que este caso de uso declara como origen (decisión 1 del
 * diseño; ver el JSDoc de `RegistrarEntradaInsumoUseCase`).
 *
 * La dependencia va `compras → insumos` y nunca al revés: `insumos` no importa
 * nada de `compras`, porque esa arista cerraría un ciclo entre los dos.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R1, R2, R4 (S42-S44,
 * S46, S51). Ref design: ADR-T1, ADR-T11; y
 * openspec/changes/insumos-entrega-3/design.md, decisiones 1, 3, 4 y 6.
 */
export class RegistrarRecepcionDeItemUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'>,
    private readonly registrarOperacion: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly registrarEntradaInsumo: Pick<RegistrarEntradaInsumoUseCase, 'execute'>,
  ) {}

  async execute(dto: RegistrarRecepcionDeItemDto): Promise<Result<ItemCompraEntity, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    if (compra.canceladaEn !== null) {
      return Result.fail(new CompraCanceladaError(compra.id));
    }

    const item = compra.items.find((i) => i.id === dto.itemId && !i.isDeleted());
    if (!item) {
      return Result.fail(new ItemCompraNoEncontradoError(dto.itemId));
    }

    // El acumulado ANTERIOR, capturado antes de que `registrarRecepcion()`
    // pise la propiedad. Después de la línea de abajo, este número ya no
    // existe en ningún lado y el delta no se puede reconstruir.
    const acumuladoPrevioEnCentesimas = enCentesimas(item.cantidadRecibida);

    const registrarResult =
      dto.fecha !== undefined
        ? item.registrarRecepcion(dto.cantidadRecibida, dto.fecha)
        : item.registrarRecepcion(dto.cantidadRecibida);
    if (registrarResult.isFail()) {
      return Result.fail(registrarResult.getError());
    }

    // En centésimas, no restando los dos floats: `4.1 - 1.2` da
    // `2.9000000000000004` en IEEE-754, y la entidad del movimiento rechaza
    // esa cantidad por escala (la columna admite dos decimales). Como
    // `registrarRecepcion()` ya rechazó el retroceso, el delta nunca es
    // negativo.
    const deltaEnCentesimas = enCentesimas(item.cantidadRecibida) - acumuladoPrevioEnCentesimas;
    const insumoId = item.insumoId;

    try {
      await this.txRunner.run(async () => {
        await this.compraRepo.guardarItem(item);
        await this.registrarOperacion.registrar({
          compraId: compra.id,
          itemCompraId: item.id,
          tipo: 'RECEPCION_REGISTRADA',
          usuarioId: dto.usuarioId,
          detalle: `Recepción registrada para el ítem "${item.descripcion}": acumulado ${dto.cantidadRecibida}.`,
          datos: null,
        });

        // Sin insumo declarado no hay a qué imputar la entrada, y con delta
        // cero no hay nada que asentar: el reenvío del mismo acumulado tiene
        // que ser inocuo, no emitir un asiento vacío.
        if (insumoId === null || deltaEnCentesimas === 0) {
          return;
        }

        const entrada = await this.registrarEntradaInsumo.execute({
          insumoId,
          cantidad: deltaEnCentesimas / 100,
          usuarioId: dto.usuarioId,
          // Lo que se compra entra siempre como NUEVO: un usado solo nace de
          // retirar una pieza de un equipo, nunca de una recepción.
          condicion: 'NUEVO',
          // El origen es lo que da la trazabilidad Y lo que exime al insumo
          // deshabilitado del guard de habilitado. Va sin `motivo`: una frase
          // que repita "vino de tal compra" sería el mismo hecho escrito dos
          // veces, y una de las dos copias envejece mal.
          itemCompraId: item.id,
          // Con un insumo `SERIE` la entrada crea una unidad por pieza del
          // delta y completa con serie pendiente las que no traen serial: la
          // recepción queda completa igual (ADR-6). Con `NINGUNO` la opción
          // no hace nada. Sin `seriales` no se manda la clave: `[]` ya es un
          // dato y un insumo `NINGUNO` lo rechazaría.
          completarConPendientes: true,
          ...(dto.seriales !== undefined && { seriales: dto.seriales }),
        });

        if (entrada.isFail()) {
          // LANZAR, no propagar el `Result.fail`: es lo único que hace que
          // Postgres revierta también la recepción y su bitácora.
          throw new FalloEntradaDeStock(entrada.getError());
        }
      });
    } catch (error) {
      // Solo se desenvuelve el fallo de negocio de la entrada. Cualquier otra
      // excepción —la base caída, un fallo de la bitácora (S36)— sigue
      // propagando: convertirla en `Result.fail` acá la disfrazaría de
      // desviación de negocio y el borde la contestaría con un 4xx.
      //
      // La entidad en memoria conserva el acumulado que la base revirtió, y no
      // se deshace a mano: se devuelve `Result.fail`, así que el caller
      // descarta el objeto, y la próxima invocación lo relee del repositorio.
      // Mismo criterio que el resto de los mutadores del módulo.
      if (error instanceof FalloEntradaDeStock) {
        return Result.fail(error.errorDeDominio);
      }
      throw error;
    }

    return Result.ok(item);
  }
}
