/**
 * UsuariosController — endpoints de gestión de usuarios REST.
 *
 * Rutas:
 *   POST   /usuarios/:id/roles  → AsignarRolUseCase   [ADMIN, rol:asignar]
 *   DELETE /usuarios/:id        → BajaUsuarioUseCase  [ADMIN, usuario:gestionar]
 *
 * Tarea: 2.D.4
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AsignarRolUseCase } from '../../application/use-cases/asignar-rol.use-case';
import { BajaUsuarioUseCase } from '../../application/use-cases/baja-usuario.use-case';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../infrastructure/guards/permissions.guard';
import { Roles, RequirePermissions } from '../../infrastructure/guards/decorators';
import { AsignarRolDto } from '../dtos/auth.dto';
import {
  UsuarioNoEncontradoError,
  RolNoEncontradoError,
  RolYaAsignadoError,
} from '../../domain/errors/auth.errors';

@Controller('usuarios')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsuariosController {
  constructor(
    private readonly asignarRolUseCase: AsignarRolUseCase,
    private readonly bajaUsuarioUseCase: BajaUsuarioUseCase,
  ) {}

  @Post(':id/roles')
  @Roles('ADMIN')
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

  @Delete(':id')
  @Roles('ADMIN')
  @RequirePermissions('usuario:gestionar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async baja(@Param('id') id: string): Promise<void> {
    const result = await this.bajaUsuarioUseCase.execute({ usuarioId: id });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof UsuarioNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException('No se pudo dar de baja al usuario');
    }
  }
}
