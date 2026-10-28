import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { Layout } from "./components/Layout.jsx";
import { Login } from "./pages/Login.jsx";
import { Signup } from "./pages/Signup.jsx";
import { AssignedStaffRoute } from "./components/AssignedStaffRoute.jsx";
import { homeForRole } from "./utils/role.js";

const ClerkHome = lazyNamed(() => import("./pages/ClerkHome.jsx"), "ClerkHome");
const StaffOverview = lazyNamed(() => import("./pages/StaffOverview.jsx"), "StaffOverview");
const StaffStockList = lazyNamed(() => import("./pages/StaffStockList.jsx"), "StaffStockList");
const CfoHome = lazyNamed(() => import("./pages/CfoHome.jsx"), "CfoHome");
const CfoLedger = lazyNamed(() => import("./pages/CfoLedger.jsx"), "CfoLedger");
const CfoProducts = lazyNamed(() => import("./pages/CfoProducts.jsx"), "CfoProducts");
const CfoStaff = lazyNamed(() => import("./pages/CfoStaff.jsx"), "CfoStaff");
const CfoAnalysis = lazyNamed(() => import("./pages/CfoAnalysis.jsx"), "CfoAnalysis");
const CfoEditedLedger = lazyNamed(() => import("./pages/CfoEditedLedger.jsx"), "CfoEditedLedger");
const CfoDeletionLog = lazyNamed(() => import("./pages/CfoDeletionLog.jsx"), "CfoDeletionLog");
const CfoRequests = lazyNamed(() => import("./pages/CfoRequests.jsx"), "CfoRequests");
const MyRequests = lazyNamed(() => import("./pages/MyRequests.jsx"), "MyRequests");
const AdminHome = lazyNamed(() => import("./pages/AdminHome.jsx"), "AdminHome");
const AccountantMovement = lazyNamed(() => import("./pages/AccountantMovement.jsx"), "AccountantMovement");
const AccountantInventory = lazyNamed(() => import("./pages/AccountantInventory.jsx"), "AccountantInventory");
const TrifoneMovement = lazyNamed(() => import("./pages/TrifoneMovement.jsx"), "TrifoneMovement");
const TrifoneInventory = lazyNamed(() => import("./pages/TrifoneInventory.jsx"), "TrifoneInventory");
const PressMovement = lazyNamed(() => import("./pages/PressMovement.jsx"), "PressMovement");
const PressInventory = lazyNamed(() => import("./pages/PressInventory.jsx"), "PressInventory");
const PressApprovals = lazyNamed(() => import("./pages/PressApprovals.jsx"), "PressApprovals");
const PressManagerMovement = lazyNamed(
  () => import("./pages/PressManagerMovement.jsx"),
  "PressManagerMovement"
);
const PressDeletionLog = lazyNamed(
  () => import("./pages/PressDeletionLog.jsx"),
  "PressDeletionLog"
);

function lazyNamed(loader, name) {
  return lazy(() => loader().then((module) => ({ default: module[name] })));
}

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
    <Suspense fallback={<div className="boot"><p>Loading page…</p></div>}>
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
            path="/staff/overview"
            element={
              <ProtectedRoute role="clerk">
                <AssignedStaffRoute>
                  <StaffOverview />
                </AssignedStaffRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/inventory"
            element={
              <ProtectedRoute role="clerk">
                <AssignedStaffRoute>
                  <StaffStockList />
                </AssignedStaffRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accountant/movement"
            element={
              <ProtectedRoute role="accountant">
                <AccountantMovement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accountant/inventory"
            element={
              <ProtectedRoute role="accountant">
                <AccountantInventory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trifone/movement"
            element={
              <ProtectedRoute role="trifone">
                <TrifoneMovement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trifone/inventory"
            element={
              <ProtectedRoute role="trifone">
                <TrifoneInventory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/press/movement"
            element={
              <ProtectedRoute role="press">
                <PressMovement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/press/inventory"
            element={
              <ProtectedRoute roles={["press", "press_manager"]}>
                <PressInventory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/press-manager/approvals"
            element={
              <ProtectedRoute role="press_manager">
                <PressApprovals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/press-manager/movement"
            element={
              <ProtectedRoute role="press_manager">
                <PressManagerMovement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/press-manager/log"
            element={
              <ProtectedRoute role="press_manager">
                <PressDeletionLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/overview"
            element={
              <ProtectedRoute roles={["cfo", "md"]}>
                <CfoHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ledger"
            element={
              <ProtectedRoute roles={["cfo", "md"]}>
                <CfoLedger />
              </ProtectedRoute>
            }
          />
          <Route
            path="/edited-ledger"
            element={
              <ProtectedRoute role="cfo">
                <CfoEditedLedger />
              </ProtectedRoute>
            }
          />
          <Route
            path="/deletion-log"
            element={
              <ProtectedRoute role="cfo">
                <CfoDeletionLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute roles={["cfo", "md"]}>
                <CfoProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analysis"
            element={
              <ProtectedRoute roles={["cfo", "md"]}>
                <CfoAnalysis />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-requests"
            element={<MyRequests />}
          />
          <Route
            path="/requests"
            element={
              <ProtectedRoute role="cfo">
                <CfoRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute role="cfo">
                <CfoStaff />
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
    </Suspense>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homeForRole(user?.role)} replace />;
}
