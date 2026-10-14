import SwiftUI

struct LoginView: View {
    @StateObject private var authService = LINEAuthService.shared
    
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                Spacer()
                
                VStack(spacing: 10) {
                    Image(systemName: "line.3.horizontal.circle.fill")
                        .font(.system(size: 80))
                        .foregroundColor(.green)
                    
                    Text("Expense Tracker")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("Track your expenses with LINE")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                Button(action: {
                    authService.login()
                }) {
                    HStack {
                        Image(systemName: "message.fill")
                            .font(.title3)
                        Text("Login with LINE")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .padding(.horizontal, 40)
                
                Spacer()
                
                Text("Version 1.0")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .navigationBarHidden(true)
            .onReceive(authService.$isLoggedIn) { isLoggedIn in
                if isLoggedIn {
                }
            }
        }
    }
}

#Preview {
    LoginView()
}
