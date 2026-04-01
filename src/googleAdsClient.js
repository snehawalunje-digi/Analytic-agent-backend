import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";
dotenv.config();

const {
  GOOGLE_ADS_CLIENT_ID,
  GOOGLE_ADS_CLIENT_SECRET,
  GOOGLE_ADS_REFRESH_TOKEN,
  GOOGLE_ADS_DEVELOPER_TOKEN,
  GOOGLE_ADS_CUSTOMER_ID,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  GOOGLE_ADS_API_VERSION = "v23",
} = process.env;

function ensureConfig() {
  const required = {
    GOOGLE_ADS_CLIENT_ID,
    GOOGLE_ADS_CLIENT_SECRET,
    GOOGLE_ADS_REFRESH_TOKEN,
    GOOGLE_ADS_DEVELOPER_TOKEN,
    GOOGLE_ADS_CUSTOMER_ID,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  };

  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      throw new Error(`Missing env: ${key}`);
    }
  }
}

export async function getGoogleAdsAccessToken() {
  ensureConfig();

  const oauth2Client = new OAuth2Client(
    GOOGLE_ADS_CLIENT_ID,
    GOOGLE_ADS_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
  });

  const { token } = await oauth2Client.getAccessToken();

  if (!token) {
    throw new Error("Failed to generate Google Ads access token");
  }

  return token;
}

export async function runGoogleAdsQuery(query) {
  ensureConfig();

  const accessToken = await getGoogleAdsAccessToken();

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream`;

  const { data } = await axios.post(
    url,
    { query },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
        "login-customer-id": GOOGLE_ADS_LOGIN_CUSTOMER_ID,
        "Content-Type": "application/json",
      },
    }
  );

  return data;
}