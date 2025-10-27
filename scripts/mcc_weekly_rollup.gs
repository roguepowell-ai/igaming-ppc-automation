/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Google‑Ads MCC roll‑up · one row per ISO week   (patched 2025‑07‑15)║
 * ╚══════════════════════════════════════════════════════════════╝
 * 1. Review the CONSTANTS block only.
 * 2. Paste into Manager‑account scripts, authorise, Preview.
 */

/* ── CONSTANTS ────────────────────────────────────────────────────────────────────────── */
const CHILD_CUSTOMER_ID = '288-166-0078';

const SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1rS1ZatVPg7Wf-eo2-oJBIqT29Ed4qROLiOQZYTJkfyA/edit?gid=128566292#gid=128566292';
const TAB_NAME         = 'SBD PA';

/**FIXED DATE RANGE
const DATE_RANGE_START = '20250901';
const DATE_RANGE_END   = '20241230';
/**END FIXED DATE RANGE **/

/** LAST 7 DAYS DATE FUNCTION, this is meant to be scheduled to run each monday for iso week num reporting**/
function formatAsYYYYMMDD(dateObj) {
  return Utilities.formatDate(
    dateObj,
    AdsApp.currentAccount().getTimeZone(), // keep it in‑sync with the account
    'yyyyMMdd'
  );
}

// Get “today” in the account’s zone
var today = new Date();

// Yesterday
var yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);

// Seven days ago (relative to today, *not* relative to yesterday)
var sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

// Constants you can drop into reports, Queries, etc.
const DATE_RANGE_START = formatAsYYYYMMDD(sevenDaysAgo); // e.g. '20250709'
const DATE_RANGE_END   = formatAsYYYYMMDD(yesterday);     // e.g. '20250715'

/**END LAST 7 DAYS DATE FUNCTION**/


/*  !!  Keep ⋉Unicode NBSP/EN‑dash out of these labels !!              */
const RAW_CONV_NAMES = {
  CLICKOUT_HORSESHOE     : 'Horseshoe Online Casino Clickout',
  CLICKOUT_BETPARX       : 'Betparx Clickout',
  CLICKOUT_CAESARS       : 'Caesers Palace Casino Clickout',
  CLICKOUT_BETMGM        : 'BetMGM Casino Clickout',
  CLICKOUT_BORGATA       : 'Borgata Casino Clickout',
  CLICKOUT_DRAFTKINGS    : 'Draftkings Casino Clickout',
  CLICKOUT_FANDUEL       : 'FanDuel Casino Clickout',
  CLICKOUT_GOLDEN_NUGGET : 'Golden Nugget Clickout',
  CLICKOUT_FANATICS      : 'Fanatics Casino Clickout',
  /**CLICKOUT_BET365     : 'Clickout - Bet365',**/
  CLICKOUT_JACKPOT_CITY  : 'Jackpot City Casino Clickout',
  CLICKOUT_SPINPALACE    : 'Spin Palace Clickout',
  CLICKOUT_WHEELOFOFRTUNE: 'Wheel of Fortune Clickout',
  CLICKOUT_BETRIVERS     : 'BetRivers Clickout',

  REG_BET365             : 'bet365 Registration',
  REG_BETMGM             : 'BetMGM Casino Registration',
  REB_BETPARX            : 'Betparx Registration',
  REG_BORGATA            : 'Borgata Casino Registration',
  REG_CAESARS            : 'Caesers Palace Casino Registration',
  REG_DRAFTKINGS         : 'Draftkings Casino Registration',
  REG_FANATICS           : 'Fanatics Casino Registration',
  REG_FANDUEL            : 'FanDuel Casino Registration',
  REG_GOLDEN_NUGGET      : 'Golden Nugget Registration',
  REG_JACKPOT_CITY       : 'Jackpot City Casino Registration',
  REG_SPIN_CITY          : 'Spin Palace Registration',
  REG_HORSESHOE          : 'Horseshoe Online Casino Registration',
  REG_WHEELOFFORTUNE     : 'Wheel of Fortune Registration',
  REG_BETRIVERS          : 'BetRivers Registration',

  FTD_BETMGM             : 'BetMGM Casino FTD',
  FTD_BETPARX            : 'Betparx FTD',
  FTD_BET365             : 'bet365 FTD',
  FTD_BORGATA            : 'Borgata Casino FTD',
  FTD_CAESARS            : 'Caesers Palace Casino FTD',
  FTD_DRAFTKINGS         : 'Draftkings Casino FTD',
  FTD_FANATICS           : 'Fanatics Casino FTD',
  FTD_FANDUEL            : 'FanDuel Casino FTD',
  FTD_GOLDEN_NUGGET      : 'Golden Nugget FTD',
  FTD_JACKPOT_CITY       : 'Jackpot City Casino FTD',
  FTD_HORSESHOW          : 'Horseshoe Online Casino FTD',
  FTD_WHEELOFFORTUNE     : 'Wheel of Fortune FTD',
  FTD_BETRIVERS          : 'BetRivers FTD',
  FTD_SPIN_CITY          : 'Spin Palace FTD'
};

/* ▸ normalise labels: strip NBSP ( ) and fancy dashes                  */
function clean_(s){
  return s.replace(/\u00A0/g, ' ')            // non‑breaking space → space
          .replace(/[\u2010-\u2015]/g, '-')   // any unicode dash → hyphen
          .trim();
}
const CONV_NAMES = Object.fromEntries(
  Object.entries(RAW_CONV_NAMES).map(([k,v]) => [k, clean_(v)])
);
const CONV_KEYS = Object.keys(CONV_NAMES);    // dynamic column list

const CHANNEL_RULES = [
  { channel: 'ppcbrand',    match: /ppcbrand_/i },
  { channel: 'ppcnonbrand', match: /ppcnonbrand_/i },
  { channel: 'app',         match: /app_/i },
  { channel: 'pmax',        match: /pmax_/i }
];

/* ════════════════════════════════════════════════════════════════ */
/*  NO CHANGES NEEDED BELOW THIS LINE                                  */
/* ════════════════════════════════════════════════════════════════ */

function main() {
  /* 0. Normalise date window --------------------------------------- */
  let startAll = toYyyymmdd_(DATE_RANGE_START);
  let endAll   = toYyyymmdd_(DATE_RANGE_END);
  if (!startAll || !endAll) throw 'Date constants are not recognised.';
  if (startAll > endAll){ const t=startAll; startAll=endAll; endAll=t;
    Logger.log(`⚠️ Swapped window → ${startAll} – ${endAll}`); }

  const tz    = AdsApp.currentAccount().getTimeZone();
  const ss    = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  let sheet   = ss.getSheetByName(TAB_NAME) || ss.insertSheet(TAB_NAME);

  /* Header row ------------------------------------------------------ */
  if (sheet.getLastRow() === 0){
    sheet.appendRow([
      'Channel','Platform','Week','w/c date',
      'Spend','Impressions','Clicks',
      ...CONV_KEYS,
      'All Conv Value'
    ]);
  }

  /* 1. Pick child account ------------------------------------------ */
  const it = MccApp.accounts().withIds([CHILD_CUSTOMER_ID]).get();
  if (!it.hasNext()) throw `CID ${CHILD_CUSTOMER_ID} not visible.`;
  MccApp.select(it.next());

  /* 2. Loop Monday‑to‑Sunday --------------------------------------- */
  let monday     = firstMondayOnOrAfter_(toDate_(startAll));
  const endDate  = toDate_(endAll);
  let totalRows  = 0;

  while (monday <= endDate){
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()+6);

    const meta   = {
      start   : fmtYYYYMMDD_(monday),
      end     : fmtYYYYMMDD_(sunday <= endDate ? sunday : endDate),
      isoWeek : isoWeekNumber_(monday),
      wc      : Utilities.formatDate(monday, tz, 'M/d/yyyy')
    };

    totalRows += fetchAndWriteWeek_(meta, sheet);
    monday     = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()+7);
  }

  Logger.log(`✓ Completed. ${totalRows} row(s) appended.`);
}

/* ================ week‑level worker ================================ */
function fetchAndWriteWeek_(meta, sheet){
  /* Base metrics ---------------------------------------------------- */
  const base = {};
  query_(
    'SELECT CampaignName, Cost, Impressions, Clicks ' +
    `FROM CAMPAIGN_PERFORMANCE_REPORT DURING ${meta.start},${meta.end}`,
    r => base[r.CampaignName] = {
      spend : toCurrency(r.Cost),
      impr  : num(r.Impressions),
      clicks: num(r.Clicks),
      ...Object.fromEntries(CONV_KEYS.map(k => [k, 0])),
      value : 0
    }
  );

  /* All conversions in ONE report call ----------------------------- */
  mergeAllConvs_(base, meta);

  /* Aggregate to channel/platform rows ----------------------------- */
  const agg = {};
  for (const c in base){
    const ch = channelFromName_(c); if (!ch) continue;
    const key = ch + '|google';
    const dst = agg[key] || blank_();
    const src = base[c];

    dst.spend  += src.spend;
    dst.impr   += src.impr;
    dst.clicks += src.clicks;
    for (const k of CONV_KEYS) dst[k] += src[k];
    dst.value  += src.value;
    agg[key]    = dst;
  }

  /* Batch‑write to sheet (faster than appendRow per line) ---------- */
  const rows = Object.keys(agg).map(k => {
    const [channel, platform] = k.split('|');
    const m = agg[k];
    return [
      channel, platform, meta.isoWeek, meta.wc,
      round(m.spend), m.impr, m.clicks,
      ...CONV_KEYS.map(key => m[key]),
      round(m.value)
    ];
  });

  if (rows.length){
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  }
  return rows.length;
}

/* ================ helpers ========================================= */
function mergeAllConvs_(map, meta){
  /* Map cleaned display label → key name --------------------------- */
  const nameToKey = Object.fromEntries(
    Object.entries(CONV_NAMES).map(([k,v]) => [clean_(v), k])
  );

  query_(
    'SELECT CampaignName, ConversionTypeName, AllConversions, AllConversionValue ' +
    `FROM CAMPAIGN_PERFORMANCE_REPORT DURING ${meta.start},${meta.end}`,
    r => {
      const m   = map[r.CampaignName]; if (!m) return;
      const key = nameToKey[clean_(r.ConversionTypeName)]; if (!key) return;
      m[key]  += num(r.AllConversions);
      m.value += toCurrency(r.AllConversionValue);
    }
  );
}

function query_(awql, cb){
  const it = AdsApp.report(awql).rows();
  while (it.hasNext()) cb(it.next());
}

function toDate_(yyyymmdd){ return new Date(yyyymmdd.slice(0,4), +yyyymmdd.slice(4,6)-1, yyyymmdd.slice(6)); }
function toYyyymmdd_(d){
  if (/^\d{8}$/.test(d)) return d;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); if (ymd) return ymd[1]+ymd[2]+ymd[3];
  const mdy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d); if (mdy) return mdy[3]+mdy[1]+mdy[2];
  return null;
}
function fmtYYYYMMDD_(dt){ return Utilities.formatDate(dt, 'UTC', 'yyyyMMdd'); }

function firstMondayOnOrAfter_(d){
  const dow   = d.getDay();                  // Sun=0 … Sat=6
  const delta = (dow === 0) ? 1 : (dow === 1) ? 0 : (8-dow);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()+delta);
}
function isoWeekNumber_(d){
  const t   = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(),0,1))) / 86400000 + 1) / 7);
}

function num(x){ return +String(x||'').replace(/[, \u202F]/g,'') || 0; }
function toCurrency(x){ const n = num(x); return n >= 100000 ? n / 1e6 : n; }
function round(n){ return Math.round((num(n)+Number.EPSILON)*100) / 100; }

function channelFromName_(n){ for (const r of CHANNEL_RULES) if (r.match.test(n)) return r.channel; return null; }
function blank_(){
  return {
    spend : 0,
    impr  : 0,
    clicks: 0,
    ...Object.fromEntries(CONV_KEYS.map(k => [k, 0])),
    value : 0
  };
}
