# Retention Backend Server

A standalone FastAPI server that handles LLM inference and flashcard data management for Retention.

## Features

- RESTful API for flashcard operations (CRUD)
- Semantic similarity scoring using sentence-transformers
- SQLite database for flashcard storage
- Model caching and warm-up
- Health check endpoints

## Quick Start

### Development

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Download the model (first time only):**
   ```bash
   python download_model.py
   ```

3. **Run the server:**
   ```bash
   cd backend
   python main.py
   ```

   The server will start on `http://localhost:8000`

### Production

1. **Set environment variables:**
   ```bash
   export ENV=production
   export HOST=0.0.0.0
   export PORT=8000
   ```

2. **Run with production settings:**
   ```bash
   cd backend
   python main.py
   ```

   Or use a process manager like systemd, PM2, or Docker.

## API Endpoints

- `GET /health` - Health check and status
- `POST /score` - Score a flashcard answer
- `GET /decks` - List all decks
- `POST /decks` - Create a new deck
- `PUT /decks/{deck_id}` - Update a deck
- `DELETE /decks/{deck_id}` - Delete a deck
- `GET /cards/{card_id}/attempts` - Get attempt history
- `POST /decks/{deck_id}/bulk` - Bulk update cards
- `POST /warm-model` - Manually warm up the model cache

## Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

## API Documentation

When the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Deployment

### Docker (Recommended)

Coming soon!

### Systemd Service

Create `/etc/systemd/system/flashai.service`:

```ini
[Unit]
Description=Retention Backend Server
After=network.target

[Service]
Type=simple
User=flashai
WorkingDirectory=/opt/flashai/backend
Environment="PATH=/opt/flashai/.venv/bin"
Environment="ENV=production"
Environment="PORT=8000"
ExecStart=/opt/flashai/.venv/bin/python main.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable flashai
sudo systemctl start flashai
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8000` | Server port |
| `ENV` | `development` | Environment mode |
| `DATABASE_PATH` | Auto | Custom database path |
| `MODEL_CACHE_DIR` | Auto | Custom model cache directory |
| `ALLOWED_ORIGINS` | None | CORS allowed origins (comma-separated) |
