import { NextResponse, type NextRequest } from "next/server";

const REALM = "CV-Dash";

export function middleware(request: NextRequest) {
  const expected = process.env.BASIC_AUTH_PASSWORD;

  // If no password is configured (e.g. local dev without the env set), let everything through.
  if (!expected) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    // Format is "username:password". Username is ignored; only the password must match.
    const colonIdx = decoded.indexOf(":");
    const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;
    if (password === expected) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

// Match every route EXCEPT static assets, Next internals, and the cron endpoint
// (the cron job hits /api/cron/snapshot directly and must not be auth-gated).
export const config = {
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico).*)"],
};
