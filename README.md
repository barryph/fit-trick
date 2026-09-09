# Kadence

Hello 👋, this is me experimenting with Domain Driven Design + Clean Architecture in a Nest.js project.

## Features ✨
* Visualize exercises based on your timeline
* You don't choose exercises, exercises choose you
* I learn more DDD + Clean Architecture

## Installation

Install dependencies

```bash
# Install dependencies in each package (pnpm is required; each package pins
# pnpm via its packageManager field):
#   cd back-end  && pnpm install
#   cd front-end && pnpm install
pnpm install
```

## Setup

This project uses knex to handle database migrations.

```bash
# Run this as the user with postgres permissions
createdb kadence;
# Run these inside the back-end/ dir
pnpm run db:up;
pnpm run db:seed;
```

## Usage

Run the server

More details in `back-end/README.md`
```bash
# Make sure your postgresql server is running
cd back-end;
pnpm run start:dev;
```

Run the client
```bash
cd front-end;
pnpm run start;   # expo start (there is no pnpm run dev)
```

## License

[MIT](https://choosealicense.com/licenses/mit/) 
