/**
 * T12.6 [C][RED→GREEN] — EquiposController.
 *
 * Unit test: instancia el controller directamente con use cases mockeados
 * (sin bootstrapear NestJS ni pasar por guards/ValidationPipe — mismo
 * patrón que `compras.controller.spec.ts`). Verifica: traducción HTTP ↔ use
 * case, mapeo de errores de dominio → HttpException, y que cada endpoint
 * declara la acción `EQUIPOS:*` correcta con `@RequiereAcciones` (el
 * `@RequirePermissions('equipo:gestionar')` que decía acá no existe más — lo
 * reemplazó `AccionesGuard`, WU-7.3; los tests de abajo ya asertaban las
 * acciones nuevas).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1..Q3. Tarea: T12.6.
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EquiposController, toHttpException } from './equipos.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { DomainError, Result } from '../../../shared/domain/result';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import * as EquiposErrors from '../../domain/errors/equipos.errors';
import {
  EquipoNoEncontradoError,
  NumeroSerieDuplicadoError,
  ComponenteNoEncontradoError,
  ComponenteDadoDeBajaError,
  ComponenteYaActivoError,
} from '../../domain/errors/equipos.errors';
import { StockInsuficienteError } from '../../../insumos/domain/errors/insumos.errors';

function makeEquipo(): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.create(
    {
      nombre: 'Notebook Test',
      numeroSerie: 'SN-001',
      marca: 'Dell',
      modelo: 'Latitude',
      fechaAdquisicion: null,
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    },
    'equipo-uuid',
  );
}

describe('EquiposController (T12.6)', () => {
  function buildController() {
    const crearEquipoUseCase = { execute: vi.fn() };
    const editarEquipoUseCase = { execute: vi.fn() };
    const obtenerEquipoUseCase = { execute: vi.fn() };
    const listarEquiposUseCase = { execute: vi.fn() };
    const eliminarEquipoUseCase = { execute: vi.fn() };
    const agregarComponenteUseCase = { execute: vi.fn() };
    const eliminarComponenteUseCase = { execute: vi.fn() };
    const editarComponenteUseCase = { execute: vi.fn() };
    const reactivarComponenteUseCase = { execute: vi.fn() };
    const exportarEquiposUseCase = { execute: vi.fn() };
    const instalarComponenteDesdeDepositoUseCase = { execute: vi.fn() };

    const controller = new EquiposController(
      crearEquipoUseCase as any,
      editarEquipoUseCase as any,
      obtenerEquipoUseCase as any,
      listarEquiposUseCase as any,
      eliminarEquipoUseCase as any,
      agregarComponenteUseCase as any,
      eliminarComponenteUseCase as any,
      editarComponenteUseCase as any,
      reactivarComponenteUseCase as any,
      exportarEquiposUseCase as any,
      instalarComponenteDesdeDepositoUseCase as any,
    );

    return {
      controller,
      crearEquipoUseCase,
      editarEquipoUseCase,
      obtenerEquipoUseCase,
      listarEquiposUseCase,
      eliminarEquipoUseCase,
      agregarComponenteUseCase,
      eliminarComponenteUseCase,
      editarComponenteUseCase,
      reactivarComponenteUseCase,
      exportarEquiposUseCase,
      instalarComponenteDesdeDepositoUseCase,
    };
  }

  describe('POST /equipos', () => {
    it('crea el equipo → 201 + response', async () => {
      const { controller, crearEquipoUseCase } = buildController();
      crearEquipoUseCase.execute.mockResolvedValue(Result.ok(makeEquipo()));

      const result = await controller.crear({
        nombre: 'Notebook Test',
        numeroSerie: 'SN-001',
      } as any);

      expect(result.id).toBe('equipo-uuid');
      expect(result.nombre).toBe('Notebook Test');
    });

    it('numeroSerie duplicado → 422', async () => {
      const { controller, crearEquipoUseCase } = buildController();
      crearEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new NumeroSerieDuplicadoError('SN-001')),
      );

      await expect(controller.crear({} as any)).rejects.toThrow(UnprocessableEntityException);
    });

    it('declara @RequiereAcciones("EQUIPOS:ALTAS")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, EquiposController.prototype.crear);
      expect(meta).toEqual(['EQUIPOS:ALTAS']);
    });
  });

  describe('GET /equipos', () => {
    it('lista los equipos activos', async () => {
      const { controller, listarEquiposUseCase } = buildController();
      listarEquiposUseCase.execute.mockResolvedValue(Result.ok([makeEquipo()]));

      const result = await controller.listar();
      expect(result).toHaveLength(1);
    });
  });

  describe('GET /equipos/:id', () => {
    it('un id que no es UUID (ruta retirada como tipos-componente) → 404 sin consultar', async () => {
      const { controller, obtenerEquipoUseCase } = buildController();

      await expect(controller.obtener('tipos-componente')).rejects.toThrow(NotFoundException);
      expect(obtenerEquipoUseCase.execute).not.toHaveBeenCalled();
    });

    it('retorna el equipo con componentes embebidos vacíos', async () => {
      const { controller, obtenerEquipoUseCase } = buildController();
      obtenerEquipoUseCase.execute.mockResolvedValue(
        Result.ok({ equipo: makeEquipo(), componentes: [] }),
      );

      const result = await controller.obtener('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b');
      expect(result.id).toBe('equipo-uuid');
      expect(result.componentes).toEqual([]);
    });

    it('embebe los componentes activos del equipo, enriquecidos con tipo MASTER (item 1 — G7)', async () => {
      const { controller, obtenerEquipoUseCase } = buildController();
      const componente = ComponenteEquipoEntity.create({
        equipoId: 'equipo-uuid',
        insumoId: 'insumo-1',
        descripcion: '16GB',
        numeroSerie: null,
        capacidad: null,
      }).getValue();
      obtenerEquipoUseCase.execute.mockResolvedValue(
        Result.ok({
          equipo: makeEquipo(),
          componentes: [{ componente, tipoNombre: 'Memoria RAM', tipoActivo: true }],
        }),
      );

      const result = await controller.obtener('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b');
      expect(result.componentes).toHaveLength(1);
      expect(result.componentes[0].descripcion).toBe('16GB');
      expect(result.componentes[0].tipoNombre).toBe('Memoria RAM');
      expect(result.componentes[0].tipoActivo).toBe(true);
    });

    it('equipo inexistente → 404', async () => {
      const { controller, obtenerEquipoUseCase } = buildController();
      obtenerEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoNoEncontradoError('no-existe')),
      );

      await expect(controller.obtener('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('PATCH /equipos/:id', () => {
    it('edita el equipo', async () => {
      const { controller, editarEquipoUseCase } = buildController();
      editarEquipoUseCase.execute.mockResolvedValue(Result.ok(makeEquipo()));

      const result = await controller.editar('equipo-uuid', { nombre: 'Editado' } as any);
      expect(result.id).toBe('equipo-uuid');
    });

    it('declara @RequiereAcciones("EQUIPOS:MODIFICACION")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, EquiposController.prototype.editar);
      expect(meta).toEqual(['EQUIPOS:MODIFICACION']);
    });
  });

  describe('DELETE /equipos/:id', () => {
    it('elimina el equipo', async () => {
      const { controller, eliminarEquipoUseCase } = buildController();
      eliminarEquipoUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await expect(controller.eliminar('equipo-uuid')).resolves.toBeUndefined();
    });

    it('declara @RequiereAcciones("EQUIPOS:BORRADO")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, EquiposController.prototype.eliminar);
      expect(meta).toEqual(['EQUIPOS:BORRADO']);
    });
  });

  describe('POST /equipos/:id/componentes (un solo endpoint, ADR-1)', () => {
    const actor = { sub: 'usuario-jwt-uuid' } as any;
    const insumoId = '33333333-3333-4333-8333-333333333333';
    const makeComponente = () =>
      ComponenteEquipoEntity.create({
        equipoId: 'equipo-uuid',
        insumoId,
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      }).getValue();

    it('descontarStock omitido → instala desde el depósito; usuarioId sale del JWT, nunca del body', async () => {
      const { controller, instalarComponenteDesdeDepositoUseCase, agregarComponenteUseCase } =
        buildController();
      instalarComponenteDesdeDepositoUseCase.execute.mockResolvedValue(Result.ok(makeComponente()));

      const result = await controller.agregarComponente(actor, 'equipo-uuid', {
        insumoId,
        // Un cliente que manda `usuarioId` igual: el handler nunca lo lee.
        usuarioId: 'usuario-suplantado',
      } as any);

      expect(instalarComponenteDesdeDepositoUseCase.execute).toHaveBeenCalledWith({
        equipoId: 'equipo-uuid',
        insumoId,
        usuarioId: 'usuario-jwt-uuid',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      });
      expect(agregarComponenteUseCase.execute).not.toHaveBeenCalled();
      expect(result.insumoId).toBe(insumoId);
    });

    it('descontarStock true → instala desde el depósito', async () => {
      const { controller, instalarComponenteDesdeDepositoUseCase, agregarComponenteUseCase } =
        buildController();
      instalarComponenteDesdeDepositoUseCase.execute.mockResolvedValue(Result.ok(makeComponente()));

      await controller.agregarComponente(actor, 'equipo-uuid', {
        insumoId,
        descontarStock: true,
      } as any);

      expect(instalarComponenteDesdeDepositoUseCase.execute).toHaveBeenCalledTimes(1);
      expect(agregarComponenteUseCase.execute).not.toHaveBeenCalled();
    });

    it('descontarStock false → agrega sin movimiento de stock', async () => {
      const { controller, instalarComponenteDesdeDepositoUseCase, agregarComponenteUseCase } =
        buildController();
      agregarComponenteUseCase.execute.mockResolvedValue(Result.ok(makeComponente()));

      const result = await controller.agregarComponente(actor, 'equipo-uuid', {
        insumoId,
        descontarStock: false,
      } as any);

      expect(agregarComponenteUseCase.execute).toHaveBeenCalledWith({
        equipoId: 'equipo-uuid',
        insumoId,
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      });
      expect(instalarComponenteDesdeDepositoUseCase.execute).not.toHaveBeenCalled();
      expect(result.insumoId).toBe(insumoId);
    });

    it('la respuesta no expone tipoComponenteCodigo (ADR-6)', async () => {
      const { controller, instalarComponenteDesdeDepositoUseCase } = buildController();
      instalarComponenteDesdeDepositoUseCase.execute.mockResolvedValue(Result.ok(makeComponente()));

      const result = await controller.agregarComponente(actor, 'equipo-uuid', { insumoId } as any);

      expect(result).not.toHaveProperty('tipoComponenteCodigo');
    });

    it('equipo inexistente → 404', async () => {
      const { controller, instalarComponenteDesdeDepositoUseCase } = buildController();
      instalarComponenteDesdeDepositoUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoNoEncontradoError('no-existe')),
      );

      await expect(
        controller.agregarComponente(actor, 'no-existe', { insumoId } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('stock insuficiente → 422 (StockInsuficienteError cae en el default)', async () => {
      const { controller, instalarComponenteDesdeDepositoUseCase } = buildController();
      instalarComponenteDesdeDepositoUseCase.execute.mockResolvedValue(
        Result.fail(new StockInsuficienteError(insumoId, 1, 0)),
      );

      await expect(
        controller.agregarComponente(actor, 'equipo-uuid', { insumoId } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('insumo inexistente sin descuento → 422', async () => {
      const { controller, agregarComponenteUseCase } = buildController();
      agregarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new EquiposErrors.InsumoRepuestoInexistenteError(insumoId)),
      );

      await expect(
        controller.agregarComponente(actor, 'equipo-uuid', {
          insumoId,
          descontarStock: false,
        } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('declara @RequiereAcciones("EQUIPOS:ALTAS")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, EquiposController.prototype.agregarComponente);
      expect(meta).toEqual(['EQUIPOS:ALTAS']);
    });

    it('la ruta instalar-desde-deposito ya no existe en el controller', () => {
      expect((EquiposController.prototype as any).instalarComponenteDesdeDeposito).toBeUndefined();
    });
  });

  describe('DELETE /equipos/:id/componentes/:componenteId', () => {
    it('elimina el componente', async () => {
      const { controller, eliminarComponenteUseCase } = buildController();
      eliminarComponenteUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await expect(
        controller.eliminarComponente('equipo-uuid', 'componente-1'),
      ).resolves.toBeUndefined();
    });

    it('componente inexistente → 404', async () => {
      const { controller, eliminarComponenteUseCase } = buildController();
      eliminarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new ComponenteNoEncontradoError('no-existe')),
      );

      await expect(controller.eliminarComponente('equipo-uuid', 'no-existe')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('PATCH /equipos/:id/componentes/:componenteId', () => {
    it('edita el componente', async () => {
      const { controller, editarComponenteUseCase } = buildController();
      const componente = ComponenteEquipoEntity.create({
        equipoId: 'equipo-uuid',
        insumoId: 'insumo-1',
        descripcion: 'Editado',
        numeroSerie: null,
        capacidad: null,
      }).getValue();
      editarComponenteUseCase.execute.mockResolvedValue(Result.ok(componente));

      const result = await controller.editarComponente('equipo-uuid', 'componente-1', {
        descripcion: 'Editado',
      } as any);
      expect(result.descripcion).toBe('Editado');
    });

    it('un tipoComponenteCodigo o insumoId sobrantes no llegan al use case (ADR-2)', async () => {
      const { controller, editarComponenteUseCase } = buildController();
      const componente = ComponenteEquipoEntity.create({
        equipoId: 'equipo-uuid',
        insumoId: 'insumo-1',
        descripcion: 'Editado',
        numeroSerie: null,
        capacidad: null,
      }).getValue();
      editarComponenteUseCase.execute.mockResolvedValue(Result.ok(componente));

      await controller.editarComponente('equipo-uuid', 'componente-1', {
        descripcion: 'Editado',
        tipoComponenteCodigo: 'CPU',
        insumoId: 'otro-insumo',
      } as any);

      expect(editarComponenteUseCase.execute).toHaveBeenCalledWith({
        equipoId: 'equipo-uuid',
        componenteId: 'componente-1',
        descripcion: 'Editado',
        numeroSerie: undefined,
        capacidad: undefined,
      });
    });

    it('componente dado de baja → 422', async () => {
      const { controller, editarComponenteUseCase } = buildController();
      editarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new ComponenteDadoDeBajaError('componente-1')),
      );

      await expect(
        controller.editarComponente('equipo-uuid', 'componente-1', {} as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('componente inexistente → 404', async () => {
      const { controller, editarComponenteUseCase } = buildController();
      editarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new ComponenteNoEncontradoError('no-existe')),
      );

      await expect(
        controller.editarComponente('equipo-uuid', 'no-existe', {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('declara @RequiereAcciones("EQUIPOS:MODIFICACION")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, EquiposController.prototype.editarComponente);
      expect(meta).toEqual(['EQUIPOS:MODIFICACION']);
    });
  });

  describe('PATCH /equipos/:id/componentes/:componenteId/reactivar', () => {
    it('reactiva el componente', async () => {
      const { controller, reactivarComponenteUseCase } = buildController();
      const componente = ComponenteEquipoEntity.create({
        equipoId: 'equipo-uuid',
        insumoId: 'insumo-1',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      }).getValue();
      reactivarComponenteUseCase.execute.mockResolvedValue(Result.ok(componente));

      const result = await controller.reactivarComponente('equipo-uuid', 'componente-1');
      expect(result.id).toBeDefined();
      expect(result).not.toHaveProperty('tipoComponenteCodigo');
    });

    it('componente ya activo → 422', async () => {
      const { controller, reactivarComponenteUseCase } = buildController();
      reactivarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new ComponenteYaActivoError('componente-1')),
      );

      await expect(controller.reactivarComponente('equipo-uuid', 'componente-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('componente devuelto al stock → 422', async () => {
      const { controller, reactivarComponenteUseCase } = buildController();
      reactivarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new EquiposErrors.ComponenteDevueltoAlStockError('componente-1')),
      );

      await expect(controller.reactivarComponente('equipo-uuid', 'componente-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('declara @RequiereAcciones("EQUIPOS:MODIFICACION")', () => {
      const meta = Reflect.getMetadata(
        ACCIONES_KEY,
        EquiposController.prototype.reactivarComponente,
      );
      expect(meta).toEqual(['EQUIPOS:MODIFICACION']);
    });
  });
});

describe('EquiposController.exportar — GET /equipos/export (sdd/exportar-listados-csv)', () => {
  function buildController(overrides: { exportarEquipos?: { execute: ReturnType<typeof vi.fn> } }) {
    const stub = () => ({ execute: vi.fn() });
    const exportarEquipos = overrides.exportarEquipos ?? stub();

    const controller = new EquiposController(
      stub() as any, // crearEquipoUseCase
      stub() as any, // editarEquipoUseCase
      stub() as any, // obtenerEquipoUseCase
      stub() as any, // listarEquiposUseCase
      stub() as any, // eliminarEquipoUseCase
      stub() as any, // agregarComponenteUseCase
      stub() as any, // eliminarComponenteUseCase
      stub() as any, // editarComponenteUseCase
      stub() as any, // reactivarComponenteUseCase
      exportarEquipos as any, // exportarEquiposUseCase
      stub() as any, // instalarComponenteDesdeDepositoUseCase
    );
    return { controller, exportarEquipos };
  }

  /** Doble mínimo de la respuesta HTTP: sólo hace falta poder escribir headers. */
  function respuestaFalsa() {
    const headers = new Map<string, string>();
    return {
      res: { setHeader: (nombre: string, valor: string) => void headers.set(nombre, valor) },
      headers,
    };
  }

  it('declara @RequiereAcciones("EQUIPOS:LECTURA")', () => {
    const meta = Reflect.getMetadata(ACCIONES_KEY, EquiposController.prototype.exportar);
    expect(meta).toEqual(['EQUIPOS:LECTURA']);
  });

  it('entrega el CSV como descarga, con el nombre que resolvió el use case', async () => {
    const exportarEquipos = { execute: vi.fn() };
    exportarEquipos.execute.mockResolvedValue(
      Result.ok({ contenido: 'Nombre;Marca', nombreArchivo: 'equipos-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarEquipos });
    const { res, headers } = respuestaFalsa();

    const salida = await controller.exportar(res);

    expect(salida).toBe('Nombre;Marca');
    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(headers.get('Content-Disposition')).toBe(
      'attachment; filename="equipos-2026-08-19.csv"',
    );
    expect(headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition');
  });

  it('no recibe query ni filtros — llama a execute() sin argumentos', async () => {
    const exportarEquipos = { execute: vi.fn() };
    exportarEquipos.execute.mockResolvedValue(
      Result.ok({ contenido: '', nombreArchivo: 'equipos-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarEquipos });

    await controller.exportar(respuestaFalsa().res);

    expect(exportarEquipos.execute).toHaveBeenCalledWith();
  });

  it('traduce el tope excedido a 422 y no escribe headers de descarga', async () => {
    const exportarEquipos = { execute: vi.fn() };
    exportarEquipos.execute.mockResolvedValue(
      Result.fail(new EquiposErrors.ExportacionDemasiadoGrandeError(6000, 5000)),
    );
    const { controller } = buildController({ exportarEquipos });
    const { res, headers } = respuestaFalsa();

    await expect(controller.exportar(res)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(headers.size).toBe(0);
  });
});

describe('toHttpException — catálogo de errores → HTTP (sdd/exportar-listados-csv, decisión D2)', () => {
  /** Clases de error exportadas por `equipos.errors.ts` — el número de la verdad, no un literal a mano. */
  // Sin type predicate a propósito: cada export de `equipos.errors.ts` ya es
  // `typeof AlgunErrorConcreto`, con sus estáticos heredados de `Error`
  // (captureStackTrace, etc.) — una firma de constructor inventada acá los
  // pierde y el chequeo TS2677 lo rechaza. El filtro es puro guardarraíl
  // runtime si el módulo alguna vez exporta algo que no sea una clase.
  const CLASES_DE_ERROR = Object.values(EquiposErrors).filter(
    (valor) => typeof valor === 'function' && valor.prototype instanceof DomainError,
  );

  it('el catálogo tiene EXACTAMENTE 15 clases de error (16 previas menos TipoComponenteInactivo, ComponenteVinculadoTipoInmutable y TipoComponenteCodigoRequerido, retiradas en sdd/catalogo-unico-componentes WU-5 y WU-6, más MotivoRetiroRequerido y ComponenteDevueltoAlStock de sdd/stock-usado-componentes)', () => {
    expect(CLASES_DE_ERROR).toHaveLength(15);
  });

  const TABLA: Array<[string, () => DomainError, 404 | 422]> = [
    ['EquipoNoEncontradoError', () => new EquiposErrors.EquipoNoEncontradoError('equipo-1'), 404],
    ['EquipoInvalidoError', () => new EquiposErrors.EquipoInvalidoError('equipo-1'), 422],
    ['NumeroSerieDuplicadoError', () => new EquiposErrors.NumeroSerieDuplicadoError('SN-001'), 422],
    [
      'ComponenteNoEncontradoError',
      () => new EquiposErrors.ComponenteNoEncontradoError('componente-1'),
      404,
    ],
    [
      'ComponenteDadoDeBajaError',
      () => new EquiposErrors.ComponenteDadoDeBajaError('componente-1'),
      422,
    ],
    [
      'ComponenteYaActivoError',
      () => new EquiposErrors.ComponenteYaActivoError('componente-1'),
      422,
    ],
    // Registro de retiro (sdd/stock-usado-componentes): los dos son reglas de
    // negocio sobre un recurso que existe → 422.
    [
      'MotivoRetiroRequeridoError',
      () => new EquiposErrors.MotivoRetiroRequeridoError('DESCARTE'),
      422,
    ],
    [
      'ComponenteDevueltoAlStockError',
      () => new EquiposErrors.ComponenteDevueltoAlStockError('componente-1'),
      422,
    ],
    // `TicketSoporteNoEncontradoError` es 404 en `SoporteController` (que tiene
    // su PROPIO `toHttpException`, con esa rama explícita) — nunca la produce
    // ningún use case de `EquiposController`, así que ACÁ cae en el default
    // 422 de este controller. La tabla documenta el comportamiento REAL de
    // ESTA función, no el de `SoporteController`.
    [
      'TicketSoporteNoEncontradoError',
      () => new EquiposErrors.TicketSoporteNoEncontradoError('ticket-1'),
      422,
    ],
    [
      'ExportacionDemasiadoGrandeError',
      () => new EquiposErrors.ExportacionDemasiadoGrandeError(6000, 5000),
      422,
    ],
    // Los dos de `modeloEquipoId` van a 422 y no a 404: lo que no existe (o no
    // se puede elegir) es un valor del BODY, no el recurso de la URL — mismo
    // criterio que `insumoId`, que es otro campo del payload que referencia
    // un catálogo. Un 404 acá diría "el equipo no
    // existe", que es otra cosa.
    [
      'ModeloEquipoInexistenteError',
      () => new EquiposErrors.ModeloEquipoInexistenteError('modelo-1'),
      422,
    ],
    [
      'ModeloEquipoDeshabilitadoError',
      () => new EquiposErrors.ModeloEquipoDeshabilitadoError('modelo-1', 'HP', 'LaserJet Pro M404'),
      422,
    ],
    // Los dos de `insumoId` (WU-3, sdd/repuestos-vinculo-componente) van a 422
    // por el mismo criterio que los de `modeloEquipoId`:
    // un valor del BODY que referencia un catálogo, no el recurso de la URL.
    [
      'InsumoRepuestoInexistenteError',
      () => new EquiposErrors.InsumoRepuestoInexistenteError('insumo-1'),
      422,
    ],
    ['InsumoNoEsRepuestoError', () => new EquiposErrors.InsumoNoEsRepuestoError('insumo-1'), 422],
    // `FamiliaRepuestoDeshabilitadaError` (WU-3, hallazgo de revisión automática):
    // split de `InsumoNoEsRepuestoError` — mismo criterio 422 que su hermano.
    [
      'FamiliaRepuestoDeshabilitadaError',
      () =>
        new EquiposErrors.FamiliaRepuestoDeshabilitadaError('insumo-1', 'TORNILLO', 'Tornillos'),
      422,
    ],
  ];

  it('TABLA cubre EXACTAMENTE las clases exportadas (ninguna falta, ninguna sobra)', () => {
    expect(TABLA).toHaveLength(CLASES_DE_ERROR.length);
    const nombresEnTabla = new Set(TABLA.map(([nombre]) => nombre));
    for (const clase of CLASES_DE_ERROR) {
      expect(nombresEnTabla.has(clase.name)).toBe(true);
    }
  });

  it.each(TABLA)('%s → HTTP %i', (_nombre, factory, httpEsperado) => {
    const excepcion = toHttpException(factory());

    expect(excepcion.getStatus()).toBe(httpEsperado);
    if (httpEsperado === 404) {
      expect(excepcion).toBeInstanceOf(NotFoundException);
    } else {
      expect(excepcion).toBeInstanceOf(UnprocessableEntityException);
    }
  });
});
