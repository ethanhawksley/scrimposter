# Scrimposter
> A drawing game about deducing the imposter.

## Gameplay Loop
Every player is shown a word except the imposter. The players must deduce who this player is by discussing and drawing a shared image. Each player takes it in turns to draw the word with a limited amount of ink.

The players win if they deduce who the imposter is without them guessing what the word prompt was. The imposter must go undetected or work out the word.

## Implementation
Frontend:
- HTML
- JavaScript

Backend:
- Python (uv)
  - FastAPI for networking
  - Game flow

## Realtime protocol

FastAPI owns the game and serves a WebSocket at
`/ws/{room_code}?player_id=<player name>`. Clients send JSON commands and receive
room-scoped `state`, `prompt`, `connection_ready`, and `error` events.

Commands use this shape:

```json
{"type": "start_game", "payload": {}}
{"type": "submit_turn", "payload": {"image": "data:image/png;base64,..."}}
{"type": "vote", "payload": {"target": "player name"}}
```

Successful mutations are followed by a `state` event. Prompts are sent only to
the requesting player, while the public state never contains the imposter.
State events include a room sequence number so clients can ignore stale
messages after reconnecting.
Drawing data URLs are limited to 2 MB for the initial implementation.