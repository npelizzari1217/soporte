import { describe, expect, it } from 'vitest';
import { espiado, espiadoEjecutar } from './espiado';

class CasoConExecute {
  constructor(private readonly dependencia: { valor: number }) {}
  execute(entrada: string): Promise<number> {
    return Promise.resolve(this.dependencia.valor + entrada.length);
  }
}

class CasoConEjecutar {
  ejecutar(entrada: number): string {
    return String(entrada);
  }
}

describe('espiado', () => {
  it('devuelve una instancia real del prototipo sin correr el constructor', () => {
    const { caso } = espiado(CasoConExecute);

    expect(caso).toBeInstanceOf(CasoConExecute);
    expect(caso).not.toHaveProperty('dependencia');
  });

  it('el execute de la instancia es el espía devuelto, y respeta la firma del caso', async () => {
    const { caso, execute } = espiado(CasoConExecute);
    execute.mockResolvedValue(42);

    await expect(caso.execute('abc')).resolves.toBe(42);
    expect(execute).toHaveBeenCalledWith('abc');
  });

  it('cada llamada arma un espía independiente', () => {
    const uno = espiado(CasoConExecute);
    const dos = espiado(CasoConExecute);

    uno.caso.execute('x');

    expect(uno.execute).toHaveBeenCalledTimes(1);
    expect(dos.execute).not.toHaveBeenCalled();
  });
});

describe('espiadoEjecutar', () => {
  it('espía `ejecutar` sobre una instancia real del prototipo', () => {
    const { caso, ejecutar } = espiadoEjecutar(CasoConEjecutar);
    ejecutar.mockReturnValue('siete');

    expect(caso).toBeInstanceOf(CasoConEjecutar);
    expect(caso.ejecutar(7)).toBe('siete');
    expect(ejecutar).toHaveBeenCalledWith(7);
  });
});
