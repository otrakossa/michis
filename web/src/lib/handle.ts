// Normaliza un handle de red social: sin espacios, sin @ inicial, minúsculas.
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

// Válido para twitter/tiktok: letras/números/_/. , 1-30 chars (ya normalizado).
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_.]{1,30}$/.test(handle);
}
