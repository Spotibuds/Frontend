"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  BellIcon,
  UserCircleIcon,
  HeartIcon,
  PlusIcon,
  BackwardIcon,
  ForwardIcon,
  PlayIcon as PlayIconSolid,
  PauseIcon,
  SpeakerWaveIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";

import { useAudio } from "@/lib/audio";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter();
  const { state, togglePlayPause, seekTo, setVolume, formatTime, isSeeking } = useAudio();
  const [isDragging, setIsDragging] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!state.currentSong || !state.duration) {
      console.warn('⚠️ Cannot seek: No song loaded or duration unknown', {
        currentSong: state.currentSong?.title,
        duration: state.duration
      });
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width)); // Clamp between 0 and 1
    const newTime = percentage * state.duration;
    

    
    seekTo(newTime);
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleProgressInteraction(e);
  };

  const handleProgressInteraction = useCallback((e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!state.currentSong || !state.duration) {
      return;
    }

    // Prevent seeking while already seeking
    if (isSeeking) {
      return;
    }

    const target = progressRef.current;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));
    const newTime = percentage * state.duration;
    
    seekTo(newTime);
  }, [state.currentSong, state.duration, isSeeking, seekTo]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      handleProgressInteraction(e);
    }
  }, [isDragging, handleProgressInteraction]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add global mouse event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove]);

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = clickX / width;
    
    // Clamp percentage between 0 and 1 to prevent out-of-bounds
    const clampedPercentage = Math.max(0, Math.min(1, percentage));
    setVolume(clampedPercentage);
  };

  return (
    <div className="h-screen bg-black text-white flex flex-col">
      {/* Top Navbar */}
      <div className="bg-gray-900/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => router.back()}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={() => router.forward()}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
          
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="What do you want to play?"
              className="bg-gray-800 text-white placeholder-gray-400 pl-10 pr-4 py-2 rounded-full w-96 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button className="bg-gray-800/80 hover:bg-gray-700 text-white font-medium px-4 py-2 rounded-full transition-all duration-200 border border-gray-600/50 hover:border-gray-500">
            SpotiSlides
          </button>
          <button className="p-2 hover:bg-gray-800 rounded-full transition-colors">
            <BellIcon className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-gray-800 rounded-full transition-colors">
            <UserCircleIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 bg-gray-900 flex flex-col">
          {/* Navigation */}
          <div className="px-6 py-6">
            <div className="flex items-center space-x-3 mb-8">
              <div className="w-8 h-8">
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-white">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <span className="text-white text-xl font-bold">SpotiBuds</span>
            </div>

            <nav className="space-y-4">
              <button 
                onClick={() => router.push('/dashboard')}
                className="flex items-center space-x-3 text-gray-300 hover:text-white transition-colors w-full text-left"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 2v20l-5.5-5.5L10 2zm4 20V2l5.5 14.5L14 22z"/>
                </svg>
                <span className="font-medium">Home</span>
              </button>
              
              <button className="flex items-center space-x-3 text-gray-300 hover:text-white transition-colors w-full text-left">
                <MagnifyingGlassIcon className="w-6 h-6" />
                <span className="font-medium">Search</span>
              </button>
              
              <button 
                onClick={() => router.push('/music')}
                className="flex items-center space-x-3 text-gray-300 hover:text-white transition-colors w-full text-left"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                <span className="font-medium">Songs</span>
              </button>
              
              <button 
                onClick={() => router.push('/albums')}
                className="flex items-center space-x-3 text-gray-300 hover:text-white transition-colors w-full text-left"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5s2.01-4.5 4.5-4.5 4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                </svg>
                <span className="font-medium">Albums</span>
              </button>
            </nav>
          </div>

          {/* Your Library */}
          <div className="px-6 mt-8 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-gray-300 font-semibold">Your Library</h2>
              <div className="flex items-center space-x-2">
                <button className="p-1 hover:bg-gray-800 rounded transition-colors">
                  <PlusIcon className="w-5 h-5 text-gray-400" />
                </button>
                <button className="p-1 hover:bg-gray-800 rounded transition-colors">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H20" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex space-x-2 mb-4">
              <button className="px-3 py-1 bg-gray-800 rounded-full text-sm">All</button>
              <button className="px-3 py-1 hover:bg-gray-800 rounded-full text-sm text-gray-400">Music</button>
            </div>

            {/* Library Items - Empty for now */}
            <div className="space-y-2 overflow-y-auto">
              {/* Library content will be populated when user creates playlists */}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-gradient-to-b from-gray-800 via-gray-900 to-black overflow-y-auto pb-24">
          {children}
        </div>
      </div>

      {/* Bottom Player Bar */}
      <div className="bg-gray-900 border-t border-gray-800 px-4 py-3 h-24 flex-shrink-0">
        <div className="flex items-center justify-between h-full">
          {/* Current Song Info */}
          <div className="flex items-center space-x-3 w-80">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-md flex items-center justify-center overflow-hidden">
              {state.currentSong?.coverUrl ? (
                <img 
                  src={state.currentSong.coverUrl} 
                  alt={state.currentSong.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-white font-bold">
                  {state.currentSong?.title?.charAt(0) || 'S'}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {state.currentSong?.title || 'No song playing'}
              </p>
              <p className="text-gray-400 text-xs truncate">
                {state.currentSong?.artists.map(a => a.name).join(', ') || 'Select a song'}
              </p>
            </div>
            <button className="p-1 hover:bg-gray-800 rounded transition-colors">
              <HeartIcon className="w-5 h-5 text-gray-400 hover:text-white" />
            </button>
          </div>

          {/* Player Controls */}
          <div className="flex flex-col items-center space-y-2 flex-1 max-w-md">
            <div className="flex items-center space-x-4">
              <button className="p-1 hover:bg-gray-800 rounded-full transition-colors">
                <BackwardIcon className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
              <button 
                onClick={togglePlayPause}
                disabled={!state.currentSong || state.isLoading}
                className="bg-white hover:bg-gray-200 text-black rounded-full p-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {state.isLoading ? (
                  <div className="w-5 h-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                ) : state.isPlaying ? (
                  <PauseIcon className="w-5 h-5" />
                ) : (
                  <PlayIconSolid className="w-5 h-5" />
                )}
              </button>
              <button className="p-1 hover:bg-gray-800 rounded-full transition-colors">
                <ForwardIcon className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>
            {/* Progress Bar */}
            <div className="flex items-center space-x-2 w-full max-w-md">
              <span className="text-xs text-gray-400 w-10 text-right">
                {formatTime(state.currentTime)}
              </span>
              <div 
                ref={progressRef}
                className={`flex-1 bg-gray-600 rounded-full h-1 group ${
                  isDragging ? 'cursor-grabbing' : (isSeeking ? 'cursor-wait' : 'cursor-pointer')
                }`}
                onClick={handleProgressClick}
                onMouseDown={handleProgressMouseDown}
              >
                <div 
                  className={`rounded-full h-1 relative transition-colors ${
                    isDragging || isSeeking ? 'bg-green-500' : 'bg-white group-hover:bg-green-500'
                  }`}
                  style={{ width: `${state.duration ? (state.currentTime / state.duration) * 100 : 0}%` }}
                >
                  <div className={`absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full transition-opacity ${
                    isDragging || isSeeking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`} />
                </div>
              </div>
              <span className="text-xs text-gray-400 w-10">
                {formatTime(state.duration)}
              </span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-3 w-80 justify-end">
            <button className="p-1 hover:bg-gray-800 rounded transition-colors">
              <SpeakerWaveIcon className="w-5 h-5 text-gray-400 hover:text-white" />
            </button>
            <div 
              className="w-20 bg-gray-600 rounded-full h-1 cursor-pointer group"
              onClick={handleVolumeClick}
            >
              <div 
                className="bg-white rounded-full h-1 relative group-hover:bg-green-500 transition-colors"
                style={{ width: `${state.volume * 100}%` }}
              >
                <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <button className="p-2 hover:bg-gray-800 rounded transition-colors">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-gray-400 hover:text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 