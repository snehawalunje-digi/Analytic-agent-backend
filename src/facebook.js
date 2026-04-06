import {
  getFacebookPageProfile,
  getFacebookPagePosts,
  getFacebookPostMetrics,
  getFacebookPageInsights,
} from "./facebookClient.js";

function safeNumber(value) {
  return Number(value || 0);
}

function inRange(dateStr, startDate, endDate) {
  const d = new Date(dateStr);
  return d >= new Date(startDate) && d <= new Date(endDate);
}

async function enrichPosts(posts = []) {
  const detailed = await Promise.all(
    posts.map(async (post) => {
      try {
        const data = await getFacebookPostMetrics(post.id);

        const reactions = safeNumber(data.reactions?.summary?.total_count);
        const comments = safeNumber(data.comments?.summary?.total_count);
        const shares = safeNumber(data.shares?.count);
        const totalEngagement = reactions + comments + shares;

        return {
          ...post,
          reactions,
          comments,
          shares,
          totalEngagement,
        };
      } catch (error) {
        console.error(`Post metrics failed for post ${post.id}:`, error.message);

        return {
          ...post,
          reactions: 0,
          comments: 0,
          shares: 0,
          totalEngagement: 0,
        };
      }
    })
  );

  return detailed;
}

export async function getFacebookOverview({ startDate, endDate }) {
  const [profile, postsRes, insightsRes] = await Promise.all([
    getFacebookPageProfile(),
    getFacebookPagePosts(),
    getFacebookPageInsights(),
  ]);

 const posts = postsRes?.data || [];


  const enrichedPosts = await enrichPosts(posts);

  const summary = enrichedPosts.reduce(
    (acc, post) => {
      acc.postsPublished += 1;
      acc.reactions += safeNumber(post.reactions);
      acc.comments += safeNumber(post.comments);
      acc.shares += safeNumber(post.shares);
      acc.totalEngagement += safeNumber(post.totalEngagement);
      return acc;
    },
    {
      postsPublished: 0,
      reactions: 0,
      comments: 0,
      shares: 0,
      totalEngagement: 0,
    }
  );

  const insights = {};
  if (!insightsRes?.error && Array.isArray(insightsRes?.data)) {
    for (const metric of insightsRes.data) {
      insights[metric.name] = metric.values?.[0]?.value ?? 0;
    }
  }

  return {
    profile: {
      id: profile.id,
      name: profile.name,
      fanCount: safeNumber(profile.fan_count),
      followersCount: safeNumber(profile.followers_count),
    },
    summary,
    insights: {
      pageImpressions: safeNumber(insights.page_impressions),
      pagePostEngagements: safeNumber(insights.page_post_engagement),
      pageFans: safeNumber(insights.page_fans),
    },
    posts: enrichedPosts,
  };
}