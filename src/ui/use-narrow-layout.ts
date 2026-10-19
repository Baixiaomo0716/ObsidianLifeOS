import { useEffect, useRef, useState } from "react";

/** Match the CSS container breakpoint, including split panes and rotated phones. */
export function useNarrowLayout() {
  const ref = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const width = element.getBoundingClientRect().width;
      // A temporarily hidden pane must not replace its visible layout.
      if (width > 0) setNarrow(width <= 680);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    const view = element.ownerDocument.defaultView;
    view?.addEventListener("resize", update);
    return () => { observer?.disconnect(); view?.removeEventListener("resize", update); };
  }, []);
  return { ref, narrow };
}
