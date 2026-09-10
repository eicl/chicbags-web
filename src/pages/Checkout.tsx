import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import KRGlueImport from "@lyracom/embedded-form-glue";

// El paquete hace su propio interop de CommonJS a ESM (exports.default = ...)
// y el bundler de Vite lo envuelve una vez más al pre-empaquetarlo, dejando
// el objeto real un nivel más adentro de lo que indican sus propios tipos
// (KRGlue.loadLibrary no existe, pero KRGlue.default.loadLibrary sí) — se
// desenvuelve a mano para que funcione sin importar si el bundler lo envuelve
// una vez o dos.
const KRGlue = (KRGlueImport as unknown as { default?: typeof KRGlueImport }).default ?? KRGlueImport;
import { ArrowLeft, CheckCircle2, CreditCard, Banknote, Loader2, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useCart, cartLineKey } from "@/context/CartContext";
import { useCustomerAuth } from "@/context/CustomerAuthContext";
import { productImageUrl } from "@/lib/images";
import { registerOrder, fetchSellers, fetchSettings, fetchPaymentCardLogos, ChargeType, Order } from "@/lib/api";
import { isLimaMetroProvince } from "@/lib/peru-locations";

// Mismas listas que OrderRegister.tsx: quién puede elegir pagar contra
// entrega en vez de con tarjeta.
const CHARGE_TYPE_NATIONWIDE_DELIVERY_TYPES = ["Shalom", "Olva", "Marvisur"];
const CHARGE_TYPE_LIMA_ONLY_DELIVERY_TYPES = ["Motorizado Delivery", "Motorizado Cliente"];

// Vendedor fijo para los pedidos armados solo desde el carrito público (sin
// que un vendedor real intervenga) — se crea una sola vez en Admin > Usuarios.
const ONLINE_SELLER_USERNAME = "Tienda Online";

// Cliente "Krypton" de Izipay (@lyracom/embedded-form-glue, mismo paquete
// que usa el ejemplo oficial izipay-pe/Embedded-PaymentForm-React) — carga
// el formulario embebido de tarjeta dentro de KR_FORM_WRAPPER_ID.
const IZIPAY_ENDPOINT = "https://static.micuentaweb.pe";
const KR_FORM_WRAPPER_ID = "micuentawebstd_rest_wrapper";
// Teal real de la marca Izipay — a propósito distinto del color primario de
// ChicBags, para que el paso de tarjeta se note como el formulario propio
// de Izipay (ver el bloque de estilo junto al widget más abajo).
const IZIPAY_BRAND_COLOR = "#00A99D";

// registerOrder (server/index.js) tira estos dos mensajes cuando ya no hay
// stock suficiente o el color ya no existe — se detectan por texto para
// resaltarlos aparte del error genérico (no hay un código de error separado
// para esto en la respuesta del servidor).
const isStockError = (message: string) => /no hay suficiente stock|ya no tiene el color/i.test(message);

interface CardPaymentInfo {
  orderId: number;
  total: number;
  formToken: string;
  publicKey: string;
}

type Stage = "form" | "loading-card-form" | "confirming" | "success" | "pending" | "cod-success";

const Checkout = () => {
  const navigate = useNavigate();
  const { items, totalPrice, clearCart } = useCart();
  const { customer, isLoading: isLoadingCustomer } = useCustomerAuth();

  const [chargeType, setChargeType] = useState<ChargeType>("Normal");
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [order, setOrder] = useState<Order | null>(null);
  const [cardPayment, setCardPayment] = useState<CardPaymentInfo | null>(null);
  // Aparte del toast (que desaparece solo), este mensaje queda fijo en
  // pantalla cuando el pedido no se pudo registrar por falta de stock —
  // para que no se pierda de vista qué producto/color se quedó sin unidades.
  const [stockError, setStockError] = useState<string | null>(null);

  // Logos configurables desde Admin > Configuración — se muestran alrededor
  // del formulario de tarjeta (los campos en sí los renderiza el widget de
  // Izipay, no son HTML propio).
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const { data: cardLogos = [] } = useQuery({ queryKey: ["paymentCardLogos"], queryFn: fetchPaymentCardLogos });

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

  // Carga el formulario de tarjeta de Izipay una vez que el contenedor
  // (#micuentawebstd_rest_wrapper, renderizado más abajo en stage
  // "loading-card-form") ya está en el DOM.
  useEffect(() => {
    if (!cardPayment) return;
    let cancelled = false;
    (async () => {
      try {
        const { KR } = await KRGlue.loadLibrary(IZIPAY_ENDPOINT, cardPayment.publicKey);
        if (cancelled) return;
        await KR.setFormConfig({ formToken: cardPayment.formToken, "kr-language": "es-ES" });
        const { KR: KR2, result } = await KR.renderElements(`#${KR_FORM_WRAPPER_ID}`);
        await KR2.showForm(result.formId);
        await KR2.onSubmit((response) => {
          const orderStatus = response.clientAnswer?.orderStatus;
          if (orderStatus !== "PAID") {
            // Rechazo inmediato (ej. tarjeta inválida, fondos insuficientes)
            // — no tiene sentido esperar una confirmación que nunca va a
            // llegar. El detalle del error viene dentro de la transacción.
            const transaction = response.clientAnswer?.transactions?.[0] as
              | { errorMessage?: string; detailedErrorMessage?: string }
              | undefined;
            const reason = transaction?.errorMessage || transaction?.detailedErrorMessage;
            toast.error(reason ? `Tu tarjeta fue rechazada: ${reason}` : "Tu tarjeta fue rechazada. Intenta con otra.");
            setStage("form");
            return;
          }
          // La respuesta que llega acá es solo para la UX inmediata — la
          // confirmación real viene del IPN server-to-server, o si no llega
          // (ej. probando en localhost), de la consulta directa a Izipay
          // que hace GET /api/orders/:id/status (ver reconcileIzipayOrder
          // en server/index.js) — por eso se hace polling en vez de confiar
          // solo en esta respuesta.
          // Acá es el punto en que el pago se concreta de verdad (se le dio
          // clic al botón "Pagar" propio de Izipay y la tarjeta fue
          // aceptada) — recién acá se vacía el carrito, no antes.
          clearCart();
          setStage("confirming");
          pollOrderStatus(cardPayment.orderId, cardPayment.total);
        });
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "No se pudo cargar el formulario de pago");
        setStage("form");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardPayment]);

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

  const getOnlineSellerId = async (): Promise<number | null> => {
    const sellers = await fetchSellers();
    const onlineSeller = sellers.find((s) => s.username === ONLINE_SELLER_USERNAME);
    if (!onlineSeller) {
      toast.error("La tienda no está lista para recibir pedidos en línea todavía. Escríbenos por WhatsApp.");
      return null;
    }
    return onlineSeller.id;
  };

  // Se dispara con un solo clic en "Tarjeta" — ya no hay un botón aparte de
  // "Confirmar pedido". El pedido se registra (y recién ahí se reserva el
  // stock de cada ítem) apenas arranca el pago con tarjeta, para que dos
  // clientes no puedan quedarse con el mismo stock mientras uno de ellos
  // está completando el pago. El carrito, en cambio, NO se vacía acá: sigue
  // disponible (y sobrevive a un refresh, ver CartContext) hasta que el
  // pago se concreta de verdad — recién en el onSubmit del formulario de
  // Izipay más abajo — así un refresh a mitad de camino o una tarjeta
  // rechazada no hacen perder el pedido.
  const payWithCard = async () => {
    if (!customer || items.length === 0 || submitting) return;
    setChargeType("Normal");
    setSubmitting(true);
    setStockError(null);
    try {
      // Si un intento anterior con tarjeta ya registró el pedido (ej. la
      // tarjeta fue rechazada y se volvió a "form"), se reusa ese mismo
      // pedido en vez de crear uno nuevo y descontar el stock dos veces.
      let currentOrder = order && order.chargeType === "Normal" ? order : null;
      if (!currentOrder) {
        const sellerId = await getOnlineSellerId();
        if (!sellerId) return;
        currentOrder = await registerOrder({
          customerId: customer.id,
          sellerId,
          items: items.map((item) => ({ productId: item.id, colorName: item.colorName, quantity: item.quantity })),
          chargeType: "Normal",
        });
        setOrder(currentOrder);
      }
      setStage("loading-card-form");
      const tokenRes = await fetch("/api/izipay/formtoken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: currentOrder.id }),
      });
      const tokenBody = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenBody.error ?? "No se pudo iniciar el pago con tarjeta");
      // El formulario en sí se carga en el useEffect de arriba, una vez que
      // este estado hace que se renderice el contenedor que necesita.
      setCardPayment({
        orderId: currentOrder.id,
        total: currentOrder.total,
        formToken: tokenBody.formToken,
        publicKey: tokenBody.publicKey,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo procesar el pago";
      toast.error(message);
      if (isStockError(message)) setStockError(message);
      setStage("form");
    } finally {
      setSubmitting(false);
    }
  };

  // Contra entrega no tiene un botón de pago propio como el de Izipay (se
  // paga en efectivo al recibir), así que acá sí hace falta una acción
  // explícita del cliente para registrar el pedido.
  const payContraentrega = async () => {
    if (!customer || items.length === 0 || submitting) return;
    setSubmitting(true);
    setStockError(null);
    try {
      let currentOrder = order && order.chargeType === "Contraentrega" ? order : null;
      if (!currentOrder) {
        const sellerId = await getOnlineSellerId();
        if (!sellerId) return;
        currentOrder = await registerOrder({
          customerId: customer.id,
          sellerId,
          items: items.map((item) => ({ productId: item.id, colorName: item.colorName, quantity: item.quantity })),
          chargeType: "Contraentrega",
        });
        setOrder(currentOrder);
      }
      clearCart();
      setStage("cod-success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo registrar el pedido";
      toast.error(message);
      if (isStockError(message)) setStockError(message);
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
          {order && customer && (
            <p className="text-sm text-muted-foreground">
              Le enviamos el detalle del pedido por WhatsApp a {customer.firstName}.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
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
            {stockError && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{stockError}</p>
              </div>
            )}
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
                  onClick={payWithCard}
                  disabled={submitting || stage !== "form"}
                  className={`flex items-center gap-3 p-4 rounded-md border text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    chargeType === "Normal" ? "border-primary bg-primary/10" : "border-input hover:border-muted-foreground/50"
                  }`}
                >
                  {submitting && chargeType === "Normal" ? (
                    <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
                  ) : (
                    <CreditCard className="w-5 h-5 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Tarjeta</p>
                    {cardLogos.length > 0 ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        {cardLogos.map((logo) => (
                          <img key={logo.id} src={productImageUrl(logo.image)} alt="" className="h-4 w-auto object-contain" />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">vía Izipay</p>
                    )}
                  </div>
                </button>
                {canPickContraentrega && (
                  <button
                    type="button"
                    onClick={() => setChargeType("Contraentrega")}
                    disabled={submitting || stage !== "form"}
                    className={`flex items-center gap-3 p-4 rounded-md border text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
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
              // A propósito, esta zona se ve distinta al resto del sitio:
              // el cliente tiene que notar que está en el formulario propio
              // de Izipay (marca de confianza para meter los datos de la
              // tarjeta), no una imitación del estilo de ChicBags. El
              // acento teal de abajo es el color real de marca de Izipay.
              <div
                className="rounded-lg p-6 space-y-4"
                style={{
                  fontFamily: "Roboto, sans-serif",
                  backgroundColor: "#ffffff",
                  border: `1px solid ${IZIPAY_BRAND_COLOR}30`,
                  borderTop: `3px solid ${IZIPAY_BRAND_COLOR}`,
                }}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {/* Color forzado a mano (no hsl(var(--primary)) ni
                      heredado): la variable --kr-global-color-primary de
                      Izipay resultó no aplicarse de forma confiable en
                      producción (ver el bloque de estilo de abajo), así que
                      este título no puede depender de que "algo" la
                      resuelva bien — se fija explícito para que nunca
                      salga con un color ajeno. */}
                  {/* fontFamily también forzado acá (no solo el color): el
                      index.css del sitio pone h1-h6 en la fuente de título
                      (Playfair Display) por reglas propias, que le ganan a
                      la herencia del Roboto del contenedor padre — hay que
                      declararlo directo en el propio h2 para que gane. */}
                  <h2 className="text-lg font-medium" style={{ color: "hsl(25 20% 15%)", fontFamily: "Roboto, sans-serif" }}>
                    Tarjeta de crédito o débito
                  </h2>
                  {cardLogos.length > 0 && (
                    <div className="flex items-center gap-2">
                      {cardLogos.map((logo) => (
                        <img key={logo.id} src={productImageUrl(logo.image)} alt="" className="h-6 w-auto object-contain" />
                      ))}
                    </div>
                  )}
                </div>
                {!cardPayment && (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Iniciando el pago con tarjeta...
                  </div>
                )}
                {/* Ajuste sobre el widget de Izipay, esta vez con las clases
                    reales confirmadas inspeccionando el DOM en vivo (no
                    adivinadas desde su hoja de estilos):

                    - El número/fecha/CVV se renderizan cada uno DENTRO DE UN
                      IFRAME de static.micuentaweb.pe (otro origen, por
                      PCI-DSS) — por eso ningún CSS nuestro pudo tocar jamás
                      el input en sí. Pero el contenedor que envuelve ese
                      iframe sí vive en nuestra página: .kr-field-wrapper-pan,
                      .kr-field-wrapper-expiryDate, .kr-field-wrapper-
                      securityCode (y .kr-field-wrapper-cardHolderName, que
                      no usa iframe). Ahí es donde va la caja.
                    - .kr-payment-button es hermano de los campos, no está
                      anidado en ningún .kr-field-wrapper — se puede forzar
                      aparte sin cruzarse con los campos.
                    - --kr-global-color-primary sigue sin aplicarse de forma
                      confiable (Izipay la pone inline en <html>, probablemente
                      desde la configuración de la cuenta) — se deja el
                      intento igual, no hace daño, pero el color real de los
                      campos/botón depende de los valores fijos de abajo. */}
                <style>{`
                  .kr-embedded {
                    background-color: #ffffff !important;
                    --kr-global-color-primary: ${IZIPAY_BRAND_COLOR} !important;
                    --kr-global-color-primaryLight: ${IZIPAY_BRAND_COLOR}30 !important;
                    --kr-form-button-backgroundColor: ${IZIPAY_BRAND_COLOR} !important;
                    --kr-form-button-borderColor: ${IZIPAY_BRAND_COLOR} !important;
                    --kr-form-button-color: #ffffff !important;
                    --kr-global-focus-outlineColor: ${IZIPAY_BRAND_COLOR} !important;
                  }
                  .kr-embedded .kr-field-wrapper-pan,
                  .kr-embedded .kr-field-wrapper-expiryDate,
                  .kr-embedded .kr-field-wrapper-securityCode,
                  .kr-embedded .kr-field-wrapper-cardHolderName {
                    background-color: #ffffff !important;
                    border: 1px solid #d8d8d8 !important;
                    border-radius: 6px !important;
                    padding: 10px 12px !important;
                    box-sizing: border-box !important;
                  }
                  .kr-embedded .kr-field-wrapper-pan:focus-within,
                  .kr-embedded .kr-field-wrapper-expiryDate:focus-within,
                  .kr-embedded .kr-field-wrapper-securityCode:focus-within,
                  .kr-embedded .kr-field-wrapper-cardHolderName:focus-within {
                    border-color: ${IZIPAY_BRAND_COLOR} !important;
                    box-shadow: 0 0 0 3px ${IZIPAY_BRAND_COLOR}26 !important;
                  }
                  .kr-embedded .kr-field-element {
                    margin-bottom: 12px !important;
                  }
                  .kr-embedded .kr-payment-button {
                    display: block !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                    padding: 12px !important;
                    text-align: center !important;
                    background-color: ${IZIPAY_BRAND_COLOR} !important;
                    border: 1px solid ${IZIPAY_BRAND_COLOR} !important;
                    color: #ffffff !important;
                    border-radius: 6px !important;
                    font-size: 15px !important;
                    cursor: pointer !important;
                  }
                  /* Los desplegables "Sin cuotas"/"Pago sin diferido"
                     (.kr-custom-select, confirmado real en el DOM) no usan
                     iframe — son un combobox propio armado con divs, así
                     que sí se pueden restylear directo: la caja que se ve
                     siempre (.kr-select), el panel de opciones que aparece
                     al abrir (.kr-options/.kr-option) y la flechita
                     (.kr-select-caret). */
                  .kr-embedded .kr-select-wrapper.kr-custom-select .kr-select {
                    border: 1px solid #d8d8d8 !important;
                    border-radius: 6px !important;
                    background-color: #ffffff !important;
                    padding: 10px 12px !important;
                    box-sizing: border-box !important;
                  }
                  .kr-embedded .kr-select-wrapper.kr-custom-select .kr-select:hover,
                  .kr-embedded .kr-select-wrapper.kr-custom-select .kr-select[aria-expanded="true"] {
                    border-color: ${IZIPAY_BRAND_COLOR} !important;
                  }
                  .kr-embedded .kr-select-wrapper.kr-custom-select .kr-select-caret svg path {
                    fill: #999999 !important;
                  }
                  .kr-embedded .kr-select-wrapper.kr-custom-select .kr-options {
                    border: 1px solid #d8d8d8 !important;
                    border-radius: 6px !important;
                    background-color: #ffffff !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
                    overflow: hidden !important;
                  }
                  .kr-embedded .kr-select-wrapper.kr-custom-select .kr-option {
                    background-color: #ffffff !important;
                  }
                  .kr-embedded .kr-select-wrapper.kr-custom-select .kr-option:hover,
                  .kr-embedded .kr-select-wrapper.kr-custom-select .kr-option.kr-active-option {
                    background-color: ${IZIPAY_BRAND_COLOR}1A !important;
                  }
                `}</style>
                <div id={KR_FORM_WRAPPER_ID}>
                  <div className="kr-embedded" />
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-border">
                  {settings?.paymentGatewayLogo && (
                    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      Powered by
                      <img src={productImageUrl(settings.paymentGatewayLogo)} alt="Izipay" className="h-12 w-auto object-contain" />
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: IZIPAY_BRAND_COLOR }} />
                    Tus pagos se realizan de forma segura con encriptación de 256 bits
                  </p>
                </div>
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
              {/* Una vez que el pedido ya se registró (order != null), el
                  carrito local se vacía (ver handlePay) — mostrar acá los
                  ítems del carrito en ese punto dejaría el resumen en
                  blanco mientras el cliente todavía está completando el
                  pago con tarjeta, aunque el pedido en sí ya quedó bien
                  registrado en el servidor. Por eso, con order ya creado,
                  el resumen muestra una foto fija de order.items/order.total
                  en vez del carrito en vivo. */}
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {order
                  ? order.items.map((item) => (
                      <div key={item.id} className="flex gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.productName}</p>
                          {item.colorName && <p className="text-xs text-muted-foreground">{item.colorName}</p>}
                          <p className="text-xs text-muted-foreground">x{item.quantity}</p>
                        </div>
                        <p className="text-sm font-medium">S/.{item.subtotal.toFixed(2)}</p>
                      </div>
                    ))
                  : items.map((item) => (
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
                <span>S/.{(order ? order.total : totalPrice).toFixed(2)}</span>
              </div>
              {/* Con tarjeta no hay un botón aparte acá: elegir "Tarjeta"
                  arriba ya dispara el registro del pedido y carga el
                  formulario de Izipay — el pago en sí se concreta con el
                  botón "Pagar" propio de ese formulario. Contra entrega no
                  tiene un botón de pago externo, así que sí necesita esta
                  acción explícita. */}
              {chargeType === "Contraentrega" ? (
                <Button
                  onClick={payContraentrega}
                  disabled={submitting || stage !== "form"}
                  className="w-full py-6 text-sm tracking-widest uppercase gap-2"
                >
                  {submitting ? "Procesando..." : "Registrar pedido"}
                </Button>
              ) : (
                stage === "form" && (
                  <p className="text-xs text-muted-foreground text-center">
                    Elige "Tarjeta" arriba para continuar con el pago.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
