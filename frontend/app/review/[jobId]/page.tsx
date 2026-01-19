import React from "react";

type PageProps = {
  params: Promise<{ jobId: string }>;
};


type ExtractResponse = {
  template?: string;
  header?: {
    construction_number?: string;
    orderer?: string;
    construction_name?: string;
    project_title?: string;
  };
  table?: {
    title_raw?: string;
  };
  assets?: {
    page0_image?: string;
    diagram_image?: string;
    table_image?: string;
    debug_bbox?: string;
    table_debug_grid?: string;
    header_crops?: Record<string, string>;
  };
  rows?: Array<{
    part_number?: string;
    lu?: string[];
    lc?: string[];
    lb?: string[];
    inspection_date?: string;
    confirmer?: string;
  }>;
};

const OCR_API_BASE = process.env.OCR_API_BASE ?? "http://127.0.0.1:8001";

function absAssetUrl(jobId: string, maybe: string | undefined) {
  if (!maybe) return null;
  if (maybe.startsWith("http")) return maybe;
  if (maybe.startsWith("/")) return `${OCR_API_BASE}${maybe}`;
  return `${OCR_API_BASE}/v1/jobs/${jobId}/asset/${maybe}`;
}

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: PageProps) {
  const { jobId } = await params;

  let data: ExtractResponse | null = null;
  let fetchError: string | null = null;
  let rawText: string | null = null;

  try {
    const res = await fetch(`${OCR_API_BASE}/v1/jobs/${jobId}/extract`, {
      method: "POST",
      cache: "no-store",
    });

    rawText = await res.text();

    if (!res.ok) {
      fetchError = `FastAPI ${res.status}\n${rawText}`;
    } else {
      data = JSON.parse(rawText);
    }
  } catch (err: any) {
    fetchError = err?.message ?? String(err);
  }

  const pageImageUrl = absAssetUrl(jobId, data?.assets?.page0_image);
  const diagramImageUrl = absAssetUrl(jobId, data?.assets?.diagram_image);
  const tableImageUrl = absAssetUrl(jobId, data?.assets?.table_image);
  const debugBboxUrl = absAssetUrl(jobId, data?.assets?.debug_bbox);
  const tableGridUrl = absAssetUrl(jobId, data?.assets?.table_debug_grid);

  const rows = data?.rows ?? [];
  const titleRaw = data?.table?.title_raw ?? "";

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Curvature Inspection Review</h1>
          <div className="text-sm text-gray-500">
            Template: {data?.template ?? "inner_curvature_v1"} · Job: {jobId}
          </div>
        </div>

        <div className="flex gap-2">
          <a
            href="/"
            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Back
          </a>
          <button className="rounded border px-3 py-1 text-sm">
            Save Draft (local)
          </button>
          <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
            Export Excel
          </button>
        </div>
      </div>

      {/* Backend error */}
      {fetchError && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-semibold mb-1">Backend fetch failed</div>
          <pre className="whitespace-pre-wrap break-words">{fetchError}</pre>
        </div>
      )}

      {/* Previews */}
      <section className="rounded border p-4 space-y-4">
        <h2 className="font-medium">Previews</h2>

        <div className="space-y-2">
          <div className="text-sm text-gray-600">Page Image</div>
          {pageImageUrl ? (
            <img src={pageImageUrl} className="max-h-[420px] border" />
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded border text-gray-400">
              (No image yet)
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm text-gray-600">Diagram Crop</div>
          {diagramImageUrl ? (
            <img src={diagramImageUrl} className="max-h-[320px] border" />
          ) : (
            <div className="flex h-[160px] items-center justify-center rounded border text-gray-400">
              (No diagram yet)
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm text-gray-600">Table Crop (debug)</div>
          {tableImageUrl ? (
            <img src={tableImageUrl} className="max-h-[320px] border" />
          ) : (
            <div className="flex h-[160px] items-center justify-center rounded border text-gray-400">
              (No table crop yet)
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm text-gray-600">Debug BBox Overlay</div>
          {debugBboxUrl ? (
            <img src={debugBboxUrl} className="max-h-[320px] border" />
          ) : (
            <div className="flex h-[160px] items-center justify-center rounded border text-gray-400">
              (No debug overlay yet)
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm text-gray-600">Table Debug Grid</div>
          {tableGridUrl ? (
            <img src={tableGridUrl} className="max-h-[320px] border" />
          ) : (
            <div className="flex h-[160px] items-center justify-center rounded border text-gray-400">
              (No table grid debug yet)
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

      {/* Header */}
      <section className="rounded border p-4 space-y-4">
        <h2 className="font-medium">Header (Editable)</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Construction Number"
            value={data?.header?.construction_number}
          />
          <Field label="Project Title" value={data?.header?.project_title} />
          <Field label="Orderer" value={data?.header?.orderer} />
          <Field
            label="Construction Name"
            value={data?.header?.construction_name}
          />
        </div>
      </section>

      {/* Table Title */}
      <section className="rounded border p-4 space-y-2">
        <h2 className="font-medium">Table Title (OCR raw)</h2>
        <input
          className="w-full rounded border px-2 py-1 text-sm"
          defaultValue={titleRaw}
          placeholder="(empty — either OCR missed it or the title crop box is wrong)"
        />
        {!titleRaw && (
          <div className="text-sm text-amber-700">
            Title is empty. If your table_debug_grid.png red TITLE_RAW box
            doesn’t cover only the title text, OCR will return blank.
          </div>
        )}
      </section>

      {/* Rows */}
      <section className="rounded border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Rows (LU / LC / LB)</h2>
          <div className="text-sm text-gray-500">
            {rows.length ? `${rows.length} row(s)` : "0 row(s)"}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            No rows returned by backend.
            <div className="mt-2 text-amber-800">
              Check these in order:
              <ol className="list-decimal pl-5 mt-1 space-y-1">
                <li>
                  Open <b>table_debug_grid</b> and verify PART_COL / GRID /
                  INSPECT_DATE / CONFIRMER boxes are not cutting headers or
                  missing cells.
                </li>
                <li>
                  Confirm backend actually returns <code>rows</code> by checking
                  “Raw response” below.
                </li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="overflow-auto border rounded">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b">
                  <Th>Part</Th>
                  <Th colSpan={4}>LU</Th>
                  <Th colSpan={4}>LC</Th>
                  <Th colSpan={4}>LB</Th>
                  <Th>Date</Th>
                  <Th>Confirmer</Th>
                </tr>
                <tr className="border-b">
                  <Th />
                  {[1, 2, 3, 4].map((n) => (
                    <Th key={`lu${n}`}>{n}</Th>
                  ))}
                  {[1, 2, 3, 4].map((n) => (
                    <Th key={`lc${n}`}>{n}</Th>
                  ))}
                  {[1, 2, 3, 4].map((n) => (
                    <Th key={`lb${n}`}>{n}</Th>
                  ))}
                  <Th />
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-b">
                    <Td className="font-medium">{r.part_number ?? ""}</Td>
                    {(r.lu ?? ["", "", "", ""]).slice(0, 4).map((v, i) => (
                      <Td key={`lu-${idx}-${i}`}>{v ?? ""}</Td>
                    ))}
                    {(r.lc ?? ["", "", "", ""]).slice(0, 4).map((v, i) => (
                      <Td key={`lc-${idx}-${i}`}>{v ?? ""}</Td>
                    ))}
                    {(r.lb ?? ["", "", "", ""]).slice(0, 4).map((v, i) => (
                      <Td key={`lb-${idx}-${i}`}>{v ?? ""}</Td>
                    ))}
                    <Td>{r.inspection_date ?? ""}</Td>
                    <Td>{r.confirmer ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Raw response */}
      <section className="rounded border p-4 space-y-2">
        <h2 className="font-medium">Raw response (debug)</h2>
        <pre className="text-xs whitespace-pre-wrap break-words bg-gray-50 border rounded p-3 max-h-[280px] overflow-auto">
          {rawText ?? "(no response)"}
        </pre>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-gray-600">{label}</div>
      <input
        className="w-full rounded border px-2 py-1 text-sm"
        defaultValue={value ?? ""}
      />
    </div>
  );
}

function Th({
  children,
  colSpan,
}: {
  children?: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <th
      colSpan={colSpan}
      className="px-2 py-2 text-left font-medium text-gray-700"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-2 py-2 ${className ?? ""}`}>{children}</td>;
}
