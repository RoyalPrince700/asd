import { isLocationlessCompany, companyLabel } from "../constants/companies";

export function isAssignedStaff(user) {
  if (!user) return false;
  if (isLocationlessCompany(user.assignedCompany)) return true;
  if (user.location) return true;
  return false;
}

export function staffCompany(user) {
  if (isLocationlessCompany(user.assignedCompany)) return user.assignedCompany;
  if (user.location) return "accessible";
  return "";
}

export function staffAssignmentLabel(user) {
  if (isLocationlessCompany(user.assignedCompany)) {
    return companyLabel(user.assignedCompany);
  }
  if (user.location) return user.location;
  return "";
}
