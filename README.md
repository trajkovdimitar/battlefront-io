# Battlefront

An online real-time strategy game focused on territorial control and alliance building. Players compete to expand their territory, build structures, and form strategic alliances in various maps based on real-world geography.

## Attribution

This project is based on [OpenFront.io](https://github.com/openfrontio/OpenFrontIO), which is itself a fork/rewrite of WarFront.io.

- Original project: https://github.com/openfrontio/OpenFrontIO
- Credit to: https://github.com/WarFrontIO

## License

This project is licensed under the **GNU Affero General Public License v3.0** (inherited from OpenFront).

As required by the license, the copyright notice "© OpenFront and Contributors" is preserved in:
- Footer
- Loading screen

See the [LICENSE](LICENSE) file for complete terms.

For asset licensing, see [LICENSE-ASSETS](LICENSE-ASSETS).

## Features

- **Real-time Strategy Gameplay**: Expand your territory and engage in strategic battles
- **Alliance System**: Form alliances with other players for mutual defense
- **Multiple Maps**: Play across various geographical regions including Europe, Asia, Africa, and more
- **Resource Management**: Balance your expansion with defensive capabilities
- **Cross-platform**: Play in any modern web browser

## Prerequisites

- [npm](https://www.npmjs.com/) (v10.9.2 or higher)
- A modern web browser (Chrome, Firefox, Edge, etc.)

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/trajkovdimitar/Battlefront.git
   cd Battlefront
   ```

2. **Install dependencies**

   ```bash
   npm run inst
   ```

   Do NOT use `npm install` nor `npm i` but instead use our `npm run inst`. It runs the safer `npm ci --ignore-scripts` to install dependencies exactly according to the versions in `package-lock.json` and doesn't run scripts.

## Running the Game

### Development Mode

Run both the client and server in development mode with live reloading:

```bash
npm run dev
```

This will:
- Start the webpack dev server for the client
- Launch the game server with development settings
- Open the game in your default browser

### Client Only

```bash
npm run start:client
```

### Server Only

```bash
npm run start:server-dev
```

## Development Tools

- **Format code**: `npm run format`
- **Lint code**: `npm run lint`
- **Lint and fix**: `npm run lint:fix`
- **Run tests**: `npm test`

## Project Structure

- `/src/client` - Frontend game client
- `/src/core` - Shared game logic
- `/src/server` - Backend game server
- `/resources` - Static assets (images, maps, etc.)
