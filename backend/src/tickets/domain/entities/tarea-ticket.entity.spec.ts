/**
 * [UNIT] TareaTicketEntity (odd/tareas-con-tecnico T1): el invariante que espeja el CHECK
 * `tareas_ticket_completada_check` y las reglas de completar, descompletar, asignar y borrar.
 */
import { TareaTicketEntity, TAREA_DESCRIPCION_MAX_LENGTH } from './tarea-ticket.entity';
import {
  TareaEliminadaError,
  TareaNoCompletadaError,
  TareaYaCompletadaError,
} from '../errors/tareas.errors';

const TICKET_ID = '01900000-0000-7000-8000-000000000001';
const TECNICO_ID = '01900000-0000-7000-8000-000000000002';
const OTRO_ID = '01900000-0000-7000-8000-000000000003';
const T0 = new Date('2026-10-13T10:00:00Z');
const T1 = new Date('2026-10-13T11:00:00Z');

function nueva(tecnicoId?: string | null): TareaTicketEntity {
  return TareaTicketEntity.crear({
    ticketId: TICKET_ID,
    descripcion: 'Cambiar cerradura',
    orden: 2,
    tecnicoId,
  });
}

/** El invariante del CHECK: completada ⇔ completadaEn y completadaPorId presentes. */
function cumpleInvariante(t: TareaTicketEntity): boolean {
  return t.completada
    ? t.completadaEn !== null && t.completadaPorId !== null
    : t.completadaEn === null && t.completadaPorId === null;
}

describe('TareaTicketEntity', () => {
  describe('crear', () => {
    it('nace pendiente, activa, con su orden y sin registro de completado', () => {
      const t = nueva();

      expect(t.ticketId).toBe(TICKET_ID);
      expect(t.descripcion).toBe('Cambiar cerradura');
      expect(t.orden).toBe(2);
      expect(t.tecnicoId).toBeNull();
      expect(t.completada).toBe(false);
      expect(t.completadaEn).toBeNull();
      expect(t.completadaPorId).toBeNull();
      expect(t.isDeleted()).toBe(false);
      expect(cumpleInvariante(t)).toBe(true);
    });

    it('acepta un técnico desde el alta', () => {
      expect(nueva(TECNICO_ID).tecnicoId).toBe(TECNICO_ID);
    });

    it('rechaza una descripción vacía o de solo espacios', () => {
      expect(() =>
        TareaTicketEntity.crear({ ticketId: TICKET_ID, descripcion: '   ', orden: 0 }),
      ).toThrow(/vacía/);
    });

    it('acepta el tope de largo y rechaza un carácter más', () => {
      const tope = 'x'.repeat(TAREA_DESCRIPCION_MAX_LENGTH);
      expect(
        TareaTicketEntity.crear({ ticketId: TICKET_ID, descripcion: tope, orden: 0 }).descripcion,
      ).toBe(tope);
      expect(() =>
        TareaTicketEntity.crear({ ticketId: TICKET_ID, descripcion: `${tope}x`, orden: 0 }),
      ).toThrow(/excede/);
    });
  });

  describe('completar', () => {
    it('registra quién y cuándo, y actualiza updatedAt', () => {
      const t = nueva();

      expect(t.completar(OTRO_ID, T1).isOk()).toBe(true);

      expect(t.completada).toBe(true);
      expect(t.completadaEn).toEqual(T1);
      expect(t.completadaPorId).toBe(OTRO_ID);
      expect(t.updatedAt).toEqual(T1);
      expect(cumpleInvariante(t)).toBe(true);
    });

    it('el crédito es de quien completa, aunque la tarea tenga otro técnico', () => {
      const t = nueva(TECNICO_ID);

      t.completar(OTRO_ID, T1);

      expect(t.completadaPorId).toBe(OTRO_ID);
      expect(t.tecnicoId).toBe(TECNICO_ID);
    });

    it('falla si ya está completada y conserva el registro original', () => {
      const t = nueva();
      t.completar(TECNICO_ID, T0);

      const r = t.completar(OTRO_ID, T1);

      expect(r.isFail()).toBe(true);
      expect(r.getError()).toBeInstanceOf(TareaYaCompletadaError);
      expect(t.completadaPorId).toBe(TECNICO_ID);
      expect(t.completadaEn).toEqual(T0);
    });
  });

  describe('descompletar', () => {
    it('vuelve a pendiente y limpia quién y cuándo', () => {
      const t = nueva();
      t.completar(TECNICO_ID, T0);

      expect(t.descompletar(T1).isOk()).toBe(true);

      expect(t.completada).toBe(false);
      expect(t.completadaEn).toBeNull();
      expect(t.completadaPorId).toBeNull();
      expect(t.updatedAt).toEqual(T1);
      expect(cumpleInvariante(t)).toBe(true);
    });

    it('falla sobre una tarea pendiente', () => {
      const r = nueva().descompletar(T1);

      expect(r.getError()).toBeInstanceOf(TareaNoCompletadaError);
    });
  });

  describe('asignarTecnico', () => {
    it('asigna, cambia y quita el técnico sin tocar el registro de completado', () => {
      const t = nueva();
      t.completar(OTRO_ID, T0);

      expect(t.asignarTecnico(TECNICO_ID, T1).isOk()).toBe(true);
      expect(t.tecnicoId).toBe(TECNICO_ID);

      expect(t.asignarTecnico(null, T1).isOk()).toBe(true);
      expect(t.tecnicoId).toBeNull();
      expect(t.completadaPorId).toBe(OTRO_ID);
      expect(t.updatedAt).toEqual(T1);
    });
  });

  describe('eliminar', () => {
    it('da de baja lógica en la fecha indicada', () => {
      const t = nueva();

      expect(t.eliminar(T1).isOk()).toBe(true);

      expect(t.deletedAt).toEqual(T1);
      expect(t.isDeleted()).toBe(true);
    });

    it('una tarea dada de baja ya no cambia', () => {
      const t = nueva();
      t.eliminar(T0);

      for (const r of [
        t.completar(TECNICO_ID, T1),
        t.descompletar(T1),
        t.asignarTecnico(TECNICO_ID, T1),
        t.eliminar(T1),
      ]) {
        expect(r.getError()).toBeInstanceOf(TareaEliminadaError);
      }
      expect(t.completada).toBe(false);
      expect(t.tecnicoId).toBeNull();
      expect(t.deletedAt).toEqual(T0);
    });
  });

  it('reconstitute conserva id, timestamps y baja lógica', () => {
    const t = TareaTicketEntity.reconstitute(
      {
        ticketId: TICKET_ID,
        descripcion: 'Pintar',
        orden: 1,
        tecnicoId: TECNICO_ID,
        completada: true,
        completadaEn: T0,
        completadaPorId: OTRO_ID,
      },
      'id-fijo',
      T0,
      T1,
      T1,
    );

    expect(t.id).toBe('id-fijo');
    expect(t.createdAt).toEqual(T0);
    expect(t.updatedAt).toEqual(T1);
    expect(t.deletedAt).toEqual(T1);
    expect(t.completadaPorId).toBe(OTRO_ID);
  });
});
