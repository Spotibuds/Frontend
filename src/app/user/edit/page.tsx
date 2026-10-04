"use client";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import ProfilePictureUpload from "@/components/ui/ProfilePictureUpload";
import { identityApi, userApi } from "@/lib/api";

export default function EditProfilePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
    displayName?: string;
  } | null>(null);
  const [profileData, setProfileData] = useState({
    username: "",
    displayName: "",
    bio: "",
    isPrivate: false,
    avatarUrl: "",
  });
  const [initialData, setInitialData] = useState({
    username: "",
    displayName: "",
    bio: "",
    isPrivate: false,
    avatarUrl: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function loadUserProfile(userId: string) {
    try {
      const userData = await userApi.getUserProfileByIdentityId(userId);
      const nextData = {
        username: userData.username,
        displayName: userData.displayName || "",
        bio: userData.bio || "",
        isPrivate: userData.isPrivate || false,
        avatarUrl: userData.avatarUrl || "",
      };
      setProfileData(nextData);
      setInitialData(nextData);
      setLoaded(true);
      setErrors({});
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : "Profile could not be loaded.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useDeferredEffect(() => {
    const user = identityApi.getCurrentUser();
    if (!user) {
      router.push("/");
      return;
    }

    setCurrentUser(user);
    loadUserProfile(user.id);
  }, [router]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!profileData.username.trim()) {
      newErrors.username = "Username is required";
    } else if (profileData.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(profileData.username)) {
      newErrors.username = "Username can only contain letters, numbers, and underscores";
    }

    if (profileData.displayName.length > 50) {
      newErrors.displayName = "Display name must be 50 characters or less";
    }

    if (profileData.bio.length > 500) {
      newErrors.bio = "Bio must be 500 characters or less";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const hasChanges = () => {
    return (
      profileData.username !== initialData.username ||
      profileData.displayName !== initialData.displayName ||
      profileData.bio !== initialData.bio ||
      profileData.isPrivate !== initialData.isPrivate ||
      profileData.avatarUrl !== initialData.avatarUrl
    );
  };

  const handleSave = async () => {
    if (!loaded || isSaving || !currentUser || !validateForm()) return;
    if (!hasChanges()) return;

    setIsSaving(true);
    try {
      await userApi.updateUserProfileByIdentityId(currentUser.id, {
        username: profileData.username,
        displayName: profileData.displayName,
        bio: profileData.bio,
        isPrivate: profileData.isPrivate,
      });

      // Refreshing profile data is handled by the authenticated API.
      router.push(`/user/${currentUser.id}`);
    } catch (error) {
      console.error("Failed to update profile:", error);
      setErrors({
        general:
          error instanceof Error ? error.message : "Failed to update profile. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <>
        <div className="p-6 flex items-center justify-center">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div>
            <span className="text-white">Loading profile...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <form
        className="page-shell max-w-2xl space-y-6"
        onSubmit={event => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Edit Profile</h1>
          <p className="text-gray-400">Update your profile information</p>
        </div>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {errors.general && (
              <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-red-400 text-sm">{errors.general}</p>
              </div>
            )}

            {/* Profile Picture Section */}
            <ProfilePictureUpload
              currentUserId={currentUser?.id || ""}
              currentAvatarUrl={profileData.avatarUrl}
              onUploadSuccess={newAvatarUrl => {
                setProfileData(prev => ({ ...prev, avatarUrl: newAvatarUrl }));
                setInitialData(prev => ({ ...prev, avatarUrl: newAvatarUrl }));
                setErrors(prev => ({ ...prev, profilePicture: "" }));
              }}
            />

            {/* Username */}
            <div className="space-y-2">
              <Input
                label="Username"
                error={errors.username}
                autoComplete="username"
                type="text"
                value={profileData.username}
                onChange={e => setProfileData(prev => ({ ...prev, username: e.target.value }))}
                className={`bg-gray-700 border-gray-600 text-white ${errors.username ? "border-red-500" : ""}`}
                placeholder="Enter your username"
              />
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Input
                label="Display name"
                error={errors.displayName}
                type="text"
                value={profileData.displayName}
                onChange={e => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                className={`bg-gray-700 border-gray-600 text-white ${errors.displayName ? "border-red-500" : ""}`}
                placeholder="Enter your display name (optional)"
              />
              <p className="text-gray-400 text-xs">
                This is how your name appears to other users. If empty, your username will be used.
              </p>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <label htmlFor="profile-bio" className="block text-sm font-medium text-white">
                Bio
              </label>
              <textarea
                id="profile-bio"
                aria-label="Tell others about yourself..."
                value={profileData.bio}
                onChange={e => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                className={`w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none ${errors.bio ? "border-red-500" : "border-gray-600"}`}
                placeholder="Tell others about yourself..."
                rows={4}
                maxLength={500}
              />
              <div className="flex justify-between items-center">
                <p className="text-gray-400 text-xs">
                  Share a bit about your musical tastes and interests
                </p>
                <p className="text-gray-400 text-xs">{profileData.bio.length}/500</p>
              </div>
              {errors.bio && <p className="text-red-400 text-sm">{errors.bio}</p>}
            </div>

            {/* Privacy Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Privacy Settings</h3>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Private Profile</p>
                  <p className="text-gray-400 text-sm">
                    Only you and administrators can see your profile and listening activity. Friends
                    can still message you.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    aria-label="Private profile"
                    type="checkbox"
                    checked={profileData.isPrivate}
                    onChange={e =>
                      setProfileData(prev => ({ ...prev, isPrivate: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-400"></div>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {!loaded && (
          <Button
            onClick={() => {
              if (currentUser) void loadUserProfile(currentUser.id);
            }}
          >
            Retry loading profile
          </Button>
        )}
        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-4">
          <Button
            type="button"
            onClick={handleCancel}
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="submit" className="px-8" disabled={!loaded || isSaving || !hasChanges()}>
            {isSaving ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
                <span>Saving...</span>
              </div>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </form>
    </>
  );
}
