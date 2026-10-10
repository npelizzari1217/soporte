/**
 * SsoController — rutas PUBLICAS del login SSO (sdd/login-sso, ADR-7). Sin logica: valida el
 * slug contra la lista cerrada y traduce errores. Todo rechazo es el mismo 401 (SL13).
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CompletarSsoResultado,
  CompletarSsoUseCase,
} from '../../application/sso/completar-sso.use-case';
import { IniciarSsoOutput, IniciarSsoUseCase } from '../../application/sso/iniciar-sso.use-case';
import { ListarProveedoresSsoUseCase } from '../../application/sso/listar-proveedores-sso.use-case';
import { SsoNoDisponibleError, SsoRechazadoError } from '../../domain/errors/sso.errors';
import { proveedorDeSlug, SlugSso } from '../../domain/sso/proveedor-slug';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';
import { CallbackSsoDto, IniciarSsoDto } from '../dtos/sso.dto';
import { ipDelNavegador, RequestConIp } from '../ip-del-navegador';

@Controller('auth/sso')
export class SsoController {
  constructor(
    private readonly listarProveedores: ListarProveedoresSsoUseCase,
    private readonly iniciarSso: IniciarSsoUseCase,
    private readonly completarSso: CompletarSsoUseCase,
  ) {}

  @Get('proveedores')
  proveedores(): { proveedores: SlugSso[] } {
    return { proveedores: this.listarProveedores.execute() };
  }

  @Post(':proveedor/iniciar')
  @HttpCode(HttpStatus.OK)
  async iniciar(
    @Param('proveedor') slug: string,
    @Body() dto: IniciarSsoDto,
  ): Promise<IniciarSsoOutput> {
    const proveedor = proveedorDeSlug404(slug);
    try {
      return await this.iniciarSso.execute({ proveedor, siguiente: dto.siguiente ?? null });
    } catch (e) {
      if (e instanceof SsoNoDisponibleError) throw new NotFoundException();
      throw e;
    }
  }

  @Post(':proveedor/callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Param('proveedor') slug: string,
    @Body() dto: CallbackSsoDto,
    @Req() req: RequestConIp,
  ): Promise<CompletarSsoResultado> {
    const proveedor = proveedorDeSlug404(slug);
    try {
      return await this.completarSso.execute({
        proveedor,
        code: dto.code,
        state: dto.state,
        bindingToken: dto.binding,
        ip: ipDelNavegador(req),
        ...(dto.dispositivoConfiable !== undefined
          ? { dispositivoConfiable: dto.dispositivoConfiable }
          : {}),
      });
    } catch (e) {
      if (e instanceof SsoRechazadoError) throw new UnauthorizedException(e.message);
      throw e;
    }
  }
}

function proveedorDeSlug404(slug: string): ProveedorSso {
  const proveedor = proveedorDeSlug(slug);
  if (proveedor === null) throw new NotFoundException();
  return proveedor;
}
