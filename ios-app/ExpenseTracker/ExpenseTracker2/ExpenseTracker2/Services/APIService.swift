import Foundation

class APIService {
    static let shared = APIService()
    
    private let baseURL = "http://localhost:3000/api"
    private let session = URLSession.shared
    
    private init() {}
    
    private func performRequest<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        completion: @escaping (Result<T, Error>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            completion(.failure(APIError.invalidURL))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let body = body {
            request.httpBody = body
        }
        
        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(APIError.invalidResponse))
                return
            }
            
            guard 200..<300 ~= httpResponse.statusCode else {
                completion(.failure(APIError.httpError(httpResponse.statusCode)))
                return
            }
            
            guard let data = data else {
                completion(.failure(APIError.noData))
                return
            }
            
            do {
                let decoded = try JSONDecoder().decode(T.self, from: data)
                completion(.success(decoded))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
    
    func createOrUpdateUser(lineUserId: String, displayName: String, pictureUrl: String?, completion: @escaping (Result<UserResponse, Error>) -> Void) {
        let body = ["line_user_id": lineUserId, "display_name": displayName, "picture_url": pictureUrl ?? ""] as [String: Any]
        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            completion(.failure(APIError.encodingError))
            return
        }
        performRequest(endpoint: "/users", method: "POST", body: jsonData, completion: completion)
    }
    
    func getUser(lineUserId: String, completion: @escaping (Result<UserResponse, Error>) -> Void) {
        performRequest(endpoint: "/users/\(lineUserId)", completion: completion)
    }
    
    func getCategories(lineUserId: String, type: String? = nil, completion: @escaping (Result<CategoriesResponse, Error>) -> Void) {
        var endpoint = "/categories/\(lineUserId)"
        if let type = type { endpoint += "?type=\(type)" }
        performRequest(endpoint: endpoint, completion: completion)
    }
    
    func createCategory(lineUserId: String, name: String, type: String, budgetAmount: Double? = nil, budgetPeriod: String? = nil, completion: @escaping (Result<CategoryResponse, Error>) -> Void) {
        var body: [String: Any] = ["name": name, "type": type]
        if let budgetAmount = budgetAmount { body["budget_amount"] = budgetAmount }
        if let budgetPeriod = budgetPeriod { body["budget_period"] = budgetPeriod }
        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            completion(.failure(APIError.encodingError))
            return
        }
        performRequest(endpoint: "/categories/\(lineUserId)", method: "POST", body: jsonData, completion: completion)
    }
    
    func getTransactions(lineUserId: String, type: String? = nil, startDate: String? = nil, endDate: String? = nil, limit: Int = 50, offset: Int = 0, completion: @escaping (Result<TransactionsResponse, Error>) -> Void) {
        var endpoint = "/transactions/\(lineUserId)?limit=\(limit)&offset=\(offset)"
        if let type = type { endpoint += "&type=\(type)" }
        if let startDate = startDate { endpoint += "&start_date=\(startDate)" }
        if let endDate = endDate { endpoint += "&end_date=\(endDate)" }
        performRequest(endpoint: endpoint, completion: completion)
    }
    
    func createTransaction(lineUserId: String, categoryId: String, amount: Double, type: String, description: String? = nil, slipHash: String? = nil, transactionDate: String, completion: @escaping (Result<TransactionResponse, Error>) -> Void) {
        var body: [String: Any] = ["category_id": categoryId, "amount": amount, "type": type, "transaction_date": transactionDate]
        if let description = description { body["description"] = description }
        if let slipHash = slipHash { body["slip_hash"] = slipHash }
        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            completion(.failure(APIError.encodingError))
            return
        }
        performRequest(endpoint: "/transactions/\(lineUserId)", method: "POST", body: jsonData, completion: completion)
    }

    func scanReceipt(lineUserId: String, imageBase64: String, slipHash: String, completion: @escaping (Result<OCRScanResponse, Error>) -> Void) {
        let body: [String: Any] = ["image_base64": imageBase64, "slip_hash": slipHash]
        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            completion(.failure(APIError.encodingError))
            return
        }
        performRequest(endpoint: "/ocr/scan/\(lineUserId)", method: "POST", body: jsonData, completion: completion)
    }
    
    func deleteTransaction(lineUserId: String, transactionId: String, completion: @escaping (Result<DeleteResponse, Error>) -> Void) {
        performRequest(endpoint: "/transactions/\(lineUserId)/\(transactionId)", method: "DELETE", completion: completion)
    }
    
    func getTransactionSummary(lineUserId: String, startDate: String, endDate: String, type: String? = nil, completion: @escaping (Result<SummaryResponse, Error>) -> Void) {
        var endpoint = "/transactions/\(lineUserId)/summary?start_date=\(startDate)&end_date=\(endDate)"
        if let type = type { endpoint += "&type=\(type)" }
        performRequest(endpoint: endpoint, completion: completion)
    }
}

struct UserResponse: Codable { let success: Bool; let user: User }
struct CategoriesResponse: Codable { let success: Bool; let categories: [Category] }
struct CategoryResponse: Codable { let success: Bool; let category: Category }
struct TransactionsResponse: Codable { let success: Bool; let transactions: [Transaction] }
struct TransactionResponse: Codable { let success: Bool; let transaction: Transaction }
struct SummaryResponse: Codable { let success: Bool; let summary: [TransactionSummary] }
struct DeleteResponse: Codable { let success: Bool; let message: String }
struct OCRScanResponse: Codable { let success: Bool; let duplicate: Bool?; let message: String?; let data: OCRData? }
struct OCRData: Codable {
    let amount: Double?
    let date: String?
    let merchant: String?
    let suggestedCategoryId: String?
    let suggestedCategoryName: String?

    enum CodingKeys: String, CodingKey {
        case amount
        case date
        case merchant
        case suggestedCategoryId = "suggested_category_id"
        case suggestedCategoryName = "suggested_category_name"
    }
}

enum APIError: Error, LocalizedError {
    case invalidURL, invalidResponse, httpError(Int), noData, encodingError
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid response"
        case .httpError(let code): return "HTTP error: \(code)"
        case .noData: return "No data received"
        case .encodingError: return "Encoding error"
        }
    }
}
