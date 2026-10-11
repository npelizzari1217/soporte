import { EstadoEntity } from '../../tickets/domain/entities/estado.entity';
import { PrioridadEntity } from '../../tickets/domain/entities/prioridad.entity';
import { TipoTicketEntity } from '../../tickets/domain/entities/tipo-ticket.entity';
import { aCatalogosV1 } from './catalogos-v1.presenter';

describe('aCatalogosV1', () => {
  it('proyecta cada catalogo a la lista blanca del contrato v1, en el orden recibido', () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
      'tipo-1',
    );
    const prioridades = [
      PrioridadEntity.create(
        {
          codigo: 'BAJA',
          nombre: 'Baja',
          color: '#00ff00',
          orden: 10,
          activo: true,
          slaHoras: 48,
          slaPrimeraRespuestaHoras: 8,
        },
        'prio-1',
      ),
      PrioridadEntity.create(
        { codigo: 'CRITICA', nombre: 'Critica', color: null, orden: 40, activo: true },
        'prio-4',
      ),
    ];
    const estado = EstadoEntity.create(
      { codigo: 'CERRADO', nombre: 'Cerrado', color: '#999999', orden: 50, activo: true },
      'estado-5',
    );

    const res = aCatalogosV1([tipo], prioridades, [estado]);

    // toStrictEqual: un campo interno de mas (color, SLA, modulo, fechas) rompe el test.
    expect(res).toStrictEqual({
      tipos: [{ id: 'tipo-1', codigo: 'SOPORTE', nombre: 'Soporte' }],
      prioridades: [
        { id: 'prio-1', codigo: 'BAJA', nombre: 'Baja', orden: 10 },
        { id: 'prio-4', codigo: 'CRITICA', nombre: 'Critica', orden: 40 },
      ],
      estados: [{ id: 'estado-5', codigo: 'CERRADO', nombre: 'Cerrado', orden: 50 }],
    });
  });

  it('catalogos vacios dan listas vacias', () => {
    expect(aCatalogosV1([], [], [])).toStrictEqual({ tipos: [], prioridades: [], estados: [] });
  });
});
