Product Requirement Document (PRD): Comprehensive Expense Tracking System
1. Project Overview & Objectives
A comprehensive, centralized expense tracking system featuring a core mobile application, backed by a unified database, and extended with automation tools.
Key Milestones:
* Phase 1 (Core Engine & iOS App): Central Database + Backend API + iOS Mobile App with LINE Login and OCR/Slip scanning.
* Phase 2 (Convenience Extensions): LINE Bot Webhook (AI-powered text/slip parsing) and LINE MINI App (LIFF Dashboard).


________________


2. Authentication & Security
* Single Source of Identity: LINE Authentication ONLY (line_user_id as the primary identifier across all services).
* Environment Protection: All API keys and secrets must reside strictly in .env files. No hardcoding allowed.


________________


3. Database Architecture & Business Rules
A. Categories Management
* Preset Categories: Food, Transport, Accommodation, Utilities (Water/Electricity/Internet), Shopping, Telecom, Others.
* Customization: Users can create new custom categories, rename existing ones, and set budgets (Daily, Weekly, Monthly, Yearly).
* Deletion Rule: Deleting a category that contains existing transaction records must force the user to reassign those records to an active category before deletion is finalized.
B. Billing Cycle Settings
* Users can configure their preferred monthly billing cycle start date (e.g., matching their salary payout date).
C. Slip Storage & Duplicate Protection
* Storage Strategy: Scan OCR to extract payload, amount, datetime, and link, then generate and save a small Thumbnail in Supabase Storage. Full raw image files are discarded to save space.
* Duplicate Prevention: Utilize slip_hash / ref_id with a Unique Constraint to prevent duplicate entries of the same transfer receipt.