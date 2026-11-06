/**
 * [UNIT] Reglas de emisión de un certificado (odd/edilicia-obra-externa, S4, S5, S8).
 */
import { TareaTicketEntity } from '../entities/tarea-ticket.entity';
import {
  PesosIncompletosParaCertificarError,
  TareaNoCertificableError,
} from '../errors/certificados.errors';
import { tareasParaCertificar } from './emision-certificado';

const T0 = new Date('2026-11-06T10:00:00Z');

function tarea(id: string, peso: number, completada = true): TareaTicketEntity {
  const t = TareaTicketEntity.crear(
    { ticketId: 'ticket-1', descripcion: `Tarea ${id}`, orden: 0 },
    id,
  );
  t.asignarPeso(peso, T0);
  if (completada) t.completar('u-tec', T0);
  return t;
}

describe('tareasParaCertificar', () => {
  const tareas = [tarea('a', 20), tarea('b', 15), tarea('c', 65, false)];

  it('devuelve las pedidas con la copia de su peso (S8)', () => {
    expect(tareasParaCertificar(tareas, ['a', 'b'], new Set()).getValue()).toEqual([
      { tareaId: 'a', peso: 20 },
      { tareaId: 'b', peso: 15 },
    ]);
  });

  it('con pesos que no suman 100 rechaza con la suma (S4)', () => {
    const error = tareasParaCertificar(
      [tarea('a', 20), tarea('b', 15)],
      ['a'],
      new Set(),
    ).getError();

    expect(error).toBeInstanceOf(PesosIncompletosParaCertificarError);
    expect(error.message).toContain('35 %');
  });

  it.each([
    ['una tarea que no es del ticket', ['zz'], new Set<string>(), 'no es una tarea activa'],
    ['una tarea pendiente', ['c'], new Set<string>(), 'todavía no está completada'],
    [
      'una tarea en un certificado vigente',
      ['a'],
      new Set(['a']),
      'ya está en un certificado vigente',
    ],
  ])('rechaza %s (S5)', (_caso, pedidas, certificadas, texto) => {
    const error = tareasParaCertificar(tareas, pedidas, certificadas).getError();

    expect(error).toBeInstanceOf(TareaNoCertificableError);
    expect(error.message).toContain(texto);
  });

  it('una tarea con peso 0 se certifica y aporta 0 (L26)', () => {
    const conCero = [tarea('a', 100), tarea('b', 0)];

    expect(tareasParaCertificar(conCero, ['b'], new Set()).getValue()).toEqual([
      { tareaId: 'b', peso: 0 },
    ]);
  });
});
