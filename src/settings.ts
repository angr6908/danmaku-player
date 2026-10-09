export interface DanmakuSettings {
  enabled: boolean;
  opacity: number;
  scale: number;
  duration: number;
  area: number;
  overlap: boolean;
  names: boolean;
  paid: boolean;
  offset: number;
}

const STORAGE_KEY = 'danmaku-settings';

const defaults: DanmakuSettings = {
  enabled: true,
  opacity: 0.85,
  scale: 1,
  duration: 9,
  area: 0.75,
  overlap: false,
  names: false,
  paid: true,
  offset: 0,
};

function load(): DanmakuSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw), offset: 0 };
  } catch {}
  return { ...defaults };
}

class SettingsStore extends EventTarget {
  #value = load();

  get value(): Readonly<DanmakuSettings> {
    return this.#value;
  }

  set<K extends keyof DanmakuSettings>(key: K, value: DanmakuSettings[K]) {
    if (this.#value[key] === value) return;
    this.#value = { ...this.#value, [key]: value };
    try {
      const { offset: _offset, ...persisted } = this.#value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {}
    this.dispatchEvent(new CustomEvent('change', { detail: { key } }));
  }

  subscribe(fn: (value: Readonly<DanmakuSettings>, key?: keyof DanmakuSettings) => void) {
    const handler = (e: Event) => fn(this.#value, (e as CustomEvent).detail.key);
    this.addEventListener('change', handler);
    fn(this.#value);
    return () => this.removeEventListener('change', handler);
  }
}

export const settings = new SettingsStore();
