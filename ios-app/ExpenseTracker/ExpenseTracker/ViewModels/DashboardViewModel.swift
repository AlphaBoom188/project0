import Foundation
import Combine

class DashboardViewModel: ObservableObject {
    @Published var transactions: [Transaction] = []
    @Published var summary: [TransactionSummary] = []
    @Published var totalIncome: Double = 0
    @Published var totalExpense: Double = 0
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let apiService = APIService.shared
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        loadData()
    }
    
    func loadData() {
        guard let user = LINEAuthService.shared.currentUser else {
            errorMessage = "User not logged in"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        let (startDate, endDate) = getDateRange()
        
        apiService.getTransactions(
            lineUserId: user.lineUserId,
            startDate: startDate,
            endDate: endDate
        ) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let response):
                    self?.transactions = response.transactions
                    self?.calculateTotals()
                case .failure(let error):
                    self?.errorMessage = error.localizedDescription
                }
            }
        }
        
        apiService.getTransactionSummary(
            lineUserId: user.lineUserId,
            startDate: startDate,
            endDate: endDate
        ) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let response):
                    self?.summary = response.summary
                case .failure(let error):
                    print("Error fetching summary: \(error)")
                }
            }
        }
    }
    
    private func calculateTotals() {
        totalIncome = transactions.filter { $0.type == "income" }.reduce(0) { $0 + $1.amount }
        totalExpense = transactions.filter { $0.type == "expense" }.reduce(0) { $0 + $1.amount }
    }
    
    private func getDateRange() -> (String, String) {
        let calendar = Calendar.current
        let now = Date()
        
        guard let user = LINEAuthService.shared.currentUser else {
            return ("", "")
        }
        
        let billingDay = user.billingCycleStartDay
        
        var components = calendar.dateComponents([.year, .month], from: now)
        components.day = billingDay
        let startDate = calendar.date(from: components) ?? now
        
        var endComponents = calendar.dateComponents([.year, .month], from: startDate)
        endComponents.month = (endComponents.month ?? 0) + 1
        let endDate = calendar.date(from: endComponents) ?? now
        
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        return (formatter.string(from: startDate), formatter.string(from: endDate))
    }
    
    func refresh() {
        loadData()
    }
}
