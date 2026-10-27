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
 * - `tipoTicketId` (odd/compras-por-tipo, S3, S4): cambiarlo exige un tipo
 *   elegible (400) y ALTAS sobre el tipo NUEVO (403), sin escribir nada si
 *   falla; asignarlo a una compra sin tipo sigue la misma regla; reenviar el
 *   tipo actual no es un cambio y no se valida.
 *
 * Ref: `CompraEntity.actualizar()` resuelve el guard de estado (ADR-C3) —
 * este caso de uso NO re-implementa esa regla, sólo la invoca.
 */
import { EditarCompraUseCase, EditarCompraDto } from './editar-compra.use-case';
import type { Mock } from 'vitest';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { unstubbed } from '../../../testing/mocks';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import { CompraEntity, CompraCreateProps } from '../../domain/entities/compra.entity';
import { CompraAgregarItemProps } from '../../domain/entities/compra.entity';
import {
  CompraNoEncontradaError,
  CompraNoPendienteError,
  SectorInexistenteError,
  TipoTicketDeCompraInvalidoError,
  TipoTicketDeCompraNoPermitidoError,
} from '../../domain/errors/compras.errors';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { AccionTipoTicket } from '../../../tickets/domain/permisos-tipo-ticket';

const TIPO_SOPORTE = 'tipo-soporte';
const TIPO_EDILICIA = 'tipo-edilicia';

function alcanceCon(porTipo: Record<string, AccionTipoTicket[]>): AlcanceActorTicket {
  return {
    actorId: 'usuario-editor-1',
    permisosPorTipo: new Map(
      Object.entries(porTipo).map(([tipoId, acciones]) => [tipoId, new Set(acciones)]),
    ),
  };
}

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
    alcance: alcanceCon({ [TIPO_SOPORTE]: ['LECTURA', 'ALTAS'] }),
    ...overrides,
  };
}

describe('EditarCompraUseCase', () => {
  function makeCollaborators() {
    const compraRepo = {
      findByIdConItems: vi.fn<ICompraRepository['findByIdConItems']>(),
      guardar: vi.fn<ICompraRepository['guardar']>().mockResolvedValue(undefined),
    };
    const sectorRepo = { findById: vi.fn<ISectorRepository['findById']>() };
    // `RegistrarOperacionCompra` es una clase concreta: el doble lleva su prototipo
    // y `registrar` como mock tipado con su firma.
    const registrarOperacion: RegistrarOperacionCompra & {
      registrar: Mock<RegistrarOperacionCompra['registrar']>;
    } = Object.create(RegistrarOperacionCompra.prototype, {
      registrar: {
        value: vi.fn<RegistrarOperacionCompra['registrar']>().mockResolvedValue(undefined),
      },
    });
    // Runner real con un espía encima: `run` es genérico y un `vi.fn` lo perdería.
    const txRunner: ITenantTransactionRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      alCommitear: unstubbed('txRunner.alCommitear'),
    };
    vi.spyOn(txRunner, 'run');

    const catalogoTipos = new Map([
      [
        TIPO_SOPORTE,
        TipoTicketEntity.create(
          { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
          TIPO_SOPORTE,
        ),
      ],
      [
        TIPO_EDILICIA,
        TipoTicketEntity.create(
          { codigo: 'EDILICIA', nombre: 'Edilicia', modulo: 'EDILICIA', activo: true },
          TIPO_EDILICIA,
        ),
      ],
    ]);
    const tipoRepo = {
      findById: vi
        .fn<ITipoTicketRepository['findById']>()
        .mockImplementation(async (id) => catalogoTipos.get(id) ?? null),
    };

    const useCase = new EditarCompraUseCase(
      compraRepo,
      sectorRepo,
      registrarOperacion,
      txRunner,
      tipoRepo,
    );

    return { useCase, compraRepo, sectorRepo, registrarOperacion, txRunner, tipoRepo };
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

  describe('odd/compras-por-tipo — cambiar el tipo exige ALTAS sobre el tipo NUEVO (S3, S4)', () => {
    function compraDeTipo(tipoTicketId: string | null): CompraEntity {
      return CompraEntity.create(crearPropsCompraValidas({ tipoTicketId }), 'compra-1');
    }

    function expectNadaEscrito(c: ReturnType<typeof makeCollaborators>): void {
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.compraRepo.guardar).not.toHaveBeenCalled();
      expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
    }

    it('con ALTAS sobre el tipo nuevo, cambia el tipo y lo persiste', async () => {
      const c = makeCollaborators();
      const compra = compraDeTipo(TIPO_SOPORTE);
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(
        baseDto({
          tipoTicketId: TIPO_EDILICIA,
          alcance: alcanceCon({ [TIPO_EDILICIA]: ['LECTURA', 'ALTAS'] }),
        }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().tipoTicketId).toBe(TIPO_EDILICIA);
      expect(c.compraRepo.guardar).toHaveBeenCalledWith(compra);
    });

    it('S4: a una compra SIN tipo se le asigna un tipo con ALTAS sobre él', async () => {
      const c = makeCollaborators();
      c.compraRepo.findByIdConItems.mockResolvedValue(compraDeTipo(null));

      const result = await c.useCase.execute(baseDto({ tipoTicketId: TIPO_SOPORTE }));

      expect(result.isOk()).toBe(true);
      expect(result.getValue().tipoTicketId).toBe(TIPO_SOPORTE);
    });

    it('sin ALTAS sobre el tipo nuevo (aunque la tenga sobre el actual) -> TipoTicketDeCompraNoPermitidoError, sin escribir y sin tocar el tipo', async () => {
      const c = makeCollaborators();
      const compra = compraDeTipo(TIPO_SOPORTE);
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(
        baseDto({
          tipoTicketId: TIPO_EDILICIA,
          alcance: alcanceCon({
            [TIPO_SOPORTE]: ['LECTURA', 'ALTAS'],
            [TIPO_EDILICIA]: ['LECTURA'],
          }),
        }),
      );

      expect(result.getError()).toBeInstanceOf(TipoTicketDeCompraNoPermitidoError);
      expect(result.getError().message).toContain('"Edilicia"');
      expect(compra.tipoTicketId).toBe(TIPO_SOPORTE);
      expectNadaEscrito(c);
    });

    it('tipo nuevo inexistente -> TipoTicketDeCompraInvalidoError, sin escribir', async () => {
      const c = makeCollaborators();
      const compra = compraDeTipo(TIPO_SOPORTE);
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(baseDto({ tipoTicketId: 'tipo-fantasma' }));

      expect(result.getError()).toBeInstanceOf(TipoTicketDeCompraInvalidoError);
      expect(compra.tipoTicketId).toBe(TIPO_SOPORTE);
      expectNadaEscrito(c);
    });

    it('reenviar el tipo actual no es un cambio: no consulta el catálogo ni exige ALTAS', async () => {
      const c = makeCollaborators();
      c.compraRepo.findByIdConItems.mockResolvedValue(compraDeTipo(TIPO_SOPORTE));

      const result = await c.useCase.execute(
        baseDto({
          tipoTicketId: TIPO_SOPORTE,
          motivo: 'Solo cambia el motivo',
          alcance: alcanceCon({ [TIPO_SOPORTE]: ['LECTURA'] }),
        }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().motivo).toBe('Solo cambia el motivo');
      expect(c.tipoRepo.findById).not.toHaveBeenCalled();
    });

    it('sin tipoTicketId en el dto, el tipo queda como estaba', async () => {
      const c = makeCollaborators();
      c.compraRepo.findByIdConItems.mockResolvedValue(compraDeTipo(TIPO_SOPORTE));

      const result = await c.useCase.execute(baseDto({ motivo: 'Otro motivo' }));

      expect(result.getValue().tipoTicketId).toBe(TIPO_SOPORTE);
      expect(c.tipoRepo.findById).not.toHaveBeenCalled();
    });
  });
});
