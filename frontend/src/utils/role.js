export function homeForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "cfo") return "/overview";
  if (role === "accountant") return "/accountant/movement";
  return "/entry";
}

export function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "cfo") return "Chief Financial Officer";
  if (role === "accountant") return "Accountant";
  return "Data clerk";
}

export function enteredByLabel(user) {
  if (!user?.name) return "—";
  if (user.role === "accountant") return `${user.name} (Accountant)`;
  return user.name;
}
