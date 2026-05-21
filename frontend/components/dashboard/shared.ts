export function formatEventDate(unix?: number): string {
  if (!unix) return "—";
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function buildShareUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/c/${id}`;
}

export function toDateInputValue(unix?: number): string {
  if (!unix) return "";
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear().toString().padStart(4, "0");
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function fromDateInputValue(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return Math.floor(date.getTime() / 1000);
}
