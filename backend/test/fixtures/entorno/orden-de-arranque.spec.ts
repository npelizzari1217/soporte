// Fixture: análogo de `main.ts` + `AppModule` — un módulo cuyo IMPORT dispara
// el guard de entorno. Si `entorno.ts` lanza (variable requerida ausente),
// este archivo nunca termina de cargar y el marcador de `marcador.ts` NUNCA
// imprime, sin importar si el propio `it` de abajo hubiera pasado.
import '../../../src/config/entorno';
import './marcador';
import { describe, expect, it } from 'vitest';

describe('fixture del orden de arranque', () => {
  it('corre solo si el entorno validó antes de este punto', () => {
    expect(true).toBe(true);
  });
});
