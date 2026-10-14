import SwiftUI
import Combine

struct AddTransactionView: View {
    @Environment(\.dismiss) var dismiss
    @StateObject private var viewModel = AddTransactionViewModel()
    
    var body: some View {
        NavigationView {
            Form {
                Section {
                    Picker("Type", selection: $viewModel.type) {
                        Text("Expense").tag("expense")
                        Text("Income").tag("income")
                    }
                    .pickerStyle(.segmented)
                }
                
                Section {
                    Picker("Category", selection: $viewModel.selectedCategoryId) {
                        Text("Select Category").tag("")
                        ForEach(viewModel.categories) { category in
                            Text(category.name).tag(category.id)
                        }
                    }
                    
                    TextField("Amount", value: $viewModel.amount, format: .number)
                        .keyboardType(.decimalPad)
                    
                    TextField("Description", text: $viewModel.description)
                }
                
                Section {
                    DatePicker("Date", selection: $viewModel.transactionDate, displayedComponents: .date)
                }
                
                Section {
                    Button(action: {
                        viewModel.saveTransaction()
                        dismiss()
                    }) {
                        Text("Save Transaction")
                            .frame(maxWidth: .infinity)
                            .foregroundColor(.white)
                    }
                    .listRowBackground(Color.blue)
                    .disabled(viewModel.selectedCategoryId.isEmpty || viewModel.amount <= 0)
                }
            }
            .navigationTitle("Add Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                viewModel.loadCategories()
            }
        }
    }
}

class AddTransactionViewModel: ObservableObject {
    @Published var type = "expense"
    @Published var categories: [Category] = []
    @Published var selectedCategoryId = ""
    @Published var amount: Double = 0
    @Published var description = ""
    @Published var transactionDate = Date()
    
    private let apiService = APIService.shared
    
    func loadCategories() {
        guard let user = LINEAuthService.shared.currentUser else { return }
        
        apiService.getCategories(lineUserId: user.lineUserId, type: type) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let response):
                    self.categories = response.categories
                case .failure(let error):
                    print("Error loading categories: \(error)")
                }
            }
        }
    }
    
    func saveTransaction() {
        guard let user = LINEAuthService.shared.currentUser else { return }
        
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let dateString = formatter.string(from: transactionDate)
        
        apiService.createTransaction(
            lineUserId: user.lineUserId,
            categoryId: selectedCategoryId,
            amount: amount,
            type: type,
            description: description.isEmpty ? nil : description,
            transactionDate: dateString
        ) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    print("Transaction saved successfully")
                case .failure(let error):
                    print("Error saving transaction: \(error)")
                }
            }
        }
    }
}

#Preview {
    AddTransactionView()
}
