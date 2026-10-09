import { defineConfig, type Plugin, type Connect } from 'vite';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR ?? path.join(os.homedir(), 'Downloads'));
const MAX_DEPTH = 2;

const VIDEO_TYPES: Record<string, string> = {
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
};

const DANMAKU_SUFFIXES = ['.live_chat.json', '.danmaku.xml', '.xml', '.danmaku.json', '.json'];

const DANMAKU_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

interface LibraryEntry {
  name: string;
  video: string;
  danmaku: string | null;
  size: number;
  mtime: number;
}

async function scan(dir: string, depth: number, out: LibraryEntry[]) {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const names = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < MAX_DEPTH && entry.name !== 'node_modules') await scan(full, depth + 1, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!entry.isFile() || !(ext in VIDEO_TYPES)) continue;
    const stem = entry.name.slice(0, -ext.length);
    const match = DANMAKU_SUFFIXES.map((s) => stem + s).find((n) => names.has(n));
    const stat = await fsp.stat(full);
    out.push({
      name: stem,
      video: path.relative(MEDIA_DIR, full),
      danmaku: match ? path.relative(MEDIA_DIR, path.join(dir, match)) : null,
      size: stat.size,
      mtime: stat.mtimeMs,
    });
  }
}

function resolveMedia(urlPath: string): { file: string; type: string } | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const file = path.resolve(MEDIA_DIR, '.' + path.sep + rel);
  if (!file.startsWith(MEDIA_DIR + path.sep)) return null;
  const ext = path.extname(file).toLowerCase();
  const type = VIDEO_TYPES[ext] ?? (DANMAKU_SUFFIXES.some((s) => file.endsWith(s)) ? DANMAKU_TYPES[ext] : undefined);
  return type ? { file, type } : null;
}

const libraryMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/library') {
    const out: LibraryEntry[] = [];
    scan(MEDIA_DIR, 0, out).then(() => {
      out.sort((a, b) => b.mtime - a.mtime);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ root: MEDIA_DIR, items: out }));
    }, next);
    return;
  }

  if (!url.pathname.startsWith('/media/')) return next();

  const target = resolveMedia(url.pathname.slice('/media/'.length));
  if (!target) {
    res.statusCode = 404;
    return res.end();
  }

  fs.stat(target.file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('Content-Type', target.type);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');

    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    let start = 0;
    let end = stat.size - 1;
    if (range) {
      if (range[1]) {
        start = Number(range[1]);
        if (range[2]) end = Math.min(Number(range[2]), end);
      } else if (range[2]) {
        start = Math.max(0, stat.size - Number(range[2]));
      }
      if (start > end || start >= stat.size) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    }
    res.setHeader('Content-Length', String(end - start + 1));
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(target.file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
};

function localLibrary(): Plugin {
  return {
    name: 'local-library',
    configureServer(server) {
      server.middlewares.use(libraryMiddleware);
      server.httpServer?.once('listening', () => {
        server.config.logger.info(`  Media library: ${MEDIA_DIR}`);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(libraryMiddleware);
    },
  };
}

export default defineConfig({
  plugins: [localLibrary()],
  server: { port: 5173 },
});
