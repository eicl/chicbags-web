import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadPitayaReport } from "@/lib/api";

const AdminPitaya = () => {
  const mutation = useMutation({
    mutationFn: downloadPitayaReport,
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo generar el reporte"),
  });

  return (
    <div className="max-w-xl">
      <p className="text-sm text-muted-foreground mb-6">
        Genera el Excel con los pedidos listos para el motorizado Pitaya: solo pedidos con delivery
        "Motorizado Delivery" que están en estado "Pendiente de envío".
      </p>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
        <FileSpreadsheet className="w-4 h-4" />
        {mutation.isPending ? "Generando..." : "Generar Excel"}
      </Button>
    </div>
  );
};

export default AdminPitaya;
