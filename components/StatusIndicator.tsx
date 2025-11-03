
import React from 'react';
import { InterviewState } from '../types';

interface StatusIndicatorProps {
  state: InterviewState;
  isBotSpeaking: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ state, isBotSpeaking }) => {
  let text = 'Prêt à commencer';
  let color = 'bg-gray-500';
  let pulse = false;

  switch (state) {
    case InterviewState.CONNECTING:
      text = 'Connexion...';
      color = 'bg-yellow-500';
      pulse = true;
      break;
    case InterviewState.ACTIVE:
      if (isBotSpeaking) {
        text = 'Le bot parle...';
        color = 'bg-indigo-500';
        pulse = true;
      } else {
        text = 'À votre écoute...';
        color = 'bg-green-500';
        pulse = true;
      }
      break;
    case InterviewState.STOPPING:
      text = 'Arrêt en cours...';
      color = 'bg-yellow-500';
      break;
    case InterviewState.FINISHED:
      text = 'Entretien terminé';
      color = 'bg-gray-500';
      break;
    case InterviewState.ERROR:
      text = 'Erreur de connexion';
      color = 'bg-red-500';
      break;
    case InterviewState.IDLE:
    default:
      text = 'Prêt à commencer';
      color = 'bg-gray-500';
      break;
  }

  return (
    <div className="flex items-center justify-center space-x-2 text-sm text-gray-300 h-8">
      <div className={`w-3 h-3 rounded-full ${color} ${pulse ? 'animate-pulse' : ''}`}></div>
      <span>{text}</span>
    </div>
  );
};

export default StatusIndicator;
 