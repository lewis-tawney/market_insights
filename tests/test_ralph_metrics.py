from datetime import date

import pytest

from app.services.sector_snapshot import compute_ytd_ralph_metrics


def test_compute_ytd_ralph_metrics_basic():
    dates = [
        date(2023, 12, 29),
        date(2024, 1, 2),
        date(2024, 2, 1),
        date(2024, 3, 1),
    ]
    closes = [95.0, 100.0, 120.0, 108.0]

    pct_gain, pct_off, ralph = compute_ytd_ralph_metrics(dates, closes)

    assert pct_gain is not None and round(pct_gain, 2) == 20.0
    assert pct_off is not None and round(pct_off, 2) == 11.11
    assert ralph is not None and round(ralph, 2) == 1.8


def test_compute_ytd_ralph_metrics_handles_high_clamp():
    dates = [date(2024, 1, 2), date(2024, 4, 1)]
    closes = [50.0, 55.0]

    pct_gain, pct_off, ralph = compute_ytd_ralph_metrics(dates, closes)

    assert pct_gain == pytest.approx(10.0)
    assert pct_off == pytest.approx(0.0)
    assert ralph == pytest.approx(10.0)
