import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Info, Loader2, Minus, MessageCircle, Plus, Save, Search, Trash2, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useProducts } from "@/context/ProductContext";
import { Product, ProductColor } from "@/context/CartContext";
import {
  lookupCustomer, registerCustomerMinimal, fetchDistricts, fetchAgencies, registerRegularizedOrder, uploadPaymentProof,
  fetchSellers, fetchServices, Customer, CustomerInput, DeliveryType, DeliveryMode, Order, Service,
} from "@/lib/api";
import { productImageUrl } from "@/lib/images";
import { buildOrderStatusText } from "@/lib/orderMessages";
import { PERU_DEPARTMENTS, PERU_LOCATIONS, isLimaMetroProvince } from "@/lib/peru-locations";
import { errorLabelClass, errorInputClass, cn } from "@/lib/utils";
import AgencyPicker from "@/components/AgencyPicker";
import ProductOrderPicker from "@/components/ProductOrderPicker";
import ServiceOrderPicker from "@/components/ServiceOrderPicker";

const PAYMENT_SOURCES = ["Yape", "Plin", "Otro"];

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

const emptyCustomerForm: CustomerInput = {
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
};

// A diferencia del registro de cliente normal, acá solo el nombre y el
// celular son obligatorios — el resto es dato histórico que puede no
// conocerse todavía (se completa después si hace falta).
const REQUIRED_CUSTOMER_FIELD_LABELS: Record<string, string> = {
  firstName: "Nombres",
  mobile: "Celular",
};

interface RegLine {
  key: string;
  // null cuando el producto no existe en el catálogo (se llenó a mano) o
  // cuando el ítem es un servicio.
  productId: number | null;
  productName: string;
  productCode: string;
  // Vacío en ítems de servicio (no tienen color).
  colorName: string;
  price: number;
  quantity: number;
  image: string;
  isService?: boolean;
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });

// A diferencia de formatDateTime (para momentos reales, como cuándo se creó
// el pedido), esta es para fechas de calendario sin hora (fecha de pago,
// plazo de separación) guardadas en UTC medianoche — se muestran también en
// UTC para que no se corran un día según la zona horaria del navegador.
const formatDateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { dateStyle: "medium", timeZone: "UTC" });

// OJO: no usar toISOString() acá — convierte a UTC, y Perú (UTC-5) ya está
// "mañana" en UTC después de las 7pm, lo que adelantaba la fecha por defecto
// un día en pagos registrados de noche.
const todayDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const buildOrderWhatsAppLink = (order: Order, customer: Customer) => {
  const digits = customer.mobile.replace(/\D/g, "");
  const phone = digits.startsWith("51") ? digits : `51${digits}`;
  const itemsText = order.items
    .map((item) => {
      const code = item.productCode ? ` [${item.productCode}]` : "";
      const color = item.colorName ? ` (${item.colorName})` : "";
      return `- ${item.productName}${code}${color} x${item.quantity}: S/.${item.subtotal.toFixed(2)}`;
    })
    .join("\n");
  const message = `Hola ${customer.firstName}, tu pedido #${order.id} (regularización) quedó registrado el ${formatDateTime(order.createdAt)}:\n\n${itemsText}\n\nTotal: S/.${order.total.toFixed(2)}\n\n${buildOrderStatusText(order)}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

const OrderRegularization = () => {
  const queryClient = useQueryClient();
  const { products } = useProducts();

  // --- Cliente: buscar o, si no existe, registrarlo aquí mismo ---
  const [code, setCode] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerInput>(emptyCustomerForm);
  const [customerAttemptedSubmit, setCustomerAttemptedSubmit] = useState(false);

  const lookupMutation = useMutation({
    mutationFn: lookupCustomer,
    onSuccess: (found) => {
      setCustomer(found);
      toast.success(`Cliente encontrado: ${found.firstName} ${found.paternalSurname}`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo buscar el cliente"),
  });

  const registerCustomerMutation = useMutation({
    mutationFn: registerCustomerMinimal,
    onSuccess: (created) => {
      setCustomer(created);
      setShowNewCustomerForm(false);
      setCustomerForm(emptyCustomerForm);
      setCustomerAttemptedSubmit(false);
      toast.success(`Cliente registrado: #${created.id}`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo registrar el cliente"),
  });

  const needsDeliveryMode = DELIVERY_MODE_REQUIRED.includes(customerForm.deliveryType);
  const needsAgency = AGENCY_REQUIRED.includes(customerForm.deliveryType);
  const needsAddress = ADDRESS_REQUIRED.includes(customerForm.deliveryType);
  // Acá solo nombre y celular son obligatorios, así que alcanza con esos dos
  // para habilitar el tipo de delivery (el resto de campos es opcional).
  const canPickDeliveryType = Boolean(customerForm.firstName.trim() && customerForm.mobile.trim());

  const { data: agencies = [] } = useQuery({
    queryKey: ["agencies", customerForm.deliveryType],
    queryFn: () => fetchAgencies(customerForm.deliveryType),
    enabled: needsAgency,
  });

  const provinces = customerForm.department ? PERU_LOCATIONS[customerForm.department] ?? [] : [];
  const availableDeliveryTypes = DELIVERY_TYPES.filter(
    (t) => isLimaMetroProvince(customerForm.province) || !LIMA_ONLY_DELIVERY_TYPES.includes(t) || t === customerForm.deliveryType
  );
  const { data: districts = [] } = useQuery({
    queryKey: ["districts", customerForm.province],
    queryFn: () => fetchDistricts(customerForm.province),
    enabled: !!customerForm.province,
  });

  const getMissingCustomerFields = () => {
    const missing: string[] = [];
    if (!customerForm.firstName.trim()) missing.push("firstName");
    if (!customerForm.mobile.trim()) missing.push("mobile");
    return missing;
  };

  const missingCustomerFields = customerAttemptedSubmit ? getMissingCustomerFields() : [];
  const hasCustomerError = (field: string) => missingCustomerFields.includes(field);

  const handleLookup = () => {
    if (!code.trim() && !documentNumber.trim()) {
      toast.error("Ingresa el código de cliente o el número de documento");
      return;
    }
    lookupMutation.mutate({ code: code.trim() || undefined, documentNumber: documentNumber.trim() || undefined });
  };

  const handleChangeCustomer = () => {
    setCustomer(null);
    setShowNewCustomerForm(false);
    setCode("");
    setDocumentNumber("");
  };

  const handleRegisterCustomer = () => {
    const missing = getMissingCustomerFields();
    if (missing.length > 0) {
      setCustomerAttemptedSubmit(true);
      toast.error(`Faltan campos obligatorios: ${missing.map((f) => REQUIRED_CUSTOMER_FIELD_LABELS[f]).join(", ")}`);
      return;
    }
    registerCustomerMutation.mutate({
      ...customerForm,
      deliveryMode: needsDeliveryMode ? customerForm.deliveryMode : null,
      agency: needsAgency ? customerForm.agency.trim() : "",
      address: needsAddress ? customerForm.address.trim() : "",
    });
  };

  // --- Vendedor ---
  const [sellerId, setSellerId] = useState("");
  const { data: sellers = [] } = useQuery({ queryKey: ["sellers"], queryFn: fetchSellers });

  // --- Productos: del catálogo (precio editable) o manuales (no existen en el catálogo) ---
  const [lines, setLines] = useState<RegLine[]>([]);
  const [showManualProduct, setShowManualProduct] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualColor, setManualColor] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");

  const handleAddFromCatalog = (product: Product, color: ProductColor) => {
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        productCode: product.code ?? "",
        colorName: color.name,
        price: product.price,
        quantity: 1,
        image: color.image,
      },
    ]);
  };

  const { data: services = [] } = useQuery({ queryKey: ["services"], queryFn: fetchServices });

  const handleAddService = (service: Service) => {
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: null,
        productName: service.name,
        productCode: service.code,
        colorName: "",
        price: service.price,
        quantity: 1,
        image: "",
        isService: true,
      },
    ]);
  };

  const handleAddManual = () => {
    if (!manualName.trim()) {
      toast.error("Ingresa el nombre del producto");
      return;
    }
    if (!manualColor.trim()) {
      toast.error("Ingresa el color");
      return;
    }
    const price = Number(manualPrice);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Ingresa un precio válido");
      return;
    }
    const quantity = Number(manualQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Ingresa una cantidad válida");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: null,
        productName: manualName.trim(),
        productCode: manualCode.trim(),
        colorName: manualColor.trim(),
        price,
        quantity,
        image: "",
      },
    ]);
    setManualName("");
    setManualCode("");
    setManualColor("");
    setManualPrice("");
    setManualQuantity("1");
    setShowManualProduct(false);
  };

  const handlePriceChange = (key: string, value: number) => {
    const price = Number.isFinite(value) && value >= 0 ? value : 0;
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, price } : l)));
  };

  const handleQuantity = (key: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l))
    );
  };

  const handleRemove = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  // --- Pago (opcional, igual que en el registro de pedidos normal) ---
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentSource, setPaymentSource] = useState(PAYMENT_SOURCES[0]);
  const [paymentSourceOther, setPaymentSourceOther] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayDate);
  const [paymentProofImage, setPaymentProofImage] = useState("");
  const [paymentUploading, setPaymentUploading] = useState(false);

  const handleUploadProof = async (file: File) => {
    setPaymentUploading(true);
    try {
      const { filename } = await uploadPaymentProof(file);
      setPaymentProofImage(filename);
    } catch {
      toast.error("No se pudo subir la captura");
    } finally {
      setPaymentUploading(false);
    }
  };

  const hasPaymentInput =
    paymentAmount.trim() !== "" ||
    paymentProofImage !== "" ||
    (paymentSource === "Otro" && paymentSourceOther.trim() !== "");

  // --- Registro del pedido de regularización ---
  const [order, setOrder] = useState<Order | null>(null);

  const orderMutation = useMutation({
    mutationFn: registerRegularizedOrder,
    onSuccess: (created) => {
      setOrder(created);
      setLines([]);
      setPaymentAmount("");
      setPaymentSource(PAYMENT_SOURCES[0]);
      setPaymentSourceOther("");
      setPaymentDate(todayDate());
      setPaymentProofImage("");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo registrar la regularización"),
  });

  const handleSubmit = () => {
    if (!customer) {
      toast.error("Busca o registra un cliente primero");
      return;
    }
    if (!sellerId) {
      toast.error("Selecciona el vendedor");
      return;
    }
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto o servicio");
      return;
    }

    let payment: { amount: number; source: string; date: string; proofImage: string } | undefined;
    if (hasPaymentInput) {
      const amountNumber = Number(paymentAmount);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        toast.error("Ingresa un monto de pago válido");
        return;
      }
      const finalSource = paymentSource === "Otro" ? paymentSourceOther.trim() : paymentSource;
      if (!finalSource) {
        toast.error("Ingresa el medio de pago");
        return;
      }
      if (!paymentProofImage) {
        toast.error("Sube la captura del pago");
        return;
      }
      payment = { amount: amountNumber, source: finalSource, date: paymentDate, proofImage: paymentProofImage };
    }

    orderMutation.mutate({
      customerId: customer.id,
      sellerId: Number(sellerId),
      items: lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        productCode: l.productCode,
        colorName: l.colorName,
        unitPrice: l.price,
        quantity: l.quantity,
      })),
      payment,
    });
  };

  const handleNewOrder = () => {
    setOrder(null);
    handleChangeCustomer();
  };

  if (order) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 flex flex-col items-center text-center gap-6 max-w-lg">
          <CheckCircle2 className="w-14 h-14 text-primary" />
          <h1 className="text-2xl md:text-3xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            ¡Regularización registrada!
          </h1>
          <span className="inline-block px-4 py-2 rounded-md bg-primary/10 text-primary font-semibold text-lg tracking-wide">
            Pedido #{order.id}
          </span>
          <p className="text-sm text-muted-foreground -mt-4">Registrado el {formatDateTime(order.createdAt)} · No afectó el stock</p>
          <span className="inline-block px-3 py-1 rounded-md bg-muted text-sm font-medium">
            Estado: {order.status}
          </span>
          {order.status === "Separación" && order.separationDeadline && (
            <p className="text-sm text-muted-foreground max-w-md">
              Tienes 15 días calendario para cancelar tu pedido. Fecha límite:{" "}
              <span className="font-medium text-foreground">{formatDateOnly(order.separationDeadline)}</span>.
            </p>
          )}
          <div className="w-full border border-border rounded-lg p-4 text-left space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.productName}
                  {item.productCode && <span className="text-muted-foreground"> [{item.productCode}]</span>}
                  {item.colorName && <> ({item.colorName})</>} x{item.quantity}
                </span>
                <span className="font-medium">S/.{item.subtotal.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-base font-medium pt-2 border-t border-border">
              <span>Total</span>
              <span>S/.{order.total.toFixed(2)}</span>
            </div>
          </div>

          {order.payments.length > 0 && (
            <div className="w-full border border-border rounded-lg p-4 text-left space-y-2">
              <h2 className="text-sm font-medium">Pagos registrados</h2>
              {order.payments.map((payment) => (
                <div key={payment.id} className="flex justify-between text-sm text-muted-foreground">
                  <span>{payment.source} · {formatDateOnly(payment.createdAt)}</span>
                  <span className="font-medium text-foreground">S/.{payment.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {customer && (
            <a
              href={buildOrderWhatsAppLink(order, customer)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-white font-medium transition-transform hover:scale-105"
              style={{ backgroundColor: "#25D366" }}
            >
              <MessageCircle className="w-5 h-5" fill="white" />
              Volver al chat de WhatsApp
            </a>
          )}
          <div className="flex gap-3">
            <Button onClick={handleNewOrder}>Regularizar otro pedido</Button>
            <Link to="/"><Button variant="outline">Volver a la tienda</Button></Link>
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
            Regularización de Separaciones
          </h1>
          <p className="text-muted-foreground">
            Registra pedidos históricos: no descuenta stock, el precio de cada producto se ingresa a mano y admite
            productos que ya no están en el catálogo.
          </p>
        </div>

        <div className="border border-border rounded-lg p-6 mb-6">
          {customer ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{customer.firstName} {customer.paternalSurname} {customer.maternalSurname}</p>
                <p className="text-sm text-muted-foreground">
                  {customer.documentType} {customer.documentNumber} · {customer.mobile}
                </p>
                <p className="text-sm text-muted-foreground">
                  {customer.district}, {customer.province}, {customer.department}
                </p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                  Código de cliente: #{customer.id}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleChangeCustomer} className="gap-2 shrink-0">
                <X className="w-3.5 h-3.5" /> Cambiar
              </Button>
            </div>
          ) : showNewCustomerForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-display)" }}>Registrar cliente nuevo</h2>
                <Button variant="outline" size="sm" onClick={() => setShowNewCustomerForm(false)} className="gap-2 shrink-0">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Tipo de documento *</label>
                  <select
                    value={customerForm.documentType}
                    onChange={(e) => setCustomerForm({ ...customerForm, documentType: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Número de documento</label>
                  <Input
                    value={customerForm.documentNumber}
                    onChange={(e) => setCustomerForm({ ...customerForm, documentNumber: e.target.value })}
                    placeholder="12345678"
                  />
                </div>
                <div>
                  <label className={errorLabelClass(hasCustomerError("firstName"))}>Nombres *</label>
                  <Input
                    value={customerForm.firstName}
                    onChange={(e) => setCustomerForm({ ...customerForm, firstName: e.target.value })}
                    placeholder="María José"
                    className={errorInputClass(hasCustomerError("firstName"))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Apellido paterno</label>
                  <Input
                    value={customerForm.paternalSurname}
                    onChange={(e) => setCustomerForm({ ...customerForm, paternalSurname: e.target.value })}
                    placeholder="García"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Apellido materno</label>
                  <Input
                    value={customerForm.maternalSurname}
                    onChange={(e) => setCustomerForm({ ...customerForm, maternalSurname: e.target.value })}
                    placeholder="López"
                  />
                </div>
                <div>
                  <label className={errorLabelClass(hasCustomerError("mobile"))}>Celular *</label>
                  <Input
                    value={customerForm.mobile}
                    onChange={(e) => setCustomerForm({ ...customerForm, mobile: e.target.value })}
                    placeholder="987654321"
                    className={errorInputClass(hasCustomerError("mobile"))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Departamento</label>
                  <select
                    value={customerForm.department}
                    onChange={(e) => setCustomerForm({ ...customerForm, department: e.target.value, province: "", district: "" })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Selecciona...</option>
                    {PERU_DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Provincia</label>
                  <select
                    value={customerForm.province}
                    onChange={(e) => {
                      const province = e.target.value;
                      const resetDeliveryType = !isLimaMetroProvince(province) && LIMA_ONLY_DELIVERY_TYPES.includes(customerForm.deliveryType);
                      setCustomerForm({
                        ...customerForm,
                        province,
                        district: "",
                        deliveryType: resetDeliveryType ? "Shalom" : customerForm.deliveryType,
                        deliveryMode: resetDeliveryType ? "Terrestre" : customerForm.deliveryMode,
                      });
                    }}
                    disabled={!customerForm.department}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Selecciona...</option>
                    {provinces.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Distrito</label>
                  <select
                    value={customerForm.district}
                    onChange={(e) => setCustomerForm({ ...customerForm, district: e.target.value })}
                    disabled={!customerForm.province}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">{customerForm.province ? "Selecciona..." : "Elige antes la provincia"}</option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Tipo de delivery
                    {!canPickDeliveryType && (
                      <span className="text-xs font-normal text-destructive"> — completa nombre y celular primero</span>
                    )}
                  </label>
                  <select
                    value={customerForm.deliveryType}
                    disabled={!canPickDeliveryType}
                    onChange={(e) => {
                      const deliveryType = e.target.value as DeliveryType;
                      setCustomerForm({
                        ...customerForm,
                        deliveryType,
                        deliveryMode: DELIVERY_MODE_REQUIRED.includes(deliveryType) ? customerForm.deliveryMode ?? "Terrestre" : null,
                      });
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {availableDeliveryTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {customerForm.province && !isLimaMetroProvince(customerForm.province) && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      Fuera de Lima o Callao solo hay envío por agencia (Shalom, Olva o Marvisur).
                    </p>
                  )}
                </div>
                {needsAddress && (
                  <div className="md:col-span-2">
                    <label className="text-sm text-muted-foreground mb-1 block">Dirección de entrega</label>
                    <Input
                      value={customerForm.address}
                      onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                      placeholder="Av. / Jr. / Calle, número, referencia..."
                    />
                  </div>
                )}
                {needsDeliveryMode && (
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Vía de envío</label>
                    <div className="flex gap-2 h-10 items-center">
                      {DELIVERY_MODES.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setCustomerForm({ ...customerForm, deliveryMode: mode })}
                          className={cn(
                            "px-4 py-2 rounded-md border text-sm transition-colors",
                            customerForm.deliveryMode === mode
                              ? "border-primary bg-primary/10 text-foreground"
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
                      value={customerForm.agency}
                      onChange={(agency) => setCustomerForm({ ...customerForm, agency })}
                      hasError={false}
                      province={customerForm.province}
                      district={customerForm.district}
                    />
                  </div>
                )}
              </div>
              <Button
                onClick={handleRegisterCustomer}
                disabled={registerCustomerMutation.isPending}
                className="w-full py-6 text-sm tracking-widest uppercase gap-2"
              >
                <Save className="w-4 h-4" /> {registerCustomerMutation.isPending ? "Registrando..." : "Registrar cliente"}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Código de cliente</label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. 6" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">DNI / N° de documento</label>
                <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="Ej. 42242274" />
              </div>
              <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                <Button onClick={handleLookup} disabled={lookupMutation.isPending} className="gap-2">
                  <Search className="w-4 h-4" /> {lookupMutation.isPending ? "Buscando..." : "Buscar cliente"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  ¿Cliente nuevo?{" "}
                  <button type="button" onClick={() => setShowNewCustomerForm(true)} className="text-primary hover:underline">
                    Regístralo aquí
                  </button>
                </span>
              </div>
            </div>
          )}
        </div>

        {customer && (
          <>
            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Vendedor</h2>
              {sellers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay usuarios con perfil Vendedor todavía. Créalos en{" "}
                  <Link to="/admin" className="text-primary hover:underline">Admin &gt; Usuarios</Link>.
                </p>
              ) : (
                <div className="max-w-xs">
                  <label className="text-sm text-muted-foreground mb-1 block">¿Quién está registrando la regularización? *</label>
                  <select
                    value={sellerId}
                    onChange={(e) => setSellerId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Selecciona...</option>
                    {sellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>{seller.username}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Agregar productos</h2>
              <ProductOrderPicker products={products} onAdd={handleAddFromCatalog} ignoreStock />
              <div className="mt-4 pt-4 border-t border-border">
                {showManualProduct ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Producto que no está en el catálogo</p>
                      <button type="button" onClick={() => setShowManualProduct(false)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="text-xs text-muted-foreground mb-1 block">Nombre</label>
                        <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Nombre del producto" className="h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Código</label>
                        <Input value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="Opcional" className="h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Color</label>
                        <Input value={manualColor} onChange={(e) => setManualColor(e.target.value)} placeholder="Ej. Negro" className="h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Precio</label>
                        <Input type="number" min={0} step={0.1} value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="0.00" className="h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Cantidad</label>
                        <Input type="number" min={1} step={1} value={manualQuantity} onChange={(e) => setManualQuantity(e.target.value)} className="h-9" />
                      </div>
                    </div>
                    <Button size="sm" onClick={handleAddManual} className="gap-2">
                      <Plus className="w-3.5 h-3.5" /> Agregar producto
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowManualProduct(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    ¿El producto no existe en el catálogo? Agrégalo a mano
                  </button>
                )}
              </div>
            </div>

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Agregar servicios</h2>
              <ServiceOrderPicker services={services} onAdd={handleAddService} />
            </div>

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Pedido</h2>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Todavía no agregaste productos ni servicios.</p>
              ) : (
                <div className="space-y-3">
                  {lines.map((line) => (
                    <div key={line.key} className="flex items-center gap-3 p-3 rounded-md border border-border">
                      <div className="w-12 h-12 rounded bg-muted overflow-hidden shrink-0">
                        {line.image && (
                          <img src={productImageUrl(line.image)} alt={line.colorName} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {line.productName}
                          {line.productCode && <span className="text-muted-foreground"> [{line.productCode}]</span>}
                          {line.isService ? (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary font-semibold">Servicio</span>
                          ) : (
                            line.productId === null && <span className="text-muted-foreground"> (fuera de catálogo)</span>
                          )}
                        </p>
                        {line.colorName && <p className="text-xs text-muted-foreground">{line.colorName}</p>}
                      </div>
                      <div className="shrink-0 text-center">
                        <label className="block text-[10px] text-muted-foreground leading-tight">Precio</label>
                        <Input
                          type="number"
                          min={0}
                          step={0.1}
                          value={line.price}
                          onChange={(e) => handlePriceChange(line.key, e.target.valueAsNumber)}
                          className="h-7 w-20 text-sm text-right px-2"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => handleQuantity(line.key, -1)}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-8 text-center text-sm">{line.quantity}</span>
                        <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => handleQuantity(line.key, 1)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="w-20 text-right text-sm font-medium shrink-0">
                        S/.{(line.price * line.quantity).toFixed(2)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRemove(line.key)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        aria-label="Quitar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-3 border-t border-border">
                    <span className="text-base font-medium">Total</span>
                    <span className="text-xl font-semibold">S/.{total.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Esta regularización no descuenta stock: el movimiento físico ya ocurrió antes, esto solo lo deja
                asentado en el sistema.
              </p>
            </div>

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-1" style={{ fontFamily: "var(--font-display)" }}>Pago (opcional)</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Si el cliente ya pagó, regístralo aquí — queda enlazado al pedido al registrarlo. Si no, deja esto vacío y
                registra el pago después desde el panel admin.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Monto</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Medio de pago</label>
                  <select
                    value={paymentSource}
                    onChange={(e) => setPaymentSource(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {PAYMENT_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                {paymentSource === "Otro" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">¿Cuál?</label>
                    <Input value={paymentSourceOther} onChange={(e) => setPaymentSourceOther(e.target.value)} placeholder="Medio de pago" className="h-9" />
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fecha del pago</label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Captura del pago</label>
                  <label className="flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-muted/50">
                    {paymentUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {paymentProofImage ? "Cambiar" : "Subir"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadProof(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              {paymentProofImage && (
                <img src={productImageUrl(paymentProofImage)} alt="Captura del pago" className="w-16 h-16 mt-3 rounded object-cover border border-border" />
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={orderMutation.isPending || lines.length === 0 || !sellerId || paymentUploading}
              className="w-full py-6 text-sm tracking-widest uppercase gap-2"
            >
              {orderMutation.isPending ? "Registrando..." : "Registrar regularización"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderRegularization;
