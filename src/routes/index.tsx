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
const STAGE2_URL = "https://blabber-ahead-defective.ngrok-free.dev/webhook/positionpilot-stage2";

const FIELDS = [
  { key: "company_name", label: "Company Name", type: "input", placeholder: "Acme Inc." },
  { key: "product_description", label: "Product Description", type: "textarea", placeholder: "What does your product do?" },
  { key: "target_audience", label: "Target Audience", type: "textarea", placeholder: "Who is it for?" },
  { key: "primary_competitors", label: "Primary Competitors", type: "textarea", placeholder: "Who else solves this?" },
  { key: "core_customer_problem", label: "Core Customer Problem", type: "textarea", placeholder: "What pain are you solving?" },
  { key: "desired_outcome", label: "Desired Outcome", type: "textarea", placeholder: "What result does the customer want?" },
  { key: "business_model", label: "Business Model", type: "input", placeholder: "SaaS, marketplace, services…" },
  { key: "unique_differentiators", label: "Unique Differentiators", type: "textarea", placeholder: "What makes you different?" },
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
  return {
    generation_run_id:
      data.generation_run_id != null ? String(data.generation_run_id) : undefined,
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
        { generation_run_id: stage1.generation_run_id },
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
    const heading = (t: string) => { y += 8; writeWrapped(t, 16, "bold"); y += 2; };
    const subheading = (t: string) => { y += 4; writeWrapped(t, 12, "bold"); };
    const para = (t?: string) => { if (t) { writeWrapped(t, 11); y += 4; } };
    const bullets = (items?: string[]) => {
      if (!items?.length) return;
      for (const it of items) writeWrapped("* " + it, 11);
      y += 4;
    };

    const company = form.company_name || stage1?.generation_run_id || "PositionPilot";
    writeWrapped(company, 22, "bold");
    writeWrapped("Strategic Positioning Report", 12);
    writeWrapped(new Date().toLocaleString(), 10);
    y += 8;

    heading("Positioning");
    subheading("Positioning Statement");
    para(stage1?.positioning_statement);
    subheading("Differentiation Pillars");
    bullets(stage1?.differentiation_pillars);

    heading("ICP");
    subheading("ICP Summary");
    para(stage1?.icp_summary);
    subheading("Buying Triggers");
    bullets(stage1?.buying_triggers);

    const m = stage2?.messaging_output;
    heading("Messaging");
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
    heading("GTM");
    subheading("Primary Distribution Channels"); bullets(g?.primary_distribution_channels);
    subheading("Growth Loops Identified"); bullets(g?.growth_loops_identified);
    subheading("Launch Sequencing Playbook"); para(g?.launch_sequencing_playbook);
    subheading("Initial 30-Day Milestones"); bullets(g?.initial_30_day_milestones);

    const s = stage2?.seo_output;
    heading("SEO");
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
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Your full strategy</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Outputs from each agent. Switch tabs to explore.
                </p>
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
              <TabsContent value="positioning">
                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="Positioning Statement" body={stage1?.positioning_statement} />
                  <Section title="Differentiation Pillars" items={stage1?.differentiation_pillars} />
                </div>
              </TabsContent>
              <TabsContent value="icp">
                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="ICP Summary" body={stage1?.icp_summary} />
                  <Section title="Buying Triggers" items={stage1?.buying_triggers} />
                </div>
              </TabsContent>
              <TabsContent value="messaging">
                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="Hero Headline" body={stage2.messaging_output?.hero_headline} />
                  <Section title="Subheadline / Value Prop" body={stage2.messaging_output?.subheadline_value_prop} />
                  <Section title="Conversion Hook" body={stage2.messaging_output?.conversion_hook} />
                  <Card className="md:col-span-2">
                    <CardHeader><CardTitle className="text-base">Core Messaging Pillars</CardTitle></CardHeader>
                    <CardContent>
                      {stage2.messaging_output?.core_messaging_pillars?.length ? (
                        <ul className="space-y-4">
                          {stage2.messaging_output.core_messaging_pillars.map((p, i) => (
                            <li key={i}>
                              <div className="font-semibold text-sm">{p.pillar_title}</div>
                              <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{p.supporting_copy}</div>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-sm text-muted-foreground">—</p>}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="gtm">
                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="Primary Distribution Channels" items={stage2.gtm_output?.primary_distribution_channels} />
                  <Section title="Growth Loops Identified" items={stage2.gtm_output?.growth_loops_identified} />
                  <Section title="Launch Sequencing Playbook" body={stage2.gtm_output?.launch_sequencing_playbook} />
                  <Section title="Initial 30-Day Milestones" items={stage2.gtm_output?.initial_30_day_milestones} />
                </div>
              </TabsContent>
              <TabsContent value="seo">
                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="AEO Citation Strategy" body={stage2.seo_output?.aeo_citation_strategy} />
                  <Section title="High-Intent Search Queries" items={stage2.seo_output?.high_intent_search_queries} />
                  <Card className="md:col-span-2">
                    <CardHeader><CardTitle className="text-base">Topical Authority Clusters</CardTitle></CardHeader>
                    <CardContent>
                      {stage2.seo_output?.topical_authority_clusters?.length ? (
                        <ul className="space-y-4">
                          {stage2.seo_output.topical_authority_clusters.map((c, i) => (
                            <li key={i}>
                              <div className="font-semibold text-sm">{c.core_pillar}</div>
                              {c.sub_topics?.length ? (
                                <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                                  {c.sub_topics.map((s, j) => <li key={j}>{s}</li>)}
                                </ul>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-sm text-muted-foreground">—</p>}
                    </CardContent>
                  </Card>
                </div>
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
