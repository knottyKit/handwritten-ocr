import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: { jobId: string; filename: string } }) {
  const base = process.env.OCR_API_BASE || "http://localhost:8001";

  const res = await fetch(`${base}/v1/jobs/${params.jobId}/assets/${params.filename}`);
  const body = await res.arrayBuffer();

  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" },
  });
}
