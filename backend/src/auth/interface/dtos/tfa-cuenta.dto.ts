import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** `class` (no `interface`): el `ValidationPipe` global solo valida clases. */
export class IniciarSecretoTfaDto {
  /** Obligatorio cuando el usuario ya tiene 2FA activo (cambio de celular, T10). */
  @IsOptional()
  @IsString()
  codigo?: string;
}

export class CodigoTfaDto {
  @IsString()
  @IsNotEmpty()
  codigo!: string;
}
