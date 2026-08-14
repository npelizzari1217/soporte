/**
 * PR-11 [UNIT] — RED→GREEN: `NumeradorCompra` (servicio de dominio, ADR-C5).
 *
 * Espejo de `numerador-ticket.service.spec.ts`, pero MÁS SIMPLE: a
 * diferencia de `NumeradorTicket`, `NumeradorCompra` NO deriva un prefijo
 * dinámico por tipo — el prefijo es SIEMPRE `COM` (spec §1: formato
 * `COM-{anio}-{00000}`), así que no hay `derivarPrefijo` ni
 * `TipoTicketDesconocidoError` equivalente acá.
 *
 * `generarFormato` es función pura (padding a 5 dígitos, sin truncar
 * secuencias mayores). `generarNumero` depende de
 * `ICompraRepository.findLastSecuencia` (mockeado con `vi.fn`): incrementa
 * la secuencia LOCAL (tenant+año) y falla con `NumeradorCompraAgotadoError`
 * si la secuencia incrementada supera 99999.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1. Ref design: ADR-C5. Ref
 * tasks: PR-11.
 */
import { NumeradorCompra } from './numerador-compra';
import { NumeradorCompraAgotadoError } from '../errors/compras.errors';
import { ICompraRepository } from '../ports/i-compra.repository';

function mockRepo(lastSecuencia: number): Pick<ICompraRepository, 'findLastSecuencia'> {
  return { findLastSecuencia: vi.fn().mockResolvedValue(lastSecuencia) };
}

describe('NumeradorCompra', () => {
  describe('generarFormato() (función pura)', () => {
    it('formatea con padding de 5 dígitos', () => {
      expect(NumeradorCompra.generarFormato(2026, 42)).toBe('COM-2026-00042');
    });

    it('no trunca secuencias de más de 5 dígitos (edge case)', () => {
      expect(NumeradorCompra.generarFormato(2026, 123456)).toBe('COM-2026-123456');
    });

    it('formatea secuencia 1 con padding completo', () => {
      expect(NumeradorCompra.generarFormato(2026, 1)).toBe('COM-2026-00001');
    });
  });

  describe('generarNumero()', () => {
    it('incrementa la secuencia LOCAL y formatea el número', async () => {
      const repo = mockRepo(41);
      const numerador = new NumeradorCompra(repo);

      const result = await numerador.generarNumero(2026);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe('COM-2026-00042');
      expect(repo.findLastSecuencia).toHaveBeenCalledWith(2026);
    });

    it('arranca en 1 cuando no hay compras previas (findLastSecuencia=0)', async () => {
      const repo = mockRepo(0);
      const numerador = new NumeradorCompra(repo);

      const result = await numerador.generarNumero(2026);

      expect(result.getValue()).toBe('COM-2026-00001');
    });

    it('falla con NumeradorCompraAgotadoError cuando la secuencia supera 99999', async () => {
      const repo = mockRepo(99999);
      const numerador = new NumeradorCompra(repo);

      const result = await numerador.generarNumero(2026);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(NumeradorCompraAgotadoError);
    });

    it('el límite exacto (99999 -> 100000) SÍ falla; el previo (99998 -> 99999) NO', async () => {
      const repoLimite = mockRepo(99998);
      const numeradorLimite = new NumeradorCompra(repoLimite);
      const resultLimite = await numeradorLimite.generarNumero(2026);
      expect(resultLimite.isOk()).toBe(true);
      expect(resultLimite.getValue()).toBe('COM-2026-99999');

      const repoAgotado = mockRepo(99999);
      const numeradorAgotado = new NumeradorCompra(repoAgotado);
      const resultAgotado = await numeradorAgotado.generarNumero(2026);
      expect(resultAgotado.isFail()).toBe(true);
    });
  });
});
