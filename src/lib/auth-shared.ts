export function getAuthSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_SESSION_SECRET harus diatur dengan minimal 32 karakter.");
  }
  return secret;
}

export function assertAuthSessionConfigured() {
  getAuthSessionSecret();
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
