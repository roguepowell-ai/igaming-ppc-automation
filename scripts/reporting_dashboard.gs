function main() {
  // Daily reporting dashboard script for iGaming campaigns.
  // Records daily performance metrics to a Google Sheet for dashboarding.
  var spreadsheetUrl = 'YOUR_SPREADSHEET_URL_HERE';
  var sheet = SpreadsheetApp.openByUrl(spreadsheetUrl).getActiveSheet();
  var stats = AdsApp.currentAccount().getStatsFor('YESTERDAY');
  var date = new Date();
  sheet.appendRow([
    Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    stats.getImpressions(),
    stats.getClicks(),
    stats.getConversions(),
    stats.getCost(),
    stats.getAverageCpc(),
    stats.getConversionValue(),
    stats.getConversions() > 0 ? stats.getCost() / stats.getConversions() : 0
  ]);
  Logger.log('Daily metrics appended for ' + date);
}
