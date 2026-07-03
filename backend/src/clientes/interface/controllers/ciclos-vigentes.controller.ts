import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CrearCicloVigenteUseCase } from '../../application/use-cases/crear-ciclo-vigente.use-case';
import { CreateCicloVigenteDto } from '../dtos/create-ciclo-vigente.dto';
import { CicloVigenteResponseDto } from '../dtos/ciclo-vigente-response.dto';
import { CicloVigenteOverlapError } from '../../domain/errors/clientes.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';

/**
 * CiclosVigentesController — entry point HTTP para el CATÁLOGO GLOBAL de ciclos.
 *
 * Rutas:
 *   POST /ciclos-vigentes → crear nuevo ciclo del catálogo global
 *
 * Seguridad:
 * - @UseGuards(JwtAuthGuard) a nivel de controlador — todos los endpoints requieren JWT válido.
 * - @UseGuards(GlobalAdminGuard) en POST — el catálogo global SOLO lo gestiona el operador
 *   global (is_global_admin). Sin este guard, cualquier usuario autenticado de cualquier tenant
 *   podía escribir el catálogo compartido (agujero de seguridad).
 *
 * Tarea: 1.D.2 / T1.6
 */
@UseGuards(JwtAuthGuard)
@Controller('ciclos-vigentes')
export class CiclosVigentesController {
  constructor(private readonly crearCicloVigenteUseCase: CrearCicloVigenteUseCase) {}

  /**
   * POST /ciclos-vigentes
   * Crea un nuevo ciclo en el catálogo global. Solo operador global.
   * @returns 201 + CicloVigenteResponseDto
   * @throws 422 UnprocessableEntityException si hay solapamiento de fechas
   */
  @Post()
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCicloVigenteDto): Promise<CicloVigenteResponseDto> {
    const result = await this.crearCicloVigenteUseCase.execute({
      nombre: dto.nombre,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin: new Date(dto.fechaFin),
      activo: dto.activo ?? true,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof CicloVigenteOverlapError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('Error al crear el ciclo vigente.');
    }

    return CicloVigenteResponseDto.fromEntity(result.getValue());
  }
}
