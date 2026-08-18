import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { StaffMovement } from "./StaffMovement.jsx";
import { WaitingForAssignment } from "./WaitingForAssignment.jsx";
import { isAssignedStaff } from "../utils/staff.js";

export function ClerkHome() {
  const { user, refreshUser } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    refreshUser().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="page">
        <p className="hint empty-hint">Loading your dashboard…</p>
      </div>
    );
  }

  if (isAssignedStaff(user)) {
    return <StaffMovement />;
  }

  return <WaitingForAssignment />;
}
