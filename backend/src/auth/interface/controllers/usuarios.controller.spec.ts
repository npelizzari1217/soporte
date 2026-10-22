/**
 * usuarios.controller.spec.ts — TDD RED→GREEN (gestión mínima de usuarios,
 * sdd/beta-frontend/spec §5). Unit test: instancia el controller
 * directamente con los use cases mockeados (mismo patrón que
 * `clientes.controller.spec.ts`) — NO cubre guards reales (JwtAuthGuard/
 * TenantGuard/PermissionsGuard, ya testeados aparte).
 */
import { ResetearTfaUsuarioUseCase } from '../../application/tfa/resetear-tfa-usuario.use-case';
import { ResetearVinculoSsoUseCase } from '../../application/sso/resetear-vinculo-sso.use-case';
import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { UsuariosController } from './usuarios.controller';
import { AdminClienteGuard } from '../../infrastructure/guards/admin-cliente.guard';
import { Result } from '../../../shared/domain/result';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import {
  MembresiaNoEncontradaError,
  MembresiaYaActivaError,
  PermisosPorTipoNoAplicadosError,
  PresetRolNoDefinidoError,
  RolNoEncontradoError,
  UsuarioNoDisponibleError,
} from '../../domain/errors/auth.errors';
import { JwtPayload } from '../../domain/ports/i-token.service';
import type { MembresiaConUsuario } from '../../domain/ports/i-membresia.repository';
import { payloadDeTest } from '../../test-helpers/payload-de-test';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { Mock } from 'vitest';
import { ListarUsuariosTenantUseCase } from '../../application/use-cases/listar-usuarios-tenant.use-case';
import { CrearUsuarioTenantUseCase } from '../../application/use-cases/crear-usuario-tenant.use-case';
import { CambiarRolUsuarioTenantUseCase } from '../../application/use-cases/cambiar-rol-usuario-tenant.use-case';
import { DesactivarMembresiaUsuarioTenantUseCase } from '../../application/use-cases/desactivar-membresia-usuario-tenant.use-case';
import { EditarUsuarioTenantUseCase } from '../../application/use-cases/editar-usuario-tenant.use-case';
import { ResetearPasswordUsuarioTenantUseCase } from '../../application/use-cases/resetear-password-usuario-tenant.use-case';
import { ObtenerPermisosUsuarioTenantUseCase } from '../../application/use-cases/obtener-permisos-usuario-tenant.use-case';
import { AsignarPermisosUsuarioTenantUseCase } from '../../application/use-cases/asignar-permisos-usuario-tenant.use-case';
import { AplicarPresetPermisosUseCase } from '../../application/use-cases/aplicar-preset-permisos.use-case';
import { PermisosPorTipoUsuarioTenantUseCase } from '../../application/use-cases/permisos-por-tipo-usuario-tenant.use-case';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';
import { PermisosTipoTicketEnMemoria } from '../../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';

/**
 * Permisos por tipo de la tabla del tenant (odd/permisos-por-tipo-ticket, T6): deciden el acceso a
 * `GET /usuarios`. `asignador` asigna en un tipo, `supervisor` ve todos en otro, `lector` solo lee.
 */
const PERMISOS_POR_TIPO = [
  { usuarioId: 'asignador', tipoId: 'tipo-soporte', accion: 'LECTURA' },
  { usuarioId: 'asignador', tipoId: 'tipo-soporte', accion: 'ASIGNAR' },
  { usuarioId: 'supervisor', tipoId: 'tipo-mantenimiento', accion: 'LECTURA' },
  { usuarioId: 'supervisor', tipoId: 'tipo-mantenimiento', accion: 'VER_TODOS' },
  { usuarioId: 'lector', tipoId: 'tipo-soporte', accion: 'LECTURA' },
  { usuarioId: 'lector', tipoId: 'tipo-mantenimiento', accion: 'ALTAS' },
] as const;

/**
 * Caso de uso doble: hereda el prototipo de la clase real (así encaja en el constructor del
 * controller) y reemplaza `execute` por un mock tipado con su firma.
 */
function casoDeUsoDoble<T extends { execute: (...args: never[]) => unknown }>(Clase: {
  prototype: T;
}): T & { execute: Mock<T['execute']> } {
  return Object.create(Clase.prototype, { execute: { value: vi.fn<T['execute']>() } });
}

function buildController() {
  const listarUsuariosTenantUseCase = casoDeUsoDoble(ListarUsuariosTenantUseCase);
  const crearUsuarioTenantUseCase = casoDeUsoDoble(CrearUsuarioTenantUseCase);
  const cambiarRolUsuarioTenantUseCase = casoDeUsoDoble(CambiarRolUsuarioTenantUseCase);
  const desactivarMembresiaUsuarioTenantUseCase = casoDeUsoDoble(
    DesactivarMembresiaUsuarioTenantUseCase,
  );
  const editarUsuarioTenantUseCase = casoDeUsoDoble(EditarUsuarioTenantUseCase);
  const resetearPasswordUsuarioTenantUseCase = casoDeUsoDoble(ResetearPasswordUsuarioTenantUseCase);
  const obtenerPermisosUsuarioTenantUseCase = casoDeUsoDoble(ObtenerPermisosUsuarioTenantUseCase);
  const asignarPermisosUsuarioTenantUseCase = casoDeUsoDoble(AsignarPermisosUsuarioTenantUseCase);
  const aplicarPresetPermisosUseCase = casoDeUsoDoble(AplicarPresetPermisosUseCase);
  // Grilla por tipo (T7): caso de uso real sobre el doble en memoria, con los usuarios de
  // `PERMISOS_POR_TIPO` como TECNICO del cliente del token y `jefa` como ADMINISTRADOR.
  const permisosTipo = new PermisosTipoTicketEnMemoria(
    [
      { id: 'tipo-soporte', modulo: 'TICKETS', nombre: 'Soporte' },
      { id: 'tipo-mantenimiento', modulo: 'EDILICIA', nombre: 'Mantenimiento' },
    ],
    PERMISOS_POR_TIPO,
  );
  const rolesDelCliente: Record<string, string> = {
    asignador: 'TECNICO',
    supervisor: 'TECNICO',
    lector: 'TECNICO',
    jefa: 'ADMINISTRADOR',
  };
  const permisosPorTipoUseCase = new PermisosPorTipoUsuarioTenantUseCase(
    {
      findActivaByUsuarioYCliente: async (usuarioId, clienteId) => {
        const rolCodigo = rolesDelCliente[usuarioId];
        if (clienteId !== 'cliente-token' || rolCodigo === undefined) return null;
        return { clienteId, clienteNombre: 'Cliente', rolCodigo, clienteRequiere2fa: false };
      },
    },
    { findById: async () => null },
    permisosTipo,
  );
  // Caso de uso real armado con puertos tipados: tipado completo, sin casts.
  const resetearTfaUsuarioUseCase = new ResetearTfaUsuarioUseCase(
    { eliminarTodo: vi.fn() },
    { findById: vi.fn() },
    { findActivaByUsuarioYCliente: vi.fn(), findClientesDeTodasByUsuario: vi.fn() },
    { revokeAllByUsuarioId: vi.fn() },
    { log: vi.fn(), error: vi.fn() },
  );
  const resetearVinculoSsoUseCase = new ResetearVinculoSsoUseCase(
    { eliminarTodasDeUsuario: vi.fn() },
    { findById: vi.fn() },
    { findActivaByUsuarioYCliente: vi.fn(), findClientesDeTodasByUsuario: vi.fn() },
    { revokeAllByUsuarioId: vi.fn() },
    { log: vi.fn(), error: vi.fn() },
  );
  const controller = new UsuariosController(
    listarUsuariosTenantUseCase,
    crearUsuarioTenantUseCase,
    cambiarRolUsuarioTenantUseCase,
    desactivarMembresiaUsuarioTenantUseCase,
    editarUsuarioTenantUseCase,
    resetearPasswordUsuarioTenantUseCase,
    obtenerPermisosUsuarioTenantUseCase,
    asignarPermisosUsuarioTenantUseCase,
    aplicarPresetPermisosUseCase,
    permisosPorTipoUseCase,
    resetearTfaUsuarioUseCase,
    resetearVinculoSsoUseCase,
    new CargadorAlcanceTicket(permisosTipo),
  );
  return {
    controller,
    listarUsuariosTenantUseCase,
    crearUsuarioTenantUseCase,
    cambiarRolUsuarioTenantUseCase,
    desactivarMembresiaUsuarioTenantUseCase,
    editarUsuarioTenantUseCase,
    resetearPasswordUsuarioTenantUseCase,
    obtenerPermisosUsuarioTenantUseCase,
    asignarPermisosUsuarioTenantUseCase,
    aplicarPresetPermisosUseCase,
    permisosTipo,
  };
}

function buildActor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return payloadDeTest({
    sub: 'actor-id',
    cliente_id: 'cliente-token',
    rol: 'TECNICO',
    permisos: [],
    cliente_nombre: 'Cliente Token',
    ...overrides,
  });
}

const MEMBRESIA_ITEM: MembresiaConUsuario = {
  membresiaId: 'm1',
  usuarioId: 'u1',
  nombre: 'Ada',
  apellido: 'Tec',
  email: 'ada@test.com',
  rolCodigo: 'TECNICO',
  esIntegracion: false,
};

describe('UsuariosController (gestión mínima de usuarios, sdd/beta-frontend §5)', () => {
  describe('GET /usuarios', () => {
    it('con ASIGNAR sobre algún tipo (sin celdas TICKETS:*) retorna la lista SIN email (R10, T6)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ sub: 'asignador', permisos: [] });

      const result = await controller.listar(actor);

      expect(listarUsuariosTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
      });
      expect(result).toEqual([{ id: 'u1', nombre: 'Ada', apellido: 'Tec', rol: 'TECNICO' }]);
      expect(result[0]).not.toHaveProperty('email');
    });

    it('con VER_TODOS sobre algún tipo retorna la lista SIN email (filtro "Asignado" del listado, T6)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ sub: 'supervisor', permisos: [] });

      const result = await controller.listar(actor);

      expect(result).toEqual([{ id: 'u1', nombre: 'Ada', apellido: 'Tec', rol: 'TECNICO' }]);
    });

    it('las celdas TICKETS:ASIGNAR/VER_TODOS del JWT ya no abren la lista sin filas por tipo → 403 (T6)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      const actor = buildActor({
        sub: 'sin-filas',
        permisos: ['TICKETS:ASIGNAR', 'TICKETS:VER_TODOS'],
      });

      await expect(controller.listar(actor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(listarUsuariosTenantUseCase.execute).not.toHaveBeenCalled();
    });

    it('ADMINISTRADOR retorna la lista CON email (R10 — independiente de la regla OR de acceso)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ rol: 'ADMINISTRADOR', permisos: [] });

      const result = await controller.listar(actor);

      expect(result).toEqual([
        { id: 'u1', nombre: 'Ada', apellido: 'Tec', rol: 'TECNICO', email: 'ada@test.com' },
      ]);
    });

    it('TECNICO con ASIGNAR sobre un tipo (no ADMINISTRADOR, no ROOT) NUNCA recibe email aunque entre a la lista (R10)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ sub: 'asignador', rol: 'TECNICO', permisos: [] });

      const result = await controller.listar(actor);

      expect('email' in result[0]).toBe(false);
    });

    it('sin ASIGNAR ni VER_TODOS en ningún tipo, ni ser admin → 403 ForbiddenException (R4-excepción, S25)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      // Lee y crea en dos tipos: ninguna de esas acciones abre la lista.
      const actor = buildActor({ sub: 'lector', permisos: ['TICKETS:ALTAS'] });

      await expect(controller.listar(actor)).rejects.toThrow(
        'Acceso denegado: se requiere ASIGNAR o VER_TODOS sobre algún tipo de ticket',
      );
      expect(listarUsuariosTenantUseCase.execute).not.toHaveBeenCalled();
    });

    // Regresión (sdd/root-access-fix): un ROOT scopeado a un tenant tiene
    // permisos=[]. El chequeo inline de acceso/email NO pasa por
    // PermissionsGuard (regla OR), así que debe honrar is_global_admin igual
    // que el guard — antes le daba 403 (podía CREAR usuarios pero no verlos).
    it('ROOT (is_global_admin, permisos=[]) lista CON email sin recibir 403', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ permisos: [], is_global_admin: true });

      const result = await controller.listar(actor);

      expect(listarUsuariosTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
      });
      expect(result).toEqual([
        { id: 'u1', nombre: 'Ada', apellido: 'Tec', rol: 'TECNICO', email: 'ada@test.com' },
      ]);
    });
  });

  describe('POST /usuarios', () => {
    const DTO = {
      email: 'nuevo@test.com',
      nombre: 'Nueva',
      apellido: 'Persona',
      password: 'Secreto123!',
      rolCodigo: 'TECNICO',
    };

    it('crea el usuario y retorna 201 con el DTO de respuesta, clienteId SIEMPRE del actor', async () => {
      const { controller, crearUsuarioTenantUseCase } = buildController();
      const usuario = UsuarioEntity.create({
        email: DTO.email,
        nombre: DTO.nombre,
        apellido: DTO.apellido,
        passwordHash: 'hash',
        activo: true,
      });
      const membresia = MembresiaEntity.create({
        usuarioId: usuario.id,
        clienteId: 'cliente-token',
        rolId: 'rol-1',
        activo: true,
      });
      crearUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.ok({ usuario, membresia, rolCodigo: 'TECNICO' }),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      const result = await controller.crear(actor, DTO);

      expect(crearUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        ...DTO,
      });
      expect(result).toEqual({
        usuarioId: usuario.id,
        email: DTO.email,
        nombre: DTO.nombre,
        apellido: DTO.apellido,
        rol: 'TECNICO',
        membresiaId: membresia.id,
        activo: true,
      });
    });

    it('propaga 422 UnprocessableEntityException cuando el rol no existe', async () => {
      const { controller, crearUsuarioTenantUseCase } = buildController();
      crearUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new RolNoEncontradoError('INEXISTENTE')),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(controller.crear(actor, DTO)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('propaga 409 ConflictException cuando el usuario ya tiene membresía activa', async () => {
      const { controller, crearUsuarioTenantUseCase } = buildController();
      crearUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaYaActivaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(controller.crear(actor, DTO)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('PATCH /usuarios/:id/rol', () => {
    it('cambia el rol y retorna 200, clienteId SIEMPRE del actor', async () => {
      const { controller, cambiarRolUsuarioTenantUseCase } = buildController();
      const membresia = MembresiaEntity.reconstitute(
        { usuarioId: 'usuario-1', clienteId: 'cliente-token', rolId: 'rol-2', activo: true },
        'membresia-1',
        new Date(),
        new Date(),
        null,
      );
      cambiarRolUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(membresia));
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await controller.cambiarRol(actor, 'usuario-1', { rolCodigo: 'ADMINISTRADOR' });

      expect(cambiarRolUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'ADMINISTRADOR',
        reaplicarPreset: undefined,
      });
    });

    it('R6 — reenvía reaplicarPreset: true al use case', async () => {
      const { controller, cambiarRolUsuarioTenantUseCase } = buildController();
      const membresia = MembresiaEntity.reconstitute(
        { usuarioId: 'usuario-1', clienteId: 'cliente-token', rolId: 'rol-2', activo: true },
        'membresia-1',
        new Date(),
        new Date(),
        null,
      );
      cambiarRolUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(membresia));
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await controller.cambiarRol(actor, 'usuario-1', {
        rolCodigo: 'TECNICO',
        reaplicarPreset: true,
      });

      expect(cambiarRolUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        reaplicarPreset: true,
      });
    });

    it('propaga 404 NotFoundException cuando la membresía no existe en este cliente', async () => {
      const { controller, cambiarRolUsuarioTenantUseCase } = buildController();
      cambiarRolUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(
        controller.cambiarRol(actor, 'usuario-ajeno', { rolCodigo: 'TECNICO' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PATCH /usuarios/:id', () => {
    it('edita nombre/apellido y retorna { usuarioId, nombre, apellido }, clienteId SIEMPRE del actor', async () => {
      const { controller, editarUsuarioTenantUseCase } = buildController();
      const usuario = UsuarioEntity.reconstitute(
        {
          email: 'ada@test.com',
          nombre: 'Ada',
          apellido: 'Lovelace',
          passwordHash: 'hash',
          activo: true,
        },
        'usuario-1',
        new Date(),
        new Date(),
        null,
      );
      editarUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(usuario));
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      const result = await controller.editar(actor, 'usuario-1', {
        nombre: 'Ada',
        apellido: 'Lovelace',
      });

      expect(editarUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        nombre: 'Ada',
        apellido: 'Lovelace',
      });
      expect(result).toEqual({ usuarioId: 'usuario-1', nombre: 'Ada', apellido: 'Lovelace' });
    });

    it('propaga 404 NotFoundException cuando no hay membresía activa en este cliente', async () => {
      const { controller, editarUsuarioTenantUseCase } = buildController();
      editarUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      await expect(
        controller.editar(actor, 'usuario-ajeno', { nombre: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // sdd/reset-de-contrasena-por-admin (WU-2)
  describe('PATCH /usuarios/:id/password', () => {
    it('[R3] @UseGuards(AdminClienteGuard) está en ESTA ruta — no heredado de una hermana', () => {
      // Regresión dirigida (design.md: "AdminClienteGuard va POR MÉTODO,
      // nunca contiguo" — los 4 métodos existentes lo llevan en :197/:231/
      // :265/:292, sin ser consecutivos). Inspecciona la metadata que
      // `@UseGuards` deja en ESTE método puntual: si alguien lo borra, o lo
      // sube a nivel de clase, este assert lo detecta sin necesidad de un
      // harness e2e (Fuera de alcance de este ciclo, tasks.md).
      // El `?? []` es LOAD-BEARING y sigue el modismo ya usado en
      // `modelos-equipo.controller.spec.ts:162`. Sin el decorador,
      // `getMetadata` devuelve `undefined`, y `expect(undefined).toContain(x)`
      // PASA en este Vitest en vez de fallar. Medido: sin el coalesce, borrar
      // `@UseGuards(AdminClienteGuard)` de la ruta dejaba este test en verde.
      const guardsEnElMetodo = (Reflect.getMetadata(
        GUARDS_METADATA,
        UsuariosController.prototype.resetearPassword,
      ) ?? []) as unknown[];

      expect(guardsEnElMetodo).toContain(AdminClienteGuard);
    });

    it('[R3] TECNICO sin esAdminDeCliente: el guard real rechaza con 403', () => {
      const guard = new AdminClienteGuard();
      const context = new ExecutionContextHost([
        { user: buildActor({ rol: 'TECNICO', permisos: [] }) },
      ]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('[R3] SOLICITANTE sin esAdminDeCliente: el guard real rechaza con 403', () => {
      const guard = new AdminClienteGuard();
      const context = new ExecutionContextHost([
        { user: buildActor({ rol: 'SOLICITANTE', permisos: [] }) },
      ]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('[R2] el clienteId que recibe el caso de uso sale SIEMPRE del JWT del actor, aunque el body traiga otro', async () => {
      const { controller, resetearPasswordUsuarioTenantUseCase } = buildController();
      resetearPasswordUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(undefined));
      const actor = buildActor({ rol: 'ADMINISTRADOR', cliente_id: 'cliente-token' });
      // El DTO no declara `clienteId` — el `whitelist: true` global lo
      // descartaría si llegara. El literal va en una variable (sin chequeo de
      // propiedades de más) para simular igual un valor colado y dejar
      // constancia de que el controller lo ignora por completo.
      const dtoConClienteIdColado = {
        password: 'contraseñaNueva123',
        clienteId: 'cliente-colado',
      };

      await controller.resetearPassword(actor, 'usuario-1', dtoConClienteIdColado);

      expect(resetearPasswordUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        password: 'contraseñaNueva123',
      });
    });

    it('[R2,R9] propaga 404 NotFoundException cuando no hay membresía activa en este cliente', async () => {
      const { controller, resetearPasswordUsuarioTenantUseCase } = buildController();
      resetearPasswordUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ rol: 'ADMINISTRADOR' });

      await expect(
        controller.resetearPassword(actor, 'usuario-ajeno', { password: 'x'.repeat(8) }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('[R9] propaga 422 UnprocessableEntityException cuando la cuenta global no está disponible', async () => {
      const { controller, resetearPasswordUsuarioTenantUseCase } = buildController();
      resetearPasswordUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new UsuarioNoDisponibleError()),
      );
      const actor = buildActor({ rol: 'ADMINISTRADOR' });

      await expect(
        controller.resetearPassword(actor, 'usuario-1', { password: 'x'.repeat(8) }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('[R10] la ruta declara 204 explícitamente, no el 200 por defecto de Nest', () => {
      // W2 del verify de este ciclo: sin esta aserción, borrar
      // `@HttpCode(HttpStatus.NO_CONTENT)` dejaba los 29 tests en verde y Nest
      // respondía 200 con cuerpo vacío. ADR-1 llama al 204 "garantía
      // estructural", y `apiFetch<void>` del frontend y el handler MSW del
      // test de desenlace 1 dependen de él. `toBe` falla contra `undefined`,
      // así que la aserción sí puede morir.
      const codigo = Reflect.getMetadata(
        HTTP_CODE_METADATA,
        UsuariosController.prototype.resetearPassword,
      ) as unknown;

      expect(codigo).toBe(HttpStatus.NO_CONTENT);
    });

    it('[R10] la respuesta 204 no lleva cuerpo: el método no retorna nada', async () => {
      const { controller, resetearPasswordUsuarioTenantUseCase } = buildController();
      resetearPasswordUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(undefined));
      const actor = buildActor({ rol: 'ADMINISTRADOR' });

      const result = await controller.resetearPassword(actor, 'usuario-1', {
        password: 'x'.repeat(8),
      });

      expect(result).toBeUndefined();
    });
  });

  describe('DELETE /usuarios/:id/membresia', () => {
    it('desactiva la membresía y retorna 204 (void), clienteId SIEMPRE del actor', async () => {
      const { controller, desactivarMembresiaUsuarioTenantUseCase } = buildController();
      const membresia = MembresiaEntity.reconstitute(
        { usuarioId: 'usuario-1', clienteId: 'cliente-token', rolId: 'rol-1', activo: false },
        'membresia-1',
        new Date(),
        new Date(),
        null,
      );
      desactivarMembresiaUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(membresia));
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await controller.desactivarMembresia(actor, 'usuario-1');

      expect(desactivarMembresiaUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
      });
    });

    it('propaga 404 NotFoundException cuando la membresía no existe en este cliente', async () => {
      const { controller, desactivarMembresiaUsuarioTenantUseCase } = buildController();
      desactivarMembresiaUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(controller.desactivarMembresia(actor, 'usuario-ajeno')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── ABM de la matriz de permisos (WU-7.4, sdd/matriz-permisos-por-usuario) ─

  describe('GET /usuarios/:id/permisos', () => {
    it('retorna celdas + esAdministrador + catalogo', async () => {
      const { controller, obtenerPermisosUsuarioTenantUseCase } = buildController();
      obtenerPermisosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.ok({ celdas: ['TICKETS:LECTURA'], esAdministrador: false }),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      const result = await controller.obtenerPermisos(actor, 'usuario-1');

      expect(obtenerPermisosUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
      });
      expect(result.celdas).toEqual(['TICKETS:LECTURA']);
      expect(result.esAdministrador).toBe(false);
      expect(result.catalogo).toBeDefined();
      expect(result.catalogo.DASHBOARD).toBeDefined();
    });

    it('propaga 404 NotFoundException cuando no hay membresía activa en este cliente', async () => {
      const { controller, obtenerPermisosUsuarioTenantUseCase } = buildController();
      obtenerPermisosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      await expect(controller.obtenerPermisos(actor, 'usuario-ajeno')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('PATCH /usuarios/:id/permisos', () => {
    it('reemplaza las celdas y retorna { usuarioId, celdas }, clienteId SIEMPRE del actor', async () => {
      const { controller, asignarPermisosUsuarioTenantUseCase } = buildController();
      asignarPermisosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.ok(['TICKETS:LECTURA', 'TICKETS:ALTAS']),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      const result = await controller.asignarPermisos(actor, 'usuario-1', {
        celdas: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
      });

      expect(asignarPermisosUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        celdas: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
      });
      expect(result).toEqual({
        usuarioId: 'usuario-1',
        celdas: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
      });
    });

    it('propaga 404 NotFoundException cuando la membresía no existe en este cliente', async () => {
      const { controller, asignarPermisosUsuarioTenantUseCase } = buildController();
      asignarPermisosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(
        controller.asignarPermisos(actor, 'usuario-ajeno', { celdas: ['TICKETS:LECTURA'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('POST /usuarios/:id/permisos/aplicar-preset', () => {
    it('aplica el preset y retorna { usuarioId, rolCodigo }', async () => {
      const { controller, aplicarPresetPermisosUseCase } = buildController();
      aplicarPresetPermisosUseCase.execute.mockResolvedValue(Result.ok(undefined));
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      const result = await controller.aplicarPresetPermisos(actor, 'usuario-1', {
        rolCodigo: 'TECNICO',
      });

      expect(aplicarPresetPermisosUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        sobrescribir: true,
      });
      expect(result).toEqual({ usuarioId: 'usuario-1', rolCodigo: 'TECNICO' });
    });

    it('propaga 422 UnprocessableEntityException cuando el rol no tiene preset definido', async () => {
      const { controller, aplicarPresetPermisosUseCase } = buildController();
      aplicarPresetPermisosUseCase.execute.mockResolvedValue(
        Result.fail(new PresetRolNoDefinidoError('ROL_SIN_PRESET')),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(
        controller.aplicarPresetPermisos(actor, 'usuario-1', {
          rolCodigo: 'ROL_SIN_PRESET',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('T4c: si fallan los permisos por tipo, 500 con el mensaje que dice cómo completarlos', async () => {
      const { controller, aplicarPresetPermisosUseCase } = buildController();
      const error = new PermisosPorTipoNoAplicadosError(new Error('base caída'));
      aplicarPresetPermisosUseCase.execute.mockResolvedValue(Result.fail(error));
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      const rechazo = controller.aplicarPresetPermisos(actor, 'usuario-1', {
        rolCodigo: 'TECNICO',
      });

      await expect(rechazo).rejects.toBeInstanceOf(InternalServerErrorException);
      await expect(rechazo).rejects.toThrow(error.message);
    });
  });

  describe('permisos por tipo de ticket (odd/permisos-por-tipo-ticket, T7, S5)', () => {
    const actor = buildActor({ rol: 'ADMINISTRADOR' });

    it.each([
      'obtenerPermisosPorTipo',
      'reemplazarPermisosPorTipo',
      'copiarPermisosPorTipo',
    ] as const)('%s exige AdminClienteGuard en la ruta', (metodo) => {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, UsuariosController.prototype[metodo]) ??
        []) as unknown[];
      expect(guards).toContain(AdminClienteGuard);
    });

    it('copiar responde 200, no el 201 por defecto de POST', () => {
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, UsuariosController.prototype.copiarPermisosPorTipo),
      ).toBe(HttpStatus.OK);
    });

    it('GET devuelve una fila por tipo con las acciones del usuario y la plantilla del rol', async () => {
      const { controller } = buildController();

      const result = await controller.obtenerPermisosPorTipo(actor, 'asignador');

      expect(result.sinRestriccion).toBe(false);
      expect(result.tipos.map((t) => [t.nombre, t.acciones])).toEqual([
        ['Mantenimiento', []],
        ['Soporte', ['LECTURA', 'ASIGNAR']],
      ]);
    });

    it('GET de un ADMINISTRADOR: sin restricción y sin filas', async () => {
      const { controller } = buildController();

      await expect(controller.obtenerPermisosPorTipo(actor, 'jefa')).resolves.toMatchObject({
        sinRestriccion: true,
        tipos: [],
      });
    });

    it('GET de un usuario de otro cliente: 404', async () => {
      const { controller } = buildController();

      await expect(controller.obtenerPermisosPorTipo(actor, 'ajeno')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('PUT reemplaza las filas y devuelve el estado guardado', async () => {
      const { controller, permisosTipo } = buildController();

      const result = await controller.reemplazarPermisosPorTipo(actor, 'lector', {
        tipos: [{ tipoId: 'tipo-mantenimiento', acciones: ['LECTURA', 'MODIFICACION'] }],
      });

      expect(permisosTipo.filasDe('lector')).toEqual([
        'tipo-mantenimiento:LECTURA',
        'tipo-mantenimiento:MODIFICACION',
      ]);
      expect(result.tipos.find((t) => t.tipoId === 'tipo-mantenimiento')?.acciones).toEqual([
        'LECTURA',
        'MODIFICACION',
      ]);
    });

    it('PUT con una acción sin Ver: 422 con el mensaje del dominio y sin cambios', async () => {
      const { controller, permisosTipo } = buildController();

      const rechazo = controller.reemplazarPermisosPorTipo(actor, 'lector', {
        tipos: [{ tipoId: 'tipo-soporte', acciones: ['VER_TODOS'] }],
      });

      await expect(rechazo).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(rechazo).rejects.toThrow(
        'Sin Ver no se puede conceder ninguna otra acción en el tipo «Soporte» (se pidió VER_TODOS).',
      );
      expect(permisosTipo.filasDe('lector')).toEqual([
        'tipo-mantenimiento:ALTAS',
        'tipo-soporte:LECTURA',
      ]);
    });

    it('PUT sobre un ADMINISTRADOR: 422', async () => {
      const { controller } = buildController();

      await expect(
        controller.reemplazarPermisosPorTipo(actor, 'jefa', { tipos: [] }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('copiar reemplaza las filas del destino por las del origen', async () => {
      const { controller, permisosTipo } = buildController();

      await controller.copiarPermisosPorTipo(actor, 'lector', 'supervisor');

      expect(permisosTipo.filasDe('lector')).toEqual([
        'tipo-mantenimiento:LECTURA',
        'tipo-mantenimiento:VER_TODOS',
      ]);
    });

    it('copiar desde un usuario de otro cliente: 404 sin cambios', async () => {
      const { controller, permisosTipo } = buildController();

      await expect(
        controller.copiarPermisosPorTipo(actor, 'lector', 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(permisosTipo.filasDe('lector')).toEqual([
        'tipo-mantenimiento:ALTAS',
        'tipo-soporte:LECTURA',
      ]);
    });
  });
});
