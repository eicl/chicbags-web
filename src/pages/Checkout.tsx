import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CreditCard, Banknote, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useCart, cartLineKey } from "@/context/CartContext";
import { useCustomerAuth } from "@/context/CustomerAuthContext";
import { productImageUrl } from "@/lib/images";
import { registerOrder, fetchSellers, fetchMessageTemplates, ChargeType, Order } from "@/lib/api";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/messageTemplates";
import { buildOrderWhatsAppLink } from "@/lib/orderMessages";
import { isLimaMetroProvince } from "@/lib/peru-locations";

// Mismas listas que OrderRegister.tsx: quién puede elegir pagar contra
// entrega en vez de con tarjeta.
const CHARGE_TYPE_NATIONWIDE_DELIVERY_TYPES = ["Shalom", "Olva", "Marvisur"];
const CHARGE_TYPE_LIMA_ONLY_DELIVERY_TYPES = ["Motorizado Delivery", "Motorizado Cliente"];

// Vendedor fijo para los pedidos armados solo desde el carrito público (sin
// que un vendedor real intervenga) — se crea una sola vez en Admin > Usuarios.
const ONLINE_SELLER_USERNAME = "Tienda Online";

const IZIPAY_SDK_URL = "https://checkout.izipay.pe/payments/v1/js/index.js";

// Tipado mínimo del SDK de Izipay (no trae sus propios tipos). La forma
// exacta de "config" y del contenedor del formulario se confirma recién con
// credenciales reales — ver nota en handlePay.
interface IzipayCheckoutInstance {
  LoadForm: (options: {
    authorization: string;
    keyRSA: string;
    callbackResponse: (response: Record<string, unknown>) => void;
  }) => void;
}
declare global {
  interface Window {
    Izipay?: new (options: { config: Record<string, unknown> }) => IzipayCheckoutInstance;
  }
}

const loadIzipayScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.Izipay) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${IZIPAY_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar el formulario de pago")));
      return;
    }
    const script = document.createElement("script");
    script.src = IZIPAY_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el formulario de pago"));
    document.head.appendChild(script);
  });

type Stage = "form" | "loading-card-form" | "confirming" | "success" | "pending" | "cod-success";

const Checkout = () => {
  const navigate = useNavigate();
  const { items, totalPrice, clearCart } = useCart();
  const { customer, isLoading: isLoadingCustomer } = useCustomerAuth();
  const { data: messageTemplates = [] } = useQuery({ queryKey: ["messageTemplates"], queryFn: fetchMessageTemplates });
  const orderRegistrationTemplate =
    messageTemplates.find((t) => t.key === "order_registration")?.template ?? DEFAULT_MESSAGE_TEMPLATES.order_registration;

  const [chargeType, setChargeType] = useState<ChargeType>("Normal");
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [order, setOrder] = useState<Order | null>(null);

  // El checkout exige sesión de "Mi cuenta" — sin cuenta no hay a quién
  // asociarle el pedido (documento, tipo de entrega, dirección/agencia ya
  // guardados). Si no hay sesión, se manda a iniciar sesión/crear cuenta y
  // se vuelve acá después (ver CustomerLogin.tsx / CustomerAccountRegister.tsx).
  useEffect(() => {
    if (!isLoadingCustomer && !customer) {
      navigate("/mi-cuenta/ingresar", { state: { from: "/checkout" } });
    }
  }, [isLoadingCustomer, customer, navigate]);

  const canPickContraentrega = Boolean(
    customer &&
      (CHARGE_TYPE_NATIONWIDE_DELIVERY_TYPES.includes(customer.deliveryType) ||
        (isLimaMetroProvince(customer.province) && CHARGE_TYPE_LIMA_ONLY_DELIVERY_TYPES.includes(customer.deliveryType)))
  );

  const pollOrderStatus = (orderId: number, total: number) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/orders/${orderId}/status`);
        if (res.ok) {
          const body = await res.json();
          if (body.paid >= total) {
            clearInterval(interval);
            setStage("success");
            return;
          }
        }
      } catch {
        // sigue reintentando hasta agotar los intentos
      }
      if (attempts >= 8) {
        clearInterval(interval);
        setStage("pending");
      }
    }, 2000);
  };

  const handlePay = async () => {
    if (!customer || items.length === 0) return;
    setSubmitting(true);
    try {
      const sellers = await fetchSellers();
      const onlineSeller = sellers.find((s) => s.username === ONLINE_SELLER_USERNAME);
      if (!onlineSeller) {
        toast.error("La tienda no está lista para recibir pedidos en línea todavía. Escríbenos por WhatsApp.");
        return;
      }
      const createdOrder = await registerOrder({
        customerId: customer.id,
        sellerId: onlineSeller.id,
        items: items.map((item) => ({ productId: item.id, colorName: item.colorName, quantity: item.quantity })),
        chargeType,
      });
      setOrder(createdOrder);
      clearCart();

      if (chargeType === "Contraentrega") {
        setStage("cod-success");
        return;
      }

      setStage("loading-card-form");
      await loadIzipayScript();
      const tokenRes = await fetch("/api/izipay/formtoken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: createdOrder.id }),
      });
      const tokenBody = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenBody.error ?? "No se pudo iniciar el pago con tarjeta");
      if (!window.Izipay) throw new Error("No se pudo cargar el formulario de pago");

      const checkout = new window.Izipay({
        config: {
          transactionId: String(createdOrder.id),
          action: "pay",
          merchantCode: tokenBody.merchantCode,
          order: { orderNumber: String(createdOrder.id), currency: "PEN", amount: createdOrder.total, processType: "AT" },
        },
      });
      checkout.LoadForm({
        authorization: tokenBody.formToken,
        keyRSA: tokenBody.publicKey,
        callbackResponse: () => {
          // La respuesta que llega acá es solo para la UX inmediata — la
          // confirmación real viene del IPN server-to-server (ver
          // POST /api/izipay/ipn en server/index.js), por eso se hace
          // polling del estado real del pedido en vez de confiar en esto.
          setStage("confirming");
          pollOrderStatus(createdOrder.id, createdOrder.total);
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo procesar el pago");
      setStage("form");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoadingCustomer || !customer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (stage === "form" && items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center gap-6 px-4 py-24">
          <h1 className="text-2xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            Tu carrito está vacío
          </h1>
          <p className="text-muted-foreground">Agrega productos antes de continuar al pago.</p>
          <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Volver a la tienda
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "cod-success" || stage === "success" || stage === "pending") {
    const whatsappLink = order && customer ? buildOrderWhatsAppLink(order, customer, orderRegistrationTemplate) : null;
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 flex flex-col items-center text-center gap-6 max-w-lg">
          <CheckCircle2 className="w-14 h-14 text-primary" />
          <h1 className="text-2xl md:text-3xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            {stage === "pending" ? "Estamos confirmando tu pago" : "¡Pedido registrado!"}
          </h1>
          <p className="text-muted-foreground">
            {stage === "cod-success" && "Pagas en efectivo al recibir tu pedido. Te contactaremos para coordinar la entrega."}
            {stage === "success" && "Tu pago con tarjeta fue confirmado."}
            {stage === "pending" &&
              "Tu tarjeta fue procesada, pero la confirmación está demorando más de lo normal. Te avisaremos apenas se confirme — también puedes escribirnos."}
          </p>
          {order && (
            <span className="inline-block px-4 py-2 rounded-md bg-primary/10 text-primary font-semibold text-lg tracking-wide">
              Pedido #{order.id}
            </span>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-white font-medium transition-transform hover:scale-105"
                style={{ backgroundColor: "#25D366" }}
              >
                <MessageCircle className="w-5 h-5" fill="white" />
                Ver detalle por WhatsApp
              </a>
            )}
            <Button variant="outline" onClick={() => navigate("/")}>
              Ir al inicio
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 md:px-8 py-8 md:py-12 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-muted rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl md:text-3xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            Finalizar Compra
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
          <div className="lg:col-span-3 space-y-6">
            <div className="border border-border rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-medium">Tus datos de entrega</h2>
              <p className="text-sm text-muted-foreground">
                {customer.firstName} {customer.paternalSurname} · {customer.mobile}
              </p>
              <p className="text-sm text-muted-foreground">
                {customer.deliveryType}
                {customer.agency && ` — ${customer.agency}`}
                {customer.address && ` — ${customer.address}`}
                {" · "}
                {customer.district}, {customer.province}, {customer.department}
              </p>
              <p className="text-xs text-muted-foreground">
                ¿Necesitas actualizar estos datos? Escríbenos por WhatsApp antes de pagar.
              </p>
            </div>

            <div className="border border-border rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-medium">Método de pago</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setChargeType("Normal")}
                  className={`flex items-center gap-3 p-4 rounded-md border text-left transition-colors ${
                    chargeType === "Normal" ? "border-primary bg-primary/10" : "border-input hover:border-muted-foreground/50"
                  }`}
                >
                  <CreditCard className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Tarjeta</p>
                    <p className="text-xs text-muted-foreground">Visa, Mastercard — vía Izipay</p>
                  </div>
                </button>
                {canPickContraentrega && (
                  <button
                    type="button"
                    onClick={() => setChargeType("Contraentrega")}
                    className={`flex items-center gap-3 p-4 rounded-md border text-left transition-colors ${
                      chargeType === "Contraentrega" ? "border-primary bg-primary/10" : "border-input hover:border-muted-foreground/50"
                    }`}
                  >
                    <Banknote className="w-5 h-5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Contra entrega</p>
                      <p className="text-xs text-muted-foreground">Pagas en efectivo al recibir</p>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {stage === "loading-card-form" && (
              <div className="border border-border rounded-lg p-6 flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando el formulario de pago...
              </div>
            )}
            {stage === "confirming" && (
              <div className="border border-border rounded-lg p-6 flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Confirmando tu pago...
              </div>
            )}
          </div>

          {/* Resumen */}
          <div className="lg:col-span-2">
            <div className="border border-border rounded-lg p-6 sticky top-24 space-y-4">
              <h2 className="text-lg font-medium">Resumen del pedido</h2>
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {items.map((item) => (
                  <div key={cartLineKey(item.id, item.colorName)} className="flex gap-3">
                    <img src={productImageUrl(item.image)} alt={item.name} className="w-14 h-16 object-cover rounded-sm bg-muted" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {item.colorName && <p className="text-xs text-muted-foreground">{item.colorName}</p>}
                      <p className="text-xs text-muted-foreground">x{item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium">S/.{(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-4 flex justify-between text-lg font-medium">
                <span>Total</span>
                <span>S/.{totalPrice.toFixed(2)}</span>
              </div>
              <Button onClick={handlePay} disabled={submitting || stage !== "form"} className="w-full py-6 text-sm tracking-widest uppercase gap-2">
                {submitting ? "Procesando..." : "Confirmar pedido"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
