type FeatureValue = string | number | boolean | undefined | null;

function normalize(value: FeatureValue): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "true" || trimmed === "1" || trimmed === "on" || trimmed === "yes") {
    return true;
  }
  if (trimmed === "false" || trimmed === "0" || trimmed === "off" || trimmed === "no") {
    return false;
  }
  return Boolean(trimmed);
}

export function isFeatureEnabled(key: string): boolean {
  const globalScope =
    typeof window !== "undefined"
      ? ((window as unknown as { [k: string]: FeatureValue }) ?? {})
      : {};
  const nested = typeof window !== "undefined" ? (window as any)?.__FEATURES__ ?? {} : {};
  const env = (import.meta as any)?.env ?? {};
  const envKeyVariants = [key, `VITE_${key}`];

  const directValue = globalScope[key];
  if (directValue !== undefined) {
    return normalize(directValue);
  }

  const nestedValue = nested[key];
  if (nestedValue !== undefined) {
    return normalize(nestedValue);
  }

  for (const variant of envKeyVariants) {
    const envValue = env[variant];
    if (envValue !== undefined) {
      return normalize(envValue);
    }
  }

  return false;
}
