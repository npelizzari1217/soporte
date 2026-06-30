/**
 * UsuariosController — endpoints de gestión de usuarios REST.
 *
 * Rutas:
 *   POST   /usuarios              → CrearUsuarioUseCase    [JwtAuthGuard, TenantGuard, usuario:gestionar]
 *   GET    /usuarios              → ListarUsuariosUseCase  [JwtAuthGuard, TenantGuard, usuario:gestionar]
 *   PATCH  /usuarios/:id/baja    → BajaUsuarioUseCase     [JwtAuthGuard, TenantGuard, usuario:gestionar]
 *   POST   /usuarios/:id/roles   → AsignarRolUseCase      [JwtAuthGuard, TenantGuard, rol:asignar]
 *
 * Guards a nivel de controlador: JwtAuthGuard + TenantGuard.
 * El TenantGuard resuelve el clienteId (JWT.cliente_id o X-Tenant-Id para operadores).
 * PermissionsGuard + @RequirePermissions por endpoint.
 *
 * Invariante de seguridad: clienteId SIEMPRE proviene de TenantContext,
 * NUNCA del body HTTP. Esto garantiza el aislamiento multi-tenant.
 *
 * Tarea: 2.D.4 + T3.9
 */
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
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
import { AsignarRolUseCase } from '../../application/use-cases/asignar-rol.use-case';
import { BajaUsuarioUseCase } from '../../application/use-cases/baja-usuario.use-case';
import { CrearUsuarioUseCase } from '../../application/use-cases/crear-usuario.use-case';
import { ListarUsuariosUseCase } from '../../application/use-cases/listar-usuarios.use-case';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../infrastructure/guards/permissions.guard';
import { RequirePermissions, CurrentUser } from '../../infrastructure/guards/decorators';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import {
  AsignarRolDto,
  CreateUsuarioDto,
  UsuarioResponseDto,
  ROLES_VALIDOS,
  toUsuarioResponse,
} from '../dtos/auth.dto';
import {
  UsuarioNoEncontradoError,
  RolNoEncontradoError,
  RolYaAsignadoError,
  AutoBajaProhibidaError,
  UsuarioConflictError,
} from '../../domain/errors/auth.errors';
import { JwtPayload } from '../../domain/ports/i-token.service';

@Controller('usuarios')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UsuariosController {
  constructor(
    private readonly asignarRolUseCase: AsignarRolUseCase,
    private readonly bajaUsuarioUseCase: BajaUsuarioUseCase,
    private readonly crearUsuarioUseCase: CrearUsuarioUseCase,
    private readonly listarUsuariosUseCase: ListarUsuariosUseCase,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * POST /usuarios — crea un nuevo usuario en el tenant resuelto.
   *
   * El cliente_id SIEMPRE proviene de TenantContext (resuelto por TenantGuard),
   * NUNCA del body. El password se hashea server-side y NUNCA aparece en la respuesta.
   */
  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('usuario:gestionar')
  @HttpCode(HttpStatus.CREATED)
  async crearUsuario(
    @Body() dto: CreateUsuarioDto,
    @CurrentUser() _user: JwtPayload,
  ): Promise<UsuarioResponseDto> {
    // Validar el rol ANTES de llamar al use case (early return para enum inválido)
    if (!ROLES_VALIDOS.includes(dto.rol as (typeof ROLES_VALIDOS)[number])) {
      throw new BadRequestException(
        `Rol inválido: "${dto.rol}". Valores aceptados: ${ROLES_VALIDOS.join(', ')}`,
      );
    }

    // clienteId resuelto server-side — NUNCA del body
    const clienteId = this.tenantContext.get()!.clienteId;

    const result = await this.crearUsuarioUseCase.execute({
      email: dto.email,
      nombre: dto.nombre,
      apellido: dto.apellido,
      password: dto.password,
      rolCodigo: dto.rol,
      clienteId,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof UsuarioConflictError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof RolNoEncontradoError) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException('No se pudo crear el usuario');
    }

    return toUsuarioResponse(result.getValue());
  }

  /**
   * GET /usuarios — lista usuarios del tenant resuelto.
   *
   * Excluye soft-deleted. Incluye usuarios inactivos (activo=FALSE).
   * NEVER incluye passwordHash en la respuesta.
   */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('usuario:gestionar')
  @HttpCode(HttpStatus.OK)
  async listarUsuarios(): Promise<UsuarioResponseDto[]> {
    const clienteId = this.tenantContext.get()!.clienteId;
    const usuarios = await this.listarUsuariosUseCase.execute({ clienteId });
    return usuarios.map(toUsuarioResponse);
  }

  /**
   * PATCH /usuarios/:id/baja — baja lógica idempotente de un usuario.
   *
   * Verifica cross-tenant (clienteId del TenantContext), self-baja (JWT.sub),
   * e idempotencia (ya dado de baja → 200 sin re-ejecutar operaciones).
   */
  @Patch(':id/baja')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('usuario:gestionar')
  @HttpCode(HttpStatus.OK)
  async baja(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    const clienteId = this.tenantContext.get()!.clienteId;

    const result = await this.bajaUsuarioUseCase.execute({
      usuarioId: id,
      requesterId: user.sub,
      clienteId,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof UsuarioNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof AutoBajaProhibidaError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new BadRequestException('No se pudo dar de baja al usuario');
    }
  }

  /**
   * POST /usuarios/:id/roles — asigna un rol a un usuario (legacy endpoint).
   */
  @Post(':id/roles')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('rol:asignar')
  @HttpCode(HttpStatus.CREATED)
  async asignarRol(@Param('id') id: string, @Body() dto: AsignarRolDto): Promise<void> {
    const result = await this.asignarRolUseCase.execute({
      usuarioId: id,
      rolCodigo: dto.rolCodigo,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof UsuarioNoEncontradoError || error instanceof RolNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof RolYaAsignadoError) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException('No se pudo asignar el rol');
    }
  }
}
