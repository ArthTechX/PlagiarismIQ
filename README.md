# PlagiarismIQ — Cosine Similarity Plagiarism Detector

A geometric overlap calculator that vectorizes documents using **TF-IDF** and computes the **cosine angle** between their spatial vectors to produce an exact similarity percentage.

## Architecture

```
PlagarismDetector/
├── backend/
│   ├── app.py           # Flask REST API (port 5000)
│   ├── vectorizer.py    # TF-IDF + Cosine Similarity engine (pure Python)
│   └── requirements.txt
├── frontend/
│   ├── index.html       # Single-page application
│   ├── style.css        # Premium dark theme
│   └── app.js           # UI logic
└── README.md
```

## How It Works

1. **Tokenize** — lowercase, remove punctuation & stop words
2. **TF (Term Frequency)** — `count(t) / total_tokens`
3. **IDF (Inverse Document Frequency)** — `log((1+N)/(1+df)) + 1`
4. **TF-IDF Vector** — `TF × IDF` per term per document
5. **Cosine Similarity** — `(A·B) / (||A|| × ||B||)` → percentage

## Quick Start

### 1. Install dependencies
```powershell
cd backend
pip install -r requirements.txt
```

### 2. Start the API
```powershell
python app.py
```

### 3. Open the UI
Open `frontend/index.html` in your browser.

## API Reference

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/analyze` | `{ text_a, text_b }` JSON | Analyze two text strings |
| `POST` | `/api/analyze-files` | `file_a`, `file_b` multipart | Analyze two uploaded files |
| `GET`  | `/api/health` | — | Health check |

### Example Response
```json
{
  "similarity_percent": 73.42,
  "cosine_angle_degrees": 42.71,
  "raw_cosine": 0.734213,
  "tokens_a": 284,
  "tokens_b": 311,
  "unique_terms_a": 98,
  "unique_terms_b": 107,
  "shared_terms": 61,
  "top_overlapping_terms": [...],
  "all_term_weights": [...]
}
```
