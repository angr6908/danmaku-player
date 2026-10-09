import '@videojs/html/video/player';
import '@videojs/html/video/skin';
import '@videojs/html/ui/menu-radio-group';
import '@videojs/html/ui/menu-checkbox-item';
import { VideoSkinElement } from '@videojs/html/video';
import { settings, type DanmakuSettings } from './settings';

type BooleanKey = { [K in keyof DanmakuSettings]: DanmakuSettings[K] extends boolean ? K : never }[keyof DanmakuSettings];
type NumberKey = { [K in keyof DanmakuSettings]: DanmakuSettings[K] extends number ? K : never }[keyof DanmakuSettings];

const BUBBLE =
  '<path d="M6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5v-8A2.5 2.5 0 0 1 6.5 3Z"/><path d="M8 7.5h8M8 11.5h5"/>';

const icon = (cls: string, body: string) =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const NUMBER_OPTIONS: { key: NumberKey; label: string; options: [number, string][] }[] = [
  { key: 'opacity', label: 'Opacity', options: [[1, '100%'], [0.85, '85%'], [0.7, '70%'], [0.5, '50%'], [0.3, '30%']] },
  { key: 'scale', label: 'Font size', options: [[0.75, 'Small'], [1, 'Normal'], [1.25, 'Large'], [1.5, 'Huge']] },
  { key: 'duration', label: 'Speed', options: [[13, 'Slow'], [9, 'Normal'], [6, 'Fast'], [4, 'Very fast']] },
  { key: 'area', label: 'Display area', options: [[0.25, 'Top 25%'], [0.5, 'Top 50%'], [0.75, 'Top 75%'], [1, 'Full']] },
];

const BOOLEAN_OPTIONS: { key: BooleanKey; label: string }[] = [
  { key: 'enabled', label: 'Show danmaku' },
  { key: 'overlap', label: 'Allow overlap' },
  { key: 'names', label: 'Show names' },
  { key: 'paid', label: 'Super Chats & members' },
];

const backItem = (label: string) =>
  `<media-menu-item class="media-menu-back-item"><media-icon name="chevron" class="media-menu-back-chevron"></media-icon><span>${label}</span></media-menu-item><media-menu-separator class="media-menu-separator"></media-menu-separator>`;

const triggerItem = (target: string, key: string, label: string) =>
  `<media-menu-item commandfor="${target}" class="media-menu-trigger-item"><span>${label}</span><span class="media-menu-hint"><span class="media-menu-hint-label" data-hint="${key}"></span><media-icon name="chevron" class="media-menu-forward-chevron"></media-icon></span></media-menu-item>`;

const checkboxItem = ({ key, label }: (typeof BOOLEAN_OPTIONS)[number]) =>
  `<media-menu-checkbox-item class="media-menu-radio-item dm-check" data-setting="${key}"><span>${label}</span><span class="dm-switch" aria-hidden="true"></span></media-menu-checkbox-item>`;

const radioSubmenu = ({ key, label, options }: (typeof NUMBER_OPTIONS)[number]) =>
  triggerItem(`dm-${key}-menu`, key, label) +
  `<media-menu-content class="media-menu-content" id="dm-${key}-menu">${backItem(label)}<media-menu-radio-group class="media-menu-radio-group" data-setting="${key}" aria-label="${label}">${options
    .map(
      ([value, text]) =>
        `<media-menu-radio-item class="media-menu-radio-item" value="${value}"><span data-part="label">${text}</span><media-menu-item-indicator force-mount class="media-menu-item-indicator"><media-icon name="check" class="media-menu-radio-item-icon"></media-icon></media-menu-item-indicator></media-menu-radio-item>`,
    )
    .join('')}</media-menu-radio-group></media-menu-content>`;

const TOOLTIP_CLASS = 'media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip';

const CONTROLS_MARKUP = `
<button type="button" class="media-button dm-toggle" id="dm-toggle-trigger" aria-label="Danmaku" aria-pressed="true">
  ${icon('media-button-icon dm-icon-on', BUBBLE)}
  ${icon('media-button-icon dm-icon-off', BUBBLE + '<path d="M3 3l18 18"/>')}
</button>
<media-tooltip trigger="dm-toggle-trigger" side="top" class="${TOOLTIP_CLASS}">
  <span class="dm-tooltip-label">Hide danmaku</span>
  <kbd class="media-tooltip-shortcut">D</kbd>
</media-tooltip>
<button type="button" commandfor="dm-settings-popup" class="media-button dm-settings-trigger" id="dm-settings-trigger" aria-label="Danmaku settings">
  ${icon('media-button-icon', '<path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.5"/><circle cx="10" cy="17" r="2.5"/>')}
</button>
<media-tooltip trigger="dm-settings-trigger" side="top" class="${TOOLTIP_CLASS}"><span>Danmaku settings</span></media-tooltip>
<media-menu side="top" align="center" class="media-popup media-popup-surface media-menu-popup media-menu-resizable-popup" id="dm-settings-popup">
  <media-menu-content class="media-menu-content">
    ${checkboxItem(BOOLEAN_OPTIONS[0])}
    <media-menu-separator class="media-menu-separator"></media-menu-separator>
    ${NUMBER_OPTIONS.map(radioSubmenu).join('')}
    <media-menu-separator class="media-menu-separator"></media-menu-separator>
    ${BOOLEAN_OPTIONS.slice(1).map(checkboxItem).join('')}
  </media-menu-content>
</media-menu>`;

const STYLES = `
.dm-toggle .media-button-icon { transition-property: opacity; }
.dm-toggle[aria-pressed="true"] .dm-icon-off,
.dm-toggle[aria-pressed="false"] .dm-icon-on { opacity: 0; }
#dm-settings-popup {
  max-height: min(var(--media-menu-available-height, calc(var(--media-spacing) * 84)), calc(var(--media-spacing) * 84));
}
.dm-check { display: flex; }
.dm-switch {
  position: relative;
  flex-shrink: 0;
  width: 2.25em;
  height: 1.25em;
  margin-inline-start: auto;
  border-radius: 999px;
  background: var(--media-muted);
  transition: background-color 150ms;
}
.dm-switch::after {
  content: "";
  position: absolute;
  top: 0.15em;
  left: 0.15em;
  width: 0.95em;
  height: 0.95em;
  border-radius: 50%;
  background: var(--media-muted-foreground);
  transition: translate 150ms, background-color 150ms;
}
.dm-check[aria-checked="true"] .dm-switch { background: var(--dm-accent, #4cc2ff); }
.dm-check[aria-checked="true"] .dm-switch::after { translate: 1em 0; background: #fff; }
`;

function fragment(markup: string) {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content;
}

const PAGE_HOTKEYS = ['Space', 'ArrowLeft', 'ArrowRight'];

function buildTemplate() {
  const template = VideoSkinElement.template!.cloneNode(true) as HTMLTemplateElement;
  const root = template.content;
  root.querySelector('media-captions-button')!.before(fragment(CONTROLS_MARKUP));
  for (const keys of PAGE_HOTKEYS) root.querySelector(`media-hotkey[keys="${keys}"]`)!.setAttribute('target', 'document');
  return template;
}

const sheet = new CSSStyleSheet();
sheet.replaceSync(STYLES);

export class DanmakuVideoSkinElement extends VideoSkinElement {
  static override template = buildTemplate();

  #unsubscribe: (() => void) | null = null;
  #abort: AbortController | null = null;

  constructor() {
    super();
    const shadow = this.shadowRoot!;
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
  }

  override connectedCallback() {
    super.connectedCallback();
    const shadow = this.shadowRoot!;
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    shadow.querySelector('.dm-toggle')!.addEventListener(
      'click',
      () => settings.set('enabled', !settings.value.enabled),
      { signal },
    );
    shadow.addEventListener(
      'checked-change',
      (e) => {
        const key = (e.target as HTMLElement).dataset.setting as BooleanKey | undefined;
        if (key) settings.set(key, (e as CustomEvent<{ checked: boolean }>).detail.checked);
      },
      { signal },
    );
    shadow.addEventListener(
      'value-change',
      (e) => {
        const key = (e.target as HTMLElement).dataset.setting as NumberKey | undefined;
        if (key) settings.set(key, Number((e as CustomEvent<{ value: string }>).detail.value));
      },
      { signal },
    );

    this.#unsubscribe = settings.subscribe((value) => this.#sync(value));
  }

  set pageHotkeys(enabled: boolean) {
    for (const hotkey of this.shadowRoot!.querySelectorAll('media-hotkey[target="document"]')) {
      hotkey.toggleAttribute('disabled', !enabled);
    }
  }

  override disconnectedCallback() {
    this.#abort?.abort();
    this.#unsubscribe?.();
    super.disconnectedCallback();
  }

  #sync(value: Readonly<DanmakuSettings>) {
    const shadow = this.shadowRoot!;
    const toggle = shadow.querySelector('.dm-toggle')!;
    toggle.setAttribute('aria-pressed', String(value.enabled));
    shadow.querySelector('.dm-tooltip-label')!.textContent = value.enabled ? 'Hide danmaku' : 'Show danmaku';
    for (const hint of shadow.querySelectorAll<HTMLElement>('[data-hint]')) {
      const option = NUMBER_OPTIONS.find((o) => o.key === hint.dataset.hint)!;
      hint.textContent = option.options.find(([v]) => v === value[option.key])?.[1] ?? '';
    }
    for (const item of shadow.querySelectorAll<HTMLElement & { checked: boolean }>('media-menu-checkbox-item[data-setting]')) {
      item.checked = value[item.dataset.setting as BooleanKey];
    }
    for (const group of shadow.querySelectorAll<HTMLElement & { value: string }>('media-menu-radio-group[data-setting]')) {
      group.value = String(value[group.dataset.setting as NumberKey]);
    }
  }
}

customElements.define('danmaku-video-skin', DanmakuVideoSkinElement);

declare global {
  interface HTMLElementTagNameMap {
    'danmaku-video-skin': DanmakuVideoSkinElement;
  }
}
