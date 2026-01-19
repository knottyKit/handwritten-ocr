"use client";

import React, { useEffect, useState } from "react";

type ExtractResponse = {
  header?: {
    construction_number?: string;
    orderer?: string;
    construction_name?: string;
    project_title?: string;
  };
  table?: { title_raw?: string };
  assets?: { page0_image?: string; diagram_image?: string };
  rows?: any[];
};

const OCR_API_BASE =
  process.env.NEXT_PUBLIC_OCR_API_BASE ?? "http://127.0.0.1:8001";

export default function ReviewClient({ jobId }: { jobId: string }) {
  const [data, setData] = useState<ExtractResponse | null>(null);
  const [status, setStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  // Trigger extract on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus("running");
      setError(null);

      try {
        const res = await fetch(
          `${OCR_API_BASE}/v1/jobs/${jobId}/extract`,
          { method: "POST" }
        );

        const text = await res.text();
        if (!res.ok) {
          throw new Error(`FastAPI ${res.status}\n${text}`);
        }

        const json = JSON.parse(text) as ExtractResponse;
        if (!cancelled) {
          setData(json);
          setStatus("done");
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
          setStatus("error");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const pageImageUrl =
    data?.assets?.page0_image
      ? data.assets.page0_image.startsWith("http")
        ? data.assets.page0_image
        : data.assets.page0_image.startsWith("/")
          ? `${OCR_API_BASE}${data.assets.page0_image}`
          : `${OCR_API_BASE}/v1/jobs/${jobId}/asset/${data.assets.page0_image}`
      : null;

  const diagramImageUrl =
    data?.assets?.diagram_image
      ? data.assets.diagram_image.startsWith("http")
        ? data.assets.diagram_image
        : data.assets.diagram_image.startsWith("/")
          ? `${OCR_API_BASE}${data.assets.diagram_image}`
          : `${OCR_API_BASE}/v1/jobs/${jobId}/asset/${data.assets.diagram_image}`
      : null;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Curvature Inspection Review</h1>
          <div className="text-sm text-gray-500">
            Template: inner_curvature_v1 · Job: {jobId}
          </div>
        </div>

        <div className="flex gap-2">
          <button className="rounded border px-3 py-1 text-sm">
            Save Draft (local)
          </button>
          <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
            Export Excel
          </button>
        </div>
      </div>

      {/* ✅ Progress UI */}
      {status === "running" && (
        <div className="rounded border p-3">
          <div className="text-sm font-medium mb-2">Processing…</div>
          <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
            <div className="h-2 w-1/3 rounded bg-blue-600 animate-pulse" />
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Rendering PDF → preparing review data (OCR comes next)
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-semibold mb-1">Backend failed</div>
          <pre className="whitespace-pre-wrap break-words">{error}</pre>
        </div>
      )}

      <section className="rounded border p-4 space-y-4">
        <h2 className="font-medium">Previews</h2>

        <div className="space-y-2">
          <div className="text-sm text-gray-600">Page Image</div>
          {pageImageUrl ? (
            <img src={pageImageUrl} className="max-h-[400px] border" />
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded border text-gray-400">
              (Waiting for backend…)
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm text-gray-600">Diagram Crop</div>
          {diagramImageUrl ? (
            <img src={diagramImageUrl} className="max-h-[300px] border" />
          ) : (
            <div className="flex h-[160px] items-center justify-center rounded border text-gray-400">
              (No diagram yet – OCR backend will provide this)
            </div>
          )}
        </div>

        <div className="rounded border border-orange-300 bg-orange-50 p-3 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            <li>Table title is OCR raw only. Never translate.</li>
            <li>Signatures: if “–” or empty, store “–”.</li>
            <li>Numeric cells: if handwritten has “+”, keep “+”.</li>
          </ul>
        </div>
      </section>

      <section className="rounded border p-4 space-y-4">
        <h2 className="font-medium">Header (Editable)</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Construction Number" value={data?.header?.construction_number} />
          <Field label="Project Title" value={data?.header?.project_title} />
          <Field label="Orderer" value={data?.header?.orderer} />
          <Field label="Construction Name" value={data?.header?.construction_name} />
        </div>
      </section>

      <section className="rounded border p-4 space-y-2">
        <h2 className="font-medium">Table Title (OCR raw)</h2>
        <input
          className="w-full rounded border px-2 py-1 text-sm"
          defaultValue={data?.table?.title_raw ?? ""}
        />
        <div className="text-sm text-gray-400 mt-4">
          Rows (LU / LC / LB) will appear here after OCR row extraction.
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-gray-600">{label}</div>
      <input className="w-full rounded border px-2 py-1 text-sm" defaultValue={value ?? ""} />
    </div>
  );
}
