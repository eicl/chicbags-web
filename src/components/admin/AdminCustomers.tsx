import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  fetchCustomers, createCustomer, updateCustomer, deleteCustomer, fetchDistricts, createDistrict, fetchAgencies,
  Customer, CustomerInput, DeliveryType, DeliveryMode,
} from "@/lib/api";
import { PERU_DEPARTMENTS, PERU_LOCATIONS } from "@/lib/peru-locations";
import { errorLabelClass, errorInputClass, cn } from "@/lib/utils";
import AgencyPicker from "@/components/AgencyPicker";

const DOCUMENT_TYPES = ["DNI", "Carné de Extranjería", "Pasaporte", "RUC"];
const DELIVERY_TYPES: DeliveryType[] = ["Motorizado Express", "Motorizado Rango Horario", "Shalom", "Olva", "Marvisur"];
const DELIVERY_MODE_REQUIRED: DeliveryType[] = ["Shalom", "Olva"];
const DELIVERY_MODES: DeliveryMode[] = ["Terrestre", "Aéreo"];
// Solo Shalom tiene sedes cargadas por ahora.
const AGENCY_REQUIRED: DeliveryType[] = ["Shalom"];

const emptyForm: CustomerInput = {
  documentType: "DNI",
  documentNumber: "",
  firstName: "",
  paternalSurname: "",
  maternalSurname: "",
  mobile: "",
  department: "",
  province: "",
  district: "",
  deliveryType: "Motorizado Express",
  deliveryMode: null,
  agency: "",
};

const AdminCustomers = () => {
  const queryClient = useQueryClient();
  const { data: customers = [], isLoading, isError } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customers"] });
  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      invalidate();
      toast.success("Cliente registrado");
      setIsAdding(false);
      setForm(emptyForm);
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CustomerInput }) => updateCustomer(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Cliente actualizado");
      setEditingId(null);
      setForm(emptyForm);
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      invalidate();
      toast.success("Cliente eliminado");
    },
    onError,
  });

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setForm(emptyForm);
    setAttemptedSubmit(false);
  };

  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setIsAdding(false);
    setAttemptedSubmit(false);
    setForm({
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      firstName: customer.firstName,
      paternalSurname: customer.paternalSurname,
      maternalSurname: customer.maternalSurname,
      mobile: customer.mobile,
      department: customer.department,
      province: customer.province,
      district: customer.district,
      deliveryType: customer.deliveryType,
      deliveryMode: customer.deliveryMode,
      agency: customer.agency,
    });
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setAttemptedSubmit(false);
  };

  const needsDeliveryMode = DELIVERY_MODE_REQUIRED.includes(form.deliveryType);
  const needsAgency = AGENCY_REQUIRED.includes(form.deliveryType);
  // El tipo de delivery se elige al final: no se puede tocar hasta llenar
  // todos los campos anteriores.
  const canPickDeliveryType = Boolean(
    form.documentNumber.trim() && form.firstName.trim() && form.paternalSurname.trim() &&
    form.mobile.trim() && form.department && form.province && form.district.trim()
  );

  const { data: agencies = [] } = useQuery({
    queryKey: ["agencies", form.deliveryType],
    queryFn: () => fetchAgencies(form.deliveryType),
    enabled: needsAgency,
  });

  const REQUIRED_FIELD_LABELS: Record<string, string> = {
    documentNumber: "Número de documento",
    firstName: "Nombres",
    paternalSurname: "Apellido paterno",
    mobile: "Celular",
    department: "Departamento",
    province: "Provincia",
    district: "Distrito",
    deliveryMode: "Vía de envío (terrestre/aéreo)",
    agency: "Sede",
  };

  const getMissingFields = () => {
    const missing: string[] = [];
    if (!form.documentNumber.trim()) missing.push("documentNumber");
    if (!form.firstName.trim()) missing.push("firstName");
    if (!form.paternalSurname.trim()) missing.push("paternalSurname");
    if (!form.mobile.trim()) missing.push("mobile");
    if (!form.department) missing.push("department");
    if (!form.province) missing.push("province");
    if (!form.district.trim()) missing.push("district");
    if (needsDeliveryMode && !form.deliveryMode) missing.push("deliveryMode");
    if (needsAgency && !form.agency.trim()) missing.push("agency");
    return missing;
  };

  const missingFields = attemptedSubmit ? getMissingFields() : [];
  const hasError = (field: string) => missingFields.includes(field);

  const handleSave = () => {
    const missing = getMissingFields();
    if (missing.length > 0) {
      setAttemptedSubmit(true);
      toast.error(`Faltan campos obligatorios: ${missing.map((f) => REQUIRED_FIELD_LABELS[f]).join(", ")}`);
      return;
    }
    const payload: CustomerInput = {
      ...form,
      deliveryMode: needsDeliveryMode ? form.deliveryMode : null,
      agency: needsAgency ? form.agency.trim() : "",
    };

    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (customer: Customer) => {
    if (!confirm(`¿Eliminar al cliente "${customer.firstName} ${customer.paternalSurname}"?`)) return;
    deleteMutation.mutate(customer.id);
  };

  const provinces = form.department ? PERU_LOCATIONS[form.department] ?? [] : [];

  const { data: districts = [] } = useQuery({
    queryKey: ["districts", form.province],
    queryFn: () => fetchDistricts(form.province),
    enabled: !!form.province,
  });

  const addDistrictMutation = useMutation({
    mutationFn: (n: string) => createDistrict(form.province, n),
    onSuccess: (district) => {
      queryClient.invalidateQueries({ queryKey: ["districts", form.province] });
      setForm((prev) => ({ ...prev, district: district.name }));
    },
    onError,
  });

  const handleAddDistrict = () => {
    const n = prompt(`Nuevo distrito en ${form.province}:`)?.trim();
    if (n) addDistrictMutation.mutate(n);
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar cliente
        </Button>
      </div>

      {(isAdding || editingId !== null) && (
        <div className="mb-8 p-6 border border-border rounded-lg bg-card">
          {editingId !== null ? (
            <span className="inline-block mb-3 px-3 py-1.5 rounded-md bg-primary/10 text-primary font-semibold text-sm tracking-wide">
              Código de cliente: #{editingId}
            </span>
          ) : (
            <span className="inline-block mb-3 px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-sm">
              El código de cliente se asigna automáticamente al guardar
            </span>
          )}
          <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
            {editingId !== null ? "Editar cliente" : "Nuevo cliente"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Tipo de documento *</label>
              <select
                value={form.documentType}
                onChange={(e) => setForm({ ...form, documentType: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={errorLabelClass(hasError("documentNumber"))}>Número de documento *</label>
              <Input
                value={form.documentNumber}
                onChange={(e) => setForm({ ...form, documentNumber: e.target.value })}
                placeholder="12345678"
                className={errorInputClass(hasError("documentNumber"))}
              />
            </div>
            <div>
              <label className={errorLabelClass(hasError("firstName"))}>Nombres *</label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="María José"
                className={errorInputClass(hasError("firstName"))}
              />
            </div>
            <div>
              <label className={errorLabelClass(hasError("paternalSurname"))}>Apellido paterno *</label>
              <Input
                value={form.paternalSurname}
                onChange={(e) => setForm({ ...form, paternalSurname: e.target.value })}
                placeholder="García"
                className={errorInputClass(hasError("paternalSurname"))}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Apellido materno</label>
              <Input value={form.maternalSurname} onChange={(e) => setForm({ ...form, maternalSurname: e.target.value })} placeholder="López" />
            </div>
            <div>
              <label className={errorLabelClass(hasError("mobile"))}>Celular *</label>
              <Input
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                placeholder="987654321"
                className={errorInputClass(hasError("mobile"))}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">País</label>
              <Input value="Perú" disabled />
            </div>
            <div>
              <label className={errorLabelClass(hasError("department"))}>Departamento *</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value, province: "" })}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  errorInputClass(hasError("department"))
                )}
              >
                <option value="">Selecciona...</option>
                {PERU_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={errorLabelClass(hasError("province"))}>Provincia *</label>
              <select
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value, district: "" })}
                disabled={!form.department}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                  errorInputClass(hasError("province"))
                )}
              >
                <option value="">Selecciona...</option>
                {provinces.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={errorLabelClass(hasError("district"))}>Distrito *</label>
              <div className="flex gap-2">
                <select
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  disabled={!form.province}
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    errorInputClass(hasError("district"))
                  )}
                >
                  <option value="">{form.province ? "Selecciona..." : "Elige antes la provincia"}</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
                <Button type="button" variant="outline" size="icon" onClick={handleAddDistrict} disabled={!form.province} className="shrink-0" title="Agregar distrito nuevo">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Tipo de delivery *
                {!canPickDeliveryType && (
                  <span className="text-xs font-normal text-destructive"> — completa los datos anteriores primero</span>
                )}
              </label>
              <select
                value={form.deliveryType}
                disabled={!canPickDeliveryType}
                onChange={(e) => {
                  const deliveryType = e.target.value as DeliveryType;
                  setForm({
                    ...form,
                    deliveryType,
                    deliveryMode: DELIVERY_MODE_REQUIRED.includes(deliveryType) ? form.deliveryMode ?? "Terrestre" : null,
                  });
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {DELIVERY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {needsDeliveryMode && (
              <div>
                <label className={errorLabelClass(hasError("deliveryMode"))}>Vía de envío *</label>
                <div className="flex gap-2 h-10 items-center">
                  {DELIVERY_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setForm({ ...form, deliveryMode: mode })}
                      className={cn(
                        "px-4 py-2 rounded-md border text-sm transition-colors",
                        form.deliveryMode === mode
                          ? "border-primary bg-primary/10 text-foreground"
                          : hasError("deliveryMode")
                          ? "border-destructive text-muted-foreground"
                          : "border-input text-muted-foreground hover:border-muted-foreground/50"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {needsAgency && (
              <div className="md:col-span-3">
                <AgencyPicker
                  agencies={agencies}
                  value={form.agency}
                  onChange={(agency) => setForm({ ...form, agency })}
                  hasError={hasError("agency")}
                  province={form.province}
                  district={form.district}
                />
              </div>
            )}
          </div>
          <div className="flex gap-3">
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
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Código</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Documento</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Nombre</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Celular</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Ubicación</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Delivery</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-primary">#{customer.id}</td>
                  <td className="py-3 px-4 text-sm">
                    <div className="text-muted-foreground text-xs">{customer.documentType}</div>
                    {customer.documentNumber}
                  </td>
                  <td className="py-3 px-4 font-medium">
                    {customer.firstName} {customer.paternalSurname} {customer.maternalSurname}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-sm">{customer.mobile}</td>
                  <td className="py-3 px-4 text-muted-foreground text-sm">{customer.district}, {customer.province}, {customer.department}</td>
                  <td className="py-3 px-4 text-muted-foreground text-sm">
                    {customer.deliveryType}
                    {customer.deliveryMode && <span> ({customer.deliveryMode})</span>}
                    {customer.agency && <div className="text-xs">Sede: {customer.agency}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(customer)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">Cargando clientes...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && customers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">No hay clientes registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminCustomers;
