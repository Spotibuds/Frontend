'use client';

import { useEffect, useState } from 'react';
import { API_CONFIG } from '../../lib/api';

interface ApiConfig {
  IDENTITY_API: string;
  MUSIC_API: string;
  USER_API: string;
}

export default function ApiTestPage() {
  const [config, setConfig] = useState<ApiConfig | null>(null);

  useEffect(() => {
    setConfig(API_CONFIG);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-6">API Configuration Test</h1>
      
      <div className="bg-gray-800 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Current API Configuration:</h2>
        <pre className="bg-gray-700 p-4 rounded text-sm overflow-x-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>

      <div className="mt-6 bg-gray-800 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Environment Info:</h2>
        <ul className="space-y-2">
          <li><strong>NODE_ENV:</strong> {process.env.NODE_ENV}</li>
          <li><strong>Window Location:</strong> {typeof window !== 'undefined' ? window.location.href : 'Server-side'}</li>
          <li><strong>Is Production:</strong> {process.env.NODE_ENV === 'production' ? 'Yes' : 'No'}</li>
        </ul>
      </div>
    </div>
  );
}
