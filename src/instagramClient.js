import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const API_VERSION = process.env.INSTAGRAM_API_VERSION || "v25.0";
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_USER_ID = process.env.INSTAGRAM_IG_USER_ID;

const graphBase = `https://graph.instagram.com/${API_VERSION}`;

function ensureConfig() {
  if (!ACCESS_TOKEN) throw new Error("Missing INSTAGRAM_ACCESS_TOKEN");
  if (!IG_USER_ID) throw new Error("Missing INSTAGRAM_IG_USER_ID");
}

async function igGet(path, params = {}) {
  ensureConfig();

  const { data } = await axios.get(`${graphBase}${path}`, {
    params: {
      ...params,
      access_token: ACCESS_TOKEN,
    },
  });

  return data;
}

export async function getInstagramProfile() {
  return igGet(`/${IG_USER_ID}`, {
    fields: "id,username,followers_count,media_count",
  });
}

export async function getInstagramMedia() {
  return igGet(`/${IG_USER_ID}/media`, {
    fields: "id,caption,media_type,media_product_type,timestamp,like_count,comments_count",
  });
}

export async function getInstagramMediaInsights(mediaId, metrics = ["reach", "views"]) {
  try {
    return await igGet(`/${mediaId}/insights`, {
      metric: metrics.join(","),
    });
  } catch (error) {
    const message =
      error?.response?.data?.error?.message || error.message;

    return {
      error: true,
      message,
      data: [],
    };
  }
}