import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import jsPDF from "jspdf";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PositionPilot — Strategic Positioning Generator" },
      { name: "description", content: "Generate a complete positioning, ICP, messaging, GTM and SEO strategy in minutes." },
      { property: "og:title", content: "PositionPilot" },
      { property: "og:description", content: "Generate a complete positioning, ICP, messaging, GTM and SEO strategy in minutes." },
    ],
  }),
  component: Index,
});

const STAGE1_URL = "https://blabber-ahead-defective.ngrok-free.dev/webhook/positionpilot-stage1";
const APPROVE_URL = "https://blabber-ahead-defective.ngrok-free.dev/webhook/approve-run";
const STAGE2_URL = "https://blabber-ahead-defective.ngrok-free.app/webhook/positionpilot-stage2";

const FIELDS = [
  { key: "company_name", label: "Company Name", type: "input", placeholder: "Acme Inc." },
  { key: "product_description", label: "Product Description", type: "textarea", placeholder: "What does your product do?" },
  { key: "target_audience", label: "Target Audience", type: "textarea", placeholder: "Who is it for?" },
  { key: "primary_competitors", label: "Primary Competitors", type: "textarea", placeholder: "Who else solves this?" },
  { key: "core_customer_problem", label: "Core Customer Problem", type: "textarea", placeholder: "What pain are you solving?" },
  { key: "desired_outcome", label: "Desired Outcome", type: "textarea", placeholder: "What result does the customer want?" },
  { key: "business_model", label: "Business Model", type: "input", placeholder: "SaaS, marketplace, services…" },
  { key: "marketing_stage", label: "Marketing Stage", type: "select", placeholder: "Select funnel stage" },
  { key: "unique_differentiators", label: "Unique Differentiators", type: "textarea", placeholder: "What makes you different?" },
] as const;

const MARKETING_STAGES = [
  "Brand Awareness (Top of Funnel)",
  "Lead Generation (Mid Funnel)",
  "Conversion & Sales (Bottom Funnel)",
] as const;

type FormState = Record<string, string>;

type RecentRun = {
  generation_run_id: string;
  company_name: string;
  created_at: number;
  input?: FormState;
  stage1: Stage1Response;
  stage2: Stage2Response | null;
};

const RECENT_KEY = "positionpilot:recent_runs";
const RECENT_MAX = 10;

function loadRecent(): RecentRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentRun[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(runs: RecentRun[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(runs.slice(0, RECENT_MAX)));
  } catch {
    /* ignore quota */
  }
}

type Stage1Response = {
  generation_run_id?: string;
  positioning_statement?: string;
  icp_summary?: string;
  differentiation_pillars?: string[];
  buying_triggers?: string[];
  [k: string]: unknown;
};

type Stage2Response = {
  messaging_output?: {
    hero_headline?: string;
    subheadline_value_prop?: string;
    core_messaging_pillars?: Array<{ pillar_title?: string; supporting_copy?: string }>;
    conversion_hook?: string;
  };
  gtm_output?: {
    primary_distribution_channels?: string[];
    launch_sequencing_playbook?: string;
    growth_loops_identified?: string[];
    initial_30_day_milestones?: string[];
  };
  seo_output?: {
    topical_authority_clusters?: Array<{ core_pillar?: string; sub_topics?: string[] }>;
    aeo_citation_strategy?: string;
    high_intent_search_queries?: string[];
  };
  [k: string]: unknown;
};

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

function pick(obj: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  if (v == null || v === "") return [];
  if (typeof v === "string") return [v];
  return [JSON.stringify(v)];
}

function normalizeStage1(raw: unknown): Stage1Response {
  const data = (Array.isArray(raw) ? raw[0] : raw) as any;
  if (!data) return {};
  // Preserve the EXACT generation_run_id returned by Stage 1 — do NOT coerce
  // numbers via String() (loses precision on large ints) and check common key
  // variants in case the webhook nests or renames it.
  const rawId =
    data.generation_run_id ??
    data.generationRunId ??
    data.run_id ??
    data.runId ??
    data.id ??
    data.positioning_output?.generation_run_id ??
    data.icp_output?.generation_run_id;
  const generation_run_id =
    typeof rawId === "string"
      ? rawId
      : rawId != null
        ? String(rawId)
        : undefined;
  if (generation_run_id) {
    console.log("PositionPilot Stage 1 generation_run_id captured", {
      generation_run_id,
      type: typeof rawId,
    });
  } else {
    console.warn("PositionPilot Stage 1 response missing generation_run_id", data);
  }
  return {
    generation_run_id,
    positioning_statement: data.positioning_output?.positioning_statement,
    icp_summary: data.icp_output?.primary_target_persona,
    differentiation_pillars: data.positioning_output?.differentiation_pillars || [],
    buying_triggers: data.icp_output?.buying_triggers || [],
  };
}

function normalizeStage2(raw: unknown): Stage2Response {
  const r = (Array.isArray(raw) ? raw[0] : raw) as Stage2Response | undefined;
  return r || {};
}

function formatUnknownError(err: unknown, fallback: string) {
  if (err instanceof Error) {
    return [err.name, err.message, err.stack].filter(Boolean).join("\n");
  }
  return typeof err === "string" ? err : fallback;
}

async function postWebhook(url: string, payload: unknown, label: string, timeoutMs = 180_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    const details = {
      label,
      url,
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: text || "<empty body>",
    };
    console.log("PositionPilot webhook response", details);
    return { res, text, details };
  } catch (err) {
    const aborted = (err as { name?: string } | null)?.name === "AbortError";
    const message = aborted
      ? `${label} request timed out after ${Math.round(timeoutMs / 1000)}s`
      : formatUnknownError(err, `${label} request failed before a response was received`);
    console.error("PositionPilot webhook network error", { label, url, error: err, message });
    throw new Error(`${label} network error:\n${message}`);
  } finally {
    clearTimeout(timer);
  }
}

function Index() {
  const [screen, setScreen] = useState<"form" | "review" | "results">("form");
  const [form, setForm] = useState<FormState>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, ""])),
  );
  const [loading, setLoading] = useState(false);
  const [stage1, setStage1] = useState<Stage1Response | null>(null);
  const [stage2, setStage2] = useState<Stage2Response | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const upsertRecent = (run: RecentRun) => {
    setRecent((prev) => {
      const next = [run, ...prev.filter((r) => r.generation_run_id !== run.generation_run_id)].slice(0, RECENT_MAX);
      saveRecent(next);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = FIELDS.find((f) => !form[f.key]?.trim());
    if (missing) {
      toast.error(`Please fill in ${missing.label}`);
      return;
    }
    setLoading(true);
    setError(null);
    setRawResponse(null);
    setScreen("review");
    try {
      const { res, text } = await postWebhook(STAGE1_URL, form, "Stage 1");
      setRawResponse(text);
      if (!res.ok) {
        throw new Error(`Stage 1 failed (${res.status} ${res.statusText}): ${text || "<empty body>"}`);
      }
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        throw new Error(`Stage 1 returned non-JSON response: ${text.slice(0, 500)}`);
      }
      const s1 = normalizeStage1(data);
      setStage1(s1);
      if (s1.generation_run_id) {
        upsertRecent({
          generation_run_id: s1.generation_run_id,
          company_name: form.company_name || "Untitled",
          created_at: Date.now(),
          input: form,
          stage1: s1,
          stage2: null,
        });
      }
    } catch (err) {
      const msg = formatUnknownError(err, "Failed to generate strategy");
      console.error("PositionPilot Stage 1 error", { error: err, message: msg });
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!stage1?.generation_run_id) {
      toast.error("Missing generation_run_id from stage 1 response");
      return;
    }
    setLoading(true);
    setError(null);
    setRawResponse(null);
    try {
      // 1. Approve the run
      const { res: approveRes, text: approveText } = await postWebhook(
        APPROVE_URL,
        { generation_run_id: stage1.generation_run_id },
        "Approve",
      );
      if (!approveRes.ok) {
        throw new Error(`Approve failed (${approveRes.status} ${approveRes.statusText}): ${approveText || "<empty body>"}`);
      }

      // 2. Generate full strategy
      const { res, text } = await postWebhook(
        STAGE2_URL,
        {
          generation_run_id: stage1.generation_run_id,
          company_name: form.company_name,
          marketing_stage: form.marketing_stage,
        },
        "Stage 2",
      );
      setRawResponse(text);
      if (!res.ok) {
        throw new Error(`Stage 2 failed (${res.status} ${res.statusText}): ${text || "<empty body>"}`);
      }
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Stage 2 returned non-JSON response: ${text.slice(0, 500)}`);
      }
      const s2 = normalizeStage2(data);
      setStage2(s2);
      if (stage1?.generation_run_id) {
        upsertRecent({
          generation_run_id: stage1.generation_run_id,
          company_name: form.company_name || stage1.generation_run_id,
          created_at: Date.now(),
          input: form,
          stage1,
          stage2: s2,
        });
      }
      setScreen("results");
    } catch (err) {
      const msg = formatUnknownError(err, "Failed to generate full strategy");
      console.error("PositionPilot approval error", { error: err, message: msg });
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    setStage1(null);
    setStage2(null);
    setError(null);
    setRawResponse(null);
    setScreen("form");
  };

  const openRun = (run: RecentRun) => {
    setStage1(run.stage1);
    setStage2(run.stage2);
    setScreen(run.stage2 ? "results" : "review");
  };

  const prefillFromRun = (run: RecentRun) => {
    const blank = Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as FormState;
    const source = run.input ?? {};
    const next: FormState = { ...blank };
    for (const f of FIELDS) {
      const v = (source as Record<string, unknown>)[f.key];
      next[f.key] = typeof v === "string" ? v : v != null ? String(v) : "";
    }
    if (!next.company_name) next.company_name = run.company_name || "";
    setForm(next);
    setScreen("form");
    toast.success(`Loaded "${run.company_name}" into the form`);
  };

  // jsPDF's default Helvetica font uses WinAnsi encoding and cannot render
  // characters like → ←  — “ ” ’ • etc. Replace them with ASCII equivalents
  // before drawing, otherwise glyphs render as garbage (e.g. "!'" for "→").
  const sanitizeForPdf = (input: string): string =>
    input
      .replace(/\u2192/g, "->")
      .replace(/\u2190/g, "<-")
      .replace(/\u2194/g, "<->")
      .replace(/\u21D2/g, "=>")
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/\u2022/g, "*")
      .replace(/\u00A0/g, " ")
      .replace(/\u2026/g, "...")
      .replace(/[^\x00-\xFF]/g, "?");

  const downloadPdf = () => {
    if (!stage1 && !stage2) return;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const maxW = pageW - margin * 2;
    let y = margin;

    const ensureSpace = (h: number) => {
      if (y + h > pageH - margin) {
        doc.addPage();
        y = margin;
      }
    };
    const writeWrapped = (text: string, size: number, style: "normal" | "bold" = "normal") => {
      if (!text) return;
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(sanitizeForPdf(text), maxW) as string[];
      const lh = size * 1.35;
      for (const line of lines) {
        ensureSpace(lh);
        doc.text(line, margin, y);
        y += lh;
      }
    };
    const sectionDivider = (label: string) => {
      doc.addPage();
      y = margin;
      // Accent bar
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, maxW, 36, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(sanitizeForPdf(label.toUpperCase()), margin + 12, y + 24);
      doc.setTextColor(0, 0, 0);
      y += 36 + 20;
    };
    const subheading = (t: string) => {
      y += 8;
      writeWrapped(t, 13, "bold");
      // Underline
      ensureSpace(6);
      doc.setDrawColor(180, 180, 180);
      doc.line(margin, y - 2, margin + 60, y - 2);
      y += 4;
    };
    const para = (t?: string) => { if (t) { writeWrapped(t, 11); y += 6; } };
    const bullets = (items?: string[]) => {
      if (!items?.length) return;
      for (const it of items) writeWrapped("- " + it, 11);
      y += 6;
    };

    const company = form.company_name || stage1?.generation_run_id || "PositionPilot";

    // === COVER PAGE ===
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, pageH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("POSITIONPILOT", margin, margin + 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Strategic Positioning, On Demand", margin, margin + 38);

    // Company name large
    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    const companyLines = doc.splitTextToSize(sanitizeForPdf(company), maxW) as string[];
    let cy = pageH / 2 - 60;
    for (const line of companyLines) {
      doc.text(line, margin, cy);
      cy += 46;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(20);
    doc.text("GTM Strategy Report", margin, cy + 10);

    // Footer info
    doc.setFontSize(11);
    const dateStr = new Date().toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
    doc.text(sanitizeForPdf(dateStr), margin, pageH - margin - 40);
    if (form.marketing_stage) {
      doc.setFont("helvetica", "bold");
      doc.text("Marketing Stage:", margin, pageH - margin - 20);
      doc.setFont("helvetica", "normal");
      doc.text(sanitizeForPdf(form.marketing_stage), margin + 110, pageH - margin - 20);
    }
    doc.setTextColor(0, 0, 0);

    sectionDivider("Positioning");
    subheading("Positioning Statement");
    para(stage1?.positioning_statement);
    subheading("Differentiation Pillars");
    bullets(stage1?.differentiation_pillars);

    sectionDivider("ICP — Ideal Customer Profile");
    subheading("ICP Summary");
    para(stage1?.icp_summary);
    subheading("Buying Triggers");
    bullets(stage1?.buying_triggers);

    const m = stage2?.messaging_output;
    sectionDivider("Messaging");
    subheading("Hero Headline"); para(m?.hero_headline);
    subheading("Subheadline / Value Prop"); para(m?.subheadline_value_prop);
    subheading("Conversion Hook"); para(m?.conversion_hook);
    subheading("Core Messaging Pillars");
    if (m?.core_messaging_pillars?.length) {
      for (const p of m.core_messaging_pillars) {
        writeWrapped(p.pillar_title || "", 11, "bold");
        para(p.supporting_copy);
      }
    }

    const g = stage2?.gtm_output;
    sectionDivider("Go-To-Market");
    subheading("Primary Distribution Channels"); bullets(g?.primary_distribution_channels);
    subheading("Growth Loops Identified"); bullets(g?.growth_loops_identified);
    subheading("Launch Sequencing Playbook"); para(g?.launch_sequencing_playbook);
    subheading("Initial 30-Day Milestones"); bullets(g?.initial_30_day_milestones);

    const s = stage2?.seo_output;
    sectionDivider("SEO");
    subheading("AEO Citation Strategy"); para(s?.aeo_citation_strategy);
    subheading("High-Intent Search Queries"); bullets(s?.high_intent_search_queries);
    subheading("Topical Authority Clusters");
    if (s?.topical_authority_clusters?.length) {
      for (const c of s.topical_authority_clusters) {
        writeWrapped(c.core_pillar || "", 11, "bold");
        bullets(c.sub_topics);
      }
    }

    const safe = company.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "_") || "PositionPilot";
    doc.save(`${safe}.pdf`);
  };

  const deleteRun = (id: string) => {
    setRecent((prev) => {
      const next = prev.filter((r) => r.generation_run_id !== id);
      saveRecent(next);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
          <button onClick={startOver} className="text-left">
            <h1 className="text-4xl font-bold tracking-tight">PositionPilot</h1>
            <p className="text-xs text-muted-foreground">Strategic positioning, on demand</p>
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Step active={screen === "form"} done={screen !== "form"} label="1. Input" />
            <span>→</span>
            <Step active={screen === "review"} done={screen === "results"} label="2. Review" />
            <span>→</span>
            <Step active={screen === "results"} done={false} label="3. Strategy" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {error && (
          <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
            <div className="text-sm font-semibold text-destructive">API request failed</div>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-destructive">
              {error}
            </pre>
            {rawResponse && (
              <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border border-destructive/20 p-3 font-mono text-xs leading-relaxed">
                {rawResponse}
              </pre>
            )}
          </div>
        )}

        {screen === "form" && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Tell us about your business</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We'll use this to draft your positioning foundation.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
                  <Label htmlFor={f.key} className="mb-2 block">{f.label}</Label>
                  {f.type === "textarea" ? (
                    <Textarea
                      id={f.key}
                      placeholder={f.placeholder}
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      rows={3}
                    />
                  ) : f.type === "select" ? (
                    <select
                      id={f.key}
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="">{f.placeholder}</option>
                      {MARKETING_STAGES.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={f.key}
                      placeholder={f.placeholder}
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={loading}>
                {loading ? "Generating…" : "Generate Strategy"}
              </Button>
            </div>
          </form>
        )}

        {screen === "form" && recent.length > 0 && (
          <section className="mt-12">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Recent Runs</h3>
                <p className="text-xs text-muted-foreground">Click a company to prefill the form.</p>
              </div>
            </div>
            <ul className="divide-y rounded-md border">
              {recent.slice(0, 5).map((r) => (
                <li key={r.generation_run_id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <button onClick={() => prefillFromRun(r)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.company_name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {r.stage2 ? "Full" : "Draft"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()} · {r.generation_run_id}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => prefillFromRun(r)}>
                      Prefill
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openRun(r)}>
                      View
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteRun(r.generation_run_id)}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {screen === "review" && loading && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {stage1 ? "Generating your full strategy…" : "Generating your foundation…"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {stage1
                  ? "This takes 2-3 minutes."
                  : "Calling the strategy agent. This usually takes 20–60 seconds."}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {["Positioning Statement", "ICP Summary", "Differentiation Pillars", "Buying Triggers"].map((t) => (
                <Card key={t}>
                  <CardHeader>
                    <CardTitle className="text-base">{t}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-4/6 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-3/6 animate-pulse rounded bg-muted" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {screen === "review" && !loading && error && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-destructive">Something went wrong</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The Stage 1 API call did not return usable data.
              </p>
            </div>
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Error</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-destructive">
                  {error}
                </pre>
              </CardContent>
            </Card>
            {rawResponse && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Raw response</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                    {rawResponse || "<empty>"}
                  </pre>
                </CardContent>
              </Card>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={startOver}>Back to form</Button>
            </div>
          </div>
        )}

        {screen === "review" && !loading && !error && stage1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Review your foundation</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Approve to generate the full strategy across all agents.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Section title="Positioning Statement" body={stage1.positioning_statement} />
              <Section title="ICP Summary" body={stage1.icp_summary} />
              <Section title="Differentiation Pillars" items={stage1.differentiation_pillars} />
              <Section title="Buying Triggers" items={stage1.buying_triggers} />
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={startOver} disabled={loading}>
                Start Over
              </Button>
              <Button onClick={handleApprove} size="lg" disabled={loading}>
                {loading ? "Generating…" : "Approve & Generate Full Strategy"}
              </Button>
            </div>
          </div>
        )}

        {screen === "results" && stage2 && (
          <div className="space-y-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">Your full strategy</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {form.company_name || "Your company"} · Outputs from each agent. Switch tabs to explore.
                </p>
                {form.marketing_stage && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                    Marketing Stage: {form.marketing_stage}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button onClick={downloadPdf}>Download PDF</Button>
                <Button variant="outline" onClick={startOver}>Start Over</Button>
              </div>
            </div>
            <Tabs defaultValue="positioning" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="positioning">Positioning</TabsTrigger>
                <TabsTrigger value="icp">ICP</TabsTrigger>
                <TabsTrigger value="messaging">Messaging</TabsTrigger>
                <TabsTrigger value="gtm">GTM</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
              </TabsList>

              {/* POSITIONING */}
              <TabsContent value="positioning" className="mt-8 space-y-8">
                <Block title="Positioning Statement" description="The single sentence that defines who you serve and how you win.">
                  <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">
                    {stage1?.positioning_statement || "—"}
                  </p>
                </Block>
                <Block title="Differentiation Pillars" description="The proof points that make the positioning defensible.">
                  <NumberedList items={stage1?.differentiation_pillars} />
                </Block>
              </TabsContent>

              {/* ICP */}
              <TabsContent value="icp" className="mt-8 space-y-8">
                <Block title="ICP Summary" description="Your primary target persona in one paragraph.">
                  <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">
                    {stage1?.icp_summary || "—"}
                  </p>
                </Block>
                <Block title="Buying Triggers" description="The events that move them from passive to actively shopping.">
                  <NumberedList items={stage1?.buying_triggers} />
                </Block>
                {Array.isArray((stage1 as any)?.customer_fears) && (stage1 as any).customer_fears.length > 0 && (
                  <Block title="Customer Fears" description="What keeps them from buying — and what your messaging must disarm.">
                    <NumberedList items={(stage1 as any).customer_fears as string[]} />
                  </Block>
                )}
              </TabsContent>

              {/* MESSAGING */}
              <TabsContent value="messaging" className="mt-8 space-y-10">
                <section className="rounded-2xl border bg-card p-8 md:p-12">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Hero Headline
                  </div>
                  <h3 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl">
                    {stage2.messaging_output?.hero_headline || "—"}
                  </h3>
                  {stage2.messaging_output?.subheadline_value_prop && (
                    <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
                      {stage2.messaging_output.subheadline_value_prop}
                    </p>
                  )}
                </section>

                {stage2.messaging_output?.conversion_hook && (
                  <section className="rounded-xl border-l-4 border-primary bg-primary/5 p-6">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                      Conversion Hook
                    </div>
                    <p className="mt-2 text-lg font-medium leading-relaxed text-foreground">
                      {stage2.messaging_output.conversion_hook}
                    </p>
                  </section>
                )}

                <Block title="Core Messaging Pillars" description="The repeatable themes that show up across every touchpoint.">
                  {stage2.messaging_output?.core_messaging_pillars?.length ? (
                    <ol className="space-y-5">
                      {stage2.messaging_output.core_messaging_pillars.map((p, i) => (
                        <li key={i} className="flex gap-4 rounded-lg border bg-background p-5">
                          <NumBadge n={i + 1} />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">{p.pillar_title}</div>
                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                              {p.supporting_copy}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : <Empty />}
                </Block>
              </TabsContent>

              {/* GTM */}
              <TabsContent value="gtm" className="mt-8 space-y-8">
                <Block title="Primary Distribution Channels" description="Where your earliest customers will actually find you.">
                  <NumberedList items={stage2.gtm_output?.primary_distribution_channels} />
                </Block>
                <Block title="Launch Sequencing Playbook" description="Step-by-step execution order for getting to market.">
                  <Timeline text={stage2.gtm_output?.launch_sequencing_playbook} />
                </Block>
                <Block title="Growth Loops Identified" description="Self-reinforcing mechanisms that compound over time.">
                  <NumberedList items={stage2.gtm_output?.growth_loops_identified} />
                </Block>
                <Block title="Initial 30-Day Milestones" description="What success looks like in the first month.">
                  <NumberedList items={stage2.gtm_output?.initial_30_day_milestones} />
                </Block>
              </TabsContent>

              {/* SEO */}
              <TabsContent value="seo" className="mt-8 space-y-8">
                <Block title="Topical Authority Clusters" description="Pillar topics and the supporting sub-topics that build authority.">
                  {stage2.seo_output?.topical_authority_clusters?.length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {stage2.seo_output.topical_authority_clusters.map((c, i) => (
                        <Card key={i} className="overflow-hidden">
                          <CardHeader className="bg-muted/40">
                            <CardTitle className="text-base">{c.core_pillar}</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-5">
                            {c.sub_topics?.length ? (
                              <ul className="space-y-2 text-sm text-foreground">
                                {c.sub_topics.map((s, j) => (
                                  <li key={j} className="flex gap-2 leading-relaxed">
                                    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                    <span>{s}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <Empty />}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : <Empty />}
                </Block>
                <Block
                  title="High-Intent Search Queries"
                  description={
                    form.marketing_stage === "Brand Awareness (Top of Funnel)"
                      ? "Top-of-funnel terms to build awareness and reach new audiences."
                      : form.marketing_stage === "Lead Generation (Mid Funnel)"
                        ? "Mid-funnel terms to capture solution-aware prospects."
                        : form.marketing_stage === "Conversion & Sales (Bottom Funnel)"
                          ? "Bottom-of-funnel terms to capture high-intent buyers."
                          : "Search queries worth prioritizing."
                  }
                >
                  <NumberedList items={stage2.seo_output?.high_intent_search_queries} />
                  <p className="mt-3 text-xs text-muted-foreground">
                    Search volumes not verified. Cross-check using Google Keyword Planner or Ahrefs before prioritizing.
                  </p>
                </Block>
                <Block title="AEO Citation Strategy" description="How to get cited by LLMs and answer engines.">
                  <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">
                    {stage2.seo_output?.aeo_citation_strategy || "—"}
                  </p>
                </Block>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ title, body, items }: { title: string; body?: string; items?: string[] }) {
  const hasItems = items && items.length > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {hasItems ? (
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
            {items!.map((item, i) => (
              <li key={i} className="whitespace-pre-wrap">{item}</li>
            ))}
          </ul>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
            {body || "—"}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function Step({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className={
        active
          ? "font-medium text-foreground"
          : done
            ? "text-foreground/70"
            : "text-muted-foreground"
      }
    >
      {label}
    </span>
  );
}

function Block({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function NumBadge({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
      {n}
    </span>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">—</p>;
}

function NumberedList({ items }: { items?: string[] }) {
  if (!items?.length) return <Empty />;
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-4 rounded-lg border bg-background p-4">
          <NumBadge n={i + 1} />
          <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {item}
          </span>
        </li>
      ))}
    </ol>
  );
}

// Parse a free-text playbook into ordered steps. Tries common patterns:
// "1. …", "Step 1:", "Phase 1 —", "- …", or paragraph breaks.
function parseSteps(text?: string): string[] {
  if (!text) return [];
  const t = text.trim();
  if (!t) return [];
  const numbered = t.split(/\n?\s*(?:^|\n)\s*(?:\d+[\.\)]|Step\s+\d+[:\-\.]|Phase\s+\d+[:\-\.])\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (numbered.length >= 2) return numbered;
  const bulleted = t.split(/\n\s*(?:[-*•]\s+)/).map((s) => s.trim()).filter(Boolean);
  if (bulleted.length >= 2) return bulleted;
  const paras = t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (paras.length >= 2) return paras;
  const lines = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines : [t];
}

function Timeline({ text }: { text?: string }) {
  const steps = parseSteps(text);
  if (!steps.length) return <Empty />;
  return (
    <ol className="relative space-y-5 border-l-2 border-border pl-6">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground ring-4 ring-background">
            {i + 1}
          </span>
          <div className="rounded-lg border bg-background p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {s}
          </div>
        </li>
      ))}
    </ol>
  );
}
