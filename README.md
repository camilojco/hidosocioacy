# Mapacy

Aplicación web de mapas dinámicos para la Gestión Hidrosocial en el embalse Acaray y el Censo Hidrosocial Acaray–Yguazú. La interfaz parte del HTML entregado; las fichas y el historial se guardan en PostgreSQL fuera del repositorio.

## Despliegue en Hydra

La aplicación responde en `https://mapacy.romagal.com`.

Después de hacer merge o pull manualmente en Hydra, reconstruye y recrea solo el servicio web con:

```bash
./scripts/rebuild-hydra-web.sh
```

El script usa el código que ya está en el checkout local, espera que el healthcheck del servicio `web` esté saludable y no recrea ni modifica PostgreSQL. Si el Compose de Hydra está en otra ubicación, se puede indicar con `MAPACY_HYDRA_DIR=/ruta/a/hydra`.

### Revisión de cambios en GitHub

`.github/CODEOWNERS` solicita tu revisión (`@romagal13`) en cada pull request. Activa las notificaciones de pull requests en **Watch → Custom** para recibir avisos. Revisa el PR y haz merge manualmente; luego actualiza el checkout de Hydra y ejecuta `./scripts/rebuild-hydra-web.sh`.

## Evaluación inicial

El HTML original guardaba fichas e historial en `localStorage`, sin autenticación ni sincronización entre dispositivos. El servidor ahora requiere login, valida los códigos de ficha, escribe en una transacción PostgreSQL y compara revisiones para detectar cambios concurrentes. La base actual contiene 295 fichas de ejemplo, 73 sitios de interés y 77 encuestas de depleción sin nombres ni teléfonos.

La arquitectura todavía usa una sola cuenta compartida, reemplaza la lista completa de fichas en cada guardado y mantiene escenarios y capas personalizadas en `localStorage`. Tampoco hay copias automáticas ni restauraciones ensayadas. Antes de incorporar relevamientos reales conviene agregar cuentas y permisos por rol, escrituras por ficha con auditoría inmutable, sincronización de escenarios, migraciones de esquema y backups automáticos verificados. Los límites de intentos de login se aplican en Nginx.
