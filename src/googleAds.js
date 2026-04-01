import { runGoogleAdsQuery } from "./googleAdsClient.js";

function safeNumber(value) {
  return Number(value || 0);
}

function microsToCurrency(micros) {
  return Number((safeNumber(micros) / 1_000_000).toFixed(2));
}

export async function getGoogleAdsOverview({ startDate, endDate }) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY segments.date ASC
  `;

  const stream = await runGoogleAdsQuery(query);

  const rows = [];
  for (const chunk of stream) {
    if (Array.isArray(chunk.results)) {
      rows.push(...chunk.results);
    }
  }

  const normalized = rows.map((row) => ({
    campaignId: row.campaign?.id,
    campaignName: row.campaign?.name,
    campaignStatus: row.campaign?.status,
    date: row.segments?.date,
    impressions: safeNumber(row.metrics?.impressions),
    clicks: safeNumber(row.metrics?.clicks),
    cost: microsToCurrency(row.metrics?.costMicros),
    conversions: safeNumber(row.metrics?.conversions),
    conversionsValue: safeNumber(row.metrics?.conversionsValue),
    ctr: safeNumber(row.metrics?.ctr),
    averageCpc: microsToCurrency(row.metrics?.averageCpc),
  }));

  const summary = normalized.reduce(
    (acc, row) => {
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.cost += row.cost;
      acc.conversions += row.conversions;
      acc.conversionsValue += row.conversionsValue;
      return acc;
    },
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionsValue: 0, }
  );

  summary.ctr =
    summary.impressions > 0
      ? Number(((summary.clicks / summary.impressions) * 100).toFixed(2))
      : 0;

  summary.avgCpc =
    summary.clicks > 0
      ? Number((summary.cost / summary.clicks).toFixed(2))
      : 0;

  summary.roas =
  summary.cost > 0
    ? Number((summary.conversionsValue / summary.cost).toFixed(2))
    : 0;

  const byCampaignMap = {};
  for (const row of normalized) {
    const key = row.campaignId;

    if (!byCampaignMap[key]) {
      byCampaignMap[key] = {
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        campaignStatus: row.campaignStatus,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        conversionsValue: 0,
      };
    }

    byCampaignMap[key].impressions += row.impressions;
    byCampaignMap[key].clicks += row.clicks;
    byCampaignMap[key].cost += row.cost;
    byCampaignMap[key].conversions += row.conversions;
    byCampaignMap[key].conversionsValue += row.conversionsValue;
  }

  const campaigns = Object.values(byCampaignMap).map((c) => ({
    ...c,
    ctr:
      c.impressions > 0
        ? Number(((c.clicks / c.impressions) * 100).toFixed(2))
        : 0,
    avgCpc:
      c.clicks > 0 ? Number((c.cost / c.clicks).toFixed(2)) : 0,
    roas:
    c.cost > 0 ? Number((c.conversionsValue / c.cost).toFixed(2)) : 0,
  }));

  const byDateMap = {};
  for (const row of normalized) {
    if (!byDateMap[row.date]) {
      byDateMap[row.date] = {
        date: row.date,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        conversionsValue: 0,
      };
    }

    byDateMap[row.date].impressions += row.impressions;
    byDateMap[row.date].clicks += row.clicks;
    byDateMap[row.date].cost += row.cost;
    byDateMap[row.date].conversions += row.conversions;
    byDateMap[row.date].conversionsValue += row.conversionsValue;
  }

  const trend = Object.values(byDateMap).map((d) => ({
    ...d,
    roas: d.cost > 0 ? Number((d.conversionsValue / d.cost).toFixed(2)) : 0,
  }));

  return {
    summary: {
      ...summary,
      cost: Number(summary.cost.toFixed(2)),
      conversionsValue: Number(summary.conversionsValue.toFixed(2)),
    },
    campaigns,
    trend,
    rows: normalized,
  };
}