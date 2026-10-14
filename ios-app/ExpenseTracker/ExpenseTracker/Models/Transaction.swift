import Foundation

struct Transaction: Codable, Identifiable {
    let id: String
    let lineUserId: String
    let categoryId: String
    let amount: Double
    let type: String
    let description: String?
    let slipHash: String?
    let thumbnailUrl: String?
    let transactionDate: String
    let createdAt: String
    let categories: Category?
    
    enum CodingKeys: String, CodingKey {
        case id
        case lineUserId = "line_user_id"
        case categoryId = "category_id"
        case amount
        case type
        case description
        case slipHash = "slip_hash"
        case thumbnailUrl = "thumbnail_url"
        case transactionDate = "transaction_date"
        case createdAt = "created_at"
        case categories
    }
}

struct TransactionSummary: Codable, Identifiable {
    let categoryId: String?
    let categoryName: String
    let totalAmount: Double
    let count: Int
    let type: String
    
    var id: String {
        categoryName
    }
    
    enum CodingKeys: String, CodingKey {
        case categoryId = "category_id"
        case categoryName = "category_name"
        case totalAmount = "total_amount"
        case count
        case type
    }
}
