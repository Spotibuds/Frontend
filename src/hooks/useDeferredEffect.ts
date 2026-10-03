import { useEffect, type DependencyList, type EffectCallback } from "react";

// Delay startup work until mount cleanup has had a chance to run. This keeps
// StrictMode's probe mount from issuing duplicate requests or hub starts, and
// lets storage hydration finish before updating React state.
export function useDeferredEffect(effect: EffectCallback, dependencies: DependencyList) {
  useEffect(() => {
    let cancelled = false;
    let cleanup: ReturnType<EffectCallback>;
    queueMicrotask(() => {
      if (!cancelled) cleanup = effect();
    });
    return () => {
      cancelled = true;
      if (typeof cleanup === "function") cleanup();
    };
    // The caller supplies the effect dependencies, checked by additionalEffectHooks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}
