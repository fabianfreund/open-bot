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
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new HttpError(res.status, detail);
  }
  return res;
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
