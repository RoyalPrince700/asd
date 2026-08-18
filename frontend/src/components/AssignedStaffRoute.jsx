import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { isAssignedStaff } from "../utils/staff.js";

export function AssignedStaffRoute({ children }) {
  const { user } = useAuth();

  if (!isAssignedStaff(user)) {
    return <Navigate to="/entry" replace />;
  }

  return children;
}
