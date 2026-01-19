import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// If you deploy to platforms with function limits (e.g., Vercel), this matters.
// Local dev ignores it, but it's safe to keep.
export const maxDuration = 300;

const OCR_API_BASE = process.env.OCR_API_BASE ?? "http://127.0.0.1:8001";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file. Expected multipart field name = 'file'." },
        { status: 400 }
      );
    }

    const fd = new FormData();
    fd.append("file", file, file.name);

    // IMPORTANT: no AbortController timeout here.
    const r = await fetch(`${OCR_API_BASE}/v1/jobs`, {
      method: "POST",
      body: fd,
      // cache: "no-store" is okay but not required here
    });

    const text = await r.text();

    // Pass through status + body (helps debugging a lot)
    return new NextResponse(text, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") || "application/json",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
