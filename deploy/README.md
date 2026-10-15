# Deploying to the VPS

Same pattern as Arcube: Docker image built off the server, Caddy in front with HTTPS,
everything bound to `127.0.0.1`.

Target: `https://invoices.gymdesk.uk` (protected with basic auth).

## What the container is

- Node 22 + Express + system Chromium (`/usr/bin/chromium`), non-root user.
- `demo-samples/demo.xml` is the only sample inside the image (anonymised data).
  The real `samples/` folder is excluded by `.dockerignore`.
- Templates live in the `templates` named volume, so edits made in the editor survive redeploys.
- `MAX_CONCURRENT_PDF=1` and a 400 MB memory cap (1 GB incl. swap), sized for the
  0.5 GB IONOS VPS once Arcube is stopped.

## One-time setup

1. **Stop Arcube** on the VPS to free memory (keeps its volumes and database):
   ```bash
   cd /opt/arcube && docker compose --profile db stop
   ```
   If Arcube is already on the new machine, nothing else is needed.
2. **DNS:** `A` record `invoices.gymdesk.uk` → the VPS IP (Cloudflare, DNS only, like `arcube`).
3. **Directory:** `mkdir -p /opt/invoices` on the VPS.
4. **Caddy:** add the block from `deploy/Caddyfile.example` (with a real bcrypt hash),
   then `sudo systemctl reload caddy`.

## Each release

The VPS is too small to build images, so build on the laptop for `linux/amd64`
and ship it over SSH:

```bash
docker buildx build --platform linux/amd64 -t invoices-poc:latest --load .
docker save invoices-poc:latest | gzip | ssh xegea@<vps> 'gunzip | docker load'
scp compose.yaml xegea@<vps>:/opt/invoices/compose.yaml
ssh xegea@<vps> 'cd /opt/invoices && docker compose up -d'
```

Check: `curl -u demo:<password> https://invoices.gymdesk.uk/health` → `{"ok":true}`.

## Notes

- The editor accepts arbitrary HTML that the server renders. Keep basic auth on and do
  not expose port 3200 publicly (compose binds it to `127.0.0.1`).
- Disk is only 10 GB: the image is roughly 600–900 MB. `docker image prune` after releases.
- If Chromium is killed for lack of memory, raise the VPS RAM or lower `mem_limit` pressure by
  keeping `MAX_CONCURRENT_PDF=1`.
