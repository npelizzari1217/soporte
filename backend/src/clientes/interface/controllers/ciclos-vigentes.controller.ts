import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CrearCicloVigenteUseCase } from '../../application/use-cases/crear-ciclo-vigente.use-case';
import { CreateCicloVigenteDto } from '../dtos/create-ciclo-vigente.dto';
import { CicloVigenteResponseDto } from '../dtos/ciclo-vigente-response.dto';
import { CicloVigenteOverlapError } from '../../domain/errors/clientes.errors';

/**
 * CiclosVigentesController — entry point HTTP para ciclos de gestión globales.
 *
 * Rutas:
 *   POST /ciclos-vigentes → crear nuevo ciclo vigente
 *
 * Tarea: 1.D.2
 */
@Controller('ciclos-vigentes')
export class CiclosVigentesController {
  constructor(private readonly crearCicloVigenteUseCase: CrearCicloVigenteUseCase) {}

  /**
   * POST /ciclos-vigentes
   * Crea un nuevo ciclo vigente global.
   * @returns 201 + CicloVigenteResponseDto
   * @throws 422 UnprocessableEntityException si hay solapamiento de fechas
   */
  @Post()
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
