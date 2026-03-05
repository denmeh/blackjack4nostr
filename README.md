# Blackjack for Nostr

Blackjack game on Nostr — play over the protocol, no central server. **The app is fully client-side**: everything runs in the browser. Use the live demo or run it yourself locally.

## Live demo

**[https://blackjack4nostr.mehilli.it/](https://blackjack4nostr.mehilli.it/)**

## Run it yourself

Because it’s all client-side, you can run it locally or host it anywhere that serves static files.

**Development:**

```sh
npm install
npm run dev
```

Then open the URL shown (e.g. http://localhost:5173).

**Production build (static files):**

```sh
npm run build
```

Output is in `build/`. Serve that folder with any static host (e.g. nginx, Netlify, GitHub Pages). Preview locally:

```sh
npm run preview
```

**Docker:**

```sh
docker build -t blackjack4nostr .
docker run -p 3000:3000 blackjack4nostr
```

Then open http://localhost:3000. To run in the background:

```sh
docker run -d -p 8080:3000 --name blackjack blackjack4nostr
```

The server listens on port 3000 inside the container; use `-p HOST_PORT:3000` to map it.