import { useEffect, useRef, useState } from "react";

type RegionLabelProps = {
  regionName: string | null;
};

export function RegionLabel({ regionName }: RegionLabelProps) {
  const [displayedName, setDisplayedName] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0);
  const prevNameRef = useRef<string | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (regionName === prevNameRef.current) return;
    prevNameRef.current = regionName;

    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (!regionName) {
      setOpacity(0);
      return;
    }

    setOpacity(0);
    showTimerRef.current = window.setTimeout(() => {
      setDisplayedName(regionName);
      setOpacity(1);
      showTimerRef.current = null;
      hideTimerRef.current = window.setTimeout(() => {
        setOpacity(0);
        hideTimerRef.current = null;
      }, 3000);
    }, 500);
  }, [regionName]);

  if (!displayedName) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "33%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        fontSize: 20,
        color: "#f1f5f9",
        textShadow: "0 2px 4px rgba(0,0,0,0.8)",
        textAlign: "center",
        pointerEvents: "none",
        userSelect: "none",
        opacity,
        transition: "opacity 0.5s ease-in-out",
        whiteSpace: "nowrap",
      }}
    >
      {displayedName}
    </div>
  );
}
