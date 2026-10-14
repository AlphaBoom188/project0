import SwiftUI

@main
struct ExpenseTracker2App: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    LINEAuthService.shared.handleCallback(url: url)
                }
        }
    }
}
