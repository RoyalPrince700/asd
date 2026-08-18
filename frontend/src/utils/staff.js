export function isAssignedStaff(user) {
  if (!user) return false;
  if (user.assignedCompany === "trifone") return true;
  if (user.location) return true;
  return false;
}

export function staffCompany(user) {
  if (user?.assignedCompany === "trifone") return "trifone";
  if (user?.location) return "accessible";
  return "";
}

export function staffAssignmentLabel(user) {
  if (user?.assignedCompany === "trifone") return "Trifone";
  if (user?.location) return user.location;
  return "";
}
