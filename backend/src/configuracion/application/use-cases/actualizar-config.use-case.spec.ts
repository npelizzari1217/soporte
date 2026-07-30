/**
 * ActualizarConfigUseCase — unit tests (RED, tareas 4.5-4.8 + Judgment Day
 * PR4 Ronda 1, arreglos 1, 2 y 3).
 *
 * R5 escenario 1: update no-secreto ⇒ evento con valores reales.
 * R5 escenario 2 / Dz7 / REQUISITO DURO (obligación forward PR3→PR4): update
 * secreto ⇒ cifra vía ISecretCipher.encrypt(), evento con valores
 * ENMASCARADOS, cleartext ausente del evento y del repo.upsert() (el repo
 * solo debe recibir ciphertext).
 * R8: categoria !== 'smtp' ⇒ rechazado ANTES de tocar el repositorio.
 * F2: scope='global' sin is_global_admin ⇒ rechazado ANTES de persistir;
 * scope='tenant' con permiso ⇒ permitido.
 *
 * Arreglo 1 (ownership de tenant): un actor de tenant solo puede escribir SU
 * PROPIO tenant, o (si es global-admin) cualquiera + global.
 * Arreglo 2 (fail-open a global): un `scope.kind` inválido se rechaza ANTES
 * de autorizar/persistir.
 * Arreglo 3 (round-trip del placeholder): un update de secreto con
 * `valor === SECRET_MASK` se rechaza ANTES de cifrar — nunca sobrescribe el
 * secreto real con el literal enmascarado.
 */
import { Result } from '../../../shared/domain/result';
import { CifradoError } from '../../../shared/domain/errors/cifrado.errors';
import { CipherPayload, ISecretCipher } from '../../../shared/domain/ports/i-secret-cipher';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import {
  CategoriaNoSoportadaError,
  InfraConfigError,
  InvalidScopeError,
  ScopeGlobalNoAutorizadoError,
  ScopeTenantNoAutorizadoError,
  ValorEnmascaradoNoPermitidoError,
} from '../../domain/errors/config.errors';
import {
  ConfigScope,
  ConfiguracionCambiada,
} from '../../domain/events/configuracion-cambiada.event';
import {
  ConfiguracionRow,
  IConfiguracionRepository,
  UpsertConfiguracionInput,
} from '../../domain/ports/i-configuracion-repository';
import { ActorContext } from '../../domain/actor-context';
import { SECRET_MASK } from '../../domain/mask-secret';
import { ActualizarConfigUseCase, ActualizarConfigDto } from './actualizar-config.use-case';

const ACTOR_ID = '01900000-0000-7000-8000-000000000009';
const GLOBAL_ADMIN: ActorContext = { clienteId: null, esGlobalAdmin: true };
const ACTOR_TENANT_A: ActorContext = { clienteId: 'c-1', esGlobalAdmin: false };
const ACTOR_TENANT_B: ActorContext = { clienteId: 'c-2', esGlobalAdmin: false };

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
    actor: GLOBAL_ADMIN,
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

function buildUseCase(collaborators: Collaborators): ActualizarConfigUseCase {
  return new ActualizarConfigUseCase(
    collaborators.repo,
    collaborators.cipher,
    collaborators.publisher,
    collaborators.logger,
  );
}

describe('ActualizarConfigUseCase', () => {
  it('R5 escenario 1: update no-secreto publica evento con valores reales, esSecreto:false', async () => {
    const collaborators = buildCollaborators({
      existing: buildPersistedRow({ valor: 'smtp.viejo.com' }),
      upsertResult: buildPersistedRow({ valor: 'smtp.nuevo.com' }),
    });
    const useCase = buildUseCase(collaborators);

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
    const useCase = buildUseCase(collaborators);

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
    const useCase = buildUseCase(collaborators);

    const result = await useCase.execute(buildDto({ categoria: 'notificaciones' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaNoSoportadaError);
    expect(collaborators.repo.findByClave).not.toHaveBeenCalled();
    expect(collaborators.repo.upsert).not.toHaveBeenCalled();
    expect(collaborators.publisher.publish).not.toHaveBeenCalled();
  });

  it('F2: scope=global sin is_global_admin es rechazado ANTES de persistir', async () => {
    const collaborators = buildCollaborators({});
    const useCase = buildUseCase(collaborators);

    const result = await useCase.execute(
      buildDto({ scope: { kind: 'global' }, actor: { clienteId: null, esGlobalAdmin: false } }),
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
    const useCase = buildUseCase(collaborators);

    const result = await useCase.execute(
      buildDto({
        scope: { kind: 'tenant', clienteId: 'c-1' },
        actor: ACTOR_TENANT_A,
      }),
    );

    expect(result.isOk()).toBe(true);
    expect(collaborators.repo.upsert).toHaveBeenCalledTimes(1);
  });

  it('F2: scope=global CON is_global_admin es permitido', async () => {
    const collaborators = buildCollaborators({ upsertResult: buildPersistedRow() });
    const useCase = buildUseCase(collaborators);

    const result = await useCase.execute(
      buildDto({ scope: { kind: 'global' }, actor: GLOBAL_ADMIN }),
    );

    expect(result.isOk()).toBe(true);
  });

  it('cuando no hay fila previa, valorAnterior del evento es null', async () => {
    const collaborators = buildCollaborators({ existing: null, upsertResult: buildPersistedRow() });
    const useCase = buildUseCase(collaborators);

    await useCase.execute(buildDto());

    expect(collaborators.publishedEvents[0].valorAnterior).toBeNull();
  });

  it('encrypt() fallido ⇒ Result.fail(CifradoError), repo.upsert NUNCA llamado', async () => {
    const fallo = Result.fail<CipherPayload, CifradoError>(new CifradoError('clave inválida'));
    const collaborators = buildCollaborators({ encryptResult: fallo });
    const useCase = buildUseCase(collaborators);

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
    const useCase = buildUseCase(collaborators);

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
    const useCase = buildUseCase(collaborators);

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
    const useCase = buildUseCase(collaborators);

    const result = await useCase.execute(buildDto());

    expect(result.isOk()).toBe(true);
    expect(collaborators.logger.error).toHaveBeenCalledTimes(1);
  });

  describe('arreglo 1 — ownership de tenant (Judgment Day PR4 Ronda 1)', () => {
    it('(a) actor de tenant escribiendo SU PROPIO tenant ⇒ ok', async () => {
      const collaborators = buildCollaborators({ upsertResult: buildPersistedRow() });
      const useCase = buildUseCase(collaborators);

      const result = await useCase.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: 'c-1' }, actor: ACTOR_TENANT_A }),
      );

      expect(result.isOk()).toBe(true);
      expect(collaborators.repo.upsert).toHaveBeenCalledTimes(1);
    });

    it('(b) actor de tenant con scope.clienteId de OTRO tenant ⇒ rechazado ANTES de persistir/leer', async () => {
      const collaborators = buildCollaborators({});
      const useCase = buildUseCase(collaborators);

      const result = await useCase.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: 'c-2' }, actor: ACTOR_TENANT_A }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ScopeTenantNoAutorizadoError);
      expect(result.getError().code).toBe('CONFIG_SCOPE_TENANT_NO_AUTORIZADO');
      expect(collaborators.repo.findByClave).not.toHaveBeenCalled();
      expect(collaborators.repo.upsert).not.toHaveBeenCalled();
      expect(collaborators.cipher.encrypt).not.toHaveBeenCalled();
      expect(collaborators.publisher.publish).not.toHaveBeenCalled();
    });

    it('(c) global-admin puede escribir cualquier tenant + global', async () => {
      const collaboratorsTenantB = buildCollaborators({ upsertResult: buildPersistedRow() });
      const useCaseTenantB = buildUseCase(collaboratorsTenantB);
      const resultTenantB = await useCaseTenantB.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: 'c-2' }, actor: GLOBAL_ADMIN }),
      );

      const collaboratorsGlobal = buildCollaborators({ upsertResult: buildPersistedRow() });
      const useCaseGlobal = buildUseCase(collaboratorsGlobal);
      const resultGlobal = await useCaseGlobal.execute(
        buildDto({ scope: { kind: 'global' }, actor: GLOBAL_ADMIN }),
      );

      expect(resultTenantB.isOk()).toBe(true);
      expect(resultGlobal.isOk()).toBe(true);
    });

    it('actor de un tenant nunca puede escribir el tenant de otro actor de tenant', async () => {
      const collaborators = buildCollaborators({});
      const useCase = buildUseCase(collaborators);

      const result = await useCase.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: 'c-1' }, actor: ACTOR_TENANT_B }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ScopeTenantNoAutorizadoError);
      expect(collaborators.repo.upsert).not.toHaveBeenCalled();
    });

    it('CRITICAL (Judgment Day PR4 Ronda 2, Juez B) — actor{clienteId:null} + scope{tenant, clienteId:null} malformado ⇒ rechazado, NUNCA null===null', async () => {
      const collaborators = buildCollaborators({});
      const useCase = buildUseCase(collaborators);
      const actorSinTenant: ActorContext = { clienteId: null, esGlobalAdmin: false };
      // JSON.parse (sin `as any`/`as unknown as`) para simular el scope
      // malformado que antes bypaseaba el gate vía `null === null`.
      const scopeMalformado: ConfigScope = JSON.parse('{"kind":"tenant","clienteId":null}');

      const result = await useCase.execute(
        buildDto({ scope: scopeMalformado, actor: actorSinTenant }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ScopeTenantNoAutorizadoError);
      expect(result.getError().code).toBe('CONFIG_SCOPE_TENANT_NO_AUTORIZADO');
      expect(collaborators.repo.findByClave).not.toHaveBeenCalled();
      expect(collaborators.repo.upsert).not.toHaveBeenCalled();
      expect(collaborators.cipher.encrypt).not.toHaveBeenCalled();
      expect(collaborators.publisher.publish).not.toHaveBeenCalled();
    });

    it('scope.clienteId string vacío ⇒ rechazado', async () => {
      const collaborators = buildCollaborators({});
      const useCase = buildUseCase(collaborators);
      const actorConClienteIdVacio: ActorContext = { clienteId: '', esGlobalAdmin: false };

      const result = await useCase.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: '' }, actor: actorConClienteIdVacio }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ScopeTenantNoAutorizadoError);
      expect(collaborators.repo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('arreglo 2 — fail-open a global por scope.kind no validado (Judgment Day PR4 Ronda 1)', () => {
    it('scope.kind malformado/desconocido ⇒ Result.fail(InvalidScopeError), NUNCA persiste ni cifra', async () => {
      const collaborators = buildCollaborators({});
      const useCase = buildUseCase(collaborators);
      // JSON.parse (sin `as any`/`as unknown as`, prohibidos en este
      // proyecto) para simular un scope malformado en runtime.
      const scopeMalformado: ConfigScope = JSON.parse('{"kind":"master"}');

      const result = await useCase.execute(
        buildDto({ scope: scopeMalformado, actor: GLOBAL_ADMIN }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidScopeError);
      expect(result.getError().code).toBe('CONFIG_SCOPE_INVALIDO');
      expect(collaborators.repo.findByClave).not.toHaveBeenCalled();
      expect(collaborators.repo.upsert).not.toHaveBeenCalled();
      expect(collaborators.cipher.encrypt).not.toHaveBeenCalled();
      expect(collaborators.publisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('arreglo 3 — round-trip del placeholder enmascarado (Judgment Day PR4 Ronda 1)', () => {
    it('update de secreto con valor SECRET_MASK ⇒ rechazado, encrypt NO llamado, la fila real NO se toca', async () => {
      const collaborators = buildCollaborators({
        existing: buildPersistedRow({
          clave: 'pass',
          valor: 'ciphertext-real-viejo',
          esSecreto: true,
        }),
      });
      const useCase = buildUseCase(collaborators);

      const result = await useCase.execute(
        buildDto({ clave: 'pass', esSecreto: true, valor: SECRET_MASK }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ValorEnmascaradoNoPermitidoError);
      expect(result.getError().code).toBe('CONFIG_VALOR_ENMASCARADO_NO_PERMITIDO');
      expect(collaborators.cipher.encrypt).not.toHaveBeenCalled();
      expect(collaborators.repo.findByClave).not.toHaveBeenCalled();
      expect(collaborators.repo.upsert).not.toHaveBeenCalled();
      expect(collaborators.publisher.publish).not.toHaveBeenCalled();
    });

    it('update NO-secreto con valor literal SECRET_MASK ⇒ permitido (el guard solo aplica a esSecreto)', async () => {
      const collaborators = buildCollaborators({
        upsertResult: buildPersistedRow({ valor: SECRET_MASK, esSecreto: false }),
      });
      const useCase = buildUseCase(collaborators);

      const result = await useCase.execute(buildDto({ esSecreto: false, valor: SECRET_MASK }));

      expect(result.isOk()).toBe(true);
      expect(collaborators.repo.upsert).toHaveBeenCalledTimes(1);
    });

    it('LOW (Juez A Ronda 2) — placeholder con espacios (" ******** ") también se rechaza vía .trim()', async () => {
      const collaborators = buildCollaborators({
        existing: buildPersistedRow({
          clave: 'pass',
          valor: 'ciphertext-real-viejo',
          esSecreto: true,
        }),
      });
      const useCase = buildUseCase(collaborators);

      const result = await useCase.execute(
        buildDto({ clave: 'pass', esSecreto: true, valor: ` ${SECRET_MASK} ` }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ValorEnmascaradoNoPermitidoError);
      expect(result.getError().code).toBe('CONFIG_VALOR_ENMASCARADO_NO_PERMITIDO');
      expect(collaborators.cipher.encrypt).not.toHaveBeenCalled();
      expect(collaborators.repo.findByClave).not.toHaveBeenCalled();
      expect(collaborators.repo.upsert).not.toHaveBeenCalled();
      expect(collaborators.publisher.publish).not.toHaveBeenCalled();
    });
  });
});
