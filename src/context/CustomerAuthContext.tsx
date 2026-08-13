import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  loginCustomer, logoutCustomer as logoutCustomerApi, fetchCustomerMe, registerCustomerAccount,
  Customer, CustomerInput,
} from "@/lib/api";

interface CustomerAuthContextType {
  customer: Customer | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: CustomerInput & { password: string }) => Promise<Customer>;
  logout: () => void;
  loginError: string | null;
  isLoggingIn: boolean;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

// Sesión del cliente en la tienda (login + valoraciones) — separada de la
// sesión de admin (AuthContext), con su propia cookie.
export const CustomerAuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customerMe"],
    queryFn: fetchCustomerMe,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: ({ identifier, password }: { identifier: string; password: string }) => loginCustomer(identifier, password),
    onSuccess: (data) => {
      queryClient.setQueryData(["customerMe"], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerCustomerAccount,
    onSuccess: (data) => {
      queryClient.setQueryData(["customerMe"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logoutCustomerApi,
    onSuccess: () => {
      queryClient.setQueryData(["customerMe"], null);
    },
  });

  return (
    <CustomerAuthContext.Provider
      value={{
        customer: customer ?? null,
        isLoading,
        login: async (identifier, password) => {
          await loginMutation.mutateAsync({ identifier, password });
        },
        register: (data) => registerMutation.mutateAsync(data),
        logout: () => logoutMutation.mutate(),
        loginError: loginMutation.error instanceof Error ? loginMutation.error.message : null,
        isLoggingIn: loginMutation.isPending,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
};

export const useCustomerAuth = () => {
  const context = useContext(CustomerAuthContext);
  if (!context) throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  return context;
};
