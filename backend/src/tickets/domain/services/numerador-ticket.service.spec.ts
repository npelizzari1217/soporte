/**
 * T3.1/T3.2 [UNIT] — RED→GREEN: NumeradorTicket (servicio de dominio).
 *
 * `generarFormato`/`derivarPrefijo` son funciones puras (T3.1).
 * `generarNumero` depende de `ITicketRepository.findLastSecuencia`
 * (mockeado con `vi.fn`, T3.2): incrementa la secuencia LOCAL
 * (tenant+tipo+año), falla con `SecuenciaAgotadaError` si supera 99999, y
 * con `TipoTicketDesconocidoError` si `derivarPrefijo` no puede derivar un
 * prefijo usable (código vacío/sin alfanuméricos — caso degenerado; los
 * tipos custom normales SÍ derivan un prefijo por ADR-4, ver
 * `derivarPrefijo()` más abajo).
 *
 * Ref spec: sdd/tickets-core/spec T5. Ref design: ADR-4, "Firmas TS clave".
 * Tarea: T3.1, T3.2.
 */
import { NumeradorTicket } from './numerador-ticket.service';
import { SecuenciaAgotadaError, TipoTicketDesconocidoError } from '../errors/tickets.errors';
import { ITicketRepository } from '../ports/i-ticket.repository';

function mockRepo(lastSecuencia: number): Pick<ITicketRepository, 'findLastSecuencia'> {
  return { findLastSecuencia: vi.fn().mockResolvedValue(lastSecuencia) };
}

describe('NumeradorTicket', () => {
  describe('generarFormato() (función pura)', () => {
    it('formatea con padding de 5 dígitos', () => {
      expect(NumeradorTicket.generarFormato('SOP', 2026, 42)).toBe('SOP-2026-00042');
    });

    it('no trunca secuencias de más de 5 dígitos (edge case)', () => {
      expect(NumeradorTicket.generarFormato('SOP', 2026, 123456)).toBe('SOP-2026-123456');
    });

    it('formatea secuencia 1 con padding completo', () => {
      expect(NumeradorTicket.generarFormato('COM', 2026, 1)).toBe('COM-2026-00001');
    });
  });

  describe('derivarPrefijo() (función pura)', () => {
    it('resuelve el mapa base: SOPORTE→SOP, COMPRAS→COM, EDILICIA→EDI, MANTENIMIENTO→MAN', () => {
      expect(NumeradorTicket.derivarPrefijo('SOPORTE')).toBe('SOP');
      expect(NumeradorTicket.derivarPrefijo('COMPRAS')).toBe('COM');
      expect(NumeradorTicket.derivarPrefijo('EDILICIA')).toBe('EDI');
      expect(NumeradorTicket.derivarPrefijo('MANTENIMIENTO')).toBe('MAN');
    });

    it('deriva las primeras 3 letras alfanuméricas en mayúscula para tipos custom', () => {
      expect(NumeradorTicket.derivarPrefijo('legal')).toBe('LEG');
      expect(NumeradorTicket.derivarPrefijo('RRHH')).toBe('RRH');
    });

    it('filtra caracteres no alfanuméricos antes de tomar las 3 letras', () => {
      expect(NumeradorTicket.derivarPrefijo('rr-hh')).toBe('RRH');
    });

    it('retorna un prefijo más corto si el código tiene menos de 3 alfanuméricos', () => {
      expect(NumeradorTicket.derivarPrefijo('ab')).toBe('AB');
    });

    it('retorna string vacío si el código no tiene ningún caracter alfanumérico', () => {
      expect(NumeradorTicket.derivarPrefijo('---')).toBe('');
      expect(NumeradorTicket.derivarPrefijo('')).toBe('');
    });
  });

  describe('generarNumero()', () => {
    it('incrementa la secuencia LOCAL y formatea el número', async () => {
      const repo = mockRepo(41);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-soporte-uuid', 'SOPORTE', 2026);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe('SOP-2026-00042');
      expect(repo.findLastSecuencia).toHaveBeenCalledWith('tipo-soporte-uuid', 2026);
    });

    it('arranca en 1 cuando no hay tickets previos (findLastSecuencia=0)', async () => {
      const repo = mockRepo(0);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-compras-uuid', 'COMPRAS', 2026);

      expect(result.getValue()).toBe('COM-2026-00001');
    });

    it('deriva prefijo custom para tipos fuera del mapa base', async () => {
      const repo = mockRepo(0);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-legal-uuid', 'LEGAL', 2026);

      expect(result.getValue()).toBe('LEG-2026-00001');
    });

    it('falla con SecuenciaAgotadaError cuando la secuencia supera 99999', async () => {
      const repo = mockRepo(99999);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-soporte-uuid', 'SOPORTE', 2026);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(SecuenciaAgotadaError);
    });

    it('falla con TipoTicketDesconocidoError si no se puede derivar prefijo (código degenerado)', async () => {
      const repo = mockRepo(0);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-x-uuid', '---', 2026);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TipoTicketDesconocidoError);
    });

    it('NO consulta findLastSecuencia si el prefijo no se puede derivar (fail-fast)', async () => {
      const repo = mockRepo(0);
      const numerador = new NumeradorTicket(repo);

      await numerador.generarNumero('tipo-x-uuid', '', 2026);

      expect(repo.findLastSecuencia).not.toHaveBeenCalled();
    });
  });
});
