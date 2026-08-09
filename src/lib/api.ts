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

export interface UserAccount {
  id: number;
  username: string;
}

export const fetchUsers = (): Promise<UserAccount[]> =>
  fetch(`${API_URL}/users`, { credentials: "include" }).then((res) => handle<UserAccount[]>(res));

export const createUser = (data: { username: string; password: string }): Promise<UserAccount> =>
  fetch(`${API_URL}/users`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<UserAccount>(res));

export const updateUser = (id: number, data: { username: string; password?: string }): Promise<UserAccount> =>
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

export type DeliveryType = "Motorizado Express" | "Motorizado Rango Horario" | "Shalom" | "Olva" | "Marvisur";
export type DeliveryMode = "Terrestre" | "Aéreo";

export interface Customer {
  id: number;
  email: string;
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
}

export type CustomerInput = Omit<Customer, "id" | "country">;

export const fetchCustomers = (): Promise<Customer[]> =>
  fetch(`${API_URL}/customers`, { credentials: "include" }).then((res) => handle<Customer[]>(res));

export interface District {
  id: number;
  name: string;
}

export const fetchDistricts = (province: string): Promise<District[]> =>
  fetch(`${API_URL}/districts?province=${encodeURIComponent(province)}`).then((res) => handle<District[]>(res));

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

export const updateCustomer = (id: number, data: CustomerInput): Promise<Customer> =>
  fetch(`${API_URL}/customers/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((res) => handle<Customer>(res));

export const deleteCustomer = (id: number): Promise<void> =>
  fetch(`${API_URL}/customers/${id}`, { method: "DELETE", credentials: "include" }).then((res) => handle<void>(res));

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
