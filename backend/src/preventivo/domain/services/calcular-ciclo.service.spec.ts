/**
 * 3.3/3.4/3.5 [UNIT] — RED→GREEN: CalcularCicloService (cálculo puro de la
 * recurrencia). LA REGLA QUE NO SE PUEDE ROMPER: toda fecha se deriva de
 * `fechaInicio + k×cadencia`, NUNCA se encadena desde el ciclo anterior —
 * el caso de fin de mes (31/01 → k=1 → 28/02 → k=2 → 31/03, NO 28/03) es
 * exactamente el test que muerde si alguien encadena por error.
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Recurrencia por tiempo,
 * anclada a fecha inmutable" y "Recuperación de corrida perdida sin
 * ráfaga". Ref design: ADR-PV2, ADR-PV3. Tarea: 3.3/3.4/3.5.
 */
import { CalcularCicloService, PlanCicloConPuntero } from './calcular-ciclo.service';

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

describe('CalcularCicloService', () => {
  const service = new CalcularCicloService();

  describe('fechaCiclo()', () => {
    it('DIAS: 7/DIAS desde 2026-01-01, k=3 → 2026-01-22 (ADR-PV2, spec)', () => {
      const plan = {
        fechaInicio: new Date('2026-01-01T00:00:00.000Z'),
        intervaloValor: 7,
        intervaloUnidad: 'DIAS' as const,
      };

      expect(iso(service.fechaCiclo(plan, 3))).toBe('2026-01-22');
    });

    it('MESES: caso OBLIGATORIO de fin de mes — 31/01 no encadena. k=1 → 28/02, k=2 → 31/03 (NO 28/03)', () => {
      const plan = {
        fechaInicio: new Date('2026-01-31T00:00:00.000Z'),
        intervaloValor: 1,
        intervaloUnidad: 'MESES' as const,
      };

      expect(iso(service.fechaCiclo(plan, 1))).toBe('2026-02-28');
      expect(iso(service.fechaCiclo(plan, 2))).toBe('2026-03-31');
    });

    it('MESES: intervaloValor > 1 sigue derivando del ancla, no del ciclo anterior', () => {
      const plan = {
        fechaInicio: new Date('2026-01-31T00:00:00.000Z'),
        intervaloValor: 2,
        intervaloUnidad: 'MESES' as const,
      };

      // k=1 → +2 meses desde el ancla → 31/03 (Marzo tiene 31 días, sin clamp).
      expect(iso(service.fechaCiclo(plan, 1))).toBe('2026-03-31');
      // k=2 → +4 meses desde el ancla → 31/05, NUNCA "31/03 + 2 meses" encadenado.
      expect(iso(service.fechaCiclo(plan, 2))).toBe('2026-05-31');
    });

    it('k=0 devuelve la propia fechaInicio', () => {
      const plan = {
        fechaInicio: new Date('2026-06-15T00:00:00.000Z'),
        intervaloValor: 5,
        intervaloUnidad: 'DIAS' as const,
      };

      expect(iso(service.fechaCiclo(plan, 0))).toBe('2026-06-15');
    });
  });

  describe('ciclosPendientes()', () => {
    it('sin ciclos vencidos (proximaEjecucionEn > hoy) → sin candidato, sin salteados, puntero sin cambios', () => {
      const plan: PlanCicloConPuntero = {
        fechaInicio: new Date('2026-01-01T00:00:00.000Z'),
        intervaloValor: 7,
        intervaloUnidad: 'DIAS',
        proximaEjecucionEn: new Date('2026-02-10T00:00:00.000Z'),
      };
      const hoy = new Date('2026-01-15T00:00:00.000Z');

      const resultado = service.ciclosPendientes(plan, hoy, 366);

      expect(resultado.candidato).toBeNull();
      expect(resultado.salteados).toEqual([]);
      expect(resultado.proximaEjecucionEn).toEqual(plan.proximaEjecucionEn);
      expect(resultado.reanclado).toBe(false);
    });

    it('4 ciclos atrasados (cadencia semanal) → 1 candidato (el más reciente) + 3 SALTEADO_ATRASO, puntero > hoy', () => {
      // Spec: "Servidor caído un mes, cadencia semanal" — réplica exacta.
      const plan: PlanCicloConPuntero = {
        fechaInicio: new Date('2026-01-01T00:00:00.000Z'),
        intervaloValor: 7,
        intervaloUnidad: 'DIAS',
        proximaEjecucionEn: new Date('2026-01-08T00:00:00.000Z'), // k=1
      };
      const hoy = new Date('2026-01-30T00:00:00.000Z');

      const resultado = service.ciclosPendientes(plan, hoy, 366);

      expect(resultado.reanclado).toBe(false);
      expect(iso(resultado.candidato as Date)).toBe('2026-01-29'); // k=4, el más reciente vencido
      expect(resultado.salteados.map(iso)).toEqual(['2026-01-08', '2026-01-15', '2026-01-22']); // k=1,2,3
      expect(iso(resultado.proximaEjecucionEn)).toBe('2026-02-05'); // k=5, estrictamente > hoy
      expect(resultado.proximaEjecucionEn.getTime()).toBeGreaterThan(hoy.getTime());
    });

    it('TOPE agotado (caso patológico: cadencia diaria) → 1 sola fila de salteo (el ciclo más antiguo), sin candidato, re-anclaje aritmético', () => {
      // Spec: "Servidor caído un mes, cadencia diaria" — tope reducido para
      // no depender de 366 iteraciones reales en el test.
      const plan: PlanCicloConPuntero = {
        fechaInicio: new Date('2026-01-01T00:00:00.000Z'),
        intervaloValor: 1,
        intervaloUnidad: 'DIAS',
        proximaEjecucionEn: new Date('2026-01-01T00:00:00.000Z'), // k=0
      };
      const hoy = new Date('2026-01-31T00:00:00.000Z'); // 30 ciclos de atraso
      const tope = 5;

      const resultado = service.ciclosPendientes(plan, hoy, tope);

      expect(resultado.reanclado).toBe(true);
      expect(resultado.candidato).toBeNull(); // el caso patológico NO genera ticket
      expect(resultado.salteados).toHaveLength(1); // ni ~30 filas, una sola
      expect(iso(resultado.salteados[0])).toBe('2026-01-01'); // el ciclo vencido MÁS ANTIGUO
      // Re-anclaje aritmético: fechaInicio + ceil((hoy - fechaInicio)/cadencia) × cadencia.
      expect(iso(resultado.proximaEjecucionEn)).toBe('2026-01-31');
    });
  });
});
