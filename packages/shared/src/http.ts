/**
 * Every client that speaks to the OpenBot server (`OpenBotClient` in the app,
 * the MCP skill bridge) sends the same shape of request: a Bearer-authed,
 * optionally-JSON-bodied fetch. This is that one call, so header-building and
 * error-handling do not drift between them.
 */
export interface AuthedRequest {
  baseUrl: string;
  token: string;
  path: string;
  method?: string;
  body?: unknown;
}

/** Throws {@link HttpError} on a non-2xx response; callers decide what to say about it. */
export async function authedFetch(request: AuthedRequest): Promise<Response> {
  const { baseUrl, token, path, method = 'GET', body } = request;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...bodyHeaders(body),
    },
    ...(body === undefined ? {} : { body: encodeBody(body) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new HttpError(res.status, detail);
  }
  return res;
}

function isForm(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function bodyHeaders(body: unknown): Record<string, string> {
  if (body === undefined || isForm(body)) return {};
  return { 'content-type': 'application/json' };
}

function encodeBody(body: unknown): string | FormData {
  if (isForm(body)) return body;
  return JSON.stringify(body);
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Request failed with status ${status}`);
    this.name = 'HttpError';
  }
}
