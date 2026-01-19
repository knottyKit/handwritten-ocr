"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const OCR_API_BASE =
  process.env.NEXT_PUBLIC_OCR_API_BASE ?? "http://127.0.0.1:8001";

type CreateJobResponse = {
  jobId: string;
  template?: string;
};

export default function Home() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => !!file && !busy, [file, busy]);

  async function onUpload() {
    setErr(null);
    setPct(0);
    setStage("Preparing upload...");
    if (!file) return;

    setBusy(true);

    try {
      const fd = new FormData();
      fd.append("file", file, file.name);

      // Use XHR so we can show upload progress
      const resText = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${OCR_API_BASE}/v1/jobs`, true);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const p = Math.round((e.loaded / e.total) * 100);
            setPct(p);
            setStage(p < 100 ? `Uploading... ${p}%` : "Upload finished. Waiting for server...");
          } else {
            setStage("Uploading...");
          }
        };

        xhr.onload = () => {
          resolve(xhr.responseText);
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.ontimeout = () => reject(new Error("Upload timed out"));
        // allow long wait (5+ minutes) if you want:
        xhr.timeout = 0;

        xhr.send(fd);
      });

      let parsed: any;
      try {
        parsed = JSON.parse(resText);
      } catch {
        throw new Error(`FastAPI returned non-JSON:\n${resText.slice(0, 500)}`);
      }

      if (!parsed?.jobId) {
        throw new Error(`FastAPI response missing jobId:\n${resText}`);
      }

      setStage("Job created. Opening review page...");
      const jobId = (parsed as CreateJobResponse).jobId;

      // go to review page (review will call /extract)
      router.push(`/review/${jobId}`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Handwritten OCR</h1>
      <div className="text-sm text-gray-500 mb-4">
        Curvature inspection → upload → OCR → review → export Excel
      </div>

      <div className="rounded border p-4 space-y-3">
        <div className="font-medium">Upload PDF/Image</div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <button
          disabled={!canSubmit}
          onClick={onUpload}
          className={`rounded px-3 py-2 text-sm text-white ${
            canSubmit ? "bg-blue-600" : "bg-gray-400"
          }`}
        >
          {busy ? "Uploading..." : "Upload & Extract"}
        </button>

        {/* Progress / status */}
        {(busy || pct > 0 || stage) && (
          <div className="space-y-2">
            <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
              <div
                className="h-2 bg-blue-600 transition-all"
                style={{ width: `${Math.min(Math.max(pct, 2), 100)}%` }}
              />
            </div>
            <div className="text-sm text-gray-600">
              {stage || "Working..."}
            </div>
            <div className="text-xs text-gray-400">
              Note: if the backend does model initialization, this can take minutes. Don’t close the tab.
            </div>
          </div>
        )}

        {/* Error box */}
        {err && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-semibold mb-1">Upload failed</div>
            <pre className="whitespace-pre-wrap break-words">{err}</pre>
            <div className="flex gap-2 mt-2">
              <button
                className="rounded border px-3 py-1 text-sm"
                onClick={() => {
                  setErr(null);
                  setPct(0);
                  setStage("");
                }}
              >
                Back
              </button>
              <button
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
                onClick={onUpload}
                disabled={!file || busy}
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
