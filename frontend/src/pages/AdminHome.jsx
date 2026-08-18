import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import { api } from "../api";
import { roleLabel } from "../utils/role.js";

const ROLES = ["clerk", "cfo", "admin"];

export function AdminHome() {
  const { user } = useAuth();
  const { confirm, toast } = useDialog();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [savedId, setSavedId] = useState("");

  async function load() {
    const data = await api.users();
    setUsers(data.users);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function updateRole(id, role) {
    setBusyId(id);
    setError("");
    setSavedId("");
    try {
      const data = await api.updateUser(id, { role });
      setUsers((list) =>
        list.map((item) => (item.id === id ? data.user : item))
      );
      setSavedId(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function removeUser(id) {
    const ok = await confirm({
      title: "Delete user",
      message: "Delete this user? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setBusyId(id);
    setError("");
    try {
      await api.deleteUser(id);
      setUsers((list) => list.filter((item) => item.id !== id));
      toast({ message: "User deleted.", type: "success" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>User management</h1>
          <p className="lede tight">
            Assign clerk, CFO, or admin roles. You are signed in as {user.name}.
          </p>
        </div>
      </header>

      {error ? <p className="alert">{error}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((item) => {
              const isSelf = item.id === user.id;
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.email}</td>
                  <td>
                    <select
                      value={item.role}
                      disabled={busyId === item.id || isSelf}
                      onChange={(e) => updateRole(item.id, e.target.value)}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                    {savedId === item.id ? (
                      <span className="saved-tag">Saved</span>
                    ) : null}
                  </td>
                  <td>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    {isSelf ? (
                      <span className="hint">You</span>
                    ) : (
                      <button
                        type="button"
                        className="text-btn danger"
                        disabled={busyId === item.id}
                        onClick={() => removeUser(item.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
