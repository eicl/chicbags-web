import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { CheckCircle2, Info, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useCustomerAuth } from "@/context/CustomerAuthContext";
import { fetchDistricts, fetchAgencies, CustomerInput, DeliveryType, DeliveryMode } from "@/lib/api";
import { PERU_DEPARTMENTS, PERU_LOCATIONS, isLimaMetroProvince } from "@/lib/peru-locations";
import { errorLabelClass, errorInputClass, cn } from "@/lib/utils";
import AgencyPicker from "@/components/AgencyPicker";

const DOCUMENT_TYPES = ["DNI", "Carné de Extranjería", "Pasaporte", "RUC"];
const DELIVERY_TYPES: DeliveryType[] = ["Shalom", "Motorizado Express", "Motorizado Delivery", "Motorizado Cliente", "Olva", "Marvisur"];
// Los motorizados propios solo reparten en Lima o Callao (misma área
// metropolitana); en el resto del país solo hay envío por agencia
// (Shalom/Olva/Marvisur).
const LIMA_ONLY_DELIVERY_TYPES: DeliveryType[] = ["Motorizado Express", "Motorizado Delivery", "Motorizado Cliente"];
const DELIVERY_MODE_REQUIRED: DeliveryType[] = ["Shalom", "Olva"];
const DELIVERY_MODES: DeliveryMode[] = ["Terrestre", "Aéreo"];
const AGENCY_REQUIRED: DeliveryType[] = ["Shalom"];
const ADDRESS_REQUIRED: DeliveryType[] = ["Motorizado Express", "Motorizado Delivery"];

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
  address: "",
  differentReceiver: false,
  receiverDocumentType: "",
  receiverDocumentNumber: "",
  receiverFirstName: "",
  receiverPaternalSurname: "",
  receiverMaternalSurname: "",
  receiverMobile: "",
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
  address: "Dirección",
  password: "Contraseña",
  confirmPassword: "Confirmar contraseña",
};

const CustomerAccountRegister = () => {
  const navigate = useNavigate();
  const { register, customer } = useCustomerAuth();
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  const needsDeliveryMode = DELIVERY_MODE_REQUIRED.includes(form.deliveryType);
  const needsAgency = AGENCY_REQUIRED.includes(form.deliveryType);
  const needsAddress = ADDRESS_REQUIRED.includes(form.deliveryType);
  const canPickDeliveryType = Boolean(
    form.documentNumber.trim() && form.firstName.trim() && form.paternalSurname.trim() &&
    form.mobile.trim() && form.department && form.province && form.district.trim()
  );

  const { data: agencies = [] } = useQuery({
    queryKey: ["agencies", form.deliveryType],
    queryFn: () => fetchAgencies(form.deliveryType),
    enabled: needsAgency,
  });

  const provinces = form.department ? PERU_LOCATIONS[form.department] ?? [] : [];
  const availableDeliveryTypes = DELIVERY_TYPES.filter(
    (t) => isLimaMetroProvince(form.province) || !LIMA_ONLY_DELIVERY_TYPES.includes(t) || t === form.deliveryType
  );
  const { data: districts = [] } = useQuery({
    queryKey: ["districts", form.province],
    queryFn: () => fetchDistricts(form.province),
    enabled: !!form.province,
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
    if (needsAddress && !form.address.trim()) missing.push("address");
    if (!password || password.length < 6) missing.push("password");
    if (password !== confirmPassword) missing.push("confirmPassword");
    return missing;
  };

  const missingFields = attemptedSubmit ? getMissingFields() : [];
  const hasError = (field: string) => missingFields.includes(field);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = getMissingFields();
    if (missing.length > 0) {
      setAttemptedSubmit(true);
      if (missing.includes("password") && password && password.length < 6) {
        toast.error("La contraseña debe tener al menos 6 caracteres");
      } else if (missing.includes("confirmPassword") && password) {
        toast.error("Las contraseñas no coinciden");
      } else {
        toast.error(`Faltan campos obligatorios: ${missing.map((f) => REQUIRED_FIELD_LABELS[f]).join(", ")}`);
      }
      return;
    }
    const payload = {
      ...form,
      deliveryMode: needsDeliveryMode ? form.deliveryMode : null,
      agency: needsAgency ? form.agency.trim() : "",
      address: needsAddress ? form.address.trim() : "",
      password,
    };
    setIsSubmitting(true);
    try {
      await register(payload);
      setRegistered(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (registered && customer) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 flex flex-col items-center text-center gap-6 max-w-lg">
          <CheckCircle2 className="w-14 h-14 text-primary" />
          <h1 className="text-2xl md:text-3xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            ¡Cuenta creada!
          </h1>
          <p className="text-muted-foreground">
            Gracias, {customer.firstName}. Ya iniciaste sesión — ahora puedes dejar tu valoración desde la página de inicio.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => navigate("/")}>Ir al inicio</Button>
          </div>
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
            Crea tu cuenta
          </h1>
          <p className="text-muted-foreground">
            Completa tus datos y elige una contraseña para iniciar sesión y dejar tus valoraciones.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            ¿Ya tienes cuenta? <Link to="/mi-cuenta/ingresar" className="text-primary hover:underline">Inicia sesión aquí</Link>
          </p>
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
                onChange={(e) => {
                  const province = e.target.value;
                  const resetDeliveryType = !isLimaMetroProvince(province) && LIMA_ONLY_DELIVERY_TYPES.includes(form.deliveryType);
                  setForm({
                    ...form,
                    province,
                    district: "",
                    deliveryType: resetDeliveryType ? "Shalom" : form.deliveryType,
                    deliveryMode: resetDeliveryType ? "Terrestre" : form.deliveryMode,
                  });
                }}
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
                {availableDeliveryTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {form.province && !isLimaMetroProvince(form.province) && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Fuera de Lima o Callao solo hay envío por agencia (Shalom, Olva o Marvisur).
                </p>
              )}
              {form.deliveryType === "Motorizado Express" && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Para saber el costo de tu envío, cotiza indicando tu ubicación actual.
                </p>
              )}
              {form.deliveryType === "Motorizado Delivery" && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Entregas al día siguiente en el rango horario de 11:00 AM a 9:00 PM. Envía tu ubicación actual.
                </p>
              )}
              {form.deliveryType === "Motorizado Cliente" && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Tú envías a tu propio motorizado a recoger el pedido en nuestro punto de atención en Lima — no hace falta dirección de entrega.
                </p>
              )}
            </div>
            {needsAddress && (
              <div className="md:col-span-2">
                <label className={errorLabelClass(hasError("address"))}>Dirección de entrega *</label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Av. / Jr. / Calle, número, referencia..."
                  className={errorInputClass(hasError("address"))}
                />
              </div>
            )}
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
            <div>
              <label className={errorLabelClass(hasError("password"))}>Contraseña *</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className={errorInputClass(hasError("password"))}
              />
            </div>
            <div>
              <label className={errorLabelClass(hasError("confirmPassword"))}>Confirmar contraseña *</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
                className={errorInputClass(hasError("confirmPassword"))}
              />
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full py-6 text-sm tracking-widest uppercase gap-2">
            <Save className="w-4 h-4" /> {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CustomerAccountRegister;
