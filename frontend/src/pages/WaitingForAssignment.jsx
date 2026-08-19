import { useEffect } from "react";
import { Clock } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const POLL_MS = 15000;

export function WaitingForAssignment() {
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshUser().catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshUser]);

  return (
    <div className="page waiting-page">
      <div className="waiting-card">
        <div className="waiting-icon" aria-hidden="true">
          <Clock size={32} />
        </div>
        <p className="eyebrow">Account pending</p>
        <h1>Waiting for assignment</h1>
        <p className="lede">
          Hi {user?.name?.split(" ")[0] || "there"}, your account is set up but
          you have not been assigned to a company or location yet. CFO will
          assign your role shortly — once that is done, your dashboard will
          open automatically.
        </p>
        <ul className="waiting-steps">
          <li>Your account has been created successfully</li>
          <li>CFO will assign you to Trifone Gadgets, Trifone Electronics, or an APL location</li>
          <li>You will then be able to post stock movements and view inventory</li>
        </ul>
        <p className="hint waiting-note">
          This page refreshes every few seconds. You can also sign out and check
          back later.
        </p>
      </div>
    </div>
  );
}
