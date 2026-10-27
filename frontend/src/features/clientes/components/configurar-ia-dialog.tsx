"use client";

/**
 * ConfigurarIaDialog — alta/edición del proveedor de IA del asistente de UN cliente
 * (odd/asistente-ia-ayuda, S4). Diálogo SEPARADO, como el de correo: el backend tiene rutas propias
 * en `/clientes/:id/ia`. Exclusivo ROOT (lo gatea la pantalla de Clientes).
 *
 * La clave nunca vuelve del servidor (`ClienteIa` no tiene ese campo): el input arranca SIEMPRE
 * vacío. Guardar con la clave vacía la OMITE del body y el backend conserva la guardada. Quitar la
 * configuración es una acción explícita y separada, detrás de `ConfirmDialog`.
 *
 * Un cliente sin IA no queda sin asistente: responde con la Ayuda directamente.
 *
 * Guardar también prueba el proveedor (lo hace el backend): la respuesta trae el resultado y el
 * diálogo lo muestra en el acto, igual que tras "Probar".
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import { useClienteIa } from "../hooks/use-clientes";
import {
  useConfigurarIaCliente,
  useProbarIaCliente,
  useQuitarIaCliente,
} from "../hooks/use-clientes-mutations";
import { CLIENTE_IA_MODELO_POR_DEFECTO, CLIENTE_IA_URL_POR_DEFECTO } from "../limites";
import { configurarIaSchema, type ConfigurarIaFormValues } from "../schemas";
import type { Cliente, ClienteIa } from "../types";

export interface ConfigurarIaDialogProps {
  cliente: Cliente;
}

/** Valores para un cliente sin IA: se propone Gemini, el proveedor por defecto. */
const VALORES_INICIALES: ConfigurarIaFormValues = {
  url: CLIENTE_IA_URL_POR_DEFECTO,
  modelo: CLIENTE_IA_MODELO_POR_DEFECTO,
  clave: "",
};

/** Dato del servidor → formulario. La clave NUNCA se prellena: no viaja en la respuesta. */
function aValoresFormulario(ia: ClienteIa): ConfigurarIaFormValues {
  return {
    url: ia.url ?? CLIENTE_IA_URL_POR_DEFECTO,
    modelo: ia.modelo ?? CLIENTE_IA_MODELO_POR_DEFECTO,
    clave: "",
  };
}

/**
 * @param props.cliente cliente cuya IA se configura
 * @returns el botón "IA" de la fila y su diálogo
 */
export function ConfigurarIaDialog({ cliente }: ConfigurarIaDialogProps) {
  const [open, setOpen] = useState(false);
  const iaQuery = useClienteIa(cliente.id, open);
  const configurarMutation = useConfigurarIaCliente(cliente.id);
  const probarMutation = useProbarIaCliente(cliente.id);
  const quitarMutation = useQuitarIaCliente(cliente.id);

  const yaConfigurado = iaQuery.data?.configurado ?? false;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ConfigurarIaFormValues>({
    resolver: zodResolver(configurarIaSchema(yaConfigurado)),
    defaultValues: VALORES_INICIALES,
  });

  // Recalculado en cada render: el diálogo vive montado en la fila y su snapshot inicial no sirve.
  const valoresVigentes = iaQuery.data ? aValoresFormulario(iaQuery.data) : VALORES_INICIALES;

  // Sincroniza con el servidor en la primera carga y tras "Probar", pero solo si no se está
  // editando: un dato nuevo del servidor no pisa lo que se está tipeando.
  useEffect(() => {
    if (iaQuery.data && !isDirty) reset(aValoresFormulario(iaQuery.data));
  }, [iaQuery.data, isDirty, reset]);

  function submit(values: ConfigurarIaFormValues) {
    configurarMutation.mutate(
      {
        url: values.url,
        modelo: values.modelo,
        // Vacía ⇒ no se manda: el backend conserva la clave guardada. Nunca `""`.
        clave: values.clave || undefined,
      },
      // Sin este reset el formulario queda sucio y la clave tipeada sigue en el DOM.
      { onSuccess: (ia) => reset(aValoresFormulario(ia)) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(valoresVigentes);
        else reset(VALORES_INICIALES);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`IA de ${cliente.nombre}`}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          IA
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asistente de IA — {cliente.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {yaConfigurado ? (
            <Badge variant="success">IA configurada</Badge>
          ) : (
            <Badge variant="outline">Sin IA: el asistente responde con la Ayuda</Badge>
          )}
          {/* verificadoAt es @db.Timestamptz: instante. */}
          {yaConfigurado && iaQuery.data?.verificadoAt && !iaQuery.data.verificacionError && (
            <span className="text-xs text-muted-foreground">
              Probada el {formatearInstante(iaQuery.data.verificadoAt)}
            </span>
          )}
          {yaConfigurado && iaQuery.data?.verificacionError && (
            <span className="text-xs text-destructive">Prueba fallida: {iaQuery.data.verificacionError}</span>
          )}
        </div>

        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="ia-url" className="text-sm font-medium text-foreground">
              URL del proveedor
            </label>
            <Input id="ia-url" error={!!errors.url} {...register("url")} />
            <p className="text-xs text-muted-foreground">
              Endpoint compatible con OpenAI. La de Gemini viene cargada por defecto.
            </p>
            {errors.url && (
              <p role="alert" className="text-sm text-destructive">
                {errors.url.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="ia-modelo" className="text-sm font-medium text-foreground">
              Modelo
            </label>
            <Input id="ia-modelo" error={!!errors.modelo} {...register("modelo")} />
            {errors.modelo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.modelo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="ia-clave" className="text-sm font-medium text-foreground">
              Clave{yaConfigurado ? " (opcional)" : ""}
            </label>
            <Input
              id="ia-clave"
              type="password"
              autoComplete="new-password"
              error={!!errors.clave}
              {...register("clave")}
            />
            <p className="text-xs text-muted-foreground">
              {yaConfigurado ? "Déjela vacía para no cambiarla." : "Requerida para la primera configuración."}
            </p>
            {errors.clave && (
              <p role="alert" className="text-sm text-destructive">
                {errors.clave.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {yaConfigurado ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="destructive" size="sm">
                    Quitar configuración
                  </Button>
                }
                title="Quitar la IA"
                description={`¿Confirma quitar la IA de "${cliente.nombre}"? Se borra la clave y el asistente pasa a responder con la Ayuda directamente.`}
                confirmLabel="Quitar"
                confirmVariant="destructive"
                isConfirming={quitarMutation.isPending}
                onConfirm={() => quitarMutation.mutate()}
              />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {yaConfigurado && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={probarMutation.isPending}
                  onClick={() => probarMutation.mutate()}
                >
                  Probar
                </Button>
              )}
              <Button type="submit" isLoading={configurarMutation.isPending}>
                Guardar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
