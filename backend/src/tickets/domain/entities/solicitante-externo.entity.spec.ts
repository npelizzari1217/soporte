/**
 * [UNIT] SolicitanteExternoEntity (sdd/formulario-publico-qr, WU-6, tarea 6.2): validación y
 * normalización de los datos del formulario público, y reconstitución desde persistencia.
 */
import { SolicitanteExternoEntity } from './solicitante-externo.entity';

const VERIFICADO = new Date('2026-10-03T12:00:00Z');

function input(extra: Partial<Parameters<typeof SolicitanteExternoEntity.create>[0]> = {}) {
  return { nombre: 'Ana Pérez', email: 'ana@ejemplo.com', emailVerificadoAt: VERIFICADO, ...extra };
}

describe('SolicitanteExternoEntity', () => {
  describe('create()', () => {
    it('crea con id UUIDv7, sin teléfono y sin baja lógica', () => {
      const r = SolicitanteExternoEntity.create(input());

      expect(r.isOk()).toBe(true);
      const s = r.getValue();
      expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(s.nombre).toBe('Ana Pérez');
      expect(s.email).toBe('ana@ejemplo.com');
      expect(s.telefono).toBeNull();
      expect(s.emailVerificadoAt).toEqual(VERIFICADO);
      expect(s.isDeleted()).toBe(false);
    });

    it('normaliza: trim del nombre, email en minúsculas y teléfono con trim', () => {
      const s = SolicitanteExternoEntity.create(
        input({ nombre: '  Ana  ', email: '  ANA@Ejemplo.COM ', telefono: ' 11 5555-0000 ' }),
      ).getValue();

      expect(s.nombre).toBe('Ana');
      expect(s.email).toBe('ana@ejemplo.com');
      expect(s.telefono).toBe('11 5555-0000');
    });

    it('un teléfono vacío o en blanco queda en null', () => {
      expect(
        SolicitanteExternoEntity.create(input({ telefono: '   ' })).getValue().telefono,
      ).toBeNull();
      expect(
        SolicitanteExternoEntity.create(input({ telefono: '' })).getValue().telefono,
      ).toBeNull();
    });

    it('acepta un id explícito', () => {
      expect(SolicitanteExternoEntity.create(input(), 'id-fijo').getValue().id).toBe('id-fijo');
    });

    it.each([
      ['nombre vacío', input({ nombre: '   ' })],
      ['nombre de 121 caracteres', input({ nombre: 'a'.repeat(121) })],
      ['email sin arroba', input({ email: 'ana.ejemplo.com' })],
      ['email sin dominio', input({ email: 'ana@' })],
      ['email con espacios', input({ email: 'a na@ejemplo.com' })],
      ['email de más de 254 caracteres', input({ email: `${'a'.repeat(250)}@e.com` })],
      ['teléfono de 31 caracteres', input({ telefono: '1'.repeat(31) })],
      ['fecha de verificación inválida', input({ emailVerificadoAt: new Date('x') })],
    ])('rechaza %s con SOLICITANTE_EXTERNO_INVALIDO', (_caso, datos) => {
      const r = SolicitanteExternoEntity.create(datos);

      expect(r.isFail()).toBe(true);
      expect(r.getError().code).toBe('SOLICITANTE_EXTERNO_INVALIDO');
    });

    it('acepta los límites exactos: nombre de 120, email de 254 y teléfono de 30', () => {
      const email = `${'a'.repeat(242)}@ejemplo.com`;
      expect(email).toHaveLength(254);

      const r = SolicitanteExternoEntity.create(
        input({ nombre: 'n'.repeat(120), email, telefono: '1'.repeat(30) }),
      );

      expect(r.isOk()).toBe(true);
    });
  });

  describe('reconstitute()', () => {
    it('preserva id, datos y timestamps exactos', () => {
      const creado = new Date('2026-10-01T00:00:00Z');
      const actualizado = new Date('2026-10-02T00:00:00Z');

      const s = SolicitanteExternoEntity.reconstitute(
        { nombre: 'Luis', email: 'luis@x.com', telefono: '123', emailVerificadoAt: VERIFICADO },
        'db-id',
        creado,
        actualizado,
      );

      expect(s.id).toBe('db-id');
      expect(s.telefono).toBe('123');
      expect(s.createdAt).toEqual(creado);
      expect(s.updatedAt).toEqual(actualizado);
      expect(s.deletedAt).toBeNull();
    });
  });
});
