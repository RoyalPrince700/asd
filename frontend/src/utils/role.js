export function homeForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "cfo") return "/overview";
  return "/entry";
}

export function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "cfo") return "Chief Financial Officer";
  return "Data clerk";
}
