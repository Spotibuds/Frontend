"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Album, Artist, Song, musicApi } from "@/lib/api";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

type UpdateType = "artist" | "album" | "song";

interface UpdateModalProps {
  type: UpdateType;
  data: any;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (type: UpdateType, id: string, formData: FormData) => Promise<Album | Song | Artist | undefined>;
  onSuccess?: (updated: Album | Song | Artist) => void;
}

export default function UpdateModal({ type, data, isOpen, onClose, onUpdate, onSuccess }: UpdateModalProps) {
  const [formDataState, setFormDataState] = useState<any>({});
  const [allArtists, setAllArtists] = useState<Artist[]>([]);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);

  // Load artists for album/song
  useEffect(() => {
    if (type === "album" || type === "song") {
      musicApi.getArtists().then(setAllArtists).catch(console.error);
    }
  }, [type]);

  // Load albums for song
  useEffect(() => {
    if (type === "song") {
      musicApi.getAlbums().then(setAllAlbums).catch(console.error);
    }
  }, [type]);

  // Initialize form data when modal opens
  useEffect(() => {
    if (data) setFormDataState(data);
  }, [data]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (e.target instanceof HTMLInputElement && e.target.type === "file") {
      const file = e.target.files?.[0];
      if (file) setFormDataState((prev: any) => ({ ...prev, [name]: file }));
    } else {
      setFormDataState((prev: any) => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async () => {
    if (!type || !data?.id) return;

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
        onSuccess?.(updated); // update parent state
        onClose();
      } else {
        await MySwal.fire({
          icon: "error",
          title: `Failed to update ${type}`,
        });
      }
    } catch (err) {
      console.error(err);
      await MySwal.fire({
        icon: "error",
        title: "Something went wrong",
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg w-96 space-y-4">
        <h3 className="text-white text-lg font-semibold">Update {type}</h3>

        {type === "artist" && (
          <>
            <input
              name="name"
              value={formDataState.name || formDataState.title || ""}
              onChange={handleChange}
              placeholder="Artist Name"
              className="w-full px-3 py-2 rounded bg-gray-800 text-white"
            />
            <textarea
              name="bio"
              value={formDataState.bio || ""}
              onChange={handleChange}
              placeholder="Artist Bio"
              className="w-full px-3 py-2 rounded bg-gray-800 text-white"
            />
            <input type="file" name="imageFile" onChange={handleChange} className="text-white" />
          </>
        )}

        {type === "album" && (
          <>
            <input
              name="title"
              value={formDataState.title || ""}
              onChange={handleChange}
              placeholder="Album Title"
              className="w-full px-3 py-2 rounded bg-gray-800 text-white"
            />
            <select
              name="artistId"
              value={formDataState.artist?.id || ""}
              onChange={(e) => {
                const selectedId = e.target.value;
                const selectedArtist = allArtists.find(a => a.id === selectedId);
                setFormDataState((prev: any) => ({ ...prev, artist: selectedArtist }));
              }}
              className="w-full px-3 py-2 rounded bg-gray-800 text-white"
            >
              <option value="">Select Artist</option>
              {allArtists.map(artist => (
                <option key={artist.id} value={artist.id}>{artist.name}</option>
              ))}
            </select>
            <input type="file" name="coverFile" onChange={handleChange} className="text-white" />
          </>
        )}

        {type === "song" && (
          <>
            <input
              name="title"
              value={formDataState.title || ""}
              onChange={handleChange}
              placeholder="Song Title"
              className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-2"
            />
            <select
              name="artistId"
              value={formDataState.artists?.[0]?.id || ""}
              onChange={(e) => {
                const selectedId = e.target.value;
                const selectedArtist = allArtists.find(a => a.id === selectedId);
                setFormDataState((prev: any) => ({
                  ...prev,
                  artists: [selectedArtist],
                  album: undefined, // reset album
                }));
              }}
              className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-2"
            >
              <option value="">Select Artist</option>
              {allArtists.map(artist => (
                <option key={artist.id} value={artist.id}>{artist.name}</option>
              ))}
            </select>
            <select
              name="albumId"
              value={formDataState.album?.id || ""}
              onChange={(e) => {
                const selectedId = e.target.value;
                const selectedAlbum = allAlbums.find((a: any) => a.id === selectedId);
                setFormDataState((prev: any) => ({ ...prev, album: selectedAlbum }));
              }}
              className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-2"
              disabled={!formDataState.artists?.[0]?.id}
            >
              <option value="">Select Album</option>
              {allAlbums
                .filter((album: any) => album.artist.id === formDataState.artists?.[0]?.id)
                .map((album: any) => (
                  <option key={album.id} value={album.id}>{album.title}</option>
                ))}
            </select>
            <input type="file" name="audioFile" onChange={handleChange} className="text-white mb-2" />
            <input type="file" name="coverFile" onChange={handleChange} className="text-white" />
          </>
        )}

        <div className="flex justify-end space-x-2">
          <Button className="bg-gray-700 hover:bg-gray-600" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}
