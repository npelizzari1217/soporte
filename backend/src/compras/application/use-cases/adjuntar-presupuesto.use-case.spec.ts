/**
 * T5.5/T5.6 [UNIT] — RED→GREEN: `AdjuntarPresupuestoUseCase` (ADR-8, F3-C3).
 *
 * Clona `AdjuntarArchivoUseCase` (Fase 2): upload a `IFileStorage` FUERA
 * de la transacción, luego `archivos` + join `archivos_presupuesto` DENTRO
 * de la tx. Storage key determinística `presupuestos/{presupuestoId}/{archivoId}`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3. Ref design: ADR-8.
 * Tarea: T5.5, T5.6.
 */
import {
  AdjuntarPresupuestoUseCase,
  AdjuntarPresupuestoDto,
} from './adjuntar-presupuesto.use-case';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import { PresupuestoNoEncontradoError } from '../../domain/errors/compras.errors';
import { ArchivoTamanoCeroError } from '../../../tickets/domain/errors/tickets.errors';

function baseDto(overrides: Partial<AdjuntarPresupuestoDto> = {}): AdjuntarPresupuestoDto {
  return {
    presupuestoId: 'presupuesto-uuid',
    nombreOriginal: 'cotizacion.pdf',
    mimeType: 'application/pdf',
    tamanoBytes: BigInt(2048),
    buffer: Buffer.from('contenido'),
    subidoPorId: 'usuario-uuid',
    ...overrides,
  };
}

describe('AdjuntarPresupuestoUseCase', () => {
  function makeCollaborators() {
    const presupuesto = PresupuestoEntity.create(
      {
        ticketCompraId: 'ticket-compra-uuid',
        proveedor: 'Proveedor SRL',
        montoTotal: 1000,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-01-01'),
        seleccionado: false,
        observaciones: null,
      },
      'presupuesto-uuid',
    ).getValue();

    const presupuestoRepo = { findById: vi.fn().mockResolvedValue(presupuesto) };
    const archivoRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      linkToPresupuesto: vi.fn().mockResolvedValue(undefined),
    };
    const fileStorage = { upload: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new AdjuntarPresupuestoUseCase(
      presupuestoRepo as never,
      archivoRepo as never,
      fileStorage as never,
      txRunner as never,
    );

    return { useCase, presupuesto, presupuestoRepo, archivoRepo, fileStorage, txRunner };
  }

  it('ADR-8: sube el binario fuera de la tx y persiste archivo + join dentro de la tx', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const archivo = result.getValue();
    expect(archivo.storageKey).toBe(`presupuestos/presupuesto-uuid/${archivo.id}`);
    expect(archivo.nombreOriginal).toBe('cotizacion.pdf');

    expect(c.fileStorage.upload).toHaveBeenCalledWith(
      archivo.storageKey,
      expect.any(Buffer),
      'application/pdf',
    );
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.archivoRepo.save).toHaveBeenCalledWith(archivo);
    expect(c.archivoRepo.linkToPresupuesto).toHaveBeenCalledWith(archivo.id, 'presupuesto-uuid');
  });

  it('presupuesto inexistente → PresupuestoNoEncontradoError, sin subir el archivo', async () => {
    const c = makeCollaborators();
    c.presupuestoRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PresupuestoNoEncontradoError);
    expect(c.fileStorage.upload).not.toHaveBeenCalled();
  });

  it('tamanoBytes=0 → ArchivoTamanoCeroError (revalidacion defensiva), sin subir el archivo', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto({ tamanoBytes: BigInt(0) }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ArchivoTamanoCeroError);
    expect(c.fileStorage.upload).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
