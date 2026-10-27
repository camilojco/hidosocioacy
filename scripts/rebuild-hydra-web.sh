#!/usr/bin/env bash
set -Eeuo pipefail

hydra_dir="${MAPACY_HYDRA_DIR:-/home/rodrigo/projects/servers-setup/servers/hydra}"
compose_file="${MAPACY_COMPOSE_FILE:-$hydra_dir/compose.yaml}"
compose_project_dir="${MAPACY_COMPOSE_PROJECT_DIR:-$hydra_dir}"

[[ -f "$compose_file" ]] || {
  printf 'Error: no encuentro el archivo Compose en: %s\n' "$compose_file" >&2
  exit 1
}

printf 'Construyendo y recreando solo el servicio web de Mapacy...\n'
docker compose \
  --project-name hydra \
  --project-directory "$compose_project_dir" \
  --file "$compose_file" \
  up --detach --build --force-recreate --no-deps --wait --wait-timeout 120 web

printf '\nMapacy quedó actualizado y saludable. Estado del servicio:\n'
docker compose \
  --project-name hydra \
  --project-directory "$compose_project_dir" \
  --file "$compose_file" \
  ps web
