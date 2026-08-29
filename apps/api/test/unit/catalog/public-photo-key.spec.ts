import { describe, expect, it } from 'vitest';
import {
  isPublicPhotoKey,
  photoContentType,
  publicPhotoKey,
} from '../../../src/contexts/catalog/domain/public-photo-key';

const PRIVATE_KEY = 'tenant/11111111-1111-4111-8111-111111111111/menu-items/abc.webp';

describe('publicPhotoKey', () => {
  it('keeps the tenant in the path so an erasure can drop a tenant by prefix', () => {
    expect(publicPhotoKey(PRIVATE_KEY)).toBe(`public/${PRIVATE_KEY}`);
    expect(publicPhotoKey(PRIVATE_KEY)).toContain('11111111-1111-4111-8111-111111111111');
  });

  it('is idempotent — publishing an already published photo does not nest prefixes', () => {
    const once = publicPhotoKey(PRIVATE_KEY);
    expect(publicPhotoKey(once)).toBe(once);
  });

  it('recognises a published key', () => {
    expect(isPublicPhotoKey(publicPhotoKey(PRIVATE_KEY))).toBe(true);
    expect(isPublicPhotoKey(PRIVATE_KEY)).toBe(false);
  });
});

describe('photoContentType', () => {
  it('reads the type the upload declared back off the key', () => {
    expect(photoContentType('a/b/c.webp')).toBe('image/webp');
    expect(photoContentType('a/b/c.JPG')).toBe('image/jpeg');
    expect(photoContentType('a/b/c.png')).toBe('image/png');
  });

  it('never guesses an image type for an unknown extension', () => {
    expect(photoContentType('a/b/c.svg')).toBe('application/octet-stream');
    expect(photoContentType('a/b/c')).toBe('application/octet-stream');
  });
});
