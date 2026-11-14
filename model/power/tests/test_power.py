import numpy as np
import pandas as pd
import pytest

from fetch_power import clean_fill, gridpoint_h3, attach_h3, VARIABLES


def test_h3_r5_mapping():
    assert gridpoint_h3(-28.5, -57.8) == "85a963c3fffffff"


def test_fill_value_becomes_null():
    arr = np.array([12.5, -999.0, -9999.0, np.nan], dtype=np.float32)
    df = pd.DataFrame(
        {"lat": [-28.5, -28.5, -28.5, -28.5], "lon": [-57.8] * 4,
         "date": pd.to_datetime(["2024-01-01"] * 4).date,
         "T2M_MAX": clean_fill(arr)}
    )
    out = attach_h3(df)
    assert out["T2M_MAX"].isna().sum() == 3
    assert out["h3_r5"].iloc[0] == "85a963c3fffffff"


@pytest.mark.slow
def test_zarr_smoke_one_day():
    """One day of T2M_MAX for the Argentina bbox from the discovered store."""
    import xarray as xr

    ds = xr.open_zarr(
        "s3://nasa-power/merra2/temporal/power_merra2_daily_temporal_utc.zarr",
        storage_options={"anon": True,
                         "client_kwargs": {"region_name": "us-west-2"}},
        consolidated=True,
    )
    day = ds["T2M_MAX"].sel(
        lat=slice(-56.0, -21.0), lon=slice(-74.0, -53.0),
        time=slice("2024-01-01", "2024-01-01"),
    ).load()
    assert day.count().item() > 0
    assert day.size > 0
