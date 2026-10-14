# Expense Tracker System

A comprehensive, centralized expense tracking system featuring a core mobile application, backed by a unified database, and extended with automation tools.

## Project Overview

**Phase 1: Core Engine & iOS App** ✅
- Central Database (Supabase / PostgreSQL)
- Backend API (Node.js / Express)
- iOS Mobile App (Swift / SwiftUI)
- LINE Login Authentication
- Transaction Management
- Dashboard with Category Summaries

**Phase 2: Convenience Extensions** (Future)
- LINE Bot Webhook (AI-powered text/slip parsing)
- LINE MINI App (LIFF Dashboard)

## Tech Stack

- **Database**: Supabase / PostgreSQL
- **Backend**: Node.js / Express
- **Mobile**: iOS (Swift / SwiftUI)
- **Authentication**: LINE Login OAuth
- **AI**: OpenAI API (for future OCR features)

## Project Structure

```
project0/
├── docs/                          # Product documentation
│   ├── PRD.md                     # Product Requirements
│   ├── ARCHITECTURE.md            # System Architecture
│   ├── DB_SCHEMA.md               # Database Schema
│   └── SETUP_GUIDE.md             # Setup Instructions
├── backend/                       # Node.js Express API
│   ├── config/                    # Configuration files
│   ├── controllers/               # API controllers
│   ├── routes/                    # API routes
│   ├── supabase/                  # Database migrations
│   └── README.md                  # Backend documentation
└── ios-app/                       # iOS Application
    └── ExpenseTracker/            # SwiftUI app
        ├── Models/                # Data models
        ├── Services/              # Network & auth services
        ├── ViewModels/            # View models
        ├── Views/                 # SwiftUI views
        └── README.md              # iOS app documentation
```

## Quick Start

### Backend Setup

1. **Install Dependencies**
```bash
cd backend
npm install
```

2. **Configure Environment**
- Copy `.env.example` to `.env` (already configured)
- Add your Supabase API keys to `.env`

3. **Set up Database**
- Go to Supabase SQL Editor
- Run migration files from `backend/supabase/migrations/` in order

4. **Start Backend**
```bash
npm start
```

Backend will run on `http://localhost:3000`

### iOS App Setup

1. **Open Project**
```bash
cd ios-app/ExpenseTracker
open ExpenseTracker.xcodeproj
```

2. **Configure LINE Login**
- Add bundle identifier `com.expensetracker.app` to LINE Developers Console
- Set callback URL scheme: `com.expensetracker.app://line/callback`

3. **Build and Run**
- Select simulator or device
- Press `Cmd + R` to run

## API Endpoints

### Users
- `POST /api/users` - Create/update user
- `GET /api/users/:line_user_id` - Get user profile
- `PUT /api/users/:line_user_id/billing-cycle` - Update billing cycle
- `DELETE /api/users/:line_user_id` - Delete user

### Categories
- `GET /api/categories/:line_user_id` - Get all categories
- `POST /api/categories/:line_user_id` - Create category
- `PUT /api/categories/:line_user_id/:category_id` - Update category
- `DELETE /api/categories/:line_user_id/:category_id` - Delete category
- `POST /api/categories/:line_user_id/reassign` - Reassign transactions

### Transactions
- `GET /api/transactions/:line_user_id` - Get all transactions
- `GET /api/transactions/:line_user_id/summary` - Get summary by category
- `POST /api/transactions/:line_user_id` - Create transaction
- `PUT /api/transactions/:line_user_id/:transaction_id` - Update transaction
- `DELETE /api/transactions/:line_user_id/:transaction_id` - Delete transaction

### LINE Login
- `GET /api/line/login-url` - Generate LINE Login URL
- `GET /api/line/callback` - Handle LINE Login callback
- `POST /api/line/verify` - Verify access token
- `POST /api/line/logout` - Logout

## Features

### Implemented (Phase 1)
- ✅ LINE Login authentication
- ✅ User profile management
- ✅ Category management (CRUD)
- ✅ Transaction management (CRUD)
- ✅ Dashboard with income/expense summaries
- ✅ Category breakdown view
- ✅ Billing cycle support
- ✅ Duplicate slip prevention
- ✅ Category deletion safety

### Planned (Phase 2)
- ⏳ LINE Bot integration
- ⏳ LINE MINI App (LIFF)
- ⏳ OCR slip scanning
- ⏳ AI-powered expense categorization

## Documentation

- [Backend API Documentation](backend/README.md)
- [iOS App Documentation](ios-app/README.md)
- [Setup Guide](docs/SETUP_GUIDE.md)
- [Product Requirements](docs/PRD.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DB_SCHEMA.md)

## Security Notes

- All API keys and secrets are stored in `.env` files
- `.env` files are excluded from version control
- LINE OAuth flow uses PKCE for security
- Database uses foreign key constraints for data integrity
- Duplicate slip detection via UNIQUE constraint

## Development Status

- **Backend**: ✅ Complete
- **iOS App**: ✅ Complete (Phase 1)
- **Database**: ✅ Complete (migrations ready)
- **LINE Bot**: ⏳ Planned (Phase 2)
- **LIFF App**: ⏳ Planned (Phase 2)

## License

This project is part of the Expense Tracker System development initiative.

## Support

For issues or questions, please refer to the documentation in the `docs/` directory or contact the development team.
