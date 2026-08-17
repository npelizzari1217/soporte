/**
 * [UNIT] RED→GREEN: `EditarCompraUseCase` — edición de la CABECERA de una
 * compra (`motivo`/`descripcion`/`fechaSolicitud`/`sectorId`).
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre:
 * - Camino feliz con la compra PENDIENTE: persiste la cabecera y registra
 *   EXACTAMENTE 1 `OperacionCompra` de tipo `COMPRA_EDITADA`, todo dentro de
 *   `txRunner.run(...)`.
 * - Compra con un ítem ya decidido → `CompraNoPendienteError`, SIN abrir la
 *   transacción ni registrar bitácora (una mutación rechazada no es un evento
 *   del timeline — mismo corolario de S35/S36 que `EditarItemCompraUseCase`).
 * - Compra inexistente/soft-deleted → `CompraNoEncontradaError`, sin tx.
 * - `sectorId` inexistente → `SectorInexistenteError`. El alta ya valida el
 *   sector contra el repositorio ANTES del INSERT (fix post-verify W6); si la
 *   edición no hiciera lo mismo, un `PATCH` reabriría exactamente el agujero
 *   que W6 cerró: un `sectorId` inventado llegando intacto a la DB.
 * - `sectorId: null` (limpiar el sector) NO consulta el repositorio de
 *   sectores — no hay nada que validar, y una consulta de más sería una
 *   llamada inútil por cada request que limpia el campo.
 *
 * Ref: `CompraEntity.actualizar()` resuelve el guard de estado (ADR-C3) —
 * este caso de uso NO re-implementa esa regla, sólo la invoca.
 */
import { EditarCompraUseCase, EditarCompraDto } from './editar-compra.use-case';
import { CompraEntity, CompraCreateProps } from '../../domain/entities/compra.entity';
import { CompraAgregarItemProps } from '../../domain/entities/compra.entity';
import {
  CompraNoEncontradaError,
  CompraNoPendienteError,
  SectorInexistenteError,
} from '../../domain/errors/compras.errors';

function crearPropsCompraValidas(overrides: Partial<CompraCreateProps> = {}): CompraCreateProps {
  return {
    numero: 'COM-2026-00001',
    fechaSolicitud: new Date('2026-01-10'),
    motivo: 'Renovación de equipos de la sucursal norte',
    descripcion: null,
    solicitanteId: 'usuario-1',
    cicloId: 'ciclo-1',
    ...overrides,
  };
}

function datosItemValido(overrides: Partial<CompraAgregarItemProps> = {}): CompraAgregarItemProps {
  return {
    descripcion: 'Notebook Dell Latitude',
    cantidad: 2,
    proveedor: 'Proveedor SA',
    monto: 150000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-15'),
    observaciones: null,
    ...overrides,
  };
}

function baseDto(overrides: Partial<EditarCompraDto> = {}): EditarCompraDto {
  return {
    compraId: 'compra-1',
    usuarioId: 'usuario-editor-1',
    ...overrides,
  };
}

describe('EditarCompraUseCase', () => {
  function makeCollaborators() {
    const compraRepo = {
      findByIdConItems: vi.fn(),
      guardar: vi.fn().mockResolvedValue(undefined),
    };
    const sectorRepo = { findById: vi.fn() };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new EditarCompraUseCase(
      compraRepo as never,
      sectorRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, sectorRepo, registrarOperacion, txRunner };
  }

  it('edita la cabecera de una compra PENDIENTE — OK, persiste y registra 1 bitácora COMPRA_EDITADA', async () => {
    const c = makeCollaborators();
    const compra = CompraEntity.create(crearPropsCompraValidas(), 'compra-1');
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);
    const nuevaFecha = new Date('2026-02-01');

    const result = await c.useCase.execute(
      baseDto({
        motivo: 'Motivo actualizado',
        descripcion: 'Descripción nueva',
        fechaSolicitud: nuevaFecha,
      }),
    );

    expect(result.isOk()).toBe(true);
    const actualizada = result.getValue();
    expect(actualizada.motivo).toBe('Motivo actualizado');
    expect(actualizada.descripcion).toBe('Descripción nueva');
    expect(actualizada.fechaSolicitud).toBe(nuevaFecha);

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardar).toHaveBeenCalledWith(compra);
    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    const opRegistrada = c.registrarOperacion.registrar.mock.calls[0][0];
    expect(opRegistrada.compraId).toBe('compra-1');
    expect(opRegistrada.itemCompraId).toBeNull();
    expect(opRegistrada.tipo).toBe('COMPRA_EDITADA');
    expect(opRegistrada.usuarioId).toBe('usuario-editor-1');
  });

  it('con un ítem ya decidido (compra APROBADO) → CompraNoPendienteError, sin abrir tx ni registrar bitácora', async () => {
    const c = makeCollaborators();
    const compra = CompraEntity.create(crearPropsCompraValidas(), 'compra-1');
    compra.agregarItem(datosItemValido());
    compra.items[0].aprobar('aprobador-1');
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ motivo: 'Intento de edición' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoPendienteError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.compraRepo.guardar).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('compra inexistente → CompraNoEncontradaError, sin abrir tx', async () => {
    const c = makeCollaborators();
    c.compraRepo.findByIdConItems.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto({ motivo: 'x' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('sectorId inexistente → SectorInexistenteError, sin abrir tx (mismo cierre que el fix W6 del alta)', async () => {
    const c = makeCollaborators();
    const compra = CompraEntity.create(crearPropsCompraValidas(), 'compra-1');
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);
    c.sectorRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto({ sectorId: 'sector-inventado' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SectorInexistenteError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(compra.sectorId).toBeNull();
  });

  it('sectorId=null limpia el sector SIN consultar el repositorio de sectores', async () => {
    const c = makeCollaborators();
    const compra = CompraEntity.create(
      crearPropsCompraValidas({ sectorId: 'sector-viejo' }),
      'compra-1',
    );
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ sectorId: null }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().sectorId).toBeNull();
    expect(c.sectorRepo.findById).not.toHaveBeenCalled();
  });
});
