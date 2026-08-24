/**
 * 4.2 TEST — Unit tests de EncuestaSatisfaccionEntity (RED → GREEN).
 *
 * La entidad recibe un `PuntajeCsat` ya validado (4.3) — no reimplementa la
 * validación de rango, mismo criterio que `ArchivoEntity` delegando en un
 * `Result` de dominio, pero acá la validación ocurre ANTES de construir
 * (no puede existir una instancia con puntaje inválido).
 *
 * Ref spec: sdd/csat/spec, Requirement "Registro de la respuesta (uso
 * único)". Tarea: 4.2.
 */
import { EncuestaSatisfaccionEntity } from './encuesta-satisfaccion.entity';
import { PuntajeCsat } from '../value-objects/puntaje-csat';

const puntajeValido = (valor: number): PuntajeCsat => PuntajeCsat.create(valor).getValue();

describe('EncuestaSatisfaccionEntity', () => {
  describe('create()', () => {
    it('expone ticketId, tokenId, puntaje y comentario', () => {
      const entity = EncuestaSatisfaccionEntity.create({
        ticketId: 'ticket-1',
        tokenId: 'token-1',
        puntaje: puntajeValido(4),
        comentario: 'Muy buena atención',
      });

      expect(entity.ticketId).toBe('ticket-1');
      expect(entity.tokenId).toBe('token-1');
      expect(entity.puntaje).toBe(4);
      expect(entity.comentario).toBe('Muy buena atención');
    });

    it('acepta comentario null (opcional)', () => {
      const entity = EncuestaSatisfaccionEntity.create({
        ticketId: 'ticket-1',
        tokenId: 'token-1',
        puntaje: puntajeValido(5),
        comentario: null,
      });

      expect(entity.comentario).toBeNull();
    });

    it('respondidaEn defaultea a la fecha actual si no se provee', () => {
      const before = new Date();
      const entity = EncuestaSatisfaccionEntity.create({
        ticketId: 'ticket-1',
        tokenId: 'token-1',
        puntaje: puntajeValido(3),
        comentario: null,
      });
      const after = new Date();

      expect(entity.respondidaEn.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entity.respondidaEn.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye desde persistencia con todos los campos', () => {
      const respondidaEn = new Date('2026-06-01T12:00:00Z');
      const entity = EncuestaSatisfaccionEntity.reconstitute(
        {
          ticketId: 'ticket-1',
          tokenId: 'token-1',
          puntaje: 5,
          comentario: 'Excelente',
          respondidaEn,
        },
        'encuesta-id',
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-06-01T00:00:00Z'),
        null,
      );

      expect(entity.id).toBe('encuesta-id');
      expect(entity.puntaje).toBe(5);
      expect(entity.respondidaEn).toBe(respondidaEn);
    });
  });
});
