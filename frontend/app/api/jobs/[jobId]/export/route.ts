import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  const base = process.env.OCR_API_BASE || "http://localhost:8001";
  const reviewed = await req.json();

  const res = await fetch(`${base}/v1/export_excel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId: params.jobId, reviewed }),
  });

  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      "content-type":
        res.headers.get("content-type") ??
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":
        res.headers.get("content-disposition") ??
        `attachment; filename="inner_curvature_${params.jobId}.xlsx"`,
    },
  });
}
