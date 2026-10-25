/**
 * [UNIT] `HorarioLaboralUsuarioController` (odd/tasks/tiempo-tecnico.md, T1).
 *
 * Guards: se lee la metadata real que Nest adjunta a la clase y a cada handler (mismo modismo que
 * `horario-laboral.controller.spec.ts`), así que quitar un `@UseGuards(AdminClienteGuard)` pone el
 * test en rojo.
 * Comportamiento: casos de uso reales sobre puertos mockeados; se verifica qué cliente se usa para
 * validar al usuario, la forma de la respuesta y el mapeo de errores a HTTP.
 */
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HorarioLaboralUsuarioController } from './horario-laboral-usuario.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { HorarioLaboralResuelto } from '../../domain/services/resolver-horario-laboral-usuario.service';
import { ObtenerHorarioLaboralUsuarioUseCase } from '../../application/use-cases/obtener-horario-laboral-usuario.use-case';
import { GuardarHorarioLaboralUsuarioUseCase } from '../../application/use-cases/guardar-horario-laboral-usuario.use-case';
import { BorrarHorarioLaboralUsuarioUseCase } from '../../application/use-cases/borrar-horario-laboral-usuario.use-case';
import { HorarioLaboralDto } from '../dtos/horario-laboral.dto';

type Handler = (...args: never[]) => unknown;

function guardsDe(target: unknown): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, target as Handler) as unknown[] | undefined) ?? [];
}

const USUARIO = '01900000-0000-7000-8000-000000000721';
const CLIENTE = '01900000-0000-7000-8000-000000000722';
const TECNICO = payloadDeTest({ sub: USUARIO, cliente_id: CLIENTE, rol: 'TECNICO' });

const RESUELTO: HorarioLaboralResuelto = {
  calendario: [
    { aperturaMinuto: null, cierreMinuto: null },
    { aperturaMinuto: 480, cierreMinuto: 960 },
    { aperturaMinuto: 480, cierreMinuto: 960 },
    { aperturaMinuto: 480, cierreMinuto: 960 },
    { aperturaMinuto: 480, cierreMinuto: 960 },
    { aperturaMinuto: 480, cierreMinuto: 960 },
    { aperturaMinuto: null, cierreMinuto: null },
  ],
  origen: 'USUARIO',
};

const RESPUESTA_ESPERADA = {
  usuarioId: USUARIO,
  origen: 'USUARIO',
  dias: [
    { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
    { diaSemana: 1, aperturaMinuto: 480, cierreMinuto: 960 },
    { diaSemana: 2, aperturaMinuto: 480, cierreMinuto: 960 },
    { diaSemana: 3, aperturaMinuto: 480, cierreMinuto: 960 },
    { diaSemana: 4, aperturaMinuto: 480, cierreMinuto: 960 },
    { diaSemana: 5, aperturaMinuto: 480, cierreMinuto: 960 },
    { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
  ],
};

const BODY: HorarioLaboralDto = { dias: RESPUESTA_ESPERADA.dias };

function crear(opciones: { esMiembro?: boolean; origen?: 'USUARIO' | 'CLIENTE' } = {}) {
  const checker = { existeEnTenant: vi.fn().mockResolvedValue(opciones.esMiembro ?? true) };
  const resolver = {
    obtenerParaUsuario: vi
      .fn()
      .mockResolvedValue({ ...RESUELTO, origen: opciones.origen ?? RESUELTO.origen }),
  };
  const repo = {
    reemplazar: vi.fn().mockResolvedValue(undefined),
    borrar: vi.fn().mockResolvedValue(undefined),
  };
  const txRunner: Pick<ITenantTransactionRunner, 'run'> = {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
  const controller = new HorarioLaboralUsuarioController(
    new ObtenerHorarioLaboralUsuarioUseCase(checker, resolver),
    new GuardarHorarioLaboralUsuarioUseCase(checker, repo, txRunner, resolver),
    new BorrarHorarioLaboralUsuarioUseCase(checker, repo, resolver),
  );
  return { controller, checker, repo };
}

describe('HorarioLaboralUsuarioController — guards', () => {
  it('a nivel de clase declara JwtAuthGuard y TenantGuard', () => {
    expect(guardsDe(HorarioLaboralUsuarioController)).toEqual([JwtAuthGuard, TenantGuard]);
  });

  it('GET no declara AdminClienteGuard: lo lee cualquier autenticado del tenant, como GET /horario-laboral', () => {
    expect(guardsDe(HorarioLaboralUsuarioController.prototype.obtener)).toEqual([]);
  });

  it('PUT exige ADMINISTRADOR/ROOT: declara AdminClienteGuard', () => {
    expect(guardsDe(HorarioLaboralUsuarioController.prototype.guardar)).toEqual([
      AdminClienteGuard,
    ]);
  });

  it('DELETE exige ADMINISTRADOR/ROOT: declara AdminClienteGuard', () => {
    expect(guardsDe(HorarioLaboralUsuarioController.prototype.borrar)).toEqual([AdminClienteGuard]);
  });
});

describe('HorarioLaboralUsuarioController — comportamiento', () => {
  it('GET valida al usuario contra el cliente del JWT y responde usuarioId, origen y los 7 días', async () => {
    const c = crear();

    await expect(c.controller.obtener(TECNICO, USUARIO)).resolves.toEqual(RESPUESTA_ESPERADA);
    expect(c.checker.existeEnTenant).toHaveBeenCalledWith(USUARIO, CLIENTE);
  });

  it('PUT escribe el horario del body para ese usuario y responde el horario guardado', async () => {
    const c = crear();

    await expect(c.controller.guardar(TECNICO, USUARIO, BODY)).resolves.toEqual(RESPUESTA_ESPERADA);
    expect(c.checker.existeEnTenant).toHaveBeenCalledWith(USUARIO, CLIENTE);
    expect(c.repo.reemplazar).toHaveBeenCalledTimes(1);
    expect(c.repo.reemplazar.mock.calls[0][0]).toBe(USUARIO);
  });

  it('DELETE borra el horario propio y responde el del cliente, con origen CLIENTE', async () => {
    const c = crear({ origen: 'CLIENTE' });

    await expect(c.controller.borrar(TECNICO, USUARIO)).resolves.toEqual({
      ...RESPUESTA_ESPERADA,
      origen: 'CLIENTE',
    });
    expect(c.repo.borrar).toHaveBeenCalledWith(USUARIO);
  });

  it.each(['obtener', 'borrar'] as const)(
    '%s: un usuario que no pertenece al tenant da 404 con el mensaje del dominio',
    async (metodo) => {
      const c = crear({ esMiembro: false });

      const llamada = c.controller[metodo](TECNICO, USUARIO);

      await expect(llamada).rejects.toBeInstanceOf(NotFoundException);
      await expect(llamada).rejects.toThrow(
        `El usuario ${USUARIO} no existe o no pertenece a este cliente.`,
      );
      expect(c.repo.borrar).not.toHaveBeenCalled();
    },
  );

  it('PUT: un usuario que no pertenece al tenant da 404 y no escribe', async () => {
    const c = crear({ esMiembro: false });

    await expect(c.controller.guardar(TECNICO, USUARIO, BODY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(c.repo.reemplazar).not.toHaveBeenCalled();
  });

  it('PUT: los 7 días cerrados dan 422 con el mensaje del dominio y no escriben', async () => {
    const c = crear();
    const cerrados: HorarioLaboralDto = {
      dias: BODY.dias.map((dia) => ({ ...dia, aperturaMinuto: null, cierreMinuto: null })),
    };

    const llamada = c.controller.guardar(TECNICO, USUARIO, cerrados);

    await expect(llamada).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(llamada).rejects.toThrow('al menos un día abierto');
    expect(c.repo.reemplazar).not.toHaveBeenCalled();
  });

  it('un JWT sin cliente da 403 sin consultar al usuario', async () => {
    const c = crear();
    const sinCliente = payloadDeTest({ sub: USUARIO, cliente_id: null });

    await expect(c.controller.obtener(sinCliente, USUARIO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(c.checker.existeEnTenant).not.toHaveBeenCalled();
  });
});
