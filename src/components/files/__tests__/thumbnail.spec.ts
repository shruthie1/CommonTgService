import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { FileService } from '../file.service';
import * as thumbnail from '../utils/thumbnail';
import { ByteLru, clampThumbWidth } from '../utils/thumbnail';

type FakeRes = {
  headers: Record<string, unknown>;
  body?: Buffer;
  set: jest.Mock;
  setHeader: jest.Mock;
  send: jest.Mock;
};

function fakeRes(): FakeRes {
  const res: FakeRes = {
    headers: {},
    set: jest.fn((h: Record<string, unknown>) => Object.assign(res.headers, h)),
    setHeader: jest.fn((k: string, v: unknown) => {
      res.headers[k] = v;
    }),
    send: jest.fn((b?: Buffer) => {
      res.body = b;
      return res;
    }),
  };
  return res;
}

describe('thumbnail route', () => {
  let dir: string;
  let service: FileService;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-thumb-'));
    fs.mkdirSync(path.join(dir, 'pics'));
    await sharp({
      create: { width: 1200, height: 600, channels: 3, background: { r: 200, g: 40, b: 90 } },
    })
      .jpeg()
      .toFile(path.join(dir, 'pics', 'wide.jpg'));
    await sharp({
      create: { width: 300, height: 900, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    })
      .png()
      .toFile(path.join(dir, 'pics', 'tall.png'));
    await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toFile(path.join(dir, 'pics', 'tiny.png'));
    fs.writeFileSync(path.join(dir, 'pics', 'broken.jpg'), Buffer.from('not really a jpeg'));
    fs.writeFileSync(path.join(dir, 'pics', 'notes.txt'), 'hello');
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  beforeEach(() => {
    service = new FileService({ storagePath: dir });
  });

  afterEach(() => jest.restoreAllMocks());

  it('clamps ?w= to 64..512 and defaults to 128', () => {
    expect(clampThumbWidth(undefined)).toBe(128);
    expect(clampThumbWidth('')).toBe(128);
    expect(clampThumbWidth('abc')).toBe(128);
    expect(clampThumbWidth('10')).toBe(64);
    expect(clampThumbWidth('9999')).toBe(512);
    expect(clampThumbWidth('96')).toBe(96);
    expect(clampThumbWidth('95.6')).toBe(96);
    expect(clampThumbWidth(['200', '300'])).toBe(200);
  });

  it('resizes to 128 px on the longest side by default, keeping aspect, as webp', async () => {
    const res = fakeRes();
    await service.getThumbnail('pics', 'wide.jpg', res as never);
    const meta = await sharp(res.body!).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([128, 64]);
    expect(res.headers['Content-Type']).toBe('image/webp');
  });

  it('honours a clamped w on the longest side for portrait images', async () => {
    const res = fakeRes();
    await service.getThumbnail('pics', 'tall.png', res as never, '5000');
    const meta = await sharp(res.body!).metadata();
    expect([meta.width, meta.height]).toEqual([171, 512]);

    const small = fakeRes();
    await service.getThumbnail('pics', 'tall.png', small as never, '1');
    const smallMeta = await sharp(small.body!).metadata();
    expect([smallMeta.width, smallMeta.height]).toEqual([21, 64]);
  });

  it('never enlarges a smaller image', async () => {
    const res = fakeRes();
    await service.getThumbnail('pics', 'tiny.png', res as never, '256');
    const meta = await sharp(res.body!).metadata();
    expect([meta.width, meta.height]).toEqual([40, 30]);
  });

  it('sets 1-day public cache and an ETag from file mtime + size + width', async () => {
    const res = fakeRes();
    await service.getThumbnail('pics', 'wide.jpg', res as never, '96');
    const st = fs.statSync(path.join(dir, 'pics', 'wide.jpg'));
    expect(res.headers['Cache-Control']).toBe('public, max-age=86400');
    expect(res.headers.ETag).toBe(
      `"thumb-${st.mtimeMs.toString(36)}-${st.size.toString(36)}-w96"`,
    );
    expect(res.headers['Last-Modified']).toBe(st.mtime.toUTCString());
  });

  it('serves repeat requests from the cache without re-encoding', async () => {
    const spy = jest.spyOn(thumbnail, 'renderThumbnail');
    const a = fakeRes();
    const b = fakeRes();
    await service.getThumbnail('pics', 'wide.jpg', a as never, '128');
    await service.getThumbnail('pics', 'wide.jpg', b as never, '128');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(b.body!.equals(a.body!)).toBe(true);
  });

  it('falls back to the original with its real type when resize fails, logging once', async () => {
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    const original = fs.readFileSync(path.join(dir, 'pics', 'broken.jpg'));
    const a = fakeRes();
    const b = fakeRes();
    await service.getThumbnail('pics', 'broken.jpg', a as never);
    await service.getThumbnail('pics', 'broken.jpg', b as never);
    expect(a.body!.equals(original)).toBe(true);
    expect(a.headers['Content-Type']).toBe('image/jpeg');
    expect(a.headers['Cache-Control']).toBe('public, max-age=3600');
    expect(String(a.headers.ETag)).toMatch(/-orig"$/);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to the original when sharp cannot load', async () => {
    jest.spyOn(thumbnail, 'loadSharp').mockReturnValue({ error: new Error('no native module') });
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    const res = fakeRes();
    await service.getThumbnail('pics', 'wide.jpg', res as never);
    expect(res.body!.equals(fs.readFileSync(path.join(dir, 'pics', 'wide.jpg')))).toBe(true);
    expect(res.headers['Content-Type']).toBe('image/jpeg');
  });

  it('rejects non-image, non-video files as before', async () => {
    await expect(
      service.getThumbnail('pics', 'notes.txt', fakeRes() as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ByteLru', () => {
  it('evicts least-recently-used entries past the byte budget', () => {
    const lru = new ByteLru(10);
    lru.set('a', Buffer.alloc(4));
    lru.set('b', Buffer.alloc(4));
    lru.get('a');
    lru.set('c', Buffer.alloc(4));
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBeDefined();
    expect(lru.get('c')).toBeDefined();
    expect(lru.totalBytes).toBe(8);
    lru.set('huge', Buffer.alloc(11));
    expect(lru.get('huge')).toBeUndefined();
  });
});
