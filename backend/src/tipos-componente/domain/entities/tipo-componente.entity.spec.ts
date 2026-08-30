/**
 * PR1 [UNIT] — RED→GREEN: TipoComponente (catálogo MASTER de tipos de
 * componente). Cubre normalización de código, código vacío → error,
 * inmutabilidad del código, rename() y activar()/desactivar().
 *
 * Ref: sdd/tipos-componente-master (PR1).
 */
import {
  TipoComponente,
  TIPO_COMPONENTE_CODIGO_MAX_LENGTH,
  TIPO_COMPONENTE_NOMBRE_MAX_LENGTH,
  normalizarCodigoTipoComponente,
} from './tipo-componente.entity';
import { CodigoTipoComponenteInvalidoError } from '../errors/tipos-componente.errors';

function baseInput() {
  return { codigo: 'cpu', nombre: 'CPU / Procesador' };
}

describe('TipoComponente', () => {
  describe('create()', () => {
    it('normaliza el código a trim().toUpperCase()', () => {
      const result = TipoComponente.create({ codigo: '  cpu  ', nombre: 'CPU' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().codigo).toBe('CPU');
    });

    it('crea la instancia activa por defecto, con id generado', () => {
      const result = TipoComponente.create(baseInput());

      const tipo = result.getValue();
      expect(tipo.activo).toBe(true);
      expect(tipo.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(tipo.nombre).toBe('CPU / Procesador');
    });

    it('falla con CodigoTipoComponenteInvalidoError cuando el código normalizado queda vacío', () => {
      const result = TipoComponente.create({ codigo: '   ', nombre: 'CPU' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CodigoTipoComponenteInvalidoError);
      expect(result.getError().code).toBe('TC_CODIGO_INVALIDO');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia preservando id y timestamps exactos', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const tipo = TipoComponente.reconstitute(
        { codigo: 'RAM', nombre: 'Memoria RAM', activo: false },
        'db-uuid-ram',
        createdAt,
        updatedAt,
      );

      expect(tipo.id).toBe('db-uuid-ram');
      expect(tipo.codigo).toBe('RAM');
      expect(tipo.activo).toBe(false);
      expect(tipo.createdAt).toEqual(createdAt);
      expect(tipo.updatedAt).toEqual(updatedAt);
    });
  });

  describe('inmutabilidad del código', () => {
    it('no expone un setter de código — codigo solo cambia vía create()/reconstitute()', () => {
      const tipo = TipoComponente.create(baseInput()).getValue();

      expect((tipo as unknown as { setCodigo?: unknown }).setCodigo).toBeUndefined();
      expect(
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(tipo), 'codigo')?.set,
      ).toBeUndefined();
    });
  });

  describe('rename()', () => {
    it('cambia el nombre y actualiza updatedAt', () => {
      const tipo = TipoComponente.create(baseInput()).getValue();
      const updatedAtOriginal = tipo.updatedAt;

      tipo.rename('CPU (procesador)');

      expect(tipo.nombre).toBe('CPU (procesador)');
      expect(tipo.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAtOriginal.getTime());
    });
  });

  describe('desactivar()/activar()', () => {
    it('desactivar() setea activo=false (baja lógica, sin deletedAt)', () => {
      const tipo = TipoComponente.create(baseInput()).getValue();

      tipo.desactivar();

      expect(tipo.activo).toBe(false);
      expect(tipo.deletedAt).toBeNull();
    });

    it('activar() vuelve a setear activo=true', () => {
      const tipo = TipoComponente.create(baseInput()).getValue();
      tipo.desactivar();

      tipo.activar();

      expect(tipo.activo).toBe(true);
    });
  });
});

/**
 * Topes de largo, espejando `tiposComponente.codigo VarChar(50)` y
 * `tiposComponente.nombre VarChar(100)` (`prisma_master/schema.prisma`).
 *
 * Hasta este cambio no los acotaba ninguna capa: el valor llegaba a Postgres y
 * moría con 22001 (500 crudo).
 *
 * `codigo` es el caso delicado: `create()` lo normaliza con
 * `trim().toUpperCase()`, y `toUpperCase()` puede AGRANDAR el string —`'ß'` se
 * convierte en `'SS'`, 1 carácter en 2—. Por eso el guard mide el NORMALIZADO,
 * no el crudo, y el DTO aplica la misma función antes de medir. Es la rama 3 de
 * la "regla de tres ramas" de `equipo-informatico.entity.ts`, la que motivó ese
 * mecanismo justamente porque medir el crudo dejaba pasar valores que se
 * expandían recién al persistir.
 */
describe('TipoComponente — topes de largo', () => {
  it('acepta codigo y nombre en el límite exacto', () => {
    const r = TipoComponente.create({
      codigo: 'A'.repeat(TIPO_COMPONENTE_CODIGO_MAX_LENGTH),
      nombre: 'B'.repeat(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH),
    });
    expect(r.isOk()).toBe(true);
  });

  it('rechaza un codigo que pasa el tope', () => {
    expect(() =>
      TipoComponente.create({
        codigo: 'A'.repeat(TIPO_COMPONENTE_CODIGO_MAX_LENGTH + 1),
        nombre: 'x',
      }),
    ).toThrow(/codigo excede/);
  });

  it('rechaza un nombre que pasa el tope', () => {
    expect(() =>
      TipoComponente.create({
        codigo: 'A',
        nombre: 'B'.repeat(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH + 1),
      }),
    ).toThrow(/nombre excede/);
  });

  it('rename() rechaza un nombre que pasa el tope', () => {
    const tipo = TipoComponente.create({ codigo: 'RAM', nombre: 'Memoria' }).getValue();
    expect(() => tipo.rename('B'.repeat(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH + 1))).toThrow(
      /nombre excede/,
    );
  });

  /**
   * EL CASO QUE MOTIVA MEDIR EL NORMALIZADO: 50 'ß' entran en el tope crudo,
   * pero `toUpperCase()` los convierte en 100 'S'. Midiendo el crudo esto
   * pasaría y reventaría en la columna de 50.
   */
  it('rechaza un codigo que entra crudo pero se EXPANDE al normalizar', () => {
    const crudo = 'ß'.repeat(TIPO_COMPONENTE_CODIGO_MAX_LENGTH);
    expect(crudo).toHaveLength(TIPO_COMPONENTE_CODIGO_MAX_LENGTH);
    expect(normalizarCodigoTipoComponente(crudo).length).toBeGreaterThan(
      TIPO_COMPONENTE_CODIGO_MAX_LENGTH,
    );
    expect(() => TipoComponente.create({ codigo: crudo, nombre: 'x' })).toThrow(/codigo excede/);
  });

  /** Hermano invertido: ASCII normal no cambia de largo al normalizar. */
  it('el texto ASCII conserva el largo al normalizar', () => {
    expect(normalizarCodigoTipoComponente('ram-ddr4')).toBe('RAM-DDR4');
  });

  /** Centinela de valor: los topes son el ancho real de cada columna. */
  it('los topes coinciden con el ancho de las columnas', () => {
    expect(TIPO_COMPONENTE_CODIGO_MAX_LENGTH).toBe(50);
    expect(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH).toBe(100);
  });
});
