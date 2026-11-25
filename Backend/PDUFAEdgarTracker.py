import requests
import time
import json
import re
from datetime import datetime, timedelta
from dateutil import parser as date_parser  # pip install python-dateutil

# ---------------------------------------------------------------------------
# SEC EDGAR full-text search watcher: scans recent 8-K filings for "PDUFA"
# mentions and attempts to extract a nearby date.
#
# REQUIRED: SEC requires every requester to declare a real User-Agent
# identifying who's making the request (name + contact email). Requests
# without one, or with a generic/browser-spoofed one, risk getting your
# IP blocked. Replace the placeholder below with real info before running.
#
# Rate limit: stay under 10 requests/second (this script is nowhere close
# to that on its own, but don't parallelize this carelessly later).
#
# Docs: https://www.sec.gov/search-filings/edgar-full-text-search
#       https://www.sec.gov/os/webmaster-faq#developers
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": "K&J Capital Research research@example.com"  # <-- replace with real contact info
}

EDGAR_FULLTEXT_URL = "https://efts.sec.gov/LATEST/search-index"

# Rough date-pattern matcher for text near "PDUFA" mentions -- catches common
# phrasings like "PDUFA date of August 30, 2026" or "target action date of
# 08/30/2026". Not exhaustive; treat extracted dates as a first pass to
# manually confirm, not a guaranteed-correct feed.
DATE_PATTERNS = [
    r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}",
    r"\d{1,2}/\d{1,2}/\d{4}",
]

BOILERPLATE_MARKERS = [
    "user fee", "each nda", "each bla", "fee waiver", "free schedule",
    "adjust the pdufa", "program fee",
]

def search_pdufa_filings(days_back=7, form_type="8-K"):
    """
    Searches SEC EDGAR full-text search for 8-K filings mentioning 'PDUFA'
    within the last `days_back` days. Returns a list of filing metadata dicts.
    """
    end_date = datetime.today()
    start_date = end_date - timedelta(days=days_back)

    params = {
        "q": '"PDUFA"',
        "forms": form_type,
        "dateRange": "custom",
        "startdt": start_date.strftime("%Y-%m-%d"),
        "enddt": end_date.strftime("%Y-%m-%d"),
    }

    resp = requests.get(EDGAR_FULLTEXT_URL, headers=HEADERS, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    hits = data.get("hits", {}).get("hits", [])
    results = []
    for hit in hits:
        source = hit.get("_source", {})
        results.append({
            "ticker": source.get("tickers", [None])[0] if source.get("tickers") else None,
            "company_name": source.get("display_names", [None])[0] if source.get("display_names") else None,
            "form_type": source.get("form"),
            "filed_at": source.get("file_date"),
            "accession_no": hit.get("_id"),
            "cik": source.get("ciks", [None])[0] if source.get("ciks") else None,
        })
    return results


def build_filing_url(cik,accession_id):
    """
    Reconstructs the filing document URL from EDGAR's accession id format
    (accession_number:filename). CIK-based path is required for the full URL --
    this is a partial reconstruction; verify against the actual EDGAR
    full-text search UI response shape when you test this live, since the
    exact _id format can vary and may need adjustment.
    """
    if ":" not in accession_id:
        return None
    accession_no, filename = accession_id.split(":", 1)
    accession_no_nodash = accession_no.replace("-", "")
    cik_nolead = str(int(cik))
    return f"https://www.sec.gov/Archives/edgar/data/{cik_nolead}/{accession_no_nodash}/{filename}"



def strip_html(text):
    no_tags = re.sub(r'<[^>]+>', ' ', text)
    return re.sub(r'\s+', ' ', no_tags)

def fetch_filing_text(url):
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return strip_html(resp.text) 


# def extract_dates_near_pdufa(text, window=300):
#     """
#     Finds every mention of 'PDUFA' in the filing text and looks for a date
#     pattern within `window` characters after it. Returns a list of
#     (context_snippet, matched_date) tuples for manual review.
#     """
#     matches = []
#     for m in re.finditer(r"PDUFA", text, re.IGNORECASE):
#         snippet = text[m.end():m.end() + window]
#         for pattern in DATE_PATTERNS:
#             date_match = re.search(pattern, snippet)
#             if date_match:
#                 matches.append({
#                     "matched_date_text": date_match.group(0),
#                     "context": snippet[:150].replace("\n", " ").strip(),
#                 })
#                 break
#     return matches


def extract_dates_near_pdufa(text, window=300):
    matches = []
    for m in re.finditer(r"PDUFA", text, re.IGNORECASE):
        start = max(0, m.start() - 50)
        snippet = text[start: m.end() + window]
        snippet_lower = snippet.lower()
        
        if any(marker in snippet_lower for marker in BOILERPLATE_MARKERS):
            continue
        
        for pattern in DATE_PATTERNS:
            date_match = re.search(pattern, snippet)
            if date_match:
                matches.append({
                    "matched_date_text": date_match.group(0),
                    "context": snippet[:150].replace("\n", " ").strip(),
                })
                break
            
    return matches

def run_watch_cycle(days_back=7):
    """
    One full pass: search recent PDUFA-mentioning 8-Ks, fetch each filing,
    extract candidate dates, print a summary. Wire this into a scheduler
    (cron, or a simple `while True: run_watch_cycle(); time.sleep(...)`
    loop) once you trust the extraction quality.
    """
    print(f"Searching 8-K filings mentioning 'PDUFA' in the last {days_back} days...")
    filings = search_pdufa_filings(days_back=days_back)
    print(f"Found {len(filings)} candidate filings.\n")

    results = []
    for f in filings:
        url = build_filing_url(f["cik"], f["accession_no"])
        if not url:
            continue

        time.sleep(0.15)  # stay well under the 10 req/sec limit

        try:
            text = fetch_filing_text(url)
            pdufa_count = text.upper().count("PDUFA")
            print(f"  {f['ticker']}: fetched {len(text)} chars, found 'PDUFA' {pdufa_count} times")
            if pdufa_count > 0:
                first_idx = text.upper().find("PDUFA")
                print(f"    raw snippet after first match: {text[first_idx:first_idx+300]!r}")
        except Exception as e:
            print(f"  Failed to fetch {url}: {e}")
            continue

        date_matches = extract_dates_near_pdufa(text)
        if date_matches:
            entry = {**f, "url": url, "candidate_dates": date_matches}
            results.append(entry)
            print(f"{f['ticker'] or f['company_name']} — filed {f['filed_at']}")
            for dm in date_matches:
                print(f"    candidate date: {dm['matched_date_text']}  |  context: \"{dm['context']}...\"")
            print()

    with open("pdufa_watch_results.json", "w") as out:
        json.dump(results, out, indent=2)
    print(f"\nSaved {len(results)} filings with candidate PDUFA dates to pdufa_watch_results.json")
    return results

def resolve_cik(ticker):
    resp = requests.get(
        "https://www.sec.gov/files/company_tickers.json",
        headers=HEADERS, timeout=30
    )
    resp.raise_for_status()
    mapping = resp.json()
    for entry in mapping.values():
        if entry["ticker"].upper() == ticker.upper():
            return str(entry["cik_str"])
    return None


def fetch_pdufa_history(ticker, days_back=365):
    cik = resolve_cik(ticker)
    if not cik:
        return []

    end_date = datetime.today()
    start_date = end_date - timedelta(days=days_back)

    params = {
        "q": '"PDUFA"',
        "forms": "8-K",
        "ciks": cik.zfill(10),
        "dateRange": "custom",
        "startdt": start_date.strftime("%Y-%m-%d"),
        "enddt": end_date.strftime("%Y-%m-%d"),
    }

    resp = requests.get(EDGAR_FULLTEXT_URL, headers=HEADERS, params=params, timeout=30)
    resp.raise_for_status()
    hits = resp.json().get("hits", {}).get("hits", [])

    seen_dates = set()
    results = []

    for hit in hits:
        accession_id = hit.get("_id")
        url = build_filing_url(cik, accession_id)
        if not url:
            continue

        time.sleep(0.15)

        try:
            text = fetch_filing_text(url)
        except Exception:
            continue

        date_matches = extract_dates_near_pdufa(text)
        for dm in date_matches:
            try:
                parsed = date_parser.parse(dm["matched_date_text"])
            except (ValueError, OverflowError):
                continue

            iso_date = parsed.strftime("%a, %d %b %Y 04:00:00 GMT")
            if iso_date in seen_dates:
                continue
            seen_dates.add(iso_date)

            results.append({
                "date": iso_date,
                "label": f"PDUFA {parsed.month}/{parsed.day}",
            })

    results.sort(key=lambda r: r["date"])
    return results

if __name__ == "__main__":
    run_watch_cycle(days_back=14)