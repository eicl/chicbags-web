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

export const fetchBrands = (): Promise<string[]> =>
  fetch(`${API_URL}/brands`).then((res) => handle<string[]>(res));

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
