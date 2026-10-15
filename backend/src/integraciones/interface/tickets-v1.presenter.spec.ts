import { EstadoEntity } from '../../tickets/domain/entities/estado.entity';
import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';
import { TicketsV1Presenter } from './tickets-v1.presenter';

const SOLICITANTE = '01977a00-0000-7000-8000-0000000000aa';
const ASIGNADO = '01977a00-0000-7000-8000-0000000000bb';
const ESTADO = '01977a00-0000-7000-8000-0000000000cc';

function ticket(): TicketEntity {
  const t = TicketEntity.create({
    numero: 'SOP-2026-00001',
    titulo: 'No imprime',
    descripcion: 'detalle',
    tipoId: 'tipo-1',
    estadoId: ESTADO,
    prioridadId: 'prio-1',
    cicloId: 'ciclo-interno',
    ticketReferenciaId: null,
    solicitanteId: SOLICITANTE,
  });
  t.assignTo(ASIGNADO);
  // Ubicacion y sector (odd/ubicacion-sector-ticket) no son parte del contrato v1.
  t.actualizarDatos({ ubicacion: 'Aula interna', sectorId: 'sector-interno' });
  return t;
}

function armar() {
  const resolverNombres = vi.fn().mockResolvedValue(
    new Map([
      [SOLICITANTE, { nombre: 'Integracion', apellido: 'API' }],
      [ASIGNADO, { nombre: 'Ana', apellido: 'Gomez' }],
    ]),
  );
  const presenter = new TicketsV1Presenter(
    { resolverNombres },
    { findNombres: vi.fn().mockResolvedValue(new Map()) },
    {
      findAllActive: vi
        .fn()
        .mockResolvedValue([
          EstadoEntity.create(
            { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
            ESTADO,
          ),
        ]),
    },
  );
  return { presenter, resolverNombres };
}

describe('TicketsV1Presenter', () => {
  it('proyecta nombres y codigo de estado en el contrato v1', async () => {
    const { presenter } = armar();

    const [res] = await presenter.presentar([ticket()]);

    expect(res).toMatchObject({
      numero: 'SOP-2026-00001',
      estado: 'ASIGNADO',
      solicitante: { nombre: 'Integracion', apellido: 'API' },
      asignado: { nombre: 'Ana', apellido: 'Gomez' },
    });
  });

  it('no filtra ids de usuarios de master, ciclo ni campos internos', async () => {
    const { presenter } = armar();

    const [res] = await presenter.presentar([ticket()]);

    expect(Object.keys(res).sort()).toEqual(
      [
        'asignado',
        'createdAt',
        'descripcion',
        'estado',
        'estadoId',
        'fechaCierre',
        'id',
        'numero',
        'prioridadId',
        'sla',
        'solicitante',
        'ticketReferenciaId',
        'tipoId',
        'titulo',
        'updatedAt',
      ].sort(),
    );
    const json = JSON.stringify(res);
    for (const interno of [
      SOLICITANTE,
      ASIGNADO,
      'ciclo-interno',
      'Aula interna',
      'sector-interno',
    ]) {
      expect(json).not.toContain(interno);
    }
  });

  it('resuelve los nombres en un solo lote y sin lista no consulta nada', async () => {
    const { presenter, resolverNombres } = armar();

    await presenter.presentar([ticket(), ticket()]);
    expect(resolverNombres).toHaveBeenCalledTimes(1);

    expect(await presenter.presentar([])).toEqual([]);
    expect(resolverNombres).toHaveBeenCalledTimes(1);
  });
});
