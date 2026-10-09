export type DanmakuMode = 'scroll' | 'top' | 'bottom';
export type DanmakuKind = 'chat' | 'paid' | 'member' | 'system';

export type DanmakuPart = { text: string } | { src: string; alt: string };

export interface DanmakuItem {
  time: number;
  mode: DanmakuMode;
  kind: DanmakuKind;
  parts: DanmakuPart[];
  author?: string;
  color?: string;
  scale?: number;
  badge?: string;
  background?: string;
  foreground?: string;
}

interface YtRun {
  text?: string;
  emoji?: {
    emojiId?: string;
    isCustomEmoji?: boolean;
    shortcuts?: string[];
    image?: { thumbnails?: { url: string; width?: number }[] };
  };
}

interface YtText {
  simpleText?: string;
  runs?: YtRun[];
}

type YtRenderer = Record<string, any>;

function runsToParts(text: YtText | undefined): DanmakuPart[] {
  if (!text) return [];
  if (text.simpleText) return [{ text: text.simpleText }];
  const parts: DanmakuPart[] = [];
  for (const run of text.runs ?? []) {
    if (run.text) {
      parts.push({ text: run.text });
    } else if (run.emoji) {
      const { emoji } = run;
      const alt = emoji.shortcuts?.[0] ?? emoji.emojiId ?? '';
      if (emoji.isCustomEmoji) {
        const thumbs = emoji.image?.thumbnails ?? [];
        const src = thumbs[thumbs.length - 1]?.url;
        parts.push(src ? { src, alt } : { text: alt });
      } else {
        parts.push({ text: emoji.emojiId ?? alt });
      }
    }
  }
  return parts;
}

function plain(text: YtText | undefined): string {
  if (!text) return '';
  if (text.simpleText) return text.simpleText;
  return (text.runs ?? []).map((r) => r.text ?? '').join('');
}

function argb(value: unknown): string | undefined {
  if (typeof value !== 'number') return undefined;
  const a = ((value >>> 24) & 255) / 255;
  const r = (value >>> 16) & 255;
  const g = (value >>> 8) & 255;
  const b = value & 255;
  return `rgb(${r} ${g} ${b} / ${a.toFixed(3)})`;
}

function author(renderer: YtRenderer): string | undefined {
  return plain(renderer.authorName) || undefined;
}

function fromYouTubeRenderer(type: string, r: YtRenderer, time: number): DanmakuItem | null {
  switch (type) {
    case 'liveChatTextMessageRenderer': {
      const parts = runsToParts(r.message);
      if (!parts.length) return null;
      const isOwner = (r.authorBadges ?? []).some(
        (b: any) => b.liveChatAuthorBadgeRenderer?.icon?.iconType === 'OWNER',
      );
      const isModerator = (r.authorBadges ?? []).some(
        (b: any) => b.liveChatAuthorBadgeRenderer?.icon?.iconType === 'MODERATOR',
      );
      return {
        time,
        mode: 'scroll',
        kind: 'chat',
        parts,
        author: author(r),
        color: isOwner ? '#ffd600' : isModerator ? '#8fb4ff' : undefined,
      };
    }
    case 'liveChatPaidMessageRenderer':
      return {
        time,
        mode: 'scroll',
        kind: 'paid',
        parts: runsToParts(r.message),
        author: author(r),
        badge: plain(r.purchaseAmountText),
        background: argb(r.bodyBackgroundColor),
        foreground: argb(r.bodyTextColor),
      };
    case 'liveChatPaidStickerRenderer': {
      const thumbs = r.sticker?.thumbnails ?? [];
      const src = thumbs[thumbs.length - 1]?.url;
      return {
        time,
        mode: 'scroll',
        kind: 'paid',
        parts: src ? [{ src: src.startsWith('//') ? 'https:' + src : src, alt: 'sticker' }] : [],
        author: author(r),
        badge: plain(r.purchaseAmountText),
        background: argb(r.backgroundColor),
        foreground: argb(r.moneyChipTextColor),
      };
    }
    case 'liveChatMembershipItemRenderer': {
      const message = runsToParts(r.message);
      const header = plain(r.headerPrimaryText) || plain(r.headerSubtext);
      return {
        time,
        mode: 'scroll',
        kind: 'member',
        parts: message.length ? message : [{ text: header }],
        author: author(r),
        badge: message.length ? header : undefined,
      };
    }
    case 'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer': {
      const header = r.header?.liveChatSponsorshipsHeaderRenderer;
      if (!header) return null;
      return {
        time,
        mode: 'scroll',
        kind: 'member',
        parts: [{ text: plain(header.primaryText) }],
        author: author(header),
      };
    }
    case 'liveChatSponsorshipsGiftRedemptionAnnouncementRenderer':
      return {
        time,
        mode: 'scroll',
        kind: 'member',
        parts: [{ text: plain(r.message) }],
        author: author(r),
      };
    default:
      return null;
  }
}

function parseYouTubeAction(action: any, time: number, out: DanmakuItem[]) {
  const item = action?.addChatItemAction?.item;
  if (!item) return;
  for (const [type, renderer] of Object.entries(item)) {
    const parsed = fromYouTubeRenderer(type, renderer as YtRenderer, time);
    if (parsed) out.push(parsed);
  }
}

function parseYouTubeLines(text: string): DanmakuItem[] {
  const out: DanmakuItem[] = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end).trim();
    start = end + 1;
    if (!line) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const replay = obj.replayChatItemAction;
    if (replay) {
      const time = Number(replay.videoOffsetTimeMsec ?? 0) / 1000;
      for (const action of replay.actions ?? []) parseYouTubeAction(action, time, out);
    }
  }
  return out;
}

function parseChatDownloader(list: any[]): DanmakuItem[] {
  const out: DanmakuItem[] = [];
  for (const m of list) {
    const time = Number(m.time_in_seconds ?? m.time ?? m.offset);
    const message = m.message ?? m.text ?? m.content;
    if (!Number.isFinite(time) || typeof message !== 'string' || !message) continue;
    const paid = typeof m.money?.text === 'string';
    out.push({
      time,
      mode: 'scroll',
      kind: paid ? 'paid' : 'chat',
      parts: [{ text: message }],
      author: m.author?.name ?? m.author,
      badge: paid ? m.money.text : undefined,
      background: paid ? m.colours?.body_background_colour && '#' + m.colours.body_background_colour : undefined,
    });
  }
  return out;
}

function parseBilibiliXml(text: string): DanmakuItem[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const out: DanmakuItem[] = [];
  for (const d of Array.from(doc.getElementsByTagName('d'))) {
    const p = (d.getAttribute('p') ?? '').split(',');
    const time = Number(p[0]);
    const mode = Number(p[1]);
    const content = d.textContent ?? '';
    if (!Number.isFinite(time) || !content || mode > 6) continue;
    const size = Number(p[2]) || 25;
    const color = Number(p[3]);
    out.push({
      time,
      mode: mode === 4 ? 'bottom' : mode === 5 ? 'top' : 'scroll',
      kind: 'chat',
      parts: [{ text: content }],
      scale: size / 25,
      color: Number.isFinite(color) && color !== 0xffffff ? '#' + color.toString(16).padStart(6, '0') : undefined,
    });
  }
  return out;
}

export function parseDanmaku(text: string): DanmakuItem[] {
  const head = text.slice(0, 2000).trimStart();
  let items: DanmakuItem[];
  if (head.startsWith('<')) {
    items = parseBilibiliXml(text);
  } else if (head.startsWith('[')) {
    items = parseChatDownloader(JSON.parse(text));
  } else {
    items = parseYouTubeLines(text);
  }
  return items.sort((a, b) => a.time - b.time);
}
