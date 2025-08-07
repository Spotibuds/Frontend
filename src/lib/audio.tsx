'use client';

import { createContext, useContext, useReducer, useRef, useEffect, ReactNode } from 'react';
import { Song, API_CONFIG, userApi } from './api';

interface AudioState {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isLoading: boolean;
  isSeeking: boolean;
  playlist: Song[];
  currentIndex: number;
  shuffleMode: boolean;
  repeatMode: 'off' | 'one' | 'all';
  queue: Song[];
}

type AudioAction =
  | { type: 'SET_SONG'; payload: Song }
  | { type: 'SET_PLAYLIST'; payload: { songs: Song[]; index: number } }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'NEXT_SONG' }
  | { type: 'PREVIOUS_SONG' }
  | { type: 'SET_CURRENT_TIME'; payload: number; force?: boolean }
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'SET_VOLUME'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SEEKING'; payload: boolean }
  | { type: 'SET_SHUFFLE'; payload: boolean }
  | { type: 'SET_REPEAT'; payload: 'off' | 'one' | 'all' }
  | { type: 'ADD_TO_QUEUE'; payload: Song | Song[] }
  | { type: 'REMOVE_FROM_QUEUE'; payload: number }
  | { type: 'CLEAR_QUEUE' };

const initialState: AudioState = {
  currentSong: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  isLoading: false,
  isSeeking: false,
  playlist: [],
  currentIndex: -1,
  shuffleMode: false,
  repeatMode: 'off',
  queue: [],
};

function audioReducer(state: AudioState, action: AudioAction): AudioState {
  switch (action.type) {
    case 'SET_SONG':
      return { 
        ...state, 
        currentSong: action.payload, 
        currentTime: 0, 
        isSeeking: false,
        playlist: [action.payload],
        currentIndex: 0
      };
    case 'SET_PLAYLIST':
      return {
        ...state,
        playlist: action.payload.songs,
        currentIndex: action.payload.index,
        currentSong: action.payload.songs[action.payload.index] || null,
        currentTime: 0,
        isSeeking: false
      };
    case 'PLAY':
      return { ...state, isPlaying: true };
    case 'PAUSE':
      return { ...state, isPlaying: false };
    case 'NEXT_SONG': {
      // Check if there are songs in the queue first
      if (state.queue.length > 0) {
        const nextSong = state.queue[0];
        return {
          ...state,
          currentSong: nextSong,
          currentTime: 0,
          isSeeking: false,
          queue: state.queue.slice(1) // Remove the first song from queue
        };
      }
      
      // Otherwise, use regular playlist navigation
      const nextIndex = getNextIndex(state.currentIndex, state.playlist.length, state.shuffleMode, state.repeatMode);
      return {
        ...state,
        currentIndex: nextIndex,
        currentSong: state.playlist[nextIndex] || null,
        currentTime: 0,
        isSeeking: false
      };
    }
    case 'PREVIOUS_SONG': {
      const prevIndex = getPreviousIndex(state.currentIndex, state.playlist.length, state.shuffleMode, state.repeatMode);
      return {
        ...state,
        currentIndex: prevIndex,
        currentSong: state.playlist[prevIndex] || null,
        currentTime: 0,
        isSeeking: false
      };
    }
    case 'SET_CURRENT_TIME':
      // Only update currentTime if not currently seeking, unless forced
      return (state.isSeeking && !action.force) ? state : { ...state, currentTime: action.payload };
    case 'SET_DURATION':
      return { ...state, duration: action.payload };
    case 'SET_VOLUME':
      return { ...state, volume: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_SEEKING':
      return { ...state, isSeeking: action.payload };
    case 'SET_SHUFFLE':
      return { 
        ...state, 
        shuffleMode: action.payload,
        // Re-shuffle the current queue when shuffle mode is toggled
        queue: action.payload && state.queue.length > 0 ? shuffleArray(state.queue) : state.queue
      };
    case 'SET_REPEAT':
      return { ...state, repeatMode: action.payload };
    case 'ADD_TO_QUEUE': {
      const songsToAdd = Array.isArray(action.payload) ? action.payload : [action.payload];
      // If shuffle mode is on, shuffle the songs being added to queue
      const queueSongs = state.shuffleMode ? shuffleArray(songsToAdd) : songsToAdd;
      return { ...state, queue: [...state.queue, ...queueSongs] };
    }
    case 'REMOVE_FROM_QUEUE':
      return { 
        ...state, 
        queue: state.queue.filter((_, index) => index !== action.payload) 
      };
    case 'CLEAR_QUEUE':
      return { ...state, queue: [] };
    default:
      return state;
  }
}

// Helper functions for playlist navigation
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getNextIndex(currentIndex: number, playlistLength: number, shuffleMode: boolean, repeatMode: 'off' | 'one' | 'all'): number {
  if (playlistLength === 0) return -1;
  
  if (repeatMode === 'one') {
    return currentIndex;
  }
  
  if (shuffleMode) {
    return Math.floor(Math.random() * playlistLength);
  }
  
  const nextIndex = currentIndex + 1;
  if (nextIndex >= playlistLength) {
    return repeatMode === 'all' ? 0 : currentIndex;
  }
  return nextIndex;
}

function getPreviousIndex(currentIndex: number, playlistLength: number, shuffleMode: boolean, repeatMode: 'off' | 'one' | 'all'): number {
  if (playlistLength === 0) return -1;
  
  if (repeatMode === 'one') {
    return currentIndex;
  }
  
  if (shuffleMode) {
    return Math.floor(Math.random() * playlistLength);
  }
  
  const prevIndex = currentIndex - 1;
  if (prevIndex < 0) {
    return repeatMode === 'all' ? playlistLength - 1 : currentIndex;
  }
  return prevIndex;
}

interface AudioContextType {
  state: AudioState;
  playSong: (song: Song, playlist?: Song[]) => void;
  playPlaylist: (songs: Song[], startIndex?: number) => void;
  togglePlayPause: () => void;
  nextSong: () => void;
  previousSong: () => void;
  seekTo: (time: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setVolume: (volume: number) => void;
  setShuffle: (shuffle: boolean) => void;
  setRepeat: (repeat: 'off' | 'one' | 'all') => void;
  addToQueue: (songs: Song | Song[]) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  formatTime: (seconds: number) => string;
  // Convenience properties for easier access
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isLoading: boolean;
  isSeeking: boolean;
  playlist: Song[];
  queue: Song[];
  shuffleMode: boolean;
  repeatMode: 'off' | 'one' | 'all';
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(audioReducer, initialState);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isSeekingRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      // Only update if we're not currently seeking to avoid conflicts
      if (!audio.seeking && !isSeekingRef.current && !state.isSeeking) {
        dispatch({ type: 'SET_CURRENT_TIME', payload: audio.currentTime });
      }
    };

    const handleDurationChange = () => {
      dispatch({ type: 'SET_DURATION', payload: audio.duration });
    };

    const handleEnded = () => {
      // Auto-advance to next song
      if (state.repeatMode === 'one') {
        // Replay current song
        audio.currentTime = 0;
        audio.play().catch(console.error);
      } else {
        dispatch({ type: 'NEXT_SONG' });
      }
    };

    const handleLoadStart = () => {
      dispatch({ type: 'SET_LOADING', payload: true });
    };

    const handleCanPlay = () => {
      dispatch({ type: 'SET_LOADING', payload: false });
    };

    const handleError = (error: Event) => {
      console.error('Audio error:', error);
      console.error('Audio error details:', {
        error: audio.error,
        networkState: audio.networkState,
        readyState: audio.readyState,
        src: audio.src
      });
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'PAUSE' });
    };

    const handleStalled = () => {
      console.warn('Audio stalled');
    };

    const handleWaiting = () => {
      dispatch({ type: 'SET_LOADING', payload: true });
    };

    const handlePlaying = () => {
      dispatch({ type: 'SET_LOADING', payload: false });
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
    };
  }, [state.isSeeking, state.repeatMode]); // Add dependency for repeatMode

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = state.volume;
  }, [state.volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.isPlaying) {
      // Only play if the audio is ready
      if (audio.readyState >= 2) { // HAVE_CURRENT_DATA or higher
        audio.play().catch(console.error);
      } else {
        // Wait for canplay event before playing
        const handleCanPlay = () => {
          if (state.isPlaying) {
            audio.play().catch(console.error);
          }
          audio.removeEventListener('canplay', handleCanPlay);
        };
        audio.addEventListener('canplay', handleCanPlay);
      }
    } else {
      audio.pause();
    }
  }, [state.isPlaying]);

  // Effect to handle song changes from playlist navigation
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentSong) return;

    // Load the new song
    const proxiedAudioUrl = state.currentSong.fileUrl?.includes('/api/media/audio') 
      ? state.currentSong.fileUrl
      : `${API_CONFIG.MUSIC_API}/api/media/audio?url=${encodeURIComponent(state.currentSong.fileUrl || '')}`;

    audio.src = proxiedAudioUrl;
    audio.load();

    // Reset playing state temporarily while loading
    if (state.isPlaying) {
      dispatch({ type: 'SET_LOADING', payload: true });
    }

    // Reset listening time tracking for new song
    listeningStartTimeRef.current = null;
    hasAddedToHistoryRef.current = false;
  }, [state.currentSong?.id]);

  // Listening time tracking refs
  const listeningStartTimeRef = useRef<number | null>(null);
  const hasAddedToHistoryRef = useRef<boolean>(false);

  // Effect to track listening time and add to history after 30 seconds
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentSong) return;

    const handleTimeUpdate = () => {
      if (!state.isPlaying) return;
      
      // Start tracking when song starts playing
      if (listeningStartTimeRef.current === null) {
        listeningStartTimeRef.current = Date.now();
        return;
      }

      // Check if 30 seconds have passed and we haven't added to history yet
      const listeningTime = Date.now() - listeningStartTimeRef.current;
      if (listeningTime >= 30000 && !hasAddedToHistoryRef.current && state.currentSong) {
        hasAddedToHistoryRef.current = true;
        
        // Add to listening history
        if (typeof window !== 'undefined') {
          const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
          if (currentUser?.id) {
            addToListeningHistory(currentUser.id, state.currentSong.id, Math.floor(listeningTime / 1000));
          }
        }
      }
    };

    const handlePlay = () => {
      // Reset start time when playback resumes if not already tracking
      if (listeningStartTimeRef.current === null) {
        listeningStartTimeRef.current = Date.now();
      }
    };

    const handlePause = () => {
      // Reset tracking when paused (user might skip around)
      listeningStartTimeRef.current = null;
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [state.currentSong?.id, state.isPlaying]);

  // Function to add songs to listening history
  const addToListeningHistory = async (userId: string, songId: string, actualListenTime?: number) => {
    try {
      if (!state.currentSong) return;
      
      console.log(`Adding song "${state.currentSong.title}" to listening history after ${actualListenTime || 0} seconds`);
      
      await userApi.addToListeningHistory(userId, {
        songId,
        songTitle: state.currentSong.title || 'Unknown Song',
        artist: state.currentSong.artists ? state.currentSong.artists.map(a => a.name).join(', ') : 'Unknown Artist',
        coverUrl: state.currentSong.coverUrl,
        duration: actualListenTime || Math.round(state.duration)
      });
    } catch (error) {
      console.warn('Error adding to listening history:', error);
    }
  };

  const playSong = (song: Song, playlist?: Song[]) => {
    if (playlist && playlist.length > 0) {
      const songIndex = playlist.findIndex(s => s.id === song.id);
      dispatch({ 
        type: 'SET_PLAYLIST', 
        payload: { 
          songs: playlist, 
          index: songIndex >= 0 ? songIndex : 0 
        } 
      });
    } else {
      dispatch({ type: 'SET_SONG', payload: song });
    }
    dispatch({ type: 'PLAY' });
  };

  const playPlaylist = (songs: Song[], startIndex: number = 0) => {
    if (songs.length === 0) return;
    
    const validIndex = Math.max(0, Math.min(startIndex, songs.length - 1));
    dispatch({ 
      type: 'SET_PLAYLIST', 
      payload: { 
        songs, 
        index: validIndex 
      } 
    });
    dispatch({ type: 'PLAY' });
  };

  const togglePlayPause = () => {
    if (state.isPlaying) {
      dispatch({ type: 'PAUSE' });
    } else {
      dispatch({ type: 'PLAY' });
    }
  };

  const nextSong = () => {
    // Allow advancing if there are songs in the queue OR if there's more than one song in the playlist
    if (state.queue.length > 0 || state.playlist.length > 1) {
      dispatch({ type: 'NEXT_SONG' });
      dispatch({ type: 'PLAY' });
    }
  };

  const previousSong = () => {
    // Allow navigating if there are songs in the queue OR if there's more than one song in the playlist
    if (state.queue.length > 0 || state.playlist.length > 1) {
      // If more than 3 seconds into the song, restart current song
      if (state.currentTime > 3) {
        seekTo(0);
      } else {
        dispatch({ type: 'PREVIOUS_SONG' });
        dispatch({ type: 'PLAY' });
      }
    } else if (state.currentTime > 3) {
      // If single song and more than 3 seconds in, restart
      seekTo(0);
    }
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio) {
      console.error('Cannot seek: Audio element not found');
      return;
    }

    if (!state.currentSong) {
      console.error('Cannot seek: No song loaded');
      return;
    }

    if (isNaN(time) || time < 0) {
      console.error('Cannot seek: Invalid time', time);
      return;
    }

    if (isSeekingRef.current) {
      console.warn('Already seeking, ignoring new seek request');
      return;
    }

    if (audio.readyState < 2) {
      console.warn('Audio not ready for seeking, waiting...');
      const handleCanPlay = () => {
        audio.removeEventListener('canplay', handleCanPlay);
        seekTo(time);
      };
      audio.addEventListener('canplay', handleCanPlay, { once: true });
      return;
    }

    if (time > audio.duration) {
      console.warn('Seek time exceeds duration, clamping to end');
      time = Math.max(0, audio.duration - 0.1);
    }


    
    try {
      // Set seeking state to prevent timeupdate conflicts
      dispatch({ type: 'SET_SEEKING', payload: true });
      isSeekingRef.current = true;
      
      const wasPlaying = !audio.paused;
      
      // Pause audio during seeking to prevent conflicts
      if (wasPlaying) {
        audio.pause();
      }
      
      // Perform the seek
      audio.currentTime = time;
      
      const handleSeeked = () => {
        audio.removeEventListener('seeked', handleSeeked);
        dispatch({ type: 'SET_SEEKING', payload: false });
        isSeekingRef.current = false;
        
        // Update the current time to the actual seeked position (force update)
        dispatch({ type: 'SET_CURRENT_TIME', payload: audio.currentTime, force: true });
        
        if (wasPlaying) {
          audio.play().catch(console.error);
        }
      };
      
      const handleSeekError = () => {
        console.error('Seek operation failed');
        audio.removeEventListener('seeked', handleSeeked);
        audio.removeEventListener('error', handleSeekError);
        dispatch({ type: 'SET_SEEKING', payload: false });
        isSeekingRef.current = false;
        
        if (wasPlaying && audio.paused) {
          audio.play().catch(console.error);
        }
      };
      
      audio.addEventListener('seeked', handleSeeked, { once: true });
      audio.addEventListener('error', handleSeekError, { once: true });
      
      setTimeout(() => {
        if (isSeekingRef.current) {
          console.warn('Seeked event timeout, cleaning up');
          audio.removeEventListener('seeked', handleSeeked);
          audio.removeEventListener('error', handleSeekError);
          dispatch({ type: 'SET_SEEKING', payload: false });
          isSeekingRef.current = false;
          
          if (wasPlaying && audio.paused) {
            audio.play().catch(console.error);
          }
        }
      }, 2000);
      
    } catch (error) {
      console.error('Error during seeking:', error);
      dispatch({ type: 'SET_SEEKING', payload: false });
      isSeekingRef.current = false;
    }
  };

  const setVolume = (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    dispatch({ type: 'SET_VOLUME', payload: clampedVolume });
  };

  const skipForward = (seconds: number = 10) => {
    const audio = audioRef.current;
    if (!audio || !state.currentSong) return;

    const newTime = Math.min(state.currentTime + seconds, state.duration);
    seekTo(newTime);
  };

  const skipBackward = (seconds: number = 10) => {
    const audio = audioRef.current;
    if (!audio || !state.currentSong) return;

    const newTime = Math.max(state.currentTime - seconds, 0);
    seekTo(newTime);
  };

  const setShuffle = (shuffle: boolean) => {
    dispatch({ type: 'SET_SHUFFLE', payload: shuffle });
  };

  const setRepeat = (repeat: 'off' | 'one' | 'all') => {
    dispatch({ type: 'SET_REPEAT', payload: repeat });
  };

  const addToQueue = (songs: Song | Song[]) => {
    dispatch({ type: 'ADD_TO_QUEUE', payload: songs });
  };

  const removeFromQueue = (index: number) => {
    dispatch({ type: 'REMOVE_FROM_QUEUE', payload: index });
  };

  const clearQueue = () => {
    dispatch({ type: 'CLEAR_QUEUE' });
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const value: AudioContextType = {
    state,
    playSong,
    playPlaylist,
    togglePlayPause,
    nextSong,
    previousSong,
    seekTo,
    skipForward,
    skipBackward,
    setVolume,
    setShuffle,
    setRepeat,
    addToQueue,
    removeFromQueue,
    clearQueue,
    formatTime,
    currentSong: state.currentSong,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration,
    volume: state.volume,
    isLoading: state.isLoading,
    isSeeking: state.isSeeking,
    playlist: state.playlist,
    queue: state.queue,
    shuffleMode: state.shuffleMode,
    repeatMode: state.repeatMode,
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" />
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
} 