/**
 * Arma el mensaje de "texto demasiado largo" que muestran los formularios.
 *
 * Vive en `shared/lib/` porque lo consumen schemas de features distintas
 * —`features/usuarios/schemas.ts` y `features/clientes/schemas.ts`— y ahí el
 * usuario tiene que leer la misma frase sin importar por cuál formulario entró.
 *
 * Unifica el mensaje de los schemas que lo importan, no del repo entero: varios
 * módulos siguen armando la frase a mano. Migrarlos es su propia unidad de
 * trabajo, y para saber cuáles faltan alcanza con buscar quién NO importa este
 * helper — que es información que se mide, no que se anota acá y envejece.
 *
 * @param campo - Nombre del campo TAL COMO arranca la oración, con artículo y
 *   género ya resueltos: `"El nombre"`, `"La razón social"`, `"El CUIT"`. No se
 *   le antepone nada, así que un valor sin artículo produce un mensaje roto.
 * @param max - Tope de caracteres a nombrar en el mensaje.
 * @returns La oración completa, en español, lista para mostrar bajo el campo.
 */
export const mensajeDemasiadoLargo = (campo: string, max: number): string =>
  `${campo} no puede superar los ${max} caracteres`;
