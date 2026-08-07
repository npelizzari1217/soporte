/**
 * T4.6/T5.7 [CONTROLLER] — RED→GREEN: `ComprasController`.
 *
 * Unit test: instancia el controller directamente con use cases mockeados
 * (sin bootstrapear NestJS ni pasar por guards/ValidationPipe — mismo
 * patrón que `auth.controller.spec.ts`). Verifica: traducción HTTP ↔ use
 * case, mapeo de errores de dominio → HttpException, y que cada endpoint
 * protegido declara el `@RequirePermissions(...)` correcto (F3-C6) — la
 * lógica de 403 del `PermissionsGuard` en sí ya está cubierta
 * genéricamente por `permissions.guard.spec.ts`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C1..C6. Tarea: T4.6, T5.7.
 */
import 'reflect-metadata';
import {
  ConflictException,
  ForbiddenException as _ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ComprasController } from './compras.controller';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ArchivoEntity } from '../../../tickets/domain/entities/archivo.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import {
  SolicitanteInvalidoError,
  SinCicloActivoError,
} from '../../../tickets/domain/errors/tickets.errors';
import {
  CompraNoEncontradaError,
  CantidadInvalidaError,
  MonedaInvalidaError,
  MotivoRechazoRequeridoError,
  PresupuestoNoEncontradoError,
  ItemNoEncontradoError,
} from '../../domain/errors/compras.errors';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

const USER: JwtPayload = {
  sub: 'usuario-uuid',
  cliente_id: 'cliente-uuid',
  rol: 'COLABORADOR',
  permisos: ['compra:gestionar', 'compra:aprobar', 'ticket:rechazar', 'ticket:crear'],
  is_global_admin: false,
  cliente_nombre: 'Cliente Test',
  membresias: [],
};

function makeTicket(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'COM-2026-00001',
      titulo: 'Compra de notebooks',
      descripcion: null,
      tipoId: 'tipo-compras-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'usuario-uuid',
    },
    'ticket-uuid',
  );
}

describe('ComprasController (T4.6, T5.7)', () => {
  function buildController() {
    const crearTicketCompraUseCase = { execute: vi.fn() };
    const listarComprasUseCase = { execute: vi.fn() };
    const obtenerCompraUseCase = { execute: vi.fn() };
    const agregarItemCompraUseCase = { execute: vi.fn() };
    const eliminarItemCompraUseCase = { execute: vi.fn() };
    const agregarPresupuestoUseCase = { execute: vi.fn() };
    const seleccionarPresupuestoUseCase = { execute: vi.fn() };
    const adjuntarPresupuestoUseCase = { execute: vi.fn() };
    const aprobarCompraUseCase = { execute: vi.fn() };
    const rechazarCompraUseCase = { execute: vi.fn() };

    const controller = new ComprasController(
      crearTicketCompraUseCase as any,
      listarComprasUseCase as any,
      obtenerCompraUseCase as any,
      agregarItemCompraUseCase as any,
      eliminarItemCompraUseCase as any,
      agregarPresupuestoUseCase as any,
      seleccionarPresupuestoUseCase as any,
      adjuntarPresupuestoUseCase as any,
      aprobarCompraUseCase as any,
      rechazarCompraUseCase as any,
    );

    return {
      controller,
      crearTicketCompraUseCase,
      listarComprasUseCase,
      obtenerCompraUseCase,
      agregarItemCompraUseCase,
      eliminarItemCompraUseCase,
      agregarPresupuestoUseCase,
      seleccionarPresupuestoUseCase,
      adjuntarPresupuestoUseCase,
      aprobarCompraUseCase,
      rechazarCompraUseCase,
    };
  }

  describe('POST /compras', () => {
    it('crea el ticket de compra → 201 + response unificado', async () => {
      const { controller, crearTicketCompraUseCase } = buildController();
      const ticket = makeTicket();
      const ticketCompra = TicketCompraEntity.create({ ticketId: ticket.id }, 'ticket-compra-uuid');
      crearTicketCompraUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketCompra }));

      const result = await controller.crear(
        {
          titulo: 'Compra de notebooks',
          descripcion: null,
          prioridadId: 'prioridad-media-uuid',
        } as any,
        USER,
      );

      expect(result.id).toBe('ticket-compra-uuid');
      expect(result.ticketId).toBe('ticket-uuid');
      expect(result.numero).toBe('COM-2026-00001');
      expect(crearTicketCompraUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ solicitanteId: 'usuario-uuid', autorId: 'usuario-uuid' }),
      );
    });

    it('solicitante invalido → 422', async () => {
      const { controller, crearTicketCompraUseCase } = buildController();
      crearTicketCompraUseCase.execute.mockResolvedValue(
        Result.fail(new SolicitanteInvalidoError('usuario-uuid')),
      );

      await expect(controller.crear({} as any, USER)).rejects.toThrow(UnprocessableEntityException);
    });

    it('sin ciclo activo → 409', async () => {
      const { controller, crearTicketCompraUseCase } = buildController();
      crearTicketCompraUseCase.execute.mockResolvedValue(Result.fail(new SinCicloActivoError()));

      await expect(controller.crear({} as any, USER)).rejects.toThrow(ConflictException);
    });

    it('declara @RequirePermissions("ticket:crear")', () => {
      const meta = Reflect.getMetadata(PERMISSIONS_KEY, ComprasController.prototype.crear);
      expect(meta).toEqual(['ticket:crear']);
    });
  });

  describe('GET /compras', () => {
    it('lista las compras resueltas con su ticket base', async () => {
      const { controller, listarComprasUseCase } = buildController();
      const ticket = makeTicket();
      const ticketCompra = TicketCompraEntity.create({ ticketId: ticket.id }, 'ticket-compra-uuid');
      listarComprasUseCase.execute.mockResolvedValue(Result.ok([{ ticket, ticketCompra }]));

      const result = await controller.listar();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ticket-compra-uuid');
    });
  });

  describe('GET /compras/:id (item 1 — G7)', () => {
    it('retorna el detalle embebiendo items + presupuestos', async () => {
      const { controller, obtenerCompraUseCase } = buildController();
      const ticket = makeTicket();
      const ticketCompra = TicketCompraEntity.create({ ticketId: ticket.id }, 'ticket-compra-uuid');
      const item = ItemCompraEntity.create({
        ticketCompraId: 'ticket-compra-uuid',
        descripcion: 'Notebook',
        cantidad: 2,
      }).getValue();
      const presupuesto = PresupuestoEntity.create({
        ticketCompraId: 'ticket-compra-uuid',
        proveedor: 'ACME',
        montoTotal: 1000,
        moneda: 'USD',
        fechaCotizacion: new Date('2026-01-01'),
      }).getValue();
      obtenerCompraUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, ticketCompra, items: [item], presupuestos: [presupuesto] }),
      );

      const result = await controller.obtener('ticket-uuid');

      expect(obtenerCompraUseCase.execute).toHaveBeenCalledWith('ticket-uuid');
      expect(result.id).toBe('ticket-compra-uuid');
      expect(result.items).toHaveLength(1);
      expect(result.presupuestos).toHaveLength(1);
    });

    it('compra inexistente → 404', async () => {
      const { controller, obtenerCompraUseCase } = buildController();
      obtenerCompraUseCase.execute.mockResolvedValue(
        Result.fail(new CompraNoEncontradaError('ticket-inexistente')),
      );

      await expect(controller.obtener('ticket-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /compras/:compraId/items', () => {
    it('agrega el item → 201', async () => {
      const { controller, agregarItemCompraUseCase } = buildController();
      const item = ItemCompraEntity.create({
        ticketCompraId: 'ticket-compra-uuid',
        descripcion: 'Notebook',
        cantidad: 2,
        unidad: null,
        precioUnitarioRef: null,
        observaciones: null,
      }).getValue();
      agregarItemCompraUseCase.execute.mockResolvedValue(Result.ok(item));

      const result = await controller.agregarItem('ticket-compra-uuid', {
        descripcion: 'Notebook',
        cantidad: 2,
      } as any);

      expect(result.id).toBe(item.id);
      expect(agregarItemCompraUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ ticketCompraId: 'ticket-compra-uuid', cantidad: 2 }),
      );
    });

    it('ticket_compra inexistente → 404', async () => {
      const { controller, agregarItemCompraUseCase } = buildController();
      agregarItemCompraUseCase.execute.mockResolvedValue(
        Result.fail(new CompraNoEncontradaError('ticket-compra-uuid')),
      );

      await expect(
        controller.agregarItem('ticket-compra-uuid', { descripcion: 'x', cantidad: 1 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('cantidad invalida → 422', async () => {
      const { controller, agregarItemCompraUseCase } = buildController();
      agregarItemCompraUseCase.execute.mockResolvedValue(Result.fail(new CantidadInvalidaError(0)));

      await expect(
        controller.agregarItem('ticket-compra-uuid', { descripcion: 'x', cantidad: 0 } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('declara @RequirePermissions("compra:gestionar")', () => {
      const meta = Reflect.getMetadata(PERMISSIONS_KEY, ComprasController.prototype.agregarItem);
      expect(meta).toEqual(['compra:gestionar']);
    });
  });

  describe('DELETE /compras/:compraId/items/:itemId', () => {
    it('elimina (soft delete) el item → sin body', async () => {
      const { controller, eliminarItemCompraUseCase } = buildController();
      eliminarItemCompraUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.eliminarItem('ticket-compra-uuid', 'item-uuid');

      expect(eliminarItemCompraUseCase.execute).toHaveBeenCalledWith({ itemId: 'item-uuid' });
    });

    it('item inexistente → 404', async () => {
      const { controller, eliminarItemCompraUseCase } = buildController();
      eliminarItemCompraUseCase.execute.mockResolvedValue(
        Result.fail(new ItemNoEncontradoError('item-uuid')),
      );

      await expect(controller.eliminarItem('ticket-compra-uuid', 'item-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('POST /compras/:compraId/presupuestos', () => {
    it('agrega el presupuesto → 201', async () => {
      const { controller, agregarPresupuestoUseCase } = buildController();
      const presupuesto = PresupuestoEntity.create({
        ticketCompraId: 'ticket-compra-uuid',
        proveedor: 'Proveedor SRL',
        montoTotal: 1000,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-01-01'),
        seleccionado: false,
        observaciones: null,
      }).getValue();
      agregarPresupuestoUseCase.execute.mockResolvedValue(Result.ok(presupuesto));

      const result = await controller.agregarPresupuesto('ticket-compra-uuid', {
        proveedor: 'Proveedor SRL',
        montoTotal: 1000,
        moneda: 'ARS',
        fechaCotizacion: '2026-01-01',
      } as any);

      expect(result.id).toBe(presupuesto.id);
    });

    it('moneda invalida → 422', async () => {
      const { controller, agregarPresupuestoUseCase } = buildController();
      agregarPresupuestoUseCase.execute.mockResolvedValue(
        Result.fail(new MonedaInvalidaError('XYZ')),
      );

      await expect(
        controller.agregarPresupuesto('ticket-compra-uuid', {
          proveedor: 'P',
          montoTotal: 1,
          moneda: 'XYZ',
          fechaCotizacion: '2026-01-01',
        } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('POST /compras/:compraId/presupuestos/:presupuestoId/seleccionar', () => {
    it('selecciona el presupuesto → 200', async () => {
      const { controller, seleccionarPresupuestoUseCase } = buildController();
      const presupuesto = PresupuestoEntity.create({
        ticketCompraId: 'ticket-compra-uuid',
        proveedor: 'Proveedor SRL',
        montoTotal: 1000,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-01-01'),
        seleccionado: true,
        observaciones: null,
      }).getValue();
      seleccionarPresupuestoUseCase.execute.mockResolvedValue(Result.ok(presupuesto));

      const result = await controller.seleccionarPresupuesto('ticket-compra-uuid', presupuesto.id);

      expect(result.seleccionado).toBe(true);
      expect(seleccionarPresupuestoUseCase.execute).toHaveBeenCalledWith({
        presupuestoId: presupuesto.id,
        ticketCompraId: 'ticket-compra-uuid',
      });
    });

    it('presupuesto inexistente → 404', async () => {
      const { controller, seleccionarPresupuestoUseCase } = buildController();
      seleccionarPresupuestoUseCase.execute.mockResolvedValue(
        Result.fail(new PresupuestoNoEncontradoError('no-existe')),
      );

      await expect(
        controller.seleccionarPresupuesto('ticket-compra-uuid', 'no-existe'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /compras/:compraId/presupuestos/:presupuestoId/adjuntos', () => {
    it('sube el adjunto → 201', async () => {
      const { controller, adjuntarPresupuestoUseCase } = buildController();
      const archivo = ArchivoEntity.create({
        storageKey: 'presupuestos/presupuesto-uuid/archivo-uuid',
        nombreOriginal: 'cotizacion.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: BigInt(2048),
        subidoPorId: 'usuario-uuid',
      }).getValue();
      adjuntarPresupuestoUseCase.execute.mockResolvedValue(Result.ok(archivo));

      const file = {
        originalname: 'cotizacion.pdf',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.from('x'),
      } as Express.Multer.File;

      const result = await controller.adjuntarPresupuesto('presupuesto-uuid', USER, file);

      expect(result.storageKey).toBe(archivo.storageKey);
      expect(adjuntarPresupuestoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ presupuestoId: 'presupuesto-uuid', subidoPorId: 'usuario-uuid' }),
      );
    });
  });

  describe('POST /compras/:id/aprobar', () => {
    it('aprueba la compra → 200, sin cambiar el estado del ticket (ADR-1)', async () => {
      const { controller, aprobarCompraUseCase } = buildController();
      const ticket = makeTicket();
      const ticketCompra = TicketCompraEntity.create({ ticketId: ticket.id }, 'ticket-compra-uuid');
      ticketCompra.aprobar('usuario-uuid', new Date());
      aprobarCompraUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketCompra }));

      const result = await controller.aprobar('ticket-uuid', USER);

      expect(result.aprobadoPorId).toBe('usuario-uuid');
      expect(aprobarCompraUseCase.execute).toHaveBeenCalledWith({
        ticketId: 'ticket-uuid',
        aprobadoPorId: 'usuario-uuid',
      });
    });

    it('doble decision → 422', async () => {
      const { controller, aprobarCompraUseCase } = buildController();
      const { CompraYaDecididaError } = await import('../../domain/errors/compras.errors');
      aprobarCompraUseCase.execute.mockResolvedValue(
        Result.fail(new CompraYaDecididaError('ticket-compra-uuid')),
      );

      await expect(controller.aprobar('ticket-uuid', USER)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('declara @RequirePermissions("compra:aprobar")', () => {
      const meta = Reflect.getMetadata(PERMISSIONS_KEY, ComprasController.prototype.aprobar);
      expect(meta).toEqual(['compra:aprobar']);
    });
  });

  describe('POST /compras/:id/rechazar', () => {
    it('rechaza la compra → 200, ticket transicionado a CANCELADO', async () => {
      const { controller, rechazarCompraUseCase } = buildController();
      const ticket = makeTicket();
      ticket.updateEstado('estado-cancelado-uuid');
      const ticketCompra = TicketCompraEntity.create({ ticketId: ticket.id }, 'ticket-compra-uuid');
      ticketCompra.rechazar('usuario-uuid', new Date(), 'Motivo');
      rechazarCompraUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketCompra }));

      const result = await controller.rechazar(
        'ticket-uuid',
        { motivoRechazo: 'Motivo' } as any,
        USER,
      );

      expect(result.estadoId).toBe('estado-cancelado-uuid');
      expect(result.motivoRechazo).toBe('Motivo');
    });

    it('motivo vacio → 422', async () => {
      const { controller, rechazarCompraUseCase } = buildController();
      rechazarCompraUseCase.execute.mockResolvedValue(
        Result.fail(new MotivoRechazoRequeridoError()),
      );

      await expect(
        controller.rechazar('ticket-uuid', { motivoRechazo: '' } as any, USER),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('declara @RequirePermissions("ticket:rechazar")', () => {
      const meta = Reflect.getMetadata(PERMISSIONS_KEY, ComprasController.prototype.rechazar);
      expect(meta).toEqual(['ticket:rechazar']);
    });
  });
});
