import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Save } from "lucide-react";
import { fetchRouteMeta, updateRouteMeta, RouteMeta } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const RouteMetaCard = ({ route }: { route: RouteMeta }) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(route.title);
  const [description, setDescription] = useState(route.description);
  const fullUrl = `${window.location.origin}${route.path}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar el link");
    }
  };

  const mutation = useMutation({
    mutationFn: (data: { title: string; description: string }) => updateRouteMeta(route.key, data),
    onSuccess: () => {
      toast.success("Guardado");
      queryClient.invalidateQueries({ queryKey: ["route-meta"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo guardar"),
  });

  const handleSave = () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Completa el título y la descripción");
      return;
    }
    mutation.mutate({ title: title.trim(), description: description.trim() });
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div>
        <p className="font-medium">{route.label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 break-all"
          >
            {fullUrl} <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Copiar link"
            title="Copiar link"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div>
        <label className="text-sm text-muted-foreground mb-1 block">Título</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="text-sm text-muted-foreground mb-1 block">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <Button size="sm" onClick={handleSave} disabled={mutation.isPending} className="gap-2">
        <Save className="w-3.5 h-3.5" /> {mutation.isPending ? "Guardando..." : "Guardar"}
      </Button>
    </div>
  );
};

const AdminLinkPreviews = () => {
  const { data: routes = [], isLoading, isError } = useQuery({ queryKey: ["route-meta"], queryFn: fetchRouteMeta });

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-6">
        Título y descripción que se muestran al compartir cada link (ej. por WhatsApp). El ícono de cada uno queda fijo.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
      {isError && <p className="text-sm text-destructive">No se pudo conectar con la API.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {routes.map((route) => (
          <RouteMetaCard key={route.key} route={route} />
        ))}
      </div>
    </div>
  );
};

export default AdminLinkPreviews;
