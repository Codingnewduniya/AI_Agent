import React, { useEffect, useState } from 'react';
import { Calendar, Clock, User, Stethoscope, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AppointmentRecord {
  id: number;
  patientName: string;
  phoneNumber: string;
  age: number;
  gender: string;
  reason: string;
  doctor: string;
  date: string;
  time: string;
  isNewPatient: boolean;
  createdAt: string;
}

export default function AppointmentList() {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAppointments = async () => {
    try {
      const response = await fetch('/api/appointments');
      const data = await response.json();
      setAppointments(data);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
    // Refresh every 10 seconds
    const interval = setInterval(fetchAppointments, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && appointments.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif italic text-stone-900">Recent Appointments</h2>
        <span className="text-xs font-medium text-stone-400 uppercase tracking-widest">Live Database</span>
      </div>

      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {appointments.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-stone-100 rounded-2xl p-8 text-center border border-dashed border-stone-300"
            >
              <p className="text-stone-500 italic">No appointments booked yet.</p>
            </motion.div>
          ) : (
            appointments.map((apt) => (
              <motion.div
                key={apt.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-medium text-stone-900">{apt.patientName}</h3>
                        <p className="text-xs text-stone-400">{apt.age}y • {apt.gender} • {apt.isNewPatient ? 'New' : 'Existing'}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-stone-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-emerald-500" />
                        <span>{apt.date}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-emerald-500" />
                        <span>{apt.time}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Stethoscope className="w-4 h-4 text-emerald-500" />
                        <span>{apt.doctor}</span>
                      </div>
                    </div>

                    <div className="bg-stone-50 rounded-xl p-3 text-sm text-stone-600 italic">
                      "{apt.reason}"
                    </div>
                  </div>
                  
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
