import { humo } from './jose-humo';

describe('jose-humo (spike del gate ESM, ADR-2)', () => {
  it('firma y verifica un token RS256 con un par de claves generado', async () => {
    await expect(humo()).resolves.toBe('ok');
  });
});
