/**
 * K7 [CONTROLLER][RED→GREEN] — `KbController` (K1-K4).
 *
 * Unit test: instancia el controller directamente con use cases mockeados,
 * mismo patrón que `TicketsController`/`SlaConfigController` — verifica
 * gateo por `KB:ALTAS`/`MODIFICACION`/`PUBLICAR`/`BORRADO` en rutas de
 * escritura (POST/PATCH/DELETE) y por `KB:LECTURA` en las de lectura
 * (GET), metadata `@RequiereAcciones` por método, WU-7.3 + fix post-verify
 * C1. El scope de FILA (publicados vs. todos) se sigue resolviendo dentro
 * del use case por `KB:VER_TODOS` (K3/R11) — eso no cambió.
 *
 * Ref spec: sdd/premium/spec K1-K4, K7. Tarea: K7/K8.
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { KbController } from './kb.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { Result } from '../../../shared/domain/result';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { KbArticuloNoEncontradoError, TituloVacioError } from '../../domain/errors/kb.errors';

describe('KbController (K7)', () => {
  function buildController() {
    const crearUseCase = { execute: vi.fn() };
    const editarUseCase = { execute: vi.fn() };
    const cambiarVisibilidadUseCase = { execute: vi.fn() };
    const eliminarUseCase = { execute: vi.fn() };
    const obtenerUseCase = { execute: vi.fn() };
    const listarUseCase = { execute: vi.fn() };

    const controller = new KbController(
      crearUseCase as never,
      editarUseCase as never,
      cambiarVisibilidadUseCase as never,
      eliminarUseCase as never,
      obtenerUseCase as never,
      listarUseCase as never,
    );

    return {
      controller,
      crearUseCase,
      editarUseCase,
      cambiarVisibilidadUseCase,
      eliminarUseCase,
      obtenerUseCase,
      listarUseCase,
    };
  }

  function buildArticulo(overrides: Partial<{ id: string; visibleParaSolicitante: boolean }> = {}) {
    return KbArticuloEntity.create(
      {
        titulo: 'Título',
        contenido: 'Contenido',
        tipoTicketId: null,
        autorId: 'autor-uuid',
        visibleParaSolicitante: overrides.visibleParaSolicitante ?? false,
        activo: true,
      },
      overrides.id ?? 'articulo-uuid',
    );
  }

  // ─── Gateo por permiso — solo escritura ────────────────────────────────

  it('[CRITICAL] POST /kb declara @RequiereAcciones("KB:ALTAS")', () => {
    const permisos = Reflect.getMetadata(ACCIONES_KEY, KbController.prototype.create);
    expect(permisos).toEqual(['KB:ALTAS']);
  });

  it('[CRITICAL] PATCH /kb/:id declara @RequiereAcciones("KB:MODIFICACION")', () => {
    const permisos = Reflect.getMetadata(ACCIONES_KEY, KbController.prototype.update);
    expect(permisos).toEqual(['KB:MODIFICACION']);
  });

  it('[CRITICAL] PATCH /kb/:id/visibilidad declara @RequiereAcciones("KB:PUBLICAR")', () => {
    const permisos = Reflect.getMetadata(ACCIONES_KEY, KbController.prototype.cambiarVisibilidad);
    expect(permisos).toEqual(['KB:PUBLICAR']);
  });

  it('[CRITICAL] DELETE /kb/:id declara @RequiereAcciones("KB:BORRADO")', () => {
    const permisos = Reflect.getMetadata(ACCIONES_KEY, KbController.prototype.remove);
    expect(permisos).toEqual(['KB:BORRADO']);
  });

  it('[CRITICAL] GET /kb declara @RequiereAcciones("KB:LECTURA") (fix post-verify C1, scope de fila sigue inline vía KB:VER_TODOS)', () => {
    const permisos = Reflect.getMetadata(ACCIONES_KEY, KbController.prototype.findAll);
    expect(permisos).toEqual(['KB:LECTURA']);
  });

  it('[CRITICAL] GET /kb/:id declara @RequiereAcciones("KB:LECTURA") (fix post-verify C1, scope de fila sigue inline vía KB:VER_TODOS)', () => {
    const permisos = Reflect.getMetadata(ACCIONES_KEY, KbController.prototype.findOne);
    expect(permisos).toEqual(['KB:LECTURA']);
  });

  // ─── POST /kb ───────────────────────────────────────────────────────────

  describe('POST /kb', () => {
    it('crea el artículo con autorId=user.sub', async () => {
      const { controller, crearUseCase } = buildController();
      const articulo = buildArticulo();
      crearUseCase.execute.mockResolvedValue(Result.ok(articulo));

      await controller.create({ sub: 'actor-uuid', permisos: [] } as never, {
        titulo: 'Título',
        contenido: 'Contenido',
        tipoTicketId: null,
      });

      expect(crearUseCase.execute).toHaveBeenCalledWith({
        titulo: 'Título',
        contenido: 'Contenido',
        tipoTicketId: null,
        autorId: 'actor-uuid',
      });
    });

    it('mapea TituloVacioError → 422', async () => {
      const { controller, crearUseCase } = buildController();
      crearUseCase.execute.mockResolvedValue(Result.fail(new TituloVacioError()));

      await expect(
        controller.create({ sub: 'actor-uuid', permisos: [] } as never, {
          titulo: '',
          contenido: 'x',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  // ─── PATCH /kb/:id ──────────────────────────────────────────────────────

  describe('PATCH /kb/:id', () => {
    it('edita y retorna el artículo actualizado', async () => {
      const { controller, editarUseCase } = buildController();
      const articulo = buildArticulo();
      editarUseCase.execute.mockResolvedValue(Result.ok(articulo));

      const result = await controller.update('articulo-uuid', { titulo: 'Nuevo' });

      expect(result.id).toBe('articulo-uuid');
      expect(editarUseCase.execute).toHaveBeenCalledWith({ id: 'articulo-uuid', titulo: 'Nuevo' });
    });

    it('mapea KbArticuloNoEncontradoError → 404', async () => {
      const { controller, editarUseCase } = buildController();
      editarUseCase.execute.mockResolvedValue(
        Result.fail(new KbArticuloNoEncontradoError('inexistente')),
      );

      await expect(controller.update('inexistente', { titulo: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── PATCH /kb/:id/visibilidad ──────────────────────────────────────────

  describe('PATCH /kb/:id/visibilidad', () => {
    it('publica (visible=true) y retorna el artículo actualizado', async () => {
      const { controller, cambiarVisibilidadUseCase } = buildController();
      const articulo = buildArticulo({ visibleParaSolicitante: true });
      cambiarVisibilidadUseCase.execute.mockResolvedValue(Result.ok(articulo));

      const result = await controller.cambiarVisibilidad('articulo-uuid', { visible: true });

      expect(result.visibleParaSolicitante).toBe(true);
      expect(cambiarVisibilidadUseCase.execute).toHaveBeenCalledWith({
        id: 'articulo-uuid',
        visible: true,
      });
    });
  });

  // ─── DELETE /kb/:id ─────────────────────────────────────────────────────

  describe('DELETE /kb/:id', () => {
    it('elimina (soft delete) el artículo', async () => {
      const { controller, eliminarUseCase } = buildController();
      eliminarUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.remove('articulo-uuid');

      expect(eliminarUseCase.execute).toHaveBeenCalledWith({ id: 'articulo-uuid' });
    });

    it('mapea KbArticuloNoEncontradoError → 404', async () => {
      const { controller, eliminarUseCase } = buildController();
      eliminarUseCase.execute.mockResolvedValue(
        Result.fail(new KbArticuloNoEncontradoError('inexistente')),
      );

      await expect(controller.remove('inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── GET /kb/:id ────────────────────────────────────────────────────────

  describe('GET /kb/:id', () => {
    it('[CRITICAL] USUARIO (sin KB:VER_TODOS): use case recibe tienePermisoVerTodos=false', async () => {
      const { controller, obtenerUseCase } = buildController();
      const articulo = buildArticulo({ visibleParaSolicitante: true });
      obtenerUseCase.execute.mockResolvedValue(Result.ok(articulo));

      await controller.findOne({ sub: 'u', permisos: [] } as never, 'articulo-uuid');

      expect(obtenerUseCase.execute).toHaveBeenCalledWith({
        id: 'articulo-uuid',
        tienePermisoVerTodos: false,
      });
    });

    it('[CRITICAL] TECNICO (con KB:VER_TODOS): use case recibe tienePermisoVerTodos=true', async () => {
      const { controller, obtenerUseCase } = buildController();
      const articulo = buildArticulo();
      obtenerUseCase.execute.mockResolvedValue(Result.ok(articulo));

      await controller.findOne({ sub: 't', permisos: ['KB:VER_TODOS'] } as never, 'articulo-uuid');

      expect(obtenerUseCase.execute).toHaveBeenCalledWith({
        id: 'articulo-uuid',
        tienePermisoVerTodos: true,
      });
    });

    it('mapea KbArticuloNoEncontradoError → 404', async () => {
      const { controller, obtenerUseCase } = buildController();
      obtenerUseCase.execute.mockResolvedValue(
        Result.fail(new KbArticuloNoEncontradoError('inexistente')),
      );

      await expect(
        controller.findOne({ sub: 'u', permisos: [] } as never, 'inexistente'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── GET /kb ────────────────────────────────────────────────────────────

  describe('GET /kb', () => {
    it('[CRITICAL] USUARIO: use case recibe tienePermisoVerTodos=false', async () => {
      const { controller, listarUseCase } = buildController();
      listarUseCase.execute.mockResolvedValue({ items: [], total: 0 });

      await controller.findAll({ sub: 'u', permisos: [] } as never, {});

      expect(listarUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ tienePermisoVerTodos: false }),
      );
    });

    it('mapea items + total al response shape', async () => {
      const { controller, listarUseCase } = buildController();
      const articulo = buildArticulo();
      listarUseCase.execute.mockResolvedValue({ items: [articulo], total: 1 });

      const result = await controller.findAll(
        { sub: 't', permisos: ['KB:VER_TODOS'] } as never,
        {},
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
