import React from 'react';
import VoiceAgent from './components/VoiceAgent';
import AppointmentList from './components/AppointmentList';
import { motion } from 'motion/react';
import { Stethoscope, Clock, Shield, MapPin, Phone } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Navigation */}
      <nav className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between border-b border-stone-200">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
            <Stethoscope className="w-6 h-6" />
          </div>
          <span className="text-xl font-serif italic tracking-tight text-stone-900">MediBook AI</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-500">
          <a href="#" className="hover:text-stone-900 transition-colors">Services</a>
          <a href="#" className="hover:text-stone-900 transition-colors">Doctors</a>
          <a href="#" className="hover:text-stone-900 transition-colors">Locations</a>
          <button className="px-5 py-2.5 bg-stone-900 text-stone-50 rounded-full hover:bg-stone-800 transition-all">
            Book Appointment
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12 md:py-20 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Hero Content */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            AI Voice Assistant Live
          </div>
          
          <h1 className="text-6xl md:text-7xl font-serif italic leading-[1.1] text-stone-900">
            Care that starts with a <span className="text-emerald-600">conversation.</span>
          </h1>
          
          <p className="text-lg text-stone-600 max-w-lg leading-relaxed">
            Experience the future of healthcare scheduling. Our AI voice assistant handles your appointment booking naturally, just like a real receptionist.
          </p>

          <div className="grid grid-cols-2 gap-6 pt-4">
            <Feature icon={<Clock className="w-5 h-5" />} title="24/7 Availability" desc="Book anytime, day or night." />
            <Feature icon={<Shield className="w-5 h-5" />} title="Secure & Private" desc="Your data is always protected." />
            <Feature icon={<MapPin className="w-5 h-5" />} title="Multiple Clinics" desc="Find the nearest location." />
            <Feature icon={<Phone className="w-5 h-5" />} title="Natural Voice" desc="Human-like interaction." />
          </div>
        </motion.div>

        {/* Voice Agent Interface */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <VoiceAgent />
        </motion.div>
      </main>

      {/* Database Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 border-t border-stone-200">
        <AppointmentList />
      </section>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-stone-200 mt-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-50 grayscale">
            <Stethoscope className="w-5 h-5" />
            <span className="font-serif italic">MediBook AI</span>
          </div>
          <p className="text-stone-400 text-sm">
            © 2026 MediBook AI Medical Group. All rights reserved.
          </p>
          <div className="flex gap-6 text-stone-400 text-sm">
            <a href="#" className="hover:text-stone-600">Privacy Policy</a>
            <a href="#" className="hover:text-stone-600">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="space-y-1">
      <div className="text-emerald-600 mb-2">{icon}</div>
      <h3 className="font-medium text-stone-900">{title}</h3>
      <p className="text-sm text-stone-500 leading-snug">{desc}</p>
    </div>
  );
}
