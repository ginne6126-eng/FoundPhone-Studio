import { useEffect } from 'react';
import { playSound, preloadSound, type PlaySoundOptions } from '../audio/uiSound';

/**
 * Plays `url` whenever an element matching `selector` is clicked anywhere on
 * the page. Listens in the capture phase, so it still plays when the click
 * handler swaps the screen and removes the button.
 */
export function useClickSound(url: string, selector = 'button', options?: PlaySoundOptions) {
  useEffect(() => {
    preloadSound(url);
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(selector)) playSound(url, options);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [url, selector, options?.volume, options?.rate]);
}
