# Benglish Server

Secure Node.js API using Express and MongoDB for email and password authentication.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables template:
   ```bash
   copy .env.example .env
   ```
   Update the values:
   - `PORT` – API port (default `5001`)
   - `NODE_ENV` – `development` or `production`
   - `MONGODB_URI` – MongoDB connection string
   - `JWT_ACCESS_SECRET` – long random string for access tokens
   - `JWT_REFRESH_SECRET` – long random string for refresh tokens
   - `ACCESS_TOKEN_TTL` – access token lifetime (e.g. `15m`)
   - `REFRESH_TOKEN_TTL` – refresh token lifetime (e.g. `7d`)
   - `CORS_ORIGIN` – comma-separated list of allowed origins
3. Start the development server:
   ```bash
   npm run dev
   ```

## Available Routes

- `POST /api/auth/register` – Register user with `username`, `email`, `password`, `confirmPassword`
- `POST /api/auth/login` – Login with `email`, `password`
- `POST /api/auth/refresh` – Exchange refresh token for new access token
- `GET /api/auth/me` – Get current user (requires `Authorization: Bearer <token>`)
- `GET /health` – Health check

## Import Word Categories

- Ensure MongoDB is running and env variables are configured
- Default import uses `englishwords.json` located at the project root:
  ```bash
  npm run import:words
  ```
- Options:
  - `--file=path/to/file.json` – use a different JSON file
  - `--reset` – remove existing categories before import

## Security Features

- Helmet, CORS, HPP, Mongo sanitize
- Rate limiting (global and auth specific)
- Strong password validation and bcrypt hashing
- JWT authentication with access and refresh tokens


