/**
 * LeerConfigUseCase — unit tests (RED, tareas 4.2-4.4).
 *
 * R3 escenario 1: fila esSecreto ⇒ valor enmascarado.
 * R3 escenario 2: fila no-secreta ⇒ valor real.
 * Tarea 4.3 (estructural): el use case NUNCA descifra para leer — se
 * verifica en 2 niveles: (a) comportamiento (una fila `esSecreto` con
 * ciphertext NUNCA aparece en la respuesta, solo `'********'`), (b)
 * estructural (el archivo fuente no referencia `ISecretCipher`/`decrypt` —
 * mismo patrón que la auditoría de imports de R7 en `nodemailer-email-sender`).
 */
import * as fs from 'fs';
import * as path from 'path';
import { Result } from '../../../shared/domain/result';
import { InfraConfigError } from '../../domain/errors/config.errors';
import {
  ConfiguracionRow,
  IConfiguracionRepository,
} from '../../domain/ports/i-configuracion-repository';
import { SECRET_MASK } from '../../domain/mask-secret';
import { LeerConfigUseCase } from './leer-config.use-case';

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

function buildRepoStub(rows: ConfiguracionRow[]): IConfiguracionRepository {
  return {
    findAll: async () => Result.ok(rows),
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

    const result = await useCase.execute({ scope: { kind: 'global' } });

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

    const result = await useCase.execute({ scope: { kind: 'global' } });

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

    const result = await useCase.execute({ scope: { kind: 'tenant', clienteId: 'c-1' } });

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

    const result = await useCase.execute({ scope: { kind: 'global' }, categoria: 'smtp' });

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
});
