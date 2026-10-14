# Expense Tracker iOS App

iOS application for the Expense Tracker System built with SwiftUI.

## Features

### Phase 1 Implementation
- **LINE Login Authentication**: Secure login using LINE OAuth
- **Dashboard View**: Displays income, expenses, and balance
- **Category Breakdown**: Shows spending by category
- **Transaction Management**: Add, view, and delete transactions
- **Billing Cycle Support**: Custom billing cycle based on user settings

## Architecture

The app follows MVVM architecture with SwiftUI:

```
ExpenseTracker/
├── ExpenseTracker/
│   ├── ExpenseTrackerApp.swift      # App entry point
│   ├── ContentView.swift            # Root view controller
│   ├── Info.plist                   # App configuration
│   ├── Models/                      # Data models
│   │   ├── User.swift
│   │   ├── Category.swift
│   │   └── Transaction.swift
│   ├── Services/                    # Network and auth services
│   │   ├── APIService.swift         # Backend API communication
│   │   └── LINEAuthService.swift    # LINE authentication
│   ├── ViewModels/                  # View models
│   │   └── DashboardViewModel.swift
│   └── Views/                       # SwiftUI views
│       ├── LoginView.swift
│       ├── DashboardView.swift
│       ├── AddTransactionView.swift
│       └── TransactionListView.swift
└── ExpenseTracker.xcodeproj/        # Xcode project
```

## Prerequisites

- macOS 14.0 or later
- Xcode 15.0 or later
- iOS 17.0 or later (deployment target)
- Backend API running on `http://localhost:3000`

## Setup Instructions

### 1. Open the Project

```bash
cd ios-app/ExpenseTracker
open ExpenseTracker.xcodeproj
```

### 2. Configure LINE Login

1. Go to [LINE Developers Console](https://developers.line.biz/console/)
2. Select your LINE Login channel (Channel ID: 2011983707)
3. Add your iOS app bundle identifier: `com.expensetracker.app`
4. Configure the callback URL scheme: `com.expensetracker.app://line/callback`
5. Update the Info.plist if needed (already configured)

### 3. Build and Run

1. Select a simulator or physical device from Xcode
2. Press `Cmd + R` or click the Run button
3. The app will launch and show the login screen

### 4. Backend Configuration

Ensure the backend API is running:
```bash
cd ../backend
npm start
```

The app is configured to connect to `http://localhost:3000/api`. For production, update the `baseURL` in `APIService.swift`.

## Key Features

### LINE Login Flow
1. User taps "Login with LINE"
2. Opens LINE app or Safari for authentication
3. Redirects back to app via custom URL scheme
4. Backend exchanges authorization code for user data
5. User session is saved locally

### Dashboard
- Shows total income, expenses, and balance for current billing cycle
- Category breakdown with spending summaries
- Recent transactions list
- Pull-to-refresh support

### Transaction Management
- Add new transactions with category selection
- View all transactions in a list
- Swipe to delete transactions
- Date picker for transaction date

## Environment Configuration

The app currently uses hardcoded backend URL for development. For production:

1. Create a configuration file or use environment variables
2. Update `APIService.swift` to use production URL
3. Add proper error handling and retry logic

## Testing

### Manual Testing

1. **Login Flow**
   - Tap "Login with LINE"
   - Complete LINE authentication
   - Verify user is logged in and redirected to dashboard

2. **Dashboard**
   - Verify income/expense/balance cards display correctly
   - Check category breakdown
   - Verify recent transactions list

3. **Add Transaction**
   - Tap "+" button
   - Select category
   - Enter amount and description
   - Save and verify it appears in dashboard

4. **Delete Transaction**
   - Navigate to transaction list
   - Swipe left on a transaction
   - Tap delete
   - Verify it's removed

## Known Limitations

1. **LINE SDK Integration**: Currently uses OAuth flow via web redirect. For production, integrate the official LINE SDK iOS framework.
2. **Error Handling**: Basic error handling implemented. Enhance with user-friendly error messages.
3. **Offline Support**: No offline caching. All data is fetched from backend.
4. **Image Upload**: Slip/OCR functionality not yet implemented (planned for future phases).

## Future Enhancements

- [ ] Integrate official LINE SDK iOS framework
- [ ] Add offline support with CoreData
- [ ] Implement slip scanning with OCR
- [ ] Add charts and graphs for spending visualization
- [ ] Budget tracking and alerts
- [ ] Export data to CSV/PDF
- [ ] Dark mode support
- [ ] iPad-optimized layout

## Troubleshooting

### Build Errors
- Ensure Xcode version is 15.0 or later
- Verify iOS deployment target is 17.0
- Check that all Swift files are included in the target

### Login Issues
- Verify LINE Login channel is configured correctly
- Check callback URL scheme matches in Info.plist
- Ensure backend is running and accessible

### API Connection Issues
- Verify backend is running on `http://localhost:3000`
- Check simulator can access localhost (use actual IP if testing on physical device)
- Review network permissions in Info.plist

## Contributing

When adding new features:
1. Create feature branch
2. Follow MVVM architecture
3. Add appropriate error handling
4. Test on both simulator and device
5. Update documentation

## License

This project is part of the Expense Tracker System.
