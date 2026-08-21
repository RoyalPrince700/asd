import { useEffect, useState } from "react";
import { api } from "../api";
import { ACCESSIBLE_LOCATIONS, companyLabel, isLocationlessCompany } from "../constants/companies";
import { roleLabel } from "../utils/role.js";

const STAFF_ROLES = [
  { id: "clerk", label: "Data clerk" },
  { id: "trifone", label: "Trifone" },
  { id: "accountant", label: "Accountant" },
];

function assignmentValue(item) {
  if (item.role === "accountant" || item.role === "trifone") return "";
  if (isLocationlessCompany(item.assignedCompany)) return item.assignedCompany;
  if (item.location) return item.location;
  return "";
}

function assignmentLabel(item) {
  if (item.role === "accountant") return "All locations";
  if (item.role === "trifone") return "Trifone Gadgets & Electronics";
  const value = assignmentValue(item);
  if (isLocationlessCompany(value)) return companyLabel(value);
  if (value) return `APL · ${value}`;
  return "";
}

export function CfoStaff() {
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [savedId, setSavedId] = useState("");

  async function load() {
    const data = await api.staff();
    setStaff(data.staff);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function updateStaffMember(id, payload) {
    setBusyId(id);
    setError("");
    setSavedId("");
    const member = staff.find((item) => item.id === id);
    console.log("[CfoStaff] update start", {
      id,
      payload,
      current: member
        ? {
            name: member.name,
            role: member.role,
            assignedCompany: member.assignedCompany,
            location: member.location,
          }
        : null,
    });
    try {
      const data = await api.updateStaff(id, payload);
      console.log("[CfoStaff] update success", data.staff);
      setStaff((list) =>
        list.map((item) => (item.id === id ? data.staff : item))
      );
      setSavedId(id);
    } catch (err) {
      console.error("[CfoStaff] update failed", {
        id,
        payload,
        message: err.message,
        error: err,
      });
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  function updateRole(id, role) {
    console.log("[CfoStaff] role change", { id, role });
    updateStaffMember(id, { role });
  }

  function updateAssignment(id, assignment) {
    console.log("[CfoStaff] assignment change", { id, assignment });
    updateStaffMember(id, { assignment: assignment || null });
  }

  const clerks = staff.filter((item) => item.role === "clerk");
  const accountants = staff.filter((item) => item.role === "accountant");
  const trifoneStaff = staff.filter((item) => item.role === "trifone");
  const assigned = clerks.filter((item) => assignmentValue(item));
  const pending = clerks.filter((item) => !assignmentValue(item));
  const trifoneCount = clerks.filter((item) => item.assignedCompany === "trifone").length;
  const electronicsCount = clerks.filter((item) => item.assignedCompany === "electronics").length;
  const aplCount = clerks.filter((item) => item.location).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Staff management</h1>
          <p className="lede tight">
            Assign staff to Trifone Gadgets, Trifone Electronics, or an APL location after they sign up.
            Set role to <strong>Trifone</strong> for staff who manage both Trifone registers, or{" "}
            <strong>Accountant</strong> for CFO department staff who can update inventory across all
            companies and locations.
          </p>
        </div>
      </header>

      {error ? <p className="alert">{error}</p> : null}

      <section className="kpi-grid">
        <article className="kpi">
          <span>Total staff</span>
          <strong>{staff.length}</strong>
        </article>
        <article className="kpi featured">
          <span>Assigned clerks</span>
          <strong>{assigned.length}</strong>
        </article>
        <article className="kpi">
          <span>Accountants</span>
          <strong>{accountants.length}</strong>
        </article>
        <article className="kpi">
          <span>Trifone role</span>
          <strong>{trifoneStaff.length}</strong>
        </article>
        <article className="kpi">
          <span>Trifone Gadgets</span>
          <strong>{trifoneCount}</strong>
        </article>
        <article className="kpi">
          <span>Trifone Electronics</span>
          <strong>{electronicsCount}</strong>
        </article>
        <article className="kpi">
          <span>APL locations</span>
          <strong>{aplCount}</strong>
        </article>
        <article className="kpi">
          <span>Awaiting assignment</span>
          <strong>{pending.length}</strong>
        </article>
      </section>

      <div className="table-wrap">
        <div className="section-head">
          <h2>All staff accounts</h2>
          <span>{staff.length} accounts</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Assignment</th>
              <th>Joined</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={6} className="hint">
                  No staff accounts yet. Clerks appear here after they sign up.
                </td>
              </tr>
            ) : (
              staff.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.email}</td>
                  <td>
                    <select
                      value={item.role}
                      disabled={busyId === item.id}
                      onChange={(e) => updateRole(item.id, e.target.value)}
                    >
                      {STAFF_ROLES.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {item.role === "accountant" ? (
                      <span className="hint">All companies &amp; locations</span>
                    ) : item.role === "trifone" ? (
                      <span className="hint">Trifone Gadgets &amp; Electronics</span>
                    ) : (
                      <>
                        <select
                          value={assignmentValue(item)}
                          disabled={busyId === item.id}
                          onChange={(e) => updateAssignment(item.id, e.target.value)}
                        >
                          <option value="">Not assigned</option>
                          <option value="trifone">Trifone Gadgets</option>
                          <option value="electronics">Trifone Electronics</option>
                          <optgroup label="APL locations">
                            {ACCESSIBLE_LOCATIONS.map((loc) => (
                              <option key={loc} value={loc}>
                                {loc}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        {savedId === item.id ? (
                          <span className="saved-tag">Saved</span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    {item.role === "accountant" || item.role === "trifone" ? (
                      <span className="ok">Active · {roleLabel(item.role)}</span>
                    ) : assignmentValue(item) ? (
                      <span className="ok">Active · {assignmentLabel(item)}</span>
                    ) : (
                      <span className="hint">Awaiting assignment</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="panel" style={{ marginTop: "1.5rem" }}>
        <h2>How assignments work</h2>
        <ol style={{ margin: "0.75rem 0 0", paddingLeft: "1.25rem", lineHeight: 1.7 }}>
          <li>Staff create an account via Sign up (they register as a data clerk).</li>
          <li>
            Assign <strong>Trifone Gadgets</strong> or <strong>Trifone Electronics</strong> for those registers,
            or an <strong>APL location</strong> (HO, LA, AK, etc.) for Accessible stock.
          </li>
          <li>
            Set role to <strong>Trifone</strong> for staff who manage both Trifone Gadgets and Trifone
            Electronics (stock movement and inventory for those registers only).
          </li>
          <li>
            Set role to <strong>Accountant</strong> for CFO department staff who need to update inventory
            on behalf of all clerks across any company and location.
          </li>
          <li>
            Accountant updates appear on the Ledger lines page with their name marked
            as Accountant, so you can see who made each change.
          </li>
        </ol>
      </section>
    </div>
  );
}
