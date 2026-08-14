import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Service } from "@/lib/api";

interface ServiceOrderPickerProps {
  services: Service[];
  onAdd: (service: Service) => void;
}

const matches = (service: Service, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [service.name, service.code, service.description].some((field) => (field ?? "").toLowerCase().includes(q));
};

const ServiceOrderPicker = ({ services, onAdd }: ServiceOrderPickerProps) => {
  const [query, setQuery] = useState("");
  const filtered = services.filter((s) => matches(s, query)).slice(0, 20);

  return (
    <div>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca por nombre, código o descripción..." />
      {query.trim() && (
        <div className="mt-2 max-h-96 overflow-y-auto space-y-2 pr-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No se encontró ningún servicio con ese texto.</p>
          )}
          {filtered.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => onAdd(service)}
              className="w-full text-left border border-border rounded-lg p-3 bg-card hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{service.name}</p>
                {service.code && <p className="text-xs text-muted-foreground">{service.code}</p>}
                {service.description && <p className="text-xs text-muted-foreground truncate">{service.description}</p>}
              </div>
              <p className="text-sm font-medium shrink-0">S/.{service.price.toFixed(2)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceOrderPicker;
