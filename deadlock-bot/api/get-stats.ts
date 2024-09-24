import { kv } from "@vercel/kv";
import { VercelRequest, VercelResponse } from '@vercel/node';

const stats = [
    "reddit-bot-requests",
    "scanned-comments",
    "referenced-items",
    "matched-items",
    "replied-comments",
    "failed-replies",
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Get all stats:
  const statsData = await kv.mget(stats);
  const responseData = statsData.map((value, index) => {
    return {
      name: stats[index],
      value: value ?? 0
    }
  });
  return res.status(200).json(responseData);
}