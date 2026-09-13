import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, change, windowRows } from "../src/domain/metrics";
import {
  defaultGoals,
  readStored,
  validDecisions,
  validGoals,
} from "../src/domain/preferences";
import { mockRepository } from "../src/data/mock-repository";

test("métricas usam totais ponderados e divisões sem base são finitas", () => {
  const empty = aggregate([]);
  assert.equal(empty.cpl, 0);
  assert.equal(empty.ctr, 0);
  assert.equal(empty.frequency, 0);
  const base = {
    workspaceId: "ws-scale",
    date: "2026-09-12",
    campaignId: "a",
    impressions: 1000,
    clicks: 20,
    leads: 10,
    sales: 1,
    reach: 500,
    revenue: 500,
  };
  const result = aggregate([
    { ...base, spend: 100 },
    { ...base, spend: 900, leads: 30, impressions: 9000 },
  ]);
  assert.equal(result.cpl, 25);
  assert.equal(result.ctr, 0.4);
  assert.equal(result.cpm, 100);
  assert.equal(result.cpa, 500);
  assert.equal(result.roas, 1);
  assert.equal(change(100, 0), null);
  assert.equal(change(75, 100), -25);
});
test("janelas de 7, 14 e 30 dias são completas e não se sobrepõem", async () => {
  const data = await mockRepository.getDataset({
    id: "ws-scale",
    name: "Scale Digital",
  });
  for (const days of [7, 14, 30]) {
    const current = windowRows(data.daily, days);
    const previous = windowRows(data.daily, days, true);
    assert.equal(current.length, days * data.campaigns.length);
    assert.equal(previous.length, current.length);
    const dates = new Set(current.map((r) => r.date));
    assert.equal(
      previous.some((r) => dates.has(r.date)),
      false,
    );
    const total = aggregate(current).spend;
    const perCampaign = data.campaigns.reduce(
      (sum, c) =>
        sum + aggregate(current.filter((r) => r.campaignId === c.id)).spend,
      0,
    );
    assert.ok(Math.abs(total - perCampaign) < 0.0001);
  }
});
test("fixtures preservam atribuição de leads, orçamento e integridade de campanhas", async () => {
  const data = await mockRepository.getDataset({
    id: "ws-scale",
    name: "Scale Digital",
  });
  for (const lead of data.leads) {
    const creative = data.creatives.find((c) => c.id === lead.creativeId);
    assert.equal(creative?.campaignId, lead.campaignId);
    assert.equal(lead.sale, lead.value > 0);
  }
  for (const campaign of data.campaigns)
    assert.equal(
      data.creatives
        .filter((c) => c.campaignId === campaign.id)
        .reduce((s, c) => s + c.share, 0),
      1,
    );
  for (const row of data.daily) {
    assert.ok(row.leads <= row.clicks);
    assert.ok(row.clicks <= row.impressions);
    assert.ok(row.sales <= row.leads);
    assert.ok(row.spend >= 0);
  }
  assert.ok(
    data.recommendations.every((r) =>
      data.campaigns.some((c) => c.id === r.campaignId),
    ),
  );
});
test("metas inválidas e armazenamento corrompido não contaminam a aplicação", () => {
  assert.ok(validGoals(defaultGoals));
  for (const bad of [
    null,
    {},
    { ...defaultGoals, maxCpl: -1 },
    { ...defaultGoals, targetRoas: Infinity },
    { ...defaultGoals, qualificationRate: 101 },
    { ...defaultGoals, dailyBudget: "4000" },
  ])
    assert.equal(validGoals(bad), false);
  assert.deepEqual(
    readStored("{broken", defaultGoals, validGoals),
    defaultGoals,
  );
  assert.deepEqual(
    readStored(
      JSON.stringify({ ...defaultGoals, maxCpl: 55 }),
      defaultGoals,
      validGoals,
    ),
    { ...defaultGoals, maxCpl: 55 },
  );
  assert.equal(
    validDecisions({ "rec-1": "approved", "rec-2": "ignored" }),
    true,
  );
  assert.equal(validDecisions({ "rec-1": "executed" }), false);
  assert.equal(validDecisions([]), false);
});
