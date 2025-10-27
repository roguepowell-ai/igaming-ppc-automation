function main() {
  // Fraud detection report for Google Ads iGaming campaigns.
  // This script flags IP addresses and placements with unusual click patterns or high click rates but low conversions.
  var thresholdClicks = 20;
  var thresholdCtr = 0.5;
  var report = AdsApp.report(
    "SELECT CampaignName, AdGroupName, Criteria, Clicks, Impressions, Conversions, Cost " +
    "FROM SEARCH_QUERY_PERFORMANCE_REPORT " +
    "DURING LAST_7_DAYS");
  var rows = report.rows();
  var flagged = [];
  while (rows.hasNext()) {
    var row = rows.next();
    var clicks = parseInt(row['Clicks']);
    var impressions = parseInt(row['Impressions']);
    var conversions = parseInt(row['Conversions']);
    var ctr = impressions > 0 ? clicks / impressions : 0;
    if (clicks > thresholdClicks && conversions == 0) {
      flagged.push(row['Criteria']);
    }
    if (ctr > thresholdCtr && conversions == 0) {
      flagged.push(row['Criteria']);
    }
  }
  Logger.log('Flagged search terms for potential fraud/compliance review: ' + flagged.join(', '));
}
