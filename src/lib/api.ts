import { Product } from "@/context/CartContext";

const API_URL = "/api";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const fetchProducts = (): Promise<Product[]> =>
  fetch(`${API_URL}/products`).then((res) => handle<Product[]>(res));

export const fetchProduct = (id: number): Promise<Product> =>
  fetch(`${API_URL}/products/${id}`).then((res) => handle<Product>(res));

export interface Brand {
  id: number;
  name: string;
}

export const fetchBrands = (): Promise<Brand[]> =>
  fetch(`${API_URL}/brands`).then((res) => handle<Brand[]>(res));

export const createBrand = (name: string): Promise<Brand> =>
  fetch(`${API_URL}/brands`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((res) => handle<Brand>(res));

export const updateBrand = (brand: Brand): Promise<Brand> =>
  fetch(`${API_URL}/brands/${brand.id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: brand.name }),
  }).then((res) => handle<Brand>(res));

export const deleteBrand = (id: number): Promise<void> =>
  fetch(`${API_URL}/brands/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));

// Servicios: mantenimiento aparte de productos, mucho más simple (sin
// colores, categorías, marca, stock ni fotos).
export interface Service {
  id: number;
  code: string;
  name: string;
  description: string;
  price: number;
}

export const fetchServices = (): Promise<Service[]> =>
  fetch(`${API_URL}/services`).then((res) => handle<Service[]>(res));

export const createService = (data: Omit<Service, "id">): Promise<Service> =>
  fetch(`${API_URL}/services`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Service>(res));

export const updateService = (service: Service): Promise<Service> =>
  fetch(`${API_URL}/services/${service.id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(service),
  }).then((res) => handle<Service>(res));

export const deleteService = (id: number): Promise<void> =>
  fetch(`${API_URL}/services/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));

// Registro de Compras (efectos contables): comprobantes de compra con
// proveedor, montos (subtotal/IGV/total) y foto del recibo. Solo accesible
// con sesión de admin.
export type PurchaseDocumentType = "Factura" | "Boleta" | "Recibo por Honorarios" | "Nota de Crédito" | "Nota de Débito" | "Otro";

export interface Purchase {
  id: number;
  purchaseDate: string;
  documentType: PurchaseDocumentType;
  documentNumber: string;
  supplierName: string;
  supplierRuc: string;
  description: string;
  subtotal: number;
  igv: number;
  total: number;
  receiptImage: string;
  createdAt: string;
}

export type PurchaseInput = Omit<Purchase, "id" | "createdAt">;

export const fetchPurchases = (): Promise<Purchase[]> =>
  fetch(`${API_URL}/purchases`, { credentials: "include" }).then((res) => handle<Purchase[]>(res));

export const createPurchase = (data: PurchaseInput): Promise<Purchase> =>
  fetch(`${API_URL}/purchases`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Purchase>(res));

export const updatePurchase = (purchase: Purchase): Promise<Purchase> =>
  fetch(`${API_URL}/purchases/${purchase.id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(purchase),
  }).then((res) => handle<Purchase>(res));

export const deletePurchase = (id: number): Promise<void> =>
  fetch(`${API_URL}/purchases/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));

export type UserRole = "Administrador" | "Vendedor";

export interface UserAccount {
  id: number;
  username: string;
  role: UserRole;
}

export const fetchUsers = (): Promise<UserAccount[]> =>
  fetch(`${API_URL}/users`, { credentials: "include" }).then((res) => handle<UserAccount[]>(res));

export const createUser = (data: { username: string; password: string; role: UserRole }): Promise<UserAccount> =>
  fetch(`${API_URL}/users`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<UserAccount>(res));

export const updateUser = (id: number, data: { username: string; password?: string; role: UserRole }): Promise<UserAccount> =>
  fetch(`${API_URL}/users/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<UserAccount>(res));

export const deleteUser = (id: number): Promise<void> =>
  fetch(`${API_URL}/users/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));

export interface Category {
  id: number;
  name: string;
}

export const fetchCategories = (): Promise<Category[]> =>
  fetch(`${API_URL}/categories`).then((res) => handle<Category[]>(res));

export const createCategory = (name: string): Promise<Category> =>
  fetch(`${API_URL}/categories`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((res) => handle<Category>(res));

export const updateCategory = (category: Category): Promise<Category> =>
  fetch(`${API_URL}/categories/${category.id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: category.name }),
  }).then((res) => handle<Category>(res));

export const deleteCategory = (id: number): Promise<void> =>
  fetch(`${API_URL}/categories/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));

export type DeliveryType = "Shalom" | "Motorizado Express" | "Motorizado Delivery" | "Motorizado Cliente" | "Olva" | "Marvisur";
export type DeliveryMode = "Terrestre" | "Aéreo";

export interface Customer {
  id: number;
  documentType: string;
  documentNumber: string;
  firstName: string;
  paternalSurname: string;
  maternalSurname: string;
  mobile: string;
  country: string;
  department: string;
  province: string;
  district: string;
  deliveryType: DeliveryType;
  deliveryMode: DeliveryMode | null;
  // Sede de recojo, solo aplica (y es obligatorio) cuando deliveryType es
  // un courrier con sedes cargadas (por ahora, Shalom).
  agency: string;
  // Dirección exacta de entrega, solo aplica (y es obligatorio) para los
  // tipos de delivery "motorizado" (Express y Delivery).
  address: string;
  // Ubicación GPS capturada al registrarse desde el link público — obligatoria
  // solo para los tipos de delivery "motorizado" en ese formulario. Opcional
  // acá para no forzarla en los demás formularios que construyen un Customer
  // (panel admin, regularización, cuenta de cliente) y no la capturan.
  locationLat?: number | null;
  locationLng?: number | null;
}

export type CustomerInput = Omit<Customer, "id" | "country">;

export const fetchCustomers = (): Promise<Customer[]> =>
  fetch(`${API_URL}/customers`, { credentials: "include" }).then((res) => handle<Customer[]>(res));

// Búsqueda pública de un cliente por su propio código o DNI (para el
// registro de pedidos fuera del panel admin). Pasa uno de los dos.
export const lookupCustomer = (query: { code?: string; documentNumber?: string }): Promise<Customer> => {
  const params = new URLSearchParams();
  if (query.code) params.set("code", query.code);
  if (query.documentNumber) params.set("documentNumber", query.documentNumber);
  return fetch(`${API_URL}/customers/lookup?${params.toString()}`).then((res) => handle<Customer>(res));
};

export interface District {
  id: number;
  name: string;
}

export const fetchDistricts = (province: string): Promise<District[]> =>
  fetch(`${API_URL}/districts?province=${encodeURIComponent(province)}`).then((res) => handle<District[]>(res));

export interface Agency {
  id: number;
  name: string;
  department: string;
  province: string;
  district: string;
  address: string;
  reference: string;
  phone: string;
  schedule: string;
}

export const fetchAgencies = (provider: string): Promise<Agency[]> =>
  fetch(`${API_URL}/agencies?provider=${encodeURIComponent(provider)}`).then((res) => handle<Agency[]>(res));

export const createDistrict = (province: string, name: string): Promise<District> =>
  fetch(`${API_URL}/districts`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ province, name }),
  }).then((res) => handle<District>(res));

export const updateDistrict = (id: number, name: string): Promise<District> =>
  fetch(`${API_URL}/districts/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((res) => handle<District>(res));

export const deleteDistrict = (id: number): Promise<void> =>
  fetch(`${API_URL}/districts/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));

export const createCustomer = (data: CustomerInput): Promise<Customer> =>
  fetch(`${API_URL}/customers`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Customer>(res));

// A diferencia de createCustomer, este endpoint no requiere sesión de admin:
// es el que usa el link público de autorregistro de clientes.
export const registerCustomer = (data: CustomerInput): Promise<Customer> =>
  fetch(`${API_URL}/customers/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Customer>(res));

// Igual que registerCustomer, pero relajado: lo usa Regularización de
// Separaciones, donde solo el nombre y el celular son obligatorios (el
// resto queda vacío si no se llena).
export const registerCustomerMinimal = (
  data: Partial<CustomerInput> & { firstName: string; mobile: string }
): Promise<Customer> =>
  fetch(`${API_URL}/customers/register-minimal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Customer>(res));

export const updateCustomer = (id: number, data: CustomerInput): Promise<Customer> =>
  fetch(`${API_URL}/customers/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Customer>(res));

export const deleteCustomer = (id: number): Promise<void> =>
  fetch(`${API_URL}/customers/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));

// Cuenta de cliente (con contraseña) para iniciar sesión en la tienda y
// dejar valoraciones — distinta de la sesión de admin, cookie aparte.
export const registerCustomerAccount = (data: CustomerInput & { password: string }): Promise<Customer> =>
  fetch(`${API_URL}/customers/register-account`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Customer>(res));

// El cliente puede iniciar sesión con su documento, su celular o su código
// de cliente.
export const loginCustomer = (identifier: string, password: string): Promise<Customer> =>
  fetch(`${API_URL}/customers/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  }).then((res) => handle<Customer>(res));

export const logoutCustomer = (): Promise<void> =>
  fetch(`${API_URL}/customers/logout`, { method: "POST", credentials: "include" }).then((res) => handle<void>(res));

export const fetchCustomerMe = (): Promise<Customer> =>
  fetch(`${API_URL}/customers/me`, { credentials: "include" }).then((res) => handle<Customer>(res));

// Valoraciones de la tienda (no de un producto en particular), visibles al
// final de la página de inicio.
export interface Review {
  id: number;
  customerId: number;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export const fetchReviews = (): Promise<Review[]> =>
  fetch(`${API_URL}/reviews`).then((res) => handle<Review[]>(res));

// Un cliente logueado solo puede tener una valoración: si ya dejó una,
// esto la actualiza en vez de crear otra.
export const submitReview = (data: { rating: number; comment: string }): Promise<Review> =>
  fetch(`${API_URL}/reviews`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Review>(res));

export interface OrderItem {
  id: number;
  // null en ítems de un pedido de Regularización que no corresponden a
  // ningún producto del catálogo, o en ítems que son un servicio.
  productId: number | null;
  // No-null cuando el ítem es un servicio (en vez de un producto) — sin
  // color ni descuento de stock.
  serviceId: number | null;
  productName: string;
  productCode: string;
  colorName: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  subtotal: number;
}

export type OrderStatus =
  | "Registrado"
  | "Separación"
  | "Separado en almacén"
  | "Pendiente de envío en almacén por acumulación"
  | "Pendiente de envío"
  | "Listo para delivery"
  | "Entregado a delivery";
export type OrderType = "Pedido" | "Regularización";

export interface Payment {
  id: number;
  orderId: number;
  amount: number;
  source: string;
  proofImage: string;
  registeredBy: string;
  createdAt: string;
}

// "Contraentrega" solo tiene sentido con delivery "Motorizado Delivery":
// deja pasar el pedido a "Pendiente de envío" con saldo pendiente, porque
// el motorizado cobra el resto al entregar.
export type ChargeType = "Normal" | "Contraentrega";

export interface Order {
  id: number;
  customerId: number;
  sellerId: number;
  type: OrderType;
  status: OrderStatus;
  chargeType: ChargeType;
  // Recibo del envío (Shalom/Olva/Marvisur) y clave de rastreo opcional;
  // vacíos ("") si todavía no se subió. Sin recibo no se puede marcar el
  // pedido como "Entregado a delivery" en esos tipos de delivery.
  receiptImage: string;
  trackingCode: string;
  // Fecha límite para cancelar (15 días calendario), fijada solo mientras el
  // pedido está en "Separación"; null en cualquier otro estado.
  separationDeadline: string | null;
  total: number;
  createdAt: string;
  items: OrderItem[];
  payments: Payment[];
}

// Un ítem es un producto (productId + colorName) o un servicio (serviceId,
// sin color) — nunca los dos a la vez.
export type OrderItemInput =
  | { productId: number; serviceId?: undefined; colorName: string; quantity: number; discount?: number }
  | { productId?: undefined; serviceId: number; colorName?: undefined; quantity: number; discount?: number };

export interface PaymentInput {
  amount: number;
  source: string;
  proofImage: string;
  // Fecha en la que se hizo el pago (YYYY-MM-DD); si no se manda, el
  // servidor usa la fecha y hora del momento en que se registra.
  date?: string;
}

// Registro público de pedidos (fuera del panel admin): valida stock,
// lo descuenta por color y crea el pedido, todo en el servidor. El pago
// es opcional y, si viene, se registra en la misma transacción que el
// pedido, ya enlazado a él (no hace falta un paso ni un ID aparte).
export const registerOrder = (data: {
  customerId: number;
  sellerId: number;
  items: OrderItemInput[];
  payments?: PaymentInput[];
  chargeType?: ChargeType;
}): Promise<Order> =>
  fetch(`${API_URL}/orders/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Order>(res));

export interface RegularizationItemInput {
  // null cuando el producto no existe en el catálogo (se ingresa a mano) o
  // cuando el ítem es un servicio.
  productId: number | null;
  productName: string;
  productCode?: string;
  // Vacío o ausente en ítems de servicio (no tienen color).
  colorName?: string;
  unitPrice: number;
  quantity: number;
}

// Regularización de Separaciones: registra pedidos históricos sin tocar el
// stock (el precio de cada ítem se ingresa a mano y el producto no tiene
// que existir en el catálogo). Queda guardado como un pedido más, con
// type: "Regularización".
export const registerRegularizedOrder = (data: {
  customerId: number;
  sellerId: number;
  items: RegularizationItemInput[];
  payment?: PaymentInput;
}): Promise<Order> =>
  fetch(`${API_URL}/orders/regularize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Order>(res));

export interface AdminOrder extends Order {
  customerName: string;
  customerDocument: string;
  customerDocumentType: string;
  customerDocumentNumber: string;
  customerMobile: string;
  customerDepartment: string;
  customerProvince: string;
  customerDistrict: string;
  customerDeliveryType: DeliveryType;
  customerDeliveryMode: DeliveryMode | null;
  customerAgency: string;
  customerAddress: string;
  sellerName: string;
}

export const fetchOrders = (): Promise<AdminOrder[]> =>
  fetch(`${API_URL}/orders`, { credentials: "include" }).then((res) => handle<AdminOrder[]>(res));

// Si el pedido es de tipo "Pedido" (no una Regularización), el servidor
// devuelve el stock de cada ítem a su producto y color antes de borrarlo.
export const deleteOrder = (id: number): Promise<void> =>
  fetch(`${API_URL}/orders/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));

// Cambia el color de un ítem de un pedido. En un pedido normal con producto
// de catálogo, el servidor devuelve el stock del color anterior y descuenta
// el del nuevo (rechaza el cambio si no alcanza).
export const updateOrderItemColor = (orderId: number, itemId: number, colorName: string): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/items/${itemId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ colorName }),
  }).then((res) => handle<Order>(res));

// Edita la cantidad/descuento de un servicio ya agregado a un pedido (no
// aplica a productos, ahí lo editable es el color y el descuento, ver
// arriba y abajo).
export const updateOrderServiceItem = (
  orderId: number,
  itemId: number,
  data: { quantity: number; discount?: number }
): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/items/${itemId}/service`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Order>(res));

// Edita el descuento de un producto ya agregado a un pedido (no aplica a
// servicios, ahí lo editable es la cantidad, ver arriba).
export const updateOrderItemDiscount = (orderId: number, itemId: number, discount: number): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/items/${itemId}/discount`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ discount }),
  }).then((res) => handle<Order>(res));

// Quita un producto o servicio de un pedido. Si es un producto de un
// pedido normal, el servidor le devuelve el stock al color correspondiente.
export const deleteOrderItem = (orderId: number, itemId: number): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/items/${itemId}`, {
    method: "DELETE",
    credentials: "include",
  }).then((res) => handle<Order>(res));

// Tope de descuento manual por ítem al registrar un pedido: uno para el
// link público (sin sesión) y otro, más alto, para cuando se registra con
// sesión de admin abierta. Editable desde el panel.
export interface DiscountSettings {
  maxItemDiscountPublic: number;
  maxItemDiscountAdmin: number;
}

export const fetchSettings = (): Promise<DiscountSettings> =>
  fetch(`${API_URL}/settings`).then((res) => handle<DiscountSettings>(res));

export const updateSettings = (data: DiscountSettings): Promise<DiscountSettings> =>
  fetch(`${API_URL}/settings`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<DiscountSettings>(res));

// Título y descripción que se muestran al compartir cada link (ej. por
// WhatsApp): editables desde el panel. path/label son solo informativos
// (a qué página corresponde cada fila); el ícono queda fijo en el servidor.
export interface RouteMeta {
  key: string;
  label: string;
  path: string;
  title: string;
  description: string;
}

export const fetchRouteMeta = (): Promise<RouteMeta[]> =>
  fetch(`${API_URL}/route-meta`, { credentials: "include" }).then((res) => handle<RouteMeta[]>(res));

export const updateRouteMeta = (key: string, data: { title: string; description: string }): Promise<RouteMeta> =>
  fetch(`${API_URL}/route-meta/${key}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<RouteMeta>(res));

// Plantillas de los mensajes que se abren en WhatsApp (registro de pedido,
// aviso de estado, registro de cliente), editables desde el panel. Público
// en GET porque las páginas que arman esos links (registro de pedido,
// registro de cliente) no siempre tienen sesión de admin.
export type MessageTemplateKey = "order_registration" | "order_status_update" | "customer_registration";

export interface MessageTemplate {
  key: MessageTemplateKey;
  template: string;
}

export const fetchMessageTemplates = (): Promise<MessageTemplate[]> =>
  fetch(`${API_URL}/message-templates`).then((res) => handle<MessageTemplate[]>(res));

export const updateMessageTemplate = (key: MessageTemplateKey, template: string): Promise<MessageTemplate> =>
  fetch(`${API_URL}/message-templates/${key}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template }),
  }).then((res) => handle<MessageTemplate>(res));

// Registra un pago de un pedido (panel admin): el servidor recalcula el
// estado del pedido sumando todos los pagos contra el total.
export const registerPayment = (orderId: number, data: PaymentInput): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/payments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Order>(res));

// Marca un pedido "Pendiente de envío" como ya armado/empacado, esperando
// que lo recojan — paso intermedio antes de "Entregado a delivery".
export const markOrderReadyForDelivery = (orderId: number): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/ready-for-delivery`, {
    method: "PUT",
    credentials: "include",
  }).then((res) => handle<Order>(res));

// Transición de estado manual desde el panel: marca un pedido "Listo para
// delivery" como ya entregado al courier/delivery.
export const markOrderDelivered = (orderId: number): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/deliver`, {
    method: "PUT",
    credentials: "include",
  }).then((res) => handle<Order>(res));

// Marca un pedido "Separación" como ya apartado físicamente en el almacén.
export const markOrderWarehouseSeparated = (orderId: number): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/warehouse`, {
    method: "PUT",
    credentials: "include",
  }).then((res) => handle<Order>(res));

// Guarda un pedido ya pagado del todo ("Pendiente de envío") en almacén
// para acumularlo con otros pedidos del mismo cliente y despacharlos
// juntos más adelante — y su liberación de vuelta a "Pendiente de envío"
// cuando ya se quiera consolidar y enviar.
export const markOrderAccumulating = (orderId: number): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/accumulate`, {
    method: "PUT",
    credentials: "include",
  }).then((res) => handle<Order>(res));

export const releaseOrderAccumulating = (orderId: number): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/release-accumulate`, {
    method: "PUT",
    credentials: "include",
  }).then((res) => handle<Order>(res));

// Agrega un producto o servicio a un pedido ya existente (panel admin) —
// solo funciona con delivery "Motorizado Delivery".
export const addOrderItem = (orderId: number, data: OrderItemInput): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/items`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Order>(res));

export const updateOrderChargeType = (orderId: number, chargeType: ChargeType): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/charge-type`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chargeType }),
  }).then((res) => handle<Order>(res));

// Recibo del envío (Shalom/Olva/Marvisur) + clave de rastreo opcional.
export const updateOrderReceipt = (
  orderId: number,
  data: { receiptImage: string; trackingCode?: string }
): Promise<Order> =>
  fetch(`${API_URL}/orders/${orderId}/receipt`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Order>(res));

// Lista pública de vendedores (usuarios con perfil Vendedor), para el
// registro de pedidos fuera del panel admin.
export interface Seller {
  id: number;
  username: string;
}

export const fetchSellers = (): Promise<Seller[]> =>
  fetch(`${API_URL}/sellers`).then((res) => handle<Seller[]>(res));

export const uploadPaymentProof = (file: File): Promise<{ filename: string }> => {
  const formData = new FormData();
  formData.append("image", file);
  return fetch(`${API_URL}/upload-payment-proof`, { method: "POST", body: formData }).then((res) =>
    handle<{ filename: string }>(res)
  );
};

export const createProduct = (product: Omit<Product, "id">): Promise<Product> =>
  fetch(`${API_URL}/products`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product),
  }).then((res) => handle<Product>(res));

export const updateProduct = (product: Product): Promise<Product> =>
  fetch(`${API_URL}/products/${product.id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product),
  }).then((res) => handle<Product>(res));

export const deleteProduct = (id: number): Promise<void> =>
  fetch(`${API_URL}/products/${id}`, { method: "DELETE", credentials: "include" }).then((res) =>
    handle<void>(res)
  );

export const uploadImage = (file: File): Promise<{ filename: string }> => {
  const formData = new FormData();
  formData.append("image", file);
  return fetch(`${API_URL}/upload`, { method: "POST", credentials: "include", body: formData }).then(
    (res) => handle<{ filename: string }>(res)
  );
};

export const uploadVideo = (file: File): Promise<{ filename: string }> => {
  const formData = new FormData();
  formData.append("video", file);
  return fetch(`${API_URL}/upload-video`, { method: "POST", credentials: "include", body: formData }).then(
    (res) => handle<{ filename: string }>(res)
  );
};

// Recibos del Registro de Compras: a diferencia de uploadImage, acepta PDF
// además de fotos.
export const uploadReceipt = (file: File): Promise<{ filename: string }> => {
  const formData = new FormData();
  formData.append("file", file);
  return fetch(`${API_URL}/upload-receipt`, { method: "POST", credentials: "include", body: formData }).then(
    (res) => handle<{ filename: string }>(res)
  );
};

export interface AuthUser {
  username: string;
}

export const login = (username: string, password: string): Promise<AuthUser> =>
  fetch(`${API_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then((res) => handle<AuthUser>(res));

export const logout = (): Promise<void> =>
  fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" }).then((res) => handle<void>(res));

export const fetchMe = (): Promise<AuthUser> =>
  fetch(`${API_URL}/auth/me`, { credentials: "include" }).then((res) => handle<AuthUser>(res));

// Dispara la descarga de un archivo devuelto por un fetch (no pasa por
// handle() porque la respuesta es binaria, no JSON).
const downloadFile = async (res: Response, fallbackName: string): Promise<void> => {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Genera un reporte NUEVO de Pitaya (pedidos Motorizado Delivery en
// Pendiente de envío que todavía no salieron en uno anterior) y lo
// descarga. Queda guardado — vuelve a aparecer en fetchPitayaReports().
export const generatePitayaReport = (): Promise<void> =>
  fetch(`${API_URL}/pitaya-reports`, { method: "POST", credentials: "include" }).then((res) =>
    downloadFile(res, "Reporte Chic Bags.xlsx")
  );

export interface PitayaReportSummary {
  id: number;
  reportName: string;
  fileName: string;
  createdAt: string;
  rowCount: number;
}

export const fetchPitayaReports = (): Promise<PitayaReportSummary[]> =>
  fetch(`${API_URL}/pitaya-reports`, { credentials: "include" }).then((res) => handle<PitayaReportSummary[]>(res));

// Vuelve a descargar una generación ya hecha antes, con las mismas filas
// que tenía en ese momento (no vuelve a consultar los pedidos).
export const downloadPitayaReportById = (id: number): Promise<void> =>
  fetch(`${API_URL}/pitaya-reports/${id}/download`, { credentials: "include" }).then((res) =>
    downloadFile(res, "Reporte Chic Bags.xlsx")
  );

// Elimina una generación del reporte Pitaya. Los pedidos que tenía vuelven
// a quedar disponibles para la próxima generación.
export const deletePitayaReport = (id: number): Promise<void> =>
  fetch(`${API_URL}/pitaya-reports/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));
