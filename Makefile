.PHONY: setup demo validate serve test
PY ?= python

setup:            ## install runtime deps (use a virtualenv)
	$(PY) -m pip install -r requirements.txt

demo:             ## write SYNTHETIC demo data (refuses to overwrite real notebook output)
	$(PY) scripts/generate_demo_data.py

validate:         ## check that notebooks/dashboard_data/ matches what the dashboard reads
	$(PY) scripts/validate_dashboard_data.py

serve:            ## serve the repo root -> http://localhost:8000/dashboard/
	$(PY) -m http.server 8000

test:             ## demo data + schema check + dashboard smoke test (needs `npm install`)
	$(PY) scripts/generate_demo_data.py --out .tmp_demo --force
	$(PY) scripts/validate_dashboard_data.py .tmp_demo
	node tests/dashboard_smoke.js .tmp_demo
