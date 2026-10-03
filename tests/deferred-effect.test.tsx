import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useDeferredEffect } from "../src/hooks/useDeferredEffect";
it("cancels the StrictMode probe before request startup and runs cleanup once", async () => {
  const start = vi.fn();
  const cleanup = vi.fn();
  function Resource() {
    useDeferredEffect(() => {
      start();
      return cleanup;
    }, []);
    return null;
  }
  const view = render(
    <StrictMode>
      <Resource />
    </StrictMode>
  );
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  view.unmount();
  expect(cleanup).toHaveBeenCalledTimes(1);
});
