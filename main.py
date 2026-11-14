import ast
import gzip
import ijson
import os
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from statistics import fmean

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data.json"
COMPRESSED_DATA_PATH = ROOT / "data.json.gz"


def _load_dataset():
    configured_path = os.getenv("CULINARPULSE_DATASET_PATH")
    dataset_path = (
        Path(configured_path)
        if configured_path
        else DATA_PATH if DATA_PATH.exists() else COMPRESSED_DATA_PATH
    )
    opener = gzip.open if dataset_path.suffix.lower() == ".gz" else open
    try:
        with opener(dataset_path, "rb") as file:
            metadata = next(ijson.items(file, "metadata", use_float=True), None)
        with opener(dataset_path, "rb") as file:
            businesses = list(ijson.items(file, "businesses.item", use_float=True))
    except (OSError, ijson.common.JSONError) as error:
        return None, f"Could not load curated dataset at {dataset_path}: {error}"
    dataset = {"metadata": metadata, "businesses": businesses}
    if not isinstance(dataset, dict) or not isinstance(dataset.get("metadata"), dict):
        return None, "data.json does not have the curated dataset format; run review_pipeline.py --phase all."
    businesses = dataset.get("businesses")
    if not isinstance(businesses, list) or not businesses:
        return None, "data.json has no curated restaurant businesses; run review_pipeline.py --phase all."
    if any(not isinstance(item, dict) or not item.get("business_id") for item in businesses):
        return None, "data.json contains an invalid business record."
    return dataset, None


DATASET, DATASET_ERROR = _load_dataset()
BUSINESSES_BY_ID = {
    item["business_id"]: item for item in (DATASET["businesses"] if DATASET else [])
}


def _build_city_sentiment_counts(businesses):
    counts_by_business = {}
    total_counts = Counter()
    for business in businesses:
        counts = Counter()
        for review in business.get("reviews", []):
            sentiment = review.get("sentiment_class", "neutral")
            counts[sentiment if sentiment in ("positive", "neutral", "negative") else "neutral"] += 1
        counts_by_business[business["business_id"]] = counts
        total_counts.update(counts)
    return counts_by_business, total_counts


CITY_SENTIMENT_COUNTS_BY_BUSINESS, CITY_SENTIMENT_COUNTS = _build_city_sentiment_counts(
    DATASET["businesses"] if DATASET else []
)


def _normalize_attribute(value):
    if not isinstance(value, str):
        return value
    try:
        return ast.literal_eval(value)
    except (SyntaxError, ValueError):
        return value.strip()


def _business_attributes(business):
    attributes = business.get("attributes") or {}
    if not isinstance(attributes, dict):
        return {}
    return {key: _normalize_attribute(value) for key, value in attributes.items()}


def _primary_category(categories):
    values = [value.strip() for value in (categories or "").split(",") if value.strip()]
    generic_categories = {
        "restaurants", "food", "nightlife", "bars", "event planning & services",
        "caterers", "hotels & travel", "live/raw food",
    }
    return next(
        (value for value in values if value.casefold() not in generic_categories),
        next((value for value in values if value.casefold() != "restaurants"), None),
    )


def _price_range(business):
    value = _business_attributes(business).get("RestaurantsPriceRange2")
    try:
        price = int(value)
    except (TypeError, ValueError):
        return None
    return price if 1 <= price <= 4 else None


def _sentiment_share(reviews):
    counts = Counter(
        review.get("sentiment_class", "neutral")
        if review.get("sentiment_class") in ("positive", "neutral", "negative")
        else "neutral"
        for review in reviews
    )
    total = sum(counts.values())
    return {
        "review_count": total,
        "positive": counts["positive"] / total if total else None,
        "neutral": counts["neutral"] / total if total else None,
        "negative": counts["negative"] / total if total else None,
    }


def _group_sentiment_benchmark(business, businesses, selector, group_value, dimension):
    peers = [
        item for item in businesses
        if item["business_id"] != business["business_id"] and selector(item) == group_value
    ]
    summaries = [_sentiment_share(item.get("reviews", [])) for item in peers]
    available = [summary for summary in summaries if summary["review_count"]]
    return {
        dimension: group_value,
        "restaurant_count": len(available),
        "review_count": sum(summary["review_count"] for summary in available),
        **{
            label: round(fmean(summary[label] for summary in available), 4) if available else None
            for label in ("positive", "neutral", "negative")
        },
    }


def _weighted_sentiment(reviews):
    weighted_total = 0.0
    weight_sum = 0
    unweighted_scores = []
    for review in reviews:
        try:
            score = float(review.get("sentiment_compound", 0))
            useful = max(0, int(review.get("useful") or 0))
        except (TypeError, ValueError):
            continue
        weighted_total += score * useful
        weight_sum += useful
        unweighted_scores.append(score)
    if weight_sum:
        score = weighted_total / weight_sum
    elif unweighted_scores:
        score = fmean(unweighted_scores)
    else:
        score = None
    return {
        "score": round((score + 1) * 50, 1) if score is not None else None,
        "sentiment_score": round(score, 4) if score is not None else None,
        "weight_sum": weight_sum,
        "review_count": len(unweighted_scores),
        "used_unweighted_fallback": bool(unweighted_scores) and not weight_sum,
    }


def _weekday_trends(reviews):
    counts = {day: Counter() for day in (
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    )}
    for review in reviews:
        try:
            day = datetime.strptime((review.get("review_date") or "")[:10], "%Y-%m-%d").strftime("%A")
        except ValueError:
            continue
        sentiment = review.get("sentiment_class", "neutral")
        counts[day][sentiment if sentiment in ("positive", "neutral", "negative") else "neutral"] += 1
    return [
        {
            "day": day,
            "count": sum(day_counts.values()),
            "positive": day_counts["positive"],
            "neutral": day_counts["neutral"],
            "negative": day_counts["negative"],
            "negative_share": round(day_counts["negative"] / sum(day_counts.values()), 4)
            if sum(day_counts.values()) else None,
        }
        for day, day_counts in counts.items()
    ]


def _attribute_mismatches(business, reviews, minimum_mentions=3):
    attributes = _business_attributes(business)
    signals = []
    noise = str(attributes.get("NoiseLevel") or "").casefold()
    if noise in {"quiet", "very_quiet"}:
        signals.append((
            "Quiet environment",
            "NoiseLevel is listed as quiet, but reviews describe disruptive noise or loud music.",
            re.compile(r"\b(?:noise|noisy|loud|music|volume)\b", re.IGNORECASE),
            {"Atmosphere and decor"},
        ))

    wifi = str(attributes.get("WiFi") or "").casefold()
    if wifi == "free":
        signals.append((
            "Free Wi-Fi",
            "Wi-Fi is listed as free, but reviews report a Wi-Fi or internet problem.",
            re.compile(r"\b(?:wi[\s-]?fi|internet|wireless|connection)\b", re.IGNORECASE),
            set(),
        ))

    parking = attributes.get("BusinessParking")
    if isinstance(parking, dict) and any(value is True for value in parking.values()):
        signals.append((
            "Parking availability",
            "Parking is listed as available, but reviews report a parking or access problem.",
            re.compile(r"\b(?:parking|garage|valet|parking lot)\b", re.IGNORECASE),
            {"Parking and access"},
        ))

    mismatches = []
    for claim, explanation, pattern, aspect_names in signals:
        matching_reviews = set()
        for review in reviews:
            for aspect in review.get("aspects") or []:
                if not isinstance(aspect, dict):
                    continue
                try:
                    aspect_score = float(aspect.get("sentiment_score") or 0)
                except (TypeError, ValueError):
                    continue
                if (
                    aspect_score < -0.05
                    and (not aspect_names or aspect.get("aspect_name") in aspect_names)
                    and pattern.search(str(aspect.get("mention_text") or ""))
                ):
                    matching_reviews.add(review.get("review_id") or id(review))
                    break
            try:
                review_score = float(review.get("sentiment_compound") or 0)
            except (TypeError, ValueError):
                review_score = 0
            if not aspect_names and review_score < -0.05 and pattern.search(str(review.get("text") or "")):
                matching_reviews.add(review.get("review_id") or id(review))
        if len(matching_reviews) >= minimum_mentions:
            mismatches.append({
                "claim": claim,
                "negative_mentions": len(matching_reviews),
                "message": explanation,
            })
    return mismatches


app = FastAPI(title="CulinaryPulse Review Intelligence", version="3.0.0")
cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "https://culinarypulse.netlify.app,http://localhost:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_dataset():
    if DATASET is None:
        raise HTTPException(status_code=503, detail=DATASET_ERROR)
    return DATASET


@app.get("/")
def health():
    return {"service": "CulinaryPulse", "status": "ok" if DATASET else "dataset_unavailable"}


@app.get("/api/status")
def get_status():
    dataset = _require_dataset()
    metadata = dataset["metadata"]
    review_count = metadata.get("review_count")
    if review_count is None:
        review_count = sum(len(item.get("reviews", [])) for item in dataset["businesses"])
    return {
        "ready": True,
        "phase": "ready",
        "processed_reviews": review_count,
        "total_reviews": review_count,
        "business_count": metadata.get("selected_business_count", len(BUSINESSES_BY_ID)),
        "review_count": review_count,
        "city": metadata.get("city"),
        "message": "Curated city review dataset loaded",
        "updated_at": metadata.get("created_at"),
    }


@app.get("/api/restaurants")
def get_restaurants(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
):
    _require_dataset()
    search = q.strip().casefold()
    businesses = list(BUSINESSES_BY_ID.values())
    if search:
        businesses = [
            item for item in businesses
            if search in " ".join(
                str(item.get(field) or "")
                for field in ("name", "city", "state", "categories")
            ).casefold()
        ]
    businesses.sort(
        key=lambda item: (-int(item.get("review_count") or 0), item.get("name") or "")
    )
    return [
        {
            "id": item["business_id"],
            "name": item.get("name"),
            "city": item.get("city"),
            "state": item.get("state"),
            "stars": item.get("stars"),
            "review_count": item.get("review_count"),
            "categories": item.get("categories"),
            "latitude": item.get("latitude"),
            "longitude": item.get("longitude"),
            "primary_category": _primary_category(item.get("categories")),
            "price_range": _price_range(item),
        }
        for item in businesses[:limit]
    ]


@app.get("/api/analyze/{business_id}")
def get_analysis(business_id: str):
    dataset = _require_dataset()
    business = BUSINESSES_BY_ID.get(business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    reviews = business.get("reviews", [])
    sentiment_counts = Counter(
        review.get("sentiment_class", "neutral")
        if review.get("sentiment_class") in ("positive", "neutral", "negative")
        else "neutral"
        for review in reviews
    )
    aspect_mentions = defaultdict(list)
    monthly_counts = Counter()
    monthly_sentiment_counts = defaultdict(Counter)
    dated_reviews = []

    for review in reviews:
        sentiment = review.get("sentiment_class", "neutral")
        if sentiment not in ("positive", "neutral", "negative"):
            sentiment = "neutral"
        review_date = (review.get("review_date") or "")[:10]
        try:
            dated_reviews.append(datetime.strptime(review_date, "%Y-%m-%d"))
        except ValueError:
            pass
        review_month = (review.get("review_date") or "")[:7]
        if len(review_month) == 7:
            try:
                datetime.strptime(review_month, "%Y-%m")
            except ValueError:
                pass
            else:
                monthly_counts[review_month] += 1
                monthly_sentiment_counts[review_month][sentiment] += 1
        for aspect in review.get("aspects") or []:
            if isinstance(aspect, dict) and aspect.get("aspect_name"):
                aspect_mentions[aspect["aspect_name"]].append(aspect)

    aspects = []
    for name, mentions in aspect_mentions.items():
        scores = [float(item.get("sentiment_score", 0)) for item in mentions]
        positive_scores = [score for score in scores if score > 0.05]
        negative_scores = [score for score in scores if score < -0.05]
        aspects.append({
            "aspect": name,
            "score": round((fmean(scores) + 1) / 2, 3),
            "sentiment_score": round(fmean(scores), 3),
            "mentions": len(mentions),
            "positive_mentions": len(positive_scores),
            "negative_mentions": len(negative_scores),
            "positive_sentiment_score": round(fmean(positive_scores), 3) if positive_scores else None,
            "negative_sentiment_score": round(fmean(negative_scores), 3) if negative_scores else None,
        })
    aspects.sort(key=lambda item: (-item["mentions"], item["aspect"]))
    top_positive = sorted(
        (item for item in aspects if item["positive_mentions"]),
        key=lambda item: (-item["positive_mentions"], -(item["positive_sentiment_score"] or 0)),
    )[:10]
    top_negative = sorted(
        (item for item in aspects if item["negative_mentions"]),
        key=lambda item: (-item["negative_mentions"], item["negative_sentiment_score"] or 0),
    )[:10]

    historical_monthly = _complete_monthly_series(monthly_counts, monthly_sentiment_counts)
    businesses = dataset["businesses"]
    primary_category = _primary_category(business.get("categories"))
    price_range = _price_range(business)
    cuisine_benchmark = (
        _group_sentiment_benchmark(
            business, businesses, lambda item: _primary_category(item.get("categories")),
            primary_category, "category",
        )
        if primary_category else None
    )
    price_benchmark = (
        _group_sentiment_benchmark(business, businesses, _price_range, price_range, "price_range")
        if price_range is not None else None
    )
    peer_counts = CITY_SENTIMENT_COUNTS.copy()
    peer_counts.subtract(CITY_SENTIMENT_COUNTS_BY_BUSINESS.get(business_id, Counter()))
    peer_review_count = sum(peer_counts.get(label, 0) for label in ("positive", "neutral", "negative"))
    review_date_range = {
        "first": min(dated_reviews).strftime("%Y-%m-%d") if dated_reviews else None,
        "last": max(dated_reviews).strftime("%Y-%m-%d") if dated_reviews else None,
    }
    report = _build_report(business.get("name", "Restaurant"), len(reviews), top_positive, top_negative)
    info = {
        "id": business_id,
        "name": business.get("name"),
        "city": business.get("city"),
        "state": business.get("state"),
        "stars": business.get("stars"),
        "total_reviews": len(reviews),
        "review_date_range": review_date_range,
        "source_review_count": business.get("review_count"),
        "is_open": business.get("is_open"),
        "latitude": business.get("latitude"),
        "longitude": business.get("longitude"),
        "categories": business.get("categories"),
        "attributes": business.get("attributes") or {},
        "primary_category": primary_category,
        "price_range": price_range,
    }
    return {
        "info": info,
        "analysis": {
            "sentiment": {
                "positive": sentiment_counts.get("positive", 0),
                "neutral": sentiment_counts.get("neutral", 0),
                "negative": sentiment_counts.get("negative", 0),
            },
            "sentiment_benchmark": {
                "restaurant_count": max(0, len(BUSINESSES_BY_ID) - 1),
                "review_count": peer_review_count,
                "positive": round(peer_counts.get("positive", 0) / peer_review_count, 4) if peer_review_count else None,
                "neutral": round(peer_counts.get("neutral", 0) / peer_review_count, 4) if peer_review_count else None,
                "negative": round(peer_counts.get("negative", 0) / peer_review_count, 4) if peer_review_count else None,
            },
            "cuisine_benchmark": cuisine_benchmark,
            "price_benchmark": price_benchmark,
            "weighted_sentiment": _weighted_sentiment(reviews),
            "attribute_mismatches": _attribute_mismatches(business, reviews),
            "weekday_trends": _weekday_trends(reviews),
            "tips": business.get("tips") or [],
            "aspects": aspects,
            "positive_aspects": top_positive,
            "negative_aspects": top_negative,
            "historical_monthly": historical_monthly[-36:],
            "report": report,
        },
    }


@app.get("/api/reviews")
def get_reviews(
    business_id: str = Query(min_length=1, max_length=64),
    sentiment: str = Query(default="all", pattern="^(all|positive|negative|neutral)$"),
    reviewer_type: str = Query(default="all", pattern="^(all|elite|regular)$"),
    q: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    _require_dataset()
    business = BUSINESSES_BY_ID.get(business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    search = q.strip().casefold()
    reviews = [
        review for review in business.get("reviews", [])
        if (sentiment == "all" or review.get("sentiment_class") == sentiment)
        and (
            reviewer_type == "all"
            or review.get("is_elite") is (reviewer_type == "elite")
        )
        and (
            not search
            or search in str(review.get("review_id") or "").casefold()
            or search in str(review.get("text") or "").casefold()
        )
    ]
    reviews.sort(
        key=lambda review: (review.get("review_date") or "", review.get("review_id") or ""),
        reverse=True,
    )
    total = len(reviews)
    start = (page - 1) * page_size
    page_reviews = reviews[start:start + page_size]
    return {
        "business_id": business_id,
        "sentiment": sentiment,
        "reviewer_type": reviewer_type,
        "page": page,
        "page_size": page_size,
        "total": total,
        "reviewer_segmentation_available": any(
            review.get("is_elite") is not None for review in business.get("reviews", [])
        ),
        "reviews": [
            {
                "review_id": review.get("review_id"),
                "user_id": review.get("user_id"),
                "business_id": review.get("business_id"),
                "stars": review.get("stars"),
                "date": review.get("review_date"),
                "useful": review.get("useful", 0),
                "funny": review.get("funny", 0),
                "cool": review.get("cool", 0),
                "text": review.get("text", ""),
                "sentiment_score": review.get("sentiment_compound"),
                "sentiment": review.get("sentiment_class", "neutral"),
                "is_elite": review.get("is_elite"),
                "reviewer_review_count": review.get("reviewer_review_count"),
                "aspects": review.get("aspects") or [],
            }
            for review in page_reviews
        ],
    }


@app.get("/api/topics")
def get_topics():
    metadata = _require_dataset()["metadata"]
    lda_topics = metadata.get("lda_topics", [])
    bertopic = metadata.get("bertopic_topics", {})
    llm_aspects = metadata.get("llm_topic_aspects", [])
    return {
        "ready": bool(metadata.get("topics_completed")),
        "lda": lda_topics,
        "bertopic": bertopic,
        "llm_aspects": llm_aspects,
        "llm_model": metadata.get("llm_model"),
    }


def _complete_monthly_series(monthly_counts, monthly_sentiment_counts=None):
    months = []
    for month in monthly_counts:
        try:
            months.append(datetime.strptime(month, "%Y-%m"))
        except ValueError:
            continue
    if not months:
        return []

    first_month = min(months)
    last_month = max(months)
    span = (last_month.year - first_month.year) * 12 + last_month.month - first_month.month
    result = []
    for offset in range(span + 1):
        year = first_month.year + (first_month.month - 1 + offset) // 12
        month = (first_month.month - 1 + offset) % 12 + 1
        month_year = f"{year:04d}-{month:02d}"
        count = int(monthly_counts.get(month_year, 0))
        month_sentiments = (monthly_sentiment_counts or {}).get(month_year, {})
        row = {"month_year": month_year, "count": count}
        for sentiment in ("positive", "neutral", "negative"):
            sentiment_count = int(month_sentiments.get(sentiment, 0))
            row[sentiment] = sentiment_count
            row[f"{sentiment}_share"] = round(sentiment_count / count, 4) if count else None
        result.append(row)
    return result


def _build_report(name, review_count, positive_aspects, negative_aspects):
    if not review_count:
        return f"No reviews have been curated for {name}."
    positive = ", ".join(item["aspect"] for item in positive_aspects[:3]) or "no consistently positive aspect yet"
    negative = ", ".join(item["aspect"] for item in negative_aspects[:3]) or "no recurring negative aspect yet"
    return (
        f"Reviewed {review_count:,} Yelp reviews for {name}. Customers most often praise {positive}; "
        f"the most frequent negative signals are {negative}. Use these themes to prioritize team follow-up, "
        f"review guest feedback, and monitor the operational areas customers mention most often."
    )
