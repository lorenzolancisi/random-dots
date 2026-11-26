"""Generates tests/fixtures/numpy_crosscheck.json: reference statistics computed with numpy,
independently of the JavaScript implementation. Run once; the JSON is committed so the JS tests
do not need Python at runtime.

Reference definitions:
  mean        numpy.mean
  median      numpy.median
  sd          numpy.std(ddof=1)            (sample SD, n-1)
  q1, q3      numpy.percentile(method='linear')   == Hyndman-Fan type 7
"""
import json
import pathlib
import numpy as np

rng = np.random.default_rng(20261125)
cases = []
for n in list(range(1, 13)) * 12 + [20, 50, 100] * 5:
    xs = rng.integers(60, 400, size=n).astype(float)
    # sprinkle ties
    if n > 4 and rng.random() < 0.4:
        xs[1] = xs[0]
    target = float(rng.integers(180, 221))
    c = {
        "values": xs.tolist(),
        "target": target,
        "mean": float(np.mean(xs)),
        "median": float(np.median(xs)),
        "sd": float(np.std(xs, ddof=1)) if n >= 2 else None,
        "q1": float(np.percentile(xs, 25, method="linear")),
        "q3": float(np.percentile(xs, 75, method="linear")),
        "abs_error_of_mean": float(abs(np.mean(xs) - target)),
        "abs_error_of_median": float(abs(np.median(xs) - target)),
    }
    cases.append(c)

out = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "numpy_crosscheck.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({"numpy_version": np.__version__, "cases": cases}))
print(f"wrote {len(cases)} cases with numpy {np.__version__} to {out}")
