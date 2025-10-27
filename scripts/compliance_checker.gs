function main() {
  var accountIterator = MccApp.accounts().get();
  while (accountIterator.hasNext()) {
    var account = accountIterator.next();
    MccApp.select(account);
    runComplianceCheck();
  }
}

function runComplianceCheck() {
  // Allowed locations for iGaming advertising
  var allowedLocations = ['Spain', 'United Kingdom', 'Germany'];
  var allowedAgeRanges = ['AGE_RANGE_18_24','AGE_RANGE_25_34','AGE_RANGE_35_44','AGE_RANGE_45_54','AGE_RANGE_55_64','AGE_RANGE_65_UP'];
  var campaigns = AdsApp.campaigns().get();
  while (campaigns.hasNext()) {
    var campaign = campaigns.next();
    // Check targeted locations
    var locIterator = campaign.targeting().targetedLocations().get();
    while (locIterator.hasNext()) {
      var loc = locIterator.next();
      if (allowedLocations.indexOf(loc.getName()) === -1) {
        Logger.log('[' + AdsApp.currentAccount().getCustomerId() + '] Campaign ' + campaign.getName() + ' targets disallowed location: ' + loc.getName());
      }
    }
    // Check age targeting to ensure no minors
    var ageIterator = campaign.targeting().ages().get();
    while (ageIterator.hasNext()) {
      var ageTarget = ageIterator.next();
      if (allowedAgeRanges.indexOf(ageTarget.getAgeRange()) === -1) {
        Logger.log('[' + AdsApp.currentAccount().getCustomerId() + '] Campaign ' + campaign.getName() + ' has age targeting that may include minors.');
      }
    }
  }
  Logger.log('[' + AdsApp.currentAccount().getCustomerId() + '] Compliance check complete.');
}
