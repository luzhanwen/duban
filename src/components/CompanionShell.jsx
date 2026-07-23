import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  COMPANION_SHELL_ACTIONS,
  companionShellReducer,
  createCompanionShellState,
} from "../lib/companionShellState.js";
import {
  getCompanionVisualStateLabel,
  resolveCompanionVisualState,
} from "../lib/companionVisualState.js";
import useOnlineStatus from "../lib/useOnlineStatus.js";

const CompanionShellContext = createContext(null);

export default function CompanionShell({
  sessionKey,
  scene,
  journey = [],
  visualState = "quiet",
  visualError = false,
  className = "",
  children,
}) {
  const [state, dispatch] = useReducer(
    companionShellReducer,
    undefined,
    createCompanionShellState
  );
  const timelinePositionsRef = useRef(new Map());
  const online = useOnlineStatus();
  const resolvedVisualState = resolveCompanionVisualState({
    online,
    error: visualError,
    activity: visualState,
  });
  const visualStateLabel = getCompanionVisualStateLabel(resolvedVisualState);

  const setActivePanel = useCallback(
    (value) => dispatch({ type: COMPANION_SHELL_ACTIONS.setActivePanel, value }),
    []
  );
  const setChatDraft = useCallback(
    (value) => dispatch({ type: COMPANION_SHELL_ACTIONS.setChatDraft, value }),
    []
  );
  const setActiveQuote = useCallback(
    (value) => dispatch({ type: COMPANION_SHELL_ACTIONS.setActiveQuote, value }),
    []
  );
  const setReflectionDraft = useCallback(
    (value) => dispatch({ type: COMPANION_SHELL_ACTIONS.setReflectionDraft, value }),
    []
  );
  const setSidebarOpen = useCallback(
    (value) => dispatch({ type: COMPANION_SHELL_ACTIONS.setSidebarOpen, value }),
    []
  );
  const setSidebarLayoutInitialized = useCallback(
    (value) =>
      dispatch({ type: COMPANION_SHELL_ACTIONS.setSidebarLayoutInitialized, value }),
    []
  );
  const setSessionOverride = useCallback(
    (value) => dispatch({ type: COMPANION_SHELL_ACTIONS.setSessionOverride, value }),
    []
  );
  const readTimelinePosition = useCallback(
    (surfaceKey) => timelinePositionsRef.current.get(surfaceKey) ?? null,
    []
  );
  const writeTimelinePosition = useCallback((surfaceKey, value) => {
    const position = Number(value);
    if (!surfaceKey || !Number.isFinite(position)) return;
    timelinePositionsRef.current.set(surfaceKey, Math.max(0, position));
  }, []);

  const contextValue = useMemo(
    () => ({
      sessionKey,
      scene,
      journey: Array.isArray(journey) ? journey : [],
      online,
      visualState: resolvedVisualState,
      visualStateLabel,
      ...state,
      setActivePanel,
      setChatDraft,
      setActiveQuote,
      setReflectionDraft,
      setSidebarOpen,
      setSidebarLayoutInitialized,
      setSessionOverride,
      readTimelinePosition,
      writeTimelinePosition,
    }),
    [
      journey,
      online,
      readTimelinePosition,
      scene,
      sessionKey,
      setActivePanel,
      setActiveQuote,
      setChatDraft,
      setReflectionDraft,
      setSidebarLayoutInitialized,
      setSidebarOpen,
      setSessionOverride,
      state,
      resolvedVisualState,
      visualStateLabel,
      writeTimelinePosition,
    ]
  );

  return (
    <CompanionShellContext.Provider value={contextValue}>
      <div
        className={`companion-shell ${className}`.trim()}
        data-companion-scene={scene}
        data-companion-session={sessionKey}
        data-companion-journey-count={contextValue.journey.length}
        data-companion-state={resolvedVisualState}
        data-companion-online={online ? "true" : "false"}
      >
        <span className="sr-only" role="status" aria-live="polite">
          {visualStateLabel}
        </span>
        {!online && (
          <p className="companion-offline-notice" role="status">
            当前离线，可以继续阅读；AI 功能将在网络恢复后可用。
          </p>
        )}
        {children}
      </div>
    </CompanionShellContext.Provider>
  );
}

export function useCompanionShell() {
  const value = useContext(CompanionShellContext);
  if (!value) throw new Error("useCompanionShell must be used inside CompanionShell");
  return value;
}

export function useCompanionTimelineScroll(
  surfaceKey,
  containerRef,
  revision,
  { initialPosition = "restore" } = {}
) {
  const { readTimelinePosition, writeTimelinePosition } = useCompanionShell();
  const nearBottomRef = useRef(true);
  const restoredRef = useRef(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    function rememberPosition() {
      const distanceFromBottom = node.scrollHeight - node.clientHeight - node.scrollTop;
      nearBottomRef.current = distanceFromBottom <= 48;
      writeTimelinePosition(surfaceKey, node.scrollTop);
    }

    const frame = window.requestAnimationFrame(() => {
      const savedPosition = readTimelinePosition(surfaceKey);
      node.scrollTop =
        initialPosition === "bottom" || savedPosition === null
          ? node.scrollHeight
          : savedPosition;
      restoredRef.current = true;
      rememberPosition();
    });
    let resizeFrame = null;
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            if (!restoredRef.current || !nearBottomRef.current) return;
            if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
            resizeFrame = window.requestAnimationFrame(() => {
              node.scrollTop = node.scrollHeight;
              writeTimelinePosition(surfaceKey, node.scrollTop);
            });
          })
        : null;
    resizeObserver?.observe(node);
    node.addEventListener("scroll", rememberPosition, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      writeTimelinePosition(surfaceKey, node.scrollTop);
      node.removeEventListener("scroll", rememberPosition);
      restoredRef.current = false;
    };
  }, [containerRef, initialPosition, readTimelinePosition, surfaceKey, writeTimelinePosition]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !restoredRef.current || !nearBottomRef.current) return undefined;

    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
      writeTimelinePosition(surfaceKey, node.scrollTop);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [containerRef, revision, surfaceKey, writeTimelinePosition]);
}

export function CompanionPresence({ className = "", ...props }) {
  return (
    <div
      {...props}
      className={`companion-presence ${className}`.trim()}
      data-companion-part="presence"
    />
  );
}

export function CompanionContext({ className = "", ...props }) {
  return (
    <div
      {...props}
      className={`companion-context ${className}`.trim()}
      data-companion-part="context"
    />
  );
}

export const CompanionTimeline = forwardRef(function CompanionTimeline(
  { className = "", ...props },
  ref
) {
  return (
    <div
      {...props}
      ref={ref}
      className={`companion-timeline ${className}`.trim()}
      data-companion-part="timeline"
    />
  );
});

export function CompanionComposer({ className = "", ...props }) {
  return (
    <form
      {...props}
      className={`companion-composer ${className}`.trim()}
      data-companion-part="composer"
    />
  );
}
