// frontend/lib/api.ts

const getApiBase = (): string => {
  if (typeof window !== "undefined") {
    // If an environment variable is explicitly set and is not localhost, use it
    if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("127.0.0.1") && !process.env.NEXT_PUBLIC_API_URL.includes("localhost")) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
    // Dynamically fallback to the current hostname running the client
    const hostname = window.location.hostname;
    const apiHost = hostname === "localhost" ? "127.0.0.1" : hostname;
    return `http://${apiHost}:8000`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
};

export const API_BASE = getApiBase();

export const api = (endpoint: string) =>
  `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
