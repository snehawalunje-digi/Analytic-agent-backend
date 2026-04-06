import dotenv from "dotenv";
dotenv.config();
import { google } from "googleapis";
import { saveUserTokens } from "./searchConsoleTokenStore.js";

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

export function createSearchConsoleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID,
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET,
    process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI
  );
}

export function getSearchConsoleAuthUrl(userId) {
  const oauth2Client = createSearchConsoleOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: userId,
  });
}

export async function exchangeCodeForTokens(code) {
  const oauth2Client = createSearchConsoleOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export function getSearchConsoleApi(tokens, userId) {
  const oauth2Client = createSearchConsoleOAuthClient();
  oauth2Client.setCredentials(tokens);

  // auto update tokens in JSON
  oauth2Client.on("tokens", (newTokens) => {
    if (newTokens.access_token || newTokens.refresh_token) {
      saveUserTokens(userId, {
        ...tokens,
        ...newTokens,
      });
    }
  });

  return google.webmasters({
    version: "v3",
    auth: oauth2Client,
  });
}