export const ADMIN_ID = "8144744644";
export const ADMIN_ALIASES = [ADMIN_ID, "@zoom0100", "zoom0100"];

export function isAdmin(adminId: string): boolean {
  const normalized = adminId.trim().toLowerCase();
  if (!normalized) return false;
  return ADMIN_ALIASES.some((value) => value.toLowerCase() === normalized);
}
