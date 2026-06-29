import { IFileStorage } from './i-file-storage';

/**
 * 0.B.5 — Test del puerto IFileStorage
 *
 * Verifica que:
 * 1. La interfaz define upload(key, buffer, mime): Promise<string>
 * 2. Los casos de uso no dependen de la implementación concreta (test con spy).
 */

// ─── Spy / mock implementation ────────────────────────────────────────────────
class MockFileStorage implements IFileStorage {
  upload = vi.fn(async (_key: string, _buffer: Buffer, _mime: string): Promise<string> => {
    return `https://storage.example.com/${_key}`;
  });

  delete = vi.fn(async (_key: string): Promise<void> => {
    // no-op
  });
}

// ─── Use-case-like consumer (pure domain, no concrete storage knowledge) ──────
class AttachFileToEntityUseCase {
  constructor(private readonly storage: IFileStorage) {}

  async execute(key: string, buffer: Buffer, mime: string): Promise<string> {
    const url = await this.storage.upload(key, buffer, mime);
    return url;
  }

  async removeFile(key: string): Promise<void> {
    await this.storage.delete(key);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('IFileStorage port', () => {
  let storage: MockFileStorage;
  let useCase: AttachFileToEntityUseCase;

  beforeEach(() => {
    storage = new MockFileStorage();
    useCase = new AttachFileToEntityUseCase(storage);
  });

  describe('upload()', () => {
    it('should define upload(key, buffer, mime): Promise<string>', async () => {
      const key = 'tickets/abc123/adjunto.pdf';
      const buffer = Buffer.from('fake-pdf-content');
      const mime = 'application/pdf';

      const result = await useCase.execute(key, buffer, mime);

      expect(storage.upload).toHaveBeenCalledTimes(1);
      expect(storage.upload).toHaveBeenCalledWith(key, buffer, mime);
      expect(typeof result).toBe('string');
      expect(result).toContain(key);
    });

    it('should not depend on the concrete implementation — only on the IFileStorage interface', async () => {
      // The use case only knows about IFileStorage, not about MockFileStorage
      const differentMock: IFileStorage = {
        upload: vi.fn().mockResolvedValue('different-url'),
        delete: vi.fn().mockResolvedValue(undefined),
      };
      const ucWithDifferentImpl = new AttachFileToEntityUseCase(differentMock);

      const url = await ucWithDifferentImpl.execute(
        'path/file.txt',
        Buffer.from('data'),
        'text/plain',
      );

      expect(url).toBe('different-url');
    });
  });

  describe('delete()', () => {
    it('should define delete(key): Promise<void>', async () => {
      const key = 'tickets/abc123/adjunto.pdf';

      await useCase.removeFile(key);

      expect(storage.delete).toHaveBeenCalledTimes(1);
      expect(storage.delete).toHaveBeenCalledWith(key);
    });

    it('should resolve without return value (void)', async () => {
      const result = await storage.delete('some/key');

      expect(result).toBeUndefined();
    });
  });
});
