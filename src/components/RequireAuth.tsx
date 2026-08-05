import { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import AdminLogin from "@/pages/AdminLogin";

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!user) return <AdminLogin />;

  return <>{children}</>;
};

export default RequireAuth;
