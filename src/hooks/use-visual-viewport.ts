import { useEffect, useState } from "react";

/**
 * iOS Safari does not shrink the layout viewport (and therefore `vh`/`dvh`)
 * when the on-screen keyboard opens — it scrolls the page underneath instead,
 * which leaves fixed-position elements sized for the old viewport with a
 * blank gap where the keyboard now covers content. `window.visualViewport`
 * is the only API that reports the keyboard's actual on-screen size.
 */
export function useVisualViewport() {
  const [state, setState] = useState(() => ({
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    offsetTop: 0,
  }));

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      setState({ height: vv!.height, offsetTop: vv!.offsetTop });
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return state;
}
