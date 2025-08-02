'use client';

import { createContext, useContext, useReducer, useRef, useEffect, ReactNode } from 'react';
import { Song, API_CONFIG } from './api';

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
  | { type: 'SET_CURRENT_TIME'; payload: number; force?: boolean }
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
      console.error('Audio element not found');
      return;
    }

    if (state.currentSong?.id === song.id && audio.src && !audio.error) {
      dispatch({ type: 'PLAY' });
      return;
    }

    // Stop current playback and reset state
    audio.pause();
    dispatch({ type: 'PAUSE' });
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_CURRENT_TIME', payload: 0 });
    dispatch({ type: 'SET_DURATION', payload: 0 });

        // Convert Azure Blob URL to proxied URL for audio
    const proxiedAudioUrl = song.fileUrl?.includes('/api/media/audio') 
      ? song.fileUrl
      : `${API_CONFIG.MUSIC_API}/api/media/audio?url=${encodeURIComponent(song.fileUrl || '')}`;



    const handleLoadError = (error: Event) => {
      console.error('Audio load error:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'PAUSE' });
      audio.removeEventListener('error', handleLoadError);
    };

    const handleCanPlayThrough = () => {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'PLAY' });
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
      audio.removeEventListener('error', handleLoadError);
    };

    audio.addEventListener('error', handleLoadError, { once: true });
    audio.addEventListener('canplaythrough', handleCanPlayThrough, { once: true });

    // Set new song and load
    dispatch({ type: 'SET_SONG', payload: song });
    audio.src = proxiedAudioUrl;
    audio.load();
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