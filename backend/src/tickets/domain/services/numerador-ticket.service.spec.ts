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
 * Ref spec: [SPEC:tickets-core/Numeración legible de tickets]
 * Tareas: 3.B.3 (TEST RED) → 3.B.4 (IMPL GREEN)
 */

import { NumeradorTicket, PREFIJO_POR_CODIGO } from './numerador-ticket.service';
import { ITicketRepository } from '../ports/i-ticket.repository';

/** Stub mínimo de ITicketRepository para los tests del numerador. */
function makeRepoStub(lastSecuencia: number): Pick<ITicketRepository, 'findLastSecuencia'> {
  return {
    findLastSecuencia: jest.fn().mockResolvedValue(lastSecuencia),
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
      const numerador = new NumeradorTicket(repo as unknown as ITicketRepository);

      const numero = await numerador.generarNumero(tipoId, 'SOPORTE', 2026);

      expect(numero).toBe('SOP-2026-00042');
    });

    it('genera COM-2026-00001 dado tipo COMPRAS y sin tickets previos (lastSecuencia=0)', async () => {
      const tipoId = 'e0000000-0000-4000-e000-000000000002';
      const repo = makeRepoStub(0);
      const numerador = new NumeradorTicket(repo as unknown as ITicketRepository);

      const numero = await numerador.generarNumero(tipoId, 'COMPRAS', 2026);

      expect(numero).toBe('COM-2026-00001');
    });

    it('genera EDI-2026-00001 dado tipo EDILICIA y sin tickets previos (lastSecuencia=0)', async () => {
      const tipoId = 'e0000000-0000-4000-e000-000000000003';
      const repo = makeRepoStub(0);
      const numerador = new NumeradorTicket(repo as unknown as ITicketRepository);

      const numero = await numerador.generarNumero(tipoId, 'EDILICIA', 2026);

      expect(numero).toBe('EDI-2026-00001');
    });

    it('aplica padding a 5 dígitos: secuencia 1 → 00001', async () => {
      const repo = makeRepoStub(0);
      const numerador = new NumeradorTicket(repo as unknown as ITicketRepository);

      const numero = await numerador.generarNumero('tipo-id', 'SOPORTE', 2026);

      expect(numero).toMatch(/^SOP-2026-00001$/);
    });

    it('aplica padding a 5 dígitos: secuencia 100 → 00100', async () => {
      const repo = makeRepoStub(99);
      const numerador = new NumeradorTicket(repo as unknown as ITicketRepository);

      const numero = await numerador.generarNumero('tipo-id', 'SOPORTE', 2026);

      expect(numero).toMatch(/^SOP-2026-00100$/);
    });

    it('soporta secuencias grandes sin truncar (e.g. 99999)', async () => {
      const repo = makeRepoStub(99998);
      const numerador = new NumeradorTicket(repo as unknown as ITicketRepository);

      const numero = await numerador.generarNumero('tipo-id', 'SOPORTE', 2026);

      expect(numero).toBe('SOP-2026-99999');
    });

    it('incluye el año en el número generado', async () => {
      const repo = makeRepoStub(0);
      const numerador = new NumeradorTicket(repo as unknown as ITicketRepository);

      const numero2025 = await numerador.generarNumero('tipo-id', 'SOPORTE', 2025);
      const numero2026 = await numerador.generarNumero('tipo-id', 'SOPORTE', 2026);

      expect(numero2025).toContain('2025');
      expect(numero2026).toContain('2026');
    });
  });

  // ─── La secuencia es LOCAL (no global) ──────────────────────────────────

  describe('localidad de la secuencia', () => {
    it('llama findLastSecuencia con el tipoId y anio correctos (secuencia LOCAL al tipo)', async () => {
      const tipoId = 'e0000000-0000-4000-e000-000000000001';
      const anio = 2026;
      const repo = makeRepoStub(0);
      const findLastSecuenciaSpy = repo.findLastSecuencia as jest.Mock;

      const numerador = new NumeradorTicket(repo as unknown as ITicketRepository);
      await numerador.generarNumero(tipoId, 'SOPORTE', anio);

      expect(findLastSecuenciaSpy).toHaveBeenCalledWith(tipoId, anio);
      expect(findLastSecuenciaSpy).toHaveBeenCalledTimes(1);
    });

    it('cada tipo tiene su propia secuencia (soporte e.g. 41, compras e.g. 0 → números distintos)', async () => {
      const tipoSoporteId = 'e0000000-0000-4000-e000-000000000001';
      const tipoComprasId = 'e0000000-0000-4000-e000-000000000002';

      const repoSoporte = makeRepoStub(41);
      const repoCompras = makeRepoStub(0);

      const numeradorSoporte = new NumeradorTicket(repoSoporte as unknown as ITicketRepository);
      const numeradorCompras = new NumeradorTicket(repoCompras as unknown as ITicketRepository);

      const numSoporte = await numeradorSoporte.generarNumero(tipoSoporteId, 'SOPORTE', 2026);
      const numCompras = await numeradorCompras.generarNumero(tipoComprasId, 'COMPRAS', 2026);

      expect(numSoporte).toBe('SOP-2026-00042');
      expect(numCompras).toBe('COM-2026-00001');
      // Las secuencias son independientes por tipo: 42 vs 1
    });

    it('la secuencia se reinicia por año (anio 2025 lastSec=100 y anio 2026 lastSec=0 → ambos correctos)', async () => {
      const tipoId = 'e0000000-0000-4000-e000-000000000001';

      const repo2025 = makeRepoStub(100);
      const repo2026 = makeRepoStub(0);

      const numerador2025 = new NumeradorTicket(repo2025 as unknown as ITicketRepository);
      const numerador2026 = new NumeradorTicket(repo2026 as unknown as ITicketRepository);

      const num2025 = await numerador2025.generarNumero(tipoId, 'SOPORTE', 2025);
      const num2026 = await numerador2026.generarNumero(tipoId, 'SOPORTE', 2026);

      expect(num2025).toBe('SOP-2025-00101');
      expect(num2026).toBe('SOP-2026-00001');
    });
  });

  // ─── Errores de dominio ───────────────────────────────────────────────────

  describe('validaciones', () => {
    it('lanza error si el codigo del tipo es desconocido', async () => {
      const repo = makeRepoStub(0);
      const numerador = new NumeradorTicket(repo as unknown as ITicketRepository);

      await expect(numerador.generarNumero('tipo-id', 'DESCONOCIDO', 2026)).rejects.toThrow(
        /DESCONOCIDO/,
      );
    });
  });
});
