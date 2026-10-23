from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal


def percent(new: int, old: int) -> str:
    return str(((Decimal(new) - old) / old * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def summary(prices: list[dict]) -> dict:
    if not prices:
        return dict(
            latest_price_kopecks=None,
            min_price_kopecks=None,
            max_price_kopecks=None,
            change_kopecks=None,
            change_percent=None,
        )
    values = [p["price_kopecks"] for p in prices]
    return dict(
        latest_price_kopecks=values[-1],
        min_price_kopecks=min(values),
        max_price_kopecks=max(values),
        change_kopecks=values[-1] - values[0] if len(values) > 1 else None,
        change_percent=percent(values[-1], values[0]) if len(values) > 1 else None,
    )


def expected_weeks(dates: list[date]) -> list[date]:
    """Preserve actual observations; expose missing whole weeks without inventing prices."""
    if not dates:
        return []
    result = set(dates)
    point = min(dates)
    while point <= max(dates):
        result.add(point)
        point += timedelta(days=7)
    return sorted(result)


def cost_kopecks(liters: str, price_kopecks: int) -> int:
    volume = Decimal(liters)
    if not volume.is_finite() or volume <= 0 or price_kopecks <= 0:
        raise ValueError("Positive finite volume and price required")
    return int((volume * price_kopecks).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
