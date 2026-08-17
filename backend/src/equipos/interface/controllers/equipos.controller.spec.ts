/**
 * T12.6 [C][RED→GREEN] — EquiposController.
 *
 * Unit test: instancia el controller directamente con use cases mockeados
 * (sin bootstrapear NestJS ni pasar por guards/ValidationPipe — mismo
 * patrón que `compras.controller.spec.ts`). Verifica: traducción HTTP ↔ use
 * case, mapeo de errores de dominio → HttpException, y que cada endpoint
 * protegido declara el `@RequirePermissions('equipo:gestionar')` correcto.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1..Q3. Tarea: T12.6.
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EquiposController } from './equipos.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { Result } from '../../../shared/domain/result';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  EquipoNoEncontradoError,
  NumeroSerieDuplicadoError,
  TipoComponenteInactivoError,
  ComponenteNoEncontradoError,
  ComponenteDadoDeBajaError,
  ComponenteYaActivoError,
} from '../../domain/errors/equipos.errors';

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
    const listarTiposComponenteUseCase = { execute: vi.fn() };

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
      listarTiposComponenteUseCase as any,
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
      listarTiposComponenteUseCase,
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
    it('retorna el equipo con componentes embebidos vacíos', async () => {
      const { controller, obtenerEquipoUseCase } = buildController();
      obtenerEquipoUseCase.execute.mockResolvedValue(
        Result.ok({ equipo: makeEquipo(), componentes: [] }),
      );

      const result = await controller.obtener('equipo-uuid');
      expect(result.id).toBe('equipo-uuid');
      expect(result.componentes).toEqual([]);
    });

    it('embebe los componentes activos del equipo, enriquecidos con tipo MASTER (item 1 — G7)', async () => {
      const { controller, obtenerEquipoUseCase } = buildController();
      const componente = ComponenteEquipoEntity.create({
        equipoId: 'equipo-uuid',
        tipoComponenteCodigo: 'RAM',
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

      const result = await controller.obtener('equipo-uuid');
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

      await expect(controller.obtener('no-existe')).rejects.toThrow(NotFoundException);
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

  describe('POST /equipos/:id/componentes', () => {
    it('agrega el componente', async () => {
      const { controller, agregarComponenteUseCase } = buildController();
      const componente = ComponenteEquipoEntity.create({
        equipoId: 'equipo-uuid',
        tipoComponenteCodigo: 'RAM',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      }).getValue();
      agregarComponenteUseCase.execute.mockResolvedValue(Result.ok(componente));

      const result = await controller.agregarComponente('equipo-uuid', {
        tipoComponenteCodigo: 'RAM',
      } as any);
      expect(result.tipoComponenteCodigo).toBe('RAM');
    });

    it('tipo inactivo → 422', async () => {
      const { controller, agregarComponenteUseCase } = buildController();
      agregarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new TipoComponenteInactivoError('RAM')),
      );

      await expect(
        controller.agregarComponente('equipo-uuid', { tipoComponenteCodigo: 'RAM' } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('declara @RequiereAcciones("EQUIPOS:ALTAS")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, EquiposController.prototype.agregarComponente);
      expect(meta).toEqual(['EQUIPOS:ALTAS']);
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
        tipoComponenteCodigo: 'RAM',
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
        tipoComponenteCodigo: 'RAM',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      }).getValue();
      reactivarComponenteUseCase.execute.mockResolvedValue(Result.ok(componente));

      const result = await controller.reactivarComponente('equipo-uuid', 'componente-1');
      expect(result.tipoComponenteCodigo).toBe('RAM');
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

    it('declara @RequiereAcciones("EQUIPOS:MODIFICACION")', () => {
      const meta = Reflect.getMetadata(
        ACCIONES_KEY,
        EquiposController.prototype.reactivarComponente,
      );
      expect(meta).toEqual(['EQUIPOS:MODIFICACION']);
    });
  });

  describe('GET /equipos/tipos-componente', () => {
    it('lista los tipos de componente activos SIN requerir permiso de escritura', async () => {
      const { controller, listarTiposComponenteUseCase } = buildController();
      const tipo = { codigo: 'RAM', nombre: 'Memoria RAM' };
      listarTiposComponenteUseCase.execute.mockResolvedValue(Result.ok([tipo]));

      const result = await controller.listarTiposComponente();
      expect(result).toHaveLength(1);
      expect(result[0].codigo).toBe('RAM');

      const meta = Reflect.getMetadata(
        ACCIONES_KEY,
        EquiposController.prototype.listarTiposComponente,
      );
      expect(meta).toBeUndefined();
    });
  });
});
