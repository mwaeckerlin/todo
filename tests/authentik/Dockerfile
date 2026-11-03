ARG AUTHENTIK_TAG=2026.8.5
# The vendor publishes release tags and no latest tag; this is the current vendor release.
FROM ghcr.io/goauthentik/server:${AUTHENTIK_TAG}
COPY --chown=1000:1000 blueprints /blueprints/custom
USER 1000:1000
