import SwiftUI

struct DashboardView: View {
    @StateObject private var viewModel = DashboardViewModel()
    @StateObject private var authService = LINEAuthService.shared
    @State private var showingAddTransaction = false
    
    var body: some View {
        NavigationView {
            ZStack {
                if viewModel.isLoading {
                    ProgressView("Loading...")
                } else if let errorMessage = viewModel.errorMessage {
                    VStack {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.largeTitle)
                            .foregroundColor(.orange)
                        Text(errorMessage)
                            .foregroundColor(.secondary)
                        Button("Retry") {
                            viewModel.refresh()
                        }
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                } else {
                    ScrollView {
                        VStack(spacing: 20) {
                            summaryCards
                            categoryBreakdown
                            recentTransactions
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Dashboard")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        authService.logout()
                    }) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {
                        showingAddTransaction = true
                    }) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                    }
                }
            }
            .sheet(isPresented: $showingAddTransaction) {
                AddTransactionView()
                    .onDisappear {
                        viewModel.refresh()
                    }
            }
            .refreshable {
                viewModel.refresh()
            }
        }
    }
    
    private var summaryCards: some View {
        HStack(spacing: 15) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Income")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(String(format: "%.2f", viewModel.totalIncome))
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.green)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.green.opacity(0.1))
            .cornerRadius(12)
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Expense")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(String(format: "%.2f", viewModel.totalExpense))
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.red)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.red.opacity(0.1))
            .cornerRadius(12)
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Balance")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(String(format: "%.2f", viewModel.totalIncome - viewModel.totalExpense))
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(viewModel.totalIncome >= viewModel.totalExpense ? .blue : .red)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.blue.opacity(0.1))
            .cornerRadius(12)
        }
    }
    
    private var categoryBreakdown: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Category Breakdown")
                .font(.headline)
            
            if viewModel.summary.isEmpty {
                Text("No transactions yet")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding()
            } else {
                ForEach(viewModel.summary) { item in
                    CategorySummaryRow(summary: item)
                }
            }
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(12)
    }
    
    private var recentTransactions: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Recent Transactions")
                .font(.headline)
            
            if viewModel.transactions.isEmpty {
                Text("No transactions yet")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding()
            } else {
                ForEach(viewModel.transactions.prefix(5)) { transaction in
                    TransactionRow(transaction: transaction)
                }
                
                if viewModel.transactions.count > 5 {
                    NavigationLink(destination: TransactionListView()) {
                        Text("View All")
                            .font(.caption)
                            .foregroundColor(.blue)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(12)
    }
}

struct CategorySummaryRow: View {
    let summary: TransactionSummary
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(summary.categoryName)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text("\(summary.count) transactions")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            Text(String(format: "%.2f", summary.totalAmount))
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(summary.type == "income" ? .green : .red)
        }
        .padding(.vertical, 8)
    }
}

struct TransactionRow: View {
    let transaction: Transaction
    
    var body: some View {
        HStack {
            if let thumbnailUrl = transaction.thumbnailUrl, let url = URL(string: thumbnailUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    Color(.systemGray5)
                }
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(transaction.categories?.name ?? "Uncategorized")
                    .font(.subheadline)
                    .fontWeight(.medium)
                if let description = transaction.description {
                    Text(description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Text(formatDate(transaction.transactionDate))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Text(String(format: "%.2f", transaction.amount))
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(transaction.type == "income" ? .green : .red)
        }
        .padding(.vertical, 8)
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: dateString) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .short
            displayFormatter.timeStyle = .none
            return displayFormatter.string(from: date)
        }
        return dateString
    }
}

#Preview {
    DashboardView()
}
