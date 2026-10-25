import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../tickets/domain/ports/i-ticket.repository';
import { SituacionTicketGuardado } from '../domain/ports/i-tramo-tecnico.repository';
import { TicketRepositoryConTramos } from './ticket-repository-con-tramos';

const ticket = TicketEntity.create({
  numero: 'SOP-2026-00001',
  titulo: 'Impresora',
  descripcion: null,
  tipoId: 'tipo',
  estadoId: 'estado',
  prioridadId: 'prioridad',
  cicloId: null,
  ticketReferenciaId: null,
  solicitanteId: '01900000-0000-7000-8000-000000000001',
});
const PREVIO: SituacionTicketGuardado = {
  asignadoId: null,
  estadoId: 'estado',
  estadoCodigo: 'NUEVO',
  slaMetaS: null,
};

function armar(opciones: { guardarFalla?: boolean } = {}) {
  const pasos: string[] = [];
  let enTransaccion = false;
  const inner: ITicketRepository = {
    findById: async (id) => (id === ticket.id ? ticket : null),
    findByIds: async (ids) => new Map(ids.map((id) => [id, ticket])),
    findByNumero: async () => ticket,
    findLastSecuencia: async (tipoId, anio) => (tipoId === 'tipo' && anio === 2026 ? 41 : 0),
    findAll: async (filtros) => (filtros?.limit === 1 ? [ticket] : []),
    count: async () => 7,
    esVisiblePara: async (_ticketId, actorId) => actorId === 'actor',
    bloquear: async (id) => {
      pasos.push(`bloquear ${id}`);
    },
    save: async (t) => {
      pasos.push(`save ${t.id} tx=${enTransaccion}`);
      if (opciones.guardarFalla) throw new Error('fallo del upsert');
    },
    delete: async (id) => {
      pasos.push(`delete ${id}`);
    },
    borrarSiActivo: async (_id, ahora) => ahora.getTime() > 0,
    recuperarSiBorrado: async () => false,
  };
  const repo = new TicketRepositoryConTramos(
    inner,
    {
      leerPrevio: async (id) => {
        pasos.push(`leerPrevio ${id} tx=${enTransaccion}`);
        return PREVIO;
      },
      sincronizar: async (id, previo) => {
        pasos.push(`sincronizar ${id} previo=${previo?.estadoCodigo} tx=${enTransaccion}`);
      },
    },
    {
      run: async <T>(fn: () => Promise<T>): Promise<T> => {
        enTransaccion = true;
        try {
          return await fn();
        } finally {
          enTransaccion = false;
        }
      },
    },
  );
  return { repo, pasos };
}

describe('TicketRepositoryConTramos', () => {
  it('guarda dentro de una transacción: lee la situación previa, guarda y sincroniza el tramo', async () => {
    const { repo, pasos } = armar();

    await repo.save(ticket);

    expect(pasos).toEqual([
      `leerPrevio ${ticket.id} tx=true`,
      `save ${ticket.id} tx=true`,
      `sincronizar ${ticket.id} previo=NUEVO tx=true`,
    ]);
  });

  it('si el guardado del ticket falla, no sincroniza y propaga el error', async () => {
    const { repo, pasos } = armar({ guardarFalla: true });

    await expect(repo.save(ticket)).rejects.toThrow('fallo del upsert');
    expect(pasos).toEqual([`leerPrevio ${ticket.id} tx=true`, `save ${ticket.id} tx=true`]);
  });

  it('el resto de los métodos delega en el repositorio de tickets sin tocar los tramos', async () => {
    const { repo, pasos } = armar();

    expect(await repo.findById(ticket.id)).toBe(ticket);
    expect(await repo.findById('otro')).toBeNull();
    expect([...(await repo.findByIds([ticket.id])).keys()]).toEqual([ticket.id]);
    expect(await repo.findByNumero('SOP-2026-00001')).toBe(ticket);
    expect(await repo.findLastSecuencia('tipo', 2026)).toBe(41);
    expect(await repo.findAll({ limit: 1 })).toEqual([ticket]);
    expect(await repo.count()).toBe(7);
    expect(await repo.esVisiblePara(ticket.id, 'actor')).toBe(true);
    expect(await repo.borrarSiActivo(ticket.id, new Date(1))).toBe(true);
    expect(await repo.recuperarSiBorrado(ticket.id, new Date(1))).toBe(false);
    await repo.bloquear(ticket.id);
    await repo.delete(ticket.id);

    expect(pasos).toEqual([`bloquear ${ticket.id}`, `delete ${ticket.id}`]);
  });
});
