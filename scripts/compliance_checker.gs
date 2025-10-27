function main() {
  // Compliance checker for iGaming campaigns.
  // Reviews campaigns to ensure targeting only approved countries and age restrictions.
  var allowedLocations = ['Spain', 'United Kingdom', 'Germany'];
  var campaigns = AdsApp.campaigns().get();
  while (campaigns.hasNext()) {
    var campaign = campaigns.next();
    var locIterator = campaign.targeting().targetedLocations().get();
    while (locIterator.hasNext()) {
      var loc = locIterator.next();
      if (allowedLocations.indexOf(loc.getName()) === -1) {
        Logger.log('Campaign ' + campaign.getName() + ' targets disallowed location: ' + loc.getName());
      }
    }
    // Check age targeting to ensure no minors
    var ageIterator = campaign.targeting().ages().get();
    while (ageIterator.hasNext()) {
      var ageTarget = ageIterator.next();
      if (ageTarget.getAgeRange() == 'AGE_RANGE_18_24' || ageTarget.getAgeRange() == 'AGE_RANGE_25_34' || ageTarget.getAgeRange() == 'AGE_RANGE_35_44' || ageTarget.getAgeRange() == 'AGE_RANGE_45_54' || ageTarget.getAgeRange() == 'AGE_RANGE_55_64' || ageTarget.getAgeRange() == 'AGE_RANGE_65_UP') {
        continue; // allowed age ranges
      } else {
        Logger.log('Campaign ' + campaign.getName() + ' has age targeting that may include minors.');
      }
    }
  }
  Logger.log('Compliance check complete.');
}
