export interface Word {
  w: string;
  start_ms: number;
  end_ms: number;
}

export interface VideoRow {
  id: string;
  type: "hook" | "body" | "cta" | "extra";
  original_filename: string | null;
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed";
  error_pt: string | null;
  duration_ms: number | null;
  sort_order: number;
}

export interface JobRow {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  progress: number;
  step_label: string | null;
  error_pt: string | null;
  ref_id: string | null;
  result: { assetId?: string; count?: number } | null;
  created_at: string;
}

export interface SegmentRow {
  id: string;
  source_video_id: string;
  type: VideoRow["type"];
  start_word_idx: number;
  end_word_idx: number;
  start_ms: number;
  end_ms: number;
  label: string | null;
}

export interface RenderRow {
  id: string;
  combination_id: string;
  code: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  duration_ms: number | null;
  error_pt: string | null;
}

export interface ProjectData {
  id: string;
  name: string;
  status: string;
  canWrite: boolean;
  videos: VideoRow[];
  words: Record<string, Word[]>;
  segments: SegmentRow[];
  jobs: JobRow[];
  combinationCount: number;
  renders: RenderRow[];
  credits: number | null;
}
