import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/** `class` (no `interface`): el `ValidationPipe` global solo valida clases. */
export class DesafioDto {
  @IsString()
  @IsNotEmpty()
  desafio!: string;
}

export class VerificarDesafioDto extends DesafioDto {
  @IsString()
  @IsNotEmpty()
  codigo!: string;
}

/** `POST /auth/2fa/verificar`: suma `recordar` (D1). */
export class VerificarConRecordarDto extends VerificarDesafioDto {
  @IsOptional()
  @IsBoolean()
  recordar?: boolean;
}

export class TicketDto {
  @IsString()
  @IsNotEmpty()
  ticket!: string;
}

export class SeleccionarClienteDto extends TicketDto {
  @IsUUID()
  clienteId!: string;
}
