import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import {
  registerCustomer, fetchDistricts, fetchAgencies, Customer, CustomerInput, DeliveryType, DeliveryMode,
} from "@/lib/api";
import { PERU_DEPARTMENTS, PERU_LOCATIONS } from "@/lib/peru-locations";
import { errorLabelClass, errorInputClass, cn } from "@/lib/utils";

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

// Lleva al cliente de vuelta al chat de WhatsApp de la empresa con su
// código ya redactado en el mensaje — solo debe darle Enviar.
const COMPANY_WHATSAPP_NUMBER = "51914104629";
const buildRegistrationWhatsAppLink = (customer: Customer) => {
  const message = `Hola, soy ${customer.firstName} ${customer.paternalSurname}, acabo de registrarme. Mi código de cliente es #${customer.id}.`;
  return `https://wa.me/${COMPANY_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
};

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

const CustomerRegister = () => {
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [registered, setRegistered] = useState<Customer | null>(null);

  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const registerMutation = useMutation({
    mutationFn: registerCustomer,
    onSuccess: (customer) => setRegistered(customer),
    onError,
  });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    registerMutation.mutate(payload);
  };

  const provinces = form.department ? PERU_LOCATIONS[form.department] ?? [] : [];

  const { data: districts = [] } = useQuery({
    queryKey: ["districts", form.province],
    queryFn: () => fetchDistricts(form.province),
    enabled: !!form.province,
  });

  if (registered) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 flex flex-col items-center text-center gap-6 max-w-lg">
          <CheckCircle2 className="w-14 h-14 text-primary" />
          <h1 className="text-2xl md:text-3xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            ¡Registro exitoso!
          </h1>
          <p className="text-muted-foreground">
            Gracias, {registered.firstName}. Guarda tu código de cliente, lo puede pedir nuestro equipo para atenderte más rápido.
          </p>
          <span className="inline-block px-4 py-2 rounded-md bg-primary/10 text-primary font-semibold text-lg tracking-wide">
            Código de cliente: #{registered.id}
          </span>
          <a
            href={buildRegistrationWhatsAppLink(registered)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-white font-medium transition-transform hover:scale-105"
            style={{ backgroundColor: "#25D366" }}
          >
            <MessageCircle className="w-5 h-5" fill="white" />
            Volver al chat de WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 md:px-8 py-8 md:py-12 max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-medium mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Regístrate como cliente
          </h1>
          <p className="text-muted-foreground">Completa tus datos para que podamos atenderte y coordinar tus envíos.</p>
        </div>

        <form onSubmit={handleSubmit} className="border border-border rounded-lg p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <Input
                value={form.maternalSurname}
                onChange={(e) => setForm({ ...form, maternalSurname: e.target.value })}
                placeholder="López"
              />
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
              <div className="md:col-span-2">
                <label className={errorLabelClass(hasError("agency"))}>Sede de recojo (Shalom) *</label>
                <Input
                  value={form.agency}
                  onChange={(e) => setForm({ ...form, agency: e.target.value })}
                  placeholder="Escribe para filtrar por nombre de sede..."
                  list="agency-options"
                  className={errorInputClass(hasError("agency"))}
                />
                <datalist id="agency-options">
                  {agencies.map((a) => (
                    <option key={a.id} value={a.name}>{a.district}</option>
                  ))}
                </datalist>
              </div>
            )}
          </div>

          <Button type="submit" disabled={registerMutation.isPending} className="w-full py-6 text-sm tracking-widest uppercase gap-2">
            <Save className="w-4 h-4" /> {registerMutation.isPending ? "Registrando..." : "Registrarme"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CustomerRegister;
