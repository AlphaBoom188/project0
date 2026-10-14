import SwiftUI
import Combine
import UIKit
import CryptoKit

struct AddTransactionView: View {
    @Environment(\.dismiss) var dismiss
    @StateObject private var viewModel = AddTransactionViewModel()
    @State private var showingSourceDialog = false
    @State private var activeImageSource: ImagePicker.Source?

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

                Section("Receipt") {
                    if let image = viewModel.receiptImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 180)
                            .frame(maxWidth: .infinity)
                            .cornerRadius(8)
                    }

                    if viewModel.isScanning {
                        HStack {
                            ProgressView()
                            Text("Scanning receipt...")
                                .foregroundColor(.secondary)
                        }
                    } else {
                        Button(action: { showingSourceDialog = true }) {
                            Label(viewModel.receiptImage == nil ? "Scan Receipt" : "Rescan Receipt", systemImage: "camera.viewfinder")
                        }
                    }

                    if let scanError = viewModel.scanError {
                        Text(scanError)
                            .foregroundColor(viewModel.isDuplicate ? .orange : .red)
                            .font(.footnote)
                    }
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
                        viewModel.saveTransaction { success in
                            if success {
                                dismiss()
                            }
                        }
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
            .confirmationDialog("Add Receipt", isPresented: $showingSourceDialog, titleVisibility: .visible) {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button("Take Photo") { activeImageSource = .camera }
                }
                Button("Choose from Library") { activeImageSource = .photoLibrary }
                Button("Cancel", role: .cancel) {}
            }
            .sheet(item: $activeImageSource) { source in
                ImagePicker(source: source) { image in
                    viewModel.handlePickedImage(image)
                }
            }
            .alert("Couldn't Save Transaction", isPresented: $viewModel.showSaveError, presenting: viewModel.saveError) { _ in
                Button("OK", role: .cancel) {}
            } message: { message in
                Text(message)
            }
        }
    }
}

extension ImagePicker.Source: Identifiable {
    var id: Self { self }
}

class AddTransactionViewModel: ObservableObject {
    @Published var type = "expense"
    @Published var categories: [Category] = []
    @Published var selectedCategoryId = ""
    @Published var amount: Double = 0
    @Published var description = ""
    @Published var transactionDate = Date()

    @Published var receiptImage: UIImage?
    @Published var isScanning = false
    @Published var scanError: String?
    @Published var isDuplicate = false

    @Published var saveError: String?
    @Published var showSaveError = false

    private var slipHash: String?
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

    func handlePickedImage(_ image: UIImage) {
        receiptImage = image
        scanReceipt(image: image)
    }

    private func resizedJPEGData(from image: UIImage, maxDimension: CGFloat = 1280, quality: CGFloat = 0.7) -> Data? {
        let size = image.size
        let scale = min(1, maxDimension / max(size.width, size.height))
        let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: targetSize)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
        return resized.jpegData(compressionQuality: quality)
    }

    func scanReceipt(image: UIImage) {
        guard let user = LINEAuthService.shared.currentUser else { return }
        guard let jpegData = resizedJPEGData(from: image) else {
            scanError = "Could not process this image."
            return
        }

        let hash = SHA256.hash(data: jpegData).compactMap { String(format: "%02x", $0) }.joined()
        slipHash = hash
        isScanning = true
        scanError = nil
        isDuplicate = false

        apiService.scanReceipt(lineUserId: user.lineUserId, imageBase64: jpegData.base64EncodedString(), slipHash: hash) { [weak self] result in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isScanning = false

                switch result {
                case .success(let response):
                    guard let data = response.data else { return }
                    if let amount = data.amount {
                        self.amount = amount
                    }
                    if let dateString = data.date, let date = self.parseDate(dateString) {
                        self.transactionDate = date
                    }
                    if let merchant = data.merchant, !merchant.isEmpty {
                        self.description = merchant
                    }
                    if let categoryId = data.suggestedCategoryId {
                        self.selectedCategoryId = categoryId
                    }
                case .failure(let error):
                    if case APIError.httpError(409) = error {
                        self.isDuplicate = true
                        self.scanError = "This receipt has already been recorded."
                    } else {
                        self.scanError = "Couldn't read this receipt: \(error.localizedDescription)"
                    }
                }
            }
        }
    }

    private func parseDate(_ string: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.date(from: string)
    }

    func saveTransaction(completion: @escaping (Bool) -> Void) {
        guard let user = LINEAuthService.shared.currentUser else {
            completion(false)
            return
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let dateString = formatter.string(from: transactionDate)

        apiService.createTransaction(
            lineUserId: user.lineUserId,
            categoryId: selectedCategoryId,
            amount: amount,
            type: type,
            description: description.isEmpty ? nil : description,
            slipHash: slipHash,
            transactionDate: dateString
        ) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    completion(true)
                case .failure(let error):
                    if case APIError.httpError(409) = error {
                        self.saveError = "This receipt has already been recorded."
                    } else {
                        self.saveError = error.localizedDescription
                    }
                    self.showSaveError = true
                    completion(false)
                }
            }
        }
    }
}

#Preview {
    AddTransactionView()
}
