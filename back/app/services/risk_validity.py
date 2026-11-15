from datetime import datetime, timedelta, timezone


def risk_dates(shard, now=None):
    shard = shard or {}
    generated = shard.get("generated_at")
    try:
        start = datetime.fromisoformat(generated.replace("Z", "+00:00"))
        end = start + timedelta(days=int(shard.get("horizon_days", 7)))
        current = start <= (now or datetime.now(timezone.utc)) < end
    except (AttributeError, TypeError, ValueError, OverflowError):
        return {"generated_at": None, "valid_until": None, "current": False}
    return {"generated_at": generated, "valid_until": end.isoformat(),
            "current": current}
