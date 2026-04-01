import { getInstagramProfile } from "./instagramClient.js";
import {
  saveFollowerSnapshot,
  readFollowerSnapshots,
  computeFollowerGrowth,
} from "./instagramFollowerStore.js";

export async function captureInstagramFollowerSnapshot() {
  const profile = await getInstagramProfile();

  const today = new Date().toISOString().slice(0, 10);

  saveFollowerSnapshot({
    date: today,
    followersCount: Number(profile.followers_count || 0),
  });

  return {
    ok: true,
    date: today,
    followersCount: Number(profile.followers_count || 0),
  };
}

export function getInstagramFollowerGrowth(startDate, endDate) {
  const snapshots = readFollowerSnapshots();
  return computeFollowerGrowth(snapshots, startDate, endDate);
}