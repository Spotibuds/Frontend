import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ register: vi.fn(), login: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: auth.push }) }));
vi.mock("@/lib/api", () => ({ identityApi: { register: auth.register, login: auth.login } }));
import RegisterPage from "@/app/register/page";
import { ApiError } from "@/lib/request";
afterEach(cleanup);
beforeEach(() => {
  auth.register.mockReset().mockResolvedValue(undefined);
  auth.login.mockReset();
  auth.push.mockReset();
});
const fill = () => {
  render(<RegisterPage />);
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newdemo" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@example.com" } });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "DemoPass7!" },
  });
  fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "DemoPass7!" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
};
describe("account creation recovery", () => {
  it("retries only sign-in after the account was created successfully", async () => {
    auth.login
      .mockRejectedValueOnce(new Error("Network interrupted"))
      .mockResolvedValueOnce(undefined);
    fill();
    const retry = await screen.findByRole("button", { name: "Retry sign-in" });
    await screen.findByText(/Your account was created/);
    expect((screen.getByLabelText("Username") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(retry);
    await waitFor(() => expect(auth.push).toHaveBeenCalledWith("/dashboard"));
    expect(auth.register).toHaveBeenCalledOnce();
    expect(auth.login.mock.calls).toEqual([
      [{ username: "newdemo", password: "DemoPass7!" }],
      [{ username: "newdemo", password: "DemoPass7!" }],
    ]);
  });
  it("does not create a second account after a pending profile synchronization", async () => {
    auth.register.mockRejectedValueOnce(new ApiError("Profile synchronization pending", 503));
    auth.login.mockResolvedValue(undefined);
    fill();
    fireEvent.click(await screen.findByRole("button", { name: "Retry sign-in" }));
    await waitFor(() => expect(auth.push).toHaveBeenCalledWith("/dashboard"));
    expect(auth.register).toHaveBeenCalledOnce();
    expect(auth.login).toHaveBeenCalledOnce();
  });
});
