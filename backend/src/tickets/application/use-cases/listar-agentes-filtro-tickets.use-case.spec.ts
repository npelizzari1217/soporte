/**
 * [UNIT] — `ListarAgentesFiltroTicketsUseCase`.
 *
 * Sin DB: `ElegibilidadAsignado` real sobre dobles en memoria. Cubre el universo del filtro
 * "Asignado" del listado: TECNICO o COLABORADOR con `LECTURA` sobre alguno de los tipos que el
 * actor ve, acotado al tipo filtrado (`?tipo=`) cuando lo hay. Los fixtures contienen a quien NO
 * tiene que aparecer: un usuario sin rol de técnico con `LECTURA` sobre un tipo visible, un técnico
 * sin permisos y un técnico de un tipo que el actor no ve.
 */
import { ListarAgentesFiltroTicketsUseCase } from './listar-agentes-filtro-tickets.use-case';
import { ListaDeAgentesNoPermitidaError } from '../../domain/errors/tickets.errors';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import { MasterAgentesEnMemoria } from '../../test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { ElegibilidadAsignado } from '../services/elegibilidad-asignado';

const ANA = { id: 'tec-ana', nombre: 'Ana', apellido: 'García' };
const BETO = { id: 'col-beto', nombre: 'Beto', apellido: 'López' };
const CARO = { id: 'tec-caro', nombre: 'Caro', apellido: 'Díaz' };
const USU = { id: 'usu-1', nombre: 'Uriel', apellido: 'Acosta' };
const DIEGO = { id: 'tec-diego', nombre: 'Diego', apellido: 'Benítez' };
const ADMIN = { id: 'adm-1', nombre: 'Alma', apellido: 'Aguirre' };

const TIPO_SOPORTE = 'tipo-soporte';
const TIPO_REDES = 'tipo-redes';
const TIPO_ELECTRICIDAD = 'tipo-electricidad';
const TIPO_COMPRAS = 'tipo-compras';

function makeUseCase() {
  // Ana atiende Soporte y Redes; Beto, Redes; Caro, Electricidad. Uriel (USUARIO) y Alma
  // (ADMINISTRADOR) tienen LECTURA sobre Soporte pero no son técnicos. Diego es técnico sin filas.
  const master = new MasterAgentesEnMemoria();
  master.agregar({ ...ANA, rol: 'TECNICO', celdas: [] });
  master.agregar({ ...BETO, rol: 'COLABORADOR', celdas: [] });
  master.agregar({ ...CARO, rol: 'TECNICO', celdas: [] });
  master.agregar({ ...USU, rol: 'USUARIO', celdas: [] });
  master.agregar({ ...DIEGO, rol: 'TECNICO', celdas: ['TICKETS:LECTURA'] });
  master.agregar({ ...ADMIN, rol: 'ADMINISTRADOR', celdas: [] });
  const permisos = new PermisosTipoTicketEnMemoria(
    [
      { id: TIPO_SOPORTE, modulo: 'TICKETS' },
      { id: TIPO_REDES, modulo: 'TICKETS' },
      { id: TIPO_ELECTRICIDAD, modulo: 'EDILICIA' },
      { id: TIPO_COMPRAS, modulo: 'COMPRAS' },
    ],
    [
      { usuarioId: ANA.id, tipoId: TIPO_SOPORTE, accion: 'LECTURA' },
      { usuarioId: ANA.id, tipoId: TIPO_REDES, accion: 'LECTURA' },
      { usuarioId: BETO.id, tipoId: TIPO_REDES, accion: 'LECTURA' },
      { usuarioId: CARO.id, tipoId: TIPO_ELECTRICIDAD, accion: 'LECTURA' },
      { usuarioId: USU.id, tipoId: TIPO_SOPORTE, accion: 'LECTURA' },
      { usuarioId: ADMIN.id, tipoId: TIPO_SOPORTE, accion: 'LECTURA' },
    ],
  );
  return new ListarAgentesFiltroTicketsUseCase(
    permisos,
    new ElegibilidadAsignado(master, permisos),
  );
}

/** Asignador que ve Soporte y Redes, pero no Electricidad. */
const ASIGNADOR = alcancePorTipo('asignador', {
  [TIPO_SOPORTE]: ['LECTURA', 'ASIGNAR'],
  [TIPO_REDES]: ['LECTURA'],
});

describe('ListarAgentesFiltroTicketsUseCase', () => {
  it('sin tipo: los agentes de los tipos que el actor ve, una vez cada uno, ordenados', async () => {
    const result = await makeUseCase().execute({ clienteId: 'cliente-1', ...ASIGNADOR });

    // Ana tiene LECTURA sobre dos tipos visibles y figura una sola vez. Caro atiende un tipo que
    // el actor no ve; Uriel y Alma no son técnicos; Diego no tiene permiso sobre ningún tipo.
    expect(result.getValue()).toEqual([ANA, BETO]);
  });

  it('con tipo: solo los agentes de ese tipo', async () => {
    const result = await makeUseCase().execute({
      clienteId: 'cliente-1',
      tipoId: TIPO_SOPORTE,
      ...ASIGNADOR,
    });

    expect(result.getValue()).toEqual([ANA]);
  });

  it('con un tipo que el actor no ve: lista vacía, pedir un tipo no amplía el alcance', async () => {
    const result = await makeUseCase().execute({
      clienteId: 'cliente-1',
      tipoId: TIPO_ELECTRICIDAD,
      ...ASIGNADOR,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it('sin restricción (ROOT o ADMINISTRADOR): los agentes de todos los tipos', async () => {
    const result = await makeUseCase().execute({
      clienteId: 'cliente-1',
      ...alcanceSinRestriccion('admin'),
    });

    expect(result.getValue()).toEqual([CARO, ANA, BETO]);
  });

  it('sin restricción y con tipo: solo los agentes de ese tipo', async () => {
    const result = await makeUseCase().execute({
      clienteId: 'cliente-1',
      tipoId: TIPO_ELECTRICIDAD,
      ...alcanceSinRestriccion('admin'),
    });

    expect(result.getValue()).toEqual([CARO]);
  });

  it('VER_TODOS sobre un tipo de Tickets también abre la lista', async () => {
    const result = await makeUseCase().execute({
      clienteId: 'cliente-1',
      ...alcancePorTipo('supervisor', { [TIPO_REDES]: ['LECTURA', 'VER_TODOS'] }),
    });

    expect(result.getValue()).toEqual([ANA, BETO]);
  });

  it('solo con LECTURA (sin ASIGNAR ni VER_TODOS) → ListaDeAgentesNoPermitidaError', async () => {
    const result = await makeUseCase().execute({
      clienteId: 'cliente-1',
      ...alcancePorTipo('lector', { [TIPO_SOPORTE]: ['LECTURA'] }),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ListaDeAgentesNoPermitidaError);
  });
});
