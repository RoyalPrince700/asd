import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { Layout } from "./components/Layout.jsx";
import { Login } from "./pages/Login.jsx";
import { Signup } from "./pages/Signup.jsx";
import { ClerkHome } from "./pages/ClerkHome.jsx";
import { CfoHome } from "./pages/CfoHome.jsx";
import { CfoProducts } from "./pages/CfoProducts.jsx";
import { AdminHome } from "./pages/AdminHome.jsx";
import { homeForRole } from "./utils/role.js";

export default function App() {
  const { ready } = useAuth();

  if (!ready) {
    return (
      <div className="boot">
        <div className="boot-mark">ASD</div>
        <p>Loading dashboard…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path="/entry"
            element={
              <ProtectedRoute role="clerk">
                <ClerkHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/overview"
            element={
              <ProtectedRoute role="cfo">
                <CfoHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute role="cfo">
                <CfoProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminHome />
              </ProtectedRoute>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homeForRole(user?.role)} replace />;
}
