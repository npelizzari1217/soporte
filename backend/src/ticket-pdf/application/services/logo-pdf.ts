import { VerLogoClienteUseCase } from '../../../clientes/application/use-cases/ver-logo-cliente.use-case';
import { LogoPdf } from '../../domain/ticket-pdf-vista';

const MIME_LOGO: Readonly<Record<string, LogoPdf['formato']>> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
};

/**
 * Logo del cliente en un formato que el PDF sabe embeber. Lo comparten la ficha del ticket y el
 * certificado de avance.
 *
 * @param verLogoCliente Caso de uso que lee el logo.
 * @param clienteId Cliente del JWT.
 * @returns El logo, o `null` si no hay o su formato no es embebible (webp): se imprime el nombre.
 */
export async function logoParaPdf(
  verLogoCliente: Pick<VerLogoClienteUseCase, 'execute'>,
  clienteId: string,
): Promise<LogoPdf | null> {
  const resultado = await verLogoCliente.execute(clienteId);
  if (resultado.isFail()) return null;
  const { buffer, mimeType } = resultado.getValue();
  const formato = MIME_LOGO[mimeType.toLowerCase()];
  return formato ? { buffer, formato } : null;
}
