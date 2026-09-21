/**
 * ClienteLogoController — entry point HTTP del logo de un cliente
 * (sdd/logo-por-cliente, WU2).
 *
 * Rutas:
 *   POST   /clientes/:id/logo → ConfigurarLogoClienteUseCase (sube o reemplaza)
 *   DELETE /clientes/:id/logo → QuitarLogoClienteUseCase (idempotente)
 *   GET    /clientes/:id/logo → VerLogoClienteUseCase (sirve el binario)
 *
 * Controller NUEVO, deliberadamente SEPARADO de `ClientesController`
 * (design.md D1/H1) — read-only, nunca tocar: ese controller aplica
 * `@UseGuards(JwtAuthGuard, GlobalAdminGuard)` a nivel de CLASE
 * (`clientes.controller.ts:158`), y en Nest los guards de método son
 * ADITIVOS, no reemplazan al de clase. Agregar el `GET` ahí lo volvería
 * ROOT-only y ningún usuario del inquilino vería su propio logo. Por eso
 * este controller NO lleva `@UseGuards` de clase: cada método declara
 * exactamente los guards que le corresponden (design.md, tabla
 * "Autorización: los dos lugares").
 *
 * Guards por ruta:
 * - `POST`/`DELETE`: `JwtAuthGuard` + `GlobalAdminGuard` — exclusivo ROOT.
 * - `GET`: SOLO `JwtAuthGuard`, NUNCA `TenantGuard` (ese guard compara contra
 *   el `cliente_id` DEL TOKEN, jamás contra el `:id` de la ruta —
 *   `tenant.guard.ts:55-72` — así que no sirve para esta comparación). El
 *   control de aislamiento es el `if` inline de `ver()`: ROOT lee cualquier
 *   logo; cualquier otro actor solo el de su propio `cliente_id`.
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case,
 * aplica la validación de borde (`validarLogoCliente`) y mapea `DomainError`
 * → `HttpException`.
 *
 * Tarea: 2.6, 2.7.
 */
import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigurarLogoClienteUseCase } from '../../application/use-cases/configurar-logo-cliente.use-case';
import { QuitarLogoClienteUseCase } from '../../application/use-cases/quitar-logo-cliente.use-case';
import { VerLogoClienteUseCase } from '../../application/use-cases/ver-logo-cliente.use-case';
import { validarLogoCliente } from '../pipes/validar-logo-cliente';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError } from '../../../shared/domain/result';
import {
  ClienteNoEncontradoError,
  LogoClienteNoEncontradoError,
} from '../../domain/errors/clientes.errors';

/**
 * Respuesta mínima de una carga/reemplazo exitoso: la marca de tiempo que
 * alimenta `cliente_logo_v` (design.md D3) — nunca la storage key ni una
 * ruta de filesystem (design.md D7/regla 5 de la spec).
 */
interface ClienteLogoResponseDto {
  logoUpdatedAt: string | null;
}

/**
 * Lo único que este controller necesita de la respuesta HTTP para servir el
 * binario: poder escribir headers. Mismo criterio que `TicketsController`/
 * `EquiposController` (evita traer `@types/express` por un tipo completo).
 */
interface RespuestaConHeaders {
  setHeader(nombre: string, valor: string): void;
}

/**
 * Mapea un `DomainError` de los use cases de logo a la `HttpException`
 * correspondiente. `ClienteNoEncontradoError` y `LogoClienteNoEncontradoError`
 * mapean AMBAS a 404 (spec, regla 7: degradación al fallback ante cualquier
 * motivo, 404 incluido) — la distinción entre "cliente inexistente" y
 * "cliente sin logo" es de dominio, no de presentación.
 */
function toHttpException(error: DomainError): NotFoundException | InternalServerErrorException {
  if (error instanceof ClienteNoEncontradoError || error instanceof LogoClienteNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  return new InternalServerErrorException(error.message);
}

@Controller('clientes')
export class ClienteLogoController {
  constructor(
    private readonly configurarLogoClienteUseCase: ConfigurarLogoClienteUseCase,
    private readonly quitarLogoClienteUseCase: QuitarLogoClienteUseCase,
    private readonly verLogoClienteUseCase: VerLogoClienteUseCase,
  ) {}

  /**
   * POST /clientes/:id/logo
   * Sube o reemplaza el logo del cliente. Exclusivo ROOT.
   * @returns 200 + ClienteLogoResponseDto
   * @throws 422 UnprocessableEntityException si el archivo no pasa `validarLogoCliente`
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Post(':id/logo')
  @UseGuards(JwtAuthGuard, GlobalAdminGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('logo'))
  async subir(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ClienteLogoResponseDto> {
    validarLogoCliente(file);
    const archivo = file as Express.Multer.File;

    const result = await this.configurarLogoClienteUseCase.execute({
      clienteId: id,
      buffer: archivo.buffer,
      mimeType: archivo.mimetype,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    return { logoUpdatedAt: result.getValue().logoUpdatedAt?.toISOString() ?? null };
  }

  /**
   * DELETE /clientes/:id/logo
   * Quita el logo del cliente. Idempotente (spec, regla 11): responde 204
   * tanto si el cliente tenía logo como si no. Exclusivo ROOT.
   * @returns 204 sin cuerpo
   * @throws 404 NotFoundException si el cliente no existe
   */
  @Delete(':id/logo')
  @UseGuards(JwtAuthGuard, GlobalAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async quitar(@Param('id') id: string): Promise<void> {
    const result = await this.quitarLogoClienteUseCase.execute(id);

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * GET /clientes/:id/logo
   * Sirve el binario del logo. El control de aislamiento (design.md, tabla
   * "Autorización: los dos lugares") es este `if`, NO un guard: ROOT
   * (`is_global_admin`) lee cualquier logo; cualquier otro actor solo el de
   * su propio `cliente_id`. Responde con el `Content-Type` almacenado,
   * `X-Content-Type-Options: nosniff` y `Content-Disposition: inline`
   * (spec, regla 5) — nunca expone la storage key ni una ruta de filesystem.
   *
   * BUG DE PRODUCCIÓN CORREGIDO ACÁ (fix/logo-streamable-file): esta versión
   * devolvía un `Buffer` desnudo con `@Res({ passthrough: true })`. Con
   * `passthrough: true`, Nest SIGUE serializando el valor de retorno del
   * handler — no delega el control total de la respuesta al `res` inyectado.
   * Un `Buffer` es un objeto para esa serialización, así que
   * `ExpressAdapter.reply()` termina llamando `res.json(buffer)`, que lo
   * convierte en el string `{"type":"Buffer","data":[...]}` y le pega
   * `; charset=utf-8` al `Content-Type` ya seteado — medido contra
   * producción: 70356 bytes servidos vs. 20370 en disco, arrancando con
   * `7b2274797065223a` (`{"type":` en ASCII) en vez de la firma PNG
   * `89504e470d0a1a0a`. El navegador nunca lo decodifica como imagen: el
   * `<img>` dispara `onError` y el sidebar cae al ícono genérico,
   * indistinguible de "no hay logo".
   *
   * El error de origen fue copiar el precedente de los exports CSV
   * (`equipos.controller.ts:281`, `reparaciones-controller:255`,
   * `tickets.controller.ts:327`, `compras.controller.ts:743`), que sí
   * funcionan con `@Res({ passthrough: true })` — pero esos handlers
   * devuelven `Promise<string>`. Un string se envía tal cual
   * (`res.send(String(body))`); un `Buffer` no: `isObject(buffer)` es
   * verdadero, así que cae por la rama `res.json(...)`. El patrón era
   * correcto para texto y equivocado para binario.
   *
   * EL FIX: envolver el buffer en `StreamableFile` (`@nestjs/common`) —
   * primer uso en este repo. Con un `StreamableFile`, `ExpressAdapter.reply()`
   * toma la rama de streaming (`body instanceof StreamableFile`) ANTES de
   * llegar a `res.json`, y hace `stream.pipe(response)`: bytes crudos, sin
   * pasar por JSON. Los headers que este método setea a mano con
   * `res.setHeader(...)` (Content-Type/nosniff/inline) se escriben en el
   * `res` REAL antes del `return`, y `applyStreamHeaders()` de Nest sólo
   * completa los que falten (`setHeaderIfNotExists`, ver
   * `express-adapter.js`) — no los pisa. Por eso el orden de este método NO
   * cambia: setear headers primero, `return new StreamableFile(buffer)` al
   * final. Nunca devolver un `Buffer`/`Uint8Array` binario desnudo con
   * `@Res({ passthrough: true })`: para servir bytes, siempre
   * `StreamableFile`.
   * @returns 200 + el binario del logo, servido como stream (no JSON)
   * @throws 403 ForbiddenException si el actor no es ROOT ni dueño del cliente
   * @throws 404 NotFoundException si el cliente no existe o no tiene logo
   */
  @Get(':id/logo')
  @UseGuards(JwtAuthGuard)
  async ver(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: RespuestaConHeaders,
  ): Promise<StreamableFile> {
    if (!user.is_global_admin && user.cliente_id !== id) {
      throw new ForbiddenException('No tiene acceso al logo de este cliente.');
    }

    const result = await this.verLogoClienteUseCase.execute(id);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    const { buffer, mimeType } = result.getValue();
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    return new StreamableFile(buffer);
  }
}
