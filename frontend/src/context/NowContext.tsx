import React, { createContext, useContext, useEffect, useState } from "react";

// Separate from AppContext deliberately. AppContext's `value` object used to
// include `now`, which ticks every second — meaning EVERY screen using
// useApp() re-rendered every second, even ones that never display a live
// clock (e.g. the alarm settings sheet), causing visible jank/dropped frames
// during interactions like dragging the volume slider. Only screens that
// actually need a live-updating time (home screen, editor, upload, alarms)
// should subscribe to this tick.
const NowCtx = createContext<Date | null>(null);

export function NowProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <NowCtx.Provider value={now}>{children}</NowCtx.Provider>;
}

export const useNow = (): Date => {
  const v = useContext(NowCtx);
  if (!v) throw new Error("useNow must be used within NowProvider");
  return v;
};
