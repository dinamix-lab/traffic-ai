import { randomUUID } from "node:crypto";
import { AuthError } from "../auth/errors";
import type { AuthService } from "../auth/service";
import type { WorkspaceService } from "../workspaces/service";
import { UrlTrackingService } from "../attribution/tracking";
import { add } from "../crm/decimal";
import { defaults, validateConfig } from "./config";
import type { IntelligenceRepository } from "./repository";
import type {
  AnalysisInput,
  Creative,
  Decision,
  JournalEntry,
  Outcome,
  Recommendation,
  ReelTest,
  WindowKey,
} from "./types";
import { buildInputs, sourceMetrics, type DataSources } from "./sources";
import { analyze, trafficHealth } from "./engine";
import { LocalNarrator } from "./narrator";
import { dateAt, relative, compare, shift } from "./math";
import {
  blankScore,
  businessScore,
  emptyOrganic,
  organicScore,
  patterns,
  taxonomy,
  transition,
  validateOrganic,
} from "./creative";
import { demoInputs } from "./demo";
const reasonOptions = [
  "",
  "estratégia comercial",
  "campanha ainda em teste",
  "informação que a IA não possui",
  "recomendação incorreta",
  "outro",
];
const text = (v: unknown, max = 1000) => {
  if (typeof v !== "string" || v.length > max)
    throw new AuthError("Texto inválido ou muito longo.");
  return v.trim();
};
export class IntelligenceService {
  constructor(
    private auth: AuthService,
    private ws: WorkspaceService,
    private store: IntelligenceRepository,
    private sources: (w: string) => DataSources,
    private now: () => number = Date.now,
  ) {}
  private access(token: string | undefined, w: string) {
    const workspace = this.ws.requireAccess(token, w);
    if (!workspace.active) throw new AuthError("Workspace inativo.", 403);
    return this.auth.requireUser(token);
  }
  private audit(w: string, actor: string, entity: string, action: string) {
    this.store.save("audit", {
      id: randomUUID(),
      workspaceId: w,
      actorId: actor,
      entityId: entity,
      action,
      at: this.now(),
    });
  }
  private notify(w: string, entity: string, message: string) {
    const id = `${entity}:${message}`;
    if (!this.store.get("notifications", w, id))
      this.store.save("notifications", {
        id,
        workspaceId: w,
        entityId: entity,
        message,
        at: this.now(),
        readBy: [],
      });
  }
  private inputs(w: string, mode: "real" | "demo", window: WindowKey) {
    const sources = this.sources(w);
    const result =
      mode === "demo"
        ? demoInputs(w, this.now(), sources.timezone)
        : buildInputs(w, sources, window, this.now());
    const creatives = this.store
      .list("creatives", w)
      .filter((c) => (c.source === "demo") === (mode === "demo"));
    if (mode === "real")
      for (const i of result)
        i.coverage.creative = creatives.length
          ? Math.round(
              (100 *
                creatives.filter(
                  (c) => c.evaluatedAt !== null && c.business !== null,
                ).length) /
                creatives.length,
            )
          : null;
    return result;
  }
  snapshot(
    token: string | undefined,
    w: string,
    mode: "real" | "demo" = "real",
    window: WindowKey = "7",
  ) {
    const user = this.access(token, w),
      config = this.store.config(w),
      inputs = this.inputs(w, mode, window);
    const recommendations = this.store
      .list("recommendations", w)
      .filter((r) => r.mode === mode)
      .map((r) =>
        r.status === "pending" && r.expiresAt <= this.now()
          ? { ...r, status: "expired" as const }
          : r,
      );
    const decisions = this.store
      .list("decisions", w)
      .filter((d) => d.recommendation.mode === mode);
    const creatives = this.store
      .list("creatives", w)
      .filter((r) => (mode === "demo") === (r.source === "demo"));
    const ids = new Set(creatives.map((x) => x.id));
    return {
      workspaceId: w,
      generatedAt: this.now(),
      currency: this.sources(w).crm.currency,
      mode,
      window,
      role: user.role,
      userId: user.id,
      config: user.role === "admin" ? config : null,
      creatives,
      recommendations,
      decisions,
      tests: this.store.list("tests", w).filter((t) => ids.has(t.creativeId)),
      journal: this.store.list("journal", w).filter((j) => j.mode === mode),
      notifications: this.store
        .list("notifications", w)
        .filter(
          (n) =>
            n.entityId.startsWith(mode + ":") ||
            ids.has(n.entityId) ||
            recommendations.some((r) => r.id === n.entityId),
        ),
      audit:
        user.role === "admin" ? this.store.list("audit", w).slice(0, 100) : [],
      patterns: patterns(creatives, config),
      preview: inputs.map((i) => analyze(i, config)),
      health: inputs[0] ? trafficHealth(inputs[0]) : null,
      metrics: inputs[0]?.current || null,
      period: inputs[0]?.period || null,
      briefing: new LocalNarrator().summarize({
        workspace: this.sources(w).name,
        recommendations: inputs.map((i) => analyze(i, config)),
      }),
      sourceLimitations: inputs[0]?.limitations || [],
    };
  }
  generate(
    token: string | undefined,
    w: string,
    mode: "real" | "demo",
    window: WindowKey = "7",
  ) {
    const actor = this.access(token, w);
    return this.generateInternal(w, actor.id, mode, window);
  }
  private generateInternal(
    w: string,
    actor: string,
    mode: "real" | "demo",
    window: WindowKey,
  ) {
    const inputs = this.inputs(w, mode, window),
      config = this.store.config(w);
    return this.store.transaction(() => {
      const produced: Recommendation[] = [];
      for (const input of inputs) {
        const previous = this.store
          .list("recommendations", w)
          .filter(
            (r) =>
              r.mode === mode &&
              r.entityId === input.entityId &&
              r.entityType === input.entityType,
          )
          .sort((a, b) => b.createdAt - a.createdAt)[0];
        const lastDecision = this.store
          .list("decisions", w)
          .filter(
            (d) =>
              d.recommendation.mode === mode &&
              d.recommendation.entityId === input.entityId &&
              d.decision === "approved",
          )
          .sort((a, b) => b.at - a.at)[0];
        input.lastChangedAt = lastDecision?.at ?? null;
        const candidate = analyze(input, config);
        const material =
          previous &&
          candidate.evidence.some(
            (e) =>
              Math.abs(
                relative(e.current, previous.before[e.metric].value) ?? 0,
              ) >= config.materialChangePct,
          );
        if (
          previous &&
          previous.status !== "superseded" &&
          previous.status !== "expired" &&
          previous.expiresAt > this.now() &&
          previous.ruleVersion === candidate.ruleVersion &&
          previous.rule === candidate.rule &&
          !material
        ) {
          produced.push(previous);
          continue;
        }
        if (
          previous &&
          previous.ruleVersion === candidate.ruleVersion &&
          previous.expiresAt > this.now() &&
          this.now() - previous.createdAt < config.cooldownHours * 3600000 &&
          previous.type !== candidate.type &&
          !material
        ) {
          produced.push(previous);
          continue;
        }
        if (previous?.status === "pending")
          this.store.save("recommendations", {
            ...previous,
            status: previous.expiresAt <= this.now() ? "expired" : "superseded",
          });
        candidate.id = randomUUID();
        this.store.save("recommendations", candidate);
        produced.push(candidate);
        this.audit(w, actor, candidate.id, "recommendation_created");
        this.notify(
          w,
          candidate.id,
          `${candidate.priority}: ${candidate.title}`,
        );
      }
      const primary = inputs[0];
      if (primary) {
        const day = dateAt(this.now(), primary.period.timezone),
          allCreatives = this.store
            .list("creatives", w)
            .filter((c) => (c.source === "demo") === (mode === "demo"));
        const entry: JournalEntry = {
          id: `${mode}:${day}`,
          workspaceId: w,
          day,
          at: this.now(),
          mode,
          summary: new LocalNarrator().summarize({
            workspace: this.sources(w).name,
            recommendations: produced,
          }),
          metrics: primary.current,
          recommendations: produced.map((r) => r.id),
          decisions: this.store
            .list("decisions", w)
            .filter(
              (d) =>
                dateAt(d.at, primary.period.timezone) === day &&
                d.recommendation.mode === mode,
            ).length,
          observing: allCreatives.filter(
            (c) => c.status === "organic_observation",
          ).length,
          testsActive: 0,
          testsCompleted: 0,
          risks: produced.filter(
            (r) => r.bottleneck && r.type !== "WAIT_FOR_DATA",
          ).length,
          opportunities: produced.filter((r) => r.type === "SCALE").length,
          bottlenecks: [
            ...new Set(
              produced.flatMap((r) => (r.bottleneck ? [r.bottleneck] : [])),
            ),
          ],
        };
        this.store.save("journal", entry);
      }
      this.updateOutcomes(w, inputs);
      return { created: produced.length };
    });
  }
  private updateOutcomes(w: string, inputs: AnalysisInput[]) {
    const config = this.store.config(w);
    for (const d of this.store.list("decisions", w)) {
      if (
        d.recommendation.mode !== inputs[0]?.mode ||
        d.outcome.after !== null ||
        this.now() - d.at < config.outcomeDays * 86400000
      )
        continue;
      const input = inputs.find(
        (i) =>
          i.entityId === d.recommendation.entityId &&
          i.entityType === d.recommendation.entityType,
      );
      if (!input) continue;
      if (input.mode === "demo") continue;
      const start = shift(dateAt(d.at, input.period.timezone), 1),
        to = shift(start, config.outcomeDays - 1);
      if (dateAt(this.now(), input.period.timezone) <= to) continue;
      const after = sourceMetrics(
        this.sources(w),
        {
          from: start,
          to,
          days: config.outcomeDays,
          timezone: input.period.timezone,
        },
        input.entityType,
        input.entityId,
      );
      const changes: Outcome["changes"] = {};
      for (const k of [
        "qualificationRate",
        "showRate",
        "closeRate",
        "roas",
      ] as const)
        changes[k] = relative(after.metrics[k].value, d.before[k].value);
      const available = Object.values(changes).filter(
        (n): n is number => n !== null && n !== undefined,
      );
      const comparable =
        d.recommendation.period.days === config.outcomeDays &&
        after.coverage.crm === 100 &&
        d.recommendation.coverage.crm === 100 &&
        d.recommendation.dataSufficiency !== "INSUFFICIENT";
      const positive = available.some((n) => n >= config.qualityChangePct),
        negative = available.some((n) => n <= -config.qualityChangePct);
      d.outcome = {
        status:
          !comparable || !available.length || (positive && negative)
            ? "inconclusive"
            : positive
              ? "positive"
              : negative
                ? "negative"
                : "neutral",
        checkedAt: this.now(),
        after: after.metrics,
        changes,
        note: "Comparação observacional após a decisão, sem comprovar execução ou causalidade. Taxas com coortes/janelas limitadas podem ficar inconclusivas.",
      };
      this.store.save("decisions", d);
      this.audit(w, "system", d.id, "outcome_recorded");
    }
  }
  decide(
    token: string | undefined,
    w: string,
    id: string,
    decision: "approved" | "rejected",
    reason: string,
    note: string,
  ) {
    const actor = this.access(token, w);
    text(note, 1000);
    if (!reasonOptions.includes(reason))
      throw new AuthError("Motivo inválido.");
    return this.store.transaction(() => {
      const r = this.store.get("recommendations", w, id);
      if (!r) throw new AuthError("Recomendação não encontrada.", 404);
      if (r.status !== "pending" || r.expiresAt <= this.now())
        throw new AuthError(
          "Recomendação já decidida, substituída ou expirada.",
          409,
        );
      r.status = decision;
      this.store.save("recommendations", r);
      const d: Decision = {
        id: randomUUID(),
        workspaceId: w,
        recommendationId: id,
        actorId: actor.id,
        actorName: actor.name,
        at: this.now(),
        decision,
        reason,
        note,
        recommendation: structuredClone(r),
        before: structuredClone(r.before),
        outcome: {
          status: "inconclusive",
          checkedAt: this.now(),
          after: null,
          changes: {},
          note: "Aguardando janela posterior. Aprovação não comprova execução.",
        },
        taskStatus: "open",
      };
      this.store.save("decisions", d);
      const journal = this.store.get(
        "journal",
        w,
        `${r.mode}:${dateAt(this.now(), r.period.timezone)}`,
      );
      if (journal)
        this.store.save("journal", {
          ...journal,
          decisions: journal.decisions + 1,
        });
      this.audit(w, actor.id, id, `recommendation_${decision}`);
      return d;
    });
  }
  configure(
    token: string | undefined,
    w: string,
    raw: Record<string, unknown>,
  ) {
    const actor = this.access(token, w);
    this.auth.requireAdmin(token);
    const config = validateConfig(raw, this.store.config(w));
    this.store.transaction(() => {
      this.store.saveConfig(w, config);
      this.audit(w, actor.id, w, "configuration_changed");
    });
    return config;
  }
  saveCreative(
    token: string | undefined,
    w: string,
    raw: Record<string, unknown>,
    mode: "real" | "demo",
  ) {
    const actor = this.access(token, w),
      id = raw.id ? text(raw.id, 100) : randomUUID();
    return this.store.transaction(() => {
      const existing = this.store.get("creatives", w, id);
      if (raw.id && !existing)
        throw new AuthError("Criativo não encontrado.", 404);
      if (existing && (existing.source === "demo") !== (mode === "demo"))
        throw new AuthError("Fonte de criativo incompatível.", 409);
      const now = this.now();
      const c: Creative = existing || {
        id,
        workspaceId: w,
        title: "",
        profileId: "",
        platform: "instagram",
        mediaType: "reel",
        publicationId: null,
        publishedAt: null,
        caption: "",
        duration: null,
        thumbnail: null,
        tags: [],
        hook: "outro",
        angle: "outro",
        theme: "",
        format: "outro",
        presenter: "",
        cta: "outro",
        status: "published",
        source: mode === "demo" ? "demo" : "manual",
        trafficCreativeId: null,
        metaCreativeId: null,
        organic: emptyOrganic(),
        organicAsOf: null,
        organicScore: blankScore(),
        businessScore: blankScore(),
        business: null,
        paid: null,
        confidence: 0,
        recommendation: "Aguardar observação e dados.",
        evaluatedAt: null,
        timeline: [
          {
            at: now,
            state: "published",
            text: "Cadastro local; não houve publicação pela Meta.",
            actorId: actor.id,
          },
        ],
      };
      for (const key of [
        "title",
        "profileId",
        "platform",
        "mediaType",
        "caption",
        "theme",
        "presenter",
      ] as const)
        if (raw[key] !== undefined)
          c[key] = text(raw[key], key === "caption" ? 1500 : 160);
      if (!c.title || !c.profileId)
        throw new AuthError("Informe identificação e perfil do criativo.");
      for (const key of ["hook", "angle", "format", "cta"] as const)
        if (raw[key] !== undefined) {
          const v = text(raw[key], 60);
          if (!taxonomy[key].includes(v))
            throw new AuthError("Classificação inválida.");
          c[key] = v;
        }
      for (const key of [
        "publicationId",
        "trafficCreativeId",
        "metaCreativeId",
      ] as const)
        if (raw[key] !== undefined)
          c[key] = raw[key] ? text(raw[key], 160) : null;
      for (const key of ["publishedAt", "organicAsOf"] as const)
        if (raw[key] !== undefined) {
          const date = raw[key] ? text(raw[key], 40) : null;
          if (
            date &&
            (!Number.isFinite(Date.parse(date)) || Date.parse(date) > now)
          )
            throw new AuthError("Data inválida ou futura.");
          c[key] = date ? new Date(date).toISOString() : null;
        }
      if (c.organicAsOf && c.publishedAt && c.organicAsOf < c.publishedAt)
        throw new AuthError("Medição não pode anteceder publicação.");
      if (raw.duration !== undefined) {
        const value =
          raw.duration === "" || raw.duration === null
            ? null
            : Number(raw.duration);
        if (
          value !== null &&
          (!Number.isFinite(value) || value < 0 || value > 86400)
        )
          throw new AuthError("Duração inválida.");
        c.duration = value;
      }
      if (raw.thumbnail !== undefined) {
        const url = raw.thumbnail ? text(raw.thumbnail, 1000) : null;
        if (
          url &&
          (!URL.canParse(url) ||
            new URL(url).protocol !== "https:" ||
            new URL(url).username ||
            new URL(url).password)
        )
          throw new AuthError("Thumbnail deve usar HTTPS sem credenciais.");
        c.thumbnail = url;
      }
      if (raw.tags !== undefined)
        c.tags = text(raw.tags, 500)
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 20);
      if (raw.organic !== undefined) {
        if (
          !raw.organic ||
          typeof raw.organic !== "object" ||
          Array.isArray(raw.organic)
        )
          throw new AuthError("Métricas orgânicas inválidas.");
        c.organic = validateOrganic(raw.organic as Record<string, unknown>);
      }
      if (
        existing &&
        ["test_proposed", "test_approved", "paid_test_pending"].includes(
          existing.status,
        )
      )
        throw new AuthError(
          "Criativo com proposta ativa está bloqueado para edição; rejeite a proposta antes de editar.",
          409,
        );
      if (existing) {
        c.organicScore = blankScore("Métricas editadas: reavaliar.");
        c.businessScore = blankScore("Métricas editadas: reavaliar.");
        c.evaluatedAt = null;
        if (c.status === "organic_evaluated")
          transition(
            c,
            "organic_observation",
            actor.id,
            now,
            "Nova medição; avaliação anterior invalidada.",
          );
      }
      this.store.save("creatives", c);
      this.audit(
        w,
        actor.id,
        id,
        existing ? "creative_updated" : "creative_created",
      );
      return c;
    });
  }
  evaluateCreative(token: string | undefined, w: string, id: string) {
    const actor = this.access(token, w);
    return this.evaluateInternal(w, id, actor.id);
  }
  private evaluateInternal(w: string, id: string, actor: string) {
    return this.store.transaction(() => {
      const c = this.store.get("creatives", w, id);
      if (!c) throw new AuthError("Criativo não encontrado.", 404);
      if (
        !["published", "organic_observation", "organic_evaluated"].includes(
          c.status,
        )
      )
        throw new AuthError(
          "Criativo já possui proposta ou teste pendente.",
          409,
        );
      const config = this.store.config(w),
        now = this.now(),
        all = this.store.list("creatives", w);
      if (c.status === "published")
        transition(
          c,
          "organic_observation",
          actor,
          now,
          "Observação iniciada; depende de métricas orgânicas informadas.",
        );
      c.organicScore = organicScore(c, all, config, now);
      if (c.source !== "demo") {
        const s = this.sources(w),
          inputs = buildInputs(w, s, "30", now);
        const identity = c.trafficCreativeId
          ? `traffic:${c.trafficCreativeId}`
          : c.metaCreativeId
            ? `meta:${c.metaCreativeId}`
            : null;
        const found = inputs.find(
          (i) => i.entityType === "creative" && i.entityId === identity,
        );
        c.business = found?.current || null;
        c.paid = found?.current || null;
        c.businessScore = businessScore(
          c.business,
          inputs
            .filter(
              (i) => i.entityType === "creative" && i.entityId !== identity,
            )
            .map((i) => i.current),
          config,
        );
      }
      c.confidence = c.organicScore.value === null ? 25 : 65;
      c.evaluatedAt = now;
      c.recommendation =
        c.organicScore.value === null
          ? "AGUARDAR MAIS DADOS: prolongar observação."
          : c.organicScore.value >= config.organicScoreThreshold
            ? "Candidato a proposta de teste; depende de aprovação humana."
            : "Manter observação e revisar abordagem criativa.";
      if (c.organicScore.value !== null && c.status === "organic_observation")
        transition(
          c,
          "organic_evaluated",
          actor,
          now,
          "Organic Score calculado com histórico do próprio perfil.",
        );
      this.store.save("creatives", c);
      this.audit(w, actor, id, "score_recalculated");
      this.notify(w, id, c.recommendation);
      return c;
    });
  }
  proposeTest(
    token: string | undefined,
    w: string,
    id: string,
    type: "GROWTH" | "CONVERSION",
  ) {
    const actor = this.access(token, w);
    if (!["GROWTH", "CONVERSION"].includes(type))
      throw new AuthError("Tipo de teste inválido.");
    return this.store.transaction(() => {
      const c = this.store.get("creatives", w, id),
        config = this.store.config(w);
      if (
        !c ||
        !["organic_evaluated", "test_proposed"].includes(c.status) ||
        c.organicScore.value === null ||
        c.organicScore.value < config.organicScoreThreshold
      )
        throw new AuthError("Reel ainda não elegível para proposta.", 409);
      const checked = organicScore(
        c,
        this.store.list("creatives", w),
        config,
        this.now(),
      );
      if (
        checked.value === null ||
        checked.value < config.organicScoreThreshold
      )
        throw new AuthError("Reavalie o Reel com a configuração vigente.", 409);
      const existing = this.store
        .list("tests", w)
        .filter((t) => t.creativeId === id && t.status !== "rejected");
      if (existing.some((t) => t.type === type))
        throw new AuthError("Já existe proposta deste tipo.", 409);
      const budget =
        type === "GROWTH"
          ? config.testBudgetGrowth
          : config.testBudgetConversion;
      const total = existing.reduce((s, t) => add(s, t.budget), budget);
      if (
        compare(budget, "0") <= 0 ||
        compare(total, config.maxTestBudgetPerReel) > 0
      )
        throw new AuthError("Orçamento ultrapassa o teto total por Reel.");
      if (!config.landingPage)
        throw new AuthError(
          "Administrador deve configurar o destino de tracking antes de propor testes.",
        );
      const testId = randomUUID(),
        identity = {
          workspaceId: w,
          campaignId: `planned-${testId}`,
          adsetId: `planned-set-${testId}`,
          adId: `planned-ad-${testId}`,
          creativeId: c.trafficCreativeId || c.id,
        };
      const url = new UrlTrackingService().buildUrl(
        config.landingPage,
        identity,
        {
          source: "meta",
          medium: "paid_social",
          campaign: `reel-${type.toLowerCase()}-${testId}`,
          content: identity.creativeId,
          term: type.toLowerCase(),
        },
      );
      const t: ReelTest = {
        id: testId,
        workspaceId: w,
        creativeId: id,
        type,
        budget,
        days: config.paidTestDays,
        status: "proposed",
        trackingUrl: url,
        tracking: Object.fromEntries(new URL(url).searchParams),
        createdAt: this.now(),
        decidedAt: null,
        actorId: null,
        reason: "",
        result: "inconclusive",
        before: c.business,
        during: null,
        after: null,
      };
      if (c.status === "organic_evaluated")
        transition(
          c,
          "test_proposed",
          actor.id,
          this.now(),
          "Proposta local; IDs de tracking reservados, campanha não criada.",
        );
      c.recommendation = "Proposta de teste aguarda decisão humana.";
      this.store.save("creatives", c);
      this.store.save("tests", t);
      this.audit(w, actor.id, testId, "test_proposed");
      this.notify(w, id, "Proposta de teste aguarda aprovação.");
      return t;
    });
  }
  decideTest(
    token: string | undefined,
    w: string,
    id: string,
    approved: boolean,
    reason: string,
  ) {
    const actor = this.access(token, w);
    text(reason, 1000);
    return this.store.transaction(() => {
      const t = this.store.get("tests", w, id);
      if (!t || t.status !== "proposed")
        throw new AuthError("Proposta não encontrada ou já decidida.", 409);
      const c = this.store.get("creatives", w, t.creativeId)!;
      const config = this.store.config(w);
      if (approved) {
        const total = this.store
          .list("tests", w)
          .filter((x) => x.creativeId === c.id && x.status !== "rejected")
          .reduce((s, x) => add(s, x.budget), "0");
        if (compare(total, config.maxTestBudgetPerReel) > 0)
          throw new AuthError(
            "Teto de orçamento mudou. Revise/rejeite as propostas antes de aprovar.",
          );
        if (c.status === "test_proposed") {
          transition(
            c,
            "test_approved",
            actor.id,
            this.now(),
            "Gestor aprovou a intenção de teste.",
          );
          transition(
            c,
            "paid_test_pending",
            actor.id,
            this.now(),
            "Aguardando execução Meta futura; nenhuma campanha criada.",
          );
        }
        t.status = "paid_test_pending";
      } else {
        t.status = "rejected";
        if (
          c.status === "test_proposed" &&
          !this.store
            .list("tests", w)
            .some(
              (x) =>
                x.id !== t.id &&
                x.creativeId === c.id &&
                x.status !== "rejected",
            )
        )
          transition(
            c,
            "organic_evaluated",
            actor.id,
            this.now(),
            "Proposta rejeitada; Reel volta à avaliação.",
          );
      }
      c.recommendation =
        c.status === "paid_test_pending"
          ? "Teste aprovado; execução Meta pendente."
          : c.status === "organic_evaluated"
            ? "Proposta rejeitada; revisar a avaliação."
            : "Proposta de teste aguarda decisão humana.";
      t.actorId = actor.id;
      t.decidedAt = this.now();
      t.reason = reason;
      this.store.save("tests", t);
      this.store.save("creatives", c);
      this.audit(w, actor.id, id, approved ? "test_approved" : "test_rejected");
      return t;
    });
  }
  mark(
    token: string | undefined,
    w: string,
    kind: "notification" | "task",
    id: string,
  ) {
    const actor = this.access(token, w);
    this.store.transaction(() => {
      if (kind === "notification") {
        const n = this.store.get("notifications", w, id);
        if (!n) throw new AuthError("Notificação não encontrada.", 404);
        if (!n.readBy.includes(actor.id)) n.readBy.push(actor.id);
        this.store.save("notifications", n);
      } else {
        const d = this.store.get("decisions", w, id);
        if (!d) throw new AuthError("Decisão não encontrada.", 404);
        d.taskStatus = "done";
        this.store.save("decisions", d);
        this.audit(w, actor.id, id, "task_completed_locally");
      }
    });
  }
  seedDemo(token: string | undefined, w: string) {
    this.access(token, w);
    if (this.store.list("creatives", w).some((c) => c.source === "demo"))
      return { message: "Exemplos já existem neste workspace." };
    const now = this.now();
    for (let i = 0; i < 7; i++) {
      this.saveCreative(
        token,
        w,
        {
          title: `Reel demonstrativo ${i + 1}`,
          profileId: "perfil-demo",
          publishedAt: new Date(now - (4 + i) * 86400000).toISOString(),
          organicAsOf: new Date(now - (2 + i) * 86400000).toISOString(),
          organic: {
            views: 1000,
            retention: i === 0 ? 90 : 50,
            shares: i === 0 ? 80 : 30,
            saves: 20,
            profileVisits: i === 0 ? 60 : 20,
            followers: 10,
          },
          hook: i % 2 ? "dinheiro" : "bastidores",
          format: "talking head",
          tags: "exemplo, demonstração",
        },
        "demo",
      );
    }
    return {
      message:
        "Exemplos demonstrativos criados; nenhuma métrica real foi usada.",
    };
  }
  tick(w: string) {
    const today = dateAt(this.now(), this.sources(w).timezone);
    if (!this.store.get("journal", w, `real:${today}`))
      this.generateInternal(w, "system", "real", "7");
    for (const c of this.store
      .list("creatives", w)
      .filter(
        (c) =>
          c.source !== "demo" &&
          ["published", "organic_observation", "organic_evaluated"].includes(
            c.status,
          ),
      )) {
      if (!c.evaluatedAt || this.now() - c.evaluatedAt > 86400000)
        this.evaluateInternal(w, c.id, "system");
    }
  }
}
export type IntelligenceSnapshot = ReturnType<IntelligenceService["snapshot"]>;
export { defaults };
