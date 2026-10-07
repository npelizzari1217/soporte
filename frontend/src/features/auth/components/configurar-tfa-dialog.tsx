"use client";

/**
 * ConfigurarTfaDialog — ajustes de la verificación en dos pasos del usuario (perfil).
 *
 * Sin 2FA: activar (QR → código → 10 códigos de recuperación, una sola vez). Con 2FA: cambiar de
 * celular, regenerar códigos y desactivar; cada una pide un código vigente ANTES de actuar. Si el
 * 2FA es obligatorio no se ofrece desactivar. Nunca se muestra el secreto actual. Los códigos viven
 * solo en el estado del componente.
 *
 * Spec: sdd/verificacion-dos-pasos — T3, T7, T8, T9, T10.
 */
import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IniciarSecretoTfa } from "../schemas";
import { useTfaCuenta } from "../hooks/use-tfa-cuenta";
import { EnrolamientoTfa } from "./enrolamiento-tfa";
import { CodigosRecuperacion } from "./codigos-recuperacion";

type Accion = "cambiar" | "regenerar" | "desactivar";
type Vista =
  | { tipo: "menu" }
  | { tipo: "codigo"; accion: Accion }
  | { tipo: "qr"; datos: IniciarSecretoTfa }
  | { tipo: "codigos"; codigos: string[] };

const TITULO: Record<Accion, string> = {
  cambiar: "Cambiar celular",
  regenerar: "Regenerar códigos",
  desactivar: "Desactivar",
};

export function ConfigurarTfaDialog() {
  const [open, setOpen] = useState(false);
  const [vista, setVista] = useState<Vista>({ tipo: "menu" });
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { estado, iniciar, confirmar, regenerar, desactivar } = useTfaCuenta(open);

  function volver(mensaje: string | null = null) {
    setVista({ tipo: "menu" });
    setCodigo("");
    setError(null);
    setAviso(mensaje);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      volver();
      // Los códigos de recuperación quedan en el estado de las mutaciones: se descartan al cerrar.
      for (const m of [iniciar, confirmar, regenerar, desactivar]) m.reset();
    }
  }

  function pedirCodigo(accion: Accion) {
    setCodigo("");
    setError(null);
    setAviso(null);
    setVista({ tipo: "codigo", accion });
  }

  const fallo = (e: Error) => setError(e.message);

  function activar() {
    setError(null);
    iniciar.mutate(undefined, { onSuccess: (datos) => setVista({ tipo: "qr", datos }), onError: fallo });
  }

  function enviarCodigo(e: FormEvent, accion: Accion) {
    e.preventDefault();
    const c = codigo.trim();
    if (!c) return setError("Ingresá el código.");
    setError(null);
    if (accion === "cambiar") {
      iniciar.mutate(c, { onSuccess: (datos) => setVista({ tipo: "qr", datos }), onError: fallo });
    } else if (accion === "regenerar") {
      regenerar.mutate(c, {
        onSuccess: (r) => setVista({ tipo: "codigos", codigos: r.codigosRecuperacion }),
        onError: fallo,
      });
    } else {
      desactivar.mutate(c, { onSuccess: () => volver("Desactivaste la verificación en dos pasos."), onError: fallo });
    }
  }

  function confirmarQr(c: string) {
    setError(null);
    confirmar.mutate(c, {
      onSuccess: (r) =>
        r.codigosRecuperacion
          ? setVista({ tipo: "codigos", codigos: r.codigosRecuperacion })
          : volver("Listo, ya usás tu celular nuevo."),
      onError: fallo,
    });
  }

  const cargando = iniciar.isPending || regenerar.isPending || desactivar.isPending;

  function contenido() {
    if (vista.tipo === "qr") {
      return <EnrolamientoTfa datos={vista.datos} onConfirmar={confirmarQr} isLoading={confirmar.isPending} />;
    }
    if (vista.tipo === "codigos") {
      return <CodigosRecuperacion codigos={vista.codigos} onContinuar={() => volver()} isLoading={false} />;
    }
    if (vista.tipo === "codigo") {
      const { accion } = vista;
      return (
        <form onSubmit={(e) => enviarCodigo(e, accion)} className="flex flex-col gap-3" noValidate>
          <label htmlFor="codigo-tfa-cuenta" className="text-sm font-medium text-foreground">
            Código de verificación
          </label>
          <Input
            id="codigo-tfa-cuenta"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => volver()}>
              Volver
            </Button>
            <Button type="submit" isLoading={cargando}>
              {TITULO[accion]}
            </Button>
          </div>
        </form>
      );
    }
    if (estado.isPending) return <p role="status">Cargando…</p>;
    if (estado.isError || !estado.data) {
      return <p className="text-sm text-destructive">No pudimos cargar tu configuración.</p>;
    }
    const { activo, obligado, codigosRestantes } = estado.data;
    if (!activo) {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {obligado
              ? "Tu cliente o tu rol exige la verificación en dos pasos. Activala para seguir usando tu cuenta."
              : "Sumá una segunda barrera a tu cuenta con una app autenticadora."}
          </p>
          <Button onClick={activar} isLoading={cargando}>
            Activar verificación en dos pasos
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          La verificación en dos pasos está activa. Te quedan {codigosRestantes} códigos de recuperación.
        </p>
        <Button variant="outline" onClick={() => pedirCodigo("cambiar")}>
          Cambiar celular
        </Button>
        <Button variant="outline" onClick={() => pedirCodigo("regenerar")}>
          Regenerar códigos
        </Button>
        {obligado ? (
          <p className="text-sm text-muted-foreground">
            No podés desactivarla: tu cliente o tu rol exige la verificación en dos pasos.
          </p>
        ) : (
          <Button variant="outline" onClick={() => pedirCodigo("desactivar")}>
            Desactivar
          </Button>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Verificación en dos pasos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verificación en dos pasos</DialogTitle>
        </DialogHeader>
        {aviso && (
          <p role="status" className="text-sm text-foreground">
            {aviso}
          </p>
        )}
        {contenido()}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
