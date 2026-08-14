import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadPitayaReportById, fetchPitayaReports, generatePitayaReport } from "@/lib/api";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });

const AdminPitaya = () => {
  const queryClient = useQueryClient();
  const { data: reports = [], isLoading, isError } = useQuery({ queryKey: ["pitaya-reports"], queryFn: fetchPitayaReports });

  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo generar el reporte");

  const generateMutation = useMutation({
    mutationFn: generatePitayaReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pitaya-reports"] });
    },
    onError,
  });

  const downloadMutation = useMutation({
    mutationFn: downloadPitayaReportById,
    onError,
  });

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-muted-foreground mb-6">
        Genera el Excel con los pedidos listos para el motorizado Pitaya: solo pedidos con delivery
        "Motorizado Delivery" que están en estado "Pendiente de envío" y que todavía no salieron en un reporte
        anterior. Cada generación queda guardada abajo — se puede volver a descargar cuando haga falta.
      </p>
      <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="gap-2 mb-8">
        <FileSpreadsheet className="w-4 h-4" />
        {generateMutation.isPending ? "Generando..." : "Generar Excel"}
      </Button>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Archivo</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Fecha</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Pedidos</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-medium">{report.fileName}</td>
                  <td className="py-3 px-4 text-muted-foreground text-sm">{formatDateTime(report.createdAt)}</td>
                  <td className="py-3 px-4 text-muted-foreground text-sm">{report.rowCount}</td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadMutation.mutate(report.id)}
                      disabled={downloadMutation.isPending}
                      className="gap-2"
                    >
                      <Download className="w-3.5 h-3.5" /> Descargar
                    </Button>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">Cargando reportes...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && reports.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">Todavía no generaste ningún reporte.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminPitaya;
