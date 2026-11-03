FROM traefik:latest
COPY traefik.yml routes.yml legacy.yml legacy-routes.yml /etc/traefik/
USER 65532:65532
CMD ["traefik", "--configFile=/etc/traefik/traefik.yml"]
