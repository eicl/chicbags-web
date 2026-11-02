import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Search, X, Save, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchAgenciesAdmin, createAgency, updateAgency, Agency, AgencyInput } from "@/lib/api";
import { errorLabelClass, errorInputClass } from "@/lib/utils";
import Pagination from "@/components/admin/Pagination";

const PAGE_SIZE = 20;
const PROVIDER = "Shalom";

const EMPTY_FORM: AgencyInput = {
  provider: PROVIDER,
  name: "",
  department: "",
  province: "",
  district: "",
  address: "",
  reference: "",
  phone: "",
  schedule: "",
};

// Mantenimiento de sedes de Shalom usadas en el registro de clientes
// (AgencyPicker). Mismo patrón que AdminUbicaciones/AdminDistricts. El
// "borrado" es lógico (columna active): una sede desactivada deja de
// ofrecerse a clientes nuevos pero no se borra, porque clientes/pedidos ya
// guardan su nombre como texto plano.
const AdminAgencias = () => {
  const queryClient = useQueryClient();
  const { data: agencies = [], isLoading, isError } = useQuery({
    queryKey: ["agenciesAdmin", PROVIDER],
    queryFn: () => fetchAgenciesAdmin(PROVIDER),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AgencyInput>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const nameError = attemptedSubmit && !form.name.trim();
  const districtError = attemptedSubmit && !form.district.trim();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["agenciesAdmin", PROVIDER] });
    queryClient.invalidateQueries({ queryKey: ["agencies"] });
  };

  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const createMutation = useMutation({
    mutationFn: createAgency,
    onSuccess: () => {
      invalidate();
      toast.success("Sede agregada");
      setIsAdding(false);
      setForm(EMPTY_FORM);
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: updateAgency,
    onSuccess: () => {
      invalidate();
      toast.success("Sede actualizada");
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
    onError,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: updateAgency,
    onSuccess: (agency) => {
      invalidate();
      toast.success(agency.active ? "Sede activada" : "Sede desactivada");
    },
    onError,
  });

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAttemptedSubmit(false);
  };

  const handleEdit = (agency: Agency) => {
    setEditingId(agency.id);
    setIsAdding(false);
    setForm({
      provider: agency.provider,
      name: agency.name,
      department: agency.department,
      province: agency.province,
      district: agency.district,
      address: agency.address,
      reference: agency.reference,
      phone: agency.phone,
      schedule: agency.schedule,
    });
    setAttemptedSubmit(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAttemptedSubmit(false);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.district.trim()) {
      setAttemptedSubmit(true);
      toast.error("Faltan campos obligatorios");
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleToggleActive = (agency: Agency) => {
    const verb = agency.active ? "desactivar" : "activar";
    if (!confirm(`¿${verb === "activar" ? "Activar" : "Desactivar"} la sede "${agency.name}"?`)) return;
    toggleActiveMutation.mutate({ id: agency.id, active: !agency.active });
  };

  const filteredAgencies = agencies.filter((a) =>
    [a.name, a.department, a.province, a.district, a.address, a.phone].some((f) =>
      f.toLowerCase().includes(query.trim().toLowerCase())
    )
  );
  const totalPages = Math.max(1, Math.ceil(filteredAgencies.length / PAGE_SIZE));
  const pageAgencies = filteredAgencies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const set = <K extends keyof AgencyInput>(key: K) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-6">
        Sedes de Shalom disponibles al elegir esa agencia como tipo de delivery en el registro de clientes.
        Desactivar una sede la oculta para clientes nuevos sin borrar su historial.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => handleQueryChange(e.target.value)} placeholder="Buscar sede..." className="pl-9" />
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar sede
        </Button>
      </div>

      {(isAdding || editingId !== null) && (
        <div className="mb-8 p-6 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
            {editingId !== null ? "Editar sede" : "Nueva sede"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={errorLabelClass(nameError)}>Nombre *</label>
              <Input value={form.name} onChange={(e) => set("name")(e.target.value)} autoFocus className={errorInputClass(nameError)} />
            </div>
            <div>
              <label className={errorLabelClass(districtError)}>Distrito *</label>
              <Input value={form.district} onChange={(e) => set("district")(e.target.value)} className={errorInputClass(districtError)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Departamento</label>
              <Input value={form.department} onChange={(e) => set("department")(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Provincia</label>
              <Input value={form.province} onChange={(e) => set("province")(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm text-muted-foreground mb-1 block">Dirección</label>
              <Input value={form.address} onChange={(e) => set("address")(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm text-muted-foreground mb-1 block">Referencia</label>
              <Input value={form.reference} onChange={(e) => set("reference")(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Teléfono</label>
              <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Horario</label>
              <Input value={form.schedule} onChange={(e) => set("schedule")(e.target.value)} placeholder="L-S 9am-8pm" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleSave} className="gap-2"><Save className="w-4 h-4" /> Guardar</Button>
            <Button variant="outline" onClick={handleCancel} className="gap-2"><X className="w-4 h-4" /> Cancelar</Button>
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Nombre</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Ubicación</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Dirección</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Estado</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageAgencies.map((agency) => (
                <tr key={agency.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-medium">{agency.name}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {agency.department} · {agency.district}
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{agency.address}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        agency.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {agency.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(agency)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(agency)}
                        className={agency.active ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}
                        title={agency.active ? "Desactivar sede" : "Activar sede"}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">Cargando sedes...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && filteredAgencies.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    {agencies.length === 0 ? "No hay sedes. Agrega una nueva." : "Ninguna sede coincide con la búsqueda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
};

export default AdminAgencias;
