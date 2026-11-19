# Expense Tracker iOS App

SwiftUI client for the Expense Tracker backend. The LINE MINI App (`liff-app/`) is the main client; this app covers LINE Login, the dashboard, transactions and receipt scanning.

The project is **`ExpenseTracker/ExpenseTracker2/ExpenseTracker2.xcodeproj`** (it uses synced folders, so new files under `ExpenseTracker2/` are included automatically).

```bash
cd ExpenseTracker/ExpenseTracker2
open ExpenseTracker2.xcodeproj
# or
xcodebuild -project ExpenseTracker2.xcodeproj -scheme ExpenseTracker2 -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

- **Bundle ID** `com.expensetracker.app`; **URL scheme** `com.expensetracker.app://line/callback`; LINE Login channel `2011983707`.
- **Backend URL** `http://localhost:3000/api` in `Services/APIService.swift` and `Services/LINEAuthService.swift`. On a physical device, use your Mac's IP address.
- **Auth:** login stores the LINE access token from the backend's `/api/line/callback` in the Keychain (`Services/KeychainStore.swift`), and every API request sends it as `Authorization: Bearer`. A 401 logs out.

Layout: `Models/`, `Services/` (API, LINE auth, Keychain), `ViewModels/`, `Views/` (Login, Dashboard, Add Transaction with receipt scan, Transaction list, `Components/ImagePicker`).
