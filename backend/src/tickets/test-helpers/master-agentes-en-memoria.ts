import { IUsuarioMasterChecker } from '../domain/ports/i-usuario-master.checker';

/** Usuario de master tal como lo ve la elegibilidad del asignado. */
export interface UsuarioMasterFake {
  id: string;
  /** Rol de su membresía en el cliente; `ROOT` simula `is_global_admin`. */
  rol: 'ROOT' | 'ADMINISTRADOR' | 'TECNICO' | 'COLABORADOR' | 'USUARIO';
  /**
   * Celdas de la matriz por módulo (`MODULO:ACCION`). Ningún método las lee: están para que un
   * test pueda afirmar que ya no deciden la elegibilidad (odd/permisos-por-tipo-ticket, D5 g).
   */
  celdas: readonly string[];
  nombre?: string;
  apellido?: string;
}

/**
 * Doble en memoria de la parte de `IUsuarioMasterChecker` que usa la elegibilidad del asignado:
 * identidad, rol y membresía de un solo cliente. Cuenta las consultas de agentes para afirmar que
 * no se va a master cuando no hace falta.
 */
export class MasterAgentesEnMemoria implements Pick<IUsuarioMasterChecker, 'listarAgentes'> {
  private readonly usuarios: UsuarioMasterFake[] = [];
  consultasDeAgentes = 0;

  /**
   * @param usuario Usuario a sumar al cliente simulado.
   */
  agregar(usuario: UsuarioMasterFake): void {
    this.usuarios.push(usuario);
  }

  async listarAgentes(
    _clienteId: string,
    usuarioIds: readonly string[],
  ): Promise<{ id: string; nombre: string; apellido: string }[]> {
    this.consultasDeAgentes += 1;
    return this.usuarios
      .filter((u) => usuarioIds.includes(u.id) && (u.rol === 'TECNICO' || u.rol === 'COLABORADOR'))
      .map((u) => ({
        id: u.id,
        nombre: u.nombre ?? `Nombre ${u.id}`,
        apellido: u.apellido ?? u.id,
      }))
      .sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre));
  }
}
