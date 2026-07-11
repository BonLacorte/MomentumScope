const OKX_ORIGIN = "https://www.okx.com";

type PagesContext = {
  request: Request;
  params: {
    path?: string | string[];
  };
};

export async function onRequest(context: PagesContext): Promise<Response> {
  return proxyMarketDataRequest(context, OKX_ORIGIN);
}

async function proxyMarketDataRequest({ request, params }: PagesContext, origin: string): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        ...corsHeaders(),
        Allow: "GET, HEAD, OPTIONS",
        "Cache-Control": "no-store",
      },
    });
  }

  const upstreamUrl = buildUpstreamUrl(request.url, params.path, origin);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: {
      Accept: request.headers.get("Accept") ?? "application/json",
      "User-Agent": "MomentumScope/0.1 (+https://github.com/BonLacorte/MomentumScope)",
    },
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders(upstreamResponse.headers),
  });
}

function buildUpstreamUrl(requestUrl: string, path: string | string[] | undefined, origin: string): string {
  const request = new URL(requestUrl);
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  const upstream = new URL(`/${segments.map(encodeURIComponent).join("/")}`, origin);
  upstream.search = request.search;
  return upstream.toString();
}

function responseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers(corsHeaders());
  const contentType = upstreamHeaders.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("Cache-Control", "no-store");
  return headers;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
  };
}
