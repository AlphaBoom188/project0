import Foundation

struct Category: Codable, Identifiable {
    let id: String
    let lineUserId: String
    let name: String
    let type: String
    let budgetAmount: Double?
    let budgetPeriod: String?
    let isPreset: Bool
    let createdAt: String
    
    enum CodingKeys: String, CodingKey {
        case id
        case lineUserId = "line_user_id"
        case name
        case type
        case budgetAmount = "budget_amount"
        case budgetPeriod = "budget_period"
        case isPreset = "is_preset"
        case createdAt = "created_at"
    }
}
