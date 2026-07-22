'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';

type YouTubeState = 0 | 1 | 2 | 3 | 5;

export function FloatingTrailer({ src, title }: { src: string; title: string }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameId = useId().replace(/:/g, '');
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [floating, setFloating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  function sendCommand(func: 'pauseVideo' | 'addEventListener') {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func,
      args: func === 'addEventListener' ? ['onStateChange'] : [],
      id: frameId,
    }), '*');
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.origin.includes('youtube.com') && !event.origin.includes('youtube-nocookie.com')) return;
      const payload = typeof event.data === 'string' ? (() => {
        try { return JSON.parse(event.data); } catch { return null; }
      })() : event.data;
      if (payload?.event !== 'onStateChange') return;
      const state = payload.info as YouTubeState;
      if (state === 1) {
        setStarted(true);
        setPlaying(true);
        setDismissed(false);
      } else if (state === 0 || state === 2) {
        setPlaying(false);
        setFloating(false);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !started) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= 0.85) setFloating(false);
      else if (playing && !dismissed) setFloating(true);
    }, { threshold: [0, 0.85] });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [dismissed, playing, started]);

  function handleFrameLoad() {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: frameId, channel: 'widget' }), '*');
    sendCommand('addEventListener');
  }

  function restoreTrailer() {
    setFloating(false);
    anchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeTrailer() {
    sendCommand('pauseVideo');
    setPlaying(false);
    setFloating(false);
    setDismissed(true);
  }

  return (
    <div ref={anchorRef} className="relative aspect-video">
      <div className={`overflow-hidden bg-black shadow-2xl transition-[width,height,transform,box-shadow] duration-300 ${floating ? 'fixed left-1/2 top-[calc(4rem+env(safe-area-inset-top)+0.75rem)] z-[70] aspect-video w-[min(92vw,380px)] -translate-x-1/2 rounded-xl border border-white/15 min-[960px]:top-5' : 'absolute inset-0 min-[960px]:rounded-2xl min-[960px]:border min-[960px]:border-white/10'}`}>
        <iframe ref={frameRef} id={frameId} src={src} title={title} onLoad={handleFrameLoad} className="size-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        {floating && <div className="absolute right-2 top-2 flex gap-1.5"><button onClick={restoreTrailer} aria-label="Voltar ao trailer" title="Voltar ao trailer" className="grid size-8 place-items-center rounded-lg bg-black/70 text-white backdrop-blur transition hover:bg-black"><Maximize2 className="size-4" /></button><button onClick={closeTrailer} aria-label="Fechar trailer" title="Fechar trailer" className="grid size-8 place-items-center rounded-lg bg-black/70 text-white backdrop-blur transition hover:bg-black"><X className="size-4" /></button></div>}
      </div>
    </div>
  );
}
