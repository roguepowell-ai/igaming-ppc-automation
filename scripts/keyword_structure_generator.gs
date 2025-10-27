function main() {
  var accountIterator = MccApp.accounts().get();
  while (accountIterator.hasNext()) {
    var account = accountIterator.next();
    MccApp.select(account);
    runKeywordStructure();
  }
}

function runKeywordStructure() {
  // Keyword structure generator for iGaming PPC campaigns across accounts.
  var campaigns = [
    {name: "Casino_Brand", keywords: ["online casino", "play slots", "blackjack online"]},
    {name: "Sportsbook_Brand", keywords: ["sports betting", "bet on football", "live betting"]}
  ];
  for (var i = 0; i < campaigns.length; i++) {
    var campaign = campaigns[i];
    // Create campaign if it does not exist
    var existingCampaign = AdsApp.campaigns()
      .withCondition("Name = '" + campaign.name + "'")
      .get();
    if (!existingCampaign.hasNext()) {
      AdsApp.newCampaignBuilder()
        .withName(campaign.name)
        .withBudget(10) // Placeholder daily budget
        .build();
    }
    // Create ad groups and keywords
    var camp = AdsApp.campaigns()
      .withCondition("Name = '" + campaign.name + "'")
      .get().next();
    for (var j = 0; j < campaign.keywords.length; j++) {
      var kw = campaign.keywords[j];
      var adGroupName = campaign.name + "_AG_" + (j + 1);
      var adGroupIt = camp.adGroups().withCondition("Name = '" + adGroupName + "'").get();
      if (!adGroupIt.hasNext()) {
        camp.newAdGroupBuilder()
          .withName(adGroupName)
          .withCpc(1.0)
          .build();
      }
      var adGroup = camp.adGroups().withCondition("Name = '" + adGroupName + "'").get().next();
      adGroup.newKeywordBuilder().withText('+' + kw.replace(/ /g, ' +')).withCpc(1.0).build();
    }
  }
}
