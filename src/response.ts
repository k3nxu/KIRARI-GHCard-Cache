export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(value), {
    ...init,
    headers,
  });
}

export function errorResponse(status: number, message: string, code = "invalid_request"): Response {
  return jsonResponse(
    {
      error: code,
      message,
    },
    { status },
  );
}

export function headResponse(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
