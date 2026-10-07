"use client";

/**
 * PoliticaTfaCard — CONTAINER. Muestra y cambia si el cliente exige la
 * verificación en dos pasos a todos sus usuarios. Solo para quien administra
 * el cliente (el caller la monta dentro de `SoloAdminCliente`). Activar NO
 * corta las sesiones abiertas: se pide en el próximo ingreso de cada usuario.
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useCambiarPoliticaTfa, usePoliticaTfa } from "../hooks/use-politica-tfa";

export function PoliticaTfaCard() {
  const politicaQuery = usePoliticaTfa();
  const mutation = useCambiarPoliticaTfa();
  const exigida = politicaQuery.data?.requiere2fa === true;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Verificación en dos pasos</CardTitle>
        <CardDescription>
          Exigila a todos los usuarios de este cliente. Las sesiones abiertas no se cierran: se
          les pedirá configurarla en su próximo ingreso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {politicaQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : politicaQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            No se pudo cargar la política de verificación en dos pasos.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              Estado: <strong>{exigida ? "exigida a todos" : "no exigida"}</strong>
            </p>
            <ConfirmDialog
              trigger={
                <Button type="button" size="sm" variant="outline">
                  {exigida ? "Dejar de exigir" : "Exigir a todos"}
                </Button>
              }
              title={exigida ? "Dejar de exigir el segundo paso" : "Exigir el segundo paso"}
              description={
                exigida
                  ? "¿Confirmás dejar de exigir la verificación en dos pasos? Quienes ya la tienen activa pueden conservarla."
                  : "¿Confirmás exigir la verificación en dos pasos a todos los usuarios? No se cierran las sesiones abiertas: se les pedirá configurarla en su próximo ingreso."
              }
              confirmLabel="Confirmar"
              isConfirming={mutation.isPending}
              onConfirm={() => mutation.mutate({ requiere2fa: !exigida })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
