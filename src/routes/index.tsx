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

const STAGE1_URL = "https://n8n-production-0b71.up.railway.app/webhook/positionpilot-stage1";
const STAGE2_URL = "https://n8n-production-0b71.up.railway.app/webhook/positionpilot-stage2";

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
  positioning?: string;
  icp?: string;
  messaging?: string;
  gtm?: string;
  seo?: string;
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
  const r = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  if (!r) return {};
  return {
    positioning: asText(pick(r, ["positioning", "positioning_output", "positioning_agent"])),
    icp: asText(pick(r, ["icp", "icp_output", "icp_agent"])),
    messaging: asText(pick(r, ["messaging", "messaging_output", "messaging_agent"])),
    gtm: asText(pick(r, ["gtm", "gtm_output", "gtm_agent", "go_to_market"])),
    seo: asText(pick(r, ["seo", "seo_output", "seo_agent"])),
    ...r,
  };
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
                <p className="text-xs text-muted-foreground">Reopen a previous generation.</p>
              </div>
            </div>
            <ul className="divide-y rounded-md border">
              {recent.map((r) => (
                <li key={r.generation_run_id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <button onClick={() => openRun(r)} className="min-w-0 flex-1 text-left">
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
                    <Button variant="outline" size="sm" onClick={() => openRun(r)}>
                      Open
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
              <Button variant="outline" onClick={startOver}>Start Over</Button>
            </div>
            <Tabs defaultValue="positioning" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="positioning">Positioning</TabsTrigger>
                <TabsTrigger value="icp">ICP</TabsTrigger>
                <TabsTrigger value="messaging">Messaging</TabsTrigger>
                <TabsTrigger value="gtm">GTM</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
              </TabsList>
              {(["positioning", "icp", "messaging", "gtm", "seo"] as const).map((k) => (
                <TabsContent key={k} value={k}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="capitalize">{k}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                        {stage2[k] || "No content returned for this section."}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
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
