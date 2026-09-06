import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Info, MapPin, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import {
  registerCustomer, requestMobileVerification, confirmMobileVerification, lookupDni,
  fetchDistricts, fetchAgencies, Customer, CustomerInput, DeliveryType, DeliveryMode,
} from "@/lib/api";
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
// Solo Shalom tiene sedes cargadas por ahora.
const AGENCY_REQUIRED: DeliveryType[] = ["Shalom"];
// Los tipos "motorizado" reparten a domicilio, así que piden dirección.
const ADDRESS_REQUIRED: DeliveryType[] = ["Motorizado Express", "Motorizado Delivery"];
// El DNI peruano siempre tiene 8 dígitos — a diferencia de Carné de
// Extranjería/Pasaporte/RUC, que no tienen un formato fijo acá.
const DNI_REGEX = /^\d{8}$/;
const isInvalidDni = (documentType: string, documentNumber: string) =>
  documentType === "DNI" && documentNumber.trim() !== "" && !DNI_REGEX.test(documentNumber.trim());
// El celular peruano siempre tiene 9 dígitos y empieza en 9 — mismo formato
// que ya se pide en el placeholder del campo Celular.
const PERU_MOBILE_REGEX = /^9\d{8}$/;

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
  locationLat: null,
  locationLng: null,
  differentReceiver: false,
  receiverDocumentType: "DNI",
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
  receiverDocumentNumber: "Número de documento de quién recepciona",
  receiverFirstName: "Nombres de quién recepciona",
  receiverPaternalSurname: "Apellido paterno de quién recepciona",
  receiverMobile: "Celular de quién recepciona",
  mobileVerification: "Verificación del celular (código de WhatsApp)",
};

const CustomerRegister = () => {
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [registered, setRegistered] = useState<Customer | null>(null);
  const [locating, setLocating] = useState(false);

  // Verificación de celular por PIN de WhatsApp. verifiedMobile/codeSentFor
  // guardan el celular exacto al que corresponden — si el cliente edita el
  // campo después, dejan de calzar con trimmedMobile y el estado se
  // considera automáticamente inválido (sin necesidad de resetearlo a mano).
  const [verifiedMobile, setVerifiedMobile] = useState<string | null>(null);
  const [codeSentFor, setCodeSentFor] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  // Con DNI, nombres y apellidos se completan solo por la consulta a
  // migo.pe/RENIEC (ver dniLookupMutation más abajo) — quedan de solo
  // lectura para que no se desincronicen del documento. Con Carné de
  // Extranjería/Pasaporte/RUC no hay ese servicio, así que siguen editables.
  const isDniDocument = form.documentType === "DNI";
  const trimmedMobile = form.mobile.trim();
  const mobileVerified = verifiedMobile !== null && verifiedMobile === trimmedMobile;
  const codeSent = codeSentFor !== null && codeSentFor === trimmedMobile;

  const requestVerificationMutation = useMutation({
    mutationFn: () => requestMobileVerification(trimmedMobile),
    onSuccess: () => {
      setCodeSentFor(trimmedMobile);
      setPin("");
      setResendSeconds(60);
      toast.success("Te enviamos un código por WhatsApp");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal"),
  });

  const confirmVerificationMutation = useMutation({
    mutationFn: () => confirmMobileVerification(trimmedMobile, pin),
    onSuccess: () => {
      setVerifiedMobile(trimmedMobile);
      setCodeSentFor(null);
      setPin("");
      toast.success("Celular verificado");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal"),
  });

  // Autocompletado de nombres por DNI: se dispara al salir del campo de
  // documento (onBlur), solo para DNI (Carné/Pasaporte/RUC no calzan con
  // este servicio). Si no encuentra nada, limpia los 3 campos — si venían
  // llenos de una consulta anterior (para otro DNI), dejarlos puestos
  // sugeriría falsamente que corresponden al número actual.
  const dniLookupMutation = useMutation({
    mutationFn: () => lookupDni(form.documentNumber.trim()),
    onSuccess: (r) => setForm((f) => ({ ...f, firstName: r.firstName, paternalSurname: r.paternalSurname, maternalSurname: r.maternalSurname })),
    onError: () => {
      toast.error("No se encontró información para ese DNI, complétalo manualmente");
      setForm((f) => ({ ...f, firstName: "", paternalSurname: "", maternalSurname: "" }));
    },
  });
  const handleDocumentNumberBlur = () => {
    if (form.documentType === "DNI" && DNI_REGEX.test(form.documentNumber.trim())) {
      dniLookupMutation.mutate();
    }
  };

  // Los tipos de delivery "motorizado" reparten a domicilio, así que además
  // de la dirección piden la ubicación GPS actual del cliente.
  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Tu navegador no soporta compartir tu ubicación");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((f) => ({ ...f, locationLat: position.coords.latitude, locationLng: position.coords.longitude }));
        setLocating(false);
        toast.success("Ubicación capturada");
      },
      () => {
        setLocating(false);
        toast.error("No se pudo obtener tu ubicación. Revisa los permisos de ubicación del navegador.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const registerMutation = useMutation({
    mutationFn: registerCustomer,
    onSuccess: (customer) => setRegistered(customer),
    onError,
  });

  const needsDeliveryMode = DELIVERY_MODE_REQUIRED.includes(form.deliveryType);
  const needsAgency = AGENCY_REQUIRED.includes(form.deliveryType);
  const needsAddress = ADDRESS_REQUIRED.includes(form.deliveryType);
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
    else if (!mobileVerified) missing.push("mobileVerification");
    if (!form.department) missing.push("department");
    if (!form.province) missing.push("province");
    if (!form.district.trim()) missing.push("district");
    if (needsDeliveryMode && !form.deliveryMode) missing.push("deliveryMode");
    if (needsAgency && !form.agency.trim()) missing.push("agency");
    if (needsAddress && !form.address.trim()) missing.push("address");
    if (form.differentReceiver) {
      if (!form.receiverDocumentNumber.trim()) missing.push("receiverDocumentNumber");
      if (!form.receiverFirstName.trim()) missing.push("receiverFirstName");
      if (!form.receiverPaternalSurname.trim()) missing.push("receiverPaternalSurname");
      if (!form.receiverMobile.trim()) missing.push("receiverMobile");
    }
    return missing;
  };

  const missingFields = attemptedSubmit ? getMissingFields() : [];
  const hasError = (field: string) =>
    missingFields.includes(field) ||
    (field === "mobile" && missingFields.includes("mobileVerification")) ||
    (attemptedSubmit && field === "documentNumber" && isInvalidDni(form.documentType, form.documentNumber)) ||
    (attemptedSubmit && field === "receiverDocumentNumber" && isInvalidDni(form.receiverDocumentType, form.receiverDocumentNumber));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = getMissingFields();
    if (missing.length > 0) {
      setAttemptedSubmit(true);
      toast.error(`Faltan campos obligatorios: ${missing.map((f) => REQUIRED_FIELD_LABELS[f]).join(", ")}`);
      return;
    }
    if (isInvalidDni(form.documentType, form.documentNumber)) {
      setAttemptedSubmit(true);
      toast.error("El DNI debe tener 8 dígitos");
      return;
    }
    if (form.differentReceiver && isInvalidDni(form.receiverDocumentType, form.receiverDocumentNumber)) {
      setAttemptedSubmit(true);
      toast.error("El DNI de quién recepciona debe tener 8 dígitos");
      return;
    }
    const payload: CustomerInput = {
      ...form,
      deliveryMode: needsDeliveryMode ? form.deliveryMode : null,
      agency: needsAgency ? form.agency.trim() : "",
      address: needsAddress ? form.address.trim() : "",
      locationLat: needsAddress ? form.locationLat : null,
      locationLng: needsAddress ? form.locationLng : null,
      receiverDocumentType: form.differentReceiver ? form.receiverDocumentType : "",
      receiverDocumentNumber: form.differentReceiver ? form.receiverDocumentNumber.trim() : "",
      receiverFirstName: form.differentReceiver ? form.receiverFirstName.trim() : "",
      receiverPaternalSurname: form.differentReceiver ? form.receiverPaternalSurname.trim() : "",
      receiverMaternalSurname: form.differentReceiver ? form.receiverMaternalSurname.trim() : "",
      receiverMobile: form.differentReceiver ? form.receiverMobile.trim() : "",
    };
    registerMutation.mutate(payload);
  };

  const provinces = form.department ? PERU_LOCATIONS[form.department] ?? [] : [];
  const availableDeliveryTypes = DELIVERY_TYPES.filter(
    (t) => isLimaMetroProvince(form.province) || !LIMA_ONLY_DELIVERY_TYPES.includes(t) || t === form.deliveryType
  );

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
          <p className="text-sm text-muted-foreground">
            Te enviamos un WhatsApp de bienvenida con tu código y el link para registrar tu pedido.
          </p>
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
                onBlur={handleDocumentNumberBlur}
                placeholder="12345678"
                className={errorInputClass(hasError("documentNumber"))}
              />
            </div>
            <div>
              <label className={errorLabelClass(hasError("firstName"))}>Nombres *</label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                readOnly={isDniDocument}
                placeholder="María José"
                className={cn(errorInputClass(hasError("firstName")), isDniDocument && "bg-muted/50 cursor-not-allowed")}
              />
            </div>
            <div>
              <label className={errorLabelClass(hasError("paternalSurname"))}>Apellido paterno *</label>
              <Input
                value={form.paternalSurname}
                onChange={(e) => setForm({ ...form, paternalSurname: e.target.value })}
                readOnly={isDniDocument}
                placeholder="García"
                className={cn(errorInputClass(hasError("paternalSurname")), isDniDocument && "bg-muted/50 cursor-not-allowed")}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Apellido materno</label>
              <Input
                value={form.maternalSurname}
                onChange={(e) => setForm({ ...form, maternalSurname: e.target.value })}
                readOnly={isDniDocument}
                placeholder="López"
                className={cn(isDniDocument && "bg-muted/50 cursor-not-allowed")}
              />
              {isDniDocument && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Se completan automáticamente al ingresar tu DNI.
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className={errorLabelClass(hasError("mobile"))}>Celular *</label>
              <div className="flex gap-2">
                <Input
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  placeholder="987654321"
                  className={cn("max-w-[12rem]", errorInputClass(hasError("mobile")))}
                />
                {mobileVerified ? (
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-md bg-primary/10 text-primary text-sm whitespace-nowrap">
                    <CheckCircle2 className="w-4 h-4" /> Verificado
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    disabled={
                      !PERU_MOBILE_REGEX.test(trimmedMobile) ||
                      requestVerificationMutation.isPending ||
                      (codeSent && resendSeconds > 0)
                    }
                    onClick={() => requestVerificationMutation.mutate()}
                  >
                    {requestVerificationMutation.isPending
                      ? "Enviando..."
                      : !codeSent
                      ? "Validar celular"
                      : resendSeconds > 0
                      ? `Reenviar (${resendSeconds}s)`
                      : "Reenviar código"}
                  </Button>
                )}
              </div>
              {codeSent && !mobileVerified && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Te enviamos un código de 4 dígitos por WhatsApp al {trimmedMobile}.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="Código"
                      inputMode="numeric"
                      className="max-w-[10rem]"
                    />
                    <Button
                      type="button"
                      className="shrink-0"
                      disabled={pin.length !== 4 || confirmVerificationMutation.isPending}
                      onClick={() => confirmVerificationMutation.mutate()}
                    >
                      {confirmVerificationMutation.isPending ? "Verificando..." : "Confirmar código"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="md:col-span-2 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.differentReceiver}
                  onChange={(e) => setForm({ ...form, differentReceiver: e.target.checked })}
                  className="w-4 h-4 rounded border-input"
                />
                ¿Otra persona recepcionará el envío?
              </label>
            </div>
            {form.differentReceiver && (
              <>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Tipo de documento de quién recepciona</label>
                  <select
                    value={form.receiverDocumentType}
                    onChange={(e) => setForm({ ...form, receiverDocumentType: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={errorLabelClass(hasError("receiverDocumentNumber"))}>Número de documento de quién recepciona *</label>
                  <Input
                    value={form.receiverDocumentNumber}
                    onChange={(e) => setForm({ ...form, receiverDocumentNumber: e.target.value })}
                    placeholder="12345678"
                    className={errorInputClass(hasError("receiverDocumentNumber"))}
                  />
                </div>
                <div>
                  <label className={errorLabelClass(hasError("receiverFirstName"))}>Nombres de quién recepciona *</label>
                  <Input
                    value={form.receiverFirstName}
                    onChange={(e) => setForm({ ...form, receiverFirstName: e.target.value })}
                    placeholder="Juan Carlos"
                    className={errorInputClass(hasError("receiverFirstName"))}
                  />
                </div>
                <div>
                  <label className={errorLabelClass(hasError("receiverPaternalSurname"))}>Apellido paterno de quién recepciona *</label>
                  <Input
                    value={form.receiverPaternalSurname}
                    onChange={(e) => setForm({ ...form, receiverPaternalSurname: e.target.value })}
                    placeholder="Pérez"
                    className={errorInputClass(hasError("receiverPaternalSurname"))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Apellido materno de quién recepciona</label>
                  <Input
                    value={form.receiverMaternalSurname}
                    onChange={(e) => setForm({ ...form, receiverMaternalSurname: e.target.value })}
                    placeholder="Ramos"
                  />
                </div>
                <div>
                  <label className={errorLabelClass(hasError("receiverMobile"))}>Celular de quién recepciona *</label>
                  <Input
                    value={form.receiverMobile}
                    onChange={(e) => setForm({ ...form, receiverMobile: e.target.value })}
                    placeholder="987654321"
                    className={errorInputClass(hasError("receiverMobile"))}
                  />
                </div>
              </>
            )}

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
            {needsAddress && (
              <div className="md:col-span-2">
                <label className="text-sm text-muted-foreground mb-1 block">Ubicación actual (opcional)</label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" onClick={handleShareLocation} disabled={locating} className="gap-2">
                    <MapPin className="w-4 h-4" />
                    {locating
                      ? "Obteniendo ubicación..."
                      : form.locationLat != null
                      ? "Actualizar ubicación"
                      : "Compartir mi ubicación actual"}
                  </Button>
                  {form.locationLat != null && form.locationLng != null && (
                    <a
                      href={`https://www.google.com/maps?q=${form.locationLat},${form.locationLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Ver ubicación capturada en el mapa
                    </a>
                  )}
                </div>
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
