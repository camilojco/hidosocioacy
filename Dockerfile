FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
COPY static ./static
RUN useradd --system --uid 10001 --create-home appuser
USER appuser
EXPOSE 8050
CMD ["sh", "-c", "python -c 'from app import install_schema; install_schema()' && gunicorn --bind 0.0.0.0:8050 --workers 2 --threads 4 --timeout 60 app:app"]
