import fs from "fs";
import path from "path";

const filePath = path.resolve("data/searchConsoleTokens.json");

function readTokens() {
  if (!fs.existsSync(filePath)) return {};
  const data = fs.readFileSync(filePath, "utf-8");
  return data ? JSON.parse(data) : {};
}

function writeTokens(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function saveUserTokens(userId, tokens) {

  const allTokens = readTokens();

  allTokens[userId] = {
    ...allTokens[userId],
    ...tokens,
  };

  writeTokens(allTokens);
}

export function getUserTokens(userId) {
  const allTokens = readTokens();
  return allTokens[userId] || null;
}