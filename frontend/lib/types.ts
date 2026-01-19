export type Cell = {
  value: string | number | null;
  raw?: string;
  conf?: number;
  needsReview?: boolean;
};

export type CurvatureRow = {
  part_number: Cell;
  lu: Cell[]; // 4
  lc: Cell[]; // 4
  lb: Cell[]; // 4
  inspection_date: Cell;
  confirmer: Cell;
};

export type CurvatureDoc = {
  templateId: "inner_curvature_v1";
  jobId: string;

  header: {
    construction_number: Cell;
    orderer: Cell;
    construction_name: Cell;
    project_title: Cell;
    company: {
      name: Cell;
      department: Cell;
      section: Cell;
    };
    signatures: {
      approval: Cell;
      examination: Cell;
      create: Cell;
    };
  };

  table: {
    title_raw: Cell; // show OCR raw, never translate
    rows: CurvatureRow[];
  };

  assets?: {
    page0_image?: string;   // optional preview
    diagram_image?: string; // optional preview
  };
};
