export function homeForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "cfo" || role === "md") return "/overview";
  if (role === "accountant") return "/accountant/movement";
  if (role === "trifone") return "/trifone/movement";
  if (role === "press") return "/press/movement";
  if (role === "press_manager") return "/press-manager/approvals";
  return "/entry";
}

export function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "cfo") return "Chief Financial Officer";
  if (role === "md") return "Managing Director";
  if (role === "accountant") return "Accountant";
  if (role === "trifone") return "Trifone";
  if (role === "press") return "Press";
  if (role === "press_manager") return "Press manager";
  return "Data clerk";
}

export function enteredByLabel(user) {
  if (!user?.name) return "—";
  if (user.role === "accountant") return `${user.name} (Accountant)`;
  if (user.role === "trifone") return `${user.name} (Trifone)`;
  if (user.role === "press") return `${user.name} (Press)`;
  if (user.role === "press_manager") return `${user.name} (Press manager)`;
  return user.name;
}
