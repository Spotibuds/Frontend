import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialog } from "../src/hooks/useDialog";

function Example() {
  const [open, setOpen] = useState(false);
  const dialog = useDialog(open, () => setOpen(false));
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open editor</button>
      {open && (
        <div>
          <div ref={dialog} role="dialog" aria-modal="true" aria-label="Editor" tabIndex={-1}>
            <button>First control</button>
            <button>Last control</button>
          </div>
        </div>
      )}
    </div>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});
describe("legacy editor modal behavior", () => {
  it("inerts background, traps focus in both directions and restores focus and scrolling on Escape", () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
      () => [{ width: 40, height: 40 }] as unknown as DOMRectList
    );
    document.body.style.overflow = "auto";
    render(<Example />);
    const opener = screen.getByRole("button", { name: "Open editor" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Editor" });
    const first = screen.getByRole("button", { name: "First control" });
    const last = screen.getByRole("button", { name: "Last control" });
    expect(opener.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener.inert).not.toBe(true);
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(opener);
  });
  it("dismisses an overlay click without treating dialog content as the overlay", () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
