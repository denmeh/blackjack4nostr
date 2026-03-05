# Blackjack4Nostr protocol

Provably fair blackjack over Nostr. No double/split — hit and stand only.

## Link format

- **Deep link:** `blackjack4nostr://<dealer_npub>?relays=wss://a,wss://b&token=<game_token>`
- **Web join URL:** `https://<origin>/join?npub=...&relays=...&token=...`

## Event kinds

| Kind   | Name   | Author  | Description |
|--------|--------|---------|-------------|
| 30400  | Create | Dealer  | Game created: `token`, `relays`, `dealerSeedHash` (SHA256 of dealer seed). Tag `t`: token. |
| 30401  | Join   | Player  | Player joins: `gameEventId`, `dealerNpub`, `playerSeed`. Tags: `e` (game), `p` (dealer). |
| 30402  | State  | Dealer  | Game state: `phase`, `deckIndex`, `playerHand`, `dealerHand`, `winner?`, `dealerSeedReveal?`. Tag `e`: game. |
| 30403  | Action | Player  | Hit or stand: `gameEventId`, `action` (`"hit"` \| `"stand"`). Tags: `e`, `p`. |

## Provably fair

1. **Before game:** Dealer publishes SHA256(dealer_seed). Player commits by sending their `playerSeed` in the Join event.
2. **Deck:** `seed = dealer_seed + player_seed` (string concat). Deck = deterministic shuffle of 52 cards from `seed` (SHA256-based RNG).
3. **After game:** Dealer publishes `dealerSeedReveal` in the final State event. Anyone can verify SHA256(dealerSeedReveal) === `dealerSeedHash` and recompute the deck.

## Phases

- `waiting_join` — Dealer waiting for one player to join.
- `playing` — Player’s turn (hit/stand).
- `dealer_turn` — Dealer drawing (handled in one state update).
- `finished` — Result and seed reveal.

## Cards

Format: rank + suit letter, e.g. `As`, `10h`, `Kd`. Suits: `s` ♠, `h` ♥, `d` ♦, `c` ♣.
