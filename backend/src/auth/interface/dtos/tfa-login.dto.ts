import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

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

export class TicketDto {
  @IsString()
  @IsNotEmpty()
  ticket!: string;
}

export class SeleccionarClienteDto extends TicketDto {
  @IsUUID()
  clienteId!: string;
}
