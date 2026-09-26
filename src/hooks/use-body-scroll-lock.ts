import { useEffect } from "react";

/**
 * The drawer library's own iOS keyboard workaround only activates when its
 * `navigator.platform`-based iOS sniff succeeds — and that API is
 * increasingly locked down for privacy (Safari's tracking/fingerprinting
 * protections can normalize it), so it silently fails on some real devices.
 * When it fails, the page behind the fixed-position drawer still scrolls
 * itself to bring a focused input into view, which drags the drawer along
 * with it and leaves a blank gap where the drawer's own (correctly resized)
 * box no longer lines up with the keyboard. Locking body scroll ourselves —
 * independent of any device sniffing — closes that gap regardless of which
 * engine or privacy settings are in play.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
