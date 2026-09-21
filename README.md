# Imposter Word Game

A shared-lobby multiplayer browser game.

## Run on your phone with Termux

```bash
pkg update -y
pkg install nodejs -y
cd imposter-game
npm install
npm start
```

Open:

http://localhost:3000

## Deploy publicly

A Node/Express web service is required because the game uses Socket.IO for real-time multiplayer.

Recommended simple hosting path:
1. Create a GitHub repository.
2. Upload all files from this folder.
3. Create a Render Web Service from that repository.
4. Build command: `npm install`
5. Start command: `npm start`
6. Use the free web-service plan for testing.

Players only need the public game URL; they do not need game accounts.

## Notes

This version deliberately uses one shared lobby instead of room codes.
There is one active game session at a time.
