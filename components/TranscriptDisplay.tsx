
import React, { useEffect, useRef } from 'react';
import { TranscriptEntry } from '../types';

interface TranscriptDisplayProps {
  transcript: TranscriptEntry[]; 
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({ transcript }) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  return (
    <div className="w-full flex-grow bg-gray-800/50 rounded-lg p-4 md:p-6 overflow-y-auto flex flex-col space-y-4">
      {transcript.map((entry) => (
        <div
          key={entry.id}
          className={`flex items-end gap-3 ${
            entry.speaker === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          {entry.speaker === 'bot' && (
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center font-bold text-sm">
              AI
            </div>
          )}
          <div
            className={`max-w-xs md:max-w-md lg:max-w-2xl rounded-2xl p-3 text-white shadow-md ${
              entry.speaker === 'user'
                ? 'bg-blue-600 rounded-br-none'
                : 'bg-gray-700 rounded-bl-none'
            }`}
          >
            <p className="text-sm md:text-base">{entry.text}</p>
          </div>
        </div>
      ))}
      <div ref={endOfMessagesRef} />
    </div>
  );
};

export default TranscriptDisplay;
