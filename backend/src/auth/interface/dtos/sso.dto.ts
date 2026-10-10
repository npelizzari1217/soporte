import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** `class` (no `interface`): el `ValidationPipe` global solo valida clases. */
export class IniciarSsoDto {
  /** Destino posterior al login. El BFF lo sanea; el backend solo acota el largo (`VARCHAR(300)`). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  siguiente?: string;
}

export class CallbackSsoDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  /** Valor crudo de la cookie `sso_st`. */
  @IsString()
  @IsNotEmpty()
  binding!: string;

  /** Valor crudo de la cookie `td`; solo lo lee el segundo paso. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  dispositivoConfiable?: string;
}
