# Master UI/UX Specification & AI-to-AI Handoff Blueprint
**Target Platforms:** iOS & Android (Cross-Platform Mobile Architecture)  
**Target Architecture:** Modular Component-Driven Design System (React Native / Flutter / Web Engine)  
**Document Purpose:** Exhaustive UI/UX design tokens, microcopy, user flow logic, screen-by-screen inventory, and implementation constraints tailored for automated ingestion by AI agents (Claude / GPT-4) and frontend developers.

---

# Section 1: Executive Context & Comparative Matrix

## 1.1 Overview & Product Ecosystem
This specification synthesizes three specialized Thai financial and utility mobile applications operating in retail finance, group expense management, and personal bookkeeping.

1. **ป้านวล (Pa Nual):** A high-trust, accessible micro-lending and community savings management application tailored for micro-entrepreneurs, street vendors, and community groups. Focuses on ultra-legible typography, high-contrast visual cues, and friction-free loan/savings tracking.
2. **ขุนทอง (KhunTong):** A LINE-integrated social bill-splitting and group expense management bot and companion app. Focuses on rapid bill collection, multi-person debt settlement, dynamic itemized receipt splitting, and automated payment reminders via conversational interfaces.
3. **MeowJot:** A gamified personal expense tracking and automated OCR bookkeeping assistant. Features an automated e-slip scanning engine (reading banking app gallery albums) and credit card statement parsing, driven by a feline mascot persona ("Meow") and habit-building streak mechanics ("Salmon Streak").

---

## 1.2 Multi-App UX Comparative Matrix

| UX/UI Dimension | ป้านวล (Pa Nual) | ขุนทอง (KhunTong) | MeowJot |
| :--- | :--- | :--- | :--- |
| **Primary Target Audience** | Micro-entrepreneurs, community lending groups, elders | Social groups, roommates, colleagues splitting bills | Gen-Z, young professionals, automated trackers |
| **Brand Persona & Tone** | Warm, reliable, maternal, simplified Thai microcopy | Social, direct, energetic, group-oriented | Playful, cat-themed (*"Hello, my human!"*), gamified |
| **Core Color Palette** | Emerald Green / Warm Gold / High-Contrast Dark Text | LINE Green (`#00B900`) / Vibrant Amber / Charcoal | Canary Yellow (`#FBC02D`) / Deep Navy (`#031B33`) / Electric Blue (`#0066FF`) |
| **Primary Interaction Model** | Large card buttons, step-by-step wizard forms | Conversational prompts, item-by-item receipt tagging | Automated background slip OCR, daily timeline feed |
| **Gamification Elements** | Savings milestone badges, trust indicators | Payment prompt nudges, debtor penalty alerts | "Salmon Streak" daily feeding logs, collectible cat themes |
| **Data Ingestion Method** | Manual ledger entry & QR generation | Receipt image crop, OCR, Chat bot prompt | Auto-reading banking app photo albums & PDF statements |
| **Key Banking / Ecosystem Integration** | Thai QR Payment / PromptPay | LINE App Ecosystem / PromptPay / Bank Deep Links | 20+ Thai Commercial Banks (K+, SCB Easy, ttb, Krungthai) |

---

# Section 2: Complete Application Specifications

## 2.1 Application Spec 1: ป้านวล (Pa Nual)

### 2.1.1 Brand Identity & Design System Tokens
- **Primary Color:** Deep Emerald Green (`#0F5A47`) — Connotes trust, financial growth, and stability.
- **Secondary Accent:** Soft Gold (`#E6B800`) — Highlights savings goals and premium status.
- **Neutral Background Light:** Off-White / Cream (`#F9F9F6`).
- **Neutral Dark Text:** Charcoal (`#1A1A1A`).
- **Typography:**
  * Header Font: SF Pro Display / Kanit (Bold, 22pt - 28pt).
  * Body Font: SF Pro Text / Sukhumvit Set (Regular/Medium, 16pt - 18pt for high readability).
- **Iconography:** Simplified line icons with minimum 24x24dp touch targets and high stroke thickness (2px - 2.5px).

### 2.1.2 Onboarding & Security Architecture
1. **Phone Number & OTP Authentication:**
   - 10-digit Thai phone input formatted as `XXX-XXX-XXXX`.
   - Auto-focusing 6-digit OTP entry field with 60-second resend timer.
2. **PIN / Biometric Setup:**
   - 6-digit PIN pad with randomized numeric layout option.
   - iOS FaceID / Android Biometric prompt integration.

### 2.1.3 Core Screen Inventory & Component Breakdown
- **Dashboard / Home Screen:**
  - *Header:* Welcome banner e.g., *"สวัสดี ป้านวล ยินดีต้อนรับ"* (Hello Pa Nual, Welcome) with profile badge.
  - *Summary Card:* Active Loan Balance vs. Total Savings Pool displayed in large high-contrast numbers.
  - *Quick Action Grid (2x2):*
    1. **ฝาก/ออม (Deposit/Save):** Initiates PromptPay QR generation.
    2. **กู้/ขอยืม (Borrow/Request Loan):** Opens loan calculation workflow.
    3. **ชำระ ค่างวด (Pay Installment):** Direct payment gateway screen.
    4. **ประวัติรายการ (History):** Filterable ledger view.
- **Loan Calculation & Request Wizard:**
  - Interactive slider for Loan Amount (฿1,000 to ฿50,000 in steps of ฿1,000).
  - Duration Selection Pills: `1 เดือน`, `3 เดือน`, `6 เดือน`, `12 เดือน`.
  - Real-time Interest & Repayment breakdown card ($Calculated\ Monthly\ Payment = \frac{Principal + Interest}{Months}$).

---

## 2.2 Application Spec 2: ขุนทอง (KhunTong)

### 2.2.1 Brand Identity & Design System Tokens
- **Primary Color:** KhunTong Gold / Amber (`#F5A623`).
- **Secondary Color:** LINE Green (`#00B900`) for LINE messaging bridge integrations.
- **Background Slate:** Dark Slate Gray (`#1E232A`) / Pure White (`#FFFFFF`).
- **Status Colors:**
  * Paid / Settled: Mint Green (`#28A745`).
  * Unpaid / Pending: Crimson Red (`#DC3545`).
  * In Review / Partial: Warning Amber (`#FFC107`).
- **Typography:**
  * Display Header: Prompt / Thonburi (Bold, 20pt - 24pt).
  * Subtext / Meta: Sukhumvit Set (Regular, 14pt - 16pt).

### 2.2.2 Core Workflows & Logic
1. **Bill Creation Options:**
   - **Equal Split:** Total amount divided equally among $N$ selected members ($Share = \frac{Total}{N}$).
   - **Itemized Receipt Split (OCR):** Upload receipt photo -> Automatic item list extraction -> Tap-to-assign items to group members.
   - **Custom Amount Entry:** Manual exact amount specification per participant.
2. **Payment Tracking & Automated Nudging:**
   - Automated LINE chat bot reminders sent at user-configurable intervals (1 day, 3 days, 7 days).
   - "PromptPay Slip Verification" hook: Automatically matches incoming bank e-slips to open debts via QR payload matching.

### 2.2.3 Core Screen Inventory & Component Breakdown
- **Group Bill Detail Screen:**
  - *Header:* Group Title (e.g., "ทริปหัวหิน 🏖️") + Total Bill Amount.
  - *Participant List View:*
    - Row layout containing: Avatar, Name, Owed Amount, Payment Status Badge (`ยังไม่จ่าย` / `จ่ายแล้ว`).
    - Action CTA: `เตือนทุกคน` (Nudge All) button.
- **Receipt OCR Tagging Modal:**
  - Scaled receipt preview with interactive bounding boxes over recognized line items.
  - Member selection tray pinned at the bottom for multi-select assignment.

---

## 2.3 Application Spec 3: MeowJot

### 2.3.1 Brand Identity & Design System Tokens
- **Primary Top Banner:** Warm Canary Yellow (`#FBC02D` / `#FDD835`).
- **Primary Dark Background:** Deep Navy Blue (`#031B33`).
- **Accent Action CTA:** Electric Blue (`#0066FF`).
- **Badge Accent:** Gold (`#E5A93C`).
- **Mascot Palette:** Warm Brown (`#C67D34`), Cream (`#FFFFFF`), Cobalt (`#1E88E5`).
- **Microcopy Tone:** Playful, affectionate feline persona (*"Hello, my human!"*, *"Meow’s ready to jot!"*).

### 2.3.2 Onboarding & Permission Workflow
- **Screen 1–4 (Carousel):** Highlights automated e-slip gallery reading, credit card statement parsing (MeowGold), and category breakdown analytics.
- **Screen 5–7 (Auth & Security):** Phone authentication -> Birthday verification card (`📅 4 Jul 2003`) -> Security confirmation.
- **Screen 8–9 (System Permissions):**
  - **Notification Request Screen:** Nudges users for daily spending summaries.
  - **Photo Gallery Permission Screen:** Explicit scope limitation disclosure (*"Meow will only read e-slips in each banking app’s album"*). Includes supported bank logos: K+, SCB, Krungthai, Bangkok Bank, ttb, CIMB, UOB.

### 2.3.3 Detailed Screen Inventory & Component Specs (Screens 27–42)

#### 1. Main Dashboard & Transaction Timeline (Screens 30, 35, 40)
- **Header Section (Yellow):**
  - Left: Cat Avatar icon.
  - Center: Date Navigation Bar `< 📅 Oct 26 >`.
  - Right: Search Button (`🔍`), Wallet / Account Filter Button (`👛`).
  - Total Spending Display: Large bold numeric value e.g., `14,043.40 ฿` or `20,084.72 ฿`.
  - Analytics Trigger: `📊 Summary` blue pill button.
  - Active OCR Progress Banner: Floating speech bubble e.g., *"Reading 144 new e-slips. Please keep the app open\~"*.
- **Timeline Section (Dark Navy):**
  - Vertical date-grouped cards (e.g., `Today 17`, `Fri 16`, `Tue 13`).
  - Item Rows: Category Icon inside circular dark badge, Merchant Title (e.g., `GrabPay W`, `บจก. เอส เค อาร์`, `การไฟฟ้านครหลวง`), Transaction Type (`Spending`), Right-aligned Amount (`฿220`, `฿114.32`).
- **Floating Action Button (FAB):**
  - Expandable pill menu: `✏️ Add record | ∧`.

#### 2. Analytics & Financial Summary (Screen 37)
- **Top Financial Summary Bar:**
  - Displays `Income` (฿0), `Spending` (฿14,043.40), and calculated `Remaining` (-฿14,043.40).
- **Transaction Segment Switcher:** Tabs for `Spending` | `Income` | `Transfers`.
- **Donut Chart Visualizer:**
  - Interactive central total text display: `Spending Oct 26 - 14,043.40 ฿`.
  - Action pills below chart: `📊 Compare` | `🔔 Budgets`.
- **Breakdown Switcher:** Dual sub-tabs `By category` vs `By tag`.

#### 3. Gamification System: "Feed Meow" & "Salmon Streak" (Screens 38 & 41)
- **Streak Lost Alert Modal (Screen 38):**
  - Header: Sad mascot with wings/halo graphic.
  - Headline: *"Salmon streak lost"*.
  - Body: *"You haven’t jotted all e-slips within 7 days"*.
  - Actions: `Switch mode` (Secondary outlining) | `Restart streak` (Blue primary CTA).
- **Feed Meow Main Dashboard (Screen 41):**
  - Top Banner: Widget advertisement card (*"Add a reminder widget?"*).
  - Main Visual: Interactive mascot room with trophy shelf, photo frame, and fish plate.
  - 7-Day Food Bowl Tracker: Sunday through Today (17 Oct) displaying sushi/bowl icons.
  - Dual Streak Counter:
    * `Records categorized`: $X$-day streak with pending e-slips alert (`6 days pending >`).
    * `All e-slips read`: $Y$-day streak.
  - Footer Pill: `🍣 Best streak: 7 >`.

#### 4. Account Filter Sheet & Global Search (Screens 39 & 42)
- **Filter Sheet (Screen 39):**
  - Category Pills: `All accounts` | `All cards` | `Others`.
  - Bank Checklist: Kasikorn Bank, TrueMoney Wallet, Krungthai Bank, Siam Commercial Bank, Bangkok Bank, TMBThanachart Bank, Government Savings Bank.
  - Action CTA: `View records` (Blue full-width button).
- **Search Screen (Screen 42):**
  - Top Search Input Bar: `🔍 Search records`.
  - Date Filter Pill: `< 📅 Last 2 months >`.
  - Empty State Illustration: Mascot with magnifying glass + text *"Search records from recipient names and notes"*.

---

# Section 3: Production Design Tokens & Claude Guidelines

## 3.1 Design System Tokens Reference Table

```json
{
  "design_tokens": {
    "colors": {
      "pa_nual": {
        "primary": "#0F5A47",
        "secondary": "#E6B800",
        "background": "#F9F9F6",
        "text_dark": "#1A1A1A"
      },
      "khun_tong": {
        "primary": "#F5A623",
        "line_green": "#00B900",
        "background_slate": "#1E232A",
        "status_paid": "#28A745",
        "status_unpaid": "#DC3545"
      },
      "meow_jot": {
        "primary_yellow": "#FBC02D",
        "dark_navy": "#031B33",
        "action_blue": "#0066FF",
        "badge_gold": "#E5A93C",
        "card_background": "#001224"
      }
    },
    "typography": {
      "font_family_base": "Kanit, Sukhumvit Set, -apple-system, sans-serif",
      "h1": { "fontSize": 24, "fontWeight": "700", "lineHeight": 32 },
      "h2": { "fontSize": 20, "fontWeight": "600", "lineHeight": 28 },
      "body": { "fontSize": 16, "fontWeight": "400", "lineHeight": 24 },
      "caption": { "fontSize": 12, "fontWeight": "400", "lineHeight": 16 }
    },
    "spacing": {
      "xs": 4,
      "sm": 8,
      "md": 16,
      "lg": 24,
      "xl": 32
    },
    "border_radius": {
      "button": 12,
      "card": 16,
      "modal": 24,
      "pill": 999
    }
  }
}
```

---

## 3.2 Claude / AI-to-AI Handoff Directives

When instructing an AI code agent (e.g., Claude, GPT-4, Copilot) to generate code or build components based on this specification, observe the following rules:

1. **Strict Context Isolation:**
   - Always specify which app system is being generated (`PaNual`, `KhunTong`, or `MeowJot`) so the AI selects the exact color tokens, typography rules, and microcopy persona specified in Section 2.
2. **Single-File React Native / Web Execution Standard:**
   - When generating interactive previews, consolidate state management, stylesheets, inline SVG icons, and sub-components into a **single production-ready file** (`.jsx` or `.tsx`).
3. **Microcopy & Language Compliance:**
   - Preserve authentic Thai terminology and localized phrases verbatim (e.g., `บันทึกสลิปอัตโนมัติ`, `ขุนทอง`, `Hello, my human!`, `Salmon streak lost`). Do not replace localized microcopy with direct English translations unless specified.
4. **State Machine Modeling Requirements:**
   - Ensure all asynchronous user flows (OCR slip reading progress, bill splitting calculation, streak reset confirmation modal) are explicitly modeled with distinct state states (`idle`, `loading`, `success`, `error`, `empty`).
5. **Accessibility Standards:**
   - All interactive touch targets must satisfy a minimum boundary of $44 \times 44 \text{ dp}$. Text contrast ratios must maintain WCAG AA compliance against dark and yellow backgrounds.