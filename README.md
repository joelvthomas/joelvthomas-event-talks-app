# BigQuery Release Notes Console

A premium web application to fetch, search, filter, and share Google BigQuery release notes on X (Twitter). The app is built with Python Flask on the backend, and vanilla HTML, CSS, and JavaScript on the frontend.

## 🚀 Features

*   **Robust Feed Parser**: Automatically fetches and splits the Google Cloud BigQuery release notes Atom feed into individual, category-tagged updates.
*   **Modern Dark Theme UI**: A rich dark mode featuring neon accent tags corresponding to release types (emerald for Features, orange for Changes, hot pink for Issues), custom scrollbars, and smooth keyframe animations.
*   **Search & Dynamic Filters**: Instantly search updates by keywords, or filter by category pills (Features, Changes, Issues, Deprecated, Resolved).
*   **Offline/Connection Safety**: Employs local in-memory caching (10-minute TTL) with automatic fallback and warning toasts if the Google Cloud network feed is temporarily unreachable.
*   **Aggregated Multi-Select & Share**:
    *   **Single Share**: Quick draft compose for single notes.
    *   **Aggregated Draft**: Select multiple updates to compile a bulleted summary.
    *   **Tone Templates**: Instantly switch between *Default*, *Concise*, *Excited*, and *Formal* draft tones.
    *   **URL-Aware Character Counter**: Evaluates length using X's official rules (where all links are replaced by 23-character `t.co` URLs) to prevent false alerts or clipping before sending.
    *   **Direct Broadcast**: Single click to copy to clipboard or open in the X Tweet Composer.

---

## 🛠️ Tech Stack

*   **Backend**: Python, Flask, requests, xml.etree.ElementTree
*   **Frontend**: Vanilla HTML5, Vanilla CSS3 (Custom Variables, Flexbox/Grid, Backdrop Filter Glassmorphism), Vanilla JavaScript (ES6)

---

## 📂 Project Structure

```text
bq-releases-notes/
├── app.py                  # Flask web server, XML parser & caching engine
├── templates/
│   └── index.html          # Semantic HTML layout structure and modal view
├── static/
│   ├── css/
│   │   └── style.css       # Core tokens, custom UI variables & animations
│   └── js/
│       └── app.js          # Main state machine, templates & character length engine
├── requirements.txt        # Python package dependencies
├── .gitignore              # Standard development exclusions file
└── README.md               # Project documentation (this file)
```

---

## ⚙️ Setup and Run Instructions

### 1. Prerequisites
Ensure Python (3.9+) is installed on your system.

### 2. Install Dependencies
Clone the repository and install the required libraries:
```bash
pip install -r requirements.txt
```

### 3. Run the Development Server
Run the Flask server:
```bash
python app.py
```
By default, the server starts locally at **[http://127.0.0.1:5000](http://127.0.0.1:5000)**. Open this address in your web browser to access the console.

---

## 📖 How it Works

### Backend XML Processing
Google Cloud publishes release notes in an Atom feed at `https://docs.cloud.google.com/feeds/bigquery-release-notes.xml`. The feed bundles all entries for a specific day into a single `<entry>` tag.
1. The server requests the XML feed and parses it using `xml.etree.ElementTree`.
2. It loops through each entry and parses the `<content type="html">` body.
3. It identifies separate updates using `<h3>` tags (e.g., `<h3>Feature</h3>`, `<h3>Changed</h3>`).
4. It splits the entries into separate updates, strips standard HTML formatting to create a plain-text preview, and packages it into a JSON structure returned via the `/api/releases` endpoint.
5. In-memory caching minimizes network requests, only refreshing when you explicitly trigger the refresh spinner in the interface.

### Dynamic Tweet Preview Engine
When selecting one or more items to share, the frontend compiles the text:
*   **Default**: `BigQuery Release Note [Date]: 🚀 [Type]: [Summary] Link: [URL] #BigQuery #GoogleCloud`
*   **Concise**: `BigQuery [Type] ([Date]): [Summary] Read more: [URL]`
*   **Excited**: `Awesome BigQuery update! 🚀 📅 Date: [Date] 🛠️ Type: [Type] 👉 [Summary] Details: [URL] #BigQuery`
*   **Formal**: `Google Cloud has published a BigQuery release note on [Date]. Category: [Type] Details: [Summary] Documentation: [URL]`
*   *Note: If multiple items are selected, it dynamically appends bullets and clips the summaries, prioritizing fitting under X's 280 character limit.*
