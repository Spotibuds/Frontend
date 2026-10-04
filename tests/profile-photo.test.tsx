import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ update: vi.fn(), success: vi.fn() }));
vi.mock("@/lib/api", () => ({
  userApi: { updateUserProfileByIdentityId: (...args: unknown[]) => fixture.update(...args) },
}));
vi.mock("@/components/ui/MusicImage", () => ({ default: () => <span>Saved avatar</span> }));
import ProfilePictureUpload from "@/components/ui/ProfilePictureUpload";
beforeEach(() => {
  fixture.update.mockReset().mockResolvedValue(undefined);
  fixture.success.mockReset();
});
afterEach(cleanup);
const show = () =>
  render(
    <ProfilePictureUpload
      currentUserId="alice"
      currentAvatarUrl="/saved.png"
      onUploadSuccess={fixture.success}
    />
  );

describe("profile photo removal", () => {
  it("persists an empty avatar URL before announcing removal", async () => {
    let finish!: () => void;
    fixture.update.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    show();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(fixture.update).toHaveBeenCalledWith("alice", { avatarUrl: "" });
    expect(fixture.success).not.toHaveBeenCalled();
    expect(screen.queryByText("Photo removed.")).toBeNull();
    finish();
    await screen.findByText("Photo removed.");
    expect(fixture.success).toHaveBeenCalledWith("");
  });

  it("retains the saved photo on failure and allows a successful retry", async () => {
    fixture.update.mockRejectedValueOnce(new Error("Photo could not be removed. Retry."));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await screen.findByRole("alert");
    expect(screen.getByText("Saved avatar")).toBeTruthy();
    expect(fixture.success).not.toHaveBeenCalled();
    expect(screen.queryByText("Photo removed.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await screen.findByText("Photo removed.");
    await waitFor(() => expect(fixture.update).toHaveBeenCalledTimes(2));
    expect(fixture.success).toHaveBeenCalledTimes(1);
    expect(fixture.success).toHaveBeenCalledWith("");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
