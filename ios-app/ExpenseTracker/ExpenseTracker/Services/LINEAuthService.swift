import Foundation
import AuthenticationServices

class LINEAuthService: NSObject, ObservableObject {
    static let shared = LINEAuthService()
    
    @Published var isLoggedIn = false
    @Published var currentUser: User?
    
    private let channelId = "2011983707"
    private let redirectURI = "com.expensetracker.app://line/callback"
    
    private override init() {
        super.init()
        loadSession()
    }
    
    func login() {
        let state = UUID().uuidString
        let loginURL = generateLoginURL(state: state)
        
        if let url = URL(string: loginURL) {
            UIApplication.shared.open(url, options: [:]) { success in
                if !success {
                    print("Failed to open LINE Login URL")
                }
            }
        }
    }
    
    private func generateLoginURL(state: String) -> String {
        let baseURL = "https://access.line.me/oauth2/v2.1/authorize"
        let responseType = "code"
        let scope = "profile openid email"
        let nonce = UUID().uuidString
        
        var components = URLComponents(string: baseURL)!
        components.queryItems = [
            URLQueryItem(name: "response_type", value: responseType),
            URLQueryItem(name: "client_id", value: channelId),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "scope", value: scope),
            URLQueryItem(name: "nonce", value: nonce)
        ]
        
        return components.url?.absoluteString ?? ""
    }
    
    func handleCallback(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            print("Invalid callback URL")
            return
        }
        
        guard let code = queryItems.first(where: { $0.name == "code" })?.value else {
            print("No authorization code in callback")
            return
        }
        
        exchangeCodeForToken(code: code)
    }
    
    private func exchangeCodeForToken(code: String) {
        let backendURL = "http://localhost:3000/api/line/callback?code=\(code)"
        
        guard let url = URL(string: backendURL) else { return }
        
        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            guard let self = self else { return }
            
            if let error = error {
                print("Token exchange error: \(error)")
                return
            }
            
            guard let data = data else { return }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let success = json["success"] as? Bool,
                   success,
                   let userDict = json["user"] as? [String: Any] {
                    
                    let userData = try JSONSerialization.data(withJSONObject: userDict)
                    let user = try JSONDecoder().decode(User.self, from: userData)
                    
                    DispatchQueue.main.async {
                        self.currentUser = user
                        self.isLoggedIn = true
                        self.saveSession(user: user)
                    }
                }
            } catch {
                print("Error parsing user data: \(error)")
            }
        }.resume()
    }
    
    private func saveSession(user: User) {
        if let encoded = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(encoded, forKey: "currentUser")
            UserDefaults.standard.set(true, forKey: "isLoggedIn")
        }
    }
    
    private func loadSession() {
        if let data = UserDefaults.standard.data(forKey: "currentUser"),
           let user = try? JSONDecoder().decode(User.self, from: data) {
            self.currentUser = user
            self.isLoggedIn = UserDefaults.standard.bool(forKey: "isLoggedIn")
        }
    }
    
    func logout() {
        currentUser = nil
        isLoggedIn = false
        UserDefaults.standard.removeObject(forKey: "currentUser")
        UserDefaults.standard.set(false, forKey: "isLoggedIn")
    }
}
