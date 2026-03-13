import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { Mic, MicOff, Phone, PhoneOff, User, Calendar, Clock, Stethoscope, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Appointment, CallStatus } from '../types';
import { float32ToInt16, uint8ArrayToBase64, base64ToUint8Array, int16ToFloat32 } from '../utils/audio';

const SYSTEM_INSTRUCTION = `
You are a friendly and professional AI voice assistant working for a medical clinic. 
Your main job is to help patients book doctor appointments over a phone call.

STRICT TOPIC ADHERENCE:
- You ONLY handle medical appointment bookings.
- If the user asks about off-topic subjects (entertainment, news, jokes, etc.), politely redirect them: "I'm sorry, I can only assist with booking medical appointments. Let's get back to your booking. [Ask the next required question]."

Your conversation style should be:
- Natural, Conversational, Polite
- Clear and slow (since this is a voice call)
- Ask only one question at a time
- Confirm important information

PRIMARY GOAL: Collect all required details for a doctor appointment and save them to the database.

Required information:
1. Patient Full Name
2. Phone Number
3. Age
4. Gender
5. Reason for Visit / Symptoms
6. Preferred Doctor (Automatically assigned based on reason, unless user insists on someone else)
7. Appointment Date
8. Appointment Time
9. Whether this is a New Patient or Existing Patient

DATABASE & PATIENT LOGIC:
- When you get the Patient Full Name, call 'checkPatientStatus'.
- If the user says they are an "Existing Patient" but 'checkPatientStatus' returns exists: false, say: "I'm sorry, I couldn't find your name in our records. You are not currently registered as an existing patient. Shall we proceed as a new patient?"
- If 'checkPatientStatus' returns exists: true:
    - Compare the current 'Reason for Visit' with the last 'reason' from the database.
    - If Name and Reason are the SAME: Consider them an EXISTING patient and skip directly to asking for the Appointment Time (assuming they want the same doctor/setup).
    - If Name is the same but Reason or Doctor is DIFFERENT: Consider them a NEW patient for this specific issue.

CONFLICT DETECTION:
- Before confirming the Appointment Time, call 'checkConflict' with the date, time, and doctor.
- If 'checkConflict' returns conflict: true, say: "I'm sorry, but another appointment is already booked for this time with that doctor. Could you please choose another time?"

DOCTOR ASSIGNMENT LOGIC:
When the user provides a "Reason for Visit", automatically suggest the most suitable doctor:
- General fever, cold, flu, checkup -> Dr. Smith (General Physician)
- Heart issues, chest pain, blood pressure -> Dr. Jones (Cardiologist)
- Skin rashes, acne, skin allergies -> Dr. Lee (Dermatologist)
- Children's health issues (if age < 18) -> Dr. Garcia (Pediatrician)
- Bone, joint pain, or injuries -> Dr. Wang (Orthopedic)
- For anything else -> Dr. Smith (General Physician)

CONVERSATION FLOW:
1. START: Greet the user and ask for their Full Name.
2. CHECK STATUS: Call 'checkPatientStatus' as soon as you have the name.
3. SEQUENTIAL COLLECTION:
   - Full Name -> Phone Number -> Age -> Gender -> Reason for Visit.
4. AUTOMATIC DOCTOR ASSIGNMENT:
   - Suggest doctor based on reason.
5. DATE & TIME:
   - Ask for Date.
   - Ask for Time.
   - Call 'checkConflict' immediately after Time is given.
6. FINAL SAVE:
   - After final confirmation, call 'saveAppointment' to persist the data.
7. TOOL SYNC: After every user response, call 'updateAppointment' with ALL collected data so far.

INPUT VALIDATION RULES:
1. NAME: No numbers.
2. PHONE: 10 digits.
3. AGE: 0-120.
4. DATE: Valid future date.
5. TIME: 9:00 AM to 6:00 PM.

CONFIRMATION STEP:
Summarize everything and ask for final confirmation.

FINAL RESPONSE:
Confirm success, call 'saveAppointment', and end the call politely.

TOOL USAGE:
- Whenever you collect ANY piece of information, call the 'updateAppointment' tool.
- Call 'checkPatientStatus' after getting the name.
- Call 'checkConflict' after getting the time.
- Call 'saveAppointment' ONLY after the user gives final confirmation.
- IMPORTANT: Always include ALL the information you have collected so far in the tool call arguments.
`;

const updateAppointmentTool: FunctionDeclaration = {
  name: "updateAppointment",
  parameters: {
    type: Type.OBJECT,
    description: "Update the current appointment details as they are collected.",
    properties: {
      patientName: { type: Type.STRING, description: "The full name of the patient." },
      phoneNumber: { type: Type.STRING, description: "The 10-digit phone number of the patient." },
      age: { type: Type.NUMBER, description: "The age of the patient (0-120)." },
      gender: { type: Type.STRING, description: "The gender of the patient (Male, Female, Other)." },
      reason: { type: Type.STRING, description: "The reason for the visit or symptoms described by the patient." },
      doctor: { type: Type.STRING, description: "The name of the preferred doctor." },
      date: { type: Type.STRING, description: "The preferred date for the appointment (e.g., 'March 15th')." },
      time: { type: Type.STRING, description: "The preferred time for the appointment (e.g., '10:30 AM')." },
      isNewPatient: { type: Type.BOOLEAN, description: "True if the patient is new to the clinic, false otherwise." },
    },
  },
};

const checkPatientStatusTool: FunctionDeclaration = {
  name: "checkPatientStatus",
  parameters: {
    type: Type.OBJECT,
    description: "Check if a patient exists in the database and get their last appointment details.",
    properties: {
      patientName: { type: Type.STRING, description: "The full name of the patient." },
    },
    required: ["patientName"],
  },
};

const checkConflictTool: FunctionDeclaration = {
  name: "checkConflict",
  parameters: {
    type: Type.OBJECT,
    description: "Check if there is an appointment conflict for a given date, time, and doctor.",
    properties: {
      date: { type: Type.STRING, description: "The appointment date." },
      time: { type: Type.STRING, description: "The appointment time." },
      doctor: { type: Type.STRING, description: "The doctor's name." },
    },
    required: ["date", "time", "doctor"],
  },
};

const saveAppointmentTool: FunctionDeclaration = {
  name: "saveAppointment",
  parameters: {
    type: Type.OBJECT,
    description: "Save the final appointment details to the database.",
    properties: {
      patientName: { type: Type.STRING },
      phoneNumber: { type: Type.STRING },
      age: { type: Type.NUMBER },
      gender: { type: Type.STRING },
      reason: { type: Type.STRING },
      doctor: { type: Type.STRING },
      date: { type: Type.STRING },
      time: { type: Type.STRING },
      isNewPatient: { type: Type.BOOLEAN },
    },
    required: ["patientName", "phoneNumber", "age", "gender", "reason", "doctor", "date", "time", "isNewPatient"],
  },
};

export default function VoiceAgent() {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [appointment, setAppointment] = useState<Appointment>({});
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [agentTranscript, setAgentTranscript] = useState<string>('');
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const isMutedRef = useRef(false);
  const isActiveRef = useRef(false);

  // Sync refs with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isActiveRef.current = status === 'active';
  }, [status]);

  const handleUpdateAppointment = useCallback((args: any) => {
    setAppointment(prev => ({ ...prev, ...args }));
    return { success: true, updatedFields: Object.keys(args) };
  }, []);

  const handleCheckPatientStatus = async (args: any) => {
    try {
      const response = await fetch("/api/check-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return await response.json();
    } catch (error) {
      console.error("Error checking patient status:", error);
      return { error: "Failed to check patient status" };
    }
  };

  const handleResetData = async () => {
    try {
      await fetch("/api/clear-appointments", { method: "POST" });
      setAppointment({});
      setUserTranscript('');
      setAgentTranscript('');
      setStatus('idle');
      setErrorMessage('');
      console.log("Database and local state cleared");
    } catch (error) {
      console.error("Error resetting data:", error);
    }
  };

  const handleCheckConflict = async (args: any) => {
    try {
      const response = await fetch("/api/check-conflict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return await response.json();
    } catch (error) {
      console.error("Error checking conflict:", error);
      return { error: "Failed to check conflict" };
    }
  };

  const handleSaveAppointment = async (args: any) => {
    try {
      const response = await fetch("/api/save-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const result = await response.json();
      if (result.success) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#34d399', '#6ee7b7']
        });
      }
      return result;
    } catch (error) {
      console.error("Error saving appointment:", error);
      return { error: "Failed to save appointment" };
    }
  };

  const initializeAudio = async () => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      return {
        context: audioContextRef.current,
        stream: streamRef.current!,
        processor: processorRef.current!
      };
    }

    console.log("Audio: Initializing context and stream...");
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const context = new AudioContextClass({ sampleRate: 24000 });
    
    if (context.state === 'suspended') {
      console.log("Audio: Resuming context...");
      await context.resume();
    }

    console.log("Audio: Requesting microphone access...");
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(context.destination);

    audioContextRef.current = context;
    streamRef.current = stream;
    processorRef.current = processor;

    return { context, stream, processor };
  };

  const startCall = async () => {
    try {
      setStatus('connecting');
      
      const { context, stream, processor } = await initializeAudio();
      
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "undefined" || apiKey === "null") {
        const msg = "GEMINI_API_KEY is not detected. Please ensure your .env file exists in the root folder and contains GEMINI_API_KEY=your_key";
        setErrorMessage(msg);
        throw new Error(msg);
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      console.log("Live API: Connecting...");
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          tools: [{ 
            functionDeclarations: [
              updateAppointmentTool, 
              checkPatientStatusTool, 
              checkConflictTool, 
              saveAppointmentTool
            ] 
          }],
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            isActiveRef.current = true;
            console.log("Live API: Session opened");
            
            sessionPromise.then((session) => {
              sessionRef.current = session;
              
              // Trigger the agent to start speaking
              console.log("Live API: Sending initial prompt");
              session.sendRealtimeInput({
                text: "The user has joined the call. Please introduce yourself and start the appointment booking process."
              });
            }).catch(err => {
              console.error("Live API: Error in onopen session promise:", err);
            });
          },
          onmessage: async (message: any) => {
            console.log("Live API Message:", message);
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) {
                  setAgentTranscript(prev => prev + part.text);
                }
                if (part.inlineData) {
                  const audioData = base64ToUint8Array(part.inlineData.data);
                  // Ensure buffer is aligned for Int16Array
                  const int16Data = new Int16Array(
                    audioData.buffer, 
                    audioData.byteOffset, 
                    audioData.byteLength / 2
                  );
                  audioQueueRef.current.push(int16Data);
                  if (!isPlayingRef.current) {
                    playNextInQueue();
                  }
                }
              }
            }

            if (message.serverContent?.turnComplete) {
              // Optional: clear or handle turn completion
            }

            if (message.serverContent?.inputAudioTranscription?.text) {
              setUserTranscript(message.serverContent.inputAudioTranscription.text);
              // Clear agent transcript when user starts speaking new turn
              setAgentTranscript('');
            }

            if (message.toolCall) {
              const functionResponses = [];
              for (const call of message.toolCall.functionCalls) {
                console.log("Executing tool:", call.name, call.args);
                let result;
                if (call.name === 'updateAppointment') {
                  result = handleUpdateAppointment(call.args);
                } else if (call.name === 'checkPatientStatus') {
                  result = await handleCheckPatientStatus(call.args);
                } else if (call.name === 'checkConflict') {
                  result = await handleCheckConflict(call.args);
                } else if (call.name === 'saveAppointment') {
                  result = await handleSaveAppointment(call.args);
                }

                if (result) {
                  functionResponses.push({
                    id: call.id,
                    name: call.name,
                    response: result
                  });
                }
              }

              if (functionResponses.length > 0) {
                try {
                  const session = await sessionPromise;
                  console.log("Sending tool response via sendToolResponse", functionResponses);
                  session.sendToolResponse({ functionResponses });
                } catch (err) {
                  console.error("Error sending tool response:", err);
                }
              }
            }

            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
            }
          },
          onclose: () => {
            setStatus('idle');
            isActiveRef.current = false;
            cleanup();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setErrorMessage("Connection to Gemini API failed. Please check your API key and network.");
            setStatus('error');
            isActiveRef.current = false;
            cleanup();
          }
        }
      });

      console.log("Live API: Waiting for session promise...");
      const session = await sessionPromise;
      sessionRef.current = session;
      console.log("Live API: Session established");

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !isActiveRef.current || context.state !== 'running') return;
        
        try {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Calculate volume for visualizer
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          setVolume(Math.sqrt(sum / inputData.length));

          const int16Data = float32ToInt16(inputData);
          const base64Data = uint8ArrayToBase64(new Uint8Array(int16Data.buffer));
          
          session.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=24000' }
          });
        } catch (err) {
          console.error("Error in onaudioprocess:", err);
        }
      };

    } catch (error: any) {
      console.error("Failed to start call:", error);
      if (!errorMessage) {
        setErrorMessage(error.message || "Failed to start call. Please try again.");
      }
      setStatus('error');
      cleanup();
    }
  };

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const int16Data = audioQueueRef.current.shift()!;
    const float32Data = int16ToFloat32(int16Data);
    
    const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      playNextInQueue();
    };
    
    source.start();
  };

  const endCall = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
    }
    setAppointment({});
    setUserTranscript('');
    setAgentTranscript('');
    setStatus('idle');
    cleanup();
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) {
        console.warn("Processor already disconnected", e);
      }
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(err => console.error("Error closing AudioContext:", err));
      }
      audioContextRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  useEffect(() => {
    return () => cleanup();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] p-8 bg-stone-50 rounded-3xl border border-stone-200 shadow-sm">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif italic text-stone-900">MediBook AI</h1>
          <p className="text-stone-500 font-sans uppercase tracking-widest text-xs">Medical Clinic Voice Assistant</p>
        </div>

        {/* Main Call Interface */}
        <div className="relative aspect-square max-w-sm mx-auto flex items-center justify-center">
          {/* Pulse Animation */}
          <AnimatePresence>
            {status === 'active' && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.1, 0.2, 0.1]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 bg-emerald-500 rounded-full"
              />
            )}
          </AnimatePresence>

          <div className={`relative z-10 w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 ${
            status === 'active' ? 'bg-emerald-500 shadow-lg shadow-emerald-200' : 
            status === 'connecting' ? 'bg-amber-400' : 'bg-stone-200'
          }`}>
            {status === 'active' ? (
              <Phone className="w-20 h-20 text-white animate-pulse" />
            ) : status === 'connecting' ? (
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Phone className="w-20 h-20 text-stone-400" />
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex justify-center gap-4">
            {(status === 'idle' || status === 'error') ? (
              <>
                <button
                  onClick={startCall}
                  className="px-8 py-4 bg-stone-900 text-stone-50 rounded-full font-sans font-medium hover:bg-stone-800 transition-colors flex items-center gap-2"
                >
                  <Phone className="w-5 h-5" />
                  Start Booking Call
                </button>
                <button
                  onClick={handleResetData}
                  className="px-6 py-4 bg-stone-100 text-stone-600 rounded-full font-sans font-medium hover:bg-stone-200 transition-colors flex items-center gap-2"
                  title="Clear all saved appointments"
                >
                  <RotateCcw className="w-5 h-5" />
                  Reset Data
                </button>
              </>
            ) : (
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    const newMuted = !isMuted;
                    setIsMuted(newMuted);
                    isMutedRef.current = newMuted;
                  }}
                  className={`flex items-center gap-2 px-6 py-4 rounded-full transition-all font-sans font-medium ${
                    isMuted 
                      ? 'bg-red-100 text-red-600 ring-2 ring-red-200' 
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {isMuted ? (
                    <>
                      <MicOff className="w-5 h-5" />
                      <span>Unmute</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5" />
                      <span>Mute</span>
                    </>
                  )}
                </button>
                <button
                  onClick={endCall}
                  className="px-8 py-4 bg-red-600 text-white rounded-full font-sans font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <PhoneOff className="w-5 h-5" />
                  End Call
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Status Message */}
        <div className="text-center space-y-2">
          <div className="h-6">
            <AnimatePresence mode="wait">
              {status === 'connecting' && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-amber-600 font-medium"
                >
                  Connecting to medical assistant...
                </motion.p>
              )}
              {status === 'active' && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-emerald-600 font-medium"
                >
                  Call in progress. Assistant is speaking...
                </motion.p>
              )}
              {status === 'error' && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-red-600 font-medium flex items-center justify-center gap-1 text-sm text-center"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMessage || "Connection failed. Please try again."}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Live Transcript Display */}
          <div className="flex flex-col gap-2 items-center">
            <AnimatePresence>
              {userTranscript && status === 'active' && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-block px-4 py-2 bg-stone-100 rounded-2xl rounded-bl-none text-stone-600 text-sm italic border border-stone-200 max-w-[80%]"
                >
                  <span className="text-[10px] uppercase font-bold block mb-1 opacity-50">You</span>
                  "{userTranscript}"
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {agentTranscript && status === 'active' && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-block px-4 py-2 bg-emerald-50 rounded-2xl rounded-br-none text-emerald-800 text-sm border border-emerald-100 max-w-[80%]"
                >
                  <span className="text-[10px] uppercase font-bold block mb-1 opacity-50">Assistant</span>
                  {agentTranscript}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Appointment Details Card */}
        <AnimatePresence>
          {(status === 'active' || Object.keys(appointment).length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between border-bottom pb-2 border-stone-100">
                <h3 className="font-serif italic text-lg text-stone-800">Live Appointment Summary</h3>
                {status === 'active' && (
                  <div className="flex gap-1">
                    {[1, 2, 3].map(i => (
                      <motion.div
                        key={i}
                        animate={{ height: [4, 12, 4] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                        className="w-1 bg-emerald-500 rounded-full"
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <DetailItem icon={<User className="w-4 h-4" />} label="Patient" value={appointment.patientName} />
                <DetailItem icon={<Phone className="w-4 h-4" />} label="Phone" value={appointment.phoneNumber} />
                <DetailItem icon={<Calendar className="w-4 h-4" />} label="Date" value={appointment.date} />
                <DetailItem icon={<Clock className="w-4 h-4" />} label="Time" value={appointment.time} />
                <DetailItem icon={<Stethoscope className="w-4 h-4" />} label="Doctor" value={appointment.doctor} />
                <DetailItem icon={<AlertCircle className="w-4 h-4" />} label="Reason" value={appointment.reason} />
                <DetailItem icon={<User className="w-4 h-4" />} label="Age" value={appointment.age} />
                <DetailItem icon={<User className="w-4 h-4" />} label="Gender" value={appointment.gender} />
                <DetailItem icon={<CheckCircle2 className="w-4 h-4" />} label="Patient Type" value={appointment.isNewPatient === undefined ? undefined : (appointment.isNewPatient ? 'New Patient' : 'Existing Patient')} />
              </div>

              {appointment.patientName && appointment.date && appointment.time && status !== 'active' && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3 text-emerald-800"
                >
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  <div>
                    <p className="font-medium">Appointment Confirmed!</p>
                    <p className="text-xs opacity-80">We'll see you on {appointment.date} at {appointment.time}.</p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode, label: string, value?: any }) {
  return (
    <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-stone-50 transition-colors">
      <div className="mt-0.5 text-stone-400">{icon}</div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-stone-400 font-sans font-semibold">{label}</p>
        <p className={`font-medium ${value ? 'text-stone-900' : 'text-stone-300 italic'}`}>
          {value || 'Not collected yet'}
        </p>
      </div>
    </div>
  );
}
