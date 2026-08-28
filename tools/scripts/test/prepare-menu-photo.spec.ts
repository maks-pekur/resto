import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { prepareMenuPhoto } from '../seed/lib/prepare-menu-photo';

const SIZE = 16;

const buildPhoto = async (paint: (x: number, y: number) => [number, number, number]) => {
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * SIZE + x) * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png()
    .toBuffer();
};

const alphaAt = async (png: Buffer, x: number, y: number): Promise<number> => {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * SIZE + x) * 4 + 3] ?? 0;
};

/** A dish on studio white: an opaque red ring with a white centre, the way a
 * pizza carries near-white cheese inside a browned crust. */
const dishOnWhite = (x: number, y: number): [number, number, number] => {
  const dx = x - SIZE / 2;
  const dy = y - SIZE / 2;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > 6) return [255, 255, 255];
  if (distance > 3) return [200, 30, 20];
  return [253, 252, 250];
};

describe('prepareMenuPhoto', () => {
  it('makes the studio background transparent', async () => {
    const png = await prepareMenuPhoto(await buildPhoto(dishOnWhite));
    expect(await alphaAt(png, 0, 0)).toBe(0);
    expect(await alphaAt(png, SIZE - 1, SIZE - 1)).toBe(0);
  });

  it('keeps the dish itself opaque', async () => {
    const png = await prepareMenuPhoto(await buildPhoto(dishOnWhite));
    expect(await alphaAt(png, SIZE / 2, SIZE / 2 - 4)).toBe(255);
  });

  it('keeps near-white pixels enclosed by the dish opaque', async () => {
    const png = await prepareMenuPhoto(await buildPhoto(dishOnWhite));
    expect(await alphaAt(png, SIZE / 2, SIZE / 2)).toBe(255);
  });

  it('leaves an already cut-out photo untouched', async () => {
    const raw = Buffer.alloc(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      const inside = i % SIZE > 4 && i % SIZE < 11 && i > SIZE * 4 && i < SIZE * 11;
      raw[i * 4] = 200;
      raw[i * 4 + 1] = 30;
      raw[i * 4 + 2] = 20;
      raw[i * 4 + 3] = inside ? 255 : 0;
    }
    const source = await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 4 } })
      .webp({ lossless: true })
      .toBuffer();

    const prepared = await prepareMenuPhoto(source);
    expect(await alphaAt(prepared, 0, 0)).toBe(0);
    expect(await alphaAt(prepared, SIZE / 2, SIZE / 2)).toBe(255);
  });

  it('leaves a photo that was not shot on white untouched', async () => {
    const png = await prepareMenuPhoto(await buildPhoto(() => [40, 60, 90]));
    expect(await alphaAt(png, 0, 0)).toBe(255);
    expect(await alphaAt(png, SIZE / 2, SIZE / 2)).toBe(255);
  });
});
