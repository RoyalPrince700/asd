import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { roleLabel } from "../utils/role.js";

const NAV_BY_ROLE = {
  admin: [{ to: "/admin", label: "Users", icon: Users }],
  cfo: [
    { to: "/overview", label: "Overview", icon: LayoutDashboard },
    { to: "/products", label: "Product catalog", icon: Package },
  ],
  clerk: [
    { to: "/entry", label: "Stock movement dashboard", icon: ClipboardList },
  ],
};

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

  const navItems = NAV_BY_ROLE[user.role] ?? NAV_BY_ROLE.clerk;

  return (
    <div className={`shell${collapsed ? " shell--collapsed" : ""}`}>
      <aside className={`rail${collapsed ? " rail--collapsed" : ""}`}>
        <div className="rail-top">
          <div className="brand">
            <span className="brand-mark">ASD</span>
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
            <small>{roleLabel(user.role)}</small>
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
