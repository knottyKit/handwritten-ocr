import type { CurvatureDoc } from "./types";

export function mockCurvatureDoc(jobId: string): CurvatureDoc {
  return {
    templateId: "inner_curvature_v1",
    jobId,
    header: {
      construction_number: { value: "5143122" },
      orderer: { value: "エネルギーディビジョン レシプロエンジン技術部" },
      construction_name: { value: "内槽補修用MHFS液化水素燃料タンク製作" },
      project_title: { value: "内槽胴板 曲率検査" },
      company: {
        name: { value: "川崎重工業株式会社" },
        department: { value: "プラント品質保証部" },
        section: { value: "品質二課" },
      },
      signatures: {
        approval: { value: "-" },
        examination: { value: "-" },
        create: { value: "-" },
      },
    },
    table: {
      title_raw: { value: "CURVATURE R1150 曲率 R1150" },
      rows: [
        row("DB11-3A", ["+1","+1","+1","+1"], ["+1","+1","+0.5","+0.5"], ["+1","+1","+1","+1"], "4/2", "葛西"),
        row("DB11-3B", ["+0.5","+1","+0.5","+1"], ["+1","+1","+0.5","+1"], ["+1","+1","+1","+1.5"], "4/2", "〃"),
        row("DB11-3C", ["+1.5","+1","+1.5","+1"], ["+1.5","+1","+1.5","+1"], ["+1","+1","+1.5","+1.5"], "4/1", "〃"),
      ],
    },
    assets: {
      // placeholders; when OCR exists you'll point to /api/jobs/{jobId}/asset/page0.png etc.
      page0_image: "",
      diagram_image: "",
    },
  };
}

function row(
  part: string,
  lu: string[],
  lc: string[],
  lb: string[],
  date: string,
  confirmer: string
) {
  return {
    part_number: { value: part },
    lu: lu.map((v) => ({ value: v })),
    lc: lc.map((v) => ({ value: v })),
    lb: lb.map((v) => ({ value: v })),
    inspection_date: { value: date },
    confirmer: { value: confirmer },
  };
}
