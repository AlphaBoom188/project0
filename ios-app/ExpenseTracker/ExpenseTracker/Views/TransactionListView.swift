import SwiftUI

struct TransactionListView: View {
    @StateObject private var viewModel = TransactionListViewModel()
    
    var body: some View {
        List {
            ForEach(viewModel.transactions) { transaction in
                TransactionRow(transaction: transaction)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            viewModel.deleteTransaction(transaction)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
        .navigationTitle("All Transactions")
        .navigationBarTitleDisplayMode(.large)
        .onAppear {
            viewModel.loadTransactions()
        }
        .refreshable {
            viewModel.loadTransactions()
        }
    }
}

class TransactionListViewModel: ObservableObject {
    @Published var transactions: [Transaction] = []
    @Published var isLoading = false
    
    private let apiService = APIService.shared
    
    func loadTransactions() {
        guard let user = LINEAuthService.shared.currentUser else { return }
        
        isLoading = true
        
        apiService.getTransactions(lineUserId: user.lineUserId) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let response):
                    self?.transactions = response.transactions
                case .failure(let error):
                    print("Error loading transactions: \(error)")
                }
            }
        }
    }
    
    func deleteTransaction(_ transaction: Transaction) {
        guard let user = LINEAuthService.shared.currentUser else { return }
        
        apiService.deleteTransaction(lineUserId: user.lineUserId, transactionId: transaction.id) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    self?.loadTransactions()
                case .failure(let error):
                    print("Error deleting transaction: \(error)")
                }
            }
        }
    }
}

#Preview {
    NavigationView {
        TransactionListView()
    }
}
