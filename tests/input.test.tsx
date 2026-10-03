import React from "react";
import { it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Input } from "../src/components/ui/Input";
it("associates label and validation error with each input", () => {
  render(
    <>
      <Input label="Username" error="Username is required" />
      <Input label="Password" type="password" />
    </>
  );
  const input = screen.getByLabelText("Username");
  expect(input.id).not.toBe("");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const errorId = input.getAttribute("aria-describedby")!;
  expect(document.getElementById(errorId)?.textContent).toBe("Username is required");
  expect(screen.getByLabelText("Password").id).not.toBe(input.id);
  cleanup();
});
