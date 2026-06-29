/**
 * 1.B.1 TEST — RegistrarClienteUseCase (RED → GREEN con 1.B.2)
 *
 * Cubre:
 * - 409 cuando db_name ya existe (sin llegar a crear la entidad ni persitir)
 * - UUIDv7 generado ANTES del save
 * - Retorna Result.ok(cliente) en creación exitosa
 * - No dropea DB tenant en ningún escenario
 */
import { RegistrarClienteUseCase, RegistrarClienteDto } from './registrar-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ClienteConflictError } from '../../domain/errors/clientes.errors';

// ─── Mock del repositorio ──────────────────────────────────────────────────────

const makeMockRepo = (): vi.Mocked<IClienteRepository> => ({
  findById: vi.fn(),
  findByDbName: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const validDto: RegistrarClienteDto = {
  nombre: 'Acme Corp',
  razonSocial: 'Acme S.A.',
  cuit: '20123456789',
  dbName: 'soporte_acme',
};

describe('RegistrarClienteUseCase', () => {
  let useCase: RegistrarClienteUseCase;
  let repo: vi.Mocked<IClienteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new RegistrarClienteUseCase(repo);
  });

  describe('Escenario: db_name único — creación exitosa', () => {
    beforeEach(() => {
      repo.findByDbName.mockResolvedValue(null); // no existe
      repo.save.mockResolvedValue(undefined);
    });

    it('retorna Result.ok con el cliente creado', async () => {
      const result = await useCase.execute(validDto);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBeInstanceOf(ClienteEntity);
    });

    it('el cliente tiene los datos del DTO', async () => {
      const result = await useCase.execute(validDto);
      const cliente = result.getValue();
      expect(cliente.nombre).toBe(validDto.nombre);
      expect(cliente.razonSocial).toBe(validDto.razonSocial);
      expect(cliente.cuit).toBe(validDto.cuit);
      expect(cliente.dbName).toBe(validDto.dbName);
      expect(cliente.activo).toBe(true);
    });

    it('genera UUIDv7 antes de llamar a save (id existe en el momento del save)', async () => {
      let capturedId: string | undefined;
      repo.save.mockImplementation(async (cliente: ClienteEntity) => {
        capturedId = cliente.id;
      });
      const result = await useCase.execute(validDto);
      expect(capturedId).toBeDefined();
      expect(capturedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.getValue().id).toBe(capturedId);
    });

    it('llama a findByDbName con el db_name del DTO', async () => {
      await useCase.execute(validDto);
      expect(repo.findByDbName).toHaveBeenCalledWith(validDto.dbName);
    });

    it('llama a repo.save exactamente una vez', async () => {
      await useCase.execute(validDto);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('acepta razonSocial y cuit nulos', async () => {
      const result = await useCase.execute({
        nombre: 'Minimal',
        razonSocial: null,
        cuit: null,
        dbName: 'minimal_db',
      });
      expect(result.isOk()).toBe(true);
      expect(result.getValue().razonSocial).toBeNull();
      expect(result.getValue().cuit).toBeNull();
    });
  });

  describe('Escenario: db_name ya existe → 409 Conflict', () => {
    beforeEach(() => {
      const existente = ClienteEntity.create({
        nombre: 'Existente',
        razonSocial: null,
        cuit: null,
        dbName: validDto.dbName,
        activo: true,
      });
      repo.findByDbName.mockResolvedValue(existente);
    });

    it('retorna Result.fail con ClienteConflictError', async () => {
      const result = await useCase.execute(validDto);
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteConflictError);
    });

    it('NO llama a repo.save cuando hay conflicto', async () => {
      await useCase.execute(validDto);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('el error incluye el db_name conflictivo en el mensaje', async () => {
      const result = await useCase.execute(validDto);
      expect(result.getError().message).toContain(validDto.dbName);
    });
  });
});
