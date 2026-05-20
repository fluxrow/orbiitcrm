export type OrbitTheme = "dark" | "light";

export function normalizeOrbitTheme(theme?: string | null): OrbitTheme {
  return theme === "light" ? "light" : "dark";
}

export function getNextOrbitTheme(theme?: string | null): OrbitTheme {
  return normalizeOrbitTheme(theme) === "dark" ? "light" : "dark";
}
