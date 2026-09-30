/**
 * WU-23 [UNIT] — RED→GREEN: `RegistrarRecepcionDeItemUseCase`.
 *
 * Todos los puertos/colaboradores mockeados (`vi.fn`) — sin DB. Cubre:
 * - S42: recepción parcial (`cantidadRecibida < cantidadOrdenada`) OK.
 * - S43: recibir más de lo ordenado -> `CantidadRecibidaExcedeOrdenadaError`.
 * - S46: retroceder respecto de lo ya registrado -> `CantidadRecibidaRetrocedeError`.
 * - S35: exactamente 1 `OperacionCompra` de tipo `RECEPCION_REGISTRADA` por
 *   mutación exitosa.
 * - Corolario de S35: si la mutación falla, la bitácora queda en 0 llamadas.
 * - 404: compra inexistente / ítem inexistente (id equivocado o soft-deleted).
 * - Compra cancelada: guard de remediación, ANTES de tocar el ítem.
 *
 * `ItemCompraEntity.registrarRecepcion()` ya resuelve la aritmética en
 * centésimas y los guards — este spec verifica que el caso de uso TRADUCE
 * ese `Result`, no que reimplementa la regla.
 *
 * `insumos-entrega-3` (unidades 5-6) agrega el ENGANCHE con la bitácora de
 * existencias, y este spec lo cubre en el mismo archivo porque es una conducta
 * más del mismo caso de uso:
 * - el ítem sin insumo se recibe igual y no emite movimiento (decisión 6);
 * - el delta se calcula contra el acumulado ANTERIOR (decisión 4);
 * - el delta cero no emite nada, que es la idempotencia del reenvío;
 * - si la entrada falla, la recepción entera se revierte (decisión 3).
 *
 * **El rollback REAL no se prueba acá, y no puede probarse acá**: quien
 * revierte es Postgres ante una excepción, y un `txRunner` de mentira comitea
 * igual. Este spec verifica el mecanismo observable en memoria —que el
 * callback de la transacción RECHACE en vez de resolver, y que el error del
 * dominio llegue de vuelta como `Result.fail`—; la prueba contra la base está
 * en `registrar-recepcion-de-item.rollback.integration.spec.ts`.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R1, R2 (S42, S43, S46).
 * Ref design: openspec/changes/insumos-entrega-3/design.md, decisiones 3, 4 y 6.
 */
import {
  RegistrarRecepcionDeItemUseCase,
  RegistrarRecepcionDeItemDto,
} from './registrar-recepcion-de-item.use-case';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  CantidadRecibidaExcedeOrdenadaError,
  CantidadRecibidaRetrocedeError,
} from '../../domain/errors/compras.errors';
import { Result } from '../../../shared/domain/result';
import { MovimientoInsumoEntity } from '../../../insumos/domain/entities/movimiento-insumo.entity';
import { RegistrarEntradaInsumoDto } from '../../../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import { InsumoNoEncontradoError } from '../../../insumos/domain/errors/insumos.errors';

const INSUMO_ID = 'insumo-uuid';

function compraBase(): CompraEntity {
  return CompraEntity.create(
    {
      numero: 'COM-2026-00001',
      fechaSolicitud: new Date('2026-08-01'),
      motivo: 'Compra de insumos',
      descripcion: null,
      solicitanteId: 'solicitante-uuid',
      cicloId: 'ciclo-uuid',
    },
    'compra-uuid',
  );
}

/**
 * Compra con un único ítem APROBADO con `cantidadOrdenada` ya registrada
 * (default 10 pedidas, 8 ordenadas). `insumoId` en `null` por defecto: es el
 * ítem histórico de texto libre, que sigue siendo la mayoría.
 */
function compraConItemOrdenado(
  cantidad = 10,
  cantidadOrdenada = 8,
  insumoId: string | null = null,
): { compra: CompraEntity; item: ItemCompraEntity } {
  const compra = compraBase();
  compra.agregarItem({
    descripcion: 'Resma de papel A4',
    insumoId,
    cantidad,
    proveedor: 'Proveedor SA',
    monto: 1500,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-08-01'),
    observaciones: null,
  });
  const item = compra.items[0];
  item.aprobar('aprobador-uuid');
  item.registrarOrden(cantidadOrdenada, new Date('2026-08-02'));
  return { compra, item };
}

function baseDto(
  compra: CompraEntity,
  item: ItemCompraEntity,
  overrides: Partial<RegistrarRecepcionDeItemDto> = {},
): RegistrarRecepcionDeItemDto {
  return {
    compraId: compra.id,
    itemId: item.id,
    usuarioId: 'usuario-uuid',
    cantidadRecibida: 4,
    fecha: new Date('2026-08-03'),
    ...overrides,
  };
}

describe('RegistrarRecepcionDeItemUseCase', () => {
  function makeCollaborators(
    compra: CompraEntity | null,
    entradaFalla: InsumoNoEncontradoError | null = null,
  ) {
    const compraRepo = {
      findByIdConItems: vi.fn().mockResolvedValue(compra),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };

    // Colaborador CARGADO, no inerte: por defecto asienta un movimiento real
    // construido con el DTO que recibe. Sin esa capacidad, cada assert de "no
    // emitió movimiento" pasaría por construcción. Cuando `entradaFalla` viene
    // con un error, devuelve el `Result.fail` que el caso de uso real
    // devolvería — nunca lanza: la trampa de la unidad es justamente que este
    // colaborador NO lanza.
    const registrarEntradaInsumo = {
      execute: vi.fn(async (dto: RegistrarEntradaInsumoDto) => {
        if (entradaFalla !== null) {
          return Result.fail(entradaFalla);
        }
        return MovimientoInsumoEntity.create({
          insumoId: dto.insumoId,
          tipo: 'ENTRADA',
          condicion: 'NUEVO',
          cantidad: dto.cantidad,
          usuarioId: dto.usuarioId,
          motivo: dto.motivo,
          itemCompraId: dto.itemCompraId,
        });
      }),
    };

    // Emula la semántica de Postgres: la transacción solo "comitea" si el
    // callback RESUELVE. Un callback que rechaza deja `comiteado` en `false`,
    // que es lo que distingue el mecanismo de la decisión 3 de un
    // `Result.fail` propagado en silencio.
    const estadoTx = { comiteado: false };
    const txRunner = {
      run: vi.fn(async (fn: () => Promise<unknown>) => {
        const valor = await fn();
        estadoTx.comiteado = true;
        return valor;
      }),
    };

    const useCase = new RegistrarRecepcionDeItemUseCase(
      compraRepo as never,
      registrarOperacion as never,
      txRunner as never,
      registrarEntradaInsumo as never,
    );

    return {
      useCase,
      compraRepo,
      registrarOperacion,
      txRunner,
      registrarEntradaInsumo,
      estadoTx,
    };
  }

  it('S42: registra una recepción parcial — cantidadRecibida < cantidadOrdenada', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

    expect(result.isOk()).toBe(true);
    const itemResultado = result.getValue();
    expect(itemResultado.cantidadRecibida).toBe(4);
    expect(itemResultado.comprado).toBe(false);
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(itemResultado);
  });

  it('S43: recibir más de lo ordenado -> CantidadRecibidaExcedeOrdenadaError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 9 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadRecibidaExcedeOrdenadaError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S46: retroceder respecto de lo ya registrado -> CantidadRecibidaRetrocedeError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    item.registrarRecepcion(5, new Date('2026-08-03'));
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 3 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadRecibidaRetrocedeError);
    expect(item.cantidadRecibida).toBe(5);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo RECEPCION_REGISTRADA por mutación exitosa', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(compra);

    await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    const operacion = c.registrarOperacion.registrar.mock.calls[0][0];
    expect(operacion.tipo).toBe('RECEPCION_REGISTRADA');
    expect(operacion.compraId).toBe(compra.id);
    expect(operacion.itemCompraId).toBe(item.id);
  });

  it('compra inexistente -> CompraNoEncontradaError, sin tocar bitácora', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(null);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('ítem inexistente (id equivocado) -> ItemCompraNoEncontradoError', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(
      baseDto(compra, item, { itemId: 'item-inexistente', cantidadRecibida: 4 }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
  });

  it('compra cancelada -> CompraCanceladaError, sin mutar el ítem, sin persistir y sin abrir la tx', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    // Con cantidadOrdenada > 0, cancelar realmente fallaría por R13 — se
    // simula el estado persistido vía reconstitute para probar el guard de
    // esta capa de aplicación, mismo criterio que RegistrarEntregaDeItemUseCase.
    const compraCancelada = CompraEntity.reconstitute(
      {
        numero: compra.numero,
        fechaSolicitud: compra.fechaSolicitud,
        motivo: compra.motivo,
        descripcion: null,
        solicitanteId: compra.solicitanteId,
        cicloId: compra.cicloId,
        canceladaEn: new Date('2026-08-05'),
        canceladoPorId: 'usuario-cancelador',
        motivoCancelacion: 'Ya no se necesita',
      },
      [item],
      compra.id,
      compra.createdAt,
      compra.createdAt,
      null,
    );
    const c = makeCollaborators(compraCancelada);

    const result = await c.useCase.execute(baseDto(compraCancelada, item, { cantidadRecibida: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
    expect(item.cantidadRecibida).toBe(0);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  describe('enganche con la bitácora de existencias (insumos-entrega-3)', () => {
    it('ítem SIN insumo declarado: la recepción funciona igual y no emite ningún movimiento', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, null);
      const c = makeCollaborators(compra);

      const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

      expect(result.isOk()).toBe(true);
      expect(item.cantidadRecibida).toBe(4);
      expect(c.registrarEntradaInsumo.execute).not.toHaveBeenCalled();
    });

    it('ítem CON insumo declarado: asienta una ENTRADA por el delta, con el usuario y el ítem que la originaron', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      const c = makeCollaborators(compra);

      const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

      expect(result.isOk()).toBe(true);
      expect(c.registrarEntradaInsumo.execute).toHaveBeenCalledTimes(1);
      expect(c.registrarEntradaInsumo.execute).toHaveBeenCalledWith({
        insumoId: INSUMO_ID,
        cantidad: 4,
        usuarioId: 'usuario-uuid',
        itemCompraId: item.id,
      });
    });

    // El `itemCompraId` es lo que exime al insumo deshabilitado del guard de
    // habilitado (decisión 1): el permiso se deriva del ORIGEN, no de un
    // booleano. Si el enganche dejara de mandarlo, la recepción de un insumo
    // dado de baja mientras la orden estaba en curso empezaría a rebotar.
    it('la entrada declara el ítem de compra como origen, que es lo que exime del guard de habilitado', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      const c = makeCollaborators(compra);

      await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

      const dtoEntrada = c.registrarEntradaInsumo.execute.mock
        .calls[0][0] as RegistrarEntradaInsumoDto;
      expect(dtoEntrada.itemCompraId).toBe(item.id);
    });

    // Decisión de esta unidad: la entrada automática NO lleva motivo. El
    // origen ya está dicho en `itemCompraId`, que es dato estructurado; una
    // frase que lo repita es la MISMA trazabilidad escrita dos veces, y dos
    // copias del mismo hecho se contradicen en cuanto una cambia.
    it('la entrada automática NO lleva motivo: el origen ya lo dice el itemCompraId', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      const c = makeCollaborators(compra);

      await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

      const dtoEntrada = c.registrarEntradaInsumo.execute.mock
        .calls[0][0] as RegistrarEntradaInsumoDto;
      expect(dtoEntrada.motivo ?? null).toBeNull();
    });

    // Decisión 4: `cantidadRecibida` es el ACUMULADO. Si el delta se calculara
    // después de mutar la entidad, o contra el acumulado nuevo, acá se
    // emitirían 7 y el stock quedaría inflado en 4.
    it('el delta se mide contra el acumulado ANTERIOR, no contra el acumulado nuevo', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      item.registrarRecepcion(4, new Date('2026-08-03'));
      const c = makeCollaborators(compra);

      await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 7 }));

      const dtoEntrada = c.registrarEntradaInsumo.execute.mock
        .calls[0][0] as RegistrarEntradaInsumoDto;
      expect(dtoEntrada.cantidad).toBe(3);
    });

    // La resta directa de dos floats da 2.9000000000000004, que la entidad del
    // movimiento rechaza por escala (la columna admite 2 decimales). El delta
    // se calcula en centésimas por eso, no por prolijidad.
    it('el delta decimal no arrastra el error del punto flotante', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      item.registrarRecepcion(1.2, new Date('2026-08-03'));
      const c = makeCollaborators(compra);

      const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4.1 }));

      expect(result.isOk()).toBe(true);
      const dtoEntrada = c.registrarEntradaInsumo.execute.mock
        .calls[0][0] as RegistrarEntradaInsumoDto;
      expect(dtoEntrada.cantidad).toBe(2.9);
    });

    // Idempotencia sin mecanismo extra (decisión 4): `registrarRecepcion`
    // acepta el mismo acumulado sin error, así que el reintento produce delta
    // cero. Un asiento de cero no mueve nada, ensucia la bitácora y la entidad
    // del movimiento lo rechaza de todos modos.
    it('reenviar el mismo acumulado NO emite ningún movimiento (delta cero)', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      item.registrarRecepcion(4, new Date('2026-08-03'));
      const c = makeCollaborators(compra);

      const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

      expect(result.isOk()).toBe(true);
      expect(c.registrarEntradaInsumo.execute).not.toHaveBeenCalled();
    });

    // Hermano invertido del anterior: sobre el MISMO fixture con recepción
    // previa, un acumulado mayor sí emite. Sin este caso, un enganche que no
    // emitiera nunca dejaría el test de arriba en verde.
    it('reenviar un acumulado MAYOR sí emite, por la diferencia', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      item.registrarRecepcion(4, new Date('2026-08-03'));
      const c = makeCollaborators(compra);

      await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4.5 }));

      expect(c.registrarEntradaInsumo.execute).toHaveBeenCalledTimes(1);
      const dtoEntrada = c.registrarEntradaInsumo.execute.mock
        .calls[0][0] as RegistrarEntradaInsumoDto;
      expect(dtoEntrada.cantidad).toBe(0.5);
    });

    // LA TRAMPA (decisión 3). `RegistrarEntradaInsumoUseCase` devuelve
    // `Result`, no lanza, y `$transaction` de Prisma solo revierte ante una
    // excepción: propagar ese `Result.fail` sin lanzar dejaría la recepción
    // comiteada SIN el movimiento de stock. Acá se observa el mecanismo en
    // memoria; el rollback real es el spec de integración.
    it('si la entrada de stock falla, el callback de la transacción RECHAZA en vez de resolver', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      const c = makeCollaborators(compra, new InsumoNoEncontradoError(INSUMO_ID));

      await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

      expect(c.txRunner.run).toHaveBeenCalledTimes(1);
      expect(c.estadoTx.comiteado).toBe(false);
    });

    // Hermano invertido: con la entrada exitosa el mismo callback resuelve, y
    // la transacción comitea. Sin este caso, un enganche que rechazara siempre
    // dejaría el test de arriba en verde.
    it('con la entrada exitosa, el callback resuelve y la transacción comitea', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      const c = makeCollaborators(compra);

      await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

      expect(c.estadoTx.comiteado).toBe(true);
    });

    // La excepción es de uso INTERNO: sirve para hacer rechazar la
    // transacción, no para cambiarle la firma al caso de uso. Afuera del
    // `run()` vuelve a ser el `Result.fail` que la firma promete, con el error
    // ORIGINAL del dominio de insumos — no uno traducido ni envuelto.
    it('el error de la entrada vuelve como Result.fail con el DomainError original', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      const errorOriginal = new InsumoNoEncontradoError(INSUMO_ID);
      const c = makeCollaborators(compra, errorOriginal);

      const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBe(errorOriginal);
      expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    });

    // Hermano invertido del anterior por el otro lado: el `catch` desenvuelve
    // SOLO el fallo de negocio de la entrada. Un fallo de infraestructura —la
    // base caída, o la bitácora de compras rompiéndose (S36)— tiene que seguir
    // propagando: convertirlo en `Result.fail` lo disfrazaría de desviación de
    // negocio y el borde lo contestaría con un 4xx en vez de un 500.
    it('un error que NO es de la entrada de stock sigue propagando como excepción', async () => {
      const { compra, item } = compraConItemOrdenado(10, 8, INSUMO_ID);
      const c = makeCollaborators(compra);
      const fallaDeInfraestructura = new Error('Fallo simulado al escribir la bitácora');
      c.registrarOperacion.registrar.mockRejectedValue(fallaDeInfraestructura);

      await expect(
        c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 })),
      ).rejects.toThrow(fallaDeInfraestructura);
    });
  });
});
