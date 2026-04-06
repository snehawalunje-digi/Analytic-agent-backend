import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const {
  FACEBOOK_PAGE_ID,
  FACEBOOK_PAGE_ACCESS_TOKEN,
  FACEBOOK_GRAPH_VERSION = "v25.0",
} = process.env;

const graphBase = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;

function ensureConfig() {
  if (!FACEBOOK_PAGE_ID) throw new Error("Missing FACEBOOK_PAGE_ID");
  if (!FACEBOOK_PAGE_ACCESS_TOKEN) throw new Error("Missing FACEBOOK_PAGE_ACCESS_TOKEN");
}

async function fbGet(path, params = {}) {
  ensureConfig();

  const { data } = await axios.get(`${graphBase}${path}`, {
    params: {
      ...params,
      access_token: FACEBOOK_PAGE_ACCESS_TOKEN,
    },
  });

  return data;
}

export async function getFacebookPageProfile() {
  return fbGet(`/${FACEBOOK_PAGE_ID}`, {
    fields: "id,name,fan_count,followers_count",
  });
}

export async function getFacebookPagePosts() {
  return fbGet(`/${FACEBOOK_PAGE_ID}/posts`, {
    fields: "id,message,created_time,permalink_url",
    // limit: 100,
  });
}

export async function getFacebookPostMetrics(postId) {
  try {
    return await fbGet(`/${postId}`, {
      fields: "id,created_time,message,shares,reactions.summary(true),comments.summary(true)",
    });
  } catch (error) {
    console.error(
      `getFacebookPostMetrics failed for ${postId}:`,
      error?.response?.data || error.message
    );
    throw error;
  }
}

export async function getFacebookPageInsights() {
  try {
    return await fbGet(`/${FACEBOOK_PAGE_ID}/insights`, {
      metric: "page_post_engagement",
    });
  } catch (error) {
    return {
      error: true,
      message: error?.response?.data?.error?.message || error.message,
      data: [],
    };
  }
}