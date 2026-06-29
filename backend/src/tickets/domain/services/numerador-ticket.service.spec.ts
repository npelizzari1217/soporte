/**
 * Test: NumeradorTicket
 *
 * Verifica la generación del número legible de ticket con formato
 * {PREFIJO}-{AÑO}-{SECUENCIA_5_DIGITOS}.
 *
 * La secuencia es LOCAL al tenant y al tipo de ticket (no global).
 * El servicio consulta el último número via ITicketRepository.findLastSecuencia
 * y NO depende de Prisma directamente.
 *
 * generarNumero() retorna Result<string, TipoTicketDesconocidoError|SecuenciaAgotadaError>
 * (no lanza excepciones — patrón error-handling del dominio).
 *
 * Ref spec: [SPEC:tickets-core/Numeración legible de tickets]
 * Tareas: 3.B.3 (TEST RED) → 3.B.4 (IMPL GREEN)
 */

import { NumeradorTicket, PREFIJO_POR_CODIGO } from './numerador-ticket.service';
import { SecuenciaAgotadaError, TipoTicketDesconocidoError } from '../errors/tickets.errors';

/** Stub mínimo de ITicketRepository para los tests del numerador.
 *  Satisface Pick<ITicketRepository,'findLastSecuencia'> directamente —
 *  sin `as unknown as ITicketRepository` para que el type-checker detecte
 *  cambios de firma. */
function makeRepoStub(
  lastSecuencia: number,
): Pick<import('../ports/i-ticket.repository').ITicketRepository, 'findLastSecuencia'> {
  return {
    findLastSecuencia: vi.fn().mockResolvedValue(lastSecuencia),
  };
}

describe('NumeradorTicket', () => {
  // ─── Prefijos por tipo de ticket ─────────────────────────────────────────

  describe('PREFIJO_POR_CODIGO (mapa de prefijos)', () => {
    it('SOPORTE → SOP', () => {
      expect(PREFIJO_POR_CODIGO['SOPORTE']).toBe('SOP');
    });

    it('COMPRAS → COM', () => {
      expect(PREFIJO_POR_CODIGO['COMPRAS']).toBe('COM');
    });

    it('EDILICIA → EDI', () => {
      expect(PREFIJO_POR_CODIGO['EDILICIA']).toBe('EDI');
    });
  });

  // ─── Generación del número ────────────────────────────────────────────────

  describe('generarNumero()', () => {
    it('genera SOP-2026-00042 dado tipo SOPORTE, anio 2026 y lastSecuencia 41', async () => {
      const tipoId = 'e0000000-0000-4000-e000-000000000001';
      const repo = makeRepoStub(41);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero(tipoId, 'SOPORTE', 2026);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe('SOP-2026-00042');
    });

    it('genera COM-2026-00001 dado tipo COMPRAS y sin tickets previos (lastSecuencia=0)', async () => {
      const tipoId = 'e0000000-0000-4000-e000-000000000002';
      const repo = makeRepoStub(0);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero(tipoId, 'COMPRAS', 2026);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe('COM-2026-00001');
    });

    it('genera EDI-2026-00001 dado tipo EDILICIA y sin tickets previos (lastSecuencia=0)', async () => {
      const tipoId = 'e0000000-0000-4000-e000-000000000003';
      const repo = makeRepoStub(0);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero(tipoId, 'EDILICIA', 2026);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe('EDI-2026-00001');
    });

    it('aplica padding a 5 dígitos: secuencia 1 → 00001', async () => {
      const repo = makeRepoStub(0);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-id', 'SOPORTE', 2026);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toMatch(/^SOP-2026-00001$/);
    });

    it('aplica padding a 5 dígitos: secuencia 100 → 00100', async () => {
      const repo = makeRepoStub(99);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-id', 'SOPORTE', 2026);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toMatch(/^SOP-2026-00100$/);
    });

    it('genera SOP-2026-99999 dado lastSecuencia=99998 (máximo válido)', async () => {
      const repo = makeRepoStub(99998);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-id', 'SOPORTE', 2026);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe('SOP-2026-99999');
    });

    it('incluye el año en el número generado', async () => {
      const repo2025 = makeRepoStub(0);
      const repo2026 = makeRepoStub(0);
      const numerador2025 = new NumeradorTicket(repo2025);
      const numerador2026 = new NumeradorTicket(repo2026);

      const result2025 = await numerador2025.generarNumero('tipo-id', 'SOPORTE', 2025);
      const result2026 = await numerador2026.generarNumero('tipo-id', 'SOPORTE', 2026);

      expect(result2025.getValue()).toContain('2025');
      expect(result2026.getValue()).toContain('2026');
    });
  });

  // ─── Guard de overflow ────────────────────────────────────────────────────

  describe('overflow guard', () => {
    it('retorna Result.fail(SecuenciaAgotadaError) cuando lastSecuencia=99999 (next sería 100000)', async () => {
      const repo = makeRepoStub(99999);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-id', 'SOPORTE', 2026);

      expect(result.isOk()).toBe(false);
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(SecuenciaAgotadaError);
      expect(result.getError().code).toBe('SECUENCIA_AGOTADA');
      expect(result.getError().message).toContain('99999');
    });

    it('retorna Result.fail(SecuenciaAgotadaError) cuando lastSecuencia >> 99999', async () => {
      const repo = makeRepoStub(100000);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-id', 'COMPRAS', 2026);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(SecuenciaAgotadaError);
    });
  });

  // ─── La secuencia es LOCAL (no global) ──────────────────────────────────

  describe('localidad de la secuencia', () => {
    it('llama findLastSecuencia con el tipoId y anio correctos (secuencia LOCAL al tipo)', async () => {
      const tipoId = 'e0000000-0000-4000-e000-000000000001';
      const anio = 2026;
      const repo = makeRepoStub(0);
      const findLastSecuenciaSpy = repo.findLastSecuencia as vi.Mock;

      const numerador = new NumeradorTicket(repo);
      await numerador.generarNumero(tipoId, 'SOPORTE', anio);

      expect(findLastSecuenciaSpy).toHaveBeenCalledWith(tipoId, anio);
      expect(findLastSecuenciaSpy).toHaveBeenCalledTimes(1);
    });

    it('cada tipo tiene su propia secuencia (soporte e.g. 41, compras e.g. 0 → números distintos)', async () => {
      const tipoSoporteId = 'e0000000-0000-4000-e000-000000000001';
      const tipoComprasId = 'e0000000-0000-4000-e000-000000000002';

      const repoSoporte = makeRepoStub(41);
      const repoCompras = makeRepoStub(0);

      const numeradorSoporte = new NumeradorTicket(repoSoporte);
      const numeradorCompras = new NumeradorTicket(repoCompras);

      const resultSoporte = await numeradorSoporte.generarNumero(tipoSoporteId, 'SOPORTE', 2026);
      const resultCompras = await numeradorCompras.generarNumero(tipoComprasId, 'COMPRAS', 2026);

      expect(resultSoporte.getValue()).toBe('SOP-2026-00042');
      expect(resultCompras.getValue()).toBe('COM-2026-00001');
      // Las secuencias son independientes por tipo: 42 vs 1
    });

    it('la secuencia se reinicia por año (anio 2025 lastSec=100 y anio 2026 lastSec=0 → ambos correctos)', async () => {
      const tipoId = 'e0000000-0000-4000-e000-000000000001';

      const repo2025 = makeRepoStub(100);
      const repo2026 = makeRepoStub(0);

      const numerador2025 = new NumeradorTicket(repo2025);
      const numerador2026 = new NumeradorTicket(repo2026);

      const result2025 = await numerador2025.generarNumero(tipoId, 'SOPORTE', 2025);
      const result2026 = await numerador2026.generarNumero(tipoId, 'SOPORTE', 2026);

      expect(result2025.getValue()).toBe('SOP-2025-00101');
      expect(result2026.getValue()).toBe('SOP-2026-00001');
    });
  });

  // ─── Errores de dominio ───────────────────────────────────────────────────

  describe('validaciones', () => {
    it('retorna Result.fail(TipoTicketDesconocidoError) si el codigo del tipo es desconocido', async () => {
      const repo = makeRepoStub(0);
      const numerador = new NumeradorTicket(repo);

      const result = await numerador.generarNumero('tipo-id', 'DESCONOCIDO', 2026);

      expect(result.isOk()).toBe(false);
      expect(result.getError()).toBeInstanceOf(TipoTicketDesconocidoError);
      expect(result.getError().code).toBe('TIPO_TICKET_DESCONOCIDO');
      expect(result.getError().message).toContain('DESCONOCIDO');
    });

    it('NO llama a findLastSecuencia cuando el tipoCodigo es desconocido', async () => {
      const repo = makeRepoStub(0);
      const spy = repo.findLastSecuencia as vi.Mock;
      const numerador = new NumeradorTicket(repo);

      await numerador.generarNumero('tipo-id', 'INVALIDO', 2026);

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
