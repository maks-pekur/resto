import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const photoUploadUrlActionMock = vi.fn();

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/photo-upload-url-action', () => ({
  photoUploadUrlAction: photoUploadUrlActionMock,
}));

const { PhotoUploadClient } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/photo-upload-client');

const ITEM_ID = '22222222-2222-4222-8222-222222222222';

const createObjectURLMock = vi.fn(() => 'blob:fake-url');
const revokeObjectURLMock = vi.fn();

const setupGlobals = (): void => {
  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURLMock,
  });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURLMock,
  });
};

const mountAndPickFile = async (
  type: string,
  size: number,
  onUploaded = vi.fn(),
): Promise<{ readonly onUploaded: ReturnType<typeof vi.fn> }> => {
  render(
    <PhotoUploadClient
      itemId={ITEM_ID}
      currentS3Key={null}
      currentPhotoUrl={null}
      onUploaded={onUploaded}
    />,
  );
  const input = screen.getByLabelText('Файл фото');
  const file = new File(['x'], 'photo.bin', { type });
  Object.defineProperty(file, 'size', { value: size });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
    await Promise.resolve();
    await Promise.resolve();
  });
  return { onUploaded };
};

describe('PhotoUploadClient (Plan 04b-07 Task 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the drop zone with Russian copy when no photo is set', () => {
    render(
      <PhotoUploadClient
        itemId={ITEM_ID}
        currentS3Key={null}
        currentPhotoUrl={null}
        onUploaded={() => undefined}
      />,
    );
    expect(screen.getByText('Нажмите или перетащите фото')).toBeInTheDocument();
    expect(screen.getByText('JPG, PNG, WEBP до 5 МБ')).toBeInTheDocument();
    expect(screen.getByText('+ Добавить ещё фото')).toBeDisabled();
  });

  it('renders an inline error when an unsupported file type is picked', async () => {
    await mountAndPickFile('image/gif', 1024);
    expect(screen.getByText(/Только JPG, PNG или WEBP/u)).toBeInTheDocument();
    expect(photoUploadUrlActionMock).not.toHaveBeenCalled();
  });

  it('renders an inline error when the file exceeds 5 MiB', async () => {
    await mountAndPickFile('image/jpeg', 6 * 1024 * 1024);
    expect(screen.getByText(/Только JPG, PNG или WEBP/u)).toBeInTheDocument();
    expect(photoUploadUrlActionMock).not.toHaveBeenCalled();
  });

  it('requests an upload URL with the picked content type + size', async () => {
    photoUploadUrlActionMock.mockResolvedValue({
      ok: true,
      uploadUrl: 'https://s3.example/abc',
      s3Key: 'tenants/x/items/y.jpg',
    });
    const putMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', putMock);
    await mountAndPickFile('image/jpeg', 1024);
    expect(photoUploadUrlActionMock).toHaveBeenCalledWith('image/jpeg', 1024);
  });

  it('calls onUploaded with s3Key after a successful PUT', async () => {
    photoUploadUrlActionMock.mockResolvedValue({
      ok: true,
      uploadUrl: 'https://s3.example/abc',
      s3Key: 'tenants/x/items/y.jpg',
    });
    const putMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', putMock);
    const { onUploaded } = await mountAndPickFile('image/jpeg', 1024);
    expect(putMock).toHaveBeenCalledWith(
      'https://s3.example/abc',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(onUploaded).toHaveBeenCalledWith('tenants/x/items/y.jpg');
  });

  it('surfaces an inline error and skips onUploaded when PUT fails', async () => {
    photoUploadUrlActionMock.mockResolvedValue({
      ok: true,
      uploadUrl: 'https://s3.example/abc',
      s3Key: 'tenants/x/items/y.jpg',
    });
    const putMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', putMock);
    const onUploaded = vi.fn();
    await mountAndPickFile('image/jpeg', 1024, onUploaded);
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.getByText(/Не удалось загрузить фото/u)).toBeInTheDocument();
  });
});
