export interface Appointment {
  patientName?: string;
  phoneNumber?: string;
  age?: number;
  gender?: string;
  reason?: string;
  doctor?: string;
  date?: string;
  time?: string;
  isNewPatient?: boolean;
}

export type CallStatus = 'idle' | 'connecting' | 'active' | 'completed' | 'error';
