import re
import html as html_lib
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# In-memory cache for release notes
cache = {
    "data": None,
    "last_updated": None
}
CACHE_TTL_SECONDS = 600  # 10 minutes cache
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def strip_html_tags(html):
    """
    Converts HTML content to clean, plain text for tweets.
    Retains link information by appending URLs in parentheses next to the anchor text.
    """
    if not html:
        return ""
    # Remove script and style tags and content
    html = re.sub(r'<(script|style).*?>.*?</\1>', '', html, flags=re.DOTALL|re.IGNORECASE)
    # Convert <a href="url">text</a> to "text (url)"
    html = re.sub(r'<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)</a>', r'\2 (\1)', html, flags=re.IGNORECASE)
    # Convert line breaks and paragraph closings to newlines
    html = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
    html = re.sub(r'</?(p|div|h\d|li|ul|ol).*?>', '\n', html, flags=re.IGNORECASE)
    # Strip remaining tags
    html = re.sub(r'<[^>]+>', '', html)
    # Unescape HTML entities (e.g. &amp;, &lt;, &gt;)
    text = html_lib.unescape(html)
    # Clean up whitespace and newlines
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join([l for l in lines if l])

def parse_release_notes(xml_text):
    """
    Parses the Atom feed XML text and extracts individual release updates.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"XML Parsing Error: {e}")
        return []

    # Namespace dictionary for Atom
    namespaces = {'atom': 'http://www.w3.org/2005/Atom'}
    entries = root.findall('atom:entry', namespaces)
    
    all_updates = []
    
    for entry in entries:
        title = entry.find('atom:title', namespaces)
        entry_title = title.text.strip() if title is not None and title.text else "Release Note"
        
        link_elem = entry.find("atom:link[@rel='alternate']", namespaces)
        if link_elem is None:
            link_elem = entry.find("atom:link", namespaces)
        entry_link = link_elem.attrib.get('href', '') if link_elem is not None else ''
        
        updated_elem = entry.find('atom:updated', namespaces)
        date_raw = updated_elem.text.strip() if updated_elem is not None and updated_elem.text else ''
        
        content_elem = entry.find('atom:content', namespaces)
        content_html = content_elem.text.strip() if content_elem is not None and content_elem.text else ''
        
        if not content_html:
            continue
            
        # Parse individual updates inside the entry content
        matches = list(re.finditer(r'<h3>(.*?)</h3>', content_html, re.IGNORECASE))
        
        if not matches:
            # No h3 tags, treat the entire content as a single update
            clean_html = content_html
            all_updates.append({
                "id": f"{date_raw}_0",
                "date_raw": date_raw,
                "date_display": entry_title,
                "link": entry_link,
                "type": "Update",
                "content_html": clean_html,
                "content_text": strip_html_tags(clean_html)
            })
        else:
            for idx, match in enumerate(matches):
                start_idx = match.end()
                end_idx = matches[idx + 1].start() if idx + 1 < len(matches) else len(content_html)
                
                update_type = match.group(1).strip()
                update_html = content_html[start_idx:end_idx].strip()
                
                all_updates.append({
                    "id": f"{date_raw}_{idx}",
                    "date_raw": date_raw,
                    "date_display": entry_title,
                    "link": f"{entry_link}#{entry_title.replace(' ', '_')}" if entry_link else "",
                    "type": update_type,
                    "content_html": update_html,
                    "content_text": strip_html_tags(update_html)
                })
                
    return all_updates

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    now = datetime.now()
    
    # Check cache validity
    is_cache_valid = (
        cache["data"] is not None and 
        cache["last_updated"] is not None and 
        (now - cache["last_updated"]).total_seconds() < CACHE_TTL_SECONDS
    )
    
    if not force_refresh and is_cache_valid:
        return jsonify({
            "status": "success",
            "source": "cache",
            "last_updated": cache["last_updated"].isoformat(),
            "data": cache["data"]
        })
        
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
        response = requests.get(FEED_URL, headers=headers, timeout=15)
        response.raise_for_status()
        
        releases = parse_release_notes(response.text)
        
        # Update cache
        cache["data"] = releases
        cache["last_updated"] = now
        
        return jsonify({
            "status": "success",
            "source": "network",
            "last_updated": now.isoformat(),
            "data": releases
        })
    except requests.RequestException as e:
        print(f"Network error fetching feed: {e}")
        # Fallback to cache if network fails, even if expired
        if cache["data"] is not None:
            return jsonify({
                "status": "warning",
                "message": f"Network error ({e}). Serving expired cache.",
                "source": "cache_fallback",
                "last_updated": cache["last_updated"].isoformat(),
                "data": cache["data"]
            })
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch release notes: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
