System Architecture & Tech Stack
1. Tech Stack Overview
* Central Database & Auth: Supabase / PostgreSQL
* Backend API: Node.js (Express)
* Mobile Frontend (Phase 1): iOS App (Flutter / React Native or Swift)
* LINE Integration (Phase 2): LINE Messaging API (Bot) + LINE Front-end Framework (LIFF / React)


________________


2. Directory Structure (Monorepo)
my-expense-tracker/


├── docs/                      # Product documentation & PRD


├── backend/                   # Node.js Express API & Supabase connection


├── ios-app/                   # Core iOS Mobile Application


└── liff-app/                  # LINE MINI App Dashboard (Phase 2)