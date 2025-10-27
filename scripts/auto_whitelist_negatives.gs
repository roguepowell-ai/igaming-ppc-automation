/****************************************************
 * Auto-Negatives from Search Terms (with Whitelist)
 * - Honors EXACT / PHRASE negative types
 * - Skips anything found on your whitelist (robust unicode-safe matching)
 * - Optional fuzzy whitelist using Levenshtein distance (ratio ≤ threshold)
 * - Works at CAMPAIGN or AD_GROUP level
 * - MCC or single account compatible
 *
 * Project version: v0.1 - multi-sheet whitelist (SHEET_NAMES) + sheet-aware allow logs
 * v2.3.1 (fix: use createNegativeKeyword instead of non-existent builder)
 ****************************************************/
// Project version: 0.1 - multi-sheet whitelist + sheet-aware allow logs + robust duplicate skip

const CONFIG = {
  // --- SHEET SETTINGS ---
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1T5rIRpAas3BYm8YH7zXYwrrQq664AILZF8o7O04C1P8/edit',
  SHEET_NAMES: ['slots','mrqslots'], // optional: list of sheet names to merge into the whitelist (overrides SHEET_NAME when non-empty)
  WHITELIST_HEADER_NAME: 'Approved Terms', // header text in row 1
  NAMED_RANGE: 'A:A', // optional: if set, used instead of header lookup

  // --- SCOPE: ACCOUNTS (MCC) ---
  CHILD_CUSTOMER_IDS: ['688-942-2046'], // e.g. ['123-456-7890','111-222-3333']; leave [] to use ACCOUNT_LABEL
  ACCOUNT_LABEL: '',      // e.g. 'Auto-Negatives'

  // --- SCOPE: CAMPAIGNS ---
  CAMPAIGN_NAME_CONTAINS: 'ppcnonbrand_casino_uk_google_mrq_200cashspins_slots', // substring (case-insensitive). Leave '' to ignore.
  CAMPAIGN_LABEL: '',         // optional (label filtering may vary by experience)

  // --- BEHAVIOR ---
  DATE_RANGE: 'YESTERDAY',   // e.g. TODAY,YESTERDAY, LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH
  NEGATIVE_LEVEL: 'CAMPAIGN',   // 'CAMPAIGN' or 'AD_GROUP'
  NEGATIVE_MATCH_TYPE: 'EXACT', // 'EXACT' or 'PHRASE'
  DRY_RUN: false,               // true = preview only, no changes

  // --- TERM FILTER TOGGLES ---
  EXCLUDE_ZERO_COST_TERMS: true,   // if true: ignore terms where cost == 0
  TOP_COSTED_TERMS_ONLY: true,     // if true: only consider the top N costed terms (implies cost > 0)
  TOP_COSTED_TERMS_COUNT: 100,      // N for TOP_COSTED_TERMS_ONLY

  // --- WHITELIST FUZZY MATCHING ---
  FUZZY_WHITELIST_ENABLED: true,
  FUZZY_WHITELIST_MAX_RATIO: 0.10, // 10% edits tolerated

  // --- LOGGING ---
  LOG_DETAILED: true,
  LOG_LIMIT_PER_ACCOUNT: 800,
  LOG_WHITELIST_MATCHES: true,
  LOG_ALREADY_NEGATIVE: true,
  LOG_ADDITIONS: true
};

/** ============================
 *  Entry
 *  ============================ */
function main() {
  const whitelist = loadWhitelist_();
  logLine('═════════════════════════════════════════════════════════════');
  logLine('Loaded whitelist terms (unique keys): %s', String(whitelist.set.size));
  logLine(
    'DATE_RANGE=%s | NEGATIVE_LEVEL=%s | MATCH=%s | DRY_RUN=%s',
    CONFIG.DATE_RANGE, CONFIG.NEGATIVE_LEVEL, CONFIG.NEGATIVE_MATCH_TYPE, CONFIG.DRY_RUN
  );
  if (CONFIG.FUZZY_WHITELIST_ENABLED) {
    logLine('FUZZY_WHITELIST: ON (max ratio %s)', CONFIG.FUZZY_WHITELIST_MAX_RATIO);
  } else {
    logLine('FUZZY_WHITELIST: OFF');
  }
  logLine('═════════════════════════════════════════════════════════════');

  const accounts = getAccounts_();
  let totalSeen = 0, totalAllowed = 0, totalAlreadyNeg = 0, totalAdded = 0;

  for (const acct of accounts) {
    selectAccount_(acct);
    const accountName = AdsApp.currentAccount().getName();
    const customerId  = AdsApp.currentAccount().getCustomerId();
    logLine('\n-- Account: %s (%s) --', accountName, customerId);

    const campaigns = getTargetCampaigns_();
    if (campaigns.length === 0) {
      logLine('No targeted campaigns found. Skipping.');
      continue;
    }
    logLine('Campaigns targeted: %s', String(campaigns.length));

    // Preload negatives (per container) using GAQL with safe fallback
    const existingNegByContainer = preloadExistingNegatives_(campaigns);

    const campIds = campaigns.map(c => c.getId());
    const rows = fetchSearchTerms_(campIds);

    let seen = 0, allowed = 0, alreadyNeg = 0, added = 0;
    let detailedCount = 0;

    for (const r of rows) {
      seen++;
      const raw = r.searchTerm;
      const campId = r.campaignId;
      const agId   = r.adGroupId;

      const termKey = normalizeTerm(raw);
      if (!termKey) continue;

      // Whitelist exact or fuzzy
      let allowedByWhitelist = false;
      let fuzzyNote = '';
      let allowSheet = null;
      if (whitelist.set.has(termKey)) {
        allowedByWhitelist = true;
        allowSheet = (whitelist.originByTerm && whitelist.originByTerm.get(termKey)) || '(unknown sheet)';
      } else if (CONFIG.FUZZY_WHITELIST_ENABLED) {
        const fuzz = fuzzyWhitelistHas_(termKey, whitelist, CONFIG.FUZZY_WHITELIST_MAX_RATIO);
        if (fuzz.hit) {
          allowedByWhitelist = true;
          allowSheet = fuzz.sheet || '(unknown sheet)';
          fuzzyNote = ' ~ matched "' + fuzz.match + '" at ' + (Math.round(fuzz.ratio * 1000) / 10) + '%';
        }
      }

      if (allowedByWhitelist) {
        allowed++;
        if (CONFIG.LOG_DETAILED && CONFIG.LOG_WHITELIST_MATCHES && detailedCount < CONFIG.LOG_LIMIT_PER_ACCOUNT) {
          logLine('ALLOW (whitelist%s | sheet="%s"): %s  - %s="%s"',
                  fuzzyNote, allowSheet, prettifyForMatchType_(raw), containerLabel_(), containerIdForLog_(campId, agId));
          detailedCount++;
        }
        continue;
      }

      
      // Determine container (campaign vs ad group) & existing set
      const containerId = (CONFIG.NEGATIVE_LEVEL === 'CAMPAIGN') ? campId : agId;
      const existingSet = existingNegByContainer.get(containerId) || new Set();

      // Already negative?
      if (existingSet.has(termKey)) {
        alreadyNeg++;
        if (CONFIG.LOG_DETAILED && CONFIG.LOG_ALREADY_NEGATIVE && detailedCount < CONFIG.LOG_LIMIT_PER_ACCOUNT) {
          logLine('SKIP (already negative): %s  - %s="%s"',
                  prettifyForMatchType_(raw), containerLabel_(), containerIdForLog_(campId, agId));
          detailedCount++;
        }
        continue;
      }

      // Propose / add negative
      if (CONFIG.DRY_RUN) {
        added++;
        if (CONFIG.LOG_DETAILED && CONFIG.LOG_ADDITIONS && detailedCount < CONFIG.LOG_LIMIT_PER_ACCOUNT) {
          logLine('WOULD ADD: %s  - %s="%s"',
                  prettifyForMatchType_(raw), containerLabel_(), containerIdForLog_(campId, agId));
          detailedCount++;
        }
      } else {
        const ok = addNegative_(raw, campId, agId);
        if (ok) {
          added++;
          existingSet.add(termKey); // update cache within the run
          if (CONFIG.LOG_DETAILED && CONFIG.LOG_ADDITIONS && detailedCount < CONFIG.LOG_LIMIT_PER_ACCOUNT) {
            logLine('ADDED: %s  - %s="%s"',
                    prettifyForMatchType_(raw), containerLabel_(), containerIdForLog_(campId, agId));
            detailedCount++;
          }
        }
      }
    }

    // Per-account summary
    logLine('\nPer-campaign summary:');
    for (const c of campaigns) {
      const negCount = (CONFIG.NEGATIVE_LEVEL === 'CAMPAIGN')
        ? (existingNegByContainer.get(c.getId()) || new Set()).size
        : sumAdGroupNegatives_(c);
      logLine('• %s (ID %s) - existing negatives now cached: %s', c.getName(), c.getId(), String(negCount));
    }
    logLine('Account summary: seen=%s, allowed=%s, alreadyNeg=%s, %s=%s%s',
            String(seen), String(allowed), String(alreadyNeg),
            (CONFIG.DRY_RUN ? 'added(dry-run)' : 'added'),
            String(added),
            (seen > CONFIG.LOG_LIMIT_PER_ACCOUNT ? ' (log truncated)' : ''));

    totalSeen += seen;
    totalAllowed += allowed;
    totalAlreadyNeg += alreadyNeg;
    totalAdded += added;
  }

  logLine('\n═════════════ FINAL SUMMARY ═════════════');
  logLine('Accounts processed:   %s', String(accounts.length));
  logLine('Search terms checked: %s', String(totalSeen));
  logLine('Allowed (whitelist):  %s', String(totalAllowed));
  logLine('Already negative:      %s', String(totalAlreadyNeg));
  logLine('%s: %s',
          (CONFIG.DRY_RUN ? 'Negatives to add (dry-run)' : 'Negatives added'),
          String(totalAdded));
}

/** ============================
 *  Whitelist loading + helpers
 *  ============================ */

function normalizeTerm(s) {
  if (s == null) return '';
  s = String(s);
  if (s.normalize) s = s.normalize('NFKC');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, ''); // zero-widths
  s = s.replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, ' '); // exotic spaces
  s = s.replace(/[\[\]\u2018\u2019\u201C\u201D"']/g, ''); // brackets & quotes
  s = s.toLowerCase().trim().replace(/\s+/g, ' ');
  return s;
}

function loadWhitelist_() {
  const ss = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);

  // Determine which sheets to read from
  let sheetNames = [];
  if (Array.isArray(CONFIG.SHEET_NAMES) && CONFIG.SHEET_NAMES.length > 0) {
    sheetNames = CONFIG.SHEET_NAMES.filter(Boolean);
  } else if (CONFIG.SHEET_NAME && String(CONFIG.SHEET_NAME).trim()) {
    sheetNames = [CONFIG.SHEET_NAME];
  } else {
    throw new Error('CONFIG: Provide SHEET_NAME (string) or SHEET_NAMES (array).');
  }

  const set = new Set();
  const list = [];
  const originByTerm = new Map(); // termKey -> first sheet that provided it
  const useNamedRange = CONFIG.NAMED_RANGE && String(CONFIG.NAMED_RANGE).trim();

  for (const name of sheetNames) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      logLine('WARN: Sheet not found, skipping: %s', name);
      continue;
    }

    let values = [];
    if (useNamedRange) {
      try {
        const rng = sheet.getRange(CONFIG.NAMED_RANGE);
        values = rng.getValues().flat();
      } catch (e) {
        logLine('WARN: Could not read range "%s" on sheet "%s" - %s', CONFIG.NAMED_RANGE, name, (e && e.message) || e);
        values = [];
      }
    } else {
      const lastCol = sheet.getLastColumn();
      if (lastCol === 0) continue;
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const idx = headers.findIndex(h => String(h).trim().toLowerCase() === String(CONFIG.WHITELIST_HEADER_NAME).trim().toLowerCase());
      if (idx === -1) {
        logLine('WARN: Header "%s" not found on sheet "%s" - skipping.', CONFIG.WHITELIST_HEADER_NAME, name);
        continue;
      }
      const col = idx + 1;
      const rng = sheet.getRange(2, col, Math.max(sheet.getLastRow() - 1, 0), 1);
      values = rng.getValues().flat();
    }

    let addedFromThisSheet = 0;
    for (let v of values) {
      if (v === '' || v == null) continue;
      const key = normalizeTerm(v);
      if (key && !set.has(key)) {
        set.add(key);
        list.push(key);
        originByTerm.set(key, name);
        addedFromThisSheet++;
      }
    }
    logLine('Whitelist loaded from "%s": +%s unique terms (cumulative %s)', name, String(addedFromThisSheet), String(set.size));
  }

  const buckets = buildLengthBuckets_(list);
  return { set: set, list: list, buckets: buckets, originByTerm: originByTerm };
}

function buildLengthBuckets_(arr) {
  const buckets = new Map(); // length -> array of strings
  for (const s of arr) {
    const L = s.length;
    let b = buckets.get(L);
    if (!b) { b = []; buckets.set(L, b); }
    b.push(s);
  }
  return buckets;
}

/** ============================
 *  Fuzzy whitelist matching
 *  ============================ */

function fuzzyWhitelistHas_(termKey, whitelist, maxRatio) {
  if (!termKey) return {hit:false};
  const L = termKey.length;
  if (L === 0) return {hit:false};
  if (!isFinite(maxRatio) || maxRatio <= 0) return {hit:false};

  let best = {hit:false, match:null, distance:Infinity, ratio:Infinity, sheet:null};

  if (whitelist.set.has(termKey)) {
    return {hit:true, match:termKey, distance:0, ratio:0, sheet: whitelist.originByTerm && whitelist.originByTerm.get(termKey) || null};
  }

  const maxLenForRatio = function(aLen, bLen) { return Math.max(aLen, bLen); };

  const minLen = 1;
  const maxLenSeen = Math.max(...Array.from(whitelist.buckets.keys()).concat([L]));
  const band = Math.ceil(maxRatio * Math.max(L, 50));

  for (let candLen = Math.max(minLen, L - band); candLen <= Math.min(maxLenSeen, L + band); candLen++) {
    const bucket = whitelist.buckets.get(candLen);
    if (!bucket || bucket.length === 0) continue;

    const lenDiff = Math.abs(L - candLen);
    const kForLen = Math.floor(maxRatio * maxLenForRatio(L, candLen));
    if (lenDiff > kForLen) continue;

    for (const cand of bucket) {
      const K = Math.floor(maxRatio * maxLenForRatio(L, cand.length));
      if (Math.abs(L - cand.length) > K) continue;

      const dist = levenshteinWithinK_(termKey, cand, K);
      if (dist <= K) {
        const ratio = dist / Math.max(L, cand.length);
        if (ratio <= maxRatio && ratio < best.ratio) {
          best = {hit:true, match:cand, distance:dist, ratio:ratio, sheet: whitelist.originByTerm && whitelist.originByTerm.get(cand) || null};
          if (dist === 0) return best;
        }
      }
    }
  }

  return best.hit ? best : {hit:false};
}

// Levenshtein distance with banded early-exit: returns distance if ≤ K; else K+1
function levenshteinWithinK_(a, b, K) {
  const n = a.length, m = b.length;
  if (n === 0) return Math.min(m, K+1);
  if (m === 0) return Math.min(n, K+1);
  if (Math.abs(n - m) > K) return K + 1;
  if (n > m) { const tmp = a; a = b; b = tmp; return levenshteinWithinK_(a, b, K); }

  const prev = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    const ai = a.charCodeAt(i - 1);
    const jStart = Math.max(1, i - K);
    const jEnd   = Math.min(m, i + K);

    const curr = new Array(m + 1);
    for (let j = 0; j < jStart; j++) curr[j] = K + 1;
    for (let j = jEnd + 1; j <= m; j++) curr[j] = K + 1;

    if (jStart === 1) curr[0] = i; else curr[jStart - 1] = K + 1;

    let minInRow = K + 1;
    for (let j = jStart; j <= jEnd; j++) {
      const cost = (ai === b.charCodeAt(j - 1)) ? 0 : 1;
      const ins = curr[j - 1] + 1;
      const del = prev[j] + 1;
      const sub = prev[j - 1] + cost;
      const v = (ins < del ? (ins < sub ? ins : sub) : (del < sub ? del : sub));
      curr[j] = v;
      if (v < minInRow) minInRow = v;
    }

    if (minInRow > K) return K + 1;
    for (let j = 0; j <= m; j++) prev[j] = curr[j];
  }

  const d = prev[m];
  return d <= K ? d : K + 1;
}

/** ============================
 *  Account + campaign scoping
 *  ============================ */

function getAccounts_() {
  const ids = (CONFIG.CHILD_CUSTOMER_IDS || []).filter(x => x && x.trim());

  if (typeof MccApp === 'undefined') {
    return [AdsApp.currentAccount()];
  }

  if (ids.length > 0) {
    const it = MccApp.accounts().withIds(ids).get();
    const out = [];
    while (it.hasNext()) out.push(it.next());
    return out;
  } else if (CONFIG.ACCOUNT_LABEL && CONFIG.ACCOUNT_LABEL.trim()) {
    const it = MccApp.accounts()
      .withCondition('LabelNames CONTAINS_ANY ["' + escapeQuotes_(CONFIG.ACCOUNT_LABEL.trim()) + '"]')
      .get();
    const out = [];
    while (it.hasNext()) out.push(it.next());
    return out;
  } else {
    return [AdsApp.currentAccount()];
  }
}

function selectAccount_(account) {
  if (typeof MccApp !== 'undefined') {
    MccApp.select(account);
  }
}

function getTargetCampaigns_() {
  let sel = AdsApp.campaigns();

  if (CONFIG.CAMPAIGN_NAME_CONTAINS && CONFIG.CAMPAIGN_NAME_CONTAINS.trim()) {
    sel = sel.withCondition('Name CONTAINS_IGNORE_CASE "' + escapeQuotes_(CONFIG.CAMPAIGN_NAME_CONTAINS.trim()) + '"');
  }
  if (CONFIG.CAMPAIGN_LABEL && CONFIG.CAMPAIGN_LABEL.trim()) {
    sel = sel.withCondition('LabelNames CONTAINS_ANY ["' + escapeQuotes_(CONFIG.CAMPAIGN_LABEL.trim()) + '"]');
  }

  sel = sel.withCondition('Status IN [ENABLED, PAUSED]');

  const it = sel.get();
  const out = [];
  while (it.hasNext()) out.push(it.next());
  return out;
}

/** ============================
 *  Existing negatives cache
 *  ============================ */

function loadExistingNegatives_Campaign_(campaign) {
  const set = new Set();
  const it = campaign.negativeKeywords().get();
  while (it.hasNext()) {
    const nk = it.next();
    const key = normalizeTerm(nk.getText());
    if (key) set.add(key);
  }
  return set;
}

function loadExistingNegatives_AdGroup_(adGroup) {
  const set = new Set();
  const it = adGroup.negativeKeywords().get();
  while (it.hasNext()) {
    const nk = it.next();
    const key = normalizeTerm(nk.getText());
    if (key) set.add(key);
  }
  return set;
}

function sumAdGroupNegatives_(campaign) {
  const agIt = campaign.adGroups().get();
  let total = 0;
  while (agIt.hasNext()) {
    const ag = agIt.next();
    total += (ag.negativeKeywords().get().totalNumEntities() || 0);
  }
  return total;
}

// Robust preloader using GAQL with selector fallback
function preloadExistingNegatives_(campaigns) {
  const map = new Map(); // containerId -> Set(termKey)
  const campIds = campaigns.map(c => c.getId());

  function ensureSet(id) {
    let s = map.get(id);
    if (!s) { s = new Set(); map.set(id, s); }
    return s;
  }

  // 1) Campaign-level negatives via GAQL
  try {
    const gaqlC = [
      'SELECT',
      '  campaign.id,',
      '  campaign_criterion.keyword.text,',
      '  campaign_criterion.keyword.match_type',
      'FROM campaign_criterion',
      'WHERE',
      '  campaign_criterion.negative = TRUE',
      '  AND campaign_criterion.type = KEYWORD',
      '  AND campaign.id IN (' + campIds.join(',') + ')'
    ].join('\n');
    const itC = AdsApp.search(gaqlC);
    let nC = 0;
    while (itC.hasNext()) {
      const row = itC.next();
      const cid = Number(row.campaign.id);
      const text = row.campaignCriterion.keyword.text;
      const key = normalizeTerm(text);
      if (key) { ensureSet(cid).add(key); nC++; }
    }
    logLine('Loaded campaign negatives via GAQL: %s', String(nC));
  } catch (e) {
    logLine('WARN: GAQL preload (campaign_criterion) failed - falling back to selectors: %s', (e && e.message) || e);
    for (const camp of campaigns) {
      const set = loadExistingNegatives_Campaign_(camp);
      map.set(camp.getId(), set);
      logLine('Loaded %s existing campaign negatives for "%s" (fallback)', String(set.size), camp.getName());
    }
  }

  // 2) Ad group-level negatives via GAQL
  try {
    const gaqlAG = [
      'SELECT',
      '  campaign.id,',
      '  ad_group.id,',
      '  ad_group_criterion.keyword.text,',
      '  ad_group_criterion.keyword.match_type',
      'FROM ad_group_criterion',
      'WHERE',
      '  ad_group_criterion.negative = TRUE',
      '  AND ad_group_criterion.type = KEYWORD',
      '  AND campaign.id IN (' + campIds.join(',') + ')'
    ].join('\n');
    const itAG = AdsApp.search(gaqlAG);
    let nAG = 0;
    while (itAG.hasNext()) {
      const row = itAG.next();
      const gid = Number(row.adGroup.id);
      const text = row.adGroupCriterion.keyword.text;
      const key = normalizeTerm(text);
      if (key) { ensureSet(gid).add(key); nAG++; }
    }
    logLine('Loaded ad group negatives via GAQL: %s', String(nAG));
  } catch (e) {
    logLine('WARN: GAQL preload (ad_group_criterion) failed - falling back to selectors: %s', (e && e.message) || e);
    for (const camp of campaigns) {
      const agIter = camp.adGroups().get();
      while (agIter.hasNext()) {
        const ag = agIter.next();
        const set = loadExistingNegatives_AdGroup_(ag);
        map.set(ag.getId(), set);
      }
      logLine('Loaded existing ad group negatives across "%s" (fallback)', camp.getName());
    }
  }

  return map;
}

/** ============================
 *  Search terms fetch (GAQL + fallback)
 *  ============================ */

function fetchSearchTerms_(campaignIds) {
  if (!campaignIds || campaignIds.length === 0) return [];

  var needCostFilter = (CONFIG.EXCLUDE_ZERO_COST_TERMS === true) || (CONFIG.TOP_COSTED_TERMS_ONLY === true);
  var topN = CONFIG.TOP_COSTED_TERMS_ONLY ? Math.max(1, Math.floor(CONFIG.TOP_COSTED_TERMS_COUNT || 100)) : 0;

  // Build GAQL with optional cost filter and limit
  var parts = [
    'SELECT',
    '  search_term_view.search_term,',
    '  campaign.id,',
    '  ad_group.id,',
    '  metrics.impressions,',
    '  metrics.clicks,',
    '  metrics.cost_micros',
    'FROM search_term_view',
    'WHERE',
    '  segments.date DURING ' + CONFIG.DATE_RANGE,
    '  AND campaign.id IN (' + campaignIds.join(',') + ')',
    '  AND metrics.impressions > 0'
  ];
  if (needCostFilter) parts.push('  AND metrics.cost_micros > 0');
  if (topN > 0) {
    parts.push('ORDER BY metrics.cost_micros DESC');
    parts.push('LIMIT ' + topN);
  }
  var gaql = parts.join('\n');

  try {
    logLine('Running GAQL: ' + gaql);
    var iter = AdsApp.search(gaql);
    var out = [];
    while (iter.hasNext()) {
      var row = iter.next();
      out.push({
        searchTerm: row.searchTermView.searchTerm,
        campaignId: Number(row.campaign.id),
        adGroupId: Number(row.adGroup.id),
        impressions: Number(row.metrics.impressions || 0),
        clicks: Number(row.metrics.clicks || 0),
        costMicros: Number(row.metrics.costMicros || 0)
      });
    }
    if (topN > 0 && out.length > topN) {
      out.sort(function(a, b){ return (b.costMicros || 0) - (a.costMicros || 0); });
      out = out.slice(0, topN);
    }
    return out;
  } catch (e) {
    // AWQL fallback (note: clause order)
    var awql = 'SELECT Query, CampaignId, AdGroupId, Impressions, Clicks, Cost ' +
               'FROM SEARCH_QUERY_PERFORMANCE_REPORT ' +
               'WHERE Impressions > 0 ' +
               'AND CampaignId IN [' + campaignIds.join(',') + ']';
    if (needCostFilter) awql += ' AND Cost > 0';
    awql += ' DURING ' + CONFIG.DATE_RANGE + ' ORDER BY Cost DESC';

    logLine('GAQL failed, falling back to AWQL: ' + awql + ' Reason: ' + ((e && e.message) || e));
    var report = AdsApp.report(awql);
    var rows = report.rows();
    var buff = [];
    while (rows.hasNext()) {
      var r = rows.next();
      buff.push({
        searchTerm: r['Query'],
        campaignId: Number(r['CampaignId']),
        adGroupId: Number(r['AdGroupId']),
        impressions: Number(r['Impressions'] || 0),
        clicks: Number(r['Clicks'] || 0),
        costMicros: Number(r['Cost'] || 0)
      });
    }
    if (topN > 0 && buff.length > topN) {
      buff.sort(function(a, b){ return (b.costMicros || 0) - (a.costMicros || 0); });
      return buff.slice(0, topN);
    }
    return buff;
  }
}

/** ============================
 *  Add negatives (FIXED)
 *  ============================ */

function addNegative_(rawSearchTerm, campaignId, adGroupId) {
  // Build text WITH the correct match markers for creation
  const textForCreation = formatNegativeForCreation_(rawSearchTerm);

  try {
    if (CONFIG.NEGATIVE_LEVEL === 'CAMPAIGN') {
      const it = AdsApp.campaigns().withIds([campaignId]).get();
      if (!it.hasNext()) return false;
      const campaign = it.next();
      campaign.createNegativeKeyword(textForCreation); // throws if invalid
      return true;
    } else {
      const it = AdsApp.adGroups().withIds([adGroupId]).get();
      if (!it.hasNext()) return false;
      const adGroup = it.next();
      adGroup.createNegativeKeyword(textForCreation); // throws if invalid
      return true;
    }
  } catch (e) {
    logLine('ERROR creating negative "%s" - %s="%s" - %s',
            textForCreation, containerLabel_(), containerIdForLog_(campaignId, adGroupId), (e && e.message) || e);
    return false;
  }
}

/** ============================
 *  Small utils
 *  ============================ */

function stripFormattingOnly_(s) {
  return String(s).replace(/[\[\]\u2018\u2019\u201C\u201D"']/g, '').trim();
}

function coreTerm_(s) {
  return stripFormattingOnly_((s || '')).replace(/\s+/g, ' ').trim();
}

function formatNegativeForCreation_(s) {
  // Text passed to createNegativeKeyword must include quotes/brackets to set match type
  const core = coreTerm_(s);
  if (CONFIG.NEGATIVE_MATCH_TYPE.toUpperCase() === 'PHRASE') {
    return '"' + core + '"';
  } else {
    // default to EXACT unless user set PHRASE
    return '[' + core + ']';
  }
}

function prettifyForMatchType_(s) {
  // For logs
  return formatNegativeForCreation_(s);
}

function containerLabel_() {
  return CONFIG.NEGATIVE_LEVEL === 'CAMPAIGN' ? 'Campaign' : 'AdGroup';
}

function containerIdForLog_(campaignId, adGroupId) {
  return CONFIG.NEGATIVE_LEVEL === 'CAMPAIGN'
    ? ('Campaign ID ' + campaignId)
    : ('AdGroup ID ' + adGroupId);
}

function escapeQuotes_(s) {
  return String(s).replace(/"/g, '\\"');
}

function logLine() {
  if (arguments.length === 0) return;
  const args = Array.prototype.slice.call(arguments);
  const fmt = args.shift();
  Logger.log.apply(Logger, [fmt].concat(args));
}

/** ============================
 *  Optional: quick sanity test
 *  ============================ */

function debugWhitelistEntry() {
  const whitelist = loadWhitelist_();

  const probes = [
    'best casino',
    'best casno', // misspell
    'best online casino pa',
    'best pennsylvania online casinos'
  ];

  probes.forEach(p => {
    const k = normalizeTerm(p);
    const exact = whitelist.set.has(k);
    let fuzzy = null;
    let sheet = exact ? (whitelist.originByTerm && whitelist.originByTerm.get(k)) : null;
    if (!exact && CONFIG.FUZZY_WHITELIST_ENABLED) {
      fuzzy = fuzzyWhitelistHas_(k, whitelist, CONFIG.FUZZY_WHITELIST_MAX_RATIO);
      sheet = fuzzy && fuzzy.hit ? (fuzzy.sheet || null) : null;
    }
    Logger.log('Probe "%s" → key "%s" → exact:%s, sheet:%s, fuzzy:%s%s',
      p, k, exact, sheet || '-', (fuzzy && fuzzy.hit) ? 'true' : 'false',
      (fuzzy && fuzzy.hit) ? (' (match="' + fuzzy.match + '", ratio=' + (Math.round(fuzzy.ratio*1000)/10) + '%)') : ''
    );
  });

  try {
    const ss = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
    const firstSheetName = (Array.isArray(CONFIG.SHEET_NAMES) && CONFIG.SHEET_NAMES.length > 0)
      ? CONFIG.SHEET_NAMES[0]
      : CONFIG.SHEET_NAME;
    const sheetObj = ss.getSheetByName(firstSheetName);
    const raw = sheetObj.getRange(2452, 1).getDisplayValue();
    Logger.log('Row 2452 raw: "%s" (from sheet "%s")', raw, firstSheetName);
    Logger.log('Row 2452 normalized: "%s"', normalizeTerm(raw));
  } catch (e) {
    Logger.log('debugWhitelistEntry() sheet peek failed: %s', e);
  }
}
