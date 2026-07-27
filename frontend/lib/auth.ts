const TOKEN_KEY = "meripdf_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Send when calling PDF tools — if user is logged in, counts as unlimited server-side. */
export function optionalAuthHeaders(): Record<string, string> {
  return authHeaders();
}

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const auth = authHeaders();
  if (auth.Authorization) {
    headers.set("Authorization", auth.Authorization);
  }
  return fetch(input, { ...init, headers });
}
