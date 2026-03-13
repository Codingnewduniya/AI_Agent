import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import fs from "fs";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error("❌ Error loading .env file:", result.error);
  } else {
    console.log("📂 .env file found and loaded from:", envPath);
  }
} else {
  console.warn("⚠️ No .env file found at:", envPath);
}

if (process.env.GEMINI_API_KEY) {
  console.log("✅ GEMINI_API_KEY detected in environment");
} else {
  console.warn("⚠️ GEMINI_API_KEY is still empty in process.env");
}

const db = new Database("appointments.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patientName TEXT,
    phoneNumber TEXT,
    age INTEGER,
    gender TEXT,
    reason TEXT,
    doctor TEXT,
    date TEXT,
    time TEXT,
    isNewPatient BOOLEAN,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // Check if patient exists and get their last appointment
  app.post("/api/check-patient", (req, res) => {
    const { patientName } = req.body;
    const stmt = db.prepare("SELECT * FROM appointments WHERE patientName = ? ORDER BY createdAt DESC LIMIT 1");
    const patient = stmt.get(patientName);
    
    if (patient) {
      res.json({ exists: true, lastAppointment: patient });
    } else {
      res.json({ exists: false });
    }
  });

  // Check for appointment conflicts
  app.post("/api/check-conflict", (req, res) => {
    const { date, time, doctor } = req.body;
    const stmt = db.prepare("SELECT * FROM appointments WHERE date = ? AND time = ? AND doctor = ?");
    const conflict = stmt.get(date, time, doctor);
    
    if (conflict) {
      res.json({ conflict: true });
    } else {
      res.json({ conflict: false });
    }
  });

  // Save appointment
  app.post("/api/save-appointment", (req, res) => {
    const { patientName, phoneNumber, age, gender, reason, doctor, date, time, isNewPatient } = req.body;
    
    const stmt = db.prepare(`
      INSERT INTO appointments (patientName, phoneNumber, age, gender, reason, doctor, date, time, isNewPatient)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    try {
      stmt.run(patientName, phoneNumber, age, gender, reason, doctor, date, time, isNewPatient ? 1 : 0);
      res.json({ success: true });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ success: false, error: "Failed to save appointment" });
    }
  });

  // Get all appointments (for UI sync if needed)
  app.get("/api/appointments", (req, res) => {
    const stmt = db.prepare("SELECT * FROM appointments ORDER BY createdAt DESC");
    const appointments = stmt.all();
    res.json(appointments);
  });

  // Clear all appointments
  app.post("/api/clear-appointments", (req, res) => {
    try {
      db.prepare("DELETE FROM appointments").run();
      res.json({ success: true });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ success: false, error: "Failed to clear appointments" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
