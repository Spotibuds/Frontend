'use client';

import { createContext, useContext, useReducer, useRef, useEffect, ReactNode } from 'react';
import { Song } from './api';

interface AudioState {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isLoading: boolean;
  isSeeking: boolean;
}

type AudioAction =
  | { type: 'SET_SONG'; payload: Song }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SET_CURRENT_TIME'; payload: number }
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'SET_VOLUME'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SEEKING'; payload: boolean };

const initialState: AudioState = {
  currentSong: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  isLoading: false,
  isSeeking: false,
};

function audioReducer(state: AudioState, action: AudioAction): AudioState {
  switch (action.type) {
    case 'SET_SONG':
      return { ...state, currentSong: action.payload, currentTime: 0, isSeeking: false };
    case 'PLAY':
      return { ...state, isPlaying: true };
    case 'PAUSE':
      return { ...state, isPlaying: false };
    case 'SET_CURRENT_TIME':
      // Only update currentTime if not currently seeking
      return state.isSeeking ? state : { ...state, currentTime: action.payload };
    case 'SET_DURATION':
      return { ...state, duration: action.payload };
    case 'SET_VOLUME':
      return { ...state, volume: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_SEEKING':
      return { ...state, isSeeking: action.payload };
    default:
      return state;
  }
}

interface AudioContextType {
  state: AudioState;
  playSong: (song: Song) => void;
  togglePlayPause: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  formatTime: (seconds: number) => string;
  // Expose individual state properties for convenience
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isLoading: boolean;
  isSeeking: boolean;
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
      dispatch({ type: 'PAUSE' });
      dispatch({ type: 'SET_CURRENT_TIME', payload: 0 });
    };

    const handleLoadStart = () => {
      dispatch({ type: 'SET_LOADING', payload: true });
    };

    const handleCanPlay = () => {
      dispatch({ type: 'SET_LOADING', payload: false });
    };

    // Removed handleSeeked and handleSeeking - now handled in seekTo function

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);

          return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('durationchange', handleDurationChange);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('loadstart', handleLoadStart);
        audio.removeEventListener('canplay', handleCanPlay);
      };
    }, [state.isSeeking]); // Add dependency for isSeeking state

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = state.volume;
  }, [state.volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.isPlaying) {
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [state.isPlaying]);

  const playSong = (song: Song) => {
    const audio = audioRef.current;
    if (!audio) {
      console.error('❌ Audio element not found');
      return;
    }

    // Don't reload the same song
    if (state.currentSong?.id === song.id && audio.src) {
  
      dispatch({ type: 'PLAY' });
      return;
    }

    // Convert Azure Blob URL to proxied URL for audio
    const proxiedAudioUrl = song.fileUrl.includes('/api/media/audio') 
      ? song.fileUrl 
      : `${process.env.NEXT_PUBLIC_MUSIC_API || 'http://localhost:81'}/api/media/audio?url=${encodeURIComponent(song.fileUrl)}`;


    
    dispatch({ type: 'SET_SONG', payload: song });
    audio.src = proxiedAudioUrl;
    audio.load();
    dispatch({ type: 'PLAY' });
  };

  const togglePlayPause = () => {
    if (state.isPlaying) {
      dispatch({ type: 'PAUSE' });
    } else {
      dispatch({ type: 'PLAY' });
    }
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio) {
      console.error('❌ Cannot seek: Audio element not found');
      return;
    }

    if (!state.currentSong) {
      console.error('❌ Cannot seek: No song loaded');
      return;
    }

    if (isNaN(time) || time < 0) {
      console.error('❌ Cannot seek: Invalid time', time);
      return;
    }

    // Wait for audio to be loaded before seeking
    if (audio.readyState < 2) {
      console.warn('⚠️ Audio not ready for seeking, waiting...');
      audio.addEventListener('canplay', () => seekTo(time), { once: true });
      return;
    }

    if (time > audio.duration) {
      console.warn('⚠️ Seek time exceeds duration, clamping to end');
      time = audio.duration;
    }


    
    try {
      // Set seeking state to prevent timeupdate conflicts
      dispatch({ type: 'SET_SEEKING', payload: true });
      isSeekingRef.current = true;
      
      const wasPlaying = !audio.paused;
      
      // Perform the seek
      audio.currentTime = time;
      
      // Update visual state immediately
      dispatch({ type: 'SET_CURRENT_TIME', payload: time });
      
      // Listen for the seeked event to know when seeking is complete
      const handleSeeked = () => {

        dispatch({ type: 'SET_SEEKING', payload: false });
        dispatch({ type: 'SET_CURRENT_TIME', payload: audio.currentTime });
        isSeekingRef.current = false;
        audio.removeEventListener('seeked', handleSeeked);
        
        // Resume playing if it was playing before
        if (wasPlaying && audio.paused) {
          audio.play().catch(console.error);
        }
      };
      
      audio.addEventListener('seeked', handleSeeked, { once: true });
      
              // Fallback timeout in case seeked event doesn't fire
        setTimeout(() => {
          if (state.isSeeking) {
            dispatch({ type: 'SET_SEEKING', payload: false });
            isSeekingRef.current = false;
          }
        }, 1000);
      
    } catch (error) {
      dispatch({ type: 'SET_SEEKING', payload: false });
      isSeekingRef.current = false;
    }
  };

  const setVolume = (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    dispatch({ type: 'SET_VOLUME', payload: clampedVolume });
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
    togglePlayPause,
    seekTo,
    setVolume,
    formatTime,
    // Expose individual state properties for convenience
    currentSong: state.currentSong,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration,
    volume: state.volume,
    isLoading: state.isLoading,
    isSeeking: state.isSeeking,
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