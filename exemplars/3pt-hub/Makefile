# hub-workspace exemplar · targets. Deploys UNGATED (from inside _site/, so functions/ is not
# compiled): this is the public demo. A real instance deploys from this directory so the gate ships.
.PHONY: stage check preview deploy
stage:            ## build _site/ = site/ + docs/ + the skill's own documents
	@bash tools/stage.sh
check: stage      ## lint the IA, the Viewer, the diagrams
	@node tools/check-nav.mjs
	@node tools/check-view.mjs
	@node tools/check-diagram.mjs
preview: stage    ## serve _site/ with Pages-style routing at http://127.0.0.1:8000/
	@python3 tools/serve.py 8000
deploy: check     ## public demo: no gate
	@cd _site && npx wrangler pages deploy . --project-name=hub-workspace --branch=main --commit-dirty=true
