import i18n from "../i18n";

/**
 * Formats a date, string timestamp, or numeric timestamp using Intl.DateTimeFormat
 * respecting the currently selected active locale in i18next (or fallback provided).
 */
export function formatDate(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
  overrideLocale?: string
): string {
  const currentLocale = overrideLocale || i18n.language || "en";
  const parsedDate = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  
  if (isNaN(parsedDate.getTime())) {
    return String(date);
  }

  return new Intl.DateTimeFormat(currentLocale, options).format(parsedDate);
}
