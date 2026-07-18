import path, { extname, basename, resolve } from 'path';
import { URL } from 'url';
import * as mime from 'mime-types';

const VIDEO_ROOT = path.resolve(process.cwd(), 'videos');

export function sanitizeFileName(name: string): string {
  return basename(name, extname(name)).replace(/[^\w.\-]/g, '_');
}

export function getSafeFilePath(filename: string): string | null {
  const resolvedPath = resolve(VIDEO_ROOT, filename);
  return resolvedPath.startsWith(VIDEO_ROOT) ? resolvedPath : null;
}

export function getFileExtension(contentType: string, url: string): string {
  const extFromHeader = mime.extension(contentType);
  const extFromUrl = extname(new URL(url).pathname).split('?')[0];
  return extFromHeader || extFromUrl.replace('.', '') || 'mp4';
}
