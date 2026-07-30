/**
 * ActualizarConfigUseCase — unit tests (RED, tareas 4.5-4.8).
 *
 * R5 escenario 1: update no-secreto ⇒ evento con valores reales.
 * R5 escenario 2 / Dz7 / REQUISITO DURO (obligación forward PR3→PR4): update
 * secreto ⇒ cifra vía ISecretCipher.encrypt(), evento con valores
 * ENMASCARADOS, cleartext ausente del evento y del repo.upsert() (el repo
 * solo debe recibir ciphertext).
 * R8: categoria !== 'smtp' ⇒ rechazado ANTES de tocar el repositorio.
 * F2: scope='global' sin is_global_admin ⇒ rechazado ANTES de persistir;
 * scope='tenant' con permiso ⇒ permitido.
 */
import { Result } from '../../../shared/domain/result';
import { CifradoError } from '../../../shared/domain/errors/cifrado.errors';
import { CipherPayload, ISecretCipher } from '../../../shared/domain/ports/i-secret-cipher';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import {
  CategoriaNoSoportadaError,
  InfraConfigError,
  ScopeGlobalNoAutorizadoError,
} from '../../domain/errors/config.errors';
import { ConfiguracionCambiada } from '../../domain/events/configuracion-cambiada.event';
import {
  ConfiguracionRow,
  IConfiguracionRepository,
  UpsertConfiguracionInput,
} from '../../domain/ports/i-configuracion-repository';
import { SECRET_MASK } from '../../domain/mask-secret';
import { ActualizarConfigUseCase, ActualizarConfigDto } from './actualizar-config.use-case';

const ACTOR_ID = '01900000-0000-7000-8000-000000000009';

function buildPersistedRow(overrides: Partial<ConfiguracionRow> = {}): ConfiguracionRow {
  return {
    id: '01900000-0000-7000-8000-000000000010',
    categoria: 'smtp',
    clave: 'host',
    valor: 'smtp.nuevo.com',
    tipo: 'string',
    esSecreto: false,
    iv: null,
    authTag: null,
    actualizadoPor: ACTOR_ID,
    createdAt: new Date('2026-07-30T00:00:00.000Z'),
    updatedAt: new Date('2026-07-30T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDto(overrides: Partial<ActualizarConfigDto> = {}): ActualizarConfigDto {
  return {
    scope: { kind: 'global' },
    categoria: 'smtp',
    clave: 'host',
    valor: 'smtp.nuevo.com',
    esSecreto: false,
    tipo: 'string',
    actorId: ACTOR_ID,
    actorEsGlobalAdmin: true,
    ...overrides,
  };
}

interface Collaborators {
  repo: IConfiguracionRepository;
  cipher: ISecretCipher;
  publisher: IDomainEventPublisher;
  logger: ILogger;
  publishedEvents: ConfiguracionCambiada[];
  upsertCalls: UpsertConfiguracionInput[];
}

function buildCollaborators(opts: {
  existing?: ConfiguracionRow | null;
  upsertResult?: ConfiguracionRow;
  findByClaveResult?: Result<ConfiguracionRow | null, InfraConfigError>;
  upsertReturn?: Result<ConfiguracionRow, InfraConfigError>;
  encryptResult?: Result<CipherPayload, CifradoError>;
}): Collaborators {
  const publishedEvents: ConfiguracionCambiada[] = [];
  const upsertCalls: UpsertConfiguracionInput[] = [];

  const existing = opts.existing === undefined ? null : opts.existing;
  const persisted = opts.upsertResult ?? buildPersistedRow();

  const repo: IConfiguracionRepository = {
    findByClave: vi
      .fn()
      .mockResolvedValue(
        opts.findByClaveResult ?? Result.ok<ConfiguracionRow | null, InfraConfigError>(existing),
      ),
    upsert: vi.fn().mockImplementation(async (_scope, row: UpsertConfiguracionInput) => {
      upsertCalls.push(row);
      return opts.upsertReturn ?? Result.ok(persisted);
    }),
    findAll: async () => Result.ok([]),
  };

  const cipher: ISecretCipher = {
    encrypt: vi.fn().mockReturnValue(
      opts.encryptResult ??
        Result.ok<CipherPayload, CifradoError>({
          valor: 'ciphertext-base64',
          iv: 'iv-base64',
          authTag: 'authtag-base64',
        }),
    ),
    decrypt: vi.fn(),
  };

  const publisher: IDomainEventPublisher = {
    publish: vi.fn().mockImplementation((event: ConfiguracionCambiada) => {
      publishedEvents.push(event);
    }),
  };

  const logger: ILogger = { error: vi.fn() };

  return { repo, cipher, publisher, logger, publishedEvents, upsertCalls };
}

describe('ActualizarConfigUseCase', () => {
  it('R5 escenario 1: update no-secreto publica evento con valores reales, esSecreto:false', async () => {
    const collaborators = buildCollaborators({
      existing: buildPersistedRow({ valor: 'smtp.viejo.com' }),
      upsertResult: buildPersistedRow({ valor: 'smtp.nuevo.com' }),
    });
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(buildDto({ valor: 'smtp.nuevo.com', esSecreto: false }));

    expect(result.isOk()).toBe(true);
    expect(collaborators.publishedEvents).toHaveLength(1);
    const [event] = collaborators.publishedEvents;
    expect(event.esSecreto).toBe(false);
    expect(event.valorAnterior).toBe('smtp.viejo.com');
    expect(event.valorNuevo).toBe('smtp.nuevo.com');
    expect(collaborators.cipher.encrypt).not.toHaveBeenCalled();
  });

  it('R5 escenario 2 / Dz7: update secreto cifra vía encrypt(), evento con valores ENMASCARADOS, cleartext ausente', async () => {
    const collaborators = buildCollaborators({
      existing: buildPersistedRow({ clave: 'pass', valor: 'ciphertext-viejo', esSecreto: true }),
      upsertResult: buildPersistedRow({
        clave: 'pass',
        valor: 'ciphertext-base64',
        esSecreto: true,
        iv: 'iv-base64',
        authTag: 'authtag-base64',
      }),
    });
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(
      buildDto({ clave: 'pass', valor: 'super-secreto-en-claro', esSecreto: true }),
    );

    expect(result.isOk()).toBe(true);
    expect(collaborators.cipher.encrypt).toHaveBeenCalledWith('super-secreto-en-claro');

    // El repo SOLO debe recibir el ciphertext — nunca el plaintext.
    expect(collaborators.upsertCalls).toHaveLength(1);
    expect(collaborators.upsertCalls[0].valor).toBe('ciphertext-base64');
    expect(collaborators.upsertCalls[0].iv).toBe('iv-base64');
    expect(collaborators.upsertCalls[0].authTag).toBe('authtag-base64');
    expect(collaborators.upsertCalls[0].valor).not.toContain('super-secreto-en-claro');

    // El evento viaja YA enmascarado — cleartext ausente en ambos valores.
    expect(collaborators.publishedEvents).toHaveLength(1);
    const [event] = collaborators.publishedEvents;
    expect(event.esSecreto).toBe(true);
    expect(event.valorAnterior).toBe(SECRET_MASK);
    expect(event.valorNuevo).toBe(SECRET_MASK);
    expect(JSON.stringify(event)).not.toContain('super-secreto-en-claro');

    // La respuesta del use case tampoco expone el cleartext.
    const respuesta = result.getValue();
    expect(respuesta.valor).toBe(SECRET_MASK);
  });

  it('R8: categoria !== "smtp" es rechazada ANTES de tocar el repositorio', async () => {
    const collaborators = buildCollaborators({});
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(buildDto({ categoria: 'notificaciones' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaNoSoportadaError);
    expect(collaborators.repo.findByClave).not.toHaveBeenCalled();
    expect(collaborators.repo.upsert).not.toHaveBeenCalled();
    expect(collaborators.publisher.publish).not.toHaveBeenCalled();
  });

  it('F2: scope=global sin is_global_admin es rechazado ANTES de persistir', async () => {
    const collaborators = buildCollaborators({});
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(
      buildDto({ scope: { kind: 'global' }, actorEsGlobalAdmin: false }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ScopeGlobalNoAutorizadoError);
    expect(collaborators.repo.findByClave).not.toHaveBeenCalled();
    expect(collaborators.repo.upsert).not.toHaveBeenCalled();
    expect(collaborators.publisher.publish).not.toHaveBeenCalled();
  });

  it('F2: scope=tenant con permiso (sin is_global_admin) es permitido', async () => {
    const collaborators = buildCollaborators({
      upsertResult: buildPersistedRow(),
    });
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(
      buildDto({
        scope: { kind: 'tenant', clienteId: 'c-1' },
        actorEsGlobalAdmin: false,
      }),
    );

    expect(result.isOk()).toBe(true);
    expect(collaborators.repo.upsert).toHaveBeenCalledTimes(1);
  });

  it('F2: scope=global CON is_global_admin es permitido', async () => {
    const collaborators = buildCollaborators({ upsertResult: buildPersistedRow() });
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(
      buildDto({ scope: { kind: 'global' }, actorEsGlobalAdmin: true }),
    );

    expect(result.isOk()).toBe(true);
  });

  it('cuando no hay fila previa, valorAnterior del evento es null', async () => {
    const collaborators = buildCollaborators({ existing: null, upsertResult: buildPersistedRow() });
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    await useCase.execute(buildDto());

    expect(collaborators.publishedEvents[0].valorAnterior).toBeNull();
  });

  it('encrypt() fallido ⇒ Result.fail(CifradoError), repo.upsert NUNCA llamado', async () => {
    const fallo = Result.fail<CipherPayload, CifradoError>(new CifradoError('clave inválida'));
    const collaborators = buildCollaborators({ encryptResult: fallo });
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(buildDto({ clave: 'pass', esSecreto: true, valor: 'x' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CifradoError);
    expect(collaborators.repo.upsert).not.toHaveBeenCalled();
    expect(collaborators.publisher.publish).not.toHaveBeenCalled();
  });

  it('findByClave() fallido ⇒ Result.fail(InfraConfigError) propagado, sin persistir ni publicar', async () => {
    const collaborators = buildCollaborators({
      findByClaveResult: Result.fail(new InfraConfigError('infra caída')),
    });
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(buildDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InfraConfigError);
    expect(collaborators.repo.upsert).not.toHaveBeenCalled();
    expect(collaborators.publisher.publish).not.toHaveBeenCalled();
  });

  it('upsert() fallido ⇒ Result.fail(InfraConfigError) propagado, sin publicar', async () => {
    const collaborators = buildCollaborators({
      upsertReturn: Result.fail(new InfraConfigError('infra caída al escribir')),
    });
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(buildDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InfraConfigError);
    expect(collaborators.publisher.publish).not.toHaveBeenCalled();
  });

  it('publisher.publish() que lanza NUNCA propaga — log-and-swallow post-commit, Result.ok igual', async () => {
    const collaborators = buildCollaborators({ upsertResult: buildPersistedRow() });
    (collaborators.publisher.publish as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('bus de eventos caído');
    });
    const useCase = new ActualizarConfigUseCase(
      collaborators.repo,
      collaborators.cipher,
      collaborators.publisher,
      collaborators.logger,
    );

    const result = await useCase.execute(buildDto());

    expect(result.isOk()).toBe(true);
    expect(collaborators.logger.error).toHaveBeenCalledTimes(1);
  });
});
