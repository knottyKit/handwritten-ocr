import { NextResponse } from "next/server";

export async function POST(_: Request, { params }: { params: { jobId: string } }) {
  const base = process.env.OCR_API_BASE || "http://localhost:8001";

  const res = await fetch(
    `${base}/v1/jobs/${params.jobId}/extract?templateId=inner_curvature_v1`,
    { method: "POST" }
  );

  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
