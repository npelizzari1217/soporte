/**
 * compras.controller.spec.ts — PR-21 (sdd/redisenio-modulo-compras, Fase E).
 *
 * Unit test: instancia `ComprasController` directamente con los 10 use cases
 * de comando mockeados (sin bootstrapear NestJS ni pasar por guards reales de
 * infraestructura HTTP — mismo patrón que `equipos.controller.spec.ts`/
 * `reparaciones.controller.spec.ts`), salvo en el bloque "RBAC — guard real"
 * donde `PermissionsGuard` se instancia REAL (con un `Reflector` REAL) para
 * probar S38/S39/S11/S40 contra la metadata REAL de la clase — no un mock de
 * lo que el guard "debería" hacer.
 *
 * Cubre:
 * 1. Traducción HTTP ↔ use case de los 10 comandos (DTO → execute(), Result → response DTO).
 * 2. `toHttpException`: los 19 errores del catálogo (`compras.errors.ts`, spec
 *    §5) → la `HttpException` que su propio JSDoc declara. El número (19, no
 *    16 — ver `sdd/redisenio-modulo-compras/tasks`) se deriva CONTANDO las
 *    clases exportadas de `compras.errors.ts`, no se tipea a mano.
 * 3. RBAC (§4.11): metadata `@RequirePermissions`/`@RequireModulo`, y guard
 *    REAL para S38/S39 (TECNICO → 403 en gestionar/aprobar), S11 (gestionar
 *    sin aprobar → 403 al aprobar/rechazar), S40 (ROOT bypassea).
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
import {
  PERMISSIONS_KEY,
  REQUIRE_MODULO_KEY,
} from '../../../auth/infrastructure/guards/decorators';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError, Result } from '../../../shared/domain/result';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import * as ComprasErrors from '../../domain/errors/compras.errors';
import {
  CantidadCompradaExcedeSolicitadaError,
  CantidadCompradaRetrocedeError,
  CantidadEntregadaExcedeCompradaError,
  CantidadEntregadaRetrocedeError,
  CompraCanceladaError,
  CompraConComprasRegistradasError,
  CompraNoEncontradaError,
  CompraYaCanceladaError,
  CompraYaCerradaError,
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

const USUARIO: JwtPayload = {
  sub: 'usuario-1',
  cliente_id: 'cliente-1',
  rol: 'ADMINISTRADOR',
  permisos: ['compra:gestionar', 'compra:aprobar'],
  is_global_admin: false,
  cliente_nombre: 'Cliente 1',
  membresias: [],
  modulos: ['COMPRAS'],
  nombre: 'Ana',
  apellido: 'Gómez',
};

function buildController() {
  const crearCompraUseCase = { execute: vi.fn() };
  const agregarItemCompraUseCase = { execute: vi.fn() };
  const editarItemCompraUseCase = { execute: vi.fn() };
  const eliminarItemCompraUseCase = { execute: vi.fn() };
  const aprobarItemCompraUseCase = { execute: vi.fn() };
  const rechazarItemCompraUseCase = { execute: vi.fn() };
  const registrarCompraDeItemUseCase = { execute: vi.fn() };
  const registrarEntregaDeItemUseCase = { execute: vi.fn() };
  const cerrarItemConFaltanteUseCase = { execute: vi.fn() };
  const cancelarCompraUseCase = { execute: vi.fn() };

  const controller = new ComprasController(
    crearCompraUseCase as unknown as Ctor[0],
    agregarItemCompraUseCase as unknown as Ctor[1],
    editarItemCompraUseCase as unknown as Ctor[2],
    eliminarItemCompraUseCase as unknown as Ctor[3],
    aprobarItemCompraUseCase as unknown as Ctor[4],
    rechazarItemCompraUseCase as unknown as Ctor[5],
    registrarCompraDeItemUseCase as unknown as Ctor[6],
    registrarEntregaDeItemUseCase as unknown as Ctor[7],
    cerrarItemConFaltanteUseCase as unknown as Ctor[8],
    cancelarCompraUseCase as unknown as Ctor[9],
  );

  return {
    controller,
    crearCompraUseCase,
    agregarItemCompraUseCase,
    editarItemCompraUseCase,
    eliminarItemCompraUseCase,
    aprobarItemCompraUseCase,
    rechazarItemCompraUseCase,
    registrarCompraDeItemUseCase,
    registrarEntregaDeItemUseCase,
    cerrarItemConFaltanteUseCase,
    cancelarCompraUseCase,
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
      });
      expect(res.id).toBe('compra-1');
      expect(res.items).toEqual([]);
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

  describe('POST /compras/:id/items/:itemId/registrar-compra', () => {
    it('registra el acumulado de cantidad comprada (no un delta)', async () => {
      const { controller, registrarCompraDeItemUseCase } = buildController();
      const item = buildItem();
      item.aprobar('aprobador-1');
      item.registrarCompra(1);
      registrarCompraDeItemUseCase.execute.mockResolvedValue(Result.ok(item));

      const res = await controller.registrarCompraDeItem(USUARIO, 'compra-1', 'item-1', {
        cantidadComprada: 1,
      });

      expect(registrarCompraDeItemUseCase.execute).toHaveBeenCalledWith({
        compraId: 'compra-1',
        itemId: 'item-1',
        usuarioId: 'usuario-1',
        cantidadComprada: 1,
      });
      expect(res.cantidadComprada).toBe(1);
    });
  });

  describe('POST /compras/:id/items/:itemId/registrar-entrega', () => {
    it('registra el acumulado de cantidad entregada (no un delta)', async () => {
      const { controller, registrarEntregaDeItemUseCase } = buildController();
      const item = buildItem();
      item.aprobar('aprobador-1');
      item.registrarCompra(2);
      item.registrarEntrega(1);
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

  describe('POST /compras/:id/items/:itemId/cerrar-con-faltante', () => {
    it('cierra el ítem con faltante: motivo obligatorio viaja al use case', async () => {
      const { controller, cerrarItemConFaltanteUseCase } = buildController();
      const item = buildItem();
      item.aprobar('aprobador-1');
      item.registrarCompra(1); // 1 < cantidad (2) → faltante real
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
      nombre: 'registrarCompraDeItem',
      useCase: 'registrarCompraDeItemUseCase',
      invocar: (c) =>
        c.registrarCompraDeItem(USUARIO, 'compra-1', 'item-1', { cantidadComprada: 1 }),
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

  it('el catálogo tiene EXACTAMENTE 19 clases de error (2×409 + 2×404 + 15×422, spec §5)', () => {
    expect(CLASES_DE_ERROR).toHaveLength(19);
  });

  const TABLA: Array<[string, () => DomainError, 404 | 409 | 422]> = [
    ['SinCicloActivoError', () => new SinCicloActivoError(), 409],
    ['NumeradorCompraAgotadoError', () => new NumeradorCompraAgotadoError(2026), 409],
    ['CompraNoEncontradaError', () => new CompraNoEncontradaError('compra-1'), 404],
    ['ItemCompraNoEncontradoError', () => new ItemCompraNoEncontradoError('item-1'), 404],
    ['CompraCanceladaError', () => new CompraCanceladaError('compra-1'), 422],
    ['CompraYaCanceladaError', () => new CompraYaCanceladaError('compra-1'), 422],
    ['CompraYaCerradaError', () => new CompraYaCerradaError('compra-1'), 422],
    [
      'CompraConComprasRegistradasError',
      () => new CompraConComprasRegistradasError('compra-1'),
      422,
    ],
    [
      'ItemCompraAprobadoNoEliminableError',
      () => new ItemCompraAprobadoNoEliminableError('item-1'),
      422,
    ],
    ['ItemCompraYaDecididoError', () => new ItemCompraYaDecididoError('item-1'), 422],
    ['ItemCompraCongeladoError', () => new ItemCompraCongeladoError('item-1'), 422],
    ['ItemCompraNoAprobadoError', () => new ItemCompraNoAprobadoError('item-1'), 422],
    [
      'CantidadCompradaExcedeSolicitadaError',
      () => new CantidadCompradaExcedeSolicitadaError('item-1'),
      422,
    ],
    ['CantidadCompradaRetrocedeError', () => new CantidadCompradaRetrocedeError('item-1'), 422],
    [
      'CantidadEntregadaExcedeCompradaError',
      () => new CantidadEntregadaExcedeCompradaError('item-1'),
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
  ];

  it('TABLA cubre EXACTAMENTE las 19 clases exportadas (ninguna falta, ninguna sobra)', () => {
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

describe('RBAC — metadata (§4.11)', () => {
  it('@RequireModulo("COMPRAS") a nivel de clase', () => {
    const modulo = Reflect.getMetadata(REQUIRE_MODULO_KEY, ComprasController);
    expect(modulo).toBe('COMPRAS');
  });

  it.each([
    ['crear', 'compra:gestionar'],
    ['agregarItem', 'compra:gestionar'],
    ['editarItem', 'compra:gestionar'],
    ['eliminarItem', 'compra:gestionar'],
    ['registrarCompraDeItem', 'compra:gestionar'],
    ['registrarEntregaDeItem', 'compra:gestionar'],
    ['cerrarItemConFaltante', 'compra:gestionar'],
    ['cancelar', 'compra:gestionar'],
    ['aprobarItem', 'compra:aprobar'],
    ['rechazarItem', 'compra:aprobar'],
  ] as const)('%s requiere @RequirePermissions(%s)', (metodo, permiso) => {
    const handler = ComprasController.prototype[
      metodo as keyof typeof ComprasController.prototype
    ] as unknown as (...args: unknown[]) => unknown;
    const meta = Reflect.getMetadata(PERMISSIONS_KEY, handler);
    expect(meta).toEqual([permiso]);
  });
});

describe('RBAC — guard real: S38/S39/S11/S40 (§4.11, PermissionsGuard + Reflector reales sobre metadata real)', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

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
   * Permisos representativos de TECNICO TRAS PR-3 (sdd/redisenio-modulo-compras):
   * la migración de master le quitó `compra:gestionar`/`compra:aprobar`
   * (pasó de 15 a 13 permisos, ver `sdd/redisenio-modulo-compras/apply-progress-pr3`).
   * Esta lista NO pretende ser la lista real completa de 13 — alcanza con que
   * NO contenga los dos códigos de compra, que es lo que S38/S39 verifican.
   */
  const TECNICO: JwtPayload = {
    sub: 'tecnico-1',
    cliente_id: 'cliente-1',
    rol: 'TECNICO',
    permisos: [
      'ticket:crear',
      'ticket:editar',
      'ticket:transicionar',
      'ticket:asignar',
      'ticket:comentar',
      'ticket:observar',
      'subtarea:actualizar',
      'equipo:gestionar',
    ],
    is_global_admin: false,
    cliente_nombre: 'Cliente 1',
    membresias: [],
    modulos: ['SOPORTE', 'COMPRAS', 'EDILICIA', 'EQUIPOS'],
    nombre: 'Técnico',
    apellido: 'Uno',
  };

  const METODOS_GESTIONAR = [
    'crear',
    'agregarItem',
    'editarItem',
    'eliminarItem',
    'registrarCompraDeItem',
    'registrarEntregaDeItem',
    'cerrarItemConFaltante',
    'cancelar',
  ] as const;
  const METODOS_APROBAR = ['aprobarItem', 'rechazarItem'] as const;

  it.each(METODOS_GESTIONAR)('S38: TECNICO (sin compra:gestionar) recibe 403 en %s', (metodo) => {
    const handler = ComprasController.prototype[metodo] as unknown as (
      ...args: unknown[]
    ) => unknown;
    const context = buildContext(handler, TECNICO);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it.each(METODOS_APROBAR)('S39: TECNICO (sin compra:aprobar) recibe 403 en %s', (metodo) => {
    const handler = ComprasController.prototype[metodo] as unknown as (
      ...args: unknown[]
    ) => unknown;
    const context = buildContext(handler, TECNICO);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it.each(METODOS_APROBAR)(
    'S11: usuario con compra:gestionar pero SIN compra:aprobar recibe 403 en %s',
    (metodo) => {
      const gestorSinAprobar: JwtPayload = {
        ...TECNICO,
        permisos: [...TECNICO.permisos, 'compra:gestionar'],
      };
      const handler = ComprasController.prototype[metodo] as unknown as (
        ...args: unknown[]
      ) => unknown;
      const context = buildContext(handler, gestorSinAprobar);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    },
  );

  it('S40: ROOT (is_global_admin) bypassea compra:gestionar (sin el permiso, igual pasa)', () => {
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

  it('S40: ROOT (is_global_admin) bypassea compra:aprobar (sin el permiso, igual pasa)', () => {
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

  it('control: usuario con AMBOS permisos pasa gestionar Y aprobar', () => {
    const admin: JwtPayload = {
      ...TECNICO,
      rol: 'ADMINISTRADOR',
      permisos: [...TECNICO.permisos, 'compra:gestionar', 'compra:aprobar'],
    };

    expect(guard.canActivate(buildContext(ComprasController.prototype.crear, admin))).toBe(true);
    expect(guard.canActivate(buildContext(ComprasController.prototype.aprobarItem, admin))).toBe(
      true,
    );
  });
});
