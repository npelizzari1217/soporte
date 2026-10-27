import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../tickets/domain/ports/i-ticket.repository';
import { SituacionTicketGuardado } from '../domain/ports/i-tramo-tecnico.repository';
import { TicketRepositoryConTramos } from './ticket-repository-con-tramos';
import { DomainEvent } from '../../shared/domain/ports/i-domain-event-publisher';

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

function armar(opciones: { guardarFalla?: boolean; previo?: SituacionTicketGuardado | null } = {}) {
  const pasos: string[] = [];
  const publicados: DomainEvent[] = [];
  const alCommit: Array<() => void> = [];
  let enTransaccion = false;
  const previo = opciones.previo === undefined ? PREVIO : opciones.previo;
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
        return previo;
      },
      sincronizar: async (id, previo) => {
        pasos.push(`sincronizar ${id} previo=${previo?.estadoCodigo} tx=${enTransaccion}`);
      },
    },
    {
      // Como el runner real: lo encolado con `alCommitear` corre solo si la transacción confirma.
      run: async <T>(fn: () => Promise<T>): Promise<T> => {
        enTransaccion = true;
        try {
          const resultado = await fn();
          enTransaccion = false;
          alCommit.splice(0).forEach((cb) => cb());
          return resultado;
        } finally {
          enTransaccion = false;
          alCommit.length = 0;
        }
      },
      alCommitear: (cb: () => void) => {
        alCommit.push(cb);
      },
    },
    {
      publish: (evento) => {
        publicados.push(evento);
      },
    },
  );
  return { repo, pasos, publicados };
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

  describe('aviso de cambio de estado (odd/tasks/defectos-ayuda.md, S6)', () => {
    it('si el estado cambió, publica ticket.estado_modificado después del commit', async () => {
      const { repo, publicados } = armar({ previo: { ...PREVIO, estadoId: 'otro-estado' } });

      await repo.save(ticket);

      expect(publicados.map((e) => e.name)).toEqual(['ticket.estado_modificado']);
      expect(publicados[0]).toMatchObject({ ticketId: ticket.id });
    });

    it('si el estado no cambió, no publica nada', async () => {
      const { repo, publicados } = armar();

      await repo.save(ticket);

      expect(publicados).toEqual([]);
    });

    it('el alta no publica: ya la avisa ticket.creado', async () => {
      const { repo, publicados } = armar({ previo: null });

      await repo.save(ticket);

      expect(publicados).toEqual([]);
    });

    it('si el guardado falla, no publica', async () => {
      const { repo, publicados } = armar({
        guardarFalla: true,
        previo: { ...PREVIO, estadoId: 'otro-estado' },
      });

      await expect(repo.save(ticket)).rejects.toThrow('fallo del upsert');
      expect(publicados).toEqual([]);
    });
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
