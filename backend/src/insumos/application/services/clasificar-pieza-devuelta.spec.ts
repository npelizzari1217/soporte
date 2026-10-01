import { describe, expect, it } from 'vitest';
import {
  CAUSAS_PIEZA_NO_DEVOLVIBLE,
  PiezaParaClasificar,
  clasificarPiezaDevuelta,
} from './clasificar-pieza-devuelta';

const pieza = (over: Partial<PiezaParaClasificar> = {}): PiezaParaClasificar => ({
  destino: 'STOCK_USADO',
  insumoId: 'ins-1',
  insumoVigente: true,
  familiaEsRepuesto: true,
  seguimiento: 'SERIE',
  tieneUnidad: false,
  numeroSerie: 'SN-1',
  serialRepetidoEnElLote: false,
  ...over,
});

describe('clasificarPiezaDevuelta', () => {
  it('lista las seis causas del vocabulario', () => {
    expect([...CAUSAS_PIEZA_NO_DEVOLVIBLE]).toEqual([
      'INSUMO_BORRADO',
      'FAMILIA_NO_REPUESTO',
      'SERIAL_REQUERIDO',
      'SERIAL_INVALIDO',
      'SERIAL_REPETIDO',
      'SERIAL_DUPLICADO',
    ]);
  });

  it('un legado SERIE con serial válido no tiene causa', () => {
    expect(clasificarPiezaDevuelta(pieza())).toBeNull();
  });

  it('INSUMO_BORRADO: el insumo no existe o tiene baja lógica', () => {
    expect(clasificarPiezaDevuelta(pieza({ insumoVigente: false }))).toBe('INSUMO_BORRADO');
  });

  it('FAMILIA_NO_REPUESTO: la familia no es de repuestos o no existe', () => {
    expect(clasificarPiezaDevuelta(pieza({ familiaEsRepuesto: false }))).toBe(
      'FAMILIA_NO_REPUESTO',
    );
    expect(clasificarPiezaDevuelta(pieza({ familiaEsRepuesto: null }))).toBe('FAMILIA_NO_REPUESTO');
  });

  it('SERIAL_REQUERIDO: el legado no tiene serial o queda vacío al normalizarlo', () => {
    expect(clasificarPiezaDevuelta(pieza({ numeroSerie: null }))).toBe('SERIAL_REQUERIDO');
    expect(clasificarPiezaDevuelta(pieza({ numeroSerie: '   ' }))).toBe('SERIAL_REQUERIDO');
  });

  it('SERIAL_INVALIDO: el serial excede 255 caracteres', () => {
    expect(clasificarPiezaDevuelta(pieza({ numeroSerie: 'A'.repeat(256) }))).toBe(
      'SERIAL_INVALIDO',
    );
    expect(clasificarPiezaDevuelta(pieza({ numeroSerie: 'A'.repeat(255) }))).toBeNull();
  });

  it('SERIAL_INVALIDO: la forma normalizada excede 255 caracteres aunque la cargada no', () => {
    expect(clasificarPiezaDevuelta(pieza({ numeroSerie: 'ß'.repeat(200) }))).toBe(
      'SERIAL_INVALIDO',
    );
  });

  it('SERIAL_REPETIDO: otra pieza del lote trae el mismo serial', () => {
    expect(clasificarPiezaDevuelta(pieza({ serialRepetidoEnElLote: true }))).toBe(
      'SERIAL_REPETIDO',
    );
  });

  it('una pieza con unidad o de un insumo NINGUNO no exige serial de texto', () => {
    expect(clasificarPiezaDevuelta(pieza({ tieneUnidad: true, numeroSerie: null }))).toBeNull();
    expect(
      clasificarPiezaDevuelta(pieza({ seguimiento: 'NINGUNO', numeroSerie: null })),
    ).toBeNull();
  });

  it('un insumo deshabilitado y una familia no vigente se admiten (solo cuenta esRepuesto)', () => {
    // El deshabilitado y la baja lógica de la familia no son hechos de entrada: no frenan.
    expect(
      clasificarPiezaDevuelta(pieza({ insumoVigente: true, familiaEsRepuesto: true })),
    ).toBeNull();
  });

  it('con DESCARTE ninguna causa aplica, tampoco el insumo borrado', () => {
    expect(
      clasificarPiezaDevuelta(
        pieza({
          destino: 'DESCARTE',
          insumoVigente: false,
          familiaEsRepuesto: false,
          numeroSerie: null,
        }),
      ),
    ).toBeNull();
  });

  it('una pieza sin insumo no tiene causa', () => {
    expect(clasificarPiezaDevuelta(pieza({ insumoId: null, insumoVigente: false }))).toBeNull();
  });

  it('el borrado gana sobre las demás causas', () => {
    expect(
      clasificarPiezaDevuelta(
        pieza({ insumoVigente: false, familiaEsRepuesto: false, numeroSerie: null }),
      ),
    ).toBe('INSUMO_BORRADO');
  });
});
