# Native libraries for the serverless runtime

`libexpat.so.1`: expat 2.5.0 from AlmaLinux 8 (`expat-2.5.0-6.el8_10`,
x86_64, needs glibc >= 2.25). sha256
ab102d495f5a86dfe5474a0e7fcd860b6e77da1051cc1d964ff9610916dec75a.

The rasterio wheel's GDAL links against the system libexpat, which Vercel's
Python runtime does not ship (`ImportError: libexpat.so.1: cannot open shared
object file`). `app/routers/field.py` preloads this copy with `RTLD_GLOBAL`
before importing the satellite modules; where the system already has
libexpat, it is not used.
