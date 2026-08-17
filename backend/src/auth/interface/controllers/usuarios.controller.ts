/**
 * UsuariosController — entry point HTTP de la gestión mínima de usuarios del
 * tenant (sdd/beta-frontend/spec §5, desbloquea Fase 5 Beta frontend).
 *
 * Rutas (WU-7.3, sdd/matriz-permisos-por-usuario — R4/R4-excepción/R10):
 *   GET    /usuarios               → ListarUsuariosTenantUseCase   (TICKETS:ASIGNAR | TICKETS:VER_TODOS | ADMINISTRADOR-o-ROOT, regla OR — R4-excepción)
 *   POST   /usuarios               → CrearUsuarioTenantUseCase     [AdminClienteGuard]
 *   PATCH  /usuarios/:id/rol       → CambiarRolUsuarioTenantUseCase [AdminClienteGuard]
 *   PATCH  /usuarios/:id           → EditarUsuarioTenantUseCase      [AdminClienteGuard]
 *   DELETE /usuarios/:id/membresia → DesactivarMembresiaUsuarioTenantUseCase [AdminClienteGuard]
 *   GET/PATCH /usuarios/:id/modulos → ABM viejo (WU-7.4 lo reemplaza) [AdminClienteGuard]
 *
 * Guards: `JwtAuthGuard` + `TenantGuard` a nivel de controller (requieren JWT
 * válido y `cliente_id` resuelto). `AdminClienteGuard` POR MÉTODO (ADR-P5) en
 * los endpoints de gestión — reemplaza `PermissionsGuard`+`@RequirePermissions`.
 *
 * `GET /usuarios` NO usa `AdminClienteGuard` a nivel de clase porque su regla
 * es OR, no un simple admin-o-root (R4-excepción, S25): `TICKETS:ASIGNAR` O
 * `TICKETS:VER_TODOS` O ser ADMINISTRADOR/ROOT habilitan la lista básica
 * (selector de asignación / vista admin) — evaluado con `puedeEjecutarAlguna`,
 * que YA embebe el bypass de ROOT/ADMINISTRADOR (ADR-P11: `puedeEjecutar`
 * bypassea antes de mirar `permisos`). El `email` es el dato sensible (R10)
 * — se omite salvo que el actor sea ADMINISTRADOR o ROOT, INDEPENDIENTE de la
 * regla OR de acceso (`esAdminDeCliente`, no `puedeEjecutarAlguna`).
 *
 * Aislamiento estricto (spec §5): `clienteId` SIEMPRE es `actor.cliente_id`
 * (JWT, resuelto por `TenantGuard`) — NUNCA un valor de la request. Los DTOs
 * de entrada (`usuario-tenant.dto.ts`) ni siquiera declaran un campo
 * `clienteId` (el `ValidationPipe` global con `whitelist: true` lo
 * descartaría si llegara).
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case y
 * mapea `DomainError` → `HttpException`.
 *
 * Ref spec: sdd/beta-frontend/spec §3 G2/G3 (GET), §5 (POST/PATCH/DELETE).
 */
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ListarUsuariosTenantUseCase } from '../../application/use-cases/listar-usuarios-tenant.use-case';
import { CrearUsuarioTenantUseCase } from '../../application/use-cases/crear-usuario-tenant.use-case';
import { CambiarRolUsuarioTenantUseCase } from '../../application/use-cases/cambiar-rol-usuario-tenant.use-case';
import { EditarUsuarioTenantUseCase } from '../../application/use-cases/editar-usuario-tenant.use-case';
import { DesactivarMembresiaUsuarioTenantUseCase } from '../../application/use-cases/desactivar-membresia-usuario-tenant.use-case';
import { AsignarModulosUsuarioTenantUseCase } from '../../application/use-cases/asignar-modulos-usuario-tenant.use-case';
import { ObtenerModulosUsuarioTenantUseCase } from '../../application/use-cases/obtener-modulos-usuario-tenant.use-case';
import {
  AsignarModulosDto,
  CambiarRolUsuarioDto,
  CreateUsuarioTenantDto,
  EditarUsuarioDto,
  UsuarioTenantMembresiaResponseDto,
  UsuarioTenantResponseDto,
} from '../dtos/usuario-tenant.dto';
import { MembresiaConUsuario } from '../../domain/ports/i-membresia.repository';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import {
  MembresiaNoEncontradaError,
  MembresiaYaActivaError,
  ModuloInvalidoError,
} from '../../domain/errors/auth.errors';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../infrastructure/guards/admin-cliente.guard';
import { CurrentUser } from '../../infrastructure/guards/decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { puedeEjecutarAlguna, esAdminDeCliente } from '../../domain/permisos.util';
import { DomainError } from '../../../shared/domain/result';

/**
 * Acciones que habilitan la lista BÁSICA de `GET /usuarios` (OR, no AND —
 * R4-excepción, S25). `puedeEjecutarAlguna` ya bypassea ROOT/ADMINISTRADOR
 * por construcción (ADR-P11): no hace falta un chequeo admin separado acá.
 */
const ACCIONES_LISTA_BASICA = ['TICKETS:ASIGNAR', 'TICKETS:VER_TODOS'];

function toListaResponseDto(
  item: MembresiaConUsuario,
  incluirEmail: boolean,
): UsuarioTenantResponseDto {
  return {
    id: item.usuarioId,
    nombre: item.nombre,
    apellido: item.apellido,
    rol: item.rolCodigo,
    ...(incluirEmail ? { email: item.email } : {}),
  };
}

function toMembresiaResponseDto(
  usuario: UsuarioEntity,
  membresia: MembresiaEntity,
  rolCodigo: string,
): UsuarioTenantMembresiaResponseDto {
  return {
    usuarioId: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    rol: rolCodigo,
    membresiaId: membresia.id,
    activo: membresia.activo,
  };
}

/** Mapea un `DomainError` de gestión de usuarios a la `HttpException` correspondiente. */
function toHttpException(
  error: DomainError,
): NotFoundException | ConflictException | UnprocessableEntityException {
  if (error instanceof MembresiaNoEncontradaError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof MembresiaYaActivaError) {
    return new ConflictException(error.message);
  }
  if (error instanceof ModuloInvalidoError) {
    return new UnprocessableEntityException(error.message);
  }
  // RolNoEncontradoError: input inválido del actor (rolCodigo inexistente) → 422.
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly listarUsuariosTenantUseCase: ListarUsuariosTenantUseCase,
    private readonly crearUsuarioTenantUseCase: CrearUsuarioTenantUseCase,
    private readonly cambiarRolUsuarioTenantUseCase: CambiarRolUsuarioTenantUseCase,
    private readonly desactivarMembresiaUsuarioTenantUseCase: DesactivarMembresiaUsuarioTenantUseCase,
    private readonly obtenerModulosUsuarioTenantUseCase: ObtenerModulosUsuarioTenantUseCase,
    private readonly asignarModulosUsuarioTenantUseCase: AsignarModulosUsuarioTenantUseCase,
    private readonly editarUsuarioTenantUseCase: EditarUsuarioTenantUseCase,
  ) {}

  /**
   * GET /usuarios
   * Lista los usuarios con membresía ACTIVA en el cliente del token.
   * @throws 403 si el actor no tiene `TICKETS:ASIGNAR`, `TICKETS:VER_TODOS`
   *             NI es ADMINISTRADOR/ROOT (R4-excepción, S25)
   */
  @Get()
  async listar(@CurrentUser() actor: JwtPayload): Promise<UsuarioTenantResponseDto[]> {
    const tieneAccesoBasico = puedeEjecutarAlguna(actor, ACCIONES_LISTA_BASICA);
    if (!tieneAccesoBasico) {
      throw new ForbiddenException(
        `Acceso denegado: se requiere alguno de [${ACCIONES_LISTA_BASICA.join(', ')}]`,
      );
    }
    // R10: el email es INDEPENDIENTE de la regla OR de arriba. Un TECNICO con
    // TICKETS:ASIGNAR entra a la lista pero NUNCA recibe email — solo
    // ADMINISTRADOR/ROOT lo ven.
    const incluirEmail = esAdminDeCliente(actor);

    const result = await this.listarUsuariosTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
    });
    return result.getValue().map((item) => toListaResponseDto(item, incluirEmail));
  }

  /**
   * POST /usuarios
   * Crea un usuario global (si el email no existe) + su membresía en el
   * cliente del token. `clienteId` SIEMPRE es `actor.cliente_id`.
   * @throws 422 si `rolCodigo` no existe en el catálogo
   * @throws 409 si el usuario ya tiene una membresía activa en este cliente
   */
  @Post()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: CreateUsuarioTenantDto,
  ): Promise<UsuarioTenantMembresiaResponseDto> {
    const result = await this.crearUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      email: dto.email,
      nombre: dto.nombre,
      apellido: dto.apellido,
      password: dto.password,
      rolCodigo: dto.rolCodigo,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { usuario, membresia, rolCodigo } = result.getValue();
    return toMembresiaResponseDto(usuario, membresia, rolCodigo);
  }

  /**
   * PATCH /usuarios/:id/rol
   * Cambia el rol de la membresía del usuario `:id` EN EL CLIENTE DEL TOKEN.
   * @throws 404 si no existe membresía de ese usuario en este cliente
   * @throws 422 si `rolCodigo` no existe en el catálogo
   */
  @Patch(':id/rol')
  @UseGuards(AdminClienteGuard)
  async cambiarRol(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
    @Body() dto: CambiarRolUsuarioDto,
  ): Promise<{ usuarioId: string; rol: string; membresiaId: string; activo: boolean }> {
    const result = await this.cambiarRolUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
      rolCodigo: dto.rolCodigo,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const membresia = result.getValue();
    return {
      usuarioId: membresia.usuarioId,
      rol: dto.rolCodigo,
      membresiaId: membresia.id,
      activo: membresia.activo,
    };
  }

  /**
   * PATCH /usuarios/:id
   * Edita nombre y/o apellido del usuario `:id` (identidad GLOBAL: afecta al
   * usuario en TODOS sus tenants). El `email` NO es editable. Solo se permite
   * si el usuario tiene membresía ACTIVA en el cliente del token (aislamiento).
   * Permiso `usuario:gestionar` (ADMINISTRADOR lo tiene; ROOT bypassa el guard).
   * @throws 404 si no existe membresía activa de ese usuario en este cliente
   */
  @Patch(':id')
  @UseGuards(AdminClienteGuard)
  async editar(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
    @Body() dto: EditarUsuarioDto,
  ): Promise<{ usuarioId: string; nombre: string; apellido: string }> {
    const result = await this.editarUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
      nombre: dto.nombre,
      apellido: dto.apellido,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const usuario = result.getValue();
    return { usuarioId: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido };
  }

  /**
   * DELETE /usuarios/:id/membresia
   * Desactiva la membresía del usuario `:id` EN EL CLIENTE DEL TOKEN (no
   * borra el usuario global).
   * @throws 404 si no existe membresía de ese usuario en este cliente
   */
  @Delete(':id/membresia')
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async desactivarMembresia(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
  ): Promise<void> {
    const result = await this.desactivarMembresiaUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * GET /usuarios/:id/modulos
   * Módulos funcionales actualmente asignados al usuario `:id` EN EL CLIENTE
   * DEL TOKEN (feature 5.2 CAPA 4). Prellena el control de asignación del
   * front. Un usuario sin módulos asignados devuelve `{ modulos: [] }`.
   */
  @Get(':id/modulos')
  @UseGuards(AdminClienteGuard)
  async obtenerModulos(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
  ): Promise<{ modulos: string[] }> {
    const result = await this.obtenerModulosUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
    });
    return { modulos: result.getValue() };
  }

  /**
   * PATCH /usuarios/:id/modulos
   * Reemplaza el set completo de módulos del usuario `:id` EN EL CLIENTE DEL
   * TOKEN (feature 5.2 CAPA 4). `clienteId` SIEMPRE es `actor.cliente_id`.
   * @throws 404 si no existe membresía activa de ese usuario en este cliente
   * @throws 422 si algún módulo no pertenece al catálogo `MODULOS`
   */
  @Patch(':id/modulos')
  @UseGuards(AdminClienteGuard)
  async asignarModulos(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
    @Body() dto: AsignarModulosDto,
  ): Promise<{ usuarioId: string; modulos: string[] }> {
    const result = await this.asignarModulosUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
      modulos: dto.modulos,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return { usuarioId, modulos: result.getValue() };
  }
}
