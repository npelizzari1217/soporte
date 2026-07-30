/**
 * LeerConfigUseCase — unit tests (RED, tareas 4.2-4.4 + Judgment Day PR4
 * Ronda 1, arreglos 1 y 2).
 *
 * R3 escenario 1: fila esSecreto ⇒ valor enmascarado.
 * R3 escenario 2: fila no-secreta ⇒ valor real.
 * Tarea 4.3 (estructural): el use case NUNCA descifra para leer — se
 * verifica en 2 niveles: (a) comportamiento (una fila `esSecreto` con
 * ciphertext NUNCA aparece en la respuesta, solo `'********'`), (b)
 * estructural (el archivo fuente no referencia `ISecretCipher`/`decrypt` —
 * mismo patrón que la auditoría de imports de R7 en `nodemailer-email-sender`).
 *
 * Arreglo 1 (ownership de tenant): un actor de tenant solo puede leer SU
 * PROPIO tenant o (si es global-admin) cualquiera + global. Arreglo 2
 * (fail-open a global): un `scope.kind` inválido se rechaza ANTES de leer.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Result } from '../../../shared/domain/result';
import { InfraConfigError, InvalidScopeError } from '../../domain/errors/config.errors';
import {
  ConfiguracionRow,
  IConfiguracionRepository,
} from '../../domain/ports/i-configuracion-repository';
import { ActorContext } from '../../domain/actor-context';
import { ConfigScope } from '../../domain/events/configuracion-cambiada.event';
import { SECRET_MASK } from '../../domain/mask-secret';
import { LeerConfigUseCase, LeerConfigDto } from './leer-config.use-case';

const filaBase: Omit<ConfiguracionRow, 'clave' | 'valor' | 'esSecreto'> = {
  id: '01900000-0000-7000-8000-000000000001',
  categoria: 'smtp',
  tipo: 'string',
  iv: null,
  authTag: null,
  actualizadoPor: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
};

const GLOBAL_ADMIN: ActorContext = { clienteId: null, esGlobalAdmin: true };
const ACTOR_TENANT_A: ActorContext = { clienteId: 'cliente-a', esGlobalAdmin: false };
const ACTOR_TENANT_B: ActorContext = { clienteId: 'cliente-b', esGlobalAdmin: false };

function buildDto(overrides: Partial<LeerConfigDto> = {}): LeerConfigDto {
  return {
    scope: { kind: 'global' },
    actor: GLOBAL_ADMIN,
    ...overrides,
  };
}

function buildRepoStub(rows: ConfiguracionRow[]): IConfiguracionRepository {
  return {
    findAll: vi.fn().mockResolvedValue(Result.ok(rows)),
    findByClave: async () => Result.ok(null),
    upsert: async () => {
      throw new Error('no usado en este spec');
    },
  };
}

describe('LeerConfigUseCase', () => {
  it('R3 escenario 1: fila esSecreto=true devuelve valor enmascarado, nunca el ciphertext', async () => {
    const filaSecreta: ConfiguracionRow = {
      ...filaBase,
      clave: 'pass',
      valor: 'ciphertext-base64-no-debe-aparecer',
      esSecreto: true,
    };
    const useCase = new LeerConfigUseCase(buildRepoStub([filaSecreta]));

    const result = await useCase.execute(buildDto());

    expect(result.isOk()).toBe(true);
    const [row] = result.getValue();
    expect(row.valor).toBe(SECRET_MASK);
    expect(row.valor).not.toContain('ciphertext-base64-no-debe-aparecer');
    expect(row.esSecreto).toBe(true);
  });

  it('R3 escenario 2: fila esSecreto=false devuelve el valor real sin enmascarar', async () => {
    const filaPlana: ConfiguracionRow = {
      ...filaBase,
      clave: 'host',
      valor: 'smtp.ejemplo.com',
      esSecreto: false,
    };
    const useCase = new LeerConfigUseCase(buildRepoStub([filaPlana]));

    const result = await useCase.execute(buildDto());

    expect(result.isOk()).toBe(true);
    const [row] = result.getValue();
    expect(row.valor).toBe('smtp.ejemplo.com');
    expect(row.esSecreto).toBe(false);
  });

  it('mapea múltiples filas mixtas (secretas y no-secretas) en la misma llamada', async () => {
    const filas: ConfiguracionRow[] = [
      { ...filaBase, clave: 'host', valor: 'smtp.ejemplo.com', esSecreto: false },
      { ...filaBase, clave: 'pass', valor: 'ciphertext-xyz', esSecreto: true },
    ];
    const useCase = new LeerConfigUseCase(buildRepoStub(filas));

    const result = await useCase.execute(
      buildDto({ scope: { kind: 'tenant', clienteId: 'cliente-a' }, actor: ACTOR_TENANT_A }),
    );

    expect(result.isOk()).toBe(true);
    const rows = result.getValue();
    expect(rows.find((r) => r.clave === 'host')?.valor).toBe('smtp.ejemplo.com');
    expect(rows.find((r) => r.clave === 'pass')?.valor).toBe(SECRET_MASK);
  });

  it('propaga categoria al repositorio y Result.fail(InfraConfigError) si el repo falla', async () => {
    const repo: IConfiguracionRepository = {
      findAll: vi.fn().mockResolvedValue(Result.fail(new InfraConfigError('boom'))),
      findByClave: async () => Result.ok(null),
      upsert: async () => {
        throw new Error('no usado');
      },
    };
    const useCase = new LeerConfigUseCase(repo);

    const result = await useCase.execute(buildDto({ categoria: 'smtp' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InfraConfigError);
    expect(repo.findAll).toHaveBeenCalledWith({ kind: 'global' }, 'smtp');
  });

  it('estructural (tarea 4.3): el archivo fuente NUNCA importa i-secret-cipher ni invoca .decrypt()', () => {
    const source = fs.readFileSync(path.join(__dirname, 'leer-config.use-case.ts'), 'utf8');
    // Auditoría de IMPORTS/llamadas reales (no de prosa en comentarios que
    // documentan la garantía) — mismo criterio que la auditoría de imports
    // de R7 en `nodemailer-email-sender`.
    const codeLines = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'));
    const code = codeLines.join('\n');

    expect(code).not.toMatch(/from ['"].*i-secret-cipher['"]/);
    expect(code).not.toMatch(/SECRET_CIPHER/);
    expect(code).not.toMatch(/\.decrypt\(/);
  });

  describe('arreglo 1 — ownership de tenant (Judgment Day PR4 Ronda 1)', () => {
    it('(a) actor de tenant leyendo su PROPIO tenant ⇒ ok', async () => {
      const fila: ConfiguracionRow = {
        ...filaBase,
        clave: 'host',
        valor: 'smtp.tenant-a.com',
        esSecreto: false,
      };
      const repo = buildRepoStub([fila]);
      const useCase = new LeerConfigUseCase(repo);

      const result = await useCase.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: 'cliente-a' }, actor: ACTOR_TENANT_A }),
      );

      expect(result.isOk()).toBe(true);
      expect(repo.findAll).toHaveBeenCalledWith(
        { kind: 'tenant', clienteId: 'cliente-a' },
        undefined,
      );
    });

    it('(b) actor de tenant leyendo un tenant AJENO ⇒ rechazado ANTES de leer', async () => {
      const repo = buildRepoStub([]);
      const useCase = new LeerConfigUseCase(repo);

      const result = await useCase.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: 'cliente-b' }, actor: ACTOR_TENANT_A }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('CONFIG_SCOPE_TENANT_NO_AUTORIZADO');
      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it('(c) global-admin puede leer cualquier tenant + global', async () => {
      const repo = buildRepoStub([]);
      const useCase = new LeerConfigUseCase(repo);

      const resultTenantB = await useCase.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: 'cliente-b' }, actor: GLOBAL_ADMIN }),
      );
      const resultGlobal = await useCase.execute(
        buildDto({ scope: { kind: 'global' }, actor: GLOBAL_ADMIN }),
      );

      expect(resultTenantB.isOk()).toBe(true);
      expect(resultGlobal.isOk()).toBe(true);
    });

    it('actor de tenant leyendo scope global ⇒ rechazado (F2, sin is_global_admin)', async () => {
      const repo = buildRepoStub([]);
      const useCase = new LeerConfigUseCase(repo);

      const result = await useCase.execute(
        buildDto({ scope: { kind: 'global' }, actor: ACTOR_TENANT_A }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('CONFIG_SCOPE_GLOBAL_NO_AUTORIZADO');
      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it('ACTOR_TENANT_B nunca puede leer cliente-a', async () => {
      const repo = buildRepoStub([]);
      const useCase = new LeerConfigUseCase(repo);

      const result = await useCase.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: 'cliente-a' }, actor: ACTOR_TENANT_B }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('CONFIG_SCOPE_TENANT_NO_AUTORIZADO');
      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it('CRITICAL (Judgment Day PR4 Ronda 2, Juez B) — actor{clienteId:null} + scope{tenant, clienteId:null} malformado ⇒ rechazado, NUNCA null===null', async () => {
      const repo = buildRepoStub([]);
      const useCase = new LeerConfigUseCase(repo);
      const actorSinTenant: ActorContext = { clienteId: null, esGlobalAdmin: false };
      // JSON.parse (sin `as any`/`as unknown as`) para simular el scope
      // malformado que antes bypaseaba el gate vía `null === null`.
      const scopeMalformado: ConfigScope = JSON.parse('{"kind":"tenant","clienteId":null}');

      const result = await useCase.execute(
        buildDto({ scope: scopeMalformado, actor: actorSinTenant }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('CONFIG_SCOPE_TENANT_NO_AUTORIZADO');
      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it('scope.clienteId string vacío ⇒ rechazado', async () => {
      const repo = buildRepoStub([]);
      const useCase = new LeerConfigUseCase(repo);
      const actorConClienteIdVacio: ActorContext = { clienteId: '', esGlobalAdmin: false };

      const result = await useCase.execute(
        buildDto({ scope: { kind: 'tenant', clienteId: '' }, actor: actorConClienteIdVacio }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('CONFIG_SCOPE_TENANT_NO_AUTORIZADO');
      expect(repo.findAll).not.toHaveBeenCalled();
    });
  });

  describe('arreglo 2 — fail-open a global por scope.kind no validado (Judgment Day PR4 Ronda 1)', () => {
    it('scope.kind malformado/desconocido ⇒ Result.fail(InvalidScopeError), NUNCA llama al repositorio', async () => {
      const repo = buildRepoStub([]);
      const useCase = new LeerConfigUseCase(repo);
      // Construido vía JSON.parse (sin `as any`/`as unknown as`, prohibidos
      // en este proyecto) para simular un scope malformado que cruza el
      // boundary de use case en runtime sin que el compilador lo objete.
      const scopeMalformado: ConfigScope = JSON.parse('{"kind":"master"}');

      const result = await useCase.execute(
        buildDto({ scope: scopeMalformado, actor: GLOBAL_ADMIN }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidScopeError);
      expect(result.getError().code).toBe('CONFIG_SCOPE_INVALIDO');
      expect(repo.findAll).not.toHaveBeenCalled();
    });
  });
});
