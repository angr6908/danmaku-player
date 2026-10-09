import './skin';
import './danmaku-layer';
import './style.css';
import { parseDanmaku, type DanmakuItem } from './parse';
import { settings } from './settings';

interface LibraryEntry {
  name: string;
  video: string;
  danmaku: string | null;
  size: number;
  mtime: number;
}

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const libraryView = $('#library-view');
const watchView = $('#watch-view');
const libraryList = $<HTMLUListElement>('#library-list');
const libraryRoot = $('#library-root');
const skin = document.querySelector('danmaku-video-skin')!;
const video = $<HTMLVideoElement>('danmaku-video-skin video');
const layer = document.querySelector('danmaku-layer')!;
const toast = $('.player-toast');
const titleEl = $('#watch-title');
const danmakuStatus = $('#danmaku-status');
const offsetStatus = $('#offset-status');
const fileInput = $<HTMLInputElement>('#file-input');
const dropOverlay = $('#drop-overlay');

layer.media = video;

let objectUrl: string | null = null;
let toastTimer = 0;

const VIDEO_EXT = /\.(mkv|webm|mp4|m4v|mov|ogv)$/i;
const DANMAKU_EXT = /\.(json|xml)$/i;

function mediaUrl(rel: string) {
  return '/media/' + rel.split(/[\\/]/).map(encodeURIComponent).join('/');
}

function formatSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function showToast(message: string) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 1500);
}

function setDanmaku(items: DanmakuItem[] | null, error?: string) {
  layer.items = items ?? [];
  if (error) {
    danmakuStatus.textContent = error;
    danmakuStatus.dataset.state = 'error';
    return;
  }
  if (!items) {
    danmakuStatus.textContent = 'No danmaku file';
    danmakuStatus.dataset.state = 'empty';
    return;
  }
  const paid = items.filter((i) => i.kind === 'paid').length;
  const members = items.filter((i) => i.kind === 'member').length;
  const parts = [`${items.length.toLocaleString()} comments`];
  if (paid) parts.push(`${paid} Super Chats`);
  if (members) parts.push(`${members} membership events`);
  danmakuStatus.textContent = parts.join(' · ');
  danmakuStatus.dataset.state = 'ok';
}

function loadDanmakuText(text: string) {
  try {
    const items = parseDanmaku(text);
    setDanmaku(items, items.length ? undefined : 'Danmaku file contained no comments');
  } catch (err) {
    setDanmaku(null, `Could not read danmaku: ${(err as Error).message}`);
  }
}

function openVideo(src: string, title: string) {
  if (objectUrl && objectUrl !== src) URL.revokeObjectURL(objectUrl);
  objectUrl = src.startsWith('blob:') ? src : null;
  settings.set('offset', 0);
  video.src = src;
  titleEl.textContent = title;
  document.title = `${title} · Danmaku Player`;
  libraryView.hidden = true;
  watchView.hidden = false;
  skin.pageHotkeys = true;
}

async function openFromLibrary(rel: string, danmaku: string | null) {
  const name = rel.split(/[\\/]/).pop()!.replace(VIDEO_EXT, '');
  openVideo(mediaUrl(rel), name);
  setDanmaku([]);
  danmakuStatus.textContent = danmaku ? 'Loading danmaku…' : 'No danmaku file';
  if (!danmaku) return setDanmaku(null);
  try {
    const res = await fetch(mediaUrl(danmaku));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadDanmakuText(await res.text());
  } catch (err) {
    setDanmaku(null, `Could not load danmaku: ${(err as Error).message}`);
  }
}

async function openFiles(files: File[]) {
  const videoFile = files.find((f) => VIDEO_EXT.test(f.name) || f.type.startsWith('video/'));
  const danmakuFile = files.find((f) => DANMAKU_EXT.test(f.name));
  if (videoFile) {
    history.pushState(null, '', '#/local');
    openVideo(URL.createObjectURL(videoFile), videoFile.name.replace(VIDEO_EXT, ''));
    if (!danmakuFile) setDanmaku(null);
  } else if (watchView.hidden) {
    showLibraryMessage('Drop a video file (optionally with its danmaku file).');
    return;
  }
  if (danmakuFile) {
    loadDanmakuText(await danmakuFile.text());
    if (!videoFile) showToast(`Loaded ${danmakuFile.name}`);
  }
}

function showLibraryMessage(message: string) {
  libraryList.replaceChildren(Object.assign(document.createElement('li'), { className: 'library-empty', textContent: message }));
}

async function renderLibrary() {
  try {
    const res = await fetch('/api/library');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { root, items } = (await res.json()) as { root: string; items: LibraryEntry[] };
    libraryRoot.textContent = root;
    if (!items.length) return showLibraryMessage('No videos found. Set MEDIA_DIR to choose another folder.');
    libraryList.replaceChildren(
      ...items.map((entry) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'library-item';
        const params = new URLSearchParams({ v: entry.video });
        if (entry.danmaku) params.set('d', entry.danmaku);
        a.href = `#/watch?${params}`;
        const name = document.createElement('span');
        name.className = 'library-name';
        name.textContent = entry.name;
        const meta = document.createElement('span');
        meta.className = 'library-meta';
        const badge = document.createElement('span');
        badge.className = 'chip';
        badge.dataset.state = entry.danmaku ? 'ok' : 'empty';
        badge.textContent = entry.danmaku ? 'Danmaku' : 'No danmaku';
        const details = document.createElement('span');
        details.className = 'muted';
        details.textContent = `${formatSize(entry.size)} · ${new Date(entry.mtime).toLocaleDateString()}`;
        meta.append(badge, details);
        a.append(name, meta);
        li.append(a);
        return li;
      }),
    );
  } catch {
    libraryRoot.textContent = '';
    showLibraryMessage('Library unavailable. Use “Open files…” or drag and drop instead.');
  }
}

function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/watch?')) {
    const params = new URLSearchParams(hash.slice('#/watch?'.length));
    const v = params.get('v');
    if (v) return void openFromLibrary(v, params.get('d'));
  }
  if (hash === '#/local' && objectUrl) return;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  if (hash !== '#/') history.replaceState(null, '', '#/');
  video.pause();
  video.removeAttribute('src');
  video.load();
  layer.items = [];
  document.title = 'Danmaku Player';
  watchView.hidden = true;
  libraryView.hidden = false;
  skin.pageHotkeys = false;
  renderLibrary();
}

window.addEventListener('hashchange', route);
route();

fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) openFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  dropOverlay.hidden = false;
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropOverlay.hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) openFiles(files);
});

function renderOffset() {
  const { offset } = settings.value;
  offsetStatus.hidden = offset === 0;
  offsetStatus.textContent = `Sync ${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`;
}
settings.subscribe(renderOffset);

document.addEventListener('keydown', (e) => {
  if (watchView.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'd' || e.key === 'D') {
    settings.set('enabled', !settings.value.enabled);
    showToast(settings.value.enabled ? 'Danmaku on' : 'Danmaku off');
  } else if (e.key === '[' || e.key === ']') {
    const next = Math.round((settings.value.offset + (e.key === ']' ? 0.5 : -0.5)) * 10) / 10;
    settings.set('offset', next);
    showToast(`Danmaku ${next >= 0 ? 'delay' : 'advance'} ${Math.abs(next).toFixed(1)}s`);
  } else if (e.key === '\\') {
    settings.set('offset', 0);
    showToast('Danmaku sync reset');
  } else {
    return;
  }
  e.preventDefault();
});
