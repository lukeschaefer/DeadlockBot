// api/reddit-bot.ts

import { VercelRequest, VercelResponse } from '@vercel/node';
import Snoowrap from 'snoowrap';
import dotenv from 'dotenv';
import stringSimilarity from 'string-similarity';
import {ALL_ITEMS, Item} from 'deadlock-content';

dotenv.config();

const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE) || 0.35;

const redditClient = new Snoowrap({
  userAgent: process.env.USER_AGENT!,
  clientId: process.env.CLIENT_ID!,
  clientSecret: process.env.CLIENT_SECRET!,
  username: process.env.REDDIT_USER!,
  password: process.env.REDDIT_PASS!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const subredditName = process.env.SUBREDDIT!;
    const subreddit = redditClient.getSubreddit(subredditName);
    const comments = await subreddit.getNewComments({ limit: 20 });
    let responses : string[] = [];
    for (const comment of comments) {

      const referencedItems = extractItemNames(comment.body);

      if(referencedItems.length ==  0) continue;

      // Only check the first 10 items just in case of a weird edge case
      const matchedItems = matchItems(referencedItems.slice(0, 10));
      console.log(`Matched ${matchedItems.length} out of ${referencedItems.length} items.`);

      if(matchedItems.length == 0) continue;
      const disclaimer = renderDisclaimer(matchedItems[0]);
      const markdown = matchedItems.map(renderItemToMarkdown).join('\n------\n\n') + disclaimer;
      responses.push(markdown);

      // Check if already replied
      const replies = await comment.expandReplies({ limit: 1, depth: 1 });

      const alreadyReplied = replies.replies.some(
        (reply: any) => reply.author.name === redditClient.username
      );

      if (!alreadyReplied) {
        try {
          await comment.reply(markdown);
          console.log(`Replied to comment ID: ${comment.id}`);  
        } catch(error) {
          console.log(`Unable to reply to comment ID: ${comment.id}`);
          console.log(error);
        }
      }
    }
    res.send("FOUND " + responses.length + " comments!\n\n" + responses.join('\n\n------\n\n'));
  } catch (error) {
    // console.error('Error in Reddit bot function:', error);
    res.status(500).send('Error in Reddit bot function.');
  }
}

function extractItemNames(text: string) {
  // Extract all text that's in two square brackets like [[so]]:
  const matches = [...(text.match(/\[\[(.*?)\]\]/g) ?? [])];
  return matches.map((match) => match.slice(2, -2));
}

function matchItems(referencedItems: string[]) {
  return referencedItems.map((item) => stringSimilarity.findBestMatch(item, itemNames).bestMatch)
  .filter((match) => match.rating >= MIN_CONFIDENCE)
  .map((match) =>  items[match.target])
  // max 3 items:
  .slice(0, 3);
}

const items = ALL_ITEMS.reduce((acc, item) => {
  acc[item.name] = item;
  return acc;
}, {} as Record<string, Item>);
const itemNames = Object.keys(items);

function renderItemToMarkdown(item: Item) {
  const heading = `### ${item.name}  ($${item.price})\n`;
  const preReq = item.preReq ? `\nRequires: ${item.preReq!.name}\n` : '';
  const buildsInto = item.buildsInto ? `\n> Component of: **${item.buildsInto.name}**\n` : '';
  const stats = item.stats.map(stat => `    ${(stat.amount as number) > 0 ? "+" : ""}${stat.amount}${stat.unit} ${stat.stat}  `).join('\n') + '\n';

  let passive = "";
  if(item.passive) {
    passive = `\n|Passive ${item.passive.cooldown ? `(⌛${item.passive.cooldown}s)` : ""}|\n:-|\n`;
    passive += "|" + item.passive.description + "\n";
    if(item.passive.details && item.passive.details.length > 0)
      passive += item.passive.details?.map(detail => `\n    ${detail.ordinal}${detail.amount}${detail.unit} ${detail.stat}  `).join('');
  }

  let active = "";
  if(item.active) {
    active = `\n|Active ${item.active.cooldown ? `(⌛${item.active.cooldown}s)` : ""}|\n:-|\n`;
    active += "|" + item.active.description + "\n";
    if(item.active.details && item.active.details.length > 0)
      active += item.active.details?.map(detail => `\n    ${detail.ordinal}${detail.amount}${detail.unit} ${detail.stat}  `).join('');
  }


  return `${heading}${preReq}\n${stats}${passive}${active}${buildsInto}`;
}

function renderDisclaimer(item: Item) {
  const safeItemName = item.name.replace(/[^a-zA-Z0-9]/g, '');
  return `
  
-----
^This ^response ^was ^automatically ^made ^by [^a ^bot](https://github.com/lukeschaefer/DeadlockBot) ^- ^if ^it's ^incorrect ^send ^a ^DM!  
^Or ^alternatively ^file ^an ^issue ^[here](https://github.com/lukeschaefer/Deadlock-Content/issues/new?assignees=&labels=&projects=&template=incorrect-item-details.md&title=Item%20correction%20for%20${safeItemName})`;
}