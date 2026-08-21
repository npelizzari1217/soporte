/**
 * Unitarios puros de `entorno-claves.mjs`: solo mapas literales, nunca
 * `process.env` ni el filesystem (ver design sdd/regeneracion-reproducible
 * D3, D6). Ninguna aserción de este archivo puede comparar contra un VALOR
 * real de clave — solo nombres.
 */
import { clasificarOrigenClaves, compararClaves } from './entorno-claves.mjs';

describe('compararClaves()', () => {
  it('detecta las claves de .env.example ausentes en el entorno actual', () => {
    const resultado = compararClaves({
      ejemplo: { DATABASE_URL_MASTER: 'postgresql://user:pass@localhost:5432/x', SMTP_HOST: 'ejemplo.com' },
      actual: { DATABASE_URL_MASTER: 'postgresql://real:real@localhost:5432/real' },
    });

    expect(resultado.faltantes).toEqual(['SMTP_HOST']);
    expect(resultado.placeholders).toEqual([]);
    expect(resultado.extras).toEqual([]);
  });

  it('detecta un placeholder: la clave existe pero quedó con el valor de ejemplo sin cambiar', () => {
    const resultado = compararClaves({
      ejemplo: { SMTP_HOST: 'cambiame.ejemplo.com' },
      actual: { SMTP_HOST: 'cambiame.ejemplo.com' },
    });

    expect(resultado.placeholders).toEqual(['SMTP_HOST']);
    expect(resultado.faltantes).toEqual([]);
  });

  it('NO marca placeholder cuando el valor de ejemplo es vacío (nada que "no cambiar")', () => {
    const resultado = compararClaves({
      ejemplo: { SMTP_HOST: '' },
      actual: { SMTP_HOST: '' },
    });

    expect(resultado.placeholders).toEqual([]);
  });

  it('detecta claves extra: presentes en el entorno actual pero no en .env.example', () => {
    const resultado = compararClaves({
      ejemplo: { DATABASE_URL_MASTER: 'postgresql://user:pass@localhost:5432/x' },
      actual: {
        DATABASE_URL_MASTER: 'postgresql://real:real@localhost:5432/real',
        VARIABLE_HUERFANA: 'algo',
      },
    });

    expect(resultado.extras).toEqual(['VARIABLE_HUERFANA']);
  });

  it('entorno completo y sin placeholders: los tres arreglos vienen vacíos', () => {
    const resultado = compararClaves({
      ejemplo: { SMTP_HOST: 'cambiame.ejemplo.com' },
      actual: { SMTP_HOST: 'smtp.real.com' },
    });

    expect(resultado).toEqual({ faltantes: [], placeholders: [], extras: [] });
  });

  it('el reporte NUNCA contiene los valores reales de las claves, solo nombres', () => {
    const VALOR_SECRETO = 'clave-super-secreta-no-imprimir';
    const resultado = compararClaves({
      ejemplo: { SMTP_PASSWORD: 'cambiame' },
      actual: { SMTP_PASSWORD: VALOR_SECRETO, OTRA: VALOR_SECRETO },
    });

    expect(JSON.stringify(resultado)).not.toContain(VALOR_SECRETO);
  });
});

describe('clasificarOrigenClaves() — integra clasificarOrigen() de guardarrail-host.mjs (W1)', () => {
  it('una clave presente en AMBOS snapshots se reporta como "sesión de shell (PISA a .env)"', () => {
    // Modo de falla real documentado en deploy.ps1: dotenv no pisa una
    // variable ya presente en el shell, así que el valor efectivo termina
    // siendo el del shell aunque .env diga otra cosa.
    const resultado = clasificarOrigenClaves({
      envProceso: { DATABASE_URL_MASTER: 'valor-del-shell' },
      envArchivo: { DATABASE_URL_MASTER: 'valor-del-archivo' },
    });

    expect(resultado.DATABASE_URL_MASTER).toBe('sesión de shell (PISA a .env)');
  });

  it('una clave solo en el shell se reporta como "sesión de shell"', () => {
    const resultado = clasificarOrigenClaves({
      envProceso: { SOLO_SHELL: 'x' },
      envArchivo: {},
    });

    expect(resultado.SOLO_SHELL).toBe('sesión de shell');
  });

  it('una clave solo en .env se reporta como "archivo .env"', () => {
    const resultado = clasificarOrigenClaves({
      envProceso: {},
      envArchivo: { SOLO_ARCHIVO: 'x' },
    });

    expect(resultado.SOLO_ARCHIVO).toBe('archivo .env');
  });
});
