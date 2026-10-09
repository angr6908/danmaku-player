import type { DanmakuItem } from './parse';
import { settings, type DanmakuSettings } from './settings';

interface Comment {
  item: DanmakuItem;
  el: HTMLElement;
  width: number;
  start: number;
  duration: number;
  lane: number;
}

const FIXED_DURATION = 4.5;
const MAX_DELAY = 2.5;
const MAX_ACTIVE = 400;
const LANE_RATIO = 1.4;

function lowerBound(items: DanmakuItem[], time: number) {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class DanmakuLayer extends HTMLElement {
  #media: HTMLMediaElement | null = null;
  #items: DanmakuItem[] = [];
  #cursor = 0;
  #active: Comment[] = [];
  #pending: Comment[] = [];
  #lanes: Record<DanmakuItem['mode'], (Comment | null)[]> = { scroll: [], top: [], bottom: [] };
  #width = 0;
  #height = 0;
  #font = 24;
  #laneHeight = 34;
  #laneCount = 1;
  #lastTime = NaN;
  #needsReset = true;
  #raf = 0;
  #resizeObserver = new ResizeObserver(() => this.#measure());
  #unsubscribe: (() => void) | null = null;
  #mediaAbort: AbortController | null = null;

  connectedCallback() {
    this.setAttribute('aria-hidden', 'true');
    this.#resizeObserver.observe(this);
    this.#unsubscribe = settings.subscribe((value, key) => this.#applySettings(value, key));
    this.#raf = requestAnimationFrame(this.#frame);
  }

  disconnectedCallback() {
    this.#resizeObserver.disconnect();
    this.#unsubscribe?.();
    cancelAnimationFrame(this.#raf);
    this.#mediaAbort?.abort();
    this.#clear();
  }

  get media() {
    return this.#media;
  }

  set media(media: HTMLMediaElement | null) {
    this.#mediaAbort?.abort();
    this.#media = media;
    this.#needsReset = true;
    if (!media) return;
    this.#mediaAbort = new AbortController();
    const reset = () => (this.#needsReset = true);
    for (const type of ['seeking', 'emptied', 'loadedmetadata']) {
      media.addEventListener(type, reset, { signal: this.#mediaAbort.signal });
    }
  }

  get items() {
    return this.#items;
  }

  set items(items: DanmakuItem[]) {
    this.#items = items;
    this.#needsReset = true;
  }

  #applySettings(value: Readonly<DanmakuSettings>, key?: keyof DanmakuSettings) {
    this.style.opacity = String(value.opacity);
    this.hidden = !value.enabled;
    if (key === 'scale' || key === 'area') this.#measure();
    else if (key !== 'opacity' && key !== 'names' && key !== 'paid') this.#needsReset = true;
  }

  #measure() {
    const { scale, area } = settings.value;
    this.#width = this.clientWidth;
    this.#height = this.clientHeight;
    this.#font = Math.round(Math.min(56, Math.max(14, this.#height * 0.04)) * scale);
    this.#laneHeight = Math.round(this.#font * LANE_RATIO);
    this.#laneCount = Math.max(1, Math.floor((this.#height * area) / this.#laneHeight));
    this.style.fontSize = `${this.#font}px`;
    this.#needsReset = true;
  }

  #frame = () => {
    this.#raf = requestAnimationFrame(this.#frame);
    const media = this.#media;
    if (!media || !this.#width) return;
    const time = media.currentTime - settings.value.offset;
    if (this.#needsReset || time < this.#lastTime - 0.05 || time > this.#lastTime + 2) {
      this.#reset(time);
    } else if (time === this.#lastTime) {
      return;
    } else {
      this.#lastTime = time;
      if (settings.value.enabled) this.#spawn(time, false);
    }
    this.#layout(time);
  };

  #clear() {
    for (const c of this.#active) c.el.remove();
    this.#active = [];
    this.#pending = [];
    this.#lanes = { scroll: [], top: [], bottom: [] };
  }

  #reset(time: number) {
    this.#needsReset = false;
    this.#clear();
    this.#lastTime = time;
    this.#cursor = lowerBound(this.#items, time - Math.max(settings.value.duration, FIXED_DURATION));
    if (settings.value.enabled) this.#spawn(time, true);
  }

  #accepts(item: DanmakuItem, s: Readonly<DanmakuSettings>) {
    if (item.kind === 'system') return false;
    if (!s.paid && (item.kind === 'paid' || item.kind === 'member')) return false;
    return item.parts.length > 0;
  }

  #durationOf(item: DanmakuItem) {
    return item.mode === 'scroll' ? settings.value.duration : FIXED_DURATION;
  }

  #spawn(time: number, catchUp: boolean) {
    const s = settings.value;
    const fresh: Comment[] = [];
    while (this.#cursor < this.#items.length && this.#items[this.#cursor].time <= time) {
      const item = this.#items[this.#cursor++];
      if (!this.#accepts(item, s)) continue;
      const duration = this.#durationOf(item);
      if (item.time + duration <= time) continue;
      fresh.push({ item, el: this.#render(item, s), width: 0, start: item.time, duration, lane: -1 });
    }

    const waiting = this.#pending.filter((c) => time - c.item.time <= MAX_DELAY);
    this.#pending = [];
    if (!waiting.length && !fresh.length) return;

    for (const c of fresh) this.append(c.el);
    for (const c of fresh) c.width = c.el.offsetWidth;

    for (const c of waiting) {
      c.start = time;
      if (this.#place(c, s)) this.#activate(c);
      else this.#pending.push(c);
    }
    for (const c of fresh) {
      if (this.#active.length < MAX_ACTIVE && this.#place(c, s)) {
        this.#active.push(c);
        continue;
      }
      c.el.remove();
      if (!catchUp && c.item.mode === 'scroll' && !s.overlap) this.#pending.push(c);
    }
  }

  #activate(c: Comment) {
    if (this.#active.length >= MAX_ACTIVE) return;
    this.append(c.el);
    this.#active.push(c);
  }

  #render(item: DanmakuItem, s: Readonly<DanmakuSettings>) {
    const el = document.createElement('div');
    el.className = `dm dm-${item.kind}`;
    if (item.color) el.style.color = item.color;
    if (item.scale && item.scale !== 1) el.style.fontSize = `${item.scale}em`;
    if (item.background) el.style.setProperty('--dm-bg', item.background);
    if (item.foreground) el.style.setProperty('--dm-fg', item.foreground);
    if (item.badge) {
      const badge = document.createElement('span');
      badge.className = 'dm-badge';
      badge.textContent = item.badge;
      el.append(badge);
    }
    if (item.author && (s.names || item.kind !== 'chat')) {
      const name = document.createElement('span');
      name.className = 'dm-author';
      name.textContent = item.author.replace(/^@/, '');
      el.append(name);
    }
    for (const part of item.parts) {
      if ('src' in part) {
        const img = document.createElement('img');
        img.className = 'dm-emoji';
        img.src = part.src;
        img.alt = part.alt;
        img.referrerPolicy = 'no-referrer';
        img.draggable = false;
        el.append(img);
      } else {
        el.append(part.text);
      }
    }
    return el;
  }

  #fits(prev: Comment, next: Comment) {
    if (next.item.mode !== 'scroll') return next.start >= prev.start + prev.duration;
    const w = this.#width;
    const prevSpeed = (w + prev.width) / prev.duration;
    const nextSpeed = (w + next.width) / next.duration;
    if ((next.start - prev.start) * prevSpeed < prev.width + this.#font) return false;
    if (nextSpeed <= prevSpeed) return true;
    return w - (prev.start + prev.duration - next.start) * nextSpeed >= 0;
  }

  #place(c: Comment, s: Readonly<DanmakuSettings>) {
    const lanes = this.#lanes[c.item.mode];
    for (let i = 0; i < this.#laneCount; i++) {
      const prev = lanes[i];
      if (!prev || this.#fits(prev, c)) {
        lanes[i] = c;
        c.lane = i;
        return true;
      }
    }
    if (!s.overlap) return false;
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < this.#laneCount; i++) {
      const prev = lanes[i]!;
      const score = (c.start - prev.start) / prev.duration;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    lanes[best] = c;
    c.lane = best;
    return true;
  }

  #layout(time: number) {
    const w = this.#width;
    const pad = Math.round(this.#font * 0.3);
    let write = 0;
    for (const c of this.#active) {
      const progress = (time - c.start) / c.duration;
      if (progress >= 1 || progress < 0) {
        c.el.remove();
        continue;
      }
      this.#active[write++] = c;
      let x: number;
      let y: number;
      if (c.item.mode === 'scroll') {
        x = w - progress * (w + c.width);
        y = pad + c.lane * this.#laneHeight;
      } else {
        x = (w - c.width) / 2;
        y = c.item.mode === 'top'
          ? pad + c.lane * this.#laneHeight
          : this.#height - pad - (c.lane + 1) * this.#laneHeight;
      }
      c.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y}px, 0)`;
    }
    this.#active.length = write;
  }
}

customElements.define('danmaku-layer', DanmakuLayer);

declare global {
  interface HTMLElementTagNameMap {
    'danmaku-layer': DanmakuLayer;
  }
}
