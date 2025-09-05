"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Album, Artist, Song, musicApi } from "@/lib/api";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Image from "next/image";

const MySwal = withReactContent(Swal);

type UpdateType = "artist" | "album" | "song";

interface UpdateModalProps {
  type: UpdateType;
  data: Artist | Album | Song | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (
    type: UpdateType,
    id: string,
    formData: FormData
  ) => Promise<Album | Song | Artist | undefined>;
  onSuccess?: (updated: Album | Song | Artist) => void;
}

export default function UpdateModal({
  type,
  data,
  isOpen,
  onClose,
  onUpdate,
  onSuccess,
}: UpdateModalProps) {
  const [formDataState, setFormDataState] = useState<{
    id?: string;
    name?: string;
    title?: string;
    bio?: string;
    artist?: Artist | { id: string; name: string } | null;
    artists?: (Artist | { id: string; name: string })[];
    album?: Album | { id: string; title: string } | null;
    imageFile?: File;
    coverFile?: File;
    audioFile?: File;
  }>({});
  const [allArtists, setAllArtists] = useState<Artist[]>([]);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [artistQuery, setArtistQuery] = useState("");
  const [albumQuery, setAlbumQuery] = useState("");
  const [artistSuggestions, setArtistSuggestions] = useState<Artist[]>([]);
  const [albumSuggestions, setAlbumSuggestions] = useState<Album[]>([]);
  const [coverPreview, setCoverPreview] = useState<string>("");

  const [hasTypedArtist, setHasTypedArtist] = useState(false);
  const [hasTypedAlbum, setHasTypedAlbum] = useState(false);

  useEffect(() => {
    setHasTypedArtist(false);
    setHasTypedAlbum(false);
  }, [data]);

  // Load artists and albums
  useEffect(() => {
    if (type === "album" || type === "song") {
      musicApi.getArtists().then(setAllArtists).catch(console.error);
    }
    if (type === "song") {
      musicApi.getAlbums().then(setAllAlbums).catch(console.error);
    }
  }, [type]);

  // Initialize form state
  useEffect(() => {
    if (data) {
      let artist = null;
      let album = null;

      // Handle different data types
      if (type === 'song' && 'artists' in data) {
        artist = data.artists?.[0] || null;
        album = data.album || null;
      } else if (type === 'album' && 'artist' in data) {
        artist = data.artist || null;
      }

      setFormDataState({
        ...data,
        artist: artist,
        artists: artist ? [artist] : [],
        album: album,
      });
      setArtistQuery(artist?.name || "");
      setAlbumQuery(album?.title || "");

      // Handle cover preview for different data types
      let coverUrl = "";
      if ('coverUrl' in data && data.coverUrl) {
        coverUrl = data.coverUrl;
      } else if ('imageUrl' in data && data.imageUrl) {
        coverUrl = data.imageUrl;
      }
      setCoverPreview(coverUrl);
    } else {
      setFormDataState({});
      setArtistQuery("");
      setAlbumQuery("");
      setCoverPreview("");
    }
  }, [data, type]);

  // Artist suggestions
  useEffect(() => {
    if (artistQuery.trim() === "") {
      setArtistSuggestions([]);
    } else {
      const filtered = allArtists.filter((a) =>
        a.name.toLowerCase().includes(artistQuery.toLowerCase())
      );
      setArtistSuggestions(filtered);
    }
  }, [artistQuery, allArtists]);

  // Album suggestions
  useEffect(() => {
    if (!albumQuery.trim()) {
      setAlbumSuggestions([]);
    } else {
      const filtered = allAlbums
        .filter((a) =>
          a.title.toLowerCase().includes(albumQuery.toLowerCase())
        )
        .filter((a) => type !== "song" || a.artist); // all albums for songs must have artist
      setAlbumSuggestions(filtered);
    }
  }, [albumQuery, allAlbums, type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (e.target instanceof HTMLInputElement && e.target.type === "file") {
      const file = e.target.files?.[0];
      if (file) {
        setFormDataState((prev) => ({ ...prev, [name]: file }));
        if (name === "coverFile" || name === "imageFile") {
          setCoverPreview(URL.createObjectURL(file));
        }
      }
    } else {
      setFormDataState((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async () => {
    if (!type || !data?.id) return;

    // Validation
    if ((type === "album" || type === "song") && !formDataState.artist?.id) {
      await MySwal.fire({ icon: "error", title: "Please select a valid artist" });
      return;
    }
    if (type === "song" && !formDataState.album?.id) {
      await MySwal.fire({ icon: "error", title: "Please select a valid album" });
      return;
    }

    const form = new FormData();

    if (type === "artist") {
      form.append("Name", formDataState.name || formDataState.title || "");
      if (formDataState.bio) form.append("Bio", formDataState.bio);
      if (formDataState.imageFile) form.append("ImageFile", formDataState.imageFile);
    }
    if (type === "album") {
      form.append("Title", formDataState.title || "");
      if (formDataState.coverFile) form.append("CoverFile", formDataState.coverFile);
      if (formDataState.artist?.id) form.append("ArtistId", formDataState.artist.id);
    }
    if (type === "song") {
      form.append("Title", formDataState.title || "");
      if (formDataState.audioFile) form.append("AudioFile", formDataState.audioFile);
      else form.append("AudioFile", new Blob());
      if (formDataState.coverFile) form.append("CoverFile", formDataState.coverFile);
      if (formDataState.artists?.[0]?.id) form.append("ArtistId", formDataState.artists[0].id);
      if (formDataState.album?.id) form.append("AlbumId", formDataState.album.id);
    }

    try {
      const updated = await onUpdate(type, data.id, form);

      if (updated) {
        await MySwal.fire({
          icon: "success",
          title: `${type.charAt(0).toUpperCase() + type.slice(1)} updated successfully`,
        });
        onSuccess?.(updated);
        onClose();
      } else {
        await MySwal.fire({ icon: "error", title: `Failed to update ${type}` });
      }
    } catch (err) {
      console.error(err);
      await MySwal.fire({ icon: "error", title: "Something went wrong" });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg w-96 space-y-4">
        <h3 className="text-white text-lg font-semibold">Update {type}</h3>

        {coverPreview && (
          <Image
            src={coverPreview}
            alt="cover preview"
            width={96}
            height={96}
            className="object-cover mb-2 rounded"
          />
        )}

        {type === "artist" && (
          <>
            <input
              name="name"
              value={formDataState.name || formDataState.title || ""}
              onChange={handleChange}
              placeholder="Artist Name"
              className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-1"
            />
            <textarea
              name="bio"
              value={formDataState.bio || ""}
              onChange={handleChange}
              placeholder="Artist Bio"
              className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-1"
            />
            <label className="w-full block mb-2 text-white">
              Profile Image
              <input
                type="file"
                name="imageFile"
                onChange={handleChange}
                className="hidden"
              />
              <Button
                type="button"
                className="ml-3"
                onClick={() =>
                  document.querySelector<HTMLInputElement>('input[name="imageFile"]')?.click()
                }
              >
                Choose Cover
              </Button>
            </label>
          </>
        )}

        {(type === "album" || type === "song") && (
          <>
            {/* Artist Input */}
            <input
              name="artistQuery"
              value={artistQuery}
              onChange={(e) => {
                setArtistQuery(e.target.value);
                setHasTypedArtist(true);
              }}
              placeholder="Type artist name"
              className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-1"
            />
            {hasTypedArtist && artistSuggestions.length > 0 && (
              <ul className="bg-gray-700 rounded max-h-32 overflow-y-auto text-white mb-2">
                {artistSuggestions.map((a) => (
                  <li
                    key={a.id}
                    className="px-2 py-1 cursor-pointer hover:bg-gray-600"
                    onClick={() => {
                      setFormDataState((prev) => ({ ...prev, artist: a, artists: [a] }));
                      setArtistQuery(a.name);
                      setArtistSuggestions([]);
                      setAlbumQuery("");
                    }}
                  >
                    {a.name}
                  </li>
                ))}
              </ul>
            )}

            {/* Album Input */}
            {type === "album" && (
              <>
                <input
                  name="title"
                  value={formDataState.title || ""}
                  onChange={handleChange}
                  placeholder="Album Title"
                  className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-1"
                />
                <label className="w-full block mb-2 text-white">
                  Cover Image
                  <input
                    type="file"
                    name="coverFile"
                    onChange={handleChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    className="ml-3"
                    onClick={() =>
                      document.querySelector<HTMLInputElement>('input[name="coverFile"]')?.click()
                    }
                  >
                    Choose Cover
                  </Button>
                </label>
              </>
            )}

            {type === "song" && (
              <>
                <input
                  name="title"
                  value={formDataState.title || ""}
                  onChange={handleChange}
                  placeholder="Song Title"
                  className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-1"
                />
                <input
                  name="albumQuery"
                  value={albumQuery}
                  onChange={(e) => {
                    setAlbumQuery(e.target.value);
                    setHasTypedAlbum(true);
                  }}
                  placeholder="Type album name"
                  className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-1"
                  disabled={!artistQuery && !formDataState.artist?.id}
                />
                {hasTypedAlbum && albumSuggestions.length > 0 && (
                  <ul className="bg-gray-700 rounded max-h-32 overflow-y-auto text-white mb-2">
                    {albumSuggestions.map((a) => (
                      <li
                        key={a.id}
                        className="px-2 py-1 cursor-pointer hover:bg-gray-600"
                        onClick={() => {

                          setFormDataState((prev) => ({
                            ...prev,
                            album: a,
                            artists: a.artist ? [a.artist] : [],
                            artist: a.artist || null,
                          }));
                          setAlbumQuery(a.title);
                          setArtistQuery(a.artist?.name || "");
                          setAlbumSuggestions([]);
                        }}
                      >
                        {a.title}
                      </li>
                    ))}
                  </ul>
                )}
                <label className="w-full block mb-2 text-white">
                  Audio File
                  <input
                    type="file"
                    name="audioFile"
                    onChange={handleChange}
                    className="hidden"
                  />
                  <Button className="ml-3"
                    type="button"
                    onClick={() =>
                      document.querySelector<HTMLInputElement>('input[name="audioFile"]')?.click()
                    }
                  >
                    Choose Audio
                  </Button>
                </label>
                <label className="w-full block mb-2 text-white">
                  Cover Image
                  <input
                    type="file"
                    name="coverFile"
                    onChange={handleChange}
                    className="hidden"
                  />
                  <Button className="ml-3"
                    type="button"
                    onClick={() =>
                      document.querySelector<HTMLInputElement>('input[name="coverFile"]')?.click()
                    }
                  >
                    Choose Cover
                  </Button>
                </label>
              </>
            )}
          </>
        )}

        <div className="flex justify-end space-x-2">
          <Button className="bg-gray-700 hover:bg-gray-600" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className={`bg-blue-600 hover:bg-blue-700 ${type === "song" && (!formDataState.artist?.id || !formDataState.album?.id)
              ? "opacity-50 cursor-not-allowed"
              : ""
              }`}
            onClick={handleSave}
            disabled={type === "song" && (!formDataState.artist?.id || !formDataState.album?.id)}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
