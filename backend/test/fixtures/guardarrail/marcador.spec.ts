// Spec trivial: si el guardarraíl NO cortó la corrida, este marcador aparece
// en stdout. `guardarrail-corte-corrida.spec.ts` afirma su AUSENCIA — esa es
// la prueba de que ningún spec llegó a correr, no solo de que falló.
import { describe, expect, it } from 'vitest';

describe('fixture del guardarraíl', () => {
  it('imprime el marcador si llega a correr', () => {
    console.log('MARCADOR_GUARDARRAIL_FIXTURE_OK');
    expect(true).toBe(true);
  });
});
