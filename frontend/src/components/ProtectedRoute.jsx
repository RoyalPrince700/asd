import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { homeForRole } from "../utils/role.js";

export function ProtectedRoute({ role, children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return children || <Outlet />;
}
