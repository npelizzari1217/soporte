/**
 * [UNIT] `NumeradorInsumo` (servicio de dominio, issue #162).
 *
 * Espejo de `numerador-compra.spec.ts`: `generarFormato` es función pura
 * (padding a 4 dígitos, sin truncar secuencias mayores). `generarCodigo`
 * depende de `IInsumoRepository.findLastSecuenciaCodigo` (mockeado con
 * `vi.fn`): incrementa la secuencia de la SERIE que corresponde
 * (`esRepuesto` decide `REP` o `INS`) y falla con
 * `SecuenciaCodigoInsumoAgotadaError` si la secuencia incrementada supera
 * 9999.
 *
 * La concurrencia real (advisory lock) NO se prueba acá: vive en
 * `PrismaInsumoRepository.findLastSecuenciaCodigo`, cubierta por su propio
 * spec de integración contra Postgres real.
 */
import { describe, expect, it, vi } from 'vitest';
import { NumeradorInsumo } from './numerador-insumo.service';
import { SecuenciaCodigoInsumoAgotadaError } from '../errors/insumos.errors';
import { IInsumoRepository } from '../ports/i-insumo.repository';

function mockRepo(lastSecuencia: number): Pick<IInsumoRepository, 'findLastSecuenciaCodigo'> {
  return { findLastSecuenciaCodigo: vi.fn().mockResolvedValue(lastSecuencia) };
}

describe('NumeradorInsumo', () => {
  describe('generarFormato() (función pura)', () => {
    it('formatea con padding de 4 dígitos', () => {
      expect(NumeradorInsumo.generarFormato('INS', 7)).toBe('INS-0007');
    });

    it('no trunca secuencias de más de 4 dígitos (edge case)', () => {
      expect(NumeradorInsumo.generarFormato('INS', 12345)).toBe('INS-12345');
    });

    it('formatea secuencia 1 con padding completo', () => {
      expect(NumeradorInsumo.generarFormato('REP', 1)).toBe('REP-0001');
    });
  });

  describe('generarCodigo()', () => {
    it('arranca en 0001 cuando la serie INS no tiene códigos previos', async () => {
      const repo = mockRepo(0);
      const numerador = new NumeradorInsumo(repo);

      const result = await numerador.generarCodigo(false);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe('INS-0001');
      expect(repo.findLastSecuenciaCodigo).toHaveBeenCalledWith('INS');
    });

    it('arranca en 0001 cuando la serie REP no tiene códigos previos', async () => {
      const repo = mockRepo(0);
      const numerador = new NumeradorInsumo(repo);

      const result = await numerador.generarCodigo(true);

      expect(result.getValue()).toBe('REP-0001');
      expect(repo.findLastSecuenciaCodigo).toHaveBeenCalledWith('REP');
    });

    it('incrementa la secuencia LOCAL de la serie y formatea el código', async () => {
      const repo = mockRepo(6);
      const numerador = new NumeradorInsumo(repo);

      const result = await numerador.generarCodigo(false);

      expect(result.getValue()).toBe('INS-0007');
    });

    /**
     * Las dos series son independientes: `esRepuesto` decide CUÁL serie se
     * consulta, nunca las dos. Sin este test, invertir el booleano al pasarlo
     * al repositorio pasaría inadvertido.
     */
    it('consulta la serie REP y no la INS cuando esRepuesto es true', async () => {
      const repo = mockRepo(0);
      const numerador = new NumeradorInsumo(repo);

      await numerador.generarCodigo(true);

      expect(repo.findLastSecuenciaCodigo).toHaveBeenCalledWith('REP');
      expect(repo.findLastSecuenciaCodigo).not.toHaveBeenCalledWith('INS');
    });

    it('falla con SecuenciaCodigoInsumoAgotadaError cuando la secuencia supera 9999', async () => {
      const repo = mockRepo(9999);
      const numerador = new NumeradorInsumo(repo);

      const result = await numerador.generarCodigo(false);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(SecuenciaCodigoInsumoAgotadaError);
    });

    it('el límite exacto (9999 -> 10000) SÍ falla; el previo (9998 -> 9999) NO', async () => {
      const repoLimite = mockRepo(9998);
      const numeradorLimite = new NumeradorInsumo(repoLimite);
      const resultLimite = await numeradorLimite.generarCodigo(false);
      expect(resultLimite.isOk()).toBe(true);
      expect(resultLimite.getValue()).toBe('INS-9999');

      const repoAgotado = mockRepo(9999);
      const numeradorAgotado = new NumeradorInsumo(repoAgotado);
      const resultAgotado = await numeradorAgotado.generarCodigo(false);
      expect(resultAgotado.isFail()).toBe(true);
    });
  });
});
