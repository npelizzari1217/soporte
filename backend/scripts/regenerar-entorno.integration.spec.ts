/**
 * [INTEGRATION] `regenerar-entorno.mjs` — subcomando `verificar`.
 *
 * "Integración" acá significa: ejercita `ejecutarVerificar` de punta a
 * punta, combinando el guardarraíl de host (W1) con la comparación de
 * claves y la clasificación de origen (W2) como lo hace el CLI real — no
 * cada pieza por separado (eso ya lo cubren los `.spec.ts` unitarios de
 * `lib/`). NUNCA toca un `.env*` real ni abre una conexión: `ejecutarVerificar`
 * recibe mapas literales, igual que sus dependencias.
 *
 * NOTA DE DESVIACIÓN, cerrada en W3 (ver reporte de cierre de W2 para el
 * historial): la tarea 2.6 original hablaba de un escenario "contenedor
 * ausente simulado", pero en W2 `docker-postgres.mjs` todavía no existía —
 * `verificar` solo podía detectar claves faltantes y host remoto. Con
 * `inspeccionarContenedor` ya disponible (W3) el escenario de abajo lo
 * cierra: la spec "regeneracion-entorno-local", requirement "Verificación
 * read-only", scenario "Entorno incompleto", dice textualmente "GIVEN
 * contenedor Docker ausente ... THEN reporta la falta y termina exit≠0" —
 * no hizo falta decidir nada, la spec ya lo define.
 */
import { ejecutarVerificar } from './regenerar-entorno.mjs';
import { inspeccionarContenedor } from './lib/docker-postgres.mjs';

describe('ejecutarVerificar()', () => {
  it('detecta un entorno incompleto (claves faltantes) y sale con código distinto de cero, sin crear ni modificar nada', () => {
    const envEjemplo = {
      DATABASE_URL_MASTER: 'postgresql://usuario:clave@localhost:5432/soporte_master',
      SMTP_HOST: 'cambiame.ejemplo.com',
      SMTP_PORT: 'cambiame',
    };
    // Falta SMTP_PORT por completo: entorno incompleto.
    const envArchivo = {
      DATABASE_URL_MASTER: 'postgresql://real:real@localhost:5432/soporte_master',
      SMTP_HOST: 'smtp.real.com',
    };
    const envProceso = {};

    const resultado = ejecutarVerificar({ envEjemplo, envArchivo, envProceso });

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.lineas.join('\n')).toContain('SMTP_PORT');

    // "No crea ni modifica nada": la función es pura por construcción — recibe
    // mapas y devuelve strings, sin fs ni red. Se confirma corriéndola dos
    // veces con la misma entrada: si mutara algo (los mapas, un archivo, una
    // conexión) el segundo resultado divergiría del primero.
    const segundaCorrida = ejecutarVerificar({ envEjemplo, envArchivo, envProceso });
    expect(segundaCorrida).toEqual(resultado);
  });

  it('placeholder sin completar (SMTP_HOST quedó igual a .env.example) también cuenta como entorno incompleto', () => {
    const resultado = ejecutarVerificar({
      envEjemplo: { SMTP_HOST: 'cambiame.ejemplo.com' },
      envArchivo: { SMTP_HOST: 'cambiame.ejemplo.com' },
      envProceso: {},
    });

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.lineas.join('\n')).toContain('SMTP_HOST');
  });

  it('host remoto en una URL de BD aborta con exit ≠ 0, aunque las claves estén todas presentes', () => {
    const resultado = ejecutarVerificar({
      envEjemplo: { DATABASE_URL_MASTER: 'postgresql://u:p@localhost:5432/x' },
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: 'postgresql://u:p@10.0.0.5:5432/x' },
    });

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.lineas.join('\n')).toContain('10.0.0.5');
  });

  it('entorno completo y local: exit 0, y el reporte nunca contiene valores de clave', () => {
    const VALOR_SECRETO = 'clave-super-secreta-no-imprimir';
    const resultado = ejecutarVerificar({
      envEjemplo: { SMTP_HOST: 'cambiame.ejemplo.com', SMTP_PASSWORD: 'cambiame' },
      envArchivo: {},
      envProceso: { SMTP_HOST: 'smtp.real.com', SMTP_PASSWORD: VALOR_SECRETO },
    });

    expect(resultado.exitCode).toBe(0);
    expect(resultado.lineas.join('\n')).not.toContain(VALOR_SECRETO);
  });

  // REGRESIÓN: bug real encontrado en verificación manual (`pnpm entorno:verificar`
  // corrido de verdad, no solo los tests). `envProceso` es TODO el entorno del
  // proceso Node — PATH, TEMP, USERNAME, npm_*, decenas de claves del sistema
  // operativo ajenas a este proyecto. "extras" se calculaba antes contra el
  // entorno EFECTIVO (envArchivo + envProceso), así que cada una de esas claves
  // del sistema caía en "extra" y el reporte real quedaba inundado de ruido.
  //
  // A propósito mira `lineas` (la salida que ve la persona), no la estructura
  // interna de `compararClaves`: un test contra ese objeto con mapas chicos,
  // como los de arriba, sigue verde con el bug — ninguno de ellos tiene una
  // clave de sistema en el `envProceso` literal. Este test la incluye a
  // propósito para morder donde los otros no llegan.
  it('[CRITICAL] las claves de entorno del SISTEMA OPERATIVO (PATH, TEMP, etc.) nunca aparecen en el reporte', () => {
    const resultado = ejecutarVerificar({
      envEjemplo: { SMTP_HOST: 'cambiame.ejemplo.com' },
      envArchivo: { SMTP_HOST: 'smtp.real.com' },
      envProceso: {
        SMTP_HOST: 'smtp.real.com',
        PATH: 'C:\\Windows\\System32;C:\\Windows',
        TEMP: 'C:\\Users\\alguien\\AppData\\Local\\Temp',
        USERNAME: 'alguien',
        npm_config_user_agent: 'pnpm/9.0.0 node/v22.0.0 win32 x64',
      },
    });

    const reporte = resultado.lineas.join('\n');
    expect(reporte).not.toContain('PATH');
    expect(reporte).not.toContain('TEMP');
    expect(reporte).not.toContain('USERNAME');
    expect(reporte).not.toContain('npm_config_user_agent');
  });

  // Cierra la tarea 2.6 original ("contenedor ausente simulado"), pendiente
  // desde W2 porque `docker-postgres.mjs` no existía todavía. INTEGRACIÓN
  // real entre W1/W3: `inspeccionarContenedor` corre con un `execFileSyncFn`
  // inyectado como fake que simula "docker inspect" saliendo con código ≠ 0
  // y stdout "[]" (el contenedor no existe) — el mismo contrato de error que
  // usa `docker-postgres.spec.ts` — y el resultado se alimenta a
  // `ejecutarVerificar` tal como lo hace `main()` en el CLI real.
  it('contenedor Docker ausente: ejecutarVerificar reporta la falta y sale con exit != 0', () => {
    const execFileSyncFn = vi.fn(() => {
      const error = new Error('Command failed: docker inspect (status 1)');
      Object.assign(error, { status: 1, stdout: '[]\n', stderr: '' });
      throw error;
    });

    const estadoContenedor = inspeccionarContenedor({
      nombreContenedor: 'soporte-postgres-master',
      execFileSyncFn,
    });
    expect(estadoContenedor).toEqual({ estado: 'ausente', imagen: null });

    const resultado = ejecutarVerificar({
      envEjemplo: {},
      envArchivo: {},
      envProceso: {},
      estadoContenedor,
    });

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.lineas.join('\n')).toContain('AUSENTE');
    // Read-only de punta a punta: la única llamada a "Docker" fue el
    // `docker inspect` de solo lectura — nada de crear/arrancar/parar.
    expect(execFileSyncFn).toHaveBeenCalledTimes(1);
    expect(execFileSyncFn).toHaveBeenCalledWith(
      'docker',
      ['inspect', 'soporte-postgres-master'],
      expect.anything(),
    );
  });
});
