import SwiftUI

struct ContentView: View {
    @StateObject private var authService = LINEAuthService.shared
    
    var body: some View {
        Group {
            if authService.isLoggedIn {
                DashboardView()
            } else {
                LoginView()
            }
        }
    }
}

#Preview {
    ContentView()
}
