import { AdjuntarArchivoDto, AdjuntarArchivoUseCase } from './adjuntar-archivo.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IArchivoRepository } from '../../domain/ports/i-archivo.repository';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ArchivoEntity } from '../../domain/entities/archivo.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTicket(): TicketEntity {
  return TicketEntity.reconstitute(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket con adjunto',
      descripcion: null,
      tipoId: 'e0000000-0000-4000-e000-000000000001',
      estadoId: 'c0000000-0000-4000-c000-000000000001',
      prioridadId: 'd0000000-0000-4000-d000-000000000002',
      cicloId: null,
      solicitanteId: 'user-solicitante-001',
      asignadoId: null,
      fechaResolucion: null,
    },
    TICKET_ID,
    new Date(),
    new Date(),
    null,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const TICKET_ID = 'ticket-uuid-001';
const SUBIDO_POR_ID = 'user-uploader-001';
const STORAGE_KEY_RETURNED = 'tickets/ticket-uuid-001/sample-key.pdf';
const FILE_BUFFER = Buffer.from('fake pdf content');
const MIME_TYPE = 'application/pdf';
const NOMBRE_ORIGINAL = 'informe.pdf';
const TAMANO_BYTES = BigInt(2_000_000); // 2 MB

const validDto: AdjuntarArchivoDto = {
  ticketId: TICKET_ID,
  nombreOriginal: NOMBRE_ORIGINAL,
  mimeType: MIME_TYPE,
  tamanoBytes: TAMANO_BYTES,
  buffer: FILE_BUFFER,
  subidoPorId: SUBIDO_POR_ID,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('AdjuntarArchivoUseCase', () => {
  let useCase: AdjuntarArchivoUseCase;

  const mockTicketRepo = {
    findById: vi.fn<Promise<TicketEntity | null>, [string]>(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketRepository>;

  const mockArchivoRepo = {
    findById: vi.fn(),
    findByStorageKey: vi.fn(),
    findByTicketId: vi.fn(),
    save: vi.fn<Promise<void>, [ArchivoEntity]>(),
    linkToTicket: vi.fn<Promise<void>, [string, string]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IArchivoRepository>;

  const mockFileStorage = {
    upload: vi.fn<Promise<string>, [string, Buffer, string]>(),
    delete: vi.fn<Promise<void>, [string]>(),
  } satisfies vi.Mocked<IFileStorage>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path mocks
    mockTicketRepo.findById.mockResolvedValue(makeTicket());
    mockFileStorage.upload.mockResolvedValue(STORAGE_KEY_RETURNED);
    mockArchivoRepo.save.mockResolvedValue(undefined);
    mockArchivoRepo.linkToTicket.mockResolvedValue(undefined);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new AdjuntarArchivoUseCase(
      mockTicketRepo,
      mockArchivoRepo,
      mockFileStorage,
      mockTxRunner,
    );
  });

  // ─── Carga del ticket ──────────────────────────────────────────────────────

  describe('carga del ticket', () => {
    it('retorna TicketNoEncontradoError cuando el ticket no existe', async () => {
      mockTicketRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
    });

    it('llama a ticketRepo.findById con el ticketId del DTO', async () => {
      await useCase.execute(validDto);

      expect(mockTicketRepo.findById).toHaveBeenCalledWith(TICKET_ID);
    });

    it('no llama a IFileStorage.upload cuando el ticket no existe', async () => {
      mockTicketRepo.findById.mockResolvedValue(null);

      await useCase.execute(validDto);

      expect(mockFileStorage.upload).not.toHaveBeenCalled();
    });

    it('retorna TicketNoEncontradoError cuando el ticket está soft-deleted', async () => {
      // WARNING-1: soft-deleted tickets must be treated as not found
      const ticketBorrado = TicketEntity.reconstitute(
        {
          numero: 'SOP-2026-00001',
          titulo: 'Ticket borrado',
          descripcion: null,
          tipoId: 'e0000000-0000-4000-e000-000000000001',
          estadoId: 'c0000000-0000-4000-c000-000000000001',
          prioridadId: 'd0000000-0000-4000-d000-000000000002',
          cicloId: null,
          solicitanteId: 'user-solicitante-001',
          asignadoId: null,
          fechaResolucion: null,
        },
        TICKET_ID,
        new Date(),
        new Date(),
        new Date(), // deletedAt !== null → soft-deleted
      );
      mockTicketRepo.findById.mockResolvedValue(ticketBorrado);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
      expect(mockFileStorage.upload).not.toHaveBeenCalled();
    });
  });

  // ─── Upload a IFileStorage ANTES del INSERT ────────────────────────────────

  describe('upload a IFileStorage antes del INSERT en DB', () => {
    it('llama IFileStorage.upload con el buffer y mime del DTO', async () => {
      await useCase.execute(validDto);

      expect(mockFileStorage.upload).toHaveBeenCalledTimes(1);
      const [, buffer, mime] = mockFileStorage.upload.mock.calls[0];
      expect(buffer).toBe(FILE_BUFFER);
      expect(mime).toBe(MIME_TYPE);
    });

    it('llama IFileStorage.upload ANTES de archivoRepo.save', async () => {
      const callOrder: string[] = [];

      mockFileStorage.upload.mockImplementation(async () => {
        callOrder.push('upload');
        return STORAGE_KEY_RETURNED;
      });
      mockArchivoRepo.save.mockImplementation(async () => {
        callOrder.push('db:save');
      });

      await useCase.execute(validDto);

      expect(callOrder.indexOf('upload')).toBeLessThan(callOrder.indexOf('db:save'));
    });

    it('usa la storageKey retornada por upload para crear el ArchivoEntity', async () => {
      const customKey = 'tickets/custom-key/file.pdf';
      mockFileStorage.upload.mockResolvedValue(customKey);

      await useCase.execute(validDto);

      const savedArchivo = mockArchivoRepo.save.mock.calls[0][0];
      expect(savedArchivo.storageKey).toBe(customKey);
    });

    it('NO llama IFileStorage.delete cuando el persist falla (cleanup asíncrono)', async () => {
      // El upload exitoso + DB falla → NOT delete del storage (fire-and-forget)
      mockArchivoRepo.save.mockRejectedValue(new Error('DB connection lost'));

      await expect(useCase.execute(validDto)).rejects.toThrow();

      expect(mockFileStorage.delete).not.toHaveBeenCalled();
    });
  });

  // ─── Validación de dominio (ArchivoEntity) ────────────────────────────────

  describe('validación de dominio: ArchivoEntity', () => {
    it('retorna ArchivoTamanoCeroError cuando tamanoBytes es 0', async () => {
      const dto: AdjuntarArchivoDto = { ...validDto, tamanoBytes: BigInt(0) };

      const result = await useCase.execute(dto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('ARCHIVO_TAMANO_CERO');
    });

    it('retorna ArchivoTamanoCeroError cuando tamanoBytes es negativo', async () => {
      const dto: AdjuntarArchivoDto = { ...validDto, tamanoBytes: BigInt(-1) };

      const result = await useCase.execute(dto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('ARCHIVO_TAMANO_CERO');
    });

    it('NO llama IFileStorage.upload cuando tamanoBytes es 0 (validación temprana)', async () => {
      const dto: AdjuntarArchivoDto = { ...validDto, tamanoBytes: BigInt(0) };

      await useCase.execute(dto);

      expect(mockFileStorage.upload).not.toHaveBeenCalled();
    });
  });

  // ─── Persistencia de metadata (solo metadata, no blob) ────────────────────

  describe('persistencia de metadata en archivos + archivos_ticket', () => {
    it('persiste el ArchivoEntity con los metadatos del DTO', async () => {
      await useCase.execute(validDto);

      const savedArchivo = mockArchivoRepo.save.mock.calls[0][0];
      expect(savedArchivo.nombreOriginal).toBe(NOMBRE_ORIGINAL);
      expect(savedArchivo.mimeType).toBe(MIME_TYPE);
      expect(savedArchivo.tamanoBytes).toBe(TAMANO_BYTES);
      expect(savedArchivo.subidoPorId).toBe(SUBIDO_POR_ID);
    });

    it('crea la fila en archivos_ticket via linkToTicket', async () => {
      await useCase.execute(validDto);

      expect(mockArchivoRepo.linkToTicket).toHaveBeenCalledTimes(1);
    });

    it('linkToTicket usa el id del archivo creado y el ticketId del DTO', async () => {
      await useCase.execute(validDto);

      const savedArchivo = mockArchivoRepo.save.mock.calls[0][0];
      const [archivoId, ticketId] = mockArchivoRepo.linkToTicket.mock.calls[0];
      expect(archivoId).toBe(savedArchivo.id);
      expect(ticketId).toBe(TICKET_ID);
    });

    it('el ArchivoEntity creado tiene id en formato UUIDv7', async () => {
      await useCase.execute(validDto);

      const savedArchivo = mockArchivoRepo.save.mock.calls[0][0];
      const uuidV7Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(savedArchivo.id).toMatch(uuidV7Pattern);
    });
  });

  // ─── Transacción atómica (save + linkToTicket) ─────────────────────────────

  describe('transacción atómica: save + linkToTicket dentro del txRunner', () => {
    it('ejecuta save y linkToTicket dentro del txRunner', async () => {
      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockArchivoRepo.save).toHaveBeenCalledTimes(1);
      expect(mockArchivoRepo.linkToTicket).toHaveBeenCalledTimes(1);
    });

    it('save y linkToTicket ocurren DENTRO del callback del runner', async () => {
      const callOrder: string[] = [];

      (mockTxRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      mockArchivoRepo.save.mockImplementation(async () => {
        callOrder.push('archivo:save');
      });
      mockArchivoRepo.linkToTicket.mockImplementation(async () => {
        callOrder.push('link:save');
      });

      await useCase.execute(validDto);

      const txStart = callOrder.indexOf('tx:start');
      const txEnd = callOrder.indexOf('tx:end');
      const archivoSave = callOrder.indexOf('archivo:save');
      const linkSave = callOrder.indexOf('link:save');

      expect(txStart).toBeLessThan(archivoSave);
      expect(txStart).toBeLessThan(linkSave);
      expect(txEnd).toBeGreaterThan(archivoSave);
      expect(txEnd).toBeGreaterThan(linkSave);
    });

    it('upload ocurre ANTES del txRunner (fuera de la transacción DB)', async () => {
      const callOrder: string[] = [];

      mockFileStorage.upload.mockImplementation(async () => {
        callOrder.push('upload');
        return STORAGE_KEY_RETURNED;
      });
      (mockTxRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });

      await useCase.execute(validDto);

      expect(callOrder.indexOf('upload')).toBeLessThan(callOrder.indexOf('tx:start'));
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el ArchivoEntity creado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBeInstanceOf(ArchivoEntity);
    });

    it('el ArchivoEntity retornado tiene la storageKey del upload', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().storageKey).toBe(STORAGE_KEY_RETURNED);
    });
  });
});
