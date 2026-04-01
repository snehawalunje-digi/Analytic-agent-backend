import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "instagram-followers.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2));
  }
}

export function readFollowerSnapshots() {
  ensureFile();
  return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
}

export function saveFollowerSnapshot(snapshot) {
  ensureFile();
  const snapshots = readFollowerSnapshots();

  const date = snapshot.date;
  const existing = snapshots.find((item) => item.date === date);

  if (!existing) {
    snapshots.push(snapshot);
    fs.writeFileSync(FILE_PATH, JSON.stringify(snapshots, null, 2));
  }

  return snapshots;
}

export function computeFollowerGrowth(snapshots = [], startDate, endDate) {
  const filtered = snapshots
    .filter((item) => item.date >= startDate && item.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (filtered.length < 2) {
    return {
      currentFollowers: filtered[filtered.length - 1]?.followersCount || 0,
      absoluteGrowth: 0,
      growthRate: 0,
      points: filtered,
    };
  }

  const first = filtered[0].followersCount;
  const last = filtered[filtered.length - 1].followersCount;
  const absoluteGrowth = last - first;
  const growthRate = first > 0 ? (absoluteGrowth / first) * 100 : 0;

  return {
    currentFollowers: last,
    absoluteGrowth,
    growthRate: Number(growthRate.toFixed(2)),
    points: filtered,
  };
}