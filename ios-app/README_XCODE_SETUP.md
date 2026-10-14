# Xcode Project Setup Instructions

All source files have been created. Since Xcode project files are complex to generate manually, please follow these steps to create the project in Xcode:

## Step 1: Create New Xcode Project

1. Open Xcode
2. Select "Create a new Xcode project"
3. Choose **iOS** → **App**
4. Click "Next"
5. Configure:
   - **Product Name**: ExpenseTracker
   - **Team**: Select your team (or None for development)
   - **Organization Identifier**: com.expensetracker
   - **Bundle Identifier**: com.expensetracker.app
   - **Interface**: SwiftUI
   - **Language**: Swift
   - **Storage**: None
   - **Include Tests**: Unchecked (optional)
6. Click "Next"
7. Save to: `/Users/boom/devin/project0/ios-app/ExpenseTracker`
8. Click "Create"

## Step 2: Set Up Project Structure

After creating the project, organize the files:

1. In Xcode, right-click on the `ExpenseTracker` folder in the navigator
2. Select "New Group" and create these groups:
   - `Models`
   - `Services`
   - `ViewModels`
   - `Views`

## Step 3: Add Source Files

All source files are located in `/Users/boom/devin/project0/ios-app/ExpenseTracker/ExpenseTracker/`:

### Files to Add:
- **ExpenseTracker/**: ExpenseTrackerApp.swift, ContentView.swift
- **Models/**: User.swift, Category.swift, Transaction.swift
- **Services/**: APIService.swift, LINEAuthService.swift
- **ViewModels/**: DashboardViewModel.swift
- **Views/**: LoginView.swift, DashboardView.swift, AddTransactionView.swift, TransactionListView.swift

### How to Add (Drag and Drop - Recommended):
1. In Finder, navigate to `/Users/boom/devin/project0/ios-app/ExpenseTracker/ExpenseTracker/`
2. In Xcode, drag the `Models`, `Services`, `ViewModels`, and `Views` folders into the Xcode project navigator
3. In the dialog that appears:
   - Check "Copy items if needed"
   - Select "Create groups"
   - Ensure your ExpenseTracker target is checked
4. Click "Finish"

5. Also drag `ExpenseTrackerApp.swift` and `ContentView.swift` into the main ExpenseTracker folder

## Step 4: Configure Info.plist

1. Select your project in the navigator
2. Select the ExpenseTracker target
3. Go to the "Info" tab
4. Under "URL Types", add:
   - **Identifier**: com.expensetracker.app
   - **URL Schemes**: com.expensetracker.app

## Step 5: Build and Run

1. Select a simulator (iPhone 15 Pro recommended)
2. Press `Cmd + R` or click the Run button
3. The app should build and launch

## Step 6: Verify Backend Connection

Ensure the backend is running:
```bash
cd /Users/boom/devin/project0/backend
npm start
```

The app will try to connect to `http://localhost:3000/api`.

## Troubleshooting

### Build Errors
- If you see "No such module" errors, ensure all files are added to the target
- Check that the Swift files are in the correct groups

### Simulator Issues
- If the app can't connect to the backend, use your Mac's IP address instead of localhost
- Update `baseURL` in `APIService.swift` to use your Mac's IP

### Missing Files
All source files are located in:
- `/Users/boom/devin/project0/ios-app/ExpenseTracker/ExpenseTracker/Models/`
- `/Users/boom/devin/project0/ios-app/ExpenseTracker/ExpenseTracker/Services/`
- `/Users/boom/devin/project0/ios-app/ExpenseTracker/ExpenseTracker/ViewModels/`
- `/Users/boom/devin/project0/ios-app/ExpenseTracker/ExpenseTracker/Views/`
