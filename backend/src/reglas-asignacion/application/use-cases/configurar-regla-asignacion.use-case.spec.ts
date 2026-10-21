/**
 * [UNIT] ConfigurarReglaAsignacionUseCase — R1, R2, R3 (sdd/asignacion-automatica-por-tipo).
 *
 * Elegibilidad por tipo (odd/permisos-por-tipo-ticket, D5 g): `ElegibilidadAsignado` real sobre
 * dobles en memoria.
 *
 * Mutación documentada: saltear la revalidación de elegibilidad antes de `fijar` pone en rojo los
 * casos 422 (el ADMINISTRADOR, el de otro cliente y el dado de baja quedarían guardados).
 */
import { ElegibilidadAsignado } from '../../../tickets/application/services/elegibilidad-asignado';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { MasterAgentesEnMemoria } from '../../../tickets/test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';
import {
  ResponsableReglaNoElegibleError,
  TipoTicketNoConfigurableError,
} from '../../domain/errors';
import { ConfigurarReglaAsignacionUseCase } from './configurar-regla-asignacion.use-case';

const CLIENTE = 'cliente-1';
const ACTOR = 'u-admin';

class MasterCaidoError extends Error {}

function tipoActivo(): TipoTicketEntity {
  return TipoTicketEntity.create(
    { codigo: 'TICKETS', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
    'tipo-1',
  );
}

function armar(tipo: TipoTicketEntity | null = tipoActivo()) {
  const fijar = vi.fn().mockResolvedValue(undefined);
  const quitar = vi.fn().mockResolvedValue(undefined);
  // Solo Tina es agente con LECTURA sobre el tipo. El ADMINISTRADOR tiene la fila pero no es agente;
  // el de la celda del módulo es agente sin la fila; el de otro tipo tiene la fila de otro tipo; el
  // de otro cliente y el dado de baja no figuran en master como agentes del cliente.
  const master = new MasterAgentesEnMemoria();
  master.agregar({ id: 'u-tina', rol: 'TECNICO', celdas: [], nombre: 'Tina', apellido: 'Tecnica' });
  master.agregar({ id: 'u-admin-cliente', rol: 'ADMINISTRADOR', celdas: [] });
  master.agregar({ id: 'u-con-celda', rol: 'TECNICO', celdas: ['TICKETS:LECTURA'] });
  master.agregar({ id: 'u-otro-tipo', rol: 'TECNICO', celdas: [] });
  const permisos = new PermisosTipoTicketEnMemoria(
    [],
    ['u-tina', 'u-admin-cliente', 'u-otro-cliente', 'u-dado-de-baja'].map((usuarioId) => ({
      usuarioId,
      tipoId: 'tipo-1',
      accion: 'LECTURA' as const,
    })),
  );
  void permisos.agregarSiFaltan([
    { usuarioId: 'u-otro-tipo', tipoId: 'tipo-2', accion: 'LECTURA' },
    { usuarioId: 'u-con-celda', tipoId: 'tipo-1', accion: 'MODIFICACION' },
  ]);
  const listarAgentes = vi.spyOn(master, 'listarAgentes');
  const useCase = new ConfigurarReglaAsignacionUseCase(
    { findById: vi.fn().mockResolvedValue(tipo) },
    { fijar, quitar },
    new ElegibilidadAsignado(master, permisos),
  );
  const dto = (responsableId: string | null) => ({
    tipoId: 'tipo-1',
    responsableId,
    clienteId: CLIENTE,
    actorId: ACTOR,
  });
  return { useCase, fijar, quitar, listarAgentes, dto };
}

describe('ConfigurarReglaAsignacionUseCase', () => {
  it('null quita la regla del tipo y devuelve SIN_REGLA, sin consultar a master', async () => {
    const { useCase, quitar, fijar, listarAgentes, dto } = armar();

    const result = await useCase.execute(dto(null));

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toMatchObject({
      tipoId: 'tipo-1',
      responsableId: null,
      estado: 'SIN_REGLA',
    });
    expect(quitar).toHaveBeenCalledWith('tipo-1');
    expect(fijar).not.toHaveBeenCalled();
    expect(listarAgentes).not.toHaveBeenCalled();
  });

  it('un responsable elegible se fija con el actor como actualizado_por', async () => {
    const { useCase, fijar, dto } = armar();

    const result = await useCase.execute(dto('u-tina'));

    expect(result.getValue()).toMatchObject({
      responsableId: 'u-tina',
      responsableNombre: 'Tina Tecnica',
      estado: 'VALIDA',
    });
    expect(fijar).toHaveBeenCalledWith('tipo-1', 'u-tina', ACTOR);
  });

  it.each(['u-admin-cliente', 'u-otro-cliente', 'u-con-celda', 'u-otro-tipo', 'u-dado-de-baja'])(
    'el responsable %s no esta en el universo: ResponsableReglaNoElegibleError sin escribir',
    async (responsableId) => {
      const { useCase, fijar, quitar, dto } = armar();

      const result = await useCase.execute(dto(responsableId));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ResponsableReglaNoElegibleError);
      expect(fijar).not.toHaveBeenCalled();
      expect(quitar).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['inexistente', null],
    [
      'dado de baja',
      TipoTicketEntity.create(
        { codigo: 'X', nombre: 'X', modulo: 'TICKETS', activo: false },
        'tipo-1',
      ),
    ],
  ])('tipo %s: TipoTicketNoConfigurableError sin escribir', async (_caso, tipo) => {
    const { useCase, fijar, quitar, dto } = armar(tipo);

    const conResponsable = await useCase.execute(dto('u-tina'));
    const quitando = await useCase.execute(dto(null));

    expect(conResponsable.getError()).toBeInstanceOf(TipoTicketNoConfigurableError);
    expect(quitando.getError()).toBeInstanceOf(TipoTicketNoConfigurableError);
    expect(fijar).not.toHaveBeenCalled();
    expect(quitar).not.toHaveBeenCalled();
  });

  it('un fallo de master se propaga (no se degrada) y no escribe', async () => {
    const { useCase, fijar, listarAgentes, dto } = armar();
    listarAgentes.mockRejectedValue(new MasterCaidoError('master caido'));

    await expect(useCase.execute(dto('u-tina'))).rejects.toBeInstanceOf(MasterCaidoError);
    expect(fijar).not.toHaveBeenCalled();
  });
});
