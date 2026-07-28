// frontend/lib/api.ts

const getApiBase = (): string => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }
    if (hostname.includes("meripdf.com")) {
      return "https://api.meripdf.com";
    }
    if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("127.0.0.1") && !process.env.NEXT_PUBLIC_API_URL.includes("localhost")) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
};

export const API_BASE = getApiBase();

export const api = (endpoint: string) =>
  `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
