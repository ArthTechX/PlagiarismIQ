"""
vectorizer.py
=============
Pure-Python TF-IDF vectorization + Cosine Similarity engine.

Steps:
  1. Tokenise & clean text
  2. Build Term Frequency (TF) vectors for each document
  3. Compute Inverse Document Frequency (IDF) across the corpus
  4. Produce TF-IDF weighted vectors
  5. Compute cosine similarity = (A · B) / (|A| * |B|)
"""

import math
import re
from collections import Counter
from typing import List, Tuple, Dict


# ---------------------------------------------------------------------------
# Stop-word list (lightweight)
# ---------------------------------------------------------------------------
STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "need",
    "dare", "ought", "used", "it", "its", "this", "that", "these", "those",
    "i", "me", "my", "we", "our", "you", "your", "he", "him", "his", "she",
    "her", "they", "them", "their", "what", "which", "who", "whom", "not",
    "no", "nor", "so", "yet", "both", "either", "neither", "each", "more",
    "most", "other", "some", "such", "than", "then", "there", "when", "where",
    "while", "if", "though", "although", "because", "since", "unless",
    "until", "after", "before", "about", "above", "below", "between", "into",
    "through", "during", "without", "within", "along", "following", "across",
    "s", "t", "re", "ve", "ll", "d", "m",
}


def tokenize(text: str) -> List[str]:
    """
    Lowercase, strip punctuation, split on whitespace, remove stop words
    and very short tokens.
    """
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = text.split()
    return [t for t in tokens if t not in STOP_WORDS and len(t) > 1]


def term_frequency(tokens: List[str]) -> Dict[str, float]:
    """
    Compute normalised TF: count(term) / total_terms.
    Returns dict of {term: tf_score}.
    """
    if not tokens:
        return {}
    counts = Counter(tokens)
    total = len(tokens)
    return {term: count / total for term, count in counts.items()}


def inverse_document_frequency(documents: List[List[str]]) -> Dict[str, float]:
    """
    IDF(term) = log( (1 + N) / (1 + df(term)) ) + 1   [sklearn smooth variant]
    N = number of documents.
    """
    n = len(documents)
    doc_freq: Dict[str, int] = Counter()
    for doc_tokens in documents:
        for term in set(doc_tokens):
            doc_freq[term] += 1
    idf = {
        term: math.log((1 + n) / (1 + df)) + 1
        for term, df in doc_freq.items()
    }
    return idf


def tfidf_vector(tf: Dict[str, float], idf: Dict[str, float]) -> Dict[str, float]:
    """Element-wise product of TF and IDF."""
    return {term: tf_val * idf.get(term, 0) for term, tf_val in tf.items()}


def cosine_similarity(vec_a: Dict[str, float], vec_b: Dict[str, float]) -> float:
    """
    cosine(A, B) = (A · B) / (||A|| * ||B||)
    Returns a value in [0, 1].
    """
    if not vec_a or not vec_b:
        return 0.0

    # Dot product — only iterate over common terms
    common_terms = set(vec_a.keys()) & set(vec_b.keys())
    dot_product = sum(vec_a[t] * vec_b[t] for t in common_terms)

    # Magnitudes
    mag_a = math.sqrt(sum(v ** 2 for v in vec_a.values()))
    mag_b = math.sqrt(sum(v ** 2 for v in vec_b.values()))

    if mag_a == 0 or mag_b == 0:
        return 0.0

    similarity = dot_product / (mag_a * mag_b)
    # Clamp to [0, 1] to handle float precision issues
    return max(0.0, min(1.0, similarity))


def cosine_angle_degrees(similarity: float) -> float:
    """Return the angle θ in degrees such that cos(θ) = similarity."""
    clamped = max(-1.0, min(1.0, similarity))
    return math.degrees(math.acos(clamped))


def top_overlapping_terms(
    vec_a: Dict[str, float],
    vec_b: Dict[str, float],
    n: int = 20
) -> List[Dict]:
    """
    Return the top-N terms that contribute most to the similarity,
    sorted by joint TF-IDF weight (geometric mean of both vectors).
    """
    common = set(vec_a.keys()) & set(vec_b.keys())
    scored = []
    for term in common:
        joint_score = math.sqrt(vec_a[term] * vec_b[term])
        scored.append({
            "term": term,
            "score_a": round(vec_a[term], 6),
            "score_b": round(vec_b[term], 6),
            "joint_score": round(joint_score, 6),
        })
    scored.sort(key=lambda x: x["joint_score"], reverse=True)
    return scored[:n]


def all_term_weights(
    vec_a: Dict[str, float],
    vec_b: Dict[str, float]
) -> List[Dict]:
    """
    Return all terms from both vectors with their weights.
    """
    all_terms = set(vec_a.keys()) | set(vec_b.keys())
    rows = []
    for term in sorted(all_terms):
        rows.append({
            "term": term,
            "weight_a": round(vec_a.get(term, 0.0), 6),
            "weight_b": round(vec_b.get(term, 0.0), 6),
            "shared": term in vec_a and term in vec_b,
        })
    rows.sort(key=lambda x: (not x["shared"], -max(x["weight_a"], x["weight_b"])))
    return rows


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze(text_a: str, text_b: str) -> dict:
    """
    Full pipeline: tokenise → TF → IDF → TF-IDF → cosine similarity.

    Returns a structured result dict.
    """
    tokens_a = tokenize(text_a)
    tokens_b = tokenize(text_b)

    if not tokens_a or not tokens_b:
        return {
            "similarity_percent": 0.0,
            "cosine_angle_degrees": 90.0,
            "raw_cosine": 0.0,
            "tokens_a": 0,
            "tokens_b": 0,
            "unique_terms_a": 0,
            "unique_terms_b": 0,
            "shared_terms": 0,
            "top_overlapping_terms": [],
            "all_term_weights": [],
            "error": "One or both documents are empty after preprocessing.",
        }

    tf_a = term_frequency(tokens_a)
    tf_b = term_frequency(tokens_b)

    idf = inverse_document_frequency([tokens_a, tokens_b])

    vec_a = tfidf_vector(tf_a, idf)
    vec_b = tfidf_vector(tf_b, idf)

    sim = cosine_similarity(vec_a, vec_b)
    angle = cosine_angle_degrees(sim)
    shared = len(set(vec_a.keys()) & set(vec_b.keys()))

    return {
        "similarity_percent": round(sim * 100, 4),
        "cosine_angle_degrees": round(angle, 4),
        "raw_cosine": round(sim, 6),
        "tokens_a": len(tokens_a),
        "tokens_b": len(tokens_b),
        "unique_terms_a": len(vec_a),
        "unique_terms_b": len(vec_b),
        "shared_terms": shared,
        "top_overlapping_terms": top_overlapping_terms(vec_a, vec_b),
        "all_term_weights": all_term_weights(vec_a, vec_b),
        "error": None,
    }
