import { useEffect, useState } from "react";
import { api } from "../api";
import { ACCESSIBLE_LOCATIONS } from "../constants/companies";
import { roleLabel } from "../utils/role.js";

const STAFF_ROLES = [
  { id: "clerk", label: "Data clerk" },
  { id: "accountant", label: "Accountant" },
];

function assignmentValue(item) {
  if (item.role === "accountant") return "";
  if (item.assignedCompany === "trifone") return "trifone";
  if (item.location) return item.location;
  return "";
}

function assignmentLabel(item) {
  if (item.role === "accountant") return "All locations";
  const value = assignmentValue(item);
  if (value === "trifone") return "Trifone";
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
    try {
      const data = await api.updateStaff(id, payload);
      setStaff((list) =>
        list.map((item) => (item.id === id ? data.staff : item))
      );
      setSavedId(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  function updateRole(id, role) {
    updateStaffMember(id, { role });
  }

  function updateAssignment(id, assignment) {
    updateStaffMember(id, { assignment: assignment || null });
  }

  const clerks = staff.filter((item) => item.role === "clerk");
  const accountants = staff.filter((item) => item.role === "accountant");
  const assigned = clerks.filter((item) => assignmentValue(item));
  const pending = clerks.filter((item) => !assignmentValue(item));
  const trifoneCount = clerks.filter((item) => item.assignedCompany === "trifone").length;
  const aplCount = clerks.filter((item) => item.location).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Staff management</h1>
          <p className="lede tight">
            Assign staff to Trifone or an APL location after they sign up. Promote
            a user to <strong>Accountant</strong> so they can update inventory on
            behalf of all clerks across any company and location.
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
          <span>Trifone</span>
          <strong>{trifoneCount}</strong>
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
                    ) : (
                      <>
                        <select
                          value={assignmentValue(item)}
                          disabled={busyId === item.id}
                          onChange={(e) => updateAssignment(item.id, e.target.value)}
                        >
                          <option value="">Not assigned</option>
                          <option value="trifone">Trifone</option>
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
                    {item.role === "accountant" ? (
                      <span className="ok">Active · {roleLabel("accountant")}</span>
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
            Assign <strong>Trifone</strong> for staff who manage the Trifone register,
            or an <strong>APL location</strong> (HO, LA, AK, etc.) for Accessible stock.
          </li>
          <li>
            Set role to <strong>Accountant</strong> for CFO department staff who need
            to update inventory on behalf of all clerks. Accountants pick company and
            location when posting.
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
