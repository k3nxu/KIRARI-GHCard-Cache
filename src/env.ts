export function getStringBinding(source: object, key: string, fallback = ""): string {
  const value = Reflect.get(source, key);
  return typeof value === "string" ? value : fallback;
}
