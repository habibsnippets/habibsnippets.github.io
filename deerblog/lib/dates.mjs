const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

export function formatDate(value, pattern = "d M, Y") {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const map = {
    d: () => String(day).padStart(2, "0"),
    j: () => String(day),
    m: () => String(month + 1).padStart(2, "0"),
    n: () => String(month + 1),
    Y: () => String(year),
    y: () => String(year).slice(-2),
    F: () => MONTHS_FULL[month],
    M: () => MONTHS_SHORT[month],
    D: () => DAYS_SHORT[date.getDay()],
    l: () => DAYS_FULL[date.getDay()],
    S: () => ordinal(day),
    H: () => String(hours).padStart(2, "0"),
    G: () => String(hours),
    h: () => String(hours % 12 || 12).padStart(2, "0"),
    g: () => String(hours % 12 || 12),
    i: () => String(minutes).padStart(2, "0"),
    a: () => (hours < 12 ? "am" : "pm"),
    A: () => (hours < 12 ? "AM" : "PM"),
  };
  let out = "";
  for (const char of String(pattern || "d M, Y")) {
    out += map[char] ? map[char]() : char;
  }
  return out;
}

export function displayDate(iso, blog) {
  return formatDate(iso, blog?.dateFormat || "d M, Y");
}

export function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isoNow() {
  return new Date().toISOString();
}

export function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return "";
}

export function parseLocalDate(value) {
  if (!value) return null;
  const text = String(value).trim().replace(/\//g, "-");
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
