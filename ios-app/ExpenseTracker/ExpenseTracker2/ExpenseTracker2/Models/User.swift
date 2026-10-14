import Foundation

struct User: Codable, Identifiable {
    let lineUserId: String
    let displayName: String
    let pictureUrl: String?
    let billingCycleStartDay: Int
    let createdAt: String
    
    var id: String {
        lineUserId
    }
    
    enum CodingKeys: String, CodingKey {
        case lineUserId = "line_user_id"
        case displayName = "display_name"
        case pictureUrl = "picture_url"
        case billingCycleStartDay = "billing_cycle_start_day"
        case createdAt = "created_at"
    }
}
