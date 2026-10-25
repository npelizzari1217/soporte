/**
 * [UNIT] Casos de uso del horario propio de un usuario (odd/tasks/tiempo-tecnico.md, T1, S1-S2):
 * `ObtenerHorarioLaboralUsuarioUseCase`, `GuardarHorarioLaboralUsuarioUseCase` y
 * `BorrarHorarioLaboralUsuarioUseCase`. Puertos mockeados; la escritura real y su atomicidad están
 * en `prisma-horario-laboral-usuario.repository.integration.spec.ts`.
 */
import { ObtenerHorarioLaboralUsuarioUseCase } from './obtener-horario-laboral-usuario.use-case';
import { GuardarHorarioLaboralUsuarioUseCase } from './guardar-horario-laboral-usuario.use-case';
import { BorrarHorarioLaboralUsuarioUseCase } from './borrar-horario-laboral-usuario.use-case';
import {
  HorarioLaboralSinDiasAbiertosError,
  UsuarioHorarioNoEncontradoError,
  VentanaLaboralInvalidaError,
} from '../../domain/errors/horario-laboral.errors';
import { HorarioLaboralResuelto } from '../../domain/services/resolver-horario-laboral-usuario.service';
import {
  DiaHorarioEntrada,
  HorarioLaboralSemanal,
} from '../../domain/value-objects/horario-laboral-semanal';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';

const USUARIO = '01900000-0000-7000-8000-000000000711';
const CLIENTE = '01900000-0000-7000-8000-000000000712';

const DIAS_PROPIOS: DiaHorarioEntrada[] = [
  { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
  { diaSemana: 1, aperturaMinuto: 480, cierreMinuto: 960 },
  { diaSemana: 2, aperturaMinuto: 480, cierreMinuto: 960 },
  { diaSemana: 3, aperturaMinuto: 480, cierreMinuto: 960 },
  { diaSemana: 4, aperturaMinuto: 480, cierreMinuto: 960 },
  { diaSemana: 5, aperturaMinuto: 480, cierreMinuto: 960 },
  { diaSemana: 6, aperturaMinuto: 540, cierreMinuto: 780 },
];

const RESUELTO_USUARIO: HorarioLaboralResuelto = {
  calendario: HorarioLaboralSemanal.crear(DIAS_PROPIOS).getValue().aCalendario(),
  origen: 'USUARIO',
};

const RESUELTO_CLIENTE: HorarioLaboralResuelto = {
  calendario: [
    { aperturaMinuto: null, cierreMinuto: null },
    { aperturaMinuto: 540, cierreMinuto: 1080 },
    { aperturaMinuto: 540, cierreMinuto: 1080 },
    { aperturaMinuto: 540, cierreMinuto: 1080 },
    { aperturaMinuto: 540, cierreMinuto: 1080 },
    { aperturaMinuto: 540, cierreMinuto: 1080 },
    { aperturaMinuto: null, cierreMinuto: null },
  ],
  origen: 'CLIENTE',
};

function colaboradores(opciones: { esMiembro: boolean; resuelto: HorarioLaboralResuelto }) {
  // Orden observable: abrir/cerrar la transacción, escribir, leer.
  const eventos: string[] = [];
  const escrituras: { usuarioId: string; horario: HorarioLaboralSemanal }[] = [];
  const checker = { existeEnTenant: vi.fn().mockResolvedValue(opciones.esMiembro) };
  const repo = {
    reemplazar: vi.fn(async (usuarioId: string, horario: HorarioLaboralSemanal) => {
      eventos.push('reemplazar');
      escrituras.push({ usuarioId, horario });
    }),
    borrar: vi.fn(async () => {
      eventos.push('borrar');
    }),
  };
  const txRunner: Pick<ITenantTransactionRunner, 'run'> = {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      eventos.push('tx:abre');
      const resultado = await fn();
      eventos.push('tx:commit');
      return resultado;
    },
  };
  const resolver = {
    obtenerParaUsuario: vi.fn(async () => {
      eventos.push('leer');
      return opciones.resuelto;
    }),
  };
  return { eventos, escrituras, checker, repo, txRunner, resolver };
}

describe('ObtenerHorarioLaboralUsuarioUseCase', () => {
  it('para un usuario del tenant, devuelve el horario resuelto con su origen', async () => {
    const c = colaboradores({ esMiembro: true, resuelto: RESUELTO_CLIENTE });
    const useCase = new ObtenerHorarioLaboralUsuarioUseCase(c.checker, c.resolver);

    const result = await useCase.execute({ usuarioId: USUARIO, clienteId: CLIENTE });

    expect(result.getValue()).toEqual(RESUELTO_CLIENTE);
    expect(c.checker.existeEnTenant).toHaveBeenCalledWith(USUARIO, CLIENTE);
    expect(c.resolver.obtenerParaUsuario).toHaveBeenCalledWith(USUARIO);
  });

  it('para un usuario que no pertenece al tenant, falla con UsuarioHorarioNoEncontradoError y no lee el horario', async () => {
    const c = colaboradores({ esMiembro: false, resuelto: RESUELTO_CLIENTE });
    const useCase = new ObtenerHorarioLaboralUsuarioUseCase(c.checker, c.resolver);

    const result = await useCase.execute({ usuarioId: USUARIO, clienteId: CLIENTE });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UsuarioHorarioNoEncontradoError);
    expect(result.getError().message).toBe(
      `El usuario ${USUARIO} no existe o no pertenece a este cliente.`,
    );
    expect(c.eventos).toEqual([]);
  });
});

describe('GuardarHorarioLaboralUsuarioUseCase', () => {
  it('con un horario válido, escribe dentro de la transacción y devuelve lo leído después del commit', async () => {
    const c = colaboradores({ esMiembro: true, resuelto: RESUELTO_USUARIO });
    const useCase = new GuardarHorarioLaboralUsuarioUseCase(
      c.checker,
      c.repo,
      c.txRunner,
      c.resolver,
    );

    const result = await useCase.execute({
      usuarioId: USUARIO,
      clienteId: CLIENTE,
      dias: DIAS_PROPIOS,
    });

    expect(result.getValue()).toEqual(RESUELTO_USUARIO);
    expect(c.eventos).toEqual(['tx:abre', 'reemplazar', 'tx:commit', 'leer']);
    expect(c.escrituras).toHaveLength(1);
    expect(c.escrituras[0].usuarioId).toBe(USUARIO);
    expect(c.escrituras[0].horario.aCalendario()).toEqual(RESUELTO_USUARIO.calendario);
  });

  it('con los 7 días cerrados, falla con HorarioLaboralSinDiasAbiertosError sin tocar la base', async () => {
    const c = colaboradores({ esMiembro: true, resuelto: RESUELTO_USUARIO });
    const useCase = new GuardarHorarioLaboralUsuarioUseCase(
      c.checker,
      c.repo,
      c.txRunner,
      c.resolver,
    );
    const cerrados = DIAS_PROPIOS.map((dia) => ({
      ...dia,
      aperturaMinuto: null,
      cierreMinuto: null,
    }));

    const result = await useCase.execute({
      usuarioId: USUARIO,
      clienteId: CLIENTE,
      dias: cerrados,
    });

    expect(result.getError()).toBeInstanceOf(HorarioLaboralSinDiasAbiertosError);
    expect(c.eventos).toEqual([]);
  });

  it('con una ventana con apertura posterior al cierre, falla con VentanaLaboralInvalidaError sin tocar la base', async () => {
    const c = colaboradores({ esMiembro: true, resuelto: RESUELTO_USUARIO });
    const useCase = new GuardarHorarioLaboralUsuarioUseCase(
      c.checker,
      c.repo,
      c.txRunner,
      c.resolver,
    );
    const invertido = DIAS_PROPIOS.map((dia) =>
      dia.diaSemana === 2 ? { ...dia, aperturaMinuto: 960, cierreMinuto: 480 } : dia,
    );

    const result = await useCase.execute({
      usuarioId: USUARIO,
      clienteId: CLIENTE,
      dias: invertido,
    });

    expect(result.getError()).toBeInstanceOf(VentanaLaboralInvalidaError);
    expect(c.eventos).toEqual([]);
  });

  it('para un usuario que no pertenece al tenant, falla con UsuarioHorarioNoEncontradoError sin tocar la base', async () => {
    const c = colaboradores({ esMiembro: false, resuelto: RESUELTO_USUARIO });
    const useCase = new GuardarHorarioLaboralUsuarioUseCase(
      c.checker,
      c.repo,
      c.txRunner,
      c.resolver,
    );

    const result = await useCase.execute({
      usuarioId: USUARIO,
      clienteId: CLIENTE,
      dias: DIAS_PROPIOS,
    });

    expect(result.getError()).toBeInstanceOf(UsuarioHorarioNoEncontradoError);
    expect(c.checker.existeEnTenant).toHaveBeenCalledWith(USUARIO, CLIENTE);
    expect(c.eventos).toEqual([]);
  });
});

describe('BorrarHorarioLaboralUsuarioUseCase', () => {
  it('borra el horario propio y devuelve el del cliente, que es con el que queda el usuario', async () => {
    const c = colaboradores({ esMiembro: true, resuelto: RESUELTO_CLIENTE });
    const useCase = new BorrarHorarioLaboralUsuarioUseCase(c.checker, c.repo, c.resolver);

    const result = await useCase.execute({ usuarioId: USUARIO, clienteId: CLIENTE });

    expect(result.getValue()).toEqual(RESUELTO_CLIENTE);
    expect(c.repo.borrar).toHaveBeenCalledWith(USUARIO);
    expect(c.eventos).toEqual(['borrar', 'leer']);
  });

  it('para un usuario que no pertenece al tenant, falla con UsuarioHorarioNoEncontradoError y no borra nada', async () => {
    const c = colaboradores({ esMiembro: false, resuelto: RESUELTO_CLIENTE });
    const useCase = new BorrarHorarioLaboralUsuarioUseCase(c.checker, c.repo, c.resolver);

    const result = await useCase.execute({ usuarioId: USUARIO, clienteId: CLIENTE });

    expect(result.getError()).toBeInstanceOf(UsuarioHorarioNoEncontradoError);
    expect(c.eventos).toEqual([]);
  });
});
