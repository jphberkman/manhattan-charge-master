const COOKIE_NAME = "admin-session";
const COOKIE_VALUE = "authenticated";

/** Check if a server-side Request has a valid admin session cookie */
export function isAdminRequest(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") ?? "";
  return cookieHeader.split(";").some((c) => {
    const [name, val] = c.trim().split("=");
    return name === COOKIE_NAME && val === COOKIE_VALUE;
  });
}

/** Client-side: check if admin-session cookie exists */
export function hasAdminCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${COOKIE_NAME}=${COOKIE_VALUE}`));
}

export { COOKIE_NAME, COOKIE_VALUE };
