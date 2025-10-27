# igaming-ppc-automation  

This repository contains automation scripts and resources to support a **12-week PPC program** for iGaming operators advertising on **Google Ads** and **Microsoft Ads**. The goal is to streamline campaign creation, monitoring, compliance checks and reporting for regulated gambling verticals.

## Scripts  

- **`keyword_structure_generator.gs`** – A Google Ads script that builds an initial campaign and ad group structure from predefined keyword sets and match types. It can create campaigns and ad groups if they don’t exist and assign keywords using broad match modifiers.  
- **`fraud_detection_report.gs`** – Generates a report of search terms and performance metrics to flag suspicious queries (e.g., high click volume but low conversions) that may indicate click fraud.  
- **`compliance_checker.gs`** – Reviews each campaign’s targeted locations and age settings to ensure they align with allowed countries and responsible‑gambling policies. Logs any disallowed locations or age ranges.  
- **`reporting_dashboard.gs`** – Collects daily performance metrics from your Google Ads account (impressions, clicks, conversions, cost, CPC, conversion value, CPA) and appends them to a Google Sheet for a lightweight dashboard.

All scripts are located in the `scripts` directory and can be scheduled via the Google Ads Script scheduler. See the inline comments in each script for guidance on customizing keyword lists, thresholds, allowed locations and sheet URLs.

## Usage  

1. **Clone or fork the repo.**  
2. **Create Google Ads scripts:** In Google Ads, go to **Tools & Settings → Bulk actions → Scripts**. Create a new script, paste the contents of the desired `.gs` file, authorize and run.  
3. **Set up a Google Sheet:** For the reporting dashboard, create a Google Sheet and update the `SHEET_URL` constant in `reporting_dashboard.gs` with your sheet’s URL.  
4. **Schedule scripts:** Use the script scheduler in Google Ads to run the keyword generator once at launch, run the fraud detection and compliance checker weekly, and run the reporting dashboard daily.  
5. **Microsoft Ads:** Microsoft Ads scripts API is currently in beta; you can adapt the logic here using the Microsoft Ads Script or Bulk API.

This repository will evolve as the 12‑week plan progresses. Feel free to open issues or pull requests with improvements.
