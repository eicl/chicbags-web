import { useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Agency } from "@/lib/api";
import { errorLabelClass, errorInputClass, cn } from "@/lib/utils";

interface AgencyPickerProps {
  agencies: Agency[];
  value: string;
  onChange: (name: string) => void;
  hasError?: boolean;
}

const matches = (agency: Agency, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [agency.name, agency.department, agency.province, agency.district, agency.address, agency.reference, agency.phone, agency.schedule]
    .some((field) => (field ?? "").toLowerCase().includes(q));
};

const AgencyCard = ({ agency, onClick }: { agency: Agency; onClick?: () => void }) => (
  <div
    onClick={onClick}
    className={cn(
      "border border-border rounded-lg p-4 bg-card",
      onClick && "cursor-pointer hover:border-primary/50 transition-colors"
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <h4 className="font-medium text-sm">{agency.name}</h4>
      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
        Disponible
      </span>
    </div>
    <p className="text-xs font-medium text-primary uppercase tracking-wide mt-1">
      {agency.department} · {agency.district}
    </p>
    {agency.address && <p className="text-sm mt-2">{agency.address}</p>}
    {agency.reference && <p className="text-sm italic text-muted-foreground mt-1">Ref: {agency.reference}</p>}
    {(agency.phone || agency.schedule) && (
      <div className="border-t border-border mt-3 pt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {agency.phone && (
          <span>Tel: <span className="font-medium text-foreground">{agency.phone}</span></span>
        )}
        {agency.schedule && (
          <span>L-S: <span className="font-medium text-foreground">{agency.schedule}</span></span>
        )}
      </div>
    )}
  </div>
);

const AgencyPicker = ({ agencies, value, onChange, hasError }: AgencyPickerProps) => {
  const [isSearching, setIsSearching] = useState(!value);
  const [query, setQuery] = useState("");

  const selected = agencies.find((a) => a.name === value);

  if (selected && !isSearching) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={errorLabelClass(hasError)}>Sede de recojo (Shalom) *</label>
          <button
            type="button"
            onClick={() => { setIsSearching(true); setQuery(""); }}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Pencil className="w-3 h-3" /> Cambiar sede
          </button>
        </div>
        <AgencyCard agency={selected} />
      </div>
    );
  }

  const filtered = agencies.filter((a) => matches(a, query));

  return (
    <div>
      <label className={errorLabelClass(hasError)}>Sede de recojo (Shalom) *</label>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Busca por nombre, distrito, dirección, teléfono..."
        className={errorInputClass(hasError)}
        autoFocus={!!value}
      />
      <div className="mt-2 max-h-80 overflow-y-auto space-y-2 pr-1">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No se encontró ninguna sede con ese texto.</p>
        )}
        {filtered.map((agency) => (
          <AgencyCard
            key={agency.id}
            agency={agency}
            onClick={() => { onChange(agency.name); setIsSearching(false); }}
          />
        ))}
      </div>
    </div>
  );
};

export default AgencyPicker;
