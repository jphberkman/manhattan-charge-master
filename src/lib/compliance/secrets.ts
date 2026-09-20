const DEFAULT_ADMIN_PASSWORD = "shopforcare-admin-2026";
const DEFAULT_JWT_SECRET = "development-secret-key";

let checked = false;

/**
 * Warn once in production when secrets are missing or still the committed defaults.
 * Admin login is separately disabled when ADMIN_PASSWORD is unset (see admin auth route).
 */
export function assertProductionSecrets(): void {
  if (checked) return;
  checked = true;
  if (process.env.NODE_ENV !== "production") return;

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT_SECRET) {
    console.error(
      "[compliance] JWT_SECRET must be a unique production value (SOC 2 / HIPAA access control).",
    );
  }

  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
    console.error(
      "[compliance] ADMIN_PASSWORD must be set; the default password is disabled in production.",
    );
  }
}

export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!secret || secret === DEFAULT_JWT_SECRET)
  ) {
    console.error("[compliance] JWT_SECRET is missing or using the development default.");
  }
  return new TextEncoder().encode(secret || DEFAULT_JWT_SECRET);
}

export { DEFAULT_ADMIN_PASSWORD };
