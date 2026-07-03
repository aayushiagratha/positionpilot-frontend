import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { callPositionPilotWebhook } from "@/lib/api/webhook.functions";
import { joinWaitlist } from "@/lib/api/waitlist.functions";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PositionPilot — AI GTM Strategy Engine" },
      { name: "description", content: "Your complete GTM strategy in 3 minutes. AI-powered positioning, ICP, messaging, GTM and SEO — built specifically for your company." },
      { property: "og:title", content: "PositionPilot — AI GTM Strategy Engine" },
      { property: "og:description", content: "Your complete GTM strategy in 3 minutes. AI-powered positioning, ICP, messaging, GTM and SEO — built specifically for your company." },
    ],
    links: [
      { rel: "icon", href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230f172a'/%3E%3Ctext x='50%25' y='55%25' font-family='Helvetica,Arial,sans-serif' font-size='18' font-weight='700' fill='white' text-anchor='middle' dominant-baseline='middle'%3EP%3C/text%3E%3C/svg%3E" },
    ],
  }),
  component: Index,
});

const FIELDS = [
  { key: "company_name", label: "Company Name", type: "input", placeholder: "e.g. Fathom", helper: "The legal or brand name customers will see." },
  { key: "product_description", label: "Product Description", type: "textarea", placeholder: "e.g. Free AI meeting assistant that records, transcribes and summarizes Zoom, Google Meet and Teams calls.", helper: "One or two sentences. What does your product actually do?" },
  { key: "target_audience", label: "Target Audience", type: "textarea", placeholder: "e.g. Sales and customer-success teams at B2B SaaS companies (10–500 employees) running 10+ external meetings per week.", helper: "Who specifically uses it? Roles, company size, industry." },
  { key: "primary_competitors", label: "Primary Competitors", type: "textarea", placeholder: "e.g. Otter.ai, Fireflies.ai, Gong, Chorus", helper: "Top 2–4 alternatives a buyer would compare you to." },
  { key: "core_customer_problem", label: "Core Customer Problem", type: "textarea", placeholder: "e.g. Reps lose critical commitments and follow-ups because manual note-taking distracts from the conversation.", helper: "The painful, expensive problem you eliminate." },
  { key: "desired_outcome", label: "Desired Outcome", type: "textarea", placeholder: "e.g. Every meeting is captured, summarized and searchable so deals move faster and nothing gets dropped.", helper: "What does success look like AFTER they use you?" },
  { key: "business_model", label: "Business Model", type: "input", placeholder: "e.g. Freemium SaaS, seat-based pricing", helper: "How you make money: SaaS, marketplace, services, etc." },
  { key: "marketing_stage", label: "Marketing Stage", type: "select", placeholder: "Select funnel stage", helper: "Where this strategy will focus the most." },
  { key: "unique_differentiators", label: "What makes you different from competitors?", type: "textarea", placeholder: "e.g. Free unlimited recording, native CRM sync, works across Zoom + Meet + Teams without extensions.", helper: "The 2–3 things only you can credibly claim." },
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
    return [err.name, err.message].filter(Boolean).join("\n");
  }
  return typeof err === "string" ? err : fallback;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={onCopy} className="shrink-0">
      {copied ? "✓ Copied" : label}
    </Button>
  );
}

function SectionCopyBar({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-center justify-end">
      <CopyButton text={text} label={`Copy ${label}`} />
    </div>
  );
}

function formatPositioningSection(s1: Stage1Response): string {
  return [
    "POSITIONING STATEMENT",
    s1.positioning_statement || "—",
    "",
    "DIFFERENTIATION PILLARS",
    ...(s1.differentiation_pillars?.length
      ? s1.differentiation_pillars.map((p, i) => `${i + 1}. ${p}`)
      : ["—"]),
  ].join("\n");
}

function formatIcpSection(s1: Stage1Response): string {
  const fears = (s1 as any).customer_fears as string[] | undefined;
  const lines = [
    "ICP SUMMARY",
    s1.icp_summary || "—",
    "",
    "BUYING TRIGGERS",
    ...(s1.buying_triggers?.length ? s1.buying_triggers.map((t, i) => `${i + 1}. ${t}`) : ["—"]),
  ];
  if (fears?.length) {
    lines.push("", "CUSTOMER FEARS", ...fears.map((f, i) => `${i + 1}. ${f}`));
  }
  return lines.join("\n");
}

function formatMessagingSection(s2: Stage2Response): string {
  const m = s2.messaging_output;
  const lines = [
    "HERO HEADLINE",
    m?.hero_headline || "—",
  ];
  if (m?.subheadline_value_prop) lines.push("", "SUBHEADLINE", m.subheadline_value_prop);
  if (m?.conversion_hook) lines.push("", "CONVERSION HOOK", m.conversion_hook);
  lines.push("", "CORE MESSAGING PILLARS");
  if (m?.core_messaging_pillars?.length) {
    m.core_messaging_pillars.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.pillar_title || "—"}`);
      if (p.supporting_copy) lines.push(`   ${p.supporting_copy}`);
    });
  } else {
    lines.push("—");
  }
  return lines.join("\n");
}

function formatGtmSection(s2: Stage2Response): string {
  const g = s2.gtm_output;
  return [
    "PRIMARY DISTRIBUTION CHANNELS",
    ...(g?.primary_distribution_channels?.length
      ? g.primary_distribution_channels.map((c, i) => `${i + 1}. ${c}`)
      : ["—"]),
    "",
    "LAUNCH SEQUENCING PLAYBOOK",
    g?.launch_sequencing_playbook || "—",
    "",
    "GROWTH LOOPS IDENTIFIED",
    ...(g?.growth_loops_identified?.length
      ? g.growth_loops_identified.map((c, i) => `${i + 1}. ${c}`)
      : ["—"]),
    "",
    "INITIAL 30-DAY MILESTONES",
    ...(g?.initial_30_day_milestones?.length
      ? g.initial_30_day_milestones.map((c, i) => `${i + 1}. ${c}`)
      : ["—"]),
  ].join("\n");
}

function formatSeoSection(s2: Stage2Response): string {
  const seo = s2.seo_output;
  const lines = ["TOPICAL AUTHORITY CLUSTERS"];
  if (seo?.topical_authority_clusters?.length) {
    seo.topical_authority_clusters.forEach((c) => {
      lines.push(`- ${c.core_pillar || "—"}`);
      c.sub_topics?.forEach((s) => lines.push(`   • ${s}`));
    });
  } else {
    lines.push("—");
  }
  lines.push("", "HIGH-INTENT SEARCH QUERIES");
  lines.push(
    ...(seo?.high_intent_search_queries?.length
      ? seo.high_intent_search_queries.map((q, i) => `${i + 1}. ${q}`)
      : ["—"]),
  );
  lines.push("", "AEO CITATION STRATEGY", seo?.aeo_citation_strategy || "—");
  return lines.join("\n");
}

type WebhookStage = "stage1" | "approve" | "stage2";

async function postWebhook(stage: WebhookStage, payload: unknown, label: string, timeoutMs = 300_000) {
  try {
    const result = await callPositionPilotWebhook({ data: { stage, payload, timeoutMs } });
    const res = { ok: result.ok, status: result.status, statusText: result.statusText };
    const details = {
      label,
      stage,
      ok: result.ok,
      status: result.status,
      statusText: result.statusText,
      body: result.text || "<empty body>",
    };
    console.log("PositionPilot webhook response", details);
    return { res, text: result.text, details };
  } catch (err) {
    const message = formatUnknownError(err, `${label} request failed before a response was received`);
    console.error("PositionPilot webhook network error", { label, stage, error: err, message });
    throw new Error(`${label} network error:\n${message}`);
  }
}

function Index() {
  const [screen, setScreen] = useState<"landing" | "form" | "review" | "results">("landing");
  const [form, setForm] = useState<FormState>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, ""])),
  );
  const [loading, setLoading] = useState(false);
  const [stage1, setStage1] = useState<Stage1Response | null>(null);
  const [stage2, setStage2] = useState<Stage2Response | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
    const missing = FIELDS.filter((f) => !form[f.key]?.trim());
    if (missing.length) {
      toast.error(
        missing.length === 1
          ? `Please fill in ${missing[0].label}`
          : `Please fill in ${missing.length} missing fields: ${missing.map((f) => f.label).join(", ")}`,
      );
      document.getElementById(missing[0].key)?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    setRawResponse(null);
    setScreen("review");
    try {
      const { res, text } = await postWebhook("stage1", form, "Stage 1");
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
    const runId = stage1.generation_run_id;
    console.log("PositionPilot Approve+Stage2 using generation_run_id", { runId });
    setLoading(true);
    setError(null);
    setRawResponse(null);
    try {
      // 1. Approve the run
      const { res: approveRes, text: approveText } = await postWebhook(
        "approve",
        { generation_run_id: runId },
        "Approve",
      );
      if (!approveRes.ok) {
        throw new Error(`Approve failed (${approveRes.status} ${approveRes.statusText}): ${approveText || "<empty body>"}`);
      }

      // 2. Generate full strategy
      const stage2Body = {
        generation_run_id: runId,
        company_name: form.company_name,
        marketing_stage: form.marketing_stage,
      };
      console.log("PositionPilot Stage 2 request", { body: stage2Body });
      const { res, text } = await postWebhook(
        "stage2",
        stage2Body,
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
      setCompletedAt(Date.now());
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
    setCompletedAt(null);
    setScreen("landing");
  };

  const runAnother = () => {
    setStage1(null);
    setStage2(null);
    setError(null);
    setRawResponse(null);
    setCompletedAt(null);
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, ""])));
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



  const deleteRun = (id: string) => {
    setRecent((prev) => {
      const next = prev.filter((r) => r.generation_run_id !== id);
      saveRecent(next);
      return next;
    });
  };

  const hasUnsavedFormInput = () =>
    screen === "form" && Object.values(form).some((v) => v.trim() !== "");

  const goLanding = () => {
    if (hasUnsavedFormInput()) {
      setConfirmDiscardOpen(true);
      return;
    }
    setScreen("landing");
  };

  const confirmDiscardAndGoLanding = () => {
    setConfirmDiscardOpen(false);
    setScreen("landing");
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this form?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved answers. Leaving now will discard everything you've typed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardAndGoLanding}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={pendingDeleteId != null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this run?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from your recent runs on this device. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId) deleteRun(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={goLanding}
              className="text-left flex items-center gap-2"
              aria-label="PositionPilot home"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-xs font-bold">
                P
              </span>
              <span className="text-base font-semibold tracking-tight">PositionPilot</span>
            </button>
            {screen !== "landing" && (
              <button
                onClick={goLanding}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Home
              </button>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => setScreen("form")}
            variant={screen === "form" ? "outline" : "default"}
          >
            Generate Strategy
          </Button>
        </div>
      </header>

      <main className={screen === "landing" ? "" : "mx-auto max-w-5xl px-6 py-10"}>
        {screen === "landing" && <Landing onStart={() => setScreen("form")} />}

        {error && (
          <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
            <div className="text-sm font-semibold text-destructive">API request failed</div>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-destructive">
              {error}
            </pre>
          </div>
        )}

        {screen === "form" && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Step 1 of 3 — Tell us about your company
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Tell us about your business</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Fill in all {FIELDS.length} fields (<span className="text-destructive">*</span> required).
                We'll draft your positioning foundation before generating the full strategy.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
                  <Label htmlFor={f.key} className="mb-2 block">
                    {f.label} <span className="text-destructive">*</span>
                  </Label>
                  {(f as any).helper && (
                    <p className="mb-2 text-xs text-muted-foreground">{(f as any).helper}</p>
                  )}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setPendingDeleteId(r.generation_run_id)}
                    >
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
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={startOver}>Back to form</Button>
            </div>
          </div>
        )}

        {screen === "review" && !loading && !error && stage1 && (
          <div className="space-y-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Step 2 of 3 — Review your foundation
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                {form.company_name || "Your company"} — Foundation Review
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Approve to generate the full strategy across all agents.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Positioning Statement</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    rows={5}
                    value={stage1.positioning_statement || ""}
                    onChange={(e) => setStage1({ ...stage1, positioning_statement: e.target.value })}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">ICP Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    rows={5}
                    value={stage1.icp_summary || ""}
                    onChange={(e) => setStage1({ ...stage1, icp_summary: e.target.value })}
                  />
                </CardContent>
              </Card>
              <Section
                title="Differentiation Pillars"
                items={stage1.differentiation_pillars}
                onItemChange={(i, value) => {
                  const next = [...(stage1.differentiation_pillars || [])];
                  next[i] = value;
                  setStage1({ ...stage1, differentiation_pillars: next });
                }}
              />
              <Section
                title="Buying Triggers"
                items={stage1.buying_triggers}
                onItemChange={(i, value) => {
                  const next = [...(stage1.buying_triggers || [])];
                  next[i] = value;
                  setStage1({ ...stage1, buying_triggers: next });
                }}
              />
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
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Step 3 of 3 — Your strategy is ready
                </div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  {form.company_name || "Your company"} — GTM Strategy
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Outputs from each agent. Switch tabs to explore.
                  {completedAt && (
                    <span> · Generated {new Date(completedAt).toLocaleString()}</span>
                  )}
                </p>
                {form.marketing_stage && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                    Marketing Stage: {form.marketing_stage}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button disabled={true} variant="outline">PDF Report (Coming Soon)</Button>
                <Button variant="outline" onClick={runAnother}>Run for another company</Button>
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
                <SectionCopyBar label="Positioning" text={formatPositioningSection(stage1 || {})} />
                <Block title="Positioning Statement" description="The single sentence that defines who you serve and how you win.">
                  <div className="flex items-start gap-3">
                    <p className="flex-1 text-base leading-relaxed text-foreground whitespace-pre-wrap">
                      {stage1?.positioning_statement || "—"}
                    </p>
                    <CopyButton text={stage1?.positioning_statement || ""} />
                  </div>
                </Block>
                <Block title="Differentiation Pillars" description="The proof points that make the positioning defensible.">
                  <NumberedList items={stage1?.differentiation_pillars} />
                </Block>
              </TabsContent>

              {/* ICP */}
              <TabsContent value="icp" className="mt-8 space-y-8">
                <SectionCopyBar label="ICP" text={formatIcpSection(stage1 || {})} />
                <Block title="ICP Summary" description="Your primary target persona in one paragraph.">
                  <div className="flex items-start gap-3">
                    <p className="flex-1 text-base leading-relaxed text-foreground whitespace-pre-wrap">
                      {stage1?.icp_summary || "—"}
                    </p>
                    <CopyButton text={stage1?.icp_summary || ""} />
                  </div>
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
                <SectionCopyBar label="Messaging" text={formatMessagingSection(stage2)} />
                <section className="rounded-2xl border bg-card p-8 md:p-12">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Hero Headline
                  </div>
                  <div className="mt-4 flex items-start gap-3">
                    <h3 className="flex-1 text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl">
                      {stage2.messaging_output?.hero_headline || "—"}
                    </h3>
                    <CopyButton text={stage2.messaging_output?.hero_headline || ""} />
                  </div>
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
                    <div className="mt-2 flex items-start gap-3">
                      <p className="flex-1 text-lg font-medium leading-relaxed text-foreground">
                        {stage2.messaging_output.conversion_hook}
                      </p>
                      <CopyButton text={stage2.messaging_output.conversion_hook} />
                    </div>
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
                <SectionCopyBar label="GTM" text={formatGtmSection(stage2)} />
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
                <SectionCopyBar label="SEO" text={formatSeoSection(stage2)} />
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
                  <div className="flex items-start gap-3">
                    <p className="flex-1 text-base leading-relaxed text-foreground whitespace-pre-wrap">
                      {stage2.seo_output?.aeo_citation_strategy || "—"}
                    </p>
                    <CopyButton text={stage2.seo_output?.aeo_citation_strategy || ""} />
                  </div>
                </Block>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t bg-muted/30">
      <div className="mx-auto max-w-5xl px-6 py-10 grid gap-6 md:grid-cols-3 text-sm">
        <div>
          <div className="font-semibold">PositionPilot</div>
          <p className="mt-1 text-muted-foreground">AI GTM Strategy Engine</p>
        </div>
        <div className="text-muted-foreground">
          Built by{" "}
          <a
            href="https://www.linkedin.com/in/aayushiagratha"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Aayushi Agratha
          </a>
          <div className="mt-1 text-xs">Powered by n8n · OpenRouter · DeepSeek</div>
        </div>
        <div className="md:text-right">
          <a
            href="https://github.com/aayushiagratha/positionpilot"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const scrollToSample = () => {
    document.getElementById("sample")?.scrollIntoView({ behavior: "smooth" });
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v || !v.includes("@")) {
      toast.error("Please enter a valid email");
      return;
    }
    setSubmitting(true);
    try {
      await joinWaitlist({ data: { email: v } });
      setJoined(true);
      setEmail("");
      toast.success("You're on the waitlist");
    } catch (err) {
      const msg = formatUnknownError(err, "Failed to join waitlist");
      console.error("PositionPilot waitlist signup error", { error: err, message: msg });
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const outputs = [
    { title: "Positioning", body: "Category definition, positioning statement, and differentiation pillars." },
    { title: "ICP", body: "Target persona, buying triggers, economic buyer profile, and customer fears." },
    { title: "Messaging", body: "Hero headline, value proposition, and core messaging pillars." },
    { title: "GTM Strategy", body: "Distribution channels, launch sequencing playbook, and growth loops." },
    { title: "SEO / AEO", body: "Topical authority clusters, high-intent search queries, and AEO citation strategy." },
  ];

  const steps = [
    { n: 1, title: "Tell us about your company", body: "Fill in 8 fields about your product, audience, and competitors." },
    { n: 2, title: "Review your foundation", body: "Our AI builds your positioning and ICP. You approve before we continue." },
    { n: 3, title: "Get your full strategy", body: "5 specialized agents generate your complete GTM strategy in under 3 minutes." },
  ];

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(120deg, rgba(99,102,241,0.10), rgba(236,72,153,0.06) 35%, rgba(14,165,233,0.08) 65%, rgba(168,85,247,0.10)), radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.12), transparent 70%)",
            backgroundSize: "200% 200%, 100% 100%",
            animation: "pp-hero-gradient 18s ease-in-out infinite",
          }}
        />
        <style>{`@keyframes pp-hero-gradient { 0%{background-position:0% 50%, 50% 0%} 50%{background-position:100% 50%, 50% 0%} 100%{background-position:0% 50%, 50% 0%} }`}</style>
      <div className="mx-auto max-w-5xl px-6 pt-16 pb-20 md:pt-24 md:pb-28 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          AI GTM Strategy Engine · Beta
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-6xl leading-[1.05]">
          Your complete GTM strategy<br className="hidden md:block" /> in 3 minutes
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base md:text-lg text-muted-foreground leading-relaxed">
          AI-powered positioning, ICP, messaging, GTM, and SEO — built specifically for your company.
          Not templates. Not generic AI. A real strategy engine.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={onStart}>Generate My Strategy</Button>
          <button
            onClick={scrollToSample}
            className="text-sm font-medium underline underline-offset-4 hover:text-foreground text-muted-foreground"
          >
            See a sample output →
          </button>
        </div>
        <div className="mt-8">
          <p className="text-sm md:text-base font-medium text-foreground">
            Tested on Antimattr · Fathom · Alphatech · Granola
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Antimattr (AI Hardware) · Fathom (SaaS) · Alphatech (B2B Electronics) · Granola (Productivity)
          </p>
        </div>
      </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              How it works
            </div>
            <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">
              Three steps to a real strategy
            </h2>
          </div>
          <div className="relative mt-12">
            {/* Connecting dotted line (desktop only) */}
            <div
              aria-hidden
              className="hidden md:block absolute left-[16.66%] right-[16.66%] top-[2.25rem] border-t-2 border-dashed border-border"
            />
            <div className="relative grid gap-6 md:grid-cols-3">
              {steps.map((s, i) => (
                <div key={s.n} className="relative rounded-xl border bg-card p-6">
                  <div className="relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold ring-8 ring-card">
                    {s.n}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-center">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-center">{s.body}</p>
                  {i < steps.length - 1 && (
                    <div
                      aria-hidden
                      className="md:hidden mx-auto mt-4 h-6 w-px border-l-2 border-dashed border-border"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-10 flex justify-center">
            <Button size="lg" onClick={onStart}>Start for free</Button>
          </div>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <section className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              What you get
            </div>
            <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">
              5 outputs. One strategy engine.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {outputs.map((o, i) => (
              <div key={o.title} className="rounded-xl border bg-card p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background text-sm font-semibold">
                  {i + 1}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{o.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{o.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SAMPLE */}
      <section id="sample" className="border-t bg-muted/20">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Sample output
            </div>
            <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">
              Real output. Real companies.
            </h2>
          </div>
          <div className="relative mt-10 overflow-hidden rounded-2xl border bg-card p-8 md:p-10">
            <div className="flex items-center gap-3">
              <span className="rounded bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
                Company
              </span>
              <span className="text-lg font-semibold">Fathom</span>
            </div>
            <div className="mt-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Positioning Statement
              </div>
              <p className="mt-3 text-base md:text-lg leading-relaxed text-foreground">
                "For sales and customer-facing teams who lose critical information from meetings because
                manual note-taking distracts from the conversation, Fathom is the free AI meeting
                intelligence platform that automatically records, transcribes, and summarizes calls from
                Zoom, Google Meet, and Microsoft Teams — unlike Otter.ai or Fireflies.ai which charge for
                full features and require complex setup."
              </p>
            </div>
            <div className="mt-8 pb-32">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Buying Triggers
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground">
                <li className="flex gap-2"><span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />A team member misses a key customer commitment mentioned in a meeting</li>
                <li className="flex gap-2"><span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Monthly recurring revenue targets are missed due to poorly tracked call follow-ups</li>
                <li className="flex gap-2"><span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />A competitor gains an edge by leveraging meeting insights that the team lacks</li>
                <li className="flex gap-2"><span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Sales leadership demands accurate forecasting based on call signals</li>
                <li className="flex gap-2"><span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Customer success teams need handoff context from sales conversations</li>
              </ul>
            </div>
            {/* Bottom fade overlay with CTA inside the card */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-card via-card/95 to-transparent flex items-end justify-center pb-8">
              <Button onClick={onStart} className="pointer-events-auto">
                Generate your strategy to see the full output
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* EMAIL CAPTURE */}
      <section className="border-t">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Waitlist
          </div>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">Get early access</h2>
          <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed">
            PositionPilot is currently in beta. Enter your email to join the waitlist and get notified when we launch.
          </p>
          {joined ? (
            <p className="mt-6 text-sm font-medium text-foreground">
              Thanks — you're on the list. We'll be in touch.
            </p>
          ) : (
            <form onSubmit={submitEmail} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" disabled={submitting}>{submitting ? "Joining…" : "Join Waitlist"}</Button>
            </form>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            No spam. Just your GTM strategy when it's ready.
          </p>
        </div>
      </section>
    </div>
  );
}

function Section({
  title,
  body,
  items,
  onItemChange,
}: {
  title: string;
  body?: string;
  items?: string[];
  onItemChange?: (index: number, value: string) => void;
}) {
  const hasItems = items && items.length > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {hasItems ? (
          onItemChange ? (
            <div className="space-y-2">
              {items!.map((item, i) => (
                <Input key={i} value={item} onChange={(e) => onItemChange(i, e.target.value)} />
              ))}
            </div>
          ) : (
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
              {items!.map((item, i) => (
                <li key={i} className="whitespace-pre-wrap">{item}</li>
              ))}
            </ul>
          )
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
