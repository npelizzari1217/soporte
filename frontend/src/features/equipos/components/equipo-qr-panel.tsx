"use client";

/**
 * EquipoQrPanel — emisión, regeneración, descarga e impresión del QR de UN equipo
 * (sdd/formulario-publico-qr D8; la impresión en lote está fuera de alcance).
 *
 * Desde el issue #356 el backend guarda el token del QR: al montar se lee el QR vigente
 * (`GET /equipos/:id/qr`) y se puede descargar o imprimir cuantas veces haga falta. Regenerar
 * sigue pidiendo confirmación (el impreso deja de funcionar) y reemplaza el QR mostrado. Un QR
 * emitido antes de ese cambio no tiene token guardado: se avisa que hay que regenerarlo una vez.
 * Se monta solo para equipos activos y con `EQUIPOS:MODIFICACION` (el caller gatea; un equipo
 * dado de baja no lo recibe).
 */
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { dispararDescarga } from "@/shared/lib/descarga";
import { useEmitirQrEquipo } from "../hooks/use-emitir-qr-equipo";
import { useQrEquipo } from "../hooks/use-qr-equipo";
import { ladoQr, matrizQr, pathQr, pngQr, svgQrComoTexto } from "../qr-equipo";

export interface EquipoQrPanelProps {
  equipoId: string;
  equipoNombre: string;
}

function nombreArchivo(nombre: string, ext: "svg" | "png"): string {
  const base = nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "equipo";
  return `qr-${base}.${ext}`;
}

export function EquipoQrPanel({ equipoId, equipoNombre }: EquipoQrPanelProps) {
  const emitir = useEmitirQrEquipo(equipoId);
  const [confirmando, setConfirmando] = useState(false);
  const lectura = useQrEquipo(equipoId);
  const vigente = lectura.data;
  // Solo un QR VIGENTE trae url; el resto de los estados se explican con un mensaje.
  const qr = vigente?.estado === "VIGENTE" && vigente.url ? { url: vigente.url } : null;
  const requiereRegenerar = vigente?.estado === "REQUIERE_REGENERAR";

  const matriz = qr ? matrizQr(qr.url) : null;
  const lado = matriz ? ladoQr(matriz) : 0;

  const descargarSvg = () => {
    if (!qr) return;
    dispararDescarga(new Blob([svgQrComoTexto(qr.url)], { type: "image/svg+xml" }), nombreArchivo(equipoNombre, "svg"));
  };

  const descargarPng = () => {
    if (!qr) return;
    pngQr(qr.url)
      .then((blob) => dispararDescarga(blob, nombreArchivo(equipoNombre, "png")))
      .catch(() => toast.error("No se pudo generar el PNG. Probá con el SVG."));
  };

  const imprimir = () => {
    if (!qr) return;
    const ventana = window.open("", "_blank", "width=600,height=700");
    if (!ventana) {
      toast.error("El navegador bloqueó la ventana de impresión. Permitila e intentá de nuevo.");
      return;
    }
    // Solo se escribe el SVG generado acá (números fijos); el nombre va como texto, no como HTML.
    ventana.document.body.innerHTML = svgQrComoTexto(qr.url);
    const titulo = ventana.document.createElement("p");
    titulo.textContent = equipoNombre;
    titulo.style.cssText = "font-family:sans-serif;text-align:center";
    ventana.document.body.appendChild(titulo);
    ventana.document.title = `QR ${equipoNombre}`;
    ventana.focus();
    ventana.print();
  };

  return (
    <section aria-labelledby="equipo-qr-titulo" className="rounded-lg border p-4">
      <h2 id="equipo-qr-titulo" className="text-base font-semibold">
        QR del equipo
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Quien lo escanee abre el formulario público de pedido con este equipo ya cargado. Se descarga o imprime de a uno.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={emitir.isPending || lectura.isPending} onClick={() => setConfirmando(true)}>
          {qr || requiereRegenerar ? "Regenerar QR" : "Emitir QR"}
        </Button>
        {qr && (
          <>
            <Button size="sm" variant="outline" onClick={descargarSvg}>
              Descargar SVG
            </Button>
            <Button size="sm" variant="outline" onClick={descargarPng}>
              Descargar PNG
            </Button>
            <Button size="sm" variant="outline" onClick={imprimir}>
              Imprimir
            </Button>
          </>
        )}
      </div>

      {lectura.isPending && <p className="mt-3 text-sm text-muted-foreground">Cargando el QR…</p>}
      {lectura.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          No se pudo cargar el QR del equipo. Recargá la pantalla para volver a intentarlo.
        </p>
      )}
      {requiereRegenerar && (
        <p className="mt-3 text-sm text-muted-foreground">
          Este equipo tiene un QR emitido antes de que el sistema pudiera volver a mostrarlo. Regeneralo una vez para
          verlo y descargarlo; el que está impreso deja de funcionar al regenerar.
        </p>
      )}

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="Generar QR"
        description="Si este equipo ya tiene un QR emitido, el anterior deja de funcionar al instante y los que ya estén impresos hay que reemplazarlos. ¿Querés continuar?"
        confirmLabel="Generar QR"
        isConfirming={emitir.isPending}
        onConfirm={() => {
          setConfirmando(false);
          emitir.mutate();
        }}
      />

      {qr && matriz && (
        <div className="mt-4 flex flex-col items-start gap-2">
          <svg
            role="img"
            aria-label={`QR del equipo ${equipoNombre}`}
            viewBox={`0 0 ${lado} ${lado}`}
            className="h-56 w-56 rounded border bg-white"
            shapeRendering="crispEdges"
          >
            <rect width={lado} height={lado} fill="#ffffff" />
            <path d={pathQr(matriz)} fill="#000000" />
          </svg>
          <p className="text-xs text-muted-foreground">
            Este es el QR vigente: podés descargarlo o imprimirlo cuando quieras. Si lo regenerás, el anterior deja de
            funcionar.
          </p>
        </div>
      )}
    </section>
  );
}
