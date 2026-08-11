import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBlobAudioPlayback } from './useBlobAudioPlayback';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  static playResult: () => Promise<void> = () => Promise.resolve();
  readonly pause = vi.fn();
  readonly play = vi.fn(() => FakeAudio.playResult());
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly src: string) {
    super();
    FakeAudio.instances.push(this);
  }
}

describe('useBlobAudioPlayback', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    FakeAudio.playResult = () => Promise.resolve();
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('atob', () => 'RIFF');
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:sample'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('ignores a sample request that resolves after unmount', async () => {
    const request = deferred<string>();
    const { result, unmount } = renderHook(() =>
      useBlobAudioPlayback(() => request.promise),
    );

    let toggle!: Promise<void>;
    act(() => {
      toggle = result.current.toggle('person-1');
    });
    unmount();
    request.resolve('UklGRg==');
    await toggle;

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('revokes the active blob URL when playback stops', async () => {
    const { result } = renderHook(() =>
      useBlobAudioPlayback(async () => 'UklGRg=='),
    );

    await act(() => result.current.toggle('person-1'));
    expect(result.current.playingKey).toBe('person-1');

    act(() => result.current.stop());

    expect(FakeAudio.instances[0].pause).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:sample');
    expect(result.current.playingKey).toBeNull();
  });

  it('releases media and exposes an error when play rejects', async () => {
    FakeAudio.playResult = () => Promise.reject(new Error('blocked'));
    const { result } = renderHook(() =>
      useBlobAudioPlayback(async () => 'UklGRg=='),
    );

    await act(() => result.current.toggle('person-1'));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:sample');
    expect(result.current.errorKey).toBe('person-1');
    expect(result.current.playingKey).toBeNull();
  });

  it('plays after the StrictMode development remount cycle', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );
    const { result } = renderHook(
      () => useBlobAudioPlayback(async () => 'UklGRg=='),
      { wrapper },
    );

    await act(() => result.current.toggle('person-1'));

    expect(FakeAudio.instances).toHaveLength(1);
    expect(result.current.playingKey).toBe('person-1');
  });
});
