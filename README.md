# Prompt Library

A simple, polished prompt library for saving, organizing, favoriting, and editing reusable prompts.

The app uses a React/Vite frontend with a local Node API and SQLite database. It includes account creation, login/logout, collections, favorites, archived prompts, prompt editing, and a dark mode toggle.

## Features

- Save and edit reusable prompts
- Organize prompts into collections
- View collections as columns
- Favorite, archive, copy, and delete prompts
- Create and delete collection names
- Create an account, log in, and log out
- Store data locally in SQLite
- Switch between light and dark mode

## Tech Stack

- React
- Vite
- Node.js
- SQLite via Node's built-in `node:sqlite`
- lucide-react icons

## Getting Started

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

This starts both services:

- React app: `http://localhost:5173`
- Local API: `http://localhost:8787`

## Database

The SQLite database is created automatically when the API starts.

By default, it is stored at:

```txt
data/prompt-library.sqlite
```

The `data/` directory is ignored by git, so local prompt data and user accounts are not committed to the repository. A fresh clone will create a new database and tables on first run.

## Scripts

```bash
npm run dev
```

Starts the local API and Vite app together.

```bash
npm run api
```

Starts only the SQLite API server.

```bash
npm run start
```

Starts the production server, which serves both the built frontend and the API from one Node process.

```bash
npm run web
```

Starts only the Vite frontend.

```bash
npm run build
```

Builds the frontend for production.

## Container Deployment

This repository includes everything needed to deploy the app as a container:

- `Dockerfile`
- `docker-compose.yml`
- GitHub Actions workflow for publishing an image to GitHub Container Registry

### Build locally

```bash
docker build -t prompt-library .
```

### Run locally with Docker

```bash
docker run -p 3000:3000 -v prompt_library_data:/app/data prompt-library
```

The volume mount is important because SQLite needs persistent storage.

## Portainer Deployment

Portainer works best with this app as a stack that references a prebuilt image.

1. Push the repository to GitHub.
2. Let GitHub Actions publish the image to GHCR.
3. In Portainer, go to `Stacks` -> `Add stack`.
4. Paste the contents of `docker-compose.yml`, or deploy the stack from the Git repository.
5. Make sure the image tag points to your published container image.

The included compose file mounts a named volume for `/app/data`, which preserves the SQLite database across restarts and redeployments.

## GitHub Container Registry

The workflow at `.github/workflows/publish-image.yml` publishes the container image to:

```txt
ghcr.io/<your-github-owner>/<your-repo>:latest
```

It runs automatically on pushes to `main`, on version tags like `v1.0.0`, and on manual workflow dispatch.
