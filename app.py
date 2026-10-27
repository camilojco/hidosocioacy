import hmac
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from flask import Flask, jsonify, request, send_from_directory, session
from psycopg.types.json import Jsonb
from werkzeug.middleware.proxy_fix import ProxyFix


ROOT = Path(__file__).parent
DATA_DIR = Path(os.environ.get("MAPACY_DATA_DIR", "/data"))
SEED_PATH = Path(os.environ.get("MAPACY_SEED_PATH", "/seed/initial-state.json"))
app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config.update(
    SECRET_KEY=os.environ["MAPACY_SECRET_KEY"],
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_SAMESITE="Strict",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 12,
    MAX_CONTENT_LENGTH=20 * 1024 * 1024,
)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)


def db_connect():
    return psycopg.connect(
        host=os.environ.get("POSTGRES_HOST", "db"),
        port=os.environ.get("POSTGRES_PORT", "5432"),
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        connect_timeout=5,
    )


def seed_state():
    with SEED_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def install_schema():
    with db_connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mapacy_registro (
                codigo TEXT PRIMARY KEY CHECK (codigo <> ''),
                campos JSONB NOT NULL,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS mapacy_historial (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                ocurrido_en TIMESTAMPTZ NOT NULL,
                codigo TEXT NOT NULL,
                campo TEXT NOT NULL DEFAULT '',
                campo_key TEXT NOT NULL DEFAULT '',
                antes JSONB NOT NULL DEFAULT 'null'::jsonb,
                despues JSONB NOT NULL DEFAULT 'null'::jsonb,
                editor TEXT NOT NULL DEFAULT '',
                origen TEXT NOT NULL DEFAULT '',
                detalle JSONB NOT NULL
            );
            CREATE INDEX IF NOT EXISTS mapacy_historial_codigo_fecha_idx
                ON mapacy_historial (codigo, ocurrido_en DESC);
            CREATE TABLE IF NOT EXISTS mapacy_estado (
                id SMALLINT PRIMARY KEY CHECK (id = 1),
                revision BIGINT NOT NULL CHECK (revision >= 1),
                editor TEXT NOT NULL DEFAULT '',
                origen JSONB NOT NULL DEFAULT '{}'::jsonb,
                color_por TEXT NOT NULL DEFAULT 'ivh',
                actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)
        if conn.execute("SELECT 1 FROM mapacy_estado WHERE id=1").fetchone() is None:
            data = seed_state()
            records = data["records"]
            history = data["history"]
            insert_records(conn, records)
            insert_history(conn, history)
            conn.execute(
                "INSERT INTO mapacy_estado(id,revision,editor,origen,color_por) VALUES (1,1,%s,%s,%s)",
                (data.get("editor", ""), Jsonb(data.get("source", {})), data.get("colorBy", "ivh")),
            )


def insert_records(conn, records):
    with conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO mapacy_registro(codigo,campos) VALUES (%s,%s)",
            [(str(row.get("codigo", "")).strip(), Jsonb(row)) for row in records],
        )


def insert_history(conn, entries):
    parsed = []
    for item in entries:
        stamp = item.get("at") or datetime.now(timezone.utc).isoformat()
        parsed.append((
            stamp, str(item.get("codigo", "")), str(item.get("campo", "")),
            str(item.get("campoKey", "")), Jsonb(item.get("antes")),
            Jsonb(item.get("despues")), str(item.get("editor", "")),
            str(item.get("origen", "")), Jsonb(item),
        ))
    with conn.cursor() as cursor:
        cursor.executemany(
            """INSERT INTO mapacy_historial
               (ocurrido_en,codigo,campo,campo_key,antes,despues,editor,origen,detalle)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""", parsed,
        )


def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


def csrf_ok():
    expected = session.get("csrf", "")
    supplied = request.headers.get("X-CSRF-Token", "")
    return bool(expected and supplied and hmac.compare_digest(expected, supplied))


def require_login():
    if session.get("authenticated") is not True:
        return jsonify(error="Autenticación requerida"), 401
    return None


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    if request.is_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/session")
def get_session():
    return jsonify(authenticated=session.get("authenticated") is True,
                   username=session.get("username", ""), csrf=csrf_token())


@app.post("/api/login")
def login():
    if not csrf_ok():
        return jsonify(error="Sesión vencida; recargá la página"), 403
    data = request.get_json(silent=True) or {}
    username_ok = hmac.compare_digest(str(data.get("username", "")), os.environ["MAPACY_USERNAME"])
    password_ok = hmac.compare_digest(str(data.get("password", "")), os.environ["MAPACY_PASSWORD"])
    if not (username_ok and password_ok):
        return jsonify(error="Usuario o contraseña incorrectos"), 401
    session.clear()
    session["authenticated"] = True
    session["username"] = os.environ["MAPACY_USERNAME"]
    csrf_token()
    session.permanent = True
    return jsonify(authenticated=True, username=session["username"], csrf=session["csrf"])


@app.post("/api/logout")
def logout():
    if not csrf_ok():
        return jsonify(error="Sesión vencida; recargá la página"), 403
    session.clear()
    return jsonify(ok=True)


@app.get("/api/snapshot")
def snapshot():
    denied = require_login()
    if denied:
        return denied
    with db_connect() as conn:
        state = conn.execute(
            "SELECT revision,editor,origen,color_por FROM mapacy_estado WHERE id=1"
        ).fetchone()
        records = [row[0] for row in conn.execute(
            "SELECT campos FROM mapacy_registro ORDER BY codigo"
        )]
        history = [row[0] for row in conn.execute(
            "SELECT detalle FROM mapacy_historial ORDER BY ocurrido_en,id"
        )]
    return jsonify(revision=state[0], editor=state[1], source=state[2],
                   colorBy=state[3], records=records, history=history)


@app.post("/api/snapshot")
def save_snapshot():
    denied = require_login()
    if denied:
        return denied
    if not csrf_ok():
        return jsonify(error="Sesión vencida; recargá la página"), 403
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("records"), list) or not isinstance(data.get("history"), list):
        return jsonify(error="El formato de datos no es válido"), 400
    records, history = data["records"], data["history"]
    codes = [str(row.get("codigo", "")).strip() for row in records if isinstance(row, dict)]
    if len(codes) != len(records) or any(not code for code in codes) or len(set(codes)) != len(codes):
        return jsonify(error="Cada ficha debe tener un código único"), 400
    if len(records) > 100000 or len(history) > 500000:
        return jsonify(error="Se superó el límite de registros"), 413
    expected = data.get("revision")
    if not isinstance(expected, int) or expected < 1:
        return jsonify(error="Falta la revisión de datos"), 400
    with db_connect() as conn:
        state = conn.execute("SELECT revision FROM mapacy_estado WHERE id=1 FOR UPDATE").fetchone()
        if state is None:
            return jsonify(error="La base no está inicializada"), 503
        if state[0] != expected:
            return jsonify(error="Otra sesión guardó cambios. Recargá antes de continuar.", revision=state[0]), 409
        conn.execute("DELETE FROM mapacy_registro")
        conn.execute("DELETE FROM mapacy_historial")
        insert_records(conn, records)
        insert_history(conn, history)
        new_revision = expected + 1
        conn.execute(
            """UPDATE mapacy_estado SET revision=%s,editor=%s,origen=%s,color_por=%s,actualizado_en=now()
               WHERE id=1""",
            (new_revision, str(data.get("editor", "")), Jsonb(data.get("source", {})),
             str(data.get("colorBy", "ivh"))),
        )
    return jsonify(revision=new_revision)


@app.post("/api/reset")
def reset_to_seed():
    denied = require_login()
    if denied:
        return denied
    if not csrf_ok():
        return jsonify(error="Sesión vencida; recargá la página"), 403
    data = seed_state()
    with db_connect() as conn:
        state = conn.execute("SELECT revision FROM mapacy_estado WHERE id=1 FOR UPDATE").fetchone()
        conn.execute("DELETE FROM mapacy_registro")
        conn.execute("DELETE FROM mapacy_historial")
        insert_records(conn, data["records"])
        insert_history(conn, data["history"])
        revision = state[0] + 1
        conn.execute(
            """UPDATE mapacy_estado SET revision=%s,editor=%s,origen=%s,color_por=%s,actualizado_en=now()
               WHERE id=1""",
            (revision, data.get("editor", ""), Jsonb(data.get("source", {})), data.get("colorBy", "ivh")),
        )
    return jsonify(revision=revision, editor=data.get("editor", ""), source=data.get("source", {}),
                   colorBy=data.get("colorBy", "ivh"), records=data["records"], history=data["history"])


@app.get("/healthz")
def health():
    with db_connect() as conn:
        conn.execute("SELECT 1")
    return jsonify(status="ok")


if __name__ == "__main__":
    install_schema()
