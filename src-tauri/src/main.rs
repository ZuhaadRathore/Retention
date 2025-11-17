#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Flash-AI Tauri Application
// This is a minimal Tauri wrapper that provides a desktop window for the React frontend.
// The frontend communicates directly with the separate Python FastAPI backend server
// via HTTP (default: http://localhost:8000).
//
// Architecture:
// - Frontend (React + Tauri): This application - handles UI only
// - Backend (FastAPI + Python): Separate server - handles AI scoring, database, ML model
//
// To run:
// 1. Start backend: cd backend && python main.py
// 2. Start frontend: pnpm tauri dev

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Flash-AI application");
}
