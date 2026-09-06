import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MovimientosInsumoController } from './movimientos-insumo.controller';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { Result } from '../../../shared/domain/result';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { TipoMovimientoInsumo } from '../../domain/entities/tipo-movimiento-insumo';
import {
  InsumoDeshabilitadoError,
  InsumoNoEncontradoError,
  MotivoAjusteRequeridoError,
  StockInsuficienteError,
} from '../../domain/errors/insumos.errors';
import { RegistrarMovimientoInsumoHttpDto } from '../dtos/movimientos-insumo.dto';

const INSUMO_ID = '11111111-1111-4111-8111-111111111111';
const USUARIO_ID = '22222222-2222-4222-8222-222222222222';
const EQUIPO_ID = '33333333-3333-4333-8333-333333333333';

/** Usuario autenticado tal como lo entrega `@CurrentUser()`. */
function actor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    v: 2,
    sub: USUARIO_ID,
    cliente_id: '44444444-4444-4444-8444-444444444444',
    rol: 'TECNICO',
    permisos: ['INSUMOS:ALTAS'],
    is_global_admin: false,
    cliente_nombre: 'Cliente de prueba',
    membresias: [],
    modulos: ['INSUMOS'],
    nombre: 'Ana',
    apellido: 'Técnica',
    ...overrides,
  };
}

function construirMovimiento(tipo: TipoMovimientoInsumo, cantidad = 2): MovimientoInsumoEntity {
  return MovimientoInsumoEntity.create({
    insumoId: INSUMO_ID,
    tipo,
    cantidad,
    usuarioId: USUARIO_ID,
    motivo: tipo.startsWith('AJUSTE') ? 'Conteo físico' : null,
    equipoId: null,
    sectorId: null,
  }).getValue();
}

type UseCaseDoble = { execute: ReturnType<typeof vi.fn> };

describe('MovimientosInsumoController', () => {
  function buildController(overrides: Partial<Record<string, UseCaseDoble>> = {}): {
    controller: MovimientosInsumoController;
    entradaUseCase: UseCaseDoble;
    salidaUseCase: UseCaseDoble;
    ajusteUseCase: UseCaseDoble;
    stockUseCase: UseCaseDoble;
  } {
    const entradaUseCase = overrides.entrada ?? { execute: vi.fn() };
    const salidaUseCase = overrides.salida ?? { execute: vi.fn() };
    const ajusteUseCase = overrides.ajuste ?? { execute: vi.fn() };
    const stockUseCase = overrides.stock ?? { execute: vi.fn() };

    const controller = new MovimientosInsumoController(
      entradaUseCase as never,
      salidaUseCase as never,
      ajusteUseCase as never,
      stockUseCase as never,
    );
    return { controller, entradaUseCase, salidaUseCase, ajusteUseCase, stockUseCase };
  }

  describe('POST /insumos/:insumoId/movimientos/entrada', () => {
    it('registra la entrada y devuelve el asiento mapeado', async () => {
      const movimiento = construirMovimiento('ENTRADA', 7);
      const { controller, entradaUseCase } = buildController({
        entrada: { execute: vi.fn().mockResolvedValue(Result.ok(movimiento)) },
      });

      const respuesta = await controller.registrarEntrada(actor(), INSUMO_ID, {
        cantidad: 7,
        motivo: 'Recepción de compra',
        equipoId: EQUIPO_ID,
      });

      expect(respuesta.id).toBe(movimiento.id);
      expect(respuesta.tipo).toBe('ENTRADA');
      expect(respuesta.cantidad).toBe(7);
      expect(respuesta.usuarioId).toBe(USUARIO_ID);
      expect(entradaUseCase.execute).toHaveBeenCalledWith({
        insumoId: INSUMO_ID,
        cantidad: 7,
        usuarioId: USUARIO_ID,
        motivo: 'Recepción de compra',
        equipoId: EQUIPO_ID,
        sectorId: null,
      });
    });

    /**
     * El `usuarioId` sale del JWT y NUNCA del body: la bitácora responde "quién
     * lo movió", y aceptarlo del payload dejaría a cualquiera firmando un
     * movimiento con el nombre de otro.
     *
     * El `ValidationPipe` global (`whitelist: true`) ya descarta el campo antes
     * del handler, pero este caso prueba el borde ADEMÁS del pipe: aunque un
     * body con `usuarioId` llegara entero —otra ruta, otro pipe, un test que
     * llama al método directo—, el controller lo ignora.
     */
    it('estampa el usuarioId del JWT e ignora el que venga en el body', async () => {
      const movimiento = construirMovimiento('ENTRADA');
      const { controller, entradaUseCase } = buildController({
        entrada: { execute: vi.fn().mockResolvedValue(Result.ok(movimiento)) },
      });
      const bodySuplantado = {
        cantidad: 2,
        usuarioId: 'usuario-suplantado',
      } as unknown as RegistrarMovimientoInsumoHttpDto;

      await controller.registrarEntrada(actor(), INSUMO_ID, bodySuplantado);

      expect(entradaUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ usuarioId: USUARIO_ID }),
      );
      expect(entradaUseCase.execute).not.toHaveBeenCalledWith(
        expect.objectContaining({ usuarioId: 'usuario-suplantado' }),
      );
    });

    /**
     * El insumo deshabilitado NO es un 404: la fila existe y quien registra la
     * entrada lo ve en su propio catálogo. Mandarle un "no encontrado" lo haría
     * buscar un problema que no está.
     */
    it('con el insumo deshabilitado lanza 422 y no 404, con el mensaje del dominio', async () => {
      const error = new InsumoDeshabilitadoError(INSUMO_ID);
      const { controller } = buildController({
        entrada: { execute: vi.fn().mockResolvedValue(Result.fail(error)) },
      });

      const lanzado = await controller
        .registrarEntrada(actor(), INSUMO_ID, { cantidad: 2 })
        .catch((e: unknown) => e);

      expect(lanzado).toBeInstanceOf(UnprocessableEntityException);
      expect(lanzado).not.toBeInstanceOf(NotFoundException);
      expect((lanzado as UnprocessableEntityException).message).toBe(error.message);
    });

    it('con el insumo inexistente lanza 404: es el recurso de la URL', async () => {
      const error = new InsumoNoEncontradoError(INSUMO_ID);
      const { controller } = buildController({
        entrada: { execute: vi.fn().mockResolvedValue(Result.fail(error)) },
      });

      const lanzado = await controller
        .registrarEntrada(actor(), INSUMO_ID, { cantidad: 2 })
        .catch((e: unknown) => e);

      expect(lanzado).toBeInstanceOf(NotFoundException);
      expect((lanzado as NotFoundException).message).toBe(error.message);
    });
  });

  describe('POST /insumos/:insumoId/movimientos/salida', () => {
    it('registra la salida con el usuarioId del JWT', async () => {
      const movimiento = construirMovimiento('SALIDA', 3);
      const { controller, salidaUseCase } = buildController({
        salida: { execute: vi.fn().mockResolvedValue(Result.ok(movimiento)) },
      });

      const respuesta = await controller.registrarSalida(actor(), INSUMO_ID, { cantidad: 3 });

      expect(respuesta.tipo).toBe('SALIDA');
      expect(salidaUseCase.execute).toHaveBeenCalledWith({
        insumoId: INSUMO_ID,
        cantidad: 3,
        usuarioId: USUARIO_ID,
        motivo: null,
        equipoId: null,
        sectorId: null,
      });
    });

    /**
     * La deuda que esta unidad salda: `STOCK_INSUFICIENTE` no estaba mapeado en
     * ningún lado, y un `DomainError` sin mapeo sale como 500. El assert es del
     * MENSAJE además del tipo, porque el mensaje trae los dos números —lo
     * pedido y lo disponible— y un 422 vacío no le sirve a quien carga.
     */
    it('con stock insuficiente lanza 422 y no 500, con los dos números del dominio', async () => {
      const error = new StockInsuficienteError(INSUMO_ID, 10, 4);
      const { controller } = buildController({
        salida: { execute: vi.fn().mockResolvedValue(Result.fail(error)) },
      });

      const lanzado = await controller
        .registrarSalida(actor(), INSUMO_ID, { cantidad: 10 })
        .catch((e: unknown) => e);

      expect(lanzado).toBeInstanceOf(UnprocessableEntityException);
      expect((lanzado as UnprocessableEntityException).message).toBe(error.message);
      expect((lanzado as UnprocessableEntityException).message).toContain('4 disponibles');
    });
  });

  describe('POST /insumos/:insumoId/movimientos/ajuste', () => {
    it('reenvía la dirección del ajuste que viene en el body', async () => {
      const movimiento = construirMovimiento('AJUSTE_NEGATIVO', 3);
      const { controller, ajusteUseCase } = buildController({
        ajuste: { execute: vi.fn().mockResolvedValue(Result.ok(movimiento)) },
      });

      const respuesta = await controller.registrarAjuste(actor(), INSUMO_ID, {
        tipo: 'AJUSTE_NEGATIVO',
        cantidad: 3,
        motivo: 'Conteo físico',
      });

      expect(respuesta.tipo).toBe('AJUSTE_NEGATIVO');
      expect(ajusteUseCase.execute).toHaveBeenCalledWith({
        insumoId: INSUMO_ID,
        tipo: 'AJUSTE_NEGATIVO',
        cantidad: 3,
        usuarioId: USUARIO_ID,
        motivo: 'Conteo físico',
        equipoId: null,
        sectorId: null,
      });
    });

    /**
     * La otra deuda: `MOTIVO_AJUSTE_REQUERIDO` tampoco estaba mapeado. Es un
     * 422 y no un 400 a propósito — la obligatoriedad depende del `tipo` que
     * venga en el mismo body, así que ningún decorador puede expresarla y la
     * regla vive en el dominio.
     */
    it('con el motivo vacío lanza 422 y no 500, con el tipo exacto en el mensaje', async () => {
      const error = new MotivoAjusteRequeridoError(INSUMO_ID, 'AJUSTE_NEGATIVO');
      const { controller } = buildController({
        ajuste: { execute: vi.fn().mockResolvedValue(Result.fail(error)) },
      });

      const lanzado = await controller
        .registrarAjuste(actor(), INSUMO_ID, { tipo: 'AJUSTE_NEGATIVO', cantidad: 3 })
        .catch((e: unknown) => e);

      expect(lanzado).toBeInstanceOf(UnprocessableEntityException);
      expect((lanzado as UnprocessableEntityException).message).toBe(error.message);
      expect((lanzado as UnprocessableEntityException).message).toContain('AJUSTE_NEGATIVO');
    });

    it('con stock insuficiente en un ajuste negativo lanza 422', async () => {
      const error = new StockInsuficienteError(INSUMO_ID, 10, 1);
      const { controller } = buildController({
        ajuste: { execute: vi.fn().mockResolvedValue(Result.fail(error)) },
      });

      await expect(
        controller.registrarAjuste(actor(), INSUMO_ID, {
          tipo: 'AJUSTE_NEGATIVO',
          cantidad: 10,
          motivo: 'Conteo físico',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('GET /insumos/:insumoId/stock', () => {
    it('devuelve el saldo con su punto de reposición y el estado ya resuelto', async () => {
      const { controller, stockUseCase } = buildController({
        stock: {
          execute: vi.fn().mockResolvedValue(
            Result.ok({
              insumoId: INSUMO_ID,
              stock: 2,
              stockMinimo: 10,
              estadoReposicion: 'BAJO_MINIMO',
            }),
          ),
        },
      });

      const respuesta = await controller.consultarStock(INSUMO_ID);

      expect(respuesta).toEqual({
        insumoId: INSUMO_ID,
        stock: 2,
        stockMinimo: 10,
        estadoReposicion: 'BAJO_MINIMO',
      });
      expect(stockUseCase.execute).toHaveBeenCalledWith(INSUMO_ID);
    });

    it('con el insumo inexistente lanza 404', async () => {
      const error = new InsumoNoEncontradoError(INSUMO_ID);
      const { controller } = buildController({
        stock: { execute: vi.fn().mockResolvedValue(Result.fail(error)) },
      });

      const lanzado = await controller.consultarStock(INSUMO_ID).catch((e: unknown) => e);

      expect(lanzado).toBeInstanceOf(NotFoundException);
      expect((lanzado as NotFoundException).message).toBe(error.message);
    });
  });

  /**
   * Sin este chequeo de metadata, borrar un `@RequiereAcciones` o un
   * `@UseGuards(AccionesGuard)` de cualquier método deja toda la suite en
   * verde: los tests de arriba instancian el controller a mano y los guards
   * nunca corren. Mismo patrón que `insumos.controller.spec.ts`.
   */
  describe('RBAC — metadata de guards, por método, NUNCA a nivel de clase', () => {
    function handlerDe(metodo: string): (...args: unknown[]) => unknown {
      return MovimientosInsumoController.prototype[
        metodo as keyof typeof MovimientosInsumoController.prototype
      ] as unknown as (...args: unknown[]) => unknown;
    }

    /**
     * El mapeo exacto de ruta → celda. La entrada y la salida son la operación
     * cotidiana del técnico (`ALTAS`); el ajuste es la única que puede tapar un
     * faltante y lleva su propia celda (`AJUSTAR`). Si las tres compartieran
     * gate, separar los permisos no serviría de nada.
     */
    it.each([
      ['registrarEntrada', 'INSUMOS:ALTAS'],
      ['registrarSalida', 'INSUMOS:ALTAS'],
      ['registrarAjuste', 'INSUMOS:AJUSTAR'],
      ['consultarStock', 'INSUMOS:LECTURA'],
    ])('%s exige exactamente %s', (metodo, codigo) => {
      const acciones = Reflect.getMetadata(ACCIONES_KEY, handlerDe(metodo)) as unknown;

      expect(acciones).toEqual([codigo]);
    });

    it.each([['registrarEntrada'], ['registrarSalida'], ['registrarAjuste'], ['consultarStock']])(
      '%s declara AccionesGuard en el propio método',
      (metodo) => {
        const guards = (Reflect.getMetadata(GUARDS_METADATA, handlerDe(metodo)) ?? []) as unknown[];

        expect(guards).toContain(AccionesGuard);
      },
    );

    /**
     * El caso hermano invertido: si `AccionesGuard` viviera a NIVEL DE CLASE,
     * los asserts de arriba seguirían en verde —la metadata de clase no aparece
     * en la del método— y el gate quedaría fuera del alcance del handler.
     */
    it('la clase NO declara AccionesGuard', () => {
      const guardsDeClase = (Reflect.getMetadata(GUARDS_METADATA, MovimientosInsumoController) ??
        []) as unknown[];

      expect(guardsDeClase).not.toContain(AccionesGuard);
    });

    /**
     * La red que atrapa la ruta que TODAVÍA NO EXISTE. Los casos de arriba
     * enumeran los cuatro métodos a mano, así que un quinto endpoint agregado
     * sin decorador los dejaría a todos en verde. Este deriva la lista del
     * prototipo, así que un método nuevo sin gate rompe acá el día que se
     * escribe — que es la falla silenciosa que el `AGENTS.md` describe: un gate
     * ausente no da 403, da acceso.
     */
    it('ningún método del controller queda sin celda declarada', () => {
      const metodos = Object.getOwnPropertyNames(MovimientosInsumoController.prototype).filter(
        (nombre) => nombre !== 'constructor',
      );

      expect(metodos).toHaveLength(4);

      const sinGate = metodos.filter((metodo) => {
        const acciones = (Reflect.getMetadata(ACCIONES_KEY, handlerDe(metodo)) ?? []) as unknown[];
        const guards = (Reflect.getMetadata(GUARDS_METADATA, handlerDe(metodo)) ?? []) as unknown[];
        return acciones.length === 0 || !guards.includes(AccionesGuard);
      });

      expect(sinGate).toEqual([]);
    });
  });
});
