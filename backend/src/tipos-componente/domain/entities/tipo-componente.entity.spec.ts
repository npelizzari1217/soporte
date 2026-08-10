/**
 * PR1 [UNIT] — RED→GREEN: TipoComponente (catálogo MASTER de tipos de
 * componente). Cubre normalización de código, código vacío → error,
 * inmutabilidad del código, rename() y activar()/desactivar().
 *
 * Ref: sdd/tipos-componente-master (PR1).
 */
import { TipoComponente } from './tipo-componente.entity';
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
