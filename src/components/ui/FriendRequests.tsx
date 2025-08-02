"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Button } from './Button';
import { userApi, identityApi, FriendRequest } from '@/lib/api';
import { useFriendHub } from '@/hooks/useFriendHub';

interface FriendRequestsProps {
  className?: string;
}

export default function FriendRequests({ className = '' }: FriendRequestsProps) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Initialize friend hub for real-time updates
  useFriendHub();

  useEffect(() => {
    const user = identityApi.getCurrentUser();
    setCurrentUser(user);

    if (user) {
      loadFriendRequests(user.id);
    }
  }, []);

  const loadFriendRequests = async (userId: string) => {
    try {
      const requests = await userApi.getPendingFriendRequests(userId);
      setFriendRequests(requests);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!currentUser) return;

    try {
      await userApi.acceptFriendRequest(requestId, currentUser.id);
      // Remove from local state
      setFriendRequests(prev => prev.filter(req => req.id !== requestId));
    } catch (error) {
      console.error('Failed to accept friend request:', error);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!currentUser) return;

    try {
      await userApi.declineFriendRequest(requestId, currentUser.id);
      // Remove from local state
      setFriendRequests(prev => prev.filter(req => req.id !== requestId));
    } catch (error) {
      console.error('Failed to decline friend request:', error);
    }
  };

  if (isLoading) {
    return (
      <Card className={`bg-gray-800/50 border-gray-700 ${className}`}>
        <CardHeader>
          <CardTitle className="text-white">Friend Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-gray-400">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (friendRequests.length === 0) {
    return null; // Don't show the component if there are no requests
  }

  return (
    <Card className={`bg-gray-800/50 border-gray-700 ${className}`}>
      <CardHeader>
        <CardTitle className="text-white">
          Friend Requests ({friendRequests.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {friendRequests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">
                    {request.requesterUsername.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-white font-medium">{request.requesterUsername}</p>
                  <p className="text-gray-400 text-sm">
                    {new Date(request.requestedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  onClick={() => handleAcceptRequest(request.id)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm"
                >
                  Accept
                </Button>
                <Button
                  onClick={() => handleDeclineRequest(request.id)}
                  variant="outline"
                  className="border-gray-600 text-white hover:bg-gray-600 px-4 py-2 text-sm"
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 