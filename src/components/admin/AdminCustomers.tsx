import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  fetchCustomers, createCustomer, updateCustomer, deleteCustomer,
  Customer, CustomerInput, DeliveryType, DeliveryMode,
} from "@/lib/api";
import { PERU_DEPARTMENTS, PERU_LOCATIONS } from "@/lib/peru-locations";

const DOCUMENT_TYPES = ["DNI", "Carné de Extranjería", "Pasaporte", "RUC"];
const DELIVERY_TYPES: DeliveryType[] = ["Motorizado Express", "Motorizado Rango Horario", "Shalom", "Olva", "Marvisur"];
const DELIVERY_MODE_REQUIRED: DeliveryType[] = ["Shalom", "Olva"];
const DELIVERY_MODES: DeliveryMode[] = ["Terrestre", "Aéreo"];

const emptyForm: CustomerInput = {
  email: "",
  documentType: "DNI",
  documentNumber: "",
  firstName: "",
  paternalSurname: "",
  maternalSurname: "",
  mobile: "",
  department: "",
  province: "",
  deliveryType: "Motorizado Express",
  deliveryMode: null,
};

const AdminCustomers = () => {
  const queryClient = useQueryClient();
  const { data: customers = [], isLoading, isError } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerInput>(emptyForm);

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
  };

  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setIsAdding(false);
    setForm({
      email: customer.email,
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      firstName: customer.firstName,
      paternalSurname: customer.paternalSurname,
      maternalSurname: customer.maternalSurname,
      mobile: customer.mobile,
      department: customer.department,
      province: customer.province,
      deliveryType: customer.deliveryType,
      deliveryMode: customer.deliveryMode,
    });
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const needsDeliveryMode = DELIVERY_MODE_REQUIRED.includes(form.deliveryType);

  const handleSave = () => {
    if (
      !form.email.trim() || !form.documentNumber.trim() || !form.firstName.trim() ||
      !form.paternalSurname.trim() || !form.mobile.trim() || !form.department || !form.province
    ) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    if (needsDeliveryMode && !form.deliveryMode) {
      toast.error("Selecciona si el envío es terrestre o aéreo");
      return;
    }
    const payload: CustomerInput = { ...form, deliveryMode: needsDeliveryMode ? form.deliveryMode : null };

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
              <label className="text-sm text-muted-foreground mb-1 block">Correo *</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="cliente@correo.com" />
            </div>
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
              <label className="text-sm text-muted-foreground mb-1 block">Número de documento *</label>
              <Input value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} placeholder="12345678" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nombres *</label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="María José" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Apellido paterno *</label>
              <Input value={form.paternalSurname} onChange={(e) => setForm({ ...form, paternalSurname: e.target.value })} placeholder="García" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Apellido materno</label>
              <Input value={form.maternalSurname} onChange={(e) => setForm({ ...form, maternalSurname: e.target.value })} placeholder="López" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Celular *</label>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="987654321" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">País</label>
              <Input value="Perú" disabled />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Departamento *</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value, province: "" })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Selecciona...</option>
                {PERU_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Provincia *</label>
              <select
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
                disabled={!form.department}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Selecciona...</option>
                {provinces.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Tipo de delivery *</label>
              <select
                value={form.deliveryType}
                onChange={(e) => {
                  const deliveryType = e.target.value as DeliveryType;
                  setForm({
                    ...form,
                    deliveryType,
                    deliveryMode: DELIVERY_MODE_REQUIRED.includes(deliveryType) ? form.deliveryMode ?? "Terrestre" : null,
                  });
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {DELIVERY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {needsDeliveryMode && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Vía de envío *</label>
                <div className="flex gap-2 h-10 items-center">
                  {DELIVERY_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setForm({ ...form, deliveryMode: mode })}
                      className={`px-4 py-2 rounded-md border text-sm transition-colors ${
                        form.deliveryMode === mode
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-input text-muted-foreground hover:border-muted-foreground/50"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
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
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Correo</th>
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
                  <td className="py-3 px-4 text-muted-foreground text-sm">{customer.email}</td>
                  <td className="py-3 px-4 text-muted-foreground text-sm">{customer.province}, {customer.department}</td>
                  <td className="py-3 px-4 text-muted-foreground text-sm">
                    {customer.deliveryType}
                    {customer.deliveryMode && <span> ({customer.deliveryMode})</span>}
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
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">Cargando clientes...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && customers.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">No hay clientes registrados.</td>
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
