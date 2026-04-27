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
npm run web
```

Starts only the Vite frontend.

```bash
npm run build
```

Builds the frontend for production.
