function main() {
  var accountIterator = MccApp.accounts().get();
  while (accountIterator.hasNext()) {
    var account = accountIterator.next();
    MccApp.select(account);
    runReporting();
  }
}

function runReporting() {
  // Daily reporting dashboard script for iGaming campaigns across accounts.
  var spreadsheetUrl = 'YOUR_SPREADSHEET_URL_HERE';
  var sheet = SpreadsheetApp.openByUrl(spreadsheetUrl).getActiveSheet();
  var stats = AdsApp.currentAccount().getStatsFor('YESTERDAY');
  var date = new Date();
  sheet.appendRow([
    AdsApp.currentAccount().getCustomerId(),
    Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    stats.getImpressions(),
    stats.getClicks(),
    stats.getConversions(),
    stats.getCost(),
    stats.getAverageCpc(),
    stats.getConversionValue(),
    stats.getConversions() > 0 ? stats.getCost() / stats.getConversions() : 0
  ]);
  Logger.log('Appended metrics for account ' + AdsApp.currentAccount().getCustomerId());
}
