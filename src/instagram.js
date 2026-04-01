import {
  getInstagramProfile,
  getInstagramMedia,
  getInstagramMediaInsights,
} from "./instagramClient.js";

function inRange(dateStr, startDate, endDate) {
  const d = new Date(dateStr);
  return d >= new Date(startDate) && d <= new Date(endDate);
}

function safeNumber(value) {
  return Number(value || 0);
}

function groupByMediaType(media = []) {
  return media.reduce((acc, item) => {
    const key = item.media_type || "UNKNOWN";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function enrichMediaWithInsights(media = []) {
  const results = await Promise.all(
    media.map(async (item) => {
      const insightRes = await getInstagramMediaInsights(item.id, ["reach", "views"]);

      let reach = 0;
      let views = 0;

      if (!insightRes?.error && Array.isArray(insightRes?.data)) {
        for (const metric of insightRes.data) {
          if (metric.name === "reach") {
            reach = safeNumber(metric.values?.[0]?.value);
          }
          if (metric.name === "views") {
            views = safeNumber(metric.values?.[0]?.value);
          }
        }
      }

      const likes = safeNumber(item.like_count);
      const comments = safeNumber(item.comments_count);
      const engagement = likes + comments;
      const engagementRate = reach > 0 ? (engagement / reach) * 100 : 0;

      return {
        ...item,
        reach,
        views,
        engagement,
        engagementRate: Number(engagementRate.toFixed(2)),
      };
    })
  );

  return results;
}

export async function getInstagramOverview({ startDate, endDate }) {
  const [profile, mediaRes] = await Promise.all([
    getInstagramProfile(),
    getInstagramMedia(),
  ]);

  const media = (mediaRes?.data || []).filter((item) =>
    inRange(item.timestamp, startDate, endDate)
  );

  const enrichedMedia = await enrichMediaWithInsights(media);

  const totalLikes = enrichedMedia.reduce((sum, item) => sum + safeNumber(item.like_count), 0);
  const totalComments = enrichedMedia.reduce((sum, item) => sum + safeNumber(item.comments_count), 0);
  const totalReach = enrichedMedia.reduce((sum, item) => sum + safeNumber(item.reach), 0);
  const totalViews = enrichedMedia.reduce((sum, item) => sum + safeNumber(item.views), 0);
  const totalEngagement = enrichedMedia.reduce((sum, item) => sum + safeNumber(item.engagement), 0);

  const avgEngagementRate =
    enrichedMedia.length > 0
      ? enrichedMedia.reduce((sum, item) => sum + safeNumber(item.engagementRate), 0) /
        enrichedMedia.length
      : 0;

  return {
    profile: {
      id: profile.id,
      username: profile.username,
      followersCount: safeNumber(profile.followers_count),
      mediaCount: safeNumber(profile.media_count),
    },
    summary: {
      postsPublished: enrichedMedia.length,
      totalLikes,
      totalComments,
      totalReach,
      totalViews,
      totalEngagement,
      avgEngagementRate: Number(avgEngagementRate.toFixed(2)),
    },
    breakdown: groupByMediaType(enrichedMedia),
    posts: enrichedMedia,
  };
}