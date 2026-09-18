import { NextResponse } from "next/server";

/**
 * Web Share Target fallback. The service worker normally answers this POST
 * itself, parks the shared files in Cache Storage and redirects to /import.
 * Before the worker is active (first launch) the request reaches the server
 * instead; the files cannot be kept, so send the person to /import to pick
 * them again.
 */
export async function POST(request: Request) {
  return NextResponse.redirect(new URL("/import?shared=missed", request.url), 303);
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/import", request.url), 303);
}
