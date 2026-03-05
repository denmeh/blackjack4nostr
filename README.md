# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.12.5 create --template minimal --types ts --install npm ./
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Deploying with Docker

The app is configured for deployment as a Docker image using `adapter-node`.

**Build the image:**

```sh
docker build -t blackjack4nostr .
```

**Run the container:**

```sh
docker run -p 3000:3000 blackjack4nostr
```

Then open http://localhost:3000. To run in the background and set the port:

```sh
docker run -d -p 8080:3000 --name blackjack blackjack4nostr
```

The server listens on port 3000 inside the container; use `-p HOST_PORT:3000` to map it.

### Pubblicare su Docker Hub (release)

Al push di un **tag** che inizia con `v` (es. `v1.0.0`), GitHub Actions costruisce l’immagine e la pubblica su Docker Hub come `denmeh/blackjack4nostr:<version>` e `denmeh/blackjack4nostr:latest`.

1. **Secret nel repo GitHub** (Settings → Secrets and variables → Actions):
   - `DOCKERHUB_USERNAME`: il tuo username Docker Hub (es. `denmeh`)
   - `DOCKERHUB_TOKEN`: un [Access Token](https://hub.docker.com/settings/security) Docker Hub (non la password)

2. **Creare una release** (es. versione 1.0.0):

   ```sh
   git tag v1.0.0
   git push origin v1.0.0
   ```

   Dopo il workflow verrà pubblicata l’immagine:
   - `denmeh/blackjack4nostr:1.0.0`
   - `denmeh/blackjack4nostr:latest`

   Per usarla: `docker run -p 3000:3000 denmeh/blackjack4nostr:1.0.0`
