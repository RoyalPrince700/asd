import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Inbox,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { roleLabel } from "../utils/role.js";
import { isAssignedStaff } from "../utils/staff.js";
import { companyLabel, isLocationlessCompany } from "../constants/companies";

const MY_REQUESTS_NAV = { to: "/my-requests", label: "Requests", icon: Inbox };

const NAV_BY_ROLE = {
  admin: [
    { to: "/admin", label: "Users", icon: Users },
    MY_REQUESTS_NAV,
  ],
  cfo: [
    { to: "/overview", label: "Overview", icon: LayoutDashboard },
    { to: "/analysis", label: "Analysis", icon: BarChart3 },
    { to: "/ledger", label: "Ledger lines", icon: ScrollText },
    { to: "/edited-ledger", label: "Edited ledger", icon: ClipboardCheck },
    { to: "/requests", label: "Request inbox", icon: Inbox },
    { to: "/my-requests", label: "My requests", icon: ClipboardList },
    { to: "/products", label: "Product catalog", icon: Package },
    { to: "/staff", label: "Staff", icon: Users },
  ],
  accountant: [
    { to: "/accountant/movement", label: "Stock movement", icon: ClipboardList },
    { to: "/accountant/inventory", label: "Inventory", icon: Package },
    MY_REQUESTS_NAV,
  ],
  trifone: [
    { to: "/trifone/movement", label: "Stock movement", icon: ClipboardList },
    { to: "/trifone/inventory", label: "Inventory", icon: Package },
    MY_REQUESTS_NAV,
  ],
  clerk: [{ to: "/entry", label: "Pending assignment", icon: Clock }, MY_REQUESTS_NAV],
};

const ASSIGNED_CLERK_NAV = [
  { to: "/staff/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/entry", label: "Stock movement", icon: ClipboardList },
  { to: "/staff/inventory", label: "Inventory", icon: Package },
  MY_REQUESTS_NAV,
];

export function Layout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  const navItems = useMemo(() => {
    if (user.role === "clerk" && isAssignedStaff(user)) {
      return ASSIGNED_CLERK_NAV;
    }
    return NAV_BY_ROLE[user.role] ?? NAV_BY_ROLE.clerk;
  }, [user]);

  return (
    <div className={`shell${collapsed ? " shell--collapsed" : ""}`}>
      <aside className={`rail${collapsed ? " rail--collapsed" : ""}`}>
        <div className="rail-top">
          <div className="brand" title="Accessible Stock Dashboard">
            <div className="brand-text">
              <strong>Accessible Stock Dashboard</strong>
              <small>Stock control</small>
            </div>
          </div>
          <button
            type="button"
            className="rail-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} title={label}>
              <Icon size={18} aria-hidden="true" />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="rail-user">
          <div className="avatar">{user.name.slice(0, 1)}</div>
          <div className="rail-user-info">
            <strong>{user.name}</strong>
            <small>
              {roleLabel(user.role)}
              {isLocationlessCompany(user.assignedCompany)
                ? ` · ${companyLabel(user.assignedCompany)}`
                : user.location
                  ? ` · ${user.location}`
                  : ""}
            </small>
          </div>
          <button
            type="button"
            className="text-btn rail-logout"
            onClick={logout}
            title="Sign out"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </aside>
      <main className="stage">
        <Outlet />
      </main>
    </div>
  );
}
