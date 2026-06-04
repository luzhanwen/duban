export function toText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    if (typeof value.name === "string") return value.name;
    if (typeof value.value === "string") return value.value;
    if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
      return value.toString();
    }
    return "";
  }
  return String(value);
}

export function cleanText(value) {
  return toText(value).replace(/\s+/g, " ").trim();
}
