export function homeForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "cfo") return "/overview";
  if (role === "accountant") return "/accountant/movement";
  if (role === "trifone") return "/trifone/movement";
  if (role === "press") return "/press/movement";
  return "/entry";
}

export function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "cfo") return "Chief Financial Officer";
  if (role === "accountant") return "Accountant";
  if (role === "trifone") return "Trifone";
  if (role === "press") return "Press";
  return "Data clerk";
}

export function enteredByLabel(user) {
  if (!user?.name) return "—";
  if (user.role === "accountant") return `${user.name} (Accountant)`;
  if (user.role === "trifone") return `${user.name} (Trifone)`;
  if (user.role === "press") return `${user.name} (Press)`;
  return user.name;
}
