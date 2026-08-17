/**
 * compras.controller.spec.ts — PR-21 (sdd/redisenio-modulo-compras, Fase E).
 *
 * Unit test: instancia `ComprasController` directamente con los 10 use cases
 * de comando mockeados (sin bootstrapear NestJS ni pasar por guards reales de
 * infraestructura HTTP — mismo patrón que `equipos.controller.spec.ts`/
 * `reparaciones.controller.spec.ts`), salvo en el bloque "RBAC — guard real"
 * donde `AccionesGuard` se instancia REAL (con un `Reflector` REAL) para
 * probar S38/S39/S11/S40 contra la metadata REAL de la clase — no un mock de
 * lo que el guard "debería" hacer (WU-7.3, sdd/matriz-permisos-por-usuario).
 *
 * Cubre:
 * 1. Traducción HTTP ↔ use case de los 10 comandos (DTO → execute(), Result → response DTO).
 * 2. `toHttpException`: los 25 errores del catálogo (`compras.errors.ts`, spec
 *    §5) → la `HttpException` que su propio JSDoc declara. El número (19, no
 *    16 — ver `sdd/redisenio-modulo-compras/tasks`) se deriva CONTANDO las
 *    clases exportadas de `compras.errors.ts`, no se tipea a mano.
 * 3. RBAC (§4.11): metadata `@RequiereAcciones` (WU-7.3), y guard REAL para
 *    S38/S39 (TECNICO → 403 en gestionar/aprobar), S11 (gestionar sin
 *    aprobar → 403 al aprobar/rechazar), S40 (ROOT bypassea).
 *
 * `numero`/`solicitanteId`/`cicloId` NUNCA se leen del `body` — verificado
 * indirectamente: el `execute()` de `CrearCompraUseCase` NUNCA recibe
 * `cicloId` desde este controller (lo resuelve el use case internamente,
 * PR-14), y `solicitanteId` SIEMPRE es `user.sub`, nunca `dto.solicitanteId`
 * (el DTO ni siquiera tiene ese campo, PR-20).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1-§4.8, §4.11, §5. Tarea: PR-21.
 */
import 'reflect-metadata';
import {
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ComprasController, toHttpException } from './compras.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { DomainError, Result } from '../../../shared/domain/result';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import * as ComprasErrors from '../../domain/errors/compras.errors';
import {
  CantidadOrdenadaExcedeSolicitadaError,
  CantidadOrdenadaRetrocedeError,
  CantidadRecibidaExcedeOrdenadaError,
  CantidadRecibidaRetrocedeError,
  CantidadEntregadaExcedeRecibidaError,
  CantidadEntregadaRetrocedeError,
  CompraCanceladaError,
  CompraConOrdenEmitidaError,
  CompraNoEncontradaError,
  CompraNoPendienteError,
  CompraYaCanceladaError,
  CompraYaCerradaError,
  EtapaNoRegistradaError,
  FechaEtapaFuturaError,
  FechaEtapasFueraDeOrdenError,
  SectorInexistenteError,
  ItemCompraAprobadoNoEliminableError,
  ItemCompraCongeladoError,
  ItemCompraNoAprobadoError,
  ItemCompraNoEncontradoError,
  ItemCompraYaCerradoError,
  ItemCompraYaDecididoError,
  ItemSinFaltanteError,
  MotivoCierreFaltanteRequeridoError,
  NumeradorCompraAgotadoError,
  SinCicloActivoError,
} from '../../domain/errors/compras.errors';

type Ctor = ConstructorParameters<typeof ComprasController>;

const USUARIO: JwtPayload = payloadDeTest({
  sub: 'usuario-1',
  cliente_id: 'cliente-1',
  rol: 'ADMINISTRADOR',
  permisos: ['compra:gestionar', 'compra:aprobar'],
  cliente_nombre: 'Cliente 1',
  modulos: ['COMPRAS'],
  nombre: 'Ana',
  apellido: 'Gómez',
});

function buildController() {
  const crearCompraUseCase = { execute: vi.fn() };
  const agregarItemCompraUseCase = { execute: vi.fn() };
  const editarCompraUseCase = { execute: vi.fn() };
  const editarItemCompraUseCase = { execute: vi.fn() };
  const eliminarItemCompraUseCase = { execute: vi.fn() };
  const aprobarItemCompraUseCase = { execute: vi.fn() };
  const rechazarItemCompraUseCase = { execute: vi.fn() };
  const registrarOrdenDeItemUseCase = { execute: vi.fn() };
  const registrarRecepcionDeItemUseCase = { execute: vi.fn() };
  const registrarEntregaDeItemUseCase = { execute: vi.fn() };
  const editarFechaEtapaDeItemUseCase = { execute: vi.fn() };
  const cerrarItemConFaltanteUseCase = { execute: vi.fn() };
  const cancelarCompraUseCase = { execute: vi.fn() };
  const listarComprasUseCase = { execute: vi.fn() };
  const obtenerCompraUseCase = { execute: vi.fn() };
  const listarOperacionesCompraUseCase = { execute: vi.fn() };

  const controller = new ComprasController(
    crearCompraUseCase as unknown as Ctor[0],
    agregarItemCompraUseCase as unknown as Ctor[1],
    editarCompraUseCase as unknown as Ctor[2],
    editarItemCompraUseCase as unknown as Ctor[3],
    eliminarItemCompraUseCase as unknown as Ctor[4],
    aprobarItemCompraUseCase as unknown as Ctor[5],
    rechazarItemCompraUseCase as unknown as Ctor[6],
    registrarOrdenDeItemUseCase as unknown as Ctor[7],
    registrarRecepcionDeItemUseCase as unknown as Ctor[8],
    registrarEntregaDeItemUseCase as unknown as Ctor[9],
    editarFechaEtapaDeItemUseCase as unknown as Ctor[10],
    cerrarItemConFaltanteUseCase as unknown as Ctor[11],
    cancelarCompraUseCase as unknown as Ctor[12],
    listarComprasUseCase as unknown as Ctor[13],
    obtenerCompraUseCase as unknown as Ctor[14],
    listarOperacionesCompraUseCase as unknown as Ctor[15],
  );

  return {
    controller,
    crearCompraUseCase,
    agregarItemCompraUseCase,
    editarCompraUseCase,
    editarItemCompraUseCase,
    eliminarItemCompraUseCase,
    aprobarItemCompraUseCase,
    rechazarItemCompraUseCase,
    registrarOrdenDeItemUseCase,
    registrarRecepcionDeItemUseCase,
    registrarEntregaDeItemUseCase,
    editarFechaEtapaDeItemUseCase,
    cerrarItemConFaltanteUseCase,
    cancelarCompraUseCase,
    listarComprasUseCase,
    obtenerCompraUseCase,
    listarOperacionesCompraUseCase,
  };
}

/** Ítem PENDIENTE mínimo, válido según `ItemCompraEntity.create()`. */
function buildItem(id = 'item-1'): ItemCompraEntity {
  return ItemCompraEntity.create(
    {
      compraId: 'compra-1',
      descripcion: 'Notebook Dell',
      cantidad: 2,
      proveedor: 'Proveedor SA',
      monto: 1000,
      moneda: 'ARS',
      fechaCotizacion: new Date('2026-08-13'),
      observaciones: null,
    },
    id,
  );
}

/** Compra PENDIENTE (n=0), válida según `CompraEntity.create()`. */
function buildCompra(id = 'compra-1'): CompraEntity {
  return CompraEntity.create(
    {
      numero: 'COM-2026-00001',
      fechaSolicitud: new Date('2026-08-13'),
      motivo: 'Reposición de notebooks',
      descripcion: null,
      solicitanteId: USUARIO.sub,
      cicloId: 'ciclo-1',
    },
    id,
  );
}

describe('ComprasController — traducción HTTP ↔ use case (PR-21)', () => {
  describe('POST /compras', () => {
    it('crea la compra: solicitanteId=JWT.sub, anio=servidor, SIN cicloId (lo resuelve el use case) → 201 + detalle', async () => {
      const { controller, crearCompraUseCase } = buildController();
      crearCompraUseCase.execute.mockResolvedValue(Result.ok(buildCompra()));

      const res = await controller.crear(USUARIO, {
        motivo: 'Reposición de notebooks',
        fechaSolicitud: '2026-08-13',
      });

      expect(crearCompraUseCase.execute).toHaveBeenCalledWith({
        motivo: 'Reposición de notebooks',
        descripcion: null,
        fechaSolicitud: new Date('2026-08-13'),
        solicitanteId: 'usuario-1',
        anio: new Date().getFullYear(),
        sectorId: null,
      });
      expect(res.id).toBe('compra-1');
      expect(res.items).toEqual([]);
    });

    it('S66 (WU-09): sectorId del body se pasa al use case', async () => {
      const { controller, crearCompraUseCase } = buildController();
      crearCompraUseCase.execute.mockResolvedValue(Result.ok(buildCompra()));

      await controller.crear(USUARIO, {
        motivo: 'Reposición de notebooks',
        fechaSolicitud: '2026-08-13',
        sectorId: 'sector-1',
      });

      expect(crearCompraUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ sectorId: 'sector-1' }),
      );
    });
  });

  describe('POST /compras/:id/items', () => {
    it('agrega un ítem: usuarioId=JWT.sub, observaciones ausente → null → 201 + detalle con el ítem', async () => {
      const { controller, agregarItemCompraUseCase } = buildController();
      const compra = buildCompra();
      compra.agregarItem({
        descripcion: 'Notebook Dell',
        cantidad: 2,
        proveedor: 'Proveedor SA',
        monto: 1000,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-08-13'),
        observaciones: null,
      });
      agregarItemCompraUseCase.execute.mockResolvedValue(Result.ok(compra));

      const res = await controller.agregarItem(USUARIO, 'compra-1', {
        descripcion: 'Notebook Dell',
        cantidad: 2,
        proveedor: 'Proveedor SA',
        monto: 1000,
        moneda: 'ARS',
        fechaCotizacion: '2026-08-13',
      });

      expect(agregarItemCompraUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        usuarioId: 'usuario-1',
        descripcion: 'Notebook Dell',
        cantidad: 2,
        proveedor: 'Proveedor SA',
        monto: 1000,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-08-13'),
        observaciones: null,
      });
      expect(res.items).toHaveLength(1);
    });
  });

  describe('PATCH /compras/:id', () => {
    it('PATCH parcial de cabecera: campos ausentes viajan como undefined, no como Invalid Date', async () => {
      const { controller, editarCompraUseCase } = buildController();
      editarCompraUseCase.execute.mockResolvedValue(Result.ok(buildCompra()));

      const res = await controller.editar(USUARIO, 'compra-1', { motivo: 'Motivo nuevo' });

      expect(editarCompraUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        usuarioId: 'usuario-1',
        motivo: 'Motivo nuevo',
        descripcion: undefined,
        fechaSolicitud: undefined,
        sectorId: undefined,
      });
      expect(res.id).toBe('compra-1');
    });

    it('fechaSolicitud viaja como Date; descripcion/sectorId en null se preservan como null (limpiar ≠ ausente)', async () => {
      const { controller, editarCompraUseCase } = buildController();
      editarCompraUseCase.execute.mockResolvedValue(Result.ok(buildCompra()));

      await controller.editar(USUARIO, 'compra-1', {
        fechaSolicitud: '2026-09-01',
        descripcion: null,
        sectorId: null,
      });

      expect(editarCompraUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        usuarioId: 'usuario-1',
        motivo: undefined,
        descripcion: null,
        fechaSolicitud: new Date('2026-09-01'),
        sectorId: null,
      });
    });
  });

  describe('PATCH /compras/:id/items/:itemId', () => {
    it('PATCH parcial: campos ausentes viajan como undefined (no tocan el campo), no como Invalid Date', async () => {
      const { controller, editarItemCompraUseCase } = buildController();
      editarItemCompraUseCase.execute.mockResolvedValue(Result.ok(buildItem()));

      const res = await controller.editarItem(USUARIO, 'compra-1', 'item-1', {
        proveedor: 'Nuevo Proveedor',
      });

      expect(editarItemCompraUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
        descripcion: undefined,
        cantidad: undefined,
        proveedor: 'Nuevo Proveedor',
        monto: undefined,
        moneda: undefined,
        fechaCotizacion: undefined,
        observaciones: undefined,
      });
      expect(res.id).toBe('item-1');
    });
  });

  describe('DELETE /compras/:id/items/:itemId', () => {
    it('elimina (soft delete) un ítem: usuarioId=JWT.sub, sin body de respuesta (204)', async () => {
      const { controller, eliminarItemCompraUseCase } = buildController();
      eliminarItemCompraUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const res = await controller.eliminarItem(USUARIO, 'compra-1', 'item-1');

      expect(eliminarItemCompraUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
      });
      expect(res).toBeUndefined();
    });
  });

  describe('POST /compras/:id/items/:itemId/aprobar', () => {
    it('aprueba el ítem: usuarioId=JWT.sub → estadoAprobacion=APROBADO en la respuesta', async () => {
      const { controller, aprobarItemCompraUseCase } = buildController();
      const item = buildItem();
      item.aprobar('usuario-1');
      aprobarItemCompraUseCase.execute.mockResolvedValue(Result.ok(item));

      const res = await controller.aprobarItem(USUARIO, 'compra-1', 'item-1');

      expect(aprobarItemCompraUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
      });
      expect(res.estadoAprobacion).toBe('APROBADO');
      expect(res.decididoPorId).toBe('usuario-1');
    });
  });

  describe('POST /compras/:id/items/:itemId/rechazar', () => {
    it('rechaza el ítem: usuarioId=JWT.sub → estadoAprobacion=RECHAZADO en la respuesta', async () => {
      const { controller, rechazarItemCompraUseCase } = buildController();
      const item = buildItem();
      item.rechazar('usuario-1');
      rechazarItemCompraUseCase.execute.mockResolvedValue(Result.ok(item));

      const res = await controller.rechazarItem(USUARIO, 'compra-1', 'item-1');

      expect(rechazarItemCompraUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
      });
      expect(res.estadoAprobacion).toBe('RECHAZADO');
    });
  });

  describe('POST /compras/:id/items/:itemId/registrar-orden', () => {
    it('registra el acumulado de cantidad ordenada (no un delta), con fecha opcional', async () => {
      const { controller, registrarOrdenDeItemUseCase } = buildController();
      const item = buildItem();
      item.aprobar('aprobador-1');
      item.registrarOrden(1, new Date('2026-08-14'));
      registrarOrdenDeItemUseCase.execute.mockResolvedValue(Result.ok(item));

      const res = await controller.registrarOrdenDeItem(USUARIO, 'compra-1', 'item-1', {
        cantidadOrdenada: 1,
        fecha: '2026-08-14',
      });

      expect(registrarOrdenDeItemUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
        cantidadOrdenada: 1,
        fecha: new Date('2026-08-14'),
      });
      expect(res.cantidadOrdenada).toBe(1);
    });

    it('sin fecha en el body, no pasa fecha al use case (la entidad prellena con hoy)', async () => {
      const { controller, registrarOrdenDeItemUseCase } = buildController();
      const item = buildItem();
      item.aprobar('aprobador-1');
      item.registrarOrden(1);
      registrarOrdenDeItemUseCase.execute.mockResolvedValue(Result.ok(item));

      await controller.registrarOrdenDeItem(USUARIO, 'compra-1', 'item-1', {
        cantidadOrdenada: 1,
      });

      expect(registrarOrdenDeItemUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
        cantidadOrdenada: 1,
      });
    });
  });

  describe('POST /compras/:id/items/:itemId/registrar-recepcion', () => {
    it('registra el acumulado de cantidad recibida (no un delta) — rename de ruta WU-24', async () => {
      const { controller, registrarRecepcionDeItemUseCase } = buildController();
      const item = buildItem();
      item.aprobar('aprobador-1');
      item.registrarOrden(2, new Date('2026-08-14'));
      item.registrarRecepcion(1, new Date('2026-08-15'));
      registrarRecepcionDeItemUseCase.execute.mockResolvedValue(Result.ok(item));

      const res = await controller.registrarRecepcionDeItem(USUARIO, 'compra-1', 'item-1', {
        cantidadRecibida: 1,
        fecha: '2026-08-15',
      });

      expect(registrarRecepcionDeItemUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
        cantidadRecibida: 1,
        fecha: new Date('2026-08-15'),
      });
      expect(res.cantidadRecibida).toBe(1);
    });
  });

  describe('POST /compras/:id/items/:itemId/registrar-entrega', () => {
    it('registra el acumulado de cantidad entregada (no un delta)', async () => {
      const { controller, registrarEntregaDeItemUseCase } = buildController();
      const item = buildItem();
      item.aprobar('aprobador-1');
      item.registrarOrden(2, new Date('2026-08-14'));
      item.registrarRecepcion(2, new Date('2026-08-15'));
      item.registrarEntrega(1, new Date('2026-08-16'));
      registrarEntregaDeItemUseCase.execute.mockResolvedValue(Result.ok(item));

      const res = await controller.registrarEntregaDeItem(USUARIO, 'compra-1', 'item-1', {
        cantidadEntregada: 1,
      });

      expect(registrarEntregaDeItemUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
        cantidadEntregada: 1,
      });
      expect(res.cantidadEntregada).toBe(1);
    });
  });

  describe('PATCH /compras/:id/items/:itemId/fecha-etapa', () => {
    it('edita la fecha de una etapa ya registrada', async () => {
      const { controller, editarFechaEtapaDeItemUseCase } = buildController();
      const item = buildItem();
      item.aprobar('aprobador-1');
      item.registrarOrden(1, new Date('2026-08-14'));
      editarFechaEtapaDeItemUseCase.execute.mockResolvedValue(Result.ok(item));

      const res = await controller.editarFechaEtapaDeItem(USUARIO, 'compra-1', 'item-1', {
        etapa: 'ORDEN',
        fecha: '2026-08-13',
      });

      expect(editarFechaEtapaDeItemUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
        etapa: 'ORDEN',
        fecha: new Date('2026-08-13'),
      });
      expect(res.id).toBe('item-1');
    });
  });

  describe('POST /compras/:id/items/:itemId/cerrar-con-faltante', () => {
    it('cierra el ítem con faltante: motivo obligatorio viaja al use case', async () => {
      const { controller, cerrarItemConFaltanteUseCase } = buildController();
      const item = buildItem();
      item.aprobar('aprobador-1');
      item.registrarOrden(2, new Date('2026-08-14'));
      item.registrarRecepcion(1, new Date('2026-08-15')); // 1 < cantidad (2) → faltante real
      item.cerrarConFaltante('Proveedor sin stock');
      cerrarItemConFaltanteUseCase.execute.mockResolvedValue(Result.ok(item));

      const res = await controller.cerrarItemConFaltante(USUARIO, 'compra-1', 'item-1', {
        motivo: 'Proveedor sin stock',
      });

      expect(cerrarItemConFaltanteUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
        motivo: 'Proveedor sin stock',
      });
      expect(res.cerradoConFaltante).toBe(true);
      // S22: comprado/entregado pasan a true pese al faltante (cláusula OR).
      expect(res.comprado).toBe(true);
      expect(res.entregado).toBe(true);
    });
  });

  describe('POST /compras/:id/cancelar', () => {
    it('cancela la compra: motivo viaja al use case, usuarioId=JWT.sub', async () => {
      const { controller, cancelarCompraUseCase } = buildController();
      const compra = buildCompra();
      compra.cancelar('usuario-1', 'Presupuesto recortado');
      cancelarCompraUseCase.execute.mockResolvedValue(Result.ok(compra));

      const res = await controller.cancelar(USUARIO, 'compra-1', {
        motivo: 'Presupuesto recortado',
      });

      expect(cancelarCompraUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        usuarioId: 'usuario-1',
        motivo: 'Presupuesto recortado',
      });
      expect(res.canceladaEn).not.toBeNull();
      expect(res.motivoCancelacion).toBe('Presupuesto recortado');
    });
  });

  describe('GET /compras (PR-22)', () => {
    it('lista paginado: pasa pagina/porPagina de la query al use case, mapea al response DTO CON total, SIN items por compra (S33)', async () => {
      const { controller, listarComprasUseCase } = buildController();
      listarComprasUseCase.execute.mockResolvedValue(
        Result.ok({
          items: [
            {
              id: 'compra-1',
              numero: 'COM-2026-00001',
              fechaSolicitud: new Date('2026-08-13'),
              motivo: 'Reposición de notebooks',
              estado: 'PENDIENTE',
              comprado: false,
              cerrado: false,
              totalesPorMoneda: { ARS: 2000 },
            },
          ],
          total: 1,
          pagina: 1,
          porPagina: 20,
        }),
      );

      const res = await controller.listar({ pagina: 1, porPagina: 20 });

      expect(listarComprasUseCase.execute).toHaveBeenCalledWith({ pagina: 1, porPagina: 20 });
      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).not.toHaveProperty('items');
    });

    it('WU-14: los 5 filtros de negocio de la query se pasan al use case', async () => {
      const { controller, listarComprasUseCase } = buildController();
      listarComprasUseCase.execute.mockResolvedValue(
        Result.ok({ items: [], total: 0, pagina: 1, porPagina: 20 }),
      );

      await controller.listar({
        cicloId: 'ciclo-1',
        soloEnCurso: false,
        sectorId: 'sector-1',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-12-31',
      });

      expect(listarComprasUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          cicloId: 'ciclo-1',
          soloEnCurso: false,
          sectorId: 'sector-1',
          fechaDesde: new Date('2026-01-01'),
          fechaHasta: new Date('2026-12-31'),
        }),
      );
    });
  });

  describe('GET /compras/:id (PR-22)', () => {
    it('detalle: retorna la compra CON ítems (a diferencia del listado, S33)', async () => {
      const { controller, obtenerCompraUseCase } = buildController();
      const compra = buildCompra();
      compra.agregarItem({
        descripcion: 'Notebook Dell',
        cantidad: 2,
        proveedor: 'Proveedor SA',
        monto: 1000,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-08-13'),
        observaciones: null,
      });
      obtenerCompraUseCase.execute.mockResolvedValue(Result.ok(compra));

      const res = await controller.obtener('compra-1');

      expect(obtenerCompraUseCase.execute).toHaveBeenCalledWith({ compraId: 'compra-1' });
      expect(res.id).toBe('compra-1');
      expect(res.items).toHaveLength(1);
    });

    it('404 si la compra no existe/no es visible', async () => {
      const { controller, obtenerCompraUseCase } = buildController();
      obtenerCompraUseCase.execute.mockResolvedValue(
        Result.fail(new CompraNoEncontradaError('compra-1')),
      );

      await expect(controller.obtener('compra-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('GET /compras/:id/operaciones (PR-22)', () => {
    it('lista la bitácora completa de la compra (§4.10)', async () => {
      const { controller, listarOperacionesCompraUseCase } = buildController();
      listarOperacionesCompraUseCase.execute.mockResolvedValue(
        Result.ok([
          {
            id: 'op-1',
            compraId: 'compra-1',
            itemCompraId: null,
            tipo: 'CREACION',
            usuarioId: 'usuario-1',
            detalle: 'Compra "COM-2026-00001" creada.',
            datos: null,
            createdAt: new Date('2026-08-13'),
          },
        ]),
      );

      const res = await controller.listarOperaciones('compra-1');

      expect(listarOperacionesCompraUseCase.execute).toHaveBeenCalledWith({ compraId: 'compra-1' });
      expect(res).toHaveLength(1);
      expect(res[0].tipo).toBe('CREACION');
    });

    it('404 si la compra no existe/no es visible', async () => {
      const { controller, listarOperacionesCompraUseCase } = buildController();
      listarOperacionesCompraUseCase.execute.mockResolvedValue(
        Result.fail(new CompraNoEncontradaError('compra-1')),
      );

      await expect(controller.listarOperaciones('compra-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

describe('ComprasController — propagación de errores (nunca 500 silencioso)', () => {
  type CasoPropagacion = {
    nombre: string;
    useCase: keyof ReturnType<typeof buildController> & `${string}UseCase`;
    invocar: (controller: ComprasController) => Promise<unknown>;
  };

  const CASOS: CasoPropagacion[] = [
    {
      nombre: 'crear',
      useCase: 'crearCompraUseCase',
      invocar: (c) => c.crear(USUARIO, { motivo: 'x', fechaSolicitud: '2026-08-13' }),
    },
    {
      nombre: 'agregarItem',
      useCase: 'agregarItemCompraUseCase',
      invocar: (c) =>
        c.agregarItem(USUARIO, 'compra-1', {
          descripcion: 'x',
          cantidad: 1,
          proveedor: 'p',
          monto: 1,
          moneda: 'ARS',
          fechaCotizacion: '2026-08-13',
        }),
    },
    {
      nombre: 'editarItem',
      useCase: 'editarItemCompraUseCase',
      invocar: (c) => c.editarItem(USUARIO, 'compra-1', 'item-1', {}),
    },
    {
      nombre: 'editar',
      useCase: 'editarCompraUseCase',
      invocar: (c) => c.editar(USUARIO, 'compra-1', {}),
    },
    {
      nombre: 'eliminarItem',
      useCase: 'eliminarItemCompraUseCase',
      invocar: (c) => c.eliminarItem(USUARIO, 'compra-1', 'item-1'),
    },
    {
      nombre: 'aprobarItem',
      useCase: 'aprobarItemCompraUseCase',
      invocar: (c) => c.aprobarItem(USUARIO, 'compra-1', 'item-1'),
    },
    {
      nombre: 'rechazarItem',
      useCase: 'rechazarItemCompraUseCase',
      invocar: (c) => c.rechazarItem(USUARIO, 'compra-1', 'item-1'),
    },
    {
      nombre: 'registrarOrdenDeItem',
      useCase: 'registrarOrdenDeItemUseCase',
      invocar: (c) =>
        c.registrarOrdenDeItem(USUARIO, 'compra-1', 'item-1', { cantidadOrdenada: 1 }),
    },
    {
      nombre: 'registrarRecepcionDeItem',
      useCase: 'registrarRecepcionDeItemUseCase',
      invocar: (c) =>
        c.registrarRecepcionDeItem(USUARIO, 'compra-1', 'item-1', { cantidadRecibida: 1 }),
    },
    {
      nombre: 'registrarEntregaDeItem',
      useCase: 'registrarEntregaDeItemUseCase',
      invocar: (c) =>
        c.registrarEntregaDeItem(USUARIO, 'compra-1', 'item-1', { cantidadEntregada: 1 }),
    },
    {
      nombre: 'cerrarItemConFaltante',
      useCase: 'cerrarItemConFaltanteUseCase',
      invocar: (c) => c.cerrarItemConFaltante(USUARIO, 'compra-1', 'item-1', { motivo: 'x' }),
    },
    {
      nombre: 'cancelar',
      useCase: 'cancelarCompraUseCase',
      invocar: (c) => c.cancelar(USUARIO, 'compra-1', { motivo: 'x' }),
    },
    {
      nombre: 'obtener',
      useCase: 'obtenerCompraUseCase',
      invocar: (c) => c.obtener('compra-1'),
    },
    {
      nombre: 'listarOperaciones',
      useCase: 'listarOperacionesCompraUseCase',
      invocar: (c) => c.listarOperaciones('compra-1'),
    },
  ];

  it.each(CASOS)(
    '$nombre: Result.fail(CompraNoEncontradaError) → NotFoundException (no 500)',
    async ({ useCase, invocar }) => {
      const stubs = buildController();
      (stubs[useCase] as { execute: ReturnType<typeof vi.fn> }).execute.mockResolvedValue(
        Result.fail(new CompraNoEncontradaError('compra-1')),
      );

      await expect(invocar(stubs.controller)).rejects.toBeInstanceOf(NotFoundException);
    },
  );
});

describe('toHttpException — catálogo de errores → HTTP (spec §5)', () => {
  /** Clases de error exportadas por `compras.errors.ts` — el número de la verdad, no un literal a mano. */
  const CLASES_DE_ERROR = Object.values(ComprasErrors).filter(
    (valor): valor is new (...args: never[]) => DomainError =>
      typeof valor === 'function' && valor.prototype instanceof DomainError,
  );

  it('el catálogo tiene EXACTAMENTE 26 clases de error (2×409 + 2×404 + 22×422, fix W3+W6 + editar cabecera)', () => {
    expect(CLASES_DE_ERROR).toHaveLength(26);
  });

  const TABLA: Array<[string, () => DomainError, 404 | 409 | 422]> = [
    ['SinCicloActivoError', () => new SinCicloActivoError(), 409],
    ['NumeradorCompraAgotadoError', () => new NumeradorCompraAgotadoError(2026), 409],
    ['CompraNoEncontradaError', () => new CompraNoEncontradaError('compra-1'), 404],
    ['ItemCompraNoEncontradoError', () => new ItemCompraNoEncontradoError('item-1'), 404],
    ['CompraCanceladaError', () => new CompraCanceladaError('compra-1'), 422],
    ['CompraNoPendienteError', () => new CompraNoPendienteError('compra-1'), 422],
    ['CompraYaCanceladaError', () => new CompraYaCanceladaError('compra-1'), 422],
    ['CompraYaCerradaError', () => new CompraYaCerradaError('compra-1'), 422],
    ['CompraConOrdenEmitidaError', () => new CompraConOrdenEmitidaError('compra-1'), 422],
    [
      'ItemCompraAprobadoNoEliminableError',
      () => new ItemCompraAprobadoNoEliminableError('item-1'),
      422,
    ],
    ['ItemCompraYaDecididoError', () => new ItemCompraYaDecididoError('item-1'), 422],
    ['ItemCompraCongeladoError', () => new ItemCompraCongeladoError('item-1'), 422],
    ['ItemCompraNoAprobadoError', () => new ItemCompraNoAprobadoError('item-1'), 422],
    [
      'CantidadOrdenadaExcedeSolicitadaError',
      () => new CantidadOrdenadaExcedeSolicitadaError('item-1'),
      422,
    ],
    ['CantidadOrdenadaRetrocedeError', () => new CantidadOrdenadaRetrocedeError('item-1'), 422],
    [
      'CantidadRecibidaExcedeOrdenadaError',
      () => new CantidadRecibidaExcedeOrdenadaError('item-1'),
      422,
    ],
    ['CantidadRecibidaRetrocedeError', () => new CantidadRecibidaRetrocedeError('item-1'), 422],
    [
      'CantidadEntregadaExcedeRecibidaError',
      () => new CantidadEntregadaExcedeRecibidaError('item-1'),
      422,
    ],
    ['CantidadEntregadaRetrocedeError', () => new CantidadEntregadaRetrocedeError('item-1'), 422],
    ['ItemCompraYaCerradoError', () => new ItemCompraYaCerradoError('item-1'), 422],
    ['ItemSinFaltanteError', () => new ItemSinFaltanteError('item-1'), 422],
    [
      'MotivoCierreFaltanteRequeridoError',
      () => new MotivoCierreFaltanteRequeridoError('item-1'),
      422,
    ],
    ['FechaEtapaFuturaError', () => new FechaEtapaFuturaError('item-1'), 422],
    ['FechaEtapasFueraDeOrdenError', () => new FechaEtapasFueraDeOrdenError('item-1'), 422],
    ['EtapaNoRegistradaError', () => new EtapaNoRegistradaError('item-1', 'ENTREGA'), 422],
    ['SectorInexistenteError', () => new SectorInexistenteError('sector-1'), 422],
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
    } else if (httpEsperado === 409) {
      expect(excepcion).toBeInstanceOf(ConflictException);
    } else {
      expect(excepcion).toBeInstanceOf(UnprocessableEntityException);
    }
  });
});

describe('RBAC — metadata (§4.11, WU-7.3 sdd/matriz-permisos-por-usuario)', () => {
  it.each([
    ['crear', ['COMPRAS:ALTAS']],
    ['agregarItem', ['COMPRAS:ALTAS']],
    ['editarItem', ['COMPRAS:MODIFICACION']],
    ['eliminarItem', ['COMPRAS:BORRADO']],
    ['registrarOrdenDeItem', ['COMPRAS:MODIFICACION']],
    ['registrarRecepcionDeItem', ['COMPRAS:MODIFICACION']],
    ['registrarEntregaDeItem', ['COMPRAS:MODIFICACION']],
    ['editarFechaEtapaDeItem', ['COMPRAS:MODIFICACION']],
    ['cerrarItemConFaltante', ['COMPRAS:MODIFICACION']],
    ['cancelar', ['COMPRAS:BORRADO']],
    ['aprobarItem', ['COMPRAS:APROBACION']],
    ['rechazarItem', ['COMPRAS:APROBACION']],
    ['listar', ['COMPRAS:LECTURA']],
    ['obtener', ['COMPRAS:LECTURA']],
    ['listarOperaciones', ['COMPRAS:LECTURA']],
  ] as const)('%s requiere @RequiereAcciones(%s)', (metodo, codigos) => {
    const handler = ComprasController.prototype[
      metodo as keyof typeof ComprasController.prototype
    ] as unknown as (...args: unknown[]) => unknown;
    const meta = Reflect.getMetadata(ACCIONES_KEY, handler);
    expect(meta).toEqual(codigos);
  });
});

describe('RBAC — guard real: S38/S39/S11/S40 (§4.11, AccionesGuard + Reflector reales sobre metadata real)', () => {
  const reflector = new Reflector();
  const guard = new AccionesGuard(reflector);

  function buildContext(
    handler: (...args: unknown[]) => unknown,
    user: JwtPayload | null,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => handler,
      getClass: () => ComprasController,
    } as unknown as ExecutionContext;
  }

  /**
   * Celdas representativas de TECNICO tras el backfill de WU-4 (mismo
   * criterio que S15/decision-modulos-mandan): tiene TICKETS/EDILICIA/EQUIPOS
   * completos y SOLO `COMPRAS:LECTURA` (viene del eje de módulos, no de
   * `roles_permisos`) — sin ningún `COMPRAS:ALTAS/MODIFICACION/BORRADO/
   * APROBACION`, que es exactamente lo que S38/S39 verifican.
   */
  const TECNICO: JwtPayload = payloadDeTest({
    sub: 'tecnico-1',
    cliente_id: 'cliente-1',
    rol: 'TECNICO',
    permisos: [
      'TICKETS:ALTAS',
      'TICKETS:MODIFICACION',
      'TICKETS:TRANSICIONAR',
      'TICKETS:ASIGNAR',
      'TICKETS:COMENTAR',
      'TICKETS:OBSERVAR',
      'EDILICIA:ALTAS',
      'EDILICIA:MODIFICACION',
      'EDILICIA:BORRADO',
      'EQUIPOS:ALTAS',
      'EQUIPOS:MODIFICACION',
      'EQUIPOS:BORRADO',
      'COMPRAS:LECTURA',
    ],
    cliente_nombre: 'Cliente 1',
    modulos: ['TICKETS', 'COMPRAS', 'EDILICIA', 'EQUIPOS'],
    nombre: 'Técnico',
    apellido: 'Uno',
  });

  const METODOS_GESTIONAR = [
    'crear',
    'agregarItem',
    'editarItem',
    'eliminarItem',
    'registrarOrdenDeItem',
    'registrarRecepcionDeItem',
    'registrarEntregaDeItem',
    'editarFechaEtapaDeItem',
    'cerrarItemConFaltante',
    'cancelar',
  ] as const;
  const METODOS_APROBAR = ['aprobarItem', 'rechazarItem'] as const;

  it.each(METODOS_GESTIONAR)(
    'S38: TECNICO (sin COMPRAS:ALTAS/MODIFICACION/BORRADO) recibe 403 en %s',
    (metodo) => {
      const handler = ComprasController.prototype[metodo] as unknown as (
        ...args: unknown[]
      ) => unknown;
      const context = buildContext(handler, TECNICO);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    },
  );

  it.each(METODOS_APROBAR)('S39: TECNICO (sin COMPRAS:APROBACION) recibe 403 en %s', (metodo) => {
    const handler = ComprasController.prototype[metodo] as unknown as (
      ...args: unknown[]
    ) => unknown;
    const context = buildContext(handler, TECNICO);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it.each(METODOS_APROBAR)(
    'S11: usuario con COMPRAS:MODIFICACION pero SIN COMPRAS:APROBACION recibe 403 en %s',
    (metodo) => {
      const gestorSinAprobar: JwtPayload = {
        ...TECNICO,
        permisos: [...TECNICO.permisos, 'COMPRAS:MODIFICACION'],
      };
      const handler = ComprasController.prototype[metodo] as unknown as (
        ...args: unknown[]
      ) => unknown;
      const context = buildContext(handler, gestorSinAprobar);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    },
  );

  it('S40: ROOT (is_global_admin) bypassea COMPRAS:ALTAS (sin la acción, igual pasa)', () => {
    const root: JwtPayload = {
      ...TECNICO,
      is_global_admin: true,
      permisos: [],
      rol: null,
      cliente_id: null,
    };
    const context = buildContext(ComprasController.prototype.crear, root);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('S40: ROOT (is_global_admin) bypassea COMPRAS:APROBACION (sin la acción, igual pasa)', () => {
    const root: JwtPayload = {
      ...TECNICO,
      is_global_admin: true,
      permisos: [],
      rol: null,
      cliente_id: null,
    };
    const context = buildContext(ComprasController.prototype.aprobarItem, root);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('control: ADMINISTRADOR bypassea ALTAS Y APROBACION sin filas propias en la matriz (R2)', () => {
    const admin: JwtPayload = {
      ...TECNICO,
      rol: 'ADMINISTRADOR',
      permisos: [],
    };

    expect(guard.canActivate(buildContext(ComprasController.prototype.crear, admin))).toBe(true);
    expect(guard.canActivate(buildContext(ComprasController.prototype.aprobarItem, admin))).toBe(
      true,
    );
  });
});
