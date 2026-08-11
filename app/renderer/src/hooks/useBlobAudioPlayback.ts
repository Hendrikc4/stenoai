import * as React from 'react';

interface AudioResource {
  audio: HTMLAudioElement;
  objectUrl: string;
  released: boolean;
}

function audioBlobUrl(base64: string, mimeType = 'audio/wav'): string {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function releaseResource(resource: AudioResource | null): void {
  if (!resource || resource.released) return;
  resource.released = true;
  resource.audio.onended = null;
  resource.audio.onerror = null;
  resource.audio.pause();
  URL.revokeObjectURL(resource.objectUrl);
}

/** One fetch-on-click audio lifecycle shared by every voice-sample surface. */
export function useBlobAudioPlayback<Key extends string>(
  loadBase64: (key: Key) => Promise<string>,
) {
  const loaderRef = React.useRef(loadBase64);
  React.useEffect(() => {
    loaderRef.current = loadBase64;
  }, [loadBase64]);
  const resourceRef = React.useRef<AudioResource | null>(null);
  const generationRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const [pendingKey, setPendingKey] = React.useState<Key | null>(null);
  const [playingKey, setPlayingKey] = React.useState<Key | null>(null);
  const [errorKey, setErrorKey] = React.useState<Key | null>(null);

  const releaseCurrent = React.useCallback(() => {
    const resource = resourceRef.current;
    resourceRef.current = null;
    releaseResource(resource);
  }, []);

  const stop = React.useCallback(() => {
    generationRef.current += 1;
    releaseCurrent();
    if (mountedRef.current) {
      setPendingKey(null);
      setPlayingKey(null);
    }
  }, [releaseCurrent]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      releaseCurrent();
    };
  }, [releaseCurrent]);

  const toggle = React.useCallback(async (key: Key) => {
    if (playingKey === key) {
      stop();
      return;
    }

    stop();
    if (!mountedRef.current) return;
    setErrorKey(null);
    setPendingKey(key);
    const generation = generationRef.current;
    let resource: AudioResource | null = null;

    try {
      const base64 = await loaderRef.current(key);
      if (!mountedRef.current || generation !== generationRef.current) return;

      const objectUrl = audioBlobUrl(base64);
      const audio = new Audio(objectUrl);
      resource = { audio, objectUrl, released: false };
      resourceRef.current = resource;

      const finish = (failed: boolean) => {
        if (generation !== generationRef.current || resourceRef.current !== resource) return;
        resourceRef.current = null;
        releaseResource(resource);
        if (!mountedRef.current) return;
        setPendingKey(null);
        setPlayingKey(null);
        if (failed) setErrorKey(key);
      };
      audio.onended = () => finish(false);
      audio.onerror = () => finish(true);

      await audio.play();
      if (!mountedRef.current || generation !== generationRef.current) {
        releaseResource(resource);
        return;
      }
      setPlayingKey(key);
    } catch {
      if (resourceRef.current === resource) resourceRef.current = null;
      releaseResource(resource);
      if (mountedRef.current && generation === generationRef.current) {
        setPlayingKey(null);
        setErrorKey(key);
      }
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        setPendingKey(null);
      }
    }
  }, [playingKey, stop]);

  return { errorKey, pendingKey, playingKey, stop, toggle };
}
