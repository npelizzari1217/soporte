"use client";

/**
 * EquipoBajaDialog — CONTAINER de la baja del equipo completo. Al abrirse pide el
 * resumen (`GET …/baja/resumen`) y muestra cuántas piezas hay, qué pasa con cada una
 * y cuántos tickets abiertos quedan apuntando al equipo; la baja es todo o nada.
 *
 * Confirmación: con `STOCK_USADO` alcanza un botón, salvo que una pieza no pueda
 * volver al stock (se listan y el botón queda deshabilitado). Con `DESCARTE` hay que
 * escribir el nombre del equipo (`trim()`); es solo interfaz, el backend no lo exige.
 * Los errores del backend se muestran acá: 422 de piezas (cada una con su causa), 422
 * del motivo, 409 (el equipo cambió: se refresca el resumen y se confirma de nuevo,
 * sin reintento automático) y 422 de equipo ya dado de baja.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDarDeBajaEquipo } from "../hooks/use-equipo-mutations";
import { useResumenBajaEquipo } from "../hooks/use-resumen-baja-equipo";
import {
  VALORES_INICIALES_BAJA,
  TEXTO_CAUSA_BAJA,
  destinoDePieza,
  mensajeDeErrorBaja,
  nombreDePieza,
  piezasBloqueantes,
  serialDePieza,
  validarBaja,
  type ErroresBaja,
  type ValoresBaja,
} from "../baja-equipo-reglas";
import type { BajaEquipoDto, CausaPiezaBaja } from "../types";
import { EquipoBajaForm } from "./equipo-baja-form";

export interface EquipoBajaDialogProps {
  equipoId: string;
}

export function EquipoBajaDialog({ equipoId }: EquipoBajaDialogProps) {
  const [open, setOpen] = useState(false);
  const [valores, setValores] = useState<ValoresBaja>(VALORES_INICIALES_BAJA);
  const resumenQuery = useResumenBajaEquipo(equipoId, open);
  const bajaMutation = useDarDeBajaEquipo(equipoId);
  const resumen = resumenQuery.data;

  const errores: ErroresBaja = resumen ? validarBaja(resumen, valores) : { seriales: {} };
  const bloqueantes = resumen && valores.destino === "STOCK_USADO" ? piezasBloqueantes(resumen, valores) : [];
  const nombreConfirmado = !resumen || valores.destino !== "DESCARTE" || valores.confirmacion.trim() === resumen.nombre;
  const puedeConfirmar =
    !!resumen &&
    !errores.motivo &&
    Object.keys(errores.seriales).length === 0 &&
    bloqueantes.length === 0 &&
    nombreConfirmado;

  function confirmar() {
    if (!resumen || !puedeConfirmar) return;
    const motivo = valores.motivo.trim();
    const seriales =
      valores.destino === "STOCK_USADO"
        ? resumen.piezas
            .filter((p) => p.requiereSerial)
            .map((p) => ({ componenteId: p.componenteId, numeroSerie: serialDePieza(p, valores).trim() }))
        : [];
    const dto: BajaEquipoDto = {
      destino: valores.destino,
      categoria: valores.categoria,
      ...(motivo !== "" && { motivo }),
      ...(seriales.length > 0 && { seriales }),
    };
    bajaMutation.mutate(dto, { onSuccess: () => setOpen(false) });
  }

  const error = bajaMutation.error ? mensajeDeErrorBaja(bajaMutation.error) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValores(VALORES_INICIALES_BAJA);
          bajaMutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          Dar de baja
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar de baja el equipo</DialogTitle>
        </DialogHeader>
        {resumenQuery.isError && (
          <p role="alert" className="text-sm text-destructive">
            No se pudo cargar el resumen de la baja.
          </p>
        )}
        {!resumen && !resumenQuery.isError && <p className="text-sm text-muted-foreground">Cargando resumen…</p>}
        {resumen && (
          <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              confirmar();
            }}
          >
            <section aria-label="Resumen de la baja" className="flex flex-col gap-2 text-sm text-foreground">
              <p>
                {resumen.piezas.length === 1
                  ? "El equipo tiene 1 pieza activa."
                  : `El equipo tiene ${resumen.piezas.length} piezas activas.`}
              </p>
              {resumen.piezas.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {resumen.piezas.map((pieza) => (
                    <li key={pieza.componenteId}>
                      {nombreDePieza(pieza)}: {destinoDePieza(pieza, valores.destino)}
                    </li>
                  ))}
                </ul>
              )}
              {resumen.ticketsAbiertos > 0 && (
                <p role="status" className="text-sm text-amber-600">
                  {resumen.ticketsAbiertos === 1
                    ? "El equipo tiene 1 ticket abierto; va a seguir abierto y apuntando a este equipo."
                    : `El equipo tiene ${resumen.ticketsAbiertos} tickets abiertos; van a seguir abiertos y apuntando a este equipo.`}
                </p>
              )}
            </section>
            <EquipoBajaForm
              resumen={resumen}
              valores={valores}
              onCambiar={(cambios) => setValores((previos) => ({ ...previos, ...cambios }))}
              errores={errores}
              disabled={bajaMutation.isPending}
            />
            {bloqueantes.length > 0 && (
              <div role="alert" className="text-sm text-destructive">
                <p>Estas piezas no pueden volver al stock. Corregilas o descartá todas las piezas:</p>
                <ul className="list-disc pl-5 text-xs">
                  {bloqueantes.map((pieza) => (
                    <li key={pieza.componenteId}>
                      {nombreDePieza(pieza)}: {TEXTO_CAUSA_BAJA[pieza.causaQueImpideDevolver as CausaPiezaBaja]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <div role="alert" className="text-sm text-destructive">
                <p>{error.texto}</p>
                {error.piezas.length > 0 && (
                  <ul className="list-disc pl-5 text-xs">
                    {error.piezas.map((p) => {
                      const pieza = resumen.piezas.find((x) => x.componenteId === p.componenteId);
                      return (
                        <li key={p.componenteId}>
                          {pieza ? nombreDePieza(pieza) : p.componenteId}: {TEXTO_CAUSA_BAJA[p.causa]}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" variant="destructive" disabled={!puedeConfirmar} isLoading={bajaMutation.isPending}>
                Confirmar baja
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
