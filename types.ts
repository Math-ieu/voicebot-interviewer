
export enum InterviewState {
  IDLE,
  CONNECTING,
  ACTIVE,
  STOPPING,
  FINISHED,
  ERROR,
}

export interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'bot';
  text: string;
}
